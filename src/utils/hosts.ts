import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { log } from './logger.js';

export function addHost(ip: string, hostname: string): void {
  const hosts = readFileSync('/etc/hosts', 'utf-8');
  if (hosts.includes(hostname)) {
    log.warn(`${hostname} déjà dans /etc/hosts`);
    return;
  }
  try {
    execSync(`echo "${ip} ${hostname}" | sudo tee -a /etc/hosts > /dev/null`, { stdio: 'inherit' });
    log.ok(`Ajouté ${ip} ${hostname} à /etc/hosts`);
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
