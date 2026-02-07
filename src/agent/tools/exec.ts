import { spawn, type ChildProcess } from 'child_process';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { log } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { setStatus } from '../../utils/status.js';
import type Anthropic from '@anthropic-ai/sdk';

export const execTool: Anthropic.Tool = {
  name: 'Bash',
  description: 'Execute a shell command. Use this for ALL system commands: nmap, ffuf, gobuster, searchsploit, curl, wget, python, etc. Output is streamed in real-time. For long-running commands, set a higher timeout.',
  input_schema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in seconds (default: 300)',
      },
    },
    required: ['command'],
  },
};

// Track running process so Ctrl+C can interrupt it
let currentProc: ChildProcess | null = null;

export function interruptCurrentExec(): boolean {
  if (currentProc) {
    currentProc.kill('SIGTERM');
    return true;
  }
  return false;
}

// Strip ANSI escape codes (colors, bold, etc.) — tools like rustscan ignore TERM=dumb
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function isProgressLine(raw: string): boolean {
  const line = stripAnsi(raw);
  if (!line.trim()) return true;
  // ffuf progress
  if (/:: Progress:/.test(line)) return true;
  if (/\d+\/\d+\]\s*::\s*Job\s*\[/.test(line) && !/\[Status:/.test(line)) return true;
  // nmap verbose noise
  if (/^Stats:\s/.test(line)) return true;
  if (/^Connect Scan Timing:/.test(line)) return true;
  if (/^Service scan Timing:/.test(line)) return true;
  if (/^Completed\s/.test(line)) return true;
  if (/^Initiating\s/.test(line)) return true;
  if (/^NSE:\s/.test(line)) return true;
  if (/^Scanning\s/.test(line)) return true;
  if (/^Discovered open port/.test(line)) return true;
  if (/^Scanned at\s/.test(line)) return true;
  if (/^Read data files from:/.test(line)) return true;
  if (/^Service detection performed/.test(line)) return true;
  // nmap SSH key blobs — any line with 60+ contiguous base64 chars anywhere
  if (/[A-Za-z0-9+/=]{60,}/.test(line)) return true;
  // rustscan banner/noise
  if (/^[.|\-{}\s\\/'`_]{4,}$/.test(line)) return true;
  if (/^\s*:.*:$/.test(line)) return true;
  if (/^The Modern Day/.test(line)) return true;
  if (/^RustScan:/.test(line)) return true;
  if (/^Scanning ports faster/.test(line)) return true;
  if (/^\[~\]\s/.test(line)) return true;
  if (/^\[>\]\sRunning script/.test(line)) return true;
  if (/^Depending on the complexity/.test(line)) return true;
  // gobuster/feroxbuster progress
  if (/^Progress:.*\d+\/\d+/.test(line) && !/Found:/.test(line)) return true;
  return false;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

export async function executeExec(
  input: { command: string; timeout?: number },
  boxDir: string | null,
): Promise<string> {
  const { command, timeout } = input;
  const timeoutMs = (timeout || 300) * 1000;
  const config = getConfig();

  setStatus(`Exécution: ${command.length > 60 ? command.slice(0, 57) + '...' : command}`);

  // Log to log.md
  if (boxDir) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    appendFileSync(join(boxDir, 'log.md'), `| ${timestamp} | \`${command.replace(/\|/g, '\\|')}\` |\n`);
  }

  return new Promise<string>((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    const startTime = Date.now();

    const proc = spawn('bash', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'dumb' },
    });

    currentProc = proc;

    const killTimer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, Math.min(timeoutMs, config.execTimeout));

    // Stream output line-by-line via emitLine — Ink <Static> renders immediately
    let stdoutLineBuf = '';
    let stderrLineBuf = '';

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      stdoutLineBuf += text;
      const lines = stdoutLineBuf.split('\n');
      stdoutLineBuf = lines.pop()!;
      for (let line of lines) {
        const crIdx = line.lastIndexOf('\r');
        if (crIdx !== -1) line = line.substring(crIdx + 1);
        if (!isProgressLine(line)) log.toolOutput(stripAnsi(line));
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      stderrLineBuf += text;
      const lines = stderrLineBuf.split('\n');
      stderrLineBuf = lines.pop()!;
      for (let line of lines) {
        const crIdx = line.lastIndexOf('\r');
        if (crIdx !== -1) line = line.substring(crIdx + 1);
        if (!isProgressLine(line)) log.toolOutput(stripAnsi(line));
      }
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      currentProc = null;
      setStatus(null);

      // Flush remaining line buffers (with same filtering)
      if (stdoutLineBuf) {
        let line = stdoutLineBuf;
        const crIdx = line.lastIndexOf('\r');
        if (crIdx !== -1) line = line.substring(crIdx + 1);
        if (!isProgressLine(line)) log.toolOutput(stripAnsi(line));
      }
      if (stderrLineBuf) {
        let line = stderrLineBuf;
        const crIdx = line.lastIndexOf('\r');
        if (crIdx !== -1) line = line.substring(crIdx + 1);
        if (!isProgressLine(line)) log.toolOutput(stripAnsi(line));
      }

      const elapsed = formatElapsed(Date.now() - startTime);
      if (Date.now() - startTime > 3000) {
        log.elapsed(elapsed);
      }

      let result = stdout;
      if (stderr && !stdout.includes(stderr)) {
        result += '\n' + stderr;
      }
      if (killed) {
        result += `\n[TIMEOUT after ${timeout || 300}s]`;
      }
      if (code !== 0 && code !== null) {
        result += `\n[Exit code: ${code}]`;
      }
      // Truncate if too long
      if (result.length > 50000) {
        result = result.slice(0, 25000) + '\n\n[... truncated ...]\n\n' + result.slice(-25000);
      }
      resolve(result || '(no output)');
    });

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      currentProc = null;
      setStatus(null);
      resolve(`Error: ${err.message}`);
    });
  });
}
