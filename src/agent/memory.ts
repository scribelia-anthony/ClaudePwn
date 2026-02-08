import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { log } from '../utils/logger.js';
import type Anthropic from '@anthropic-ai/sdk';

type Message = Anthropic.MessageParam;

// --- Types ---

export interface MemoryChunk {
  id: string;
  timestamp: number;
  type: 'tool_result' | 'tool_use' | 'assistant_text' | 'user_input';
  source: string;   // tool name, 'user', 'assistant'
  label: string;    // short description
  content: string;  // max 2000 chars
  tokens: string[]; // tokenized content for TF-IDF
}

// --- Stop words (FR + EN, minimal) ---

const STOP_WORDS = new Set([
  // EN
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'about', 'up', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which',
  'who', 'whom',
  // FR
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est',
  'en', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'ce', 'il', 'ne',
  'se', 'au', 'aux', 'avec', 'son', 'sa', 'ses', 'ou', 'mais', 'par',
  'je', 'tu', 'nous', 'vous', 'ils', 'elles', 'été', 'être', 'avoir',
  'fait', 'comme', 'tout', 'plus', 'aussi', 'bien', 'peut', 'même',
  'donc', 'car', 'ni', 'si', 'cette', 'ces',
]);

// --- Tokenizer ---

/** Regex patterns for technical tokens we want to preserve intact */
const TECHNICAL_PATTERNS = [
  /\b(?:CVE-\d{4}-\d{4,})\b/gi,                          // CVE-2021-12345
  /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g,          // IPs + CIDR
  /\b\d{1,5}\/(?:tcp|udp)\b/gi,                            // 22/tcp, 80/udp
  /(?:\/[\w.\-]+){2,}/g,                                   // Unix paths /etc/passwd
  /\b[a-f0-9]{32,64}\b/gi,                                 // MD5/SHA hashes
  /\b[\w.-]+\.(?:htb|local|internal|corp|com|net|org)\b/gi, // Domains
];

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let remaining = text;

  // Extract technical tokens first (preserve them intact)
  for (const pattern of TECHNICAL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(remaining)) !== null) {
      const token = match[0].toLowerCase();
      if (token.length >= 2) tokens.push(token);
    }
  }

  // General tokenization: split on non-alphanumeric (keeping dots/slashes for technical terms)
  const words = remaining
    .toLowerCase()
    .replace(/[^a-z0-9._\/\-:]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  tokens.push(...words);

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }

  return unique;
}

// --- TF-IDF Engine ---

type SparseVector = Map<string, number>;

function computeTF(tokens: string[]): SparseVector {
  const tf: SparseVector = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  // Normalize by max frequency
  const maxFreq = Math.max(...tf.values(), 1);
  for (const [k, v] of tf) {
    tf.set(k, v / maxFreq);
  }
  return tf;
}

function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [k, v] of a) {
    normA += v * v;
    const bv = b.get(k);
    if (bv !== undefined) dot += v * bv;
  }
  for (const [, v] of b) {
    normB += v * v;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// --- MemoryStore ---

const MAX_CHUNKS = 200;
const MAX_CONTENT_LENGTH = 2000;
const DEDUP_THRESHOLD = 0.9;

export class MemoryStore {
  private chunks: MemoryChunk[] = [];
  private filePath: string;
  private dirty = true; // IDF needs rebuild
  private idf: Map<string, number> = new Map();

  constructor(boxDir: string) {
    this.filePath = join(boxDir, 'memory.json');
  }

  // --- Persistence ---

  load(): void {
    if (!existsSync(this.filePath)) {
      this.chunks = [];
      return;
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      this.chunks = JSON.parse(raw);
      this.dirty = true;
    } catch {
      this.chunks = [];
    }
  }

  save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.chunks, null, 2));
  }

  size(): number {
    return this.chunks.length;
  }

  // --- Add chunks ---

  addChunk(type: MemoryChunk['type'], source: string, label: string, content: string): boolean {
    // Truncate content
    const truncated = content.length > MAX_CONTENT_LENGTH
      ? content.slice(0, MAX_CONTENT_LENGTH)
      : content;

    const tokens = tokenize(truncated);
    if (tokens.length < 3) return false; // Too short to be useful

    // Dedup: check cosine similarity against recent chunks
    const candidateTF = computeTF(tokens);
    const recentChunks = this.chunks.slice(-30); // Only check recent for perf
    for (const existing of recentChunks) {
      const existingTF = computeTF(existing.tokens);
      if (cosineSimilarity(candidateTF, existingTF) > DEDUP_THRESHOLD) {
        return false; // Duplicate, skip
      }
    }

    const chunk: MemoryChunk = {
      id: randomUUID().slice(0, 8),
      timestamp: Date.now(),
      type,
      source,
      label,
      content: truncated,
      tokens,
    };

    this.chunks.push(chunk);
    this.dirty = true;

    // Evict oldest if over limit
    if (this.chunks.length > MAX_CHUNKS) {
      this.chunks = this.chunks.slice(this.chunks.length - MAX_CHUNKS);
    }

    return true;
  }

  // --- TF-IDF Search ---

  private rebuildIDF(): void {
    if (!this.dirty) return;

    const docCount = this.chunks.length;
    if (docCount === 0) {
      this.idf.clear();
      this.dirty = false;
      return;
    }

    // Count document frequency for each term
    const df: Map<string, number> = new Map();
    for (const chunk of this.chunks) {
      const uniqueTokens = new Set(chunk.tokens);
      for (const t of uniqueTokens) {
        df.set(t, (df.get(t) || 0) + 1);
      }
    }

    // Compute IDF: log(N / df)
    this.idf.clear();
    for (const [term, freq] of df) {
      this.idf.set(term, Math.log(docCount / freq));
    }

    this.dirty = false;
  }

  private getTFIDFVector(tokens: string[]): SparseVector {
    const tf = computeTF(tokens);
    const tfidf: SparseVector = new Map();
    for (const [term, tfVal] of tf) {
      const idfVal = this.idf.get(term) || 0;
      if (idfVal > 0) {
        tfidf.set(term, tfVal * idfVal);
      }
    }
    return tfidf;
  }

  search(query: string, topK = 8): MemoryChunk[] {
    if (this.chunks.length === 0) return [];

    this.rebuildIDF();

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryVec = this.getTFIDFVector(queryTokens);

    const scored: Array<{ chunk: MemoryChunk; score: number }> = [];
    for (const chunk of this.chunks) {
      const chunkVec = this.getTFIDFVector(chunk.tokens);
      const score = cosineSimilarity(queryVec, chunkVec);
      if (score > 0.01) { // Minimum relevance threshold
        scored.push({ chunk, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.chunk);
  }

  // --- Index from message history ---

  indexMessages(messages: Message[]): number {
    let indexed = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (typeof msg.content === 'string') {
        if (msg.role === 'user') {
          if (this.addChunk('user_input', 'user', 'User input', msg.content)) indexed++;
        } else {
          if (this.addChunk('assistant_text', 'assistant', 'Assistant response', msg.content)) indexed++;
        }
        continue;
      }

      if (!Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        const b = block as any;

        // Assistant text blocks
        if (b.type === 'text' && typeof b.text === 'string' && msg.role === 'assistant') {
          if (b.text.length > 50) { // Skip short acknowledgements
            if (this.addChunk('assistant_text', 'assistant', 'Analysis', b.text)) indexed++;
          }
        }

        // Tool use blocks
        if (b.type === 'tool_use') {
          const input = typeof b.input === 'string' ? b.input : JSON.stringify(b.input);
          const label = `Tool: ${b.name}`;
          if (this.addChunk('tool_use', b.name || 'unknown', label, input)) indexed++;
        }

        // Tool result blocks
        if (b.type === 'tool_result') {
          const content = typeof b.content === 'string'
            ? b.content
            : Array.isArray(b.content)
              ? b.content.map((c: any) => typeof c === 'string' ? c : c?.text || '').join('\n')
              : '';
          if (content.length > 30) { // Skip trivial results
            const source = findToolName(messages, i, b.tool_use_id) || 'tool';
            if (this.addChunk('tool_result', source, `Result: ${source}`, content)) indexed++;
          }
        }
      }
    }

    return indexed;
  }

  // --- Format for system prompt ---

  formatRAGContext(chunks: MemoryChunk[], maxChars = 6000): string {
    if (chunks.length === 0) return '';

    const lines: string[] = ['## Contexte récupéré (mémoire long-terme)\n'];
    let chars = lines[0].length;

    for (const chunk of chunks) {
      const entry = `### [${chunk.type}] ${chunk.label} (${new Date(chunk.timestamp).toLocaleTimeString('fr-FR')})\n${chunk.content}\n`;
      if (chars + entry.length > maxChars) break;
      lines.push(entry);
      chars += entry.length;
    }

    return lines.join('\n');
  }
}

// --- Helpers ---

/** Find the tool name for a given tool_use_id by looking at previous assistant messages */
function findToolName(messages: Message[], currentIndex: number, toolUseId: string): string | null {
  // Look backwards for the matching tool_use block
  for (let i = currentIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      const b = block as any;
      if (b.type === 'tool_use' && b.id === toolUseId) {
        return b.name || null;
      }
    }
  }
  return null;
}
