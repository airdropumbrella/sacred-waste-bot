/**
 * WalletRunner - orchestrates burn + vote per wallet
 */

import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { sleep, randomDelay } from '../utils/helpers.js';
import { proxyDisplay } from '../utils/proxyManager.js';
import { BurnBot } from './burnBot.js';
import { VoteBot } from './voteBot.js';

export class WalletRunner {
  constructor() {
    this.wallets = [...config.WALLETS];
    this.results = [];
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async run() {
    const wallets = config.SHUFFLE_WALLETS ? this._shuffle(this.wallets) : this.wallets;

    logger.info(`Processing ${wallets.length} wallet(s)${config.SHUFFLE_WALLETS ? ' (shuffled)' : ''}\n`);

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];

      logger.info(`${'─'.repeat(52)}`);
      logger.info(`  [${i + 1}/${wallets.length}] ${wallet.label}  |  proxy: ${proxyDisplay(wallet.proxy)}`);
      logger.info(`${'─'.repeat(52)}`);

      const result = await this._runWallet(wallet);
      this.results.push(result);

      if (i < wallets.length - 1) {
        const delay = randomDelay(config.WALLET_DELAY_MIN, config.WALLET_DELAY_MAX);
        logger.info(`\n  Next wallet in ${Math.round(delay / 1000)}s...\n`);
        await sleep(delay);
      }
    }

    this._printSummary();
    return this.results;
  }

  async _runWallet(walletDef) {
    const result = {
      label:      walletDef.label,
      address:    null,
      proxy:      proxyDisplay(walletDef.proxy),
      skipped:    false,
      skipReason: null,
      burns:      { success: 0, failed: 0, skipped: 0 },
      votes:      { success: 0, failed: 0 },
      errors:     [],
    };

    // ── BURN ───────────────────────────────────────────────────
    if (config.ENABLE_BURN) {
      const burnBot = new BurnBot(walletDef.privateKey, walletDef.proxy, walletDef.label);
      try {
        await burnBot.init();
        result.address = burnBot.walletManager.getAddress();

        if (!(await burnBot.hasEnoughTokens())) {
          result.skipped    = true;
          result.skipReason = `Insufficient ${config.BURN_AMOUNT} REKT`;
          logger.warn(`  Skipping wallet: ${result.skipReason}`);
          await burnBot.cleanup();
          return result;
        }

        const burnsToday = await burnBot.getDailyBurnCount();
        const burnsLeft  = Math.max(0, config.BURN_COUNT - burnsToday);

        if (burnsLeft <= 0) {
          logger.info(`  Burn: already completed (${burnsToday}/${config.BURN_COUNT}) — skipping`);
          result.burns.skipped = burnsToday;
        } else {
          logger.info(`  Burn: ${burnsToday} done, ${burnsLeft} remaining`);
          for (let i = 1; i <= burnsLeft; i++) {
            try {
              await burnBot.executeBurn();
              result.burns.success++;
              logger.info(`  Burn [${i}/${burnsLeft}] ✓`);
            } catch (err) {
              result.burns.failed++;
              result.errors.push(`Burn ${i}: ${err.message}`);
              logger.error(`  Burn [${i}/${burnsLeft}] failed: ${err.message}`);
            }
            if (i < burnsLeft) {
              await sleep(randomDelay(config.BURN_DELAY_MIN, config.BURN_DELAY_MAX));
            }
          }
        }

        await burnBot.cleanup();
      } catch (err) {
        result.errors.push(`BurnBot: ${err.message}`);
        logger.error(`  BurnBot error: ${err.message}`);
      }
    }

    // ── VOTE ───────────────────────────────────────────────────
    if (config.ENABLE_VOTE) {
      const voteBot = new VoteBot(
        walletDef.proxy,
        walletDef.label,
        walletDef.privateKey,
        walletDef.swToken || null,
      );
      try {
        await voteBot.init();
        const voteResult = await voteBot.runVotingSession();
        result.votes.success = voteResult.success;
        result.votes.failed  = voteResult.failed;
        await voteBot.cleanup();
      } catch (err) {
        result.errors.push(`VoteBot: ${err.message}`);
        logger.error(`  VoteBot error: ${err.message}`);
      }
    }

    return result;
  }

  _printSummary() {
    const line   = '━'.repeat(52);
    const totals = { burns: { success: 0, failed: 0, skipped: 0 }, votes: { success: 0, failed: 0 }, skipped: 0 };

    logger.info(`\n${line}`);
    logger.info('  SUMMARY');
    logger.info(line);

    for (const r of this.results) {
      const addr = r.address ? r.address.slice(0, 10) + '...' : 'unknown';
      if (r.skipped) {
        logger.warn(`  ${r.label} (${addr}) — skipped: ${r.skipReason}`);
        totals.skipped++;
      } else {
        logger.info(`  ${r.label} (${addr})`);
        logger.info(`    Burn  : +${r.burns.success} new  |  ${r.burns.skipped} already done  |  ${r.burns.failed} failed`);
        logger.info(`    Vote  : +${r.votes.success} new  |  ${r.votes.failed} failed`);
        if (r.errors.length) logger.warn(`    Errors: ${r.errors.slice(0, 2).join(' | ')}`);
        totals.burns.success += r.burns.success;
        totals.burns.failed  += r.burns.failed;
        totals.burns.skipped += r.burns.skipped;
        totals.votes.success += r.votes.success;
        totals.votes.failed  += r.votes.failed;
      }
    }

    logger.info(line);
    logger.info(`  Wallets : ${this.results.length} total  |  ${totals.skipped} skipped`);
    logger.info(`  Burns   : +${totals.burns.success} new  |  ${totals.burns.skipped} already done  |  ${totals.burns.failed} failed`);
    logger.info(`  Votes   : +${totals.votes.success} new  |  ${totals.votes.failed} failed`);
    logger.info(`${line}\n`);
  }
}