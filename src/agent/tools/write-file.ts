import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type Anthropic from '@anthropic-ai/sdk';

export const writeFileTool: Anthropic.Tool = {
  name: 'write_file',
  description: 'Write or append content to a file. Creates parent directories if needed. Use for saving notes, exploits, configs, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file',
      },
      content: {
        type: 'string',
        description: 'Content to write',
      },
      append: {
        type: 'boolean',
        description: 'Append instead of overwrite (default: false)',
      },
    },
    required: ['path', 'content'],
  },
};

export async function executeWriteFile(input: { path: string; content: string; append?: boolean }): Promise<string> {
  const { path, content, append } = input;

  try {
    mkdirSync(dirname(path), { recursive: true });

    if (append) {
      appendFileSync(path, content);
      return `Appended ${content.length} bytes to ${path}`;
    } else {
      writeFileSync(path, content);
      return `Wrote ${content.length} bytes to ${path}`;
    }
  } catch (err: any) {
    return `Error writing file: ${err.message}`;
  }
}
