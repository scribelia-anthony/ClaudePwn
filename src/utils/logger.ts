import chalk from 'chalk';

export const log = {
  info(msg: string) {
    console.log(chalk.blue('[*]'), msg);
  },

  ok(msg: string) {
    console.log(chalk.green('[+]'), msg);
  },

  warn(msg: string) {
    console.log(chalk.yellow('[!]'), msg);
  },

  error(msg: string) {
    console.log(chalk.red('[-]'), msg);
  },

  command(cmd: string) {
    console.log(chalk.green('$'), chalk.dim(cmd));
  },

  result(text: string) {
    console.log(chalk.gray(text));
  },

  tool(name: string, input: Record<string, unknown>) {
    const summary = name === 'exec_command'
      ? (input.command as string)
      : name === 'read_file'
        ? `read ${input.path}`
        : name === 'write_file'
          ? `write ${input.path}`
          : name === 'http_request'
            ? `${input.method || 'GET'} ${input.url}`
            : name === 'ask_user'
              ? `asking: ${input.question}`
              : JSON.stringify(input).slice(0, 80);
    console.log(chalk.magenta(`[tool:${name}]`), chalk.dim(summary));
  },

  assistant(text: string) {
    console.log(chalk.cyan(text));
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
