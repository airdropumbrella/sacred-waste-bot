/**
 * Sacred Waste Bot - Entry Point
 * Usage: npm start
 */

import { config } from './config/config.js';
import { WalletRunner } from './modules/walletRunner.js';
import { logger } from './utils/logger.js';

async function main() {
  const date = new Date().toISOString().split('T')[0];

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('  Sacred Waste Bot by Bores @AirdropUmbrellaX');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`  Date     : ${date}`);
  logger.info(`  Wallets  : ${config.WALLETS.length}`);
  logger.info(`  Burn     : ${config.ENABLE_BURN ? `${config.BURN_COUNT}x per wallet` : 'disabled'}`);
  logger.info(`  Vote     : ${config.ENABLE_VOTE ? `${config.VOTE_COUNT} votes per wallet` : 'disabled'}`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const runner = new WalletRunner();
  await runner.run();
}

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});