import { spawn, execSync } from 'child_process';
import { log } from './logger.js';

export function connectVPN(ovpnFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    log.info(`Connexion VPN avec ${ovpnFile}...`);
    const proc = spawn('sudo', ['openvpn', '--config', ovpnFile, '--daemon', '--log', '/tmp/claudepwn-vpn.log'], {
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Wait for tun interface
        let attempts = 0;
        const check = setInterval(() => {
          const ip = getVPNIP();
          if (ip) {
            clearInterval(check);
            log.ok(`VPN connecté — IP: ${ip}`);
            resolve();
          } else if (++attempts > 15) {
            clearInterval(check);
            log.warn('VPN lancé mais pas de tun interface détectée');
            resolve();
          }
        }, 1000);
      } else {
        reject(new Error(`openvpn exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      log.error(`Erreur VPN: ${err.message}`);
      reject(err);
    });
  });
}

export function disconnectVPN(): void {
  try {
    execSync('sudo killall openvpn 2>/dev/null', { stdio: 'pipe' });
    log.ok('VPN déconnecté');
  } catch {
    log.warn('Pas de processus openvpn trouvé');
  }
}

export function getVPNIP(): string | null {
  try {
    // macOS uses utun, Linux uses tun0
    const output = execSync("ifconfig 2>/dev/null | grep -A1 'utun\\|tun0' | grep 'inet ' | awk '{print $2}' | head -1", {
      encoding: 'utf-8',
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}
