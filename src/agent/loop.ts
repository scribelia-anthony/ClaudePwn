import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config/index.js';
import { getEffectiveApiKey, login } from '../utils/auth.js';
import { getAllTools, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './system-prompt.js';
import { saveHistory } from '../session/manager.js';
import { log } from '../utils/logger.js';

type Message = Anthropic.MessageParam;

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

    const key = getEffectiveApiKey();
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }

  private async ensureClient(): Promise<void> {
    if (this.client) return;

    log.warn('Pas d\'API key. Lancement du login...');
    const key = await login();
    this.client = new Anthropic({ apiKey: key });
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
          log.warn('API key invalide, re-login...');
          try {
            const key = await login();
            this.client = new Anthropic({ apiKey: key });
            continue;
          } catch (loginErr: any) {
            log.error(`Login échoué: ${loginErr.message}`);
            break;
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
