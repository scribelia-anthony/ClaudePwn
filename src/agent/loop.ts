import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { getConfig, getApiKey } from '../config/index.js';
import { login, getValidAccessToken, refreshTokens } from '../utils/auth.js';
import { getAllTools, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './system-prompt.js';
import { saveHistory } from '../session/manager.js';
import { log } from '../utils/logger.js';
import { setStatus } from '../utils/status.js';
import { compressHistory } from './compress.js';
import { extractFindings, updateNotes } from './extract.js';
import { MemoryStore } from './memory.js';

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
  private pendingMessages: string[] = [];
  private memory: MemoryStore;

  constructor(box: string, ip: string, boxDir: string, history: Message[] = []) {
    this.box = box;
    this.ip = ip;
    this.boxDir = boxDir;
    this.messages = history;

    // Initialize RAG memory
    this.memory = new MemoryStore(boxDir);
    this.memory.load();

    // Bootstrap: if memory is empty and history is small enough (won't be compressed),
    // index it now. Large histories will be indexed by compressHistory() instead.
    if (this.memory.size() === 0 && history.length > 0 && history.length <= 50) {
      const indexed = this.memory.indexMessages(history);
      if (indexed > 0) {
        this.memory.save();
        log.info(`Mémoire bootstrappée: ${indexed} chunks indexés`);
      }
    }
  }

  /**
   * Inject a user message into the conversation.
   * Accumulated and included in the next API call (between tool executions).
   */
  injectMessage(text: string): void {
    this.pendingMessages.push(text);
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

    // Append FIFO reminder directly in user message if shell is active
    const fifoHint = existsSync('/tmp/shell_in')
      ? '\n[RAPPEL OBLIGATOIRE: shell FIFO actif → tu DOIS proposer `shell upgrade` dans les prochaines étapes]'
      : '';
    this.messages.push({ role: 'user', content: userInput + fifoHint });

    // RAG: search memory for relevant context
    const relevantChunks = this.memory.search(userInput);
    const ragContext = this.memory.formatRAGContext(relevantChunks);

    const system = buildSystemPrompt(this.box, this.ip, this.boxDir, ragContext);
    const tools = getAllTools();

    // Compress history if it exceeds the token threshold
    this.messages = await compressHistory(
      this.messages,
      this.box,
      this.ip,
      this.boxDir,
      async (model, systemPrompt, msgs, maxTokens) => {
        if (this.useOAuth && this.accessToken) {
          const response = await callAnthropicOAuth(this.accessToken, this.sessionId, {
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: msgs,
          });
          const textBlock = response.content.find((b) => b.type === 'text');
          return textBlock && 'text' in textBlock ? (textBlock as any).text : '';
        }
        const response = await this.client!.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: msgs,
        });
        const textBlock = response.content.find((b) => b.type === 'text');
        return textBlock && 'text' in textBlock ? (textBlock as any).text : '';
      },
      this.memory,
    );

    const messageCountBefore = this.messages.length;

    const MAX_TURNS = 30;
    const MAX_ELAPSED_MS = 10 * 60 * 1000; // 10 minutes
    const MIN_CALL_INTERVAL_MS = 500; // Minimum 500ms between API calls
    const startTime = Date.now();
    let turn = 0;
    let lastCallTime = 0;
    let rateLimitRetries = 0;
    const MAX_RATE_LIMIT_RETRIES = 5;
    while (turn < MAX_TURNS && Date.now() - startTime < MAX_ELAPSED_MS) {
      let response: Anthropic.Message;

      // Rate limit: ensure minimum interval between API calls
      const elapsed = Date.now() - lastCallTime;
      if (elapsed < MIN_CALL_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, MIN_CALL_INTERVAL_MS - elapsed));
      }

      setStatus(turn === 0 ? 'Réflexion...' : rateLimitRetries > 0 ? `Rate limit — retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}...` : 'Analyse des résultats...');

      try {
        lastCallTime = Date.now();
        response = await this.createMessage(system, tools);
        rateLimitRetries = 0; // Reset on success
      } catch (err: any) {
        // Rate limit / overloaded — exponential backoff with own counter
        if (err.status === 429 || err.status === 529) {
          rateLimitRetries++;
          if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
            log.error(`Rate limit: ${MAX_RATE_LIMIT_RETRIES} retries échoués. Arrêt.`);
            break;
          }
          const delay = Math.min(2000 * Math.pow(2, rateLimitRetries), 60000);
          log.warn(`Rate limit (${err.status}) — retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES} dans ${(delay / 1000).toFixed(0)}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
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

      // Execute tools sequentially — commands often depend on previous results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUseBlocks) {
        const result = await executeTool(tool.name, tool.input, this.boxDir);
        toolResults.push({
          type: 'tool_result' as const,
          tool_use_id: tool.id,
          content: result,
        });
      }

      // Include pending user messages with tool results if any
      if (this.pendingMessages.length > 0) {
        const combined = this.pendingMessages.join('\n');
        const userText: Anthropic.TextBlockParam = {
          type: 'text',
          text: `[Messages de l'utilisateur pendant l'exécution]:\n${combined}`,
        };
        this.messages.push({ role: 'user', content: [...toolResults, userText] });
        this.pendingMessages = [];
      } else {
        this.messages.push({ role: 'user', content: toolResults });
      }
      turn++;
    }

    if (turn >= MAX_TURNS) {
      log.warn(`Agent arrêté : limite de ${MAX_TURNS} tours atteinte.`);
    } else if (Date.now() - startTime >= MAX_ELAPSED_MS) {
      log.warn(`Agent arrêté : timeout de 10 minutes atteint.`);
    }

    setStatus(null);

    // Index new messages into RAG memory
    try {
      const newMessages = this.messages.slice(messageCountBefore);
      const indexed = this.memory.indexMessages(newMessages);
      if (indexed > 0) this.memory.save();
    } catch (err: any) {
      log.warn(`Indexation mémoire RAG échouée: ${err.message}`);
    }

    // Auto-extract findings from new messages and update notes.md
    try {
      const newMessages = this.messages.slice(messageCountBefore);
      const findings = extractFindings(newMessages);
      updateNotes(this.boxDir, findings);
    } catch (err: any) {
      log.warn(`Extraction auto-notes échouée: ${err.message}`);
    }

    saveHistory(this.boxDir, this.messages);
  }

  getMessages(): Message[] {
    return this.messages;
  }
}
