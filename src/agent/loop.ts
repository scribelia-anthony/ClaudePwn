import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import chalk from 'chalk';
import { getConfig, getApiKey } from '../config/index.js';
import { login, getValidAccessToken, refreshTokens } from '../utils/auth.js';
import { getAllTools, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './system-prompt.js';
import { saveHistory } from '../session/manager.js';
import { log } from '../utils/logger.js';

type Message = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlock;

const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const API_URL = 'https://api.anthropic.com/v1/messages?beta=true';

// Persistent IDs for metadata
const USER_ID = randomUUID().replace(/-/g, '');
const ACCOUNT_UUID = randomUUID().replace(/-/g, '');

/**
 * Make a raw API call to Anthropic impersonating Claude Code.
 * Bypasses the SDK entirely for full header control.
 */
async function callAnthropicOAuth(
  accessToken: string,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<Anthropic.Message> {
  // Inject Claude Code identity in system prompt
  const system = body.system;
  if (typeof system === 'string') {
    body.system = [
      { type: 'text', text: CLAUDE_CODE_IDENTITY },
      { type: 'text', text: system },
    ];
  } else if (Array.isArray(system)) {
    body.system = [
      { type: 'text', text: CLAUDE_CODE_IDENTITY },
      ...system,
    ];
  } else {
    body.system = [{ type: 'text', text: CLAUDE_CODE_IDENTITY }];
  }

  // Strip fields Claude Code doesn't send
  delete body.temperature;
  delete body.tool_choice;

  // Ensure tools array exists
  if (!body.tools) body.tools = [];

  // Strip cache_control from system blocks
  if (Array.isArray(body.system)) {
    for (const block of body.system as Record<string, unknown>[]) {
      delete block.cache_control;
    }
  }

  // Inject metadata
  body.metadata = {
    user_id: `user_${USER_ID}_account_${ACCOUNT_UUID}_session_${sessionId}`,
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'accept': 'application/json',
      'user-agent': 'claude-cli/2.1.7 (external, cli)',
      'x-app': 'cli',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14',
      'x-stainless-arch': 'x64',
      'x-stainless-lang': 'js',
      'x-stainless-os': 'Darwin',
      'x-stainless-package-version': '0.70.0',
      'x-stainless-runtime': 'node',
      'x-stainless-runtime-version': process.version,
      'x-stainless-retry-count': '0',
      'x-stainless-timeout': '600',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`API error (${res.status}): ${text}`) as any;
    err.status = res.status;
    throw err;
  }

  return await res.json() as Anthropic.Message;
}

export class AgentLoop {
  private client: Anthropic | null = null; // Only for API key mode
  private accessToken: string | null = null; // For OAuth mode
  private sessionId = randomUUID().replace(/-/g, '');
  private messages: Message[];
  private box: string;
  private ip: string;
  private boxDir: string;
  private config = getConfig();
  private useOAuth = false;

  constructor(box: string, ip: string, boxDir: string, history: Message[] = []) {
    this.box = box;
    this.ip = ip;
    this.boxDir = boxDir;
    this.messages = history;
  }

  private async ensureAuth(): Promise<void> {
    // 1. API key from env
    const envKey = getApiKey();
    if (envKey) {
      this.client = new Anthropic({ apiKey: envKey });
      this.useOAuth = false;
      return;
    }

    // 2. Existing OAuth token
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      this.accessToken = accessToken;
      this.useOAuth = true;
      return;
    }

    // 3. Fresh login
    const tokens = await login();
    this.accessToken = tokens.access_token;
    this.useOAuth = true;
  }

  private async createMessage(
    system: string,
    tools: Anthropic.Tool[],
  ): Promise<Anthropic.Message> {
    if (this.useOAuth && this.accessToken) {
      return callAnthropicOAuth(this.accessToken, this.sessionId, {
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system,
        messages: this.messages,
        tools,
      });
    }

    // API key mode — use SDK
    return this.client!.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system,
      messages: this.messages,
      tools,
    });
  }

  async run(userInput: string): Promise<void> {
    await this.ensureAuth();

    this.messages.push({ role: 'user', content: userInput });

    const system = buildSystemPrompt(this.box, this.ip, this.boxDir);
    const tools = getAllTools();

    let turn = 0;
    while (true) {
      let response: Anthropic.Message;

      // Show thinking status
      const thinkMsg = turn === 0 ? 'Réflexion...' : 'Analyse des résultats...';
      const spinner = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
      let spinIdx = 0;
      const thinkTimer = setInterval(() => {
        process.stdout.write(chalk.dim(`\r  ${spinner[spinIdx++ % spinner.length]} ${thinkMsg}`));
      }, 100);

      try {
        response = await this.createMessage(system, tools);
        clearInterval(thinkTimer);
        process.stdout.write(`\r${' '.repeat(60)}\r`);
      } catch (err: any) {
        clearInterval(thinkTimer);
        process.stdout.write(`\r${' '.repeat(60)}\r`);
        if (err.status === 401 || err.status === 403) {
          try {
            const tokens = await refreshTokens();
            this.accessToken = tokens.access_token;
            this.sessionId = randomUUID().replace(/-/g, '');
            continue;
          } catch {
            try {
              const tokens = await login();
              this.accessToken = tokens.access_token;
              this.sessionId = randomUUID().replace(/-/g, '');
              continue;
            } catch (loginErr: any) {
              log.error(`Login échoué: ${loginErr.message}`);
              break;
            }
          }
        }
        log.error(`API error: ${err.message}`);
        break;
      }

      this.messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const block of response.content) {
        if (block.type === 'text' && (block as any).text) {
          log.assistant((block as any).text);
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

      // Execute tools in parallel when multiple are requested
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (tool) => {
          const result = await executeTool(tool.name, tool.input, this.boxDir);
          return {
            type: 'tool_result' as const,
            tool_use_id: tool.id,
            content: result,
          };
        }),
      );

      this.messages.push({ role: 'user', content: toolResults });
      turn++;
    }

    saveHistory(this.boxDir, this.messages);
  }

  getMessages(): Message[] {
    return this.messages;
  }
}
