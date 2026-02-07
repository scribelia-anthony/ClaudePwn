import * as readline from 'readline';
import chalk from 'chalk';
import { createSession, loadHistory } from '../../session/manager.js';
import { addHost } from '../../utils/hosts.js';
import { AgentLoop } from '../../agent/loop.js';
import { setSharedReadline } from '../../agent/tools/ask-user.js';
import { interruptCurrentExec } from '../../agent/tools/exec.js';
import { log } from '../../utils/logger.js';

// Completions for tab — common hacking actions + local commands
const COMPLETIONS = [
  // Local
  'help', 'exit', 'quit', '/ask', 'status',
  // Recon
  'scan la box', 'scan ports', 'scan udp', 'scan vulns',
  // Web
  'enum web', 'ffuf', 'gobuster', 'nikto', 'whatweb', 'wpscan',
  // Services
  'enum smb', 'enum ldap', 'enum dns', 'enum snmp', 'enum ftp',
  // Exploitation
  'searchsploit', 'exploit', 'reverse shell', 'sqlmap', 'hydra',
  // Post-exploit
  'privesc', 'linpeas', 'winpeas', 'bloodhound',
  // Actions
  'cherche un exploit', 'télécharge', 'upload', 'crack',
  'montre les notes', 'résumé', 'prochaine étape',
];

function completer(line: string): [string[], string] {
  const hits = COMPLETIONS.filter(c => c.startsWith(line.toLowerCase()));
  return [hits.length ? hits : COMPLETIONS, line];
}

export async function startCommand(box: string, ip: string): Promise<void> {
  log.banner();
  log.info(`Démarrage de la session : ${box} (${ip})`);

  // Create session workspace
  const session = createSession(box, ip);
  log.ok(`Workspace créé : ${session.boxDir}/`);

  // Add to /etc/hosts
  addHost(ip, `${box.toLowerCase()}.htb`);

  // Load history if exists
  const history = loadHistory(session.boxDir);
  if (history.length > 0) {
    log.ok(`Session précédente chargée (${history.length} messages)`);
  }

  // Create agent loop
  const agent = new AgentLoop(box, ip, session.boxDir, history);

  // Start REPL with tab completion
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.red(`claudepwn/${box}> `),
    completer,
  });

  setSharedReadline(rl);

  // Task queue — agent tasks run in background, new inputs get queued
  let activeTasks = 0;
  const queue: string[] = [];

  function showPrompt() {
    if (activeTasks > 0) {
      rl.setPrompt(chalk.red(`claudepwn/${box}`) + chalk.dim(` [${activeTasks} running]`) + chalk.red('> '));
    } else {
      rl.setPrompt(chalk.red(`claudepwn/${box}> `));
    }
    rl.prompt();
  }

  async function runTask(input: string) {
    activeTasks++;
    try {
      await agent.run(input);
    } catch (err: any) {
      log.error(`Erreur agent: ${err.message}`);
    }
    activeTasks--;

    // Process queue
    if (queue.length > 0) {
      const next = queue.shift()!;
      if (next === '__EXIT__') {
        log.info('Session sauvegardée. À plus.');
        rl.close();
        process.exit(0);
      }
      console.log(chalk.dim(`\n[queue] → ${next}`));
      runTask(next); // don't await — stays non-blocking
    }

    // Re-show prompt when all tasks done
    if (activeTasks === 0) {
      console.log(''); // newline after agent output
      showPrompt();
    }
  }

  // Ctrl+C interrupts running command, second Ctrl+C exits
  process.on('SIGINT', () => {
    if (activeTasks > 0 && interruptCurrentExec()) {
      console.log(chalk.yellow('\n[!] Commande interrompue'));
      return;
    }
    log.info('Session sauvegardée. À plus.');
    process.exit(0);
  });

  console.log(chalk.dim('\nTape une instruction pour l\'agent. Tab pour compléter, "help" pour l\'aide.'));
  console.log(chalk.dim('L\'agent travaille en arrière-plan — tu peux taper pendant qu\'il tourne.\n'));
  showPrompt();

  rl.on('line', (line: string) => {
    const input = line.trim();

    if (!input) {
      showPrompt();
      return;
    }

    if (input === 'exit' || input === 'quit') {
      if (activeTasks > 0) {
        log.warn(`${activeTasks} tâche(s) en cours. Ctrl+C pour interrompre ou retape "exit".`);
        if (queue.length === 0) {
          queue.push('__EXIT__');
        }
        showPrompt();
        return;
      }
      log.info('Session sauvegardée. À plus.');
      rl.close();
      process.exit(0);
    }

    // Local commands — no AI call
    if (input === 'help' || input === '?') {
      console.log(chalk.bold('\n  Commandes locales :\n'));
      console.log(chalk.white('  help, ?         ') + chalk.dim('Cette aide'));
      console.log(chalk.white('  status          ') + chalk.dim('Nombre de tâches en cours'));
      console.log(chalk.white('  exit, quit      ') + chalk.dim('Quitter (session sauvegardée)'));
      console.log(chalk.bold('\n  Raccourcis IA :\n'));
      console.log(chalk.white('  scan la box     ') + chalk.dim('Recon complète (nmap → searchsploit → enum)'));
      console.log(chalk.white('  enum web        ') + chalk.dim('Énumération web (whatweb, ffuf, nikto)'));
      console.log(chalk.white('  enum smb        ') + chalk.dim('Énumération SMB (smbclient, enum4linux)'));
      console.log(chalk.white('  privesc         ') + chalk.dim('Escalade de privilèges (linpeas, enumération)'));
      console.log(chalk.white('  /ask            ') + chalk.dim('Analyse détaillée + prochaines étapes'));
      console.log(chalk.bold('\n  L\'agent tourne en fond — tu peux taper pendant qu\'il travaille.'));
      console.log(chalk.dim('  Tab = autocomplétion, Ctrl+C = interrompre scan en cours.\n'));
      showPrompt();
      return;
    }

    if (input === 'status') {
      if (activeTasks > 0) {
        log.info(`${activeTasks} tâche(s) en cours, ${queue.length} en attente.`);
      } else {
        log.ok('Aucune tâche en cours.');
      }
      showPrompt();
      return;
    }

    // Launch agent task in background — don't block the REPL
    if (activeTasks > 0) {
      // Agent busy — queue it
      queue.push(input);
      log.info(`En file d'attente (${queue.length} en attente). L'agent est occupé.`);
      showPrompt();
    } else {
      // Start immediately
      runTask(input);
      showPrompt();
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
