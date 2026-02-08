import chalk from 'chalk';
import { connectVPN, getVPNIP } from '../../utils/vpn.js';

export async function connectCommand(ovpnFile?: string): Promise<void> {
  if (!ovpnFile) {
    // Check if already connected
    const ip = getVPNIP();
    if (ip) {
      console.log(chalk.green('[+]') + ` VPN déjà connecté — IP: ${ip}`);
    } else {
      console.error(chalk.red('[-]') + ' Usage: claudepwn connect <fichier.ovpn>');
    }
    return;
  }

  await connectVPN(ovpnFile);
}
