import * as readline from 'readline';
import chalk from 'chalk';
import type Anthropic from '@anthropic-ai/sdk';

export const askUserTool: Anthropic.Tool = {
  name: 'AskUserQuestion',
  description: 'Ask the user a question and wait for their response. Use SPARINGLY — only when you truly need input (e.g., credentials, choice between exploitation paths, confirmation for destructive actions).',
  input_schema: {
    type: 'object' as const,
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask the user',
      },
    },
    required: ['question'],
  },
};

let sharedRl: readline.Interface | null = null;

export function setSharedReadline(rl: readline.Interface): void {
  sharedRl = rl;
}

export async function executeAskUser(input: { question: string }): Promise<string> {
  console.log(chalk.yellow(`\n[?] ${input.question}`));

  return new Promise<string>((resolve) => {
    if (sharedRl) {
      sharedRl.question(chalk.yellow('> '), (answer) => {
        resolve(answer.trim() || '(no response)');
      });
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(chalk.yellow('> '), (answer) => {
        rl.close();
        resolve(answer.trim() || '(no response)');
      });
    }
  });
}
