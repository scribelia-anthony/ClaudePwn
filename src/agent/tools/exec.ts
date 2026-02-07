import { spawn } from 'child_process';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { log } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import type Anthropic from '@anthropic-ai/sdk';

export const execTool: Anthropic.Tool = {
  name: 'exec_command',
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

    const proc = spawn('bash', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'dumb' },
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, Math.min(timeoutMs, config.execTimeout));

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
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
      clearTimeout(timer);
      resolve(`Error: ${err.message}`);
    });
  });
}
