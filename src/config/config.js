/**
 * Configuration loader - Multi-wallet + Proxy support
 *
 * ✅ Contracts verified from:
 * https://basescan.org/tx/0x6c83e74ee52c9ded3cfe81db2053fc91b7cc0cdfb1e12ce13db53481ea0a8523
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { loadProxies } from '../utils/proxyManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

function optionalEnv(key, defaultVal) {
  return process.env[key] || defaultVal;
}

function loadWallets(proxies) {
  const wallets = [];

  for (let i = 1; i <= 50; i++) {
    const key = process.env[`PK_${i}`];
    if (!key) break;

    // Ambil sw_token per wallet dari .env (SW_TOKEN_1, SW_TOKEN_2, ...)
    const swToken = process.env[`SW_TOKEN_${i}`] || null;

    wallets.push({
      index:      i,
      label:      `Wallet-${i}`,
      privateKey: key.trim(),
      proxy:      proxies[i] || null,
      swToken:    swToken ? swToken.trim() : null,
    });
  }

  // Backward compat: single PRIVATE_KEY
  if (wallets.length === 0 && process.env.PRIVATE_KEY) {
    wallets.push({
      index:      1,
      label:      'Wallet-1',
      privateKey: process.env.PRIVATE_KEY.trim(),
      proxy:      proxies[1] || null,
      swToken:    process.env.SW_TOKEN_1 ? process.env.SW_TOKEN_1.trim() : null,
    });
  }

  if (wallets.length === 0) {
    throw new Error('No wallets found! Set PK_1, PK_2, ... in .env');
  }

  return wallets;
}

const proxies = loadProxies();

export const config = {
  WALLETS: loadWallets(proxies),

  RPC_URL:  optionalEnv('RPC_URL', 'https://mainnet.base.org'),
  CHAIN_ID: parseInt(optionalEnv('CHAIN_ID', '8453')),

  TOKEN_CONTRACT:     optionalEnv('TOKEN_CONTRACT',     '0xb3e3c89b8d9c88b1fe96856e382959ee6291ebba'),
  SACRIFICE_CONTRACT: optionalEnv('SACRIFICE_CONTRACT', '0x9AFeb0e58fa2c76404C3c45eF7Ca5c0503cBaa53'),

  APP_URL: optionalEnv('APP_URL', 'https://app.sacredwaste.io'),

  ENABLE_BURN:    optionalEnv('ENABLE_BURN', 'true') === 'true',
  BURN_COUNT:     parseInt(optionalEnv('BURN_COUNT', '10')),
  BURN_AMOUNT_MAX: parseInt(optionalEnv('BURN_AMOUNT_MAX', '7')),  // max token per burn tx (random 1–max)
  BURN_DELAY_MIN: parseInt(optionalEnv('BURN_DELAY_MIN', '30000')),
  BURN_DELAY_MAX: parseInt(optionalEnv('BURN_DELAY_MAX', '120000')),

  ENABLE_VOTE:    optionalEnv('ENABLE_VOTE', 'true') === 'true',
  VOTE_COUNT:     parseInt(optionalEnv('VOTE_COUNT', '20')),
  VOTE_DELAY_MIN: parseInt(optionalEnv('VOTE_DELAY_MIN', '5000')),
  VOTE_DELAY_MAX: parseInt(optionalEnv('VOTE_DELAY_MAX', '15000')),

  WALLET_DELAY_MIN: parseInt(optionalEnv('WALLET_DELAY_MIN', '60000')),
  WALLET_DELAY_MAX: parseInt(optionalEnv('WALLET_DELAY_MAX', '300000')),
  SHUFFLE_WALLETS:  optionalEnv('SHUFFLE_WALLETS', 'true') === 'true',

  GAS_LIMIT_APPROVE:    parseInt(optionalEnv('GAS_LIMIT_APPROVE', '120000')),
  GAS_LIMIT_BURN:       parseInt(optionalEnv('GAS_LIMIT_BURN', '350000')),
  GAS_PRICE_MULTIPLIER: parseFloat(optionalEnv('GAS_PRICE_MULTIPLIER', '1.5')),

  MAX_RETRIES:  parseInt(optionalEnv('MAX_RETRIES', '3')),
  RETRY_DELAY:  parseInt(optionalEnv('RETRY_DELAY', '10000')),

  HEADLESS: optionalEnv('HEADLESS', 'true') === 'true',

  BASESCAN_API_KEY: optionalEnv('BASESCAN_API_KEY', ''),
};