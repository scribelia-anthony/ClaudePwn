import { readFileSync, existsSync, statSync } from 'fs';
import type Anthropic from '@anthropic-ai/sdk';

export const readFileTool: Anthropic.Tool = {
  name: 'Read',
  description: 'Read the contents of a file. Use for reading scan results, config files, source code, notes, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the file to read',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to return (default: all)',
      },
    },
    required: ['file_path'],
  },
};

export async function executeReadFile(input: { file_path: string; limit?: number }): Promise<string> {
  const { file_path: path, limit: max_lines } = input;

  if (!existsSync(path)) {
    return `Error: File not found: ${path}`;
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  try {
    const size = statSync(path).size;
    if (size > MAX_FILE_SIZE) {
      return `Error: File too large (${(size / 1024 / 1024).toFixed(1)} MB) — max 10 MB. Use Bash with head/tail to read parts.`;
    }
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
