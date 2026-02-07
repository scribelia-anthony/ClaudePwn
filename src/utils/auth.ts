import { createHash, randomBytes } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';
import open from 'open';
import {
  OAUTH_CLIENT_ID,
  OAUTH_SCOPES,
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  saveOAuthTokens,
  loadOAuthTokens,
  getApiKey,
  type OAuthTokens,
} from '../config/index.js';
import { log } from './logger.js';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const API_KEY_FILE = join(homedir(), '.claudepwn', 'api-key');
const CREATE_KEY_URL = 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key';

// --- PKCE ---

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function generateState(): string {
  return randomBytes(16).toString('hex');
}

// --- Local callback server ---

function waitForCallback(port: number, expectedState: string): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timeout — pas de callback reçu en 5 minutes'));
    }, 300000);

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#111;color:#fff">
        <h1 style="color:#0f0">&#x2713; Authentification réussie</h1>
        <p>Vous pouvez fermer cet onglet.</p>
        <script>setTimeout(()=>window.close(),1500)</script>
      </body></html>`);

      clearTimeout(timeout);
      server.close();

      if (!code) {
        reject(new Error('Pas de code dans le callback'));
        return;
      }
      if (state !== expectedState) {
        reject(new Error('State mismatch'));
        return;
      }
      resolve({ code, state: state || '' });
    });

    server.listen(port, 'localhost');
    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Callback server: ${err.message}`));
    });
  });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, 'localhost', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not find free port')));
      }
    });
    server.on('error', reject);
  });
}

// --- OAuth token exchange ---

async function exchangeCode(code: string, state: string, redirectUri: string, verifier: string): Promise<OAuthTokens> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      state,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
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

// --- Create permanent API key from OAuth token ---

async function createApiKey(accessToken: string): Promise<string> {
  const response = await fetch(CREATE_KEY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API key creation failed (${response.status}): ${text}`);
  }

  const data = await response.json() as { raw_key: string };
  return data.raw_key;
}

// --- Saved API key ---

function saveApiKey(key: string): void {
  const dir = join(homedir(), '.claudepwn');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(API_KEY_FILE, key, { mode: 0o600 });
}

function loadSavedApiKey(): string | null {
  if (!existsSync(API_KEY_FILE)) return null;
  try {
    return readFileSync(API_KEY_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

// --- Public API ---

/**
 * Full login flow:
 * 1. OAuth PKCE → temporary access token
 * 2. Create permanent API key with that token
 * 3. Save API key to ~/.claudepwn/api-key
 */
export async function login(): Promise<string> {
  const { verifier, challenge } = generatePKCE();
  const state = generateState();

  const port = await findFreePort();
  const redirectUri = `http://localhost:${port}/callback`;

  const callbackPromise = waitForCallback(port, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${OAUTH_AUTHORIZE_URL}?${params}`;

  log.info('Ouverture du navigateur...');
  await open(authUrl);
  log.info('En attente de l\'autorisation...');

  const { code, state: returnedState } = await callbackPromise;

  log.info('Échange du token...');
  const oauthTokens = await exchangeCode(code, returnedState, redirectUri, verifier);

  log.info('Création de l\'API key...');
  const apiKey = await createApiKey(oauthTokens.access_token);

  saveApiKey(apiKey);
  // Also save OAuth tokens for potential refresh
  saveOAuthTokens(oauthTokens);

  log.ok('Authentifié ! API key sauvegardée.');
  return apiKey;
}

/**
 * Get a working API key. Priority:
 * 1. ANTHROPIC_API_KEY env var
 * 2. ~/.claudepwn/api-key (from OAuth login)
 */
export function getEffectiveApiKey(): string | null {
  return getApiKey() || loadSavedApiKey();
}

export function isAuthenticated(): boolean {
  return !!getEffectiveApiKey();
}
