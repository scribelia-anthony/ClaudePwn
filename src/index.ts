// Suppress punycode deprecation warning from Anthropic SDK
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'DeprecationWarning' && w.message.includes('punycode')) return;
  console.warn(w);
});

import { buildProgram } from './cli/program.js';

buildProgram().parseAsync();
