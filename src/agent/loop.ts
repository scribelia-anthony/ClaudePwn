import Anthropic from '@anthropic-ai/sdk';
import { getConfig, getApiKey, loadOAuthTokens } from '../config/index.js';
import { getAuthHeaders, login } from '../utils/auth.js';
import { getAllTools, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './system-prompt.js';
import { saveHistory } from '../session/manager.js';
import { log } from '../utils/logger.js';

type Message = Anthropic.MessageParam;

function createClient(): Anthropic {
  const apiKey = getApiKey();
  if (apiKey) {
    return new Anthropic({ apiKey });
  }

  const tokens = loadOAuthTokens();
  if (tokens) {
    return new Anthropic({ authToken: tokens.access_token });
  }

  // Placeholder — will be replaced after login
  return new Anthropic({ apiKey: 'placeholder' });
}

export class AgentLoop {
  private client: Anthropic;
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
    this.client = createClient();
  }

  async ensureAuth(): Promise<void> {
    if (getApiKey()) return;

    let tokens = loadOAuthTokens();
    if (!tokens) {
      tokens = await login();
    }

    // Refresh if needed
    if (Date.now() > tokens.expires_at - 300000) {
      await getAuthHeaders(); // triggers refresh
      tokens = loadOAuthTokens();
      if (!tokens) throw new Error('Auth failed');
    }

    this.client = new Anthropic({ authToken: tokens.access_token });
  }

  async run(userInput: string): Promise<void> {
    await this.ensureAuth();

    this.messages.push({ role: 'user', content: userInput });

    const system = buildSystemPrompt(this.box, this.ip, this.boxDir);
    const tools = getAllTools();

    // Agent loop — keep going while Claude wants to use tools
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
          log.warn('Token expiré, re-authentification...');
          const tokens = await login();
          this.client = new Anthropic({ authToken: tokens.access_token });
          continue;
        }
        log.error(`API error: ${err.message}`);
        break;
      }

      // Push assistant response
      this.messages.push({ role: 'assistant', content: response.content });

      // Process content blocks
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

      // If no tool use, we're done
      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        break;
      }

      // Execute tools and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        const result = await executeTool(tool.name, tool.input, this.boxDir);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result,
        });
      }

      // Push tool results and continue loop
      this.messages.push({ role: 'user', content: toolResults });
    }

    // Save history after each turn
    saveHistory(this.boxDir, this.messages);
  }

  getMessages(): Message[] {
    return this.messages;
  }
}
