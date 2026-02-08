import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { dirname, resolve, relative } from 'path';
import type Anthropic from '@anthropic-ai/sdk';

export const writeFileTool: Anthropic.Tool = {
  name: 'Write',
  description: 'Write or append content to a file. Creates parent directories if needed. Use for saving notes, exploits, configs, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_path: {
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
    required: ['file_path', 'content'],
  },
};

export async function executeWriteFile(input: { file_path: string; content: string; append?: boolean }, boxDir: string | null): Promise<string> {
  const { file_path: path, content, append } = input;

  // Validate path is within workspace to prevent directory traversal
  if (boxDir) {
    const absPath = resolve(path);
    const absWorkspace = resolve(boxDir);
    const rel = relative(absWorkspace, absPath);
    if (rel.startsWith('..') || resolve(rel) === absPath) {
      return `Error: path outside workspace — write restricted to ${boxDir}/`;
    }
  }

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
