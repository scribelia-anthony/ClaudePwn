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

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function generateState(): string {
  return randomBytes(16).toString('hex');
}

/** Start a local HTTP server and wait for the OAuth callback */
function waitForCallback(port: number, expectedState: string): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      // Send success page to browser
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><body style="font-family:system-ui;text-align:center;padding:60px;background:#111;color:#fff">
          <h1 style="color:#0f0">&#x2713; Authentification réussie</h1>
          <p>Vous pouvez fermer cet onglet et retourner au terminal.</p>
          <script>setTimeout(()=>window.close(),2000)</script>
        </body></html>
      `);

      server.close();

      if (!code) {
        reject(new Error('Pas de code dans le callback'));
        return;
      }

      if (state !== expectedState) {
        reject(new Error('State mismatch — possible CSRF'));
        return;
      }

      resolve({ code, state });
    });

    // Bind to localhost
    server.listen(port, 'localhost', () => {
      log.info(`Serveur callback en écoute sur http://localhost:${port}/callback`);
    });

    server.on('error', (err) => {
      reject(new Error(`Callback server error: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Timeout — pas de callback reçu en 5 minutes'));
    }, 300000);
  });
}

/** Find a free port */
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

async function exchangeCode(code: string, redirectUri: string, verifier: string): Promise<OAuthTokens> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
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

  // Find a free port for the callback server
  const port = await findFreePort();
  const redirectUri = `http://localhost:${port}/callback`;

  // Start callback server BEFORE opening browser
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

  log.info('Ouverture du navigateur pour l\'authentification...');
  await open(authUrl);
  log.info('En attente de l\'autorisation dans le navigateur...');

  // Wait for the callback
  const { code } = await callbackPromise;

  // Exchange code for tokens
  const tokens = await exchangeCode(code, redirectUri, verifier);
  saveOAuthTokens(tokens);
  log.ok('Authentification réussie !');
  return tokens;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = getApiKey();
  if (apiKey) {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  }

  let tokens = loadOAuthTokens();
  if (!tokens) {
    log.warn('Pas de token OAuth. Lancez `claudepwn login` d\'abord.');
    tokens = await login();
  }

  // Refresh if expiring within 5 min
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
