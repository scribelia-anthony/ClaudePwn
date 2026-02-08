import chalk, { Chalk } from 'chalk';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { emitLine } from './output.js';

// Force full color support for marked-terminal (chalk may detect level 0 at import time)
const fullColorChalk = new Chalk({ level: 3 });
marked.use(markedTerminal({
  tab: 2,
  chalk: fullColorChalk,
  showSectionPrefix: false,
}) as any);

export const log = {
  info(msg: string) {
    emitLine(chalk.blue('[*]') + ' ' + msg);
  },

  ok(msg: string) {
    emitLine(chalk.green('[+]') + ' ' + msg);
  },

  warn(msg: string) {
    emitLine(chalk.yellow('[!]') + ' ' + msg);
  },

  error(msg: string) {
    emitLine(chalk.red('[-]') + ' ' + msg);
  },

  elapsed(elapsed: string) {
    emitLine(chalk.dim('  ✓ ') + chalk.green.dim(elapsed));
  },

  result(text: string) {
    emitLine(chalk.gray(text));
  },

  toolOutput(line: string) {
    emitLine(chalk.dim('  │ ') + chalk.dim(line));
  },

  tool(name: string, input: Record<string, unknown>) {
    const summary = name === 'Bash'
      ? (input.command as string)
      : name === 'Read'
        ? `Read: ${input.file_path}`
        : name === 'Write'
          ? `Write: ${input.file_path}`
          : name === 'WebFetch'
            ? `${input.method || 'GET'} ${input.url}`
            : name === 'AskUserQuestion'
              ? `${input.question}`
              : JSON.stringify(input).slice(0, 80);
    emitLine(chalk.green('  ▸ ') + chalk.white(summary));
  },

  assistant(text: string) {
    // Render markdown to terminal ANSI (bold, tables, etc.)
    const rendered = (marked.parse(text) as string).trimEnd();
    for (const line of rendered.split('\n')) {
      emitLine(line);
    }
  },

  banner() {
    const banner = chalk.red.bold(`
   _____ _                 _      _____
  / ____| |               | |    |  __ \\
 | |    | | __ _ _   _  __| | ___| |__) |_      ___ __
 | |    | |/ _\` | | | |/ _\` |/ _ \\  ___/\\ \\ /\\ / / '_ \\
 | |____| | (_| | |_| | (_| |  __/ |     \\ V  V /| | | |
  \\_____|_|\\__,_|\\__,_|\\__,_|\\___|_|      \\_/\\_/ |_| |_|
`);
    for (const line of banner.split('\n')) {
      emitLine(line);
    }
    emitLine(chalk.dim('  Framework de hacking autonome propulsé par Claude'));
    emitLine('');
  },
};
