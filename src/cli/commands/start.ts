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
  'help', 'exit', 'quit', '/ask',
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

  // Ctrl+C interrupts running command, second Ctrl+C exits
  let agentRunning = false;
  process.on('SIGINT', () => {
    if (agentRunning && interruptCurrentExec()) {
      console.log(chalk.yellow('\n[!] Commande interrompue'));
      return;
    }
    log.info('Session sauvegardée. À plus.');
    process.exit(0);
  });

  console.log(chalk.dim('\nTape une instruction pour l\'agent. Tab pour compléter, "help" pour l\'aide.\n'));
  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === 'exit' || input === 'quit') {
      log.info('Session sauvegardée. À plus.');
      rl.close();
      process.exit(0);
    }

    // Local commands — no AI call
    if (input === 'help' || input === '?') {
      console.log(chalk.bold('\n  Commandes locales :\n'));
      console.log(chalk.white('  help, ?         ') + chalk.dim('Cette aide'));
      console.log(chalk.white('  exit, quit      ') + chalk.dim('Quitter (session sauvegardée)'));
      console.log(chalk.bold('\n  Raccourcis IA :\n'));
      console.log(chalk.white('  scan la box     ') + chalk.dim('Recon complète (nmap → searchsploit → enum)'));
      console.log(chalk.white('  enum web        ') + chalk.dim('Énumération web (whatweb, ffuf, nikto)'));
      console.log(chalk.white('  enum smb        ') + chalk.dim('Énumération SMB (smbclient, enum4linux)'));
      console.log(chalk.white('  privesc         ') + chalk.dim('Escalade de privilèges (linpeas, enumération)'));
      console.log(chalk.white('  /ask            ') + chalk.dim('Analyse détaillée + prochaines étapes'));
      console.log(chalk.bold('\n  Tout le reste est envoyé tel quel à l\'IA.'));
      console.log(chalk.dim('  Tab pour autocompléter.\n'));
      rl.prompt();
      return;
    }

    try {
      rl.pause();
      agentRunning = true;
      await agent.run(input);
      agentRunning = false;
    } catch (err: any) {
      agentRunning = false;
      log.error(`Erreur agent: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
