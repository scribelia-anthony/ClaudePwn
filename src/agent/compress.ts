import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { log } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

type Message = Anthropic.MessageParam;

/**
 * Rough token estimate: ~1 token per 4 characters.
 * Traverses all content blocks (text, tool_use input, tool_result content).
 */
export function estimateTokens(messages: Message[]): number {
  let chars = 0;

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length;
      continue;
    }

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block && typeof (block as any).text === 'string') {
          chars += (block as any).text.length;
        }
        if (block.type === 'tool_use') {
          const input = (block as any).input;
          chars += typeof input === 'string' ? input.length : JSON.stringify(input).length;
        }
        if (block.type === 'tool_result') {
          const content = (block as any).content;
          if (typeof content === 'string') {
            chars += content.length;
          } else if (Array.isArray(content)) {
            for (const c of content) {
              if (typeof c === 'string') chars += c.length;
              else if (c && typeof c.text === 'string') chars += c.text.length;
            }
          }
        }
      }
    }
  }

  return Math.ceil(chars / 4);
}

/** Strip ANSI escape sequences */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

/**
 * Serialize old messages into a human-readable text summary for the compression prompt.
 * Truncates tool_result content > 3000 chars.
 */
function serializeForSummary(messages: Message[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';

    if (typeof msg.content === 'string') {
      lines.push(`[${role}] ${stripAnsi(msg.content)}`);
      continue;
    }

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block && typeof (block as any).text === 'string') {
          lines.push(`[${role}] ${stripAnsi((block as any).text)}`);
        }
        if (block.type === 'tool_use') {
          const input = (block as any).input;
          const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
          lines.push(`[TOOL_USE: ${(block as any).name}] ${inputStr.slice(0, 3000)}`);
        }
        if (block.type === 'tool_result') {
          const content = (block as any).content;
          let text = '';
          if (typeof content === 'string') {
            text = content;
          } else if (Array.isArray(content)) {
            text = content
              .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
              .join('\n');
          }
          text = stripAnsi(text);
          if (text.length > 3000) {
            text = text.slice(0, 1500) + '\n[... tronqué ...]\n' + text.slice(-1500);
          }
          lines.push(`[TOOL_RESULT] ${text}`);
        }
      }
    }
  }

  return lines.join('\n');
}

export type CallApiFn = (
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number,
) => Promise<string>;

/**
 * Compress history if estimated tokens exceed the threshold.
 * Keeps the most recent messages intact and summarizes older ones via Haiku.
 * Saves a backup before compression.
 */
export async function compressHistory(
  messages: Message[],
  box: string,
  ip: string,
  boxDir: string,
  callApi: CallApiFn,
): Promise<Message[]> {
  const config = getConfig();
  const threshold = config.compressionThreshold;
  const keepRecent = config.compressionKeepRecent;

  const estimated = estimateTokens(messages);
  if (estimated < threshold) {
    return messages;
  }

  log.info(`Historique estimé à ~${estimated} tokens (seuil: ${threshold}). Compression en cours...`);

  // Backup before compression
  try {
    const backupPath = join(boxDir, `history-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(messages, null, 2));
    log.info(`Backup sauvegardé: ${backupPath}`);
  } catch (err: any) {
    log.warn(`Backup échoué: ${err.message}`);
  }

  // Split: old messages to summarize, recent to keep
  const splitIndex = Math.max(0, messages.length - keepRecent);
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  if (oldMessages.length === 0) {
    return messages;
  }

  const serialized = serializeForSummary(oldMessages);

  const summaryPrompt = `Résume cette conversation de pentest sur ${box} (${ip}).
Structure :
1. Ports et services (port, service, version)
2. URLs et chemins web
3. Credentials et utilisateurs
4. Vulnérabilités et exploits testés (succès/échec)
5. État actuel du pentest
Sois concis mais ne perds AUCUNE info technique (usernames, chemins, ports, versions, CVEs, hashes).`;

  try {
    const summaryText = await callApi(
      config.compressionModel,
      summaryPrompt,
      [{ role: 'user', content: serialized }],
      4096,
    );

    log.ok(`Historique compressé: ${oldMessages.length} messages → résumé`);

    return [
      {
        role: 'user',
        content: `[Résumé automatique des ${oldMessages.length} premiers messages de la conversation]\n\n${summaryText}`,
      },
      {
        role: 'assistant',
        content: 'Compris. J\'ai intégré le résumé de notre conversation précédente. Je continue avec le contexte complet.',
      },
      ...recentMessages,
    ];
  } catch (err: any) {
    log.warn(`Compression LLM échouée: ${err.message}. Troncature brute de l'historique.`);
    // Fallback: keep only recent messages to avoid infinite rate limit loops
    return [
      {
        role: 'user' as const,
        content: `[Historique tronqué — ${oldMessages.length} anciens messages supprimés. Consulte notes.md pour le contexte complet.]`,
      },
      {
        role: 'assistant' as const,
        content: 'Compris. Je me base sur notes.md pour le contexte.',
      },
      ...recentMessages,
    ];
  }
}
