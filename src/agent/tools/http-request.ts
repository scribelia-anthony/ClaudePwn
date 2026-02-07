import type Anthropic from '@anthropic-ai/sdk';

export const httpRequestTool: Anthropic.Tool = {
  name: 'WebFetch',
  description: 'Make an HTTP request. Useful for testing web endpoints, downloading files, interacting with APIs, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'The URL to request',
      },
      method: {
        type: 'string',
        description: 'HTTP method (default: GET)',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      },
      headers: {
        type: 'object',
        description: 'Request headers as key-value pairs',
      },
      body: {
        type: 'string',
        description: 'Request body (for POST/PUT/PATCH)',
      },
    },
    required: ['url'],
  },
};

export async function executeHttpRequest(input: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<string> {
  const { url, method = 'GET', headers = {}, body } = input;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(30000),
    });

    const responseHeaders = Object.fromEntries(response.headers.entries());
    let responseBody = await response.text();

    // Truncate body if too long
    if (responseBody.length > 20000) {
      responseBody = responseBody.slice(0, 20000) + '\n\n[... truncated ...]';
    }

    return [
      `Status: ${response.status} ${response.statusText}`,
      `Headers: ${JSON.stringify(responseHeaders, null, 2)}`,
      `\nBody:\n${responseBody}`,
    ].join('\n');
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
