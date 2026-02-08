import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import { BOXES_DIR, ACTIVE_FILE } from '../config/index.js';
import { generateNotesTemplate } from './notes.js';

export interface Session {
  box: string;
  ip: string;
  boxDir: string;
  startedAt: string;
}

export function createSession(box: string, ip: string): Session {
  const boxDir = join(BOXES_DIR, box);

  // Create directory structure
  for (const sub of ['scans', 'loot', 'exploits']) {
    mkdirSync(join(boxDir, sub), { recursive: true });
  }

  // Create notes.md if not exists
  const notesPath = join(boxDir, 'notes.md');
  if (!existsSync(notesPath)) {
    writeFileSync(notesPath, generateNotesTemplate(box, ip));
  }

  // Create log.md if not exists
  const logPath = join(boxDir, 'log.md');
  if (!existsSync(logPath)) {
    writeFileSync(logPath, `# ${box} — Command Log\n\n| Timestamp | Command |\n|-----------|----------|\n`);
  }

  const session: Session = {
    box,
    ip,
    boxDir,
    startedAt: new Date().toISOString(),
  };

  // Write active file
  writeFileSync(ACTIVE_FILE, JSON.stringify(session, null, 2));

  return session;
}

export function loadActiveSession(): Session | null {
  if (!existsSync(ACTIVE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(ACTIVE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadHistory(boxDir: string): Array<{ role: string; content: unknown }> {
  const historyPath = join(boxDir, 'history.json');
  if (!existsSync(historyPath)) return [];
  try {
    return JSON.parse(readFileSync(historyPath, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveHistory(boxDir: string, messages: Array<{ role: string; content: unknown }>): void {
  const historyPath = join(boxDir, 'history.json');
  const tmpPath = historyPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(messages, null, 2));
  renameSync(tmpPath, historyPath);
}

export function listBoxes(): Array<{ box: string; ip: string; active: boolean }> {
  if (!existsSync(BOXES_DIR)) return [];

  const entries = readdirSync(BOXES_DIR);
  const active = loadActiveSession();

  return entries
    .map((e) => e.toString())
    .filter((name) => statSync(join(BOXES_DIR, name)).isDirectory())
    .map((name) => {
      let ip = '?';
      const notesPath = join(BOXES_DIR, name, 'notes.md');
      if (existsSync(notesPath)) {
        const notes = readFileSync(notesPath, 'utf-8');
        const match = notes.match(/# .+ — (.+)/);
        if (match) ip = match[1];
      }
      return { box: name, ip, active: active?.box === name };
    });
}

export function clearActiveSession(): void {
  if (existsSync(ACTIVE_FILE)) {
    unlinkSync(ACTIVE_FILE);
  }
}
