import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Box, Text, Static, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { createSession, loadHistory } from '../../session/manager.js';
import { addHost } from '../../utils/hosts.js';
import Anthropic from '@anthropic-ai/sdk';
import { AgentLoop } from '../../agent/loop.js';
import { interruptCurrentExec } from '../../agent/tools/exec.js';
import { log, lastShortcuts } from '../../utils/logger.js';
import { outputEmitter, type OutputLine } from '../../utils/output.js';
import { emitLine } from '../../utils/output.js';
import { statusEmitter } from '../../utils/status.js';

// Tab completions
const COMPLETIONS = [
  'help', 'exit', 'quit', '/ask', 'status', 'browse',
  'scan box', 'scan ports', 'scan udp', 'scan vulns',
  'enum web', 'inspect', 'enum ftp', 'enum smb', 'enum dns', 'enum vhosts', 'enum ldap', 'enum snmp', 'enum users',
  'exploit search', 'exploit sqli', 'exploit lfi', 'exploit upload',
  'shell ssh', 'shell reverse', 'shell upgrade',
  'crack hash', 'crack ssh', 'crack web',
  'privesc linux', 'privesc windows',
  'loot user', 'loot root', 'loot creds',
];

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function showHelp(): void {
  emitLine(chalk.bold('\n  Commandes locales :\n'));
  emitLine(chalk.white('  help, ?          ') + chalk.dim('Cette aide'));
  emitLine(chalk.white('  status           ') + chalk.dim('Nombre de tâches en cours'));
  emitLine(chalk.white('  browse /path     ') + chalk.dim('Ouvrir URL dans Chrome'));
  emitLine(chalk.white('  1, 2, 3          ') + chalk.dim('Exécuter une étape proposée'));
  emitLine(chalk.white('  exit, quit       ') + chalk.dim('Quitter (session sauvegardée)'));
  emitLine(chalk.bold('\n  Scan :\n'));
  emitLine(chalk.white('  scan box         ') + chalk.dim('Recon complète (ports + versions + exploits)'));
  emitLine(chalk.white('  scan ports       ') + chalk.dim('Scan ports rapide'));
  emitLine(chalk.white('  scan udp         ') + chalk.dim('Top 200 ports UDP'));
  emitLine(chalk.white('  scan vulns       ') + chalk.dim('Scripts vulnérabilités nmap'));
  emitLine(chalk.bold('\n  Enum :\n'));
  emitLine(chalk.white('  enum web [/path] ') + chalk.dim('Fuzzing web (dirs + extensions)'));
  emitLine(chalk.white('  inspect /path    ') + chalk.dim('Lecture rapide d\'une URL'));
  emitLine(chalk.white('  enum ftp         ') + chalk.dim('Test login anonyme FTP'));
  emitLine(chalk.white('  enum smb         ') + chalk.dim('Shares SMB (smbclient, enum4linux)'));
  emitLine(chalk.white('  enum dns         ') + chalk.dim('Zone transfer'));
  emitLine(chalk.white('  enum vhosts      ') + chalk.dim('Virtual hosts fuzzing'));
  emitLine(chalk.white('  enum ldap        ') + chalk.dim('Dump LDAP'));
  emitLine(chalk.white('  enum snmp        ') + chalk.dim('Community strings SNMP'));
  emitLine(chalk.white('  enum users       ') + chalk.dim('Énumération utilisateurs'));
  emitLine(chalk.bold('\n  Exploit :\n'));
  emitLine(chalk.white('  exploit search   ') + chalk.dim('Chercher exploits (searchsploit)'));
  emitLine(chalk.white('  exploit <cve>    ') + chalk.dim('Exploit spécifique'));
  emitLine(chalk.white('  exploit sqli     ') + chalk.dim('SQL injection (sqlmap)'));
  emitLine(chalk.white('  exploit lfi      ') + chalk.dim('LFI + wrappers PHP'));
  emitLine(chalk.white('  exploit upload   ') + chalk.dim('Upload webshell/reverse shell'));
  emitLine(chalk.bold('\n  Shell :\n'));
  emitLine(chalk.white('  shell ssh <user> ') + chalk.dim('Connexion SSH'));
  emitLine(chalk.white('  shell reverse    ') + chalk.dim('Écouter un reverse shell (nc)'));
  emitLine(chalk.white('  shell upgrade    ') + chalk.dim('Upgrade vers shell interactif'));
  emitLine(chalk.bold('\n  Crack / Privesc / Loot :\n'));
  emitLine(chalk.white('  crack hash       ') + chalk.dim('Crack hash (john/hashcat)'));
  emitLine(chalk.white('  crack ssh <user> ') + chalk.dim('Brute force SSH (hydra)'));
  emitLine(chalk.white('  crack web <url>  ') + chalk.dim('Brute force formulaire web'));
  emitLine(chalk.white('  privesc linux    ') + chalk.dim('Escalade de privilèges Linux'));
  emitLine(chalk.white('  privesc windows  ') + chalk.dim('Escalade de privilèges Windows'));
  emitLine(chalk.white('  loot user/root   ') + chalk.dim('Récupérer les flags'));
  emitLine(chalk.white('  loot creds       ') + chalk.dim('Dump credentials'));
  emitLine(chalk.white('  /ask             ') + chalk.dim('Analyse détaillée + prochaines étapes'));
  emitLine(chalk.bold('\n  L\'agent tourne en fond — tu peux taper pendant qu\'il travaille.'));
  emitLine(chalk.dim('  Tab = autocomplétion, Ctrl+C = interrompre.\n'));
}

function StatusLine() {
  const [status, setStatusState] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);

  // Listen for status changes
  useEffect(() => {
    const handler = (text: string | null) => setStatusState(text);
    statusEmitter.on('change', handler);
    return () => { statusEmitter.off('change', handler); };
  }, []);

  // Spinner animation — always runs, no dependency on status text
  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);

  // Always render the Box (never return null — avoids Ink layout remount issues)
  if (!status) return <Box height={0} />;
  return (
    <Box>
      <Text color="green" bold>■</Text>
      <Text color="gray"> {SPINNER_FRAMES[frame]} </Text>
      <Text color="gray">{status}</Text>
    </Box>
  );
}

interface PromptProps {
  box: string;
  ip: string;
  agent: AgentLoop;
  historyLen: number;
  boxDir: string;
  hostUp: boolean;
}

function Prompt({ box, ip, agent, historyLen, boxDir, hostUp }: PromptProps) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(0);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const runningRef = useRef(0);
  const exitPendingRef = useRef(false);
  const { exit } = useApp();

  // Listen for output events and add to Static items
  useEffect(() => {
    const handler = (line: OutputLine) => {
      setLines(prev => {
        const next = [...prev, line];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    };
    outputEmitter.on('line', handler);
    return () => { outputEmitter.off('line', handler); };
  }, []);

  // Show banner on mount
  useEffect(() => {
    log.banner();
    log.info(`Démarrage de la session : ${box} (${ip})`);
    log.ok(`Workspace : ${boxDir}/`);
    if (historyLen > 0) {
      log.ok(`Session précédente chargée (${historyLen} messages)`);
    }
    if (hostUp) {
      log.ok(`Host ${ip} est up`);
    } else {
      log.warn(`Host ${ip} ne répond pas au ping — box expirée ou VPN coupé ?`);
    }
    showHelp();
  }, []);

  const runTask = useCallback(async (text: string) => {
    runningRef.current++;
    setRunning(runningRef.current);
    try {
      await agent.run(text);
    } catch (err: any) {
      log.error(`Erreur agent: ${err.message}`);
    }
    runningRef.current--;

    // Check for pending exit
    if (exitPendingRef.current) {
      log.info('Session sauvegardée. À plus.');
      exit();
      return;
    }

    setRunning(runningRef.current);
  }, [agent, exit]);

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    setInput('');
    if (!trimmed) return;

    // Echo the command
    emitLine(chalk.red(`claudepwn/${box}> `) + trimmed);

    if (trimmed === 'exit' || trimmed === 'quit') {
      if (runningRef.current > 0) {
        log.warn('Attente de la fin de la tâche en cours...');
        exitPendingRef.current = true;
        return;
      }
      log.info('Session sauvegardée. À plus.');
      exit();
      return;
    }

    if (trimmed === 'help' || trimmed === '?') {
      showHelp();
      return;
    }

    if (trimmed === 'status') {
      if (runningRef.current > 0) {
        log.info('Agent en cours');
      } else {
        log.ok('Aucune tâche en cours.');
      }
      return;
    }

    // Numeric shortcuts: "1", "2", "3" → execute last suggested command
    if (/^[1-9]$/.test(trimmed)) {
      const idx = parseInt(trimmed) - 1;
      const cmd = lastShortcuts[idx];
      if (cmd) {
        emitLine(chalk.dim(`  → ${cmd}`));
        // Re-submit as if user typed the command
        if (runningRef.current > 0) {
          agent.injectMessage(cmd);
          log.info('Reçu — l\'agent verra ton message après la commande en cours.');
        } else {
          runTask(cmd);
        }
        return;
      }
      log.warn(`Pas de commande #${trimmed} disponible.`);
      return;
    }

    if (trimmed === 'browse' || trimmed.startsWith('browse ')) {
      const path = trimmed.slice(6).trim() || '/';
      const domain = box.toLowerCase() + '.htb';
      const url = `http://${domain}${path.startsWith('/') ? path : '/' + path}`;
      try {
        const cmd = process.platform === 'darwin'
          ? `open -a "Google Chrome" "${url}"`
          : `xdg-open "${url}"`;
        execSync(cmd, { stdio: 'ignore' });
        log.ok(`Ouvert : ${url}`);
      } catch {
        log.error(`Impossible d'ouvrir ${url}`);
      }
      return;
    }

    // Agent task
    if (runningRef.current > 0) {
      // Inject into ongoing conversation — agent sees it at next API call
      agent.injectMessage(trimmed);
      log.info('Reçu — l\'agent verra ton message après la commande en cours.');
    } else {
      runTask(trimmed);
    }
  }, [box, runTask, exit]);

  // Ctrl+C + Tab
  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (runningRef.current > 0 && interruptCurrentExec()) {
        log.warn('Commande interrompue');
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
        emitLine(chalk.dim(matches.join('  ')));
      }
    }
  });

  return (
    <>
      <Static items={lines}>
        {(line) => (
          <Text key={line.id}>{line.text}</Text>
        )}
      </Static>
      <StatusLine />
      <Box>
        <Text color="red">{`claudepwn/${box}`}</Text>
        {running > 0 && <Text dimColor>{` [${running} running]`}</Text>}
        <Text color="red">{`> `}</Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>
    </>
  );
}

function checkHost(ip: string): boolean {
  // TCP probe on common ports — ICMP ping is often blocked on HTB boxes
  for (const port of [80, 443, 22, 21]) {
    try {
      execSync(`nc -z -w 2 ${ip} ${port}`, { stdio: 'ignore' });
      return true;
    } catch {
      // port closed or filtered, try next
    }
  }
  return false;
}

export async function startCommand(box: string, ip: string): Promise<void> {
  // Setup session (no output before Ink starts)
  const session = createSession(box, ip);
  addHost(ip, `${box.toLowerCase()}.htb`);
  const hostUp = checkHost(ip);
  if (!hostUp) {
    console.error(`\x1b[33m[!] Host ${ip} ne répond pas — mode offline (analyse des anciens scans)\x1b[0m`);
  }
  const history = loadHistory(session.boxDir) as Anthropic.MessageParam[];
  const agent = new AgentLoop(box, ip, session.boxDir, history);

  // Start Ink — ALL output goes through <Static> from here
  const { waitUntilExit } = render(
    <Prompt
      box={box}
      ip={ip}
      agent={agent}
      historyLen={history.length}
      boxDir={session.boxDir}
      hostUp={hostUp}
    />,
    { exitOnCtrlC: false },
  );

  await waitUntilExit();
  process.exit(0);
}
