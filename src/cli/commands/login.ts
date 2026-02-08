import chalk from 'chalk';
import { login, isAuthenticated } from '../../utils/auth.js';
import { clearOAuthTokens } from '../../config/index.js';

export async function loginCommand(force = false): Promise<void> {
  if (!force && isAuthenticated()) {
    console.log(chalk.green('[+]') + ' Déjà authentifié. Utilise ' + chalk.yellow('claudepwn login --force') + ' pour changer de compte.');
    process.exit(0);
  }

  if (force) {
    clearOAuthTokens();
    console.log(chalk.blue('[*]') + ' Tokens supprimés, re-authentification...');
  }

  try {
    await login();
    console.log(chalk.green('[+]') + ' Authentifié !');
  } catch (err: any) {
    console.error(chalk.red('[-]') + ` Login échoué: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}
