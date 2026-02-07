import { spawn, type ChildProcess } from 'child_process';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { log } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
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

  log.command(command);

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

    // Stream output line-by-line via console.log — Ink renders above input
    let stdoutLineBuf = '';
    let stderrLineBuf = '';

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      stdoutLineBuf += text;
      const lines = stdoutLineBuf.split('\n');
      stdoutLineBuf = lines.pop()!; // keep incomplete last line
      for (const line of lines) {
        console.log(line);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      stderrLineBuf += text;
      const lines = stderrLineBuf.split('\n');
      stderrLineBuf = lines.pop()!;
      for (const line of lines) {
        console.error(line);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      currentProc = null;

      // Flush remaining line buffers
      if (stdoutLineBuf) console.log(stdoutLineBuf);
      if (stderrLineBuf) console.error(stderrLineBuf);

      const elapsed = formatElapsed(Date.now() - startTime);
      if (Date.now() - startTime > 3000) {
        log.info(`Terminé en ${elapsed}`);
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
      resolve(`Error: ${err.message}`);
    });
  });
}
