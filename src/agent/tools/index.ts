import type Anthropic from '@anthropic-ai/sdk';
import { execTool, executeExec } from './exec.js';
import { readFileTool, executeReadFile } from './read-file.js';
import { writeFileTool, executeWriteFile } from './write-file.js';
import { httpRequestTool, executeHttpRequest } from './http-request.js';
import { askUserTool, executeAskUser } from './ask-user.js';
import { log } from '../../utils/logger.js';

export function getAllTools(): Anthropic.Tool[] {
  return [execTool, readFileTool, writeFileTool, httpRequestTool, askUserTool];
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  boxDir: string | null,
): Promise<string> {
  log.tool(name, input);

  switch (name) {
    case 'Bash':
      return executeExec(input as any, boxDir);
    case 'Read':
      return executeReadFile(input as any);
    case 'Write':
      return executeWriteFile(input as any);
    case 'WebFetch':
      return executeHttpRequest(input as any);
    case 'AskUserQuestion':
      return executeAskUser(input as any);
    default:
      return `Unknown tool: ${name}`;
  }
}
