import * as readline from 'readline';
import chalk from 'chalk';
import { createSession, loadHistory } from '../../session/manager.js';
import { addHost } from '../../utils/hosts.js';
import { AgentLoop } from '../../agent/loop.js';
import { setSharedReadline } from '../../agent/tools/ask-user.js';
import { log } from '../../utils/logger.js';

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

  // Start REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.red(`claudepwn/${box}> `),
  });

  setSharedReadline(rl);

  console.log(chalk.dim('\nTape une instruction pour l\'agent. "exit" pour quitter.\n'));
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

    try {
      // Pause readline while agent is running
      rl.pause();
      await agent.run(input);
    } catch (err: any) {
      log.error(`Erreur agent: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
