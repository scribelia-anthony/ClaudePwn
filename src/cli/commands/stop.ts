import chalk from 'chalk';
import { clearActiveSession, loadActiveSession } from '../../session/manager.js';
import { removeHost } from '../../utils/hosts.js';

export function stopCommand(): void {
  const session = loadActiveSession();
  if (!session) {
    console.log(chalk.yellow('[!]') + ' Aucune session active');
    return;
  }

  removeHost(`${session.box.toLowerCase()}.htb`);
  clearActiveSession();
  console.log(chalk.green('[+]') + ` Session ${session.box} arrêtée`);
}
