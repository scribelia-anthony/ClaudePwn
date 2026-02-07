import { EventEmitter } from 'events';

export const statusEmitter = new EventEmitter();

let currentStatus: string | null = null;

export function setStatus(text: string | null) {
  currentStatus = text;
  statusEmitter.emit('change', text);
}

export function getStatus(): string | null {
  return currentStatus;
}
