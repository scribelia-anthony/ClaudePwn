import { clearActiveSession, loadActiveSession } from '../../session/manager.js';
import { removeHost } from '../../utils/hosts.js';
import { log } from '../../utils/logger.js';

export function stopCommand(): void {
  const session = loadActiveSession();
  if (!session) {
    log.warn('Aucune session active');
    return;
  }

  removeHost(`${session.box.toLowerCase()}.htb`);
  clearActiveSession();
  log.ok(`Session ${session.box} arrêtée`);
}
