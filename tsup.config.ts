import { defineConfig } from 'tsup';
import { writeFileSync, readFileSync, chmodSync } from 'fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  onSuccess: async () => {
    // Add shebang as the very first line
    const file = 'dist/index.js';
    const content = readFileSync(file, 'utf-8');
    writeFileSync(file, '#!/usr/bin/env node\n' + content);
    chmodSync(file, 0o755);
  },
});
