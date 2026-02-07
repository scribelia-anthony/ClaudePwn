import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { log } from './logger.js';

export function addHost(ip: string, hostname: string): void {
  const hosts = readFileSync('/etc/hosts', 'utf-8');
  const existingLine = hosts.split('\n').find(l => l.includes(hostname));
  if (existingLine) {
    if (existingLine.trim().startsWith(ip)) return; // Already correct
    // IP changed — remove old entry and re-add
    console.log(`[*] Mise à jour de /etc/hosts : ${hostname} → ${ip} (sudo requis)`);
    try {
      execSync(`sudo sed -i '' '/${hostname}/d' /etc/hosts`, { stdio: 'inherit' });
      execSync(`echo "${ip} ${hostname}" | sudo tee -a /etc/hosts > /dev/null`, { stdio: 'inherit' });
    } catch {
      console.log(`[!] Impossible de modifier /etc/hosts`);
    }
    return;
  }
  // New entry
  console.log(`[*] Ajout de ${ip} ${hostname} à /etc/hosts (sudo requis)`);
  try {
    execSync(`echo "${ip} ${hostname}" | sudo tee -a /etc/hosts > /dev/null`, { stdio: 'inherit' });
  } catch {
    console.log(`[!] Impossible d'ajouter à /etc/hosts`);
  }
}

export function removeHost(hostname: string): void {
  try {
    execSync(`sudo sed -i '' '/${hostname}/d' /etc/hosts`, { stdio: 'inherit' });
    log.ok(`Supprimé ${hostname} de /etc/hosts`);
  } catch {
    log.warn(`Impossible de modifier /etc/hosts`);
  }
}
