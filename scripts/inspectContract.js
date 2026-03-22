/**
 * Pre-flight checker - Multi-wallet + Proxy
 * Usage: node scripts/inspectContract.js
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { loadProxies, proxyDisplay, toEthersAgent } from '../src/utils/proxyManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const RPC_URL            = process.env.RPC_URL || 'https://mainnet.base.org';
const TOKEN_CONTRACT     = process.env.TOKEN_CONTRACT || '0xb3e3c89b8d9c88b1fe96856e382959ee6291ebba';
const SACRIFICE_CONTRACT = process.env.SACRIFICE_CONTRACT || '0x9AFeb0e58fa2c76404C3c45eF7Ca5c0503cBaa53';

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
];

function loadWallets(proxies) {
  const wallets = [];
  for (let i = 1; i <= 50; i++) {
    const key = process.env[`PK_${i}`];
    if (!key) break;
    wallets.push({ label: `Wallet-${i}`, pk: key.trim(), proxy: proxies[i] || null });
  }
  if (wallets.length === 0 && process.env.PRIVATE_KEY) {
    wallets.push({ label: 'Wallet-1', pk: process.env.PRIVATE_KEY.trim(), proxy: proxies[1] || null });
  }
  return wallets;
}

async function makeProvider(proxy) {
  let fetchFunc = undefined;

  if (proxy) {
    try {
      const agent = await toEthersAgent(proxy);
      fetchFunc = async (url, json) => {
        const { default: nodeFetch } = await import('node-fetch');
        return nodeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, agent });
      };
    } catch (err) {
      console.warn(`  ⚠️ Proxy agent failed: ${err.message}`);
    }
  }

  return new ethers.JsonRpcProvider(
    RPC_URL,
    { chainId: 8453, name: 'base' },
    { fetchFunc }
  );
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Sacred Waste Bot v4 - Pre-flight (Proxy Check)');
  console.log('═══════════════════════════════════════════════════\n');

  const proxies = loadProxies();
  const wallets = loadWallets(proxies);

  if (wallets.length === 0) {
    console.error('❌ No wallets found! Set PK_1, PK_2, ... in .env');
    process.exit(1);
  }

  // Check sacrifice contract using direct connection
  const directProvider = await makeProvider(null);
  const network = await directProvider.getNetwork();
  const code    = await directProvider.getCode(SACRIFICE_CONTRACT);

  console.log(`Network   : chainId ${network.chainId} ${network.chainId === 8453n ? '✅' : '⚠️ NOT Base!'}`);
  console.log(`Sacrifice : ${SACRIFICE_CONTRACT} ${code !== '0x' ? '✅' : '❌ NOT FOUND'}`);
  console.log(`Wallets   : ${wallets.length} found\n`);

  for (const w of wallets) {
    const provider = await makeProvider(w.proxy);
    const token    = new ethers.Contract(TOKEN_CONTRACT, ERC20_ABI, provider);
    const wallet   = new ethers.Wallet(w.pk, provider);

    let symbol = 'REKT', decimals = 18n;
    try { symbol = await token.symbol(); decimals = await token.decimals(); } catch {}

    const eth      = await provider.getBalance(wallet.address).catch(() => 0n);
    const tokBal   = await token.balanceOf(wallet.address).catch(() => 0n);
    const allowance = await token.allowance(wallet.address, SACRIFICE_CONTRACT).catch(() => 0n);
    const approved = allowance > ethers.parseUnits('100', decimals);

    console.log(`── ${w.label} ──`);
    console.log(`  Address : ${wallet.address}`);
    console.log(`  Proxy   : ${proxyDisplay(w.proxy)}`);
    console.log(`  ETH     : ${parseFloat(ethers.formatEther(eth)).toFixed(6)} ${eth > 0n ? '✅' : '❌ NO GAS!'}`);
    console.log(`  ${symbol.padEnd(7)} : ${parseFloat(ethers.formatUnits(tokBal, decimals)).toFixed(2)} ${tokBal > 0n ? '✅' : '⚠️'}`);
    console.log(`  Approved: ${approved ? 'Yes ✅' : 'No (auto-approved on first run)'}`);
    console.log('');
  }

  console.log('Run: npm start');
}

main().catch(console.error);
