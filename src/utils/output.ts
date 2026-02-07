import { EventEmitter } from 'events';

/**
 * Global output channel. All log/exec/agent output goes through here.
 * The Ink UI listens for 'line' events and renders them via <Static>.
 */
export const outputEmitter = new EventEmitter();
outputEmitter.setMaxListeners(100);

let lineId = 0;

export interface OutputLine {
  id: number;
  text: string;
}

/**
 * Emit a line of output to the Ink UI.
 * This is the ONLY way to write visible output — do not use console.log directly.
 */
export function emitLine(text: string) {
  outputEmitter.emit('line', { id: lineId++, text } as OutputLine);
}
