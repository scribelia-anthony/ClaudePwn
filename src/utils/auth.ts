import { createHash, randomBytes } from 'crypto';
import { createServer } from 'http';
import open from 'open';
import {
  OAUTH_CLIENT_ID,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  saveOAuthTokens,
  loadOAuthTokens,
  getApiKey,
  type OAuthTokens,
} from '../config/index.js';
import { log } from './logger.js';
import * as readline from 'readline';

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function generateState(): string {
  return randomBytes(16).toString('hex');
}

async function exchangeCode(code: string, verifier: string): Promise<OAuthTokens> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

async function refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: OAUTH_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status})`);
  }

  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  const newTokens: OAuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveOAuthTokens(newTokens);
  return newTokens;
}

export async function login(): Promise<OAuthTokens> {
  const { verifier, challenge } = generatePKCE();
  const state = generateState();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: OAUTH_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${OAUTH_AUTHORIZE_URL}?${params}`;

  log.info('Ouverture du navigateur pour l\'authentification...');
  log.info('Si le navigateur ne s\'ouvre pas, copiez ce lien :');
  console.log(`\n  ${authUrl}\n`);

  await open(authUrl);

  log.info('Après authentification, collez le code (format: code#state) :');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const response = await new Promise<string>((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  // Parse code#state format
  const parts = response.split('#');
  const code = parts[0];
  const returnedState = parts[1];

  if (returnedState && returnedState !== state) {
    throw new Error('State mismatch — possible CSRF attack');
  }

  const tokens = await exchangeCode(code, verifier);
  saveOAuthTokens(tokens);
  log.ok('Authentification réussie !');
  return tokens;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  // Priority: API key > OAuth token
  const apiKey = getApiKey();
  if (apiKey) {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  }

  let tokens = loadOAuthTokens();
  if (!tokens) {
    log.warn('Pas de token OAuth. Lancez `claudepwn login` d\'abord.');
    tokens = await login();
  }

  // Refresh if expired (with 5min buffer)
  if (Date.now() > tokens.expires_at - 300000) {
    try {
      tokens = await refreshToken(tokens);
    } catch {
      log.warn('Refresh token expiré, re-authentification nécessaire');
      tokens = await login();
    }
  }

  return {
    Authorization: `Bearer ${tokens.access_token}`,
    'anthropic-version': '2023-06-01',
  };
}

export function isAuthenticated(): boolean {
  return !!(getApiKey() || loadOAuthTokens());
}
