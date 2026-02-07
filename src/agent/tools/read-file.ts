import { readFileSync, existsSync } from 'fs';
import type Anthropic from '@anthropic-ai/sdk';

export const readFileTool: Anthropic.Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Use for reading scan results, config files, source code, notes, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read',
      },
      max_lines: {
        type: 'number',
        description: 'Maximum number of lines to return (default: all)',
      },
    },
    required: ['path'],
  },
};

export async function executeReadFile(input: { path: string; max_lines?: number }): Promise<string> {
  const { path, max_lines } = input;

  if (!existsSync(path)) {
    return `Error: File not found: ${path}`;
  }

  try {
    let content = readFileSync(path, 'utf-8');
    if (max_lines) {
      const lines = content.split('\n');
      if (lines.length > max_lines) {
        content = lines.slice(0, max_lines).join('\n') + `\n\n[... truncated, ${lines.length - max_lines} more lines ...]`;
      }
    }
    // Truncate at 10000 lines
    const lines = content.split('\n');
    if (lines.length > 10000) {
      content = lines.slice(0, 10000).join('\n') + `\n\n[... truncated at 10000 lines, ${lines.length - 10000} more ...]`;
    }
    return content || '(empty file)';
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
}
