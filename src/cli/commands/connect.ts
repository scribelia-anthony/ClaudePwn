import { connectVPN, getVPNIP } from '../../utils/vpn.js';
import { log } from '../../utils/logger.js';

export async function connectCommand(ovpnFile?: string): Promise<void> {
  if (!ovpnFile) {
    // Check if already connected
    const ip = getVPNIP();
    if (ip) {
      log.ok(`VPN déjà connecté — IP: ${ip}`);
    } else {
      log.error('Usage: claudepwn connect <fichier.ovpn>');
    }
    return;
  }

  await connectVPN(ovpnFile);
}
