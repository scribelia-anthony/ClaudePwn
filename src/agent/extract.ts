import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { log } from '../utils/logger.js';

type Message = Anthropic.MessageParam;

export interface Findings {
  ports: Array<{ port: string; service: string; version: string }>;
  urls: string[];
  credentials: Array<{ user: string; password: string; source: string }>;
  flags: Array<{ type: 'user' | 'root'; value: string }>;
  usernames: string[];
}

/** Noise URLs to ignore */
const IGNORED_URL_PATTERNS = [
  'nmap.org',
  'github.com/RustScan',
  'github.com/nmap',
  'insecure.org',
  'cve.mitre.org',
  'exploit-db.com/docs',
  'w3.org',
  'schemas.xmlsoap.org',
  'mozilla.org',
  'wikipedia.org',
];

/** System users to ignore from /etc/passwd extraction */
const SYSTEM_USERS = new Set([
  'root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man', 'lp', 'mail',
  'news', 'uucp', 'proxy', 'www-data', 'backup', 'list', 'irc', 'gnats',
  'nobody', 'systemd-network', 'systemd-resolve', 'syslog', 'messagebus',
  'uuidd', 'dnsmasq', 'sshd', 'pollinate', 'landscape', '_apt', 'postfix',
  'colord', 'geoclue', 'gnome-initial-setup', 'hplip', 'pulse', 'rtkit',
  'saned', 'speech-dispatcher', 'avahi', 'cups-pk-helper', 'kernoops',
  'whoopsie', 'gdm', 'sssd', 'systemd-timesync', 'systemd-coredump',
  'tss', 'fwupd-refresh', 'tcpdump', '_laurel',
]);

/** Extract all text content from messages */
function extractText(messages: Message[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
      continue;
    }

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block && typeof (block as any).text === 'string') {
          parts.push((block as any).text);
        }
        if (block.type === 'tool_result') {
          const content = (block as any).content;
          if (typeof content === 'string') {
            parts.push(content);
          } else if (Array.isArray(content)) {
            for (const c of content) {
              if (typeof c === 'string') parts.push(c);
              else if (c && typeof c.text === 'string') parts.push(c.text);
            }
          }
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * Scan recent messages for pentest findings using regex patterns.
 */
export function extractFindings(messages: Message[]): Findings {
  const text = extractText(messages);
  const findings: Findings = {
    ports: [],
    urls: [],
    credentials: [],
    flags: [],
    usernames: [],
  };

  // --- Ports TCP ---
  const tcpRegex = /(\d+)\/tcp\s+open\s+(\S+)\s*(.*)/g;
  let match;
  while ((match = tcpRegex.exec(text)) !== null) {
    findings.ports.push({
      port: `${match[1]}/tcp`,
      service: match[2],
      version: match[3].trim(),
    });
  }

  // --- Ports UDP ---
  const udpRegex = /(\d+)\/udp\s+open\s+(\S+)\s*(.*)/g;
  while ((match = udpRegex.exec(text)) !== null) {
    findings.ports.push({
      port: `${match[1]}/udp`,
      service: match[2],
      version: match[3].trim(),
    });
  }

  // --- URLs ---
  const urlRegex = /https?:\/\/[^\s"'<>\])}]+/g;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const isNoise = IGNORED_URL_PATTERNS.some((p) => url.includes(p));
    if (!isNoise && !findings.urls.includes(url)) {
      findings.urls.push(url);
    }
  }

  // --- Flags HTB (32 hex chars) ---
  const flagRegex = /\b([0-9a-f]{32})\b/gi;
  while ((match = flagRegex.exec(text)) !== null) {
    const value = match[1];
    // Check context ±200 chars to determine user/root
    const start = Math.max(0, match.index - 200);
    const end = Math.min(text.length, match.index + 200);
    const context = text.slice(start, end).toLowerCase();

    let type: 'user' | 'root' = 'user';
    if (context.includes('root.txt') || context.includes('/root/') || context.includes('root flag')) {
      type = 'root';
    }

    // Avoid duplicates
    if (!findings.flags.some((f) => f.value === value)) {
      findings.flags.push({ type, value });
    }
  }

  // --- Users from /etc/passwd ---
  const passwdRegex = /^([a-z_][a-z0-9_-]*):x:\d+:\d+:/gm;
  while ((match = passwdRegex.exec(text)) !== null) {
    const user = match[1];
    if (!SYSTEM_USERS.has(user) && !findings.usernames.includes(user)) {
      findings.usernames.push(user);
    }
  }

  // --- Passwords ---
  const passRegex = /(?:password|passwd|pass|pwd)\s*[:=]\s*(\S+)/gi;
  while ((match = passRegex.exec(text)) !== null) {
    const password = match[1];
    // Try to find associated username in nearby context
    const start = Math.max(0, match.index - 200);
    const context = text.slice(start, match.index);
    const userMatch = context.match(/(?:user(?:name)?|login|account)\s*[:=]\s*(\S+)/i);
    const user = userMatch ? userMatch[1] : '?';

    if (!findings.credentials.some((c) => c.password === password)) {
      findings.credentials.push({ user, password, source: 'auto-extract' });
    }
  }

  return findings;
}

/**
 * Merge extracted findings into the box's notes.md file.
 * Only adds new entries — never removes existing content.
 */
export function updateNotes(boxDir: string, findings: Findings): void {
  const notesPath = join(boxDir, 'notes.md');
  if (!existsSync(notesPath)) return;

  const hasFindings =
    findings.ports.length > 0 ||
    findings.urls.length > 0 ||
    findings.credentials.length > 0 ||
    findings.flags.length > 0 ||
    findings.usernames.length > 0;

  if (!hasFindings) return;

  let content = readFileSync(notesPath, 'utf-8');
  let modified = false;

  // --- Ports: add missing rows to the table ---
  for (const port of findings.ports) {
    // Check if port already in notes
    if (content.includes(port.port)) continue;

    // Find the ports table and add a row after the header separator
    const tableHeaderRegex = /(\| Port\s*\| Service\s*\| Version\s*\|\n\|[-\s|]+\|)/;
    const tableMatch = content.match(tableHeaderRegex);
    if (tableMatch) {
      const insertPos = content.indexOf(tableMatch[0]) + tableMatch[0].length;
      const newRow = `\n| ${port.port} | ${port.service} | ${port.version} |`;
      content = content.slice(0, insertPos) + newRow + content.slice(insertPos);
      modified = true;
    }
  }

  // --- URLs: add under ## Web ---
  for (const url of findings.urls) {
    if (content.includes(url)) continue;

    const webSectionRegex = /## Web\n/;
    const webMatch = content.match(webSectionRegex);
    if (webMatch) {
      const insertPos = content.indexOf(webMatch[0]) + webMatch[0].length;
      const newLine = `- ${url}\n`;
      content = content.slice(0, insertPos) + newLine + content.slice(insertPos);
      modified = true;
    }
  }

  // --- Credentials: add missing rows to the credentials table ---
  for (const cred of findings.credentials) {
    if (content.includes(cred.password)) continue;

    const credTableRegex = /(\| User\s*\| Password\/Hash\s*\| Source\s*\| Accès\s*\|\n\|[-\s|]+\|)/;
    const credMatch = content.match(credTableRegex);
    if (credMatch) {
      const insertPos = content.indexOf(credMatch[0]) + credMatch[0].length;
      const newRow = `\n| ${cred.user} | ${cred.password} | ${cred.source} | ? |`;
      content = content.slice(0, insertPos) + newRow + content.slice(insertPos);
      modified = true;
    }
  }

  // --- Flags: replace empty flag lines ---
  for (const flag of findings.flags) {
    if (content.includes(flag.value)) continue;

    if (flag.type === 'user') {
      const userFlagRegex = /- User :\s*$/m;
      if (userFlagRegex.test(content)) {
        content = content.replace(userFlagRegex, `- User : ${flag.value}`);
        modified = true;
      }
    } else {
      const rootFlagRegex = /- Root :\s*$/m;
      if (rootFlagRegex.test(content)) {
        content = content.replace(rootFlagRegex, `- Root : ${flag.value}`);
        modified = true;
      }
    }
  }

  // --- Usernames: add under ## Notes ---
  for (const user of findings.usernames) {
    if (content.includes(user)) continue;

    const notesSectionRegex = /## Notes\n/;
    const notesMatch = content.match(notesSectionRegex);
    if (notesMatch) {
      const insertPos = content.indexOf(notesMatch[0]) + notesMatch[0].length;
      const newLine = `- User système: ${user}\n`;
      content = content.slice(0, insertPos) + newLine + content.slice(insertPos);
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(notesPath, content);
    log.info('Notes mises à jour automatiquement');
  }
}
