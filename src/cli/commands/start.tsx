import React, { useState, useCallback, useRef } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import { createSession, loadHistory } from '../../session/manager.js';
import { addHost } from '../../utils/hosts.js';
import { AgentLoop } from '../../agent/loop.js';
import { interruptCurrentExec } from '../../agent/tools/exec.js';
import { log } from '../../utils/logger.js';

// Tab completions
const COMPLETIONS = [
  'help', 'exit', 'quit', '/ask', 'status',
  'scan la box', 'scan ports', 'scan udp', 'scan vulns',
  'enum web', 'ffuf', 'gobuster', 'nikto', 'whatweb', 'wpscan',
  'enum smb', 'enum ldap', 'enum dns', 'enum snmp', 'enum ftp',
  'searchsploit', 'exploit', 'reverse shell', 'sqlmap', 'hydra',
  'privesc', 'linpeas', 'winpeas', 'bloodhound',
  'cherche un exploit', 'télécharge', 'upload', 'crack',
  'montre les notes', 'résumé', 'prochaine étape',
];

function Prompt({ box, agent }: { box: string; agent: AgentLoop }) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(0);
  const runningRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const { exit } = useApp();

  const runTask = useCallback(async (text: string) => {
    runningRef.current++;
    setRunning(runningRef.current);
    try {
      await agent.run(text);
    } catch (err: any) {
      log.error(`Erreur agent: ${err.message}`);
    }
    runningRef.current--;

    // Process queue
    if (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      if (next === '__EXIT__') {
        log.info('Session sauvegardée. À plus.');
        exit();
        return;
      }
      console.log(chalk.dim(`\n[queue] → ${next}`));
      runTask(next);
      return;
    }

    setRunning(runningRef.current);
  }, [agent, exit]);

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    setInput('');
    if (!trimmed) return;

    // Echo the command like a real terminal
    console.log(chalk.red(`claudepwn/${box}> `) + trimmed);

    if (trimmed === 'exit' || trimmed === 'quit') {
      if (runningRef.current > 0) {
        log.warn(`${runningRef.current} tâche(s) en cours. Ctrl+C pour interrompre ou retape "exit".`);
        if (!queueRef.current.includes('__EXIT__')) {
          queueRef.current.push('__EXIT__');
        }
        return;
      }
      log.info('Session sauvegardée. À plus.');
      exit();
      return;
    }

    if (trimmed === 'help' || trimmed === '?') {
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
      return;
    }

    if (trimmed === 'status') {
      if (runningRef.current > 0) {
        log.info(`${runningRef.current} tâche(s) en cours, ${queueRef.current.length} en attente.`);
      } else {
        log.ok('Aucune tâche en cours.');
      }
      return;
    }

    // Agent task
    if (runningRef.current > 0) {
      queueRef.current.push(trimmed);
      log.info(`En file d'attente (${queueRef.current.length} en attente). L'agent est occupé.`);
    } else {
      runTask(trimmed);
    }
  }, [box, runTask, exit]);

  // Ctrl+C + Tab
  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (runningRef.current > 0 && interruptCurrentExec()) {
        console.log(chalk.yellow('\n[!] Commande interrompue'));
        return;
      }
      log.info('Session sauvegardée. À plus.');
      exit();
    }
    if (key.tab) {
      const matches = COMPLETIONS.filter(c => c.startsWith(input.toLowerCase()));
      if (matches.length === 1) {
        setInput(matches[0]);
      } else if (matches.length > 1) {
        console.log(chalk.dim(matches.join('  ')));
      }
    }
  });

  return (
    <Box>
      <Text color="red">{`claudepwn/${box}`}</Text>
      {running > 0 && <Text dimColor>{` [${running} running]`}</Text>}
      <Text color="red">{`> `}</Text>
      <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
    </Box>
  );
}

export async function startCommand(box: string, ip: string): Promise<void> {
  log.banner();
  log.info(`Démarrage de la session : ${box} (${ip})`);

  const session = createSession(box, ip);
  log.ok(`Workspace créé : ${session.boxDir}/`);

  addHost(ip, `${box.toLowerCase()}.htb`);

  const history = loadHistory(session.boxDir);
  if (history.length > 0) {
    log.ok(`Session précédente chargée (${history.length} messages)`);
  }

  const agent = new AgentLoop(box, ip, session.boxDir, history);

  console.log(chalk.dim('\nTape une instruction pour l\'agent. Tab pour compléter, "help" pour l\'aide.'));
  console.log(chalk.dim('L\'agent travaille en arrière-plan — tu peux taper pendant qu\'il tourne.\n'));

  const { waitUntilExit } = render(
    <Prompt box={box} agent={agent} />,
    { exitOnCtrlC: false },
  );

  await waitUntilExit();
  process.exit(0);
}
