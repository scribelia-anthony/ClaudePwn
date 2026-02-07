import chalk from 'chalk';
import { emitLine } from './output.js';

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

  command(cmd: string) {
    emitLine(chalk.green('$') + ' ' + chalk.dim(cmd));
  },

  result(text: string) {
    emitLine(chalk.gray(text));
  },

  tool(name: string, input: Record<string, unknown>) {
    const summary = name === 'Bash'
      ? (input.command as string)
      : name === 'Read'
        ? `${input.file_path}`
        : name === 'Write'
          ? `${input.file_path}`
          : name === 'WebFetch'
            ? `${input.method || 'GET'} ${input.url}`
            : name === 'AskUserQuestion'
              ? `${input.question}`
              : JSON.stringify(input).slice(0, 80);
    emitLine(chalk.magenta(`[${name}]`) + ' ' + chalk.dim(summary));
  },

  assistant(text: string) {
    // Split multi-line assistant text into individual lines
    for (const line of text.split('\n')) {
      emitLine(chalk.cyan(line));
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
