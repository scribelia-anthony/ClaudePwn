import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { log } from './logger.js';

export function addHost(ip: string, hostname: string): void {
  const hosts = readFileSync('/etc/hosts', 'utf-8');
  const existingLine = hosts.split('\n').find(l => l.includes(hostname));
  if (existingLine) {
    // Check if IP matches
    if (existingLine.trim().startsWith(ip)) return; // Already correct
    // IP changed — remove old entry first
    try {
      execSync(`sudo sed -i '' '/${hostname}/d' /etc/hosts`, { stdio: 'ignore' });
    } catch { /* ignore */ }
  }
  try {
    execSync(`echo "${ip} ${hostname}" | sudo tee -a /etc/hosts > /dev/null`, { stdio: 'ignore' });
  } catch {
    log.warn(`Impossible d'ajouter à /etc/hosts (sudo requis)`);
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
