/**
 * BurnBot - Direct contract call dengan dual-source daily state check
 *
 * Burn amount: random 1–BURN_AMOUNT_MAX per tx (default max 7)
 *
 * Urutan cek burn hari ini:
 *   1. DailyCache (file lokal) - paling cepat & reliable
 *   2. BaseScan API v2/v1     - fallback jika cache kosong/baru
 *   3. getLogs (9500 blocks)  - fallback terakhir
 */

import { ethers } from 'ethers';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/helpers.js';
import { WalletManager } from '../utils/walletManager.js';
import { ERC20_ABI, SACRIFICE_SELECTOR } from '../config/abis.js';
import { DailyCache } from '../utils/dailyCache.js';

// Random integer between min and max (inclusive)
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class BurnBot {
  constructor(privateKey, proxy = null, walletLabel = 'Wallet') {
    this.walletManager = new WalletManager(privateKey, proxy);
    this.walletLabel   = walletLabel;
    this.wallet        = null;
    this.provider      = null;
    this.tokenContract = null;
    this.tokenDecimals = 18;
    this.tokenSymbol   = 'REKT';
  }

  async init() {
    this.wallet   = await this.walletManager.init();
    this.provider = this.walletManager.getProvider();

    this.tokenContract = new ethers.Contract(config.TOKEN_CONTRACT, ERC20_ABI, this.wallet);
    this.tokenDecimals = await this.tokenContract.decimals();
    this.tokenSymbol   = await this.tokenContract.symbol();

    const balance = await this.tokenContract.balanceOf(this.wallet.address);
    logger.info(`  Token   : ${ethers.formatUnits(balance, this.tokenDecimals)} ${this.tokenSymbol}`);
    return balance;
  }

  async hasEnoughTokens() {
    const balance = await this.tokenContract.balanceOf(this.wallet.address);
    const needed  = ethers.parseUnits('1', this.tokenDecimals); // minimum 1 token
    return balance >= needed;
  }

  async getDailyBurnCount() {
    const cached = DailyCache.getBurns(this.wallet.address);

    if (cached >= config.BURN_COUNT) {
      logger.info(`  [StateChecker] Cache: ${cached} burns today → target reached, skip`);
      return cached;
    }

    try {
      const chainCount = await this._getBurnCountFromBaseScan();
      if (chainCount !== null) {
        const synced = DailyCache.syncBurns(this.wallet.address, chainCount);
        logger.info(`  [StateChecker] Synced: cache=${cached}, chain=${chainCount} → using ${synced}`);
        return synced;
      }
    } catch (err) {
      logger.warn(`  [StateChecker] BaseScan sync failed: ${err.message}`);
    }

    try {
      const logsCount = await this._getBurnCountFromLogs(9500);
      if (logsCount !== null) {
        return DailyCache.syncBurns(this.wallet.address, logsCount);
      }
    } catch (err) {
      logger.warn(`  [StateChecker] getLogs fallback failed: ${err.message}`);
    }

    logger.info(`  [StateChecker] Using cache only: ${cached} burns today`);
    return cached;
  }

  async _getBurnCountFromBaseScan() {
    const now         = new Date();
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startTs     = Math.floor(utcMidnight.getTime() / 1000);
    const apiKey      = config.BASESCAN_API_KEY || '';

    const params = new URLSearchParams({
      chainid:         '8453',
      module:          'account',
      action:          'tokentx',
      address:         this.wallet.address,
      contractaddress: config.TOKEN_CONTRACT,
      startblock:      '0',
      endblock:        '99999999',
      sort:            'desc',
      offset:          '100',
      page:            '1',
      ...(apiKey && { apikey: apiKey }),
    });

    const endpoints = [
      `https://api.basescan.org/v2/api?${params}`,
      `https://api.basescan.org/api?${params}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res  = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
        const data = await res.json();

        if (data.status === '0' && data.message?.includes('No transactions')) return 0;
        if (data.status === '0') { logger.warn(`  [StateChecker] BaseScan: ${data.message?.slice(0, 60)}`); continue; }
        if (data.status !== '1' || !Array.isArray(data.result)) continue;

        const sacrificeAddr = config.SACRIFICE_CONTRACT.toLowerCase();
        const tokenAddr     = config.TOKEN_CONTRACT.toLowerCase();

        const burnsToday = data.result.filter(tx =>
          tx.from.toLowerCase()            === this.wallet.address.toLowerCase() &&
          tx.to.toLowerCase()              === sacrificeAddr &&
          tx.contractAddress.toLowerCase() === tokenAddr &&
          parseInt(tx.timeStamp)           >= startTs
        );

        logger.info(`  [StateChecker] BaseScan: ${burnsToday.length} burn(s) today`);
        return burnsToday.length;
      } catch (err) {
        logger.warn(`  [StateChecker] BaseScan endpoint error: ${err.message}`);
        continue;
      }
    }
    return null;
  }

  async _getBurnCountFromLogs(blockRange = 9500) {
    const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
    const currentBlock   = await this.provider.getBlockNumber();
    const fromBlock      = Math.max(0, currentBlock - blockRange);

    const logs = await this.provider.getLogs({
      address: config.TOKEN_CONTRACT,
      topics: [
        TRANSFER_TOPIC,
        ethers.zeroPadValue(this.wallet.address, 32),
        ethers.zeroPadValue(config.SACRIFICE_CONTRACT, 32),
      ],
      fromBlock,
      toBlock: 'latest',
    });

    const now         = new Date();
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startTs     = Math.floor(utcMidnight.getTime() / 1000);

    let count = 0;
    for (const log of logs) {
      try {
        const block = await this.provider.getBlock(log.blockNumber);
        if (block?.timestamp >= startTs) count++;
      } catch {}
    }

    logger.info(`  [StateChecker] getLogs: ${count} burn(s) in last ${blockRange} blocks`);
    return count;
  }

  async executeBurn() {
    return await withRetry(async () => {
      const maxAmount = parseInt(config.BURN_AMOUNT_MAX) || 7;

      // Check current balance to cap the random amount
      const balance    = await this.tokenContract.balanceOf(this.wallet.address);
      const balanceNum = parseFloat(ethers.formatUnits(balance, this.tokenDecimals));
      const cap        = Math.min(maxAmount, Math.floor(balanceNum));

      if (cap < 1) {
        throw new Error(`Insufficient ${this.tokenSymbol}: balance ${balanceNum.toFixed(2)}`);
      }

      // Pick random amount between 1 and cap
      const amount     = randInt(1, cap);
      const burnAmount = ethers.parseUnits(amount.toString(), this.tokenDecimals);

      logger.info(`  Burning ${amount} ${this.tokenSymbol} (random 1–${cap})`);

      await this._ensureAllowance(burnAmount);
      const receipt = await this._callSacrifice(burnAmount);

      DailyCache.addBurn(this.wallet.address);
      return receipt;
    }, config.MAX_RETRIES, config.RETRY_DELAY, `${this.walletLabel}:Burn`);
  }

  async _ensureAllowance(burnAmount) {
    const allowance = await this.tokenContract.allowance(this.wallet.address, config.SACRIFICE_CONTRACT);
    if (allowance >= burnAmount) return;

    logger.info(`  Approving ${this.tokenSymbol}...`);
    const tx = await this.tokenContract.approve(
      config.SACRIFICE_CONTRACT,
      ethers.MaxUint256,
      { gasLimit: config.GAS_LIMIT_APPROVE, gasPrice: await this.walletManager.getGasPrice() }
    );
    logger.info(`  Approve tx: ${tx.hash}`);
    await tx.wait();
    logger.info(`  Approved`);
  }

  async _callSacrifice(burnAmount) {
    const addrPadded = config.TOKEN_CONTRACT.toLowerCase().replace('0x', '').padStart(64, '0');
    const amountHex  = burnAmount.toString(16).padStart(64, '0');
    const calldata   = `${SACRIFICE_SELECTOR}${addrPadded}${amountHex}`;

    const tx = await this.wallet.sendTransaction({
      to:       config.SACRIFICE_CONTRACT,
      data:     calldata,
      gasLimit: config.GAS_LIMIT_BURN,
      gasPrice: await this.walletManager.getGasPrice(),
    });

    logger.info(`  Burn tx : ${tx.hash}`);
    logger.info(`  BaseScan: https://basescan.org/tx/${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt.status === 0) throw new Error(`Tx reverted: ${tx.hash}`);

    logger.info(`  Confirmed — block ${receipt.blockNumber} | gas ${receipt.gasUsed}`);
    return receipt;
  }

  async cleanup() {}
}