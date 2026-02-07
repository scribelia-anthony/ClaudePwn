import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG_DIR = join(homedir(), '.claudepwn');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const TOKEN_FILE = join(CONFIG_DIR, 'oauth-token.json');

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface Config {
  model: string;
  maxTokens: number;
  execTimeout: number;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): Config {
  let fileConfig: Record<string, unknown> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    } catch { /* ignore */ }
  }

  return {
    model: (process.env.CLAUDEPWN_MODEL as string) || (fileConfig.model as string) || 'claude-opus-4-6',
    maxTokens: parseInt(process.env.CLAUDEPWN_MAX_TOKENS || '') || (fileConfig.maxTokens as number) || 16384,
    execTimeout: parseInt(process.env.CLAUDEPWN_EXEC_TIMEOUT || '') || (fileConfig.execTimeout as number) || 300000,
  };
}

export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export function saveOAuthTokens(tokens: OAuthTokens): void {
  ensureConfigDir();
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

export function loadOAuthTokens(): OAuthTokens | null {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function clearOAuthTokens(): void {
  if (existsSync(TOKEN_FILE)) {
    unlinkSync(TOKEN_FILE);
  }
}

export const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
export const OAUTH_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
export const OAUTH_SCOPES = 'org:create_api_key user:profile user:inference';
export const OAUTH_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
export const OAUTH_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';

export const BOXES_DIR = 'boxes';
export const ACTIVE_FILE = '.claudepwn-active';
