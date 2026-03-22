/**
 * Scheduler - daily cron runner for multi-wallet bot
 */

import cron from 'node-cron';
import { logger } from './utils/logger.js';

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 9 * * *';

async function startScheduler() {
  logger.info('═══════════════════════════════════════════════════');
  logger.info('    Sacred Waste Bot v3 - Scheduler               ');
  logger.info('═══════════════════════════════════════════════════');
  logger.info(`Schedule : "${CRON_SCHEDULE}"`);
  logger.info('Press Ctrl+C to stop\n');

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error(`Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}"`);
    process.exit(1);
  }

  const task = cron.schedule(CRON_SCHEDULE, async () => {
    logger.info(`\n⏰ Scheduled trigger at ${new Date().toISOString()}`);
    try {
      const { config }       = await import('./config/config.js');
      const { WalletRunner } = await import('./modules/walletRunner.js');
      const runner = new WalletRunner();
      await runner.run();
      logger.info('✅ Scheduled run complete!\n');
    } catch (err) {
      logger.error(`Scheduled run error: ${err.message}`);
    }
  });

  task.start();
  logger.info('Scheduler running. Waiting for next trigger...\n');

  process.on('SIGINT', () => {
    logger.info('Stopping scheduler...');
    task.stop();
    process.exit(0);
  });
}

startScheduler().catch(err => {
  console.error('Scheduler failed:', err);
  process.exit(1);
});
