import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { log } from './logger.js';

function validateHostInput(ip: string, hostname: string): void {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    throw new Error(`IP invalide : ${ip}`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(hostname)) {
    throw new Error(`Hostname invalide : ${hostname}`);
  }
}

function flushDNS(): void {
  try {
    if (process.platform === 'darwin') {
      execSync('sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder', { stdio: 'ignore' });
    }
  } catch {
    // Non-critical — ignore
  }
}

export function addHost(ip: string, hostname: string): void {
  validateHostInput(ip, hostname);
  const hosts = readFileSync('/etc/hosts', 'utf-8');
  const existingLine = hosts.split('\n').find(l => l.includes(hostname));
  if (existingLine) {
    if (existingLine.trim().startsWith(ip)) return; // Already correct
    // IP changed — remove old entry and re-add
    console.log(`[*] Mise à jour de /etc/hosts : ${hostname} → ${ip} (sudo requis)`);
    try {
      execSync(`sudo sed -i '' '/${hostname}/d' /etc/hosts`, { stdio: 'inherit' });
      execSync(`echo "${ip} ${hostname}" | sudo tee -a /etc/hosts > /dev/null`, { stdio: 'inherit' });
      flushDNS();
    } catch {
      console.log(`[!] Impossible de modifier /etc/hosts`);
    }
    return;
  }
  // New entry
  console.log(`[*] Ajout de ${ip} ${hostname} à /etc/hosts (sudo requis)`);
  try {
    execSync(`echo "${ip} ${hostname}" | sudo tee -a /etc/hosts > /dev/null`, { stdio: 'inherit' });
    flushDNS();
  } catch {
    console.log(`[!] Impossible d'ajouter à /etc/hosts`);
  }
}

export function removeHost(hostname: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(hostname)) {
    log.warn(`Hostname invalide : ${hostname}`);
    return;
  }
  try {
    execSync(`sudo sed -i '' '/${hostname}/d' /etc/hosts`, { stdio: 'inherit' });
    log.ok(`Supprimé ${hostname} de /etc/hosts`);
  } catch {
    log.warn(`Impossible de modifier /etc/hosts`);
  }
}
