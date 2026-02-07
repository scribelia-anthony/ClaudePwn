import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Box, Text, Static, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { createSession, loadHistory } from '../../session/manager.js';
import { addHost } from '../../utils/hosts.js';
import { AgentLoop } from '../../agent/loop.js';
import { interruptCurrentExec } from '../../agent/tools/exec.js';
import { log } from '../../utils/logger.js';
import { outputEmitter, type OutputLine } from '../../utils/output.js';
import { emitLine } from '../../utils/output.js';
import { statusEmitter } from '../../utils/status.js';

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

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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
      setLines(prev => [...prev, line]);
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
    emitLine(chalk.dim('\nTape une instruction. Tab pour compléter, "help" pour l\'aide.'));
    emitLine(chalk.dim('L\'agent travaille en arrière-plan — tu peux taper pendant qu\'il tourne.\n'));
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
      emitLine(chalk.bold('\n  Commandes locales :\n'));
      emitLine(chalk.white('  help, ?         ') + chalk.dim('Cette aide'));
      emitLine(chalk.white('  status          ') + chalk.dim('Nombre de tâches en cours'));
      emitLine(chalk.white('  exit, quit      ') + chalk.dim('Quitter (session sauvegardée)'));
      emitLine(chalk.bold('\n  Raccourcis IA :\n'));
      emitLine(chalk.white('  scan la box     ') + chalk.dim('Recon complète (nmap → searchsploit → enum)'));
      emitLine(chalk.white('  enum web        ') + chalk.dim('Énumération web (whatweb, ffuf, nikto)'));
      emitLine(chalk.white('  enum smb        ') + chalk.dim('Énumération SMB (smbclient, enum4linux)'));
      emitLine(chalk.white('  privesc         ') + chalk.dim('Escalade de privilèges (linpeas, enumération)'));
      emitLine(chalk.white('  /ask            ') + chalk.dim('Analyse détaillée + prochaines étapes'));
      emitLine(chalk.bold('\n  L\'agent tourne en fond — tu peux taper pendant qu\'il travaille.'));
      emitLine(chalk.dim('  Tab = autocomplétion, Ctrl+C = interrompre scan en cours.\n'));
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
  try {
    execSync(`ping -c 1 -W 2 ${ip}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function startCommand(box: string, ip: string): Promise<void> {
  // Setup session (no output before Ink starts)
  const session = createSession(box, ip);
  addHost(ip, `${box.toLowerCase()}.htb`);
  const hostUp = checkHost(ip);
  const history = loadHistory(session.boxDir);
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
