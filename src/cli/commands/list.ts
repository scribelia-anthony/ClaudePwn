import chalk from 'chalk';
import { listBoxes } from '../../session/manager.js';

export function listCommand(): void {
  const boxes = listBoxes();

  if (boxes.length === 0) {
    console.log(chalk.blue('[*]') + ' Aucune box. Lance `claudepwn start <box> <ip>` pour commencer.');
    return;
  }

  console.log(chalk.bold('\n  Boxes:\n'));
  for (const b of boxes) {
    const status = b.active ? chalk.green(' [ACTIVE]') : '';
    console.log(`  ${chalk.white(b.box.padEnd(20))} ${chalk.dim(b.ip)}${status}`);
  }
  console.log();
}
