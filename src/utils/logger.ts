import chalk from 'chalk';
import { emitLine } from './output.js';

/**
 * Last numbered shortcuts extracted from agent output.
 * Prompt reads these to allow "1", "2", "3" as input shortcuts.
 */
export let lastShortcuts: string[] = [];

/**
 * Render markdown text to styled terminal output using chalk.
 * Handles: headers, bold, inline code, tables, lists, horizontal rules.
 */
function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableAligns: string[] = [];

  function flushTable() {
    if (tableRows.length === 0) return;
    // Calculate column widths
    const colCount = Math.max(...tableRows.map(r => r.length));
    const widths: number[] = Array(colCount).fill(0);
    for (const row of tableRows) {
      for (let i = 0; i < row.length; i++) {
        widths[i] = Math.max(widths[i], row[i].length);
      }
    }

    const hLine = chalk.dim('  ┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐');
    const mLine = chalk.dim('  ├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤');
    const bLine = chalk.dim('  └' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘');

    out.push(hLine);
    for (let r = 0; r < tableRows.length; r++) {
      const row = tableRows[r];
      const cells = widths.map((w, i) => {
        const val = (row[i] || '').padEnd(w);
        return r === 0 ? chalk.bold.cyan(val) : inlineStyle(val);
      });
      out.push(chalk.dim('  │') + cells.map(c => ` ${c} `).join(chalk.dim('│')) + chalk.dim('│'));
      if (r === 0) out.push(mLine);
      else if (r < tableRows.length - 1) out.push(mLine);
    }
    out.push(bLine);
    tableRows = [];
    tableAligns = [];
  }

  /** Apply inline styles: **bold**, `code`, *italic* */
  function inlineStyle(s: string): string {
    // Bold + code: **`text`**
    s = s.replace(/\*\*`([^`]+)`\*\*/g, (_, c) => chalk.bold.yellow(c));
    // Bold
    s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => chalk.bold(b));
    // Inline code
    s = s.replace(/`([^`]+)`/g, (_, c) => chalk.yellow(c));
    // Italic
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, i) => chalk.italic(i));
    return s;
  }

  for (const line of lines) {
    // Table row
    if (/^\s*\|/.test(line) && /\|\s*$/.test(line)) {
      // Separator row (|---|---|)
      if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) {
        inTable = true;
        continue;
      }
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      tableRows.push(cells);
      inTable = true;
      continue;
    }

    // End of table
    if (inTable) {
      flushTable();
      inTable = false;
    }

    // Horizontal rule
    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      out.push(chalk.dim('  ' + '─'.repeat(60)));
      continue;
    }

    // Headers
    const h1 = line.match(/^# (.+)/);
    if (h1) { out.push(''); out.push(chalk.bold.cyan.underline(h1[1])); out.push(''); continue; }

    const h2 = line.match(/^## (.+)/);
    if (h2) { out.push(''); out.push(chalk.bold.cyan(h2[1])); continue; }

    const h3 = line.match(/^### (.+)/);
    if (h3) { out.push(chalk.cyan(h3[1])); continue; }

    // Numbered list
    const numList = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (numList) {
      out.push(`${numList[1]}  ${chalk.dim(numList[2] + '.')} ${inlineStyle(numList[3])}`);
      continue;
    }

    // Bullet list
    const bullet = line.match(/^(\s*)[-*]\s+(.+)/);
    if (bullet) {
      out.push(`${bullet[1]}  ${chalk.dim('•')} ${inlineStyle(bullet[2])}`);
      continue;
    }

    // Regular text
    out.push(inlineStyle(line));
  }

  // Flush any remaining table
  if (inTable) flushTable();

  return out.join('\n');
}

export const log = {
  info(msg: string) {
    emitLine(chalk.blue('[*]') + ' ' + msg);
  },

  ok(msg: string) {
    emitLine(chalk.green('[+]') + ' ' + msg);
  },

  warn(msg: string) {
    emitLine(chalk.yellow('[!]') + ' ' + msg);
  },

  error(msg: string) {
    emitLine(chalk.red('[-]') + ' ' + msg);
  },

  elapsed(elapsed: string) {
    emitLine(chalk.dim('  ✓ ') + chalk.green.dim(elapsed));
  },

  result(text: string) {
    emitLine(chalk.gray(text));
  },

  toolOutput(line: string) {
    emitLine(chalk.dim('  │ ') + chalk.dim(line));
  },

  tool(name: string, input: Record<string, unknown>) {
    const summary = name === 'Bash'
      ? (input.command as string)
      : name === 'Read'
        ? `Read: ${input.file_path}`
        : name === 'Write'
          ? `Write: ${input.file_path}`
          : name === 'WebFetch'
            ? `${input.method || 'GET'} ${input.url}`
            : name === 'AskUserQuestion'
              ? `${input.question}`
              : JSON.stringify(input).slice(0, 80);
    emitLine(chalk.green('  ▸ ') + chalk.white(summary));
  },

  assistant(text: string) {
    // Extract numbered shortcuts (e.g. "1. exploit search nibbleblog — desc")
    const shortcuts: string[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(\d+)\.\s+(.+?)\s+—/);
      if (m) {
        const idx = parseInt(m[1]);
        shortcuts[idx - 1] = m[2].trim();
      }
    }
    if (shortcuts.filter(Boolean).length > 0) {
      lastShortcuts = shortcuts;
    }

    const rendered = renderMarkdown(text).trimEnd();
    for (const line of rendered.split('\n')) {
      emitLine(line);
    }
  },

  banner() {
    const banner = chalk.red.bold(`
   _____ _                 _      _____
  / ____| |               | |    |  __ \\
 | |    | | __ _ _   _  __| | ___| |__) |_      ___ __
 | |    | |/ _\` | | | |/ _\` |/ _ \\  ___/\\ \\ /\\ / / '_ \\
 | |____| | (_| | |_| | (_| |  __/ |     \\ V  V /| | | |
  \\_____|_|\\__,_|\\__,_|\\__,_|\\___|_|      \\_/\\_/ |_| |_|
`);
    for (const line of banner.split('\n')) {
      emitLine(line);
    }
    emitLine(chalk.dim('  Framework de hacking autonome propulsé par Claude'));
    emitLine('');
  },
};
