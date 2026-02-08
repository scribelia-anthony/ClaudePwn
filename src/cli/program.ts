import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { connectCommand } from './commands/connect.js';
import { stopCommand } from './commands/stop.js';
import { listCommand } from './commands/list.js';
import { loginCommand } from './commands/login.js';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('claudepwn')
    .description('Framework de hacking autonome propulsé par Claude')
    .version('1.0.0');

  program
    .command('start <box> <ip>')
    .description('Démarrer une session de hacking sur une box')
    .action(async (box: string, ip: string) => {
      await startCommand(box, ip);
    });

  program
    .command('connect [ovpn]')
    .description('Connecter le VPN (fichier .ovpn)')
    .action(async (ovpn?: string) => {
      await connectCommand(ovpn);
    });

  program
    .command('stop')
    .description('Arrêter la session active')
    .action(() => {
      stopCommand();
    });

  program
    .command('list')
    .alias('ls')
    .description('Lister toutes les boxes')
    .action(() => {
      listCommand();
    });

  program
    .command('login')
    .description('Authentification OAuth avec Claude')
    .option('-f, --force', 'Forcer re-authentification (changer de compte)')
    .action(async (opts: { force?: boolean }) => {
      await loginCommand(!!opts.force);
    });

  return program;
}
