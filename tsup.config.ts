import { defineConfig } from 'tsup';
import { writeFileSync, readFileSync, chmodSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const DIST_FILE = 'dist/index.js';
const BIN_NAME = 'claudepwn';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  onSuccess: async () => {
    // Add shebang as the very first line
    const content = readFileSync(DIST_FILE, 'utf-8');
    writeFileSync(DIST_FILE, '#!/usr/bin/env -S node --disable-warning=DEP0040\n' + content);
    chmodSync(DIST_FILE, 0o755);

    // Ensure the global symlink points to THIS build
    const expected = resolve(DIST_FILE);
    try {
      const binPath = execSync(`which ${BIN_NAME} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (binPath) {
        let current: string | null = null;
        try { current = readlinkSync(binPath); } catch {}
        if (current !== expected) {
          try {
            unlinkSync(binPath);
            symlinkSync(expected, binPath);
            console.log(`  ✓ Symlink updated: ${binPath} → ${expected}`);
          } catch {
            console.log(`  ⚠ Symlink stale: ${binPath} → ${current}`);
            console.log(`    Run: sudo ln -sf "${expected}" "${binPath}"`);
          }
        }
      }
    } catch {
      // claudepwn not in PATH yet — npm link will handle it
    }
  },
});
