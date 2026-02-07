import Anthropic from '@anthropic-ai/sdk';
import { getConfig, getApiKey, loadOAuthTokens } from '../config/index.js';
import { login, getValidAccessToken, refreshTokens } from '../utils/auth.js';
import { getAllTools, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './system-prompt.js';
import { saveHistory } from '../session/manager.js';
import { log } from '../utils/logger.js';

type Message = Anthropic.MessageParam;

// Headers required by Anthropic when using OAuth bearer tokens
const OAUTH_DEFAULT_HEADERS: Record<string, string> = {
  'anthropic-dangerous-direct-browser-access': 'true',
  'anthropic-beta': 'oauth-2025-04-20',
  'user-agent': 'claude-cli/2.1.7 (external, cli)',
};

function makeClient(apiKey?: string, accessToken?: string): Anthropic {
  if (apiKey) {
    return new Anthropic({ apiKey });
  }
  return new Anthropic({
    authToken: accessToken,
    defaultHeaders: OAUTH_DEFAULT_HEADERS,
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
    // 1. Env var API key
    const envKey = getApiKey();
    if (envKey) {
      this.client = makeClient(envKey);
      return;
    }

    // 2. Existing OAuth token
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
        if (err.status === 401) {
          // Try refresh first, then full re-login
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
        log.error(`API error: ${err.message}`);
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
