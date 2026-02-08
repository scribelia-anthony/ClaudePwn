import { spawn, type ChildProcess } from 'child_process';
import { appendFileSync } from 'fs';
import { join, resolve as pathResolve } from 'path';
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

/** Kill the entire process group (bash + child tools like ffuf, nmap) */
function killProcGroup(proc: ChildProcess, signal: NodeJS.Signals): void {
  if (proc.pid) {
    try {
      process.kill(-proc.pid, signal);
    } catch {
      // Process group may already be gone — fall back to direct kill
      proc.kill(signal);
    }
  }
}

export function interruptCurrentExec(): boolean {
  if (currentProc) {
    killProcGroup(currentProc, 'SIGTERM');
    return true;
  }
  return false;
}

// Strip ANSI escape codes (colors, bold, etc.) — tools like rustscan ignore TERM=dumb
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Extract a short progress string for the status line, or null if not a progress line */
function extractProgress(raw: string): string | null {
  const line = stripAnsi(raw);

  // ffuf: :: Progress: [1234/220546] :: Job [1/1] :: 852 req/sec :: Duration: [0:01:23] ::
  const ffufMatch = line.match(/Progress:\s*\[(\d+)\/(\d+)\].*?(\d+)\s*req\/sec.*?Duration:\s*\[([^\]]+)\]/);
  if (ffufMatch) {
    const pct = Math.floor(parseInt(ffufMatch[1]) / parseInt(ffufMatch[2]) * 100);
    return `ffuf ${pct}% — ${ffufMatch[3]} req/s — ${ffufMatch[4]}`;
  }

  // gobuster/feroxbuster: Progress: 1234 / 220546 (0.56%)
  const gobusterMatch = line.match(/Progress:\s*(\d+)\s*\/\s*(\d+)\s*\(([^)]+)\)/);
  if (gobusterMatch) {
    return `gobuster ${gobusterMatch[3]}`;
  }

  // nmap: Stats: 0:00:30 elapsed; 0 hosts completed (1 up), 1 undergoing Connect Scan
  const nmapMatch = line.match(/^Stats:\s*([\d:]+)\s*elapsed/);
  if (nmapMatch) {
    return `nmap ${nmapMatch[1]} elapsed`;
  }

  return null;
}

function isProgressLine(raw: string): boolean {
  const line = stripAnsi(raw);
  if (!line.trim()) return true;
  // ffuf progress + config + banner
  if (/:: Progress:/.test(line)) return true;
  if (/\d+\/\d+\]\s*::\s*Job\s*\[/.test(line) && !/\[Status:/.test(line)) return true;
  if (/^\s*:: \w/.test(line)) return true;
  if (/^\s*v\d+\.\d+/.test(line)) return true;                    // ffuf version line
  if (/[,_]{2,}.*\\/.test(line) && /\\.*\\/.test(line)) return true; // ffuf ASCII art
  if (/^\s*\/'___\\/.test(line)) return true;                      // ffuf banner top
  if (/^\s*_{10,}/.test(line)) return true;                        // ffuf separator line
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
  if (/^CONN\s/.test(line)) return true;
  if (/^Packet Tracing/.test(line)) return true;
  // nmap SSH key blobs + fingerprints
  if (/[A-Za-z0-9+/=]{60,}/.test(line)) return true;
  if (/^\|\s*ssh-hostkey:/.test(line)) return true;
  if (/^\|\s+\d+\s+[0-9a-f:]{20,}/.test(line)) return true;
  // rustscan banner/noise + random taglines (emoji in various Unicode ranges)
  if (/[\u{200D}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}]/u.test(line)) return true;
  if (/^[.|\-{}\s\\/'`_]{4,}$/.test(line)) return true;
  if (/^\s*:.*:$/.test(line)) return true;
  if (/^The Modern Day/.test(line)) return true;
  if (/^RustScan:/.test(line)) return true;
  if (/^Scanning ports faster/.test(line)) return true;
  if (/^\[.\]\s/.test(line)) return true;
  if (/^\*I used/.test(line)) return true;
  if (/^Breaking and entering/.test(line)) return true;
  if (/^\s*Alternatively,/.test(line)) return true;
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
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'dumb',
        PATH: `${pathResolve('scripts')}:${process.env.PATH}`,
      },
      detached: true,
    });

    currentProc = proc;

    const killTimer = setTimeout(() => {
      killed = true;
      killProcGroup(proc, 'SIGKILL');
    }, Math.min(timeoutMs, config.execTimeout));

    // Stream output line-by-line via emitLine — Ink <Static> renders immediately
    let stdoutLineBuf = '';
    let stderrLineBuf = '';

    /** Process a chunk: split lines, check progress for status, filter noise */
    function processChunk(buf: { value: string }, chunk: string): void {
      buf.value += chunk;
      const lines = buf.value.split('\n');
      buf.value = lines.pop()!;
      for (let line of lines) {
        // Handle \r (carriage return) — tools use it for progress overwrite
        const crParts = line.split('\r');
        for (const part of crParts) {
          const clean = stripAnsi(part);
          if (!clean.trim()) continue;
          // Check for progress info → update status spinner
          const progress = extractProgress(clean);
          if (progress) {
            setStatus(progress);
            continue;
          }
          if (!isProgressLine(part)) log.toolOutput(clean);
        }
      }
      // Also check the remaining buffer for \r-only progress (no newline yet)
      if (buf.value.includes('\r')) {
        const crParts = buf.value.split('\r');
        buf.value = crParts.pop()!;
        for (const part of crParts) {
          const clean = stripAnsi(part);
          const progress = extractProgress(clean);
          if (progress) setStatus(progress);
        }
      }
    }

    const stdoutBuf = { value: '' };
    const stderrBuf = { value: '' };

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      processChunk(stdoutBuf, text);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      processChunk(stderrBuf, text);
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      currentProc = null;
      setStatus(null);

      // Flush remaining buffers
      for (const buf of [stdoutBuf, stderrBuf]) {
        if (buf.value.trim()) {
          const crIdx = buf.value.lastIndexOf('\r');
          const line = crIdx !== -1 ? buf.value.substring(crIdx + 1) : buf.value;
          const clean = stripAnsi(line);
          if (clean.trim() && !isProgressLine(line)) log.toolOutput(clean);
        }
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
