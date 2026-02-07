import { login, isAuthenticated } from '../../utils/auth.js';
import { log } from '../../utils/logger.js';

export async function loginCommand(): Promise<void> {
  if (isAuthenticated()) {
    log.ok('Déjà authentifié.');
    process.exit(0);
  }

  await login();
  process.exit(0);
}
