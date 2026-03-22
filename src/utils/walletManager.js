/**
 * Wallet Manager - with proxy support and RPC fallback
 */

import { ethers } from 'ethers';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { toEthersAgent, proxyDisplay } from '../utils/proxyManager.js';

// Fallback RPC list if primary fails
const RPC_FALLBACKS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base-rpc.publicnode.com',
  'https://1rpc.io/base',
];

export class WalletManager {
  constructor(privateKey, proxy = null) {
    if (!privateKey) throw new Error('WalletManager requires a privateKey');
    this.privateKey = privateKey;
    this.proxy      = proxy;
    this.provider   = null;
    this.wallet     = null;
  }

  async init() {
    const fetchFunc = await this._buildFetchWithProxy();

    // Build RPC list: primary first, then fallbacks (dedup)
    const rpcList = [config.RPC_URL, ...RPC_FALLBACKS].filter(
      (url, i, arr) => arr.indexOf(url) === i
    );

    // Try each RPC until one works
    for (const rpc of rpcList) {
      try {
        const provider = new ethers.JsonRpcProvider(
          rpc,
          { chainId: config.CHAIN_ID, name: 'base' },
          { fetchFunc }
        );

        // Quick health check with timeout
        const network = await Promise.race([
          provider.getNetwork(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ]);

        if (Number(network.chainId) !== config.CHAIN_ID) continue;

        this.provider = provider;
        if (rpc !== config.RPC_URL) {
          logger.warn(`  RPC fallback: ${rpc}`);
        }
        break;
      } catch {
        // try next
      }
    }

    if (!this.provider) {
      throw new Error('All RPC endpoints failed');
    }

    this.wallet = new ethers.Wallet(this.privateKey, this.provider);

    const balance = await this.provider.getBalance(this.wallet.address);
    logger.info(`  Address : ${this.wallet.address}`);
    logger.info(`  ETH     : ${ethers.formatEther(balance)} ETH${balance === 0n ? '  !! NO GAS' : ''}`);
    logger.info(`  Proxy   : ${proxyDisplay(this.proxy)}`);

    return this.wallet;
  }

  async _buildFetchWithProxy() {
    if (!this.proxy) return undefined;
    try {
      const agent = await toEthersAgent(this.proxy);
      return async (url, json) => {
        const { default: nodeFetch } = await import('node-fetch');
        return nodeFetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    json,
          agent,
        });
      };
    } catch (err) {
      logger.warn(`  Proxy agent failed: ${err.message} — using direct`);
      return undefined;
    }
  }

  getWallet()   { return this.wallet; }
  getProvider() { return this.provider; }
  getAddress()  { return this.wallet?.address; }

  async getGasPrice() {
    const feeData = await this.provider.getFeeData();
    return (feeData.gasPrice * BigInt(Math.floor(config.GAS_PRICE_MULTIPLIER * 100))) / 100n;
  }
}