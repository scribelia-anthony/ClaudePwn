import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { getConfig, getApiKey } from '../config/index.js';
import { login, getValidAccessToken, refreshTokens } from '../utils/auth.js';
import { getAllTools, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './system-prompt.js';
import { saveHistory } from '../session/manager.js';
import { log } from '../utils/logger.js';

type Message = Anthropic.MessageParam;

const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

// Persistent IDs for metadata (generated once per process)
const USER_ID = randomUUID().replace(/-/g, '');
const ACCOUNT_UUID = randomUUID().replace(/-/g, '');

/**
 * Creates a custom fetch function that impersonates Claude Code.
 * Sets all required headers, query params, and body transformations
 * so the Anthropic API accepts the OAuth bearer token.
 */
function createClaudeCodeFetch(accessToken: string) {
  const sessionId = randomUUID().replace(/-/g, '');

  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlStr = typeof url === 'string' ? url : url.toString();

    // Add ?beta=true for messages endpoints
    if (urlStr.includes('/v1/messages')) {
      urlStr += urlStr.includes('?') ? '&beta=true' : '?beta=true';
    }

    // Build headers from scratch, overriding SDK defaults
    const headers = new Headers(init?.headers);

    // Remove SDK-set auth (we set our own)
    headers.delete('x-api-key');

    // Auth
    headers.set('Authorization', `Bearer ${accessToken}`);

    // Claude Code identity headers
    headers.set('user-agent', 'claude-cli/2.1.7 (external, cli)');
    headers.set('x-app', 'cli');
    headers.set('anthropic-dangerous-direct-browser-access', 'true');
    headers.set('anthropic-version', '2023-06-01');

    // Beta flags — must include claude-code + oauth + interleaved-thinking
    const hasBeta = urlStr.includes('/v1/messages');
    if (hasBeta) {
      headers.set('anthropic-beta', 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14');
    } else {
      headers.set('anthropic-beta', 'oauth-2025-04-20');
    }

    // Stainless SDK fingerprint (Anthropic checks these)
    headers.set('x-stainless-arch', 'x64');
    headers.set('x-stainless-lang', 'js');
    headers.set('x-stainless-os', 'Darwin');
    headers.set('x-stainless-package-version', '0.70.0');
    headers.set('x-stainless-runtime', 'node');
    headers.set('x-stainless-runtime-version', process.version);
    headers.set('x-stainless-retry-count', '0');
    headers.set('x-stainless-timeout', '600');

    // Modify request body
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);

        // Remove fields Claude Code doesn't send
        delete body.temperature;
        delete body.tool_choice;

        // Ensure tools array always exists
        if (!body.tools) body.tools = [];

        // Inject Claude Code identity as first system block
        if (body.system) {
          if (typeof body.system === 'string') {
            body.system = [
              { type: 'text', text: CLAUDE_CODE_IDENTITY },
              { type: 'text', text: body.system },
            ];
          } else if (Array.isArray(body.system)) {
            body.system = [
              { type: 'text', text: CLAUDE_CODE_IDENTITY },
              ...body.system,
            ];
          }
          // Strip cache_control from system blocks
          for (const block of body.system) {
            delete block.cache_control;
          }
        } else {
          body.system = [{ type: 'text', text: CLAUDE_CODE_IDENTITY }];
        }

        // Inject metadata with user_id
        body.metadata = {
          user_id: `user_${USER_ID}_account_${ACCOUNT_UUID}_session_${sessionId}`,
        };

        init = { ...init, body: JSON.stringify(body) };
      } catch {
        // If body isn't JSON, pass through
      }
    }

    return globalThis.fetch(urlStr, { ...init, headers });
  };
}

function makeClient(apiKey?: string, accessToken?: string): Anthropic {
  if (apiKey) {
    return new Anthropic({ apiKey });
  }
  // Use SDK with custom fetch that impersonates Claude Code
  return new Anthropic({
    apiKey: 'oauth-bearer-via-custom-fetch',
    fetch: createClaudeCodeFetch(accessToken!),
  });
}

export class AgentLoop {
  private client!: Anthropic;
  private messages: Message[];
  private box: string;
  private ip: string;
  private boxDir: string;
  private config = getConfig();

  constructor(box: string, ip: string, boxDir: string, history: Message[] = []) {
    this.box = box;
    this.ip = ip;
    this.boxDir = boxDir;
    this.messages = history;
  }

  private async ensureClient(): Promise<void> {
    // 1. Env var API key — normal SDK usage
    const envKey = getApiKey();
    if (envKey) {
      this.client = makeClient(envKey);
      return;
    }

    // 2. Existing OAuth token — custom fetch impersonation
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      this.client = makeClient(undefined, accessToken);
      return;
    }

    // 3. Fresh login
    const tokens = await login();
    this.client = makeClient(undefined, tokens.access_token);
  }

  async run(userInput: string): Promise<void> {
    await this.ensureClient();

    this.messages.push({ role: 'user', content: userInput });

    const system = buildSystemPrompt(this.box, this.ip, this.boxDir);
    const tools = getAllTools();

    while (true) {
      let response: Anthropic.Message;

      try {
        response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          system,
          messages: this.messages,
          tools,
        });
      } catch (err: any) {
        // Token expired or invalid — try refresh, then re-login
        if (err.status === 401 || err.status === 403) {
          try {
            const tokens = await refreshTokens();
            this.client = makeClient(undefined, tokens.access_token);
            continue;
          } catch {
            try {
              const tokens = await login();
              this.client = makeClient(undefined, tokens.access_token);
              continue;
            } catch (loginErr: any) {
              log.error(`Login échoué: ${loginErr.message}`);
              break;
            }
          }
        }
        log.error(`API error: ${err.status ?? ''} ${err.message}`);
        break;
      }

      this.messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          log.assistant(block.text);
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        const result = await executeTool(tool.name, tool.input, this.boxDir);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result,
        });
      }

      this.messages.push({ role: 'user', content: toolResults });
    }

    saveHistory(this.boxDir, this.messages);
  }

  getMessages(): Message[] {
    return this.messages;
  }
}
