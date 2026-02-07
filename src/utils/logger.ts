import * as readline from 'readline';
import chalk from 'chalk';

// Shared readline instance — set by start.ts
let sharedRl: readline.Interface | null = null;

export function setLoggerReadline(rl: readline.Interface) {
  sharedRl = rl;
}

/**
 * Safe console.log that clears readline prompt before writing.
 * This prevents agent output from corrupting the user's input line.
 */
function safePrint(...args: unknown[]) {
  if (sharedRl) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }
  console.log(...args);
}

export const log = {
  info(msg: string) {
    safePrint(chalk.blue('[*]'), msg);
  },

  ok(msg: string) {
    safePrint(chalk.green('[+]'), msg);
  },

  warn(msg: string) {
    safePrint(chalk.yellow('[!]'), msg);
  },

  error(msg: string) {
    safePrint(chalk.red('[-]'), msg);
  },

  command(cmd: string) {
    safePrint(chalk.green('$'), chalk.dim(cmd));
  },

  result(text: string) {
    safePrint(chalk.gray(text));
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
    safePrint(chalk.magenta(`[${name}]`), chalk.dim(summary));
  },

  assistant(text: string) {
    safePrint(chalk.cyan(text));
  },

  banner() {
    console.log(chalk.red.bold(`
   _____ _                 _      _____
  / ____| |               | |    |  __ \\
 | |    | | __ _ _   _  __| | ___| |__) |_      ___ __
 | |    | |/ _\` | | | |/ _\` |/ _ \\  ___/\\ \\ /\\ / / '_ \\
 | |____| | (_| | |_| | (_| |  __/ |     \\ V  V /| | | |
  \\_____|_|\\__,_|\\__,_|\\__,_|\\___|_|      \\_/\\_/ |_| |_|
`));
    console.log(chalk.dim('  Framework de hacking autonome propulsé par Claude\n'));
  },
};
