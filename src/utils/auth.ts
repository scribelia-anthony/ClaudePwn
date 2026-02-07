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
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }

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

      if (!code) { reject(new Error('Pas de code dans le callback')); return; }
      if (state !== expectedState) { reject(new Error('State mismatch')); return; }
      resolve({ code, state: state || '' });
    });

    server.listen(port, 'localhost');
    server.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, 'localhost', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        server.close(() => resolve(addr.port));
      } else {
        server.close(() => reject(new Error('No port')));
      }
    });
    server.on('error', reject);
  });
}

// --- Token exchange & refresh ---

async function exchangeCode(code: string, state: string, redirectUri: string, verifier: string): Promise<OAuthTokens> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code, state,
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

export async function refreshTokens(): Promise<OAuthTokens> {
  const tokens = loadOAuthTokens();
  if (!tokens) throw new Error('No tokens to refresh');

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: OAUTH_CLIENT_ID,
    }),
  });
  if (!response.ok) throw new Error(`Token refresh failed (${response.status})`);

  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  const newTokens: OAuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveOAuthTokens(newTokens);
  return newTokens;
}

// --- Public API ---

export async function login(): Promise<OAuthTokens> {
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

  log.info('Ouverture du navigateur...');
  await open(`${OAUTH_AUTHORIZE_URL}?${params}`);
  log.info('En attente de l\'autorisation...');

  const { code, state: returnedState } = await callbackPromise;
  const tokens = await exchangeCode(code, returnedState, redirectUri, verifier);
  saveOAuthTokens(tokens);
  log.ok('Authentifié !');
  return tokens;
}

/**
 * Get a valid access token (refreshing if needed).
 * Returns null if API key is set (use that instead).
 */
export async function getValidAccessToken(): Promise<string | null> {
  // API key takes priority
  if (getApiKey()) return null;

  let tokens = loadOAuthTokens();
  if (!tokens) return null;

  // Refresh if expiring in < 5 min
  if (Date.now() > tokens.expires_at - 300000) {
    try {
      tokens = await refreshTokens();
    } catch {
      return null;
    }
  }
  return tokens.access_token;
}

export function isAuthenticated(): boolean {
  return !!(getApiKey() || loadOAuthTokens());
}
