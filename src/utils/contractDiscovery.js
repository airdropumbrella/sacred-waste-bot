/**
 * Contract Discovery - finds Sacred Waste sacrifice contract address
 * by scraping the frontend JS or querying known patterns
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger.js';

// Known or discovered contract addresses
// Update these after running the discovery once
const KNOWN_CONTRACTS = {
  // Base mainnet
  8453: {
    // These will be populated by discovery or manually set
    sacrifice: process.env.SACRIFICE_CONTRACT || null,
  },
};

/**
 * Try to discover the sacrifice contract by intercepting app requests
 * This is a fallback - prefer setting SACRIFICE_CONTRACT in .env
 */
export async function discoverSacrificeContract(chainId) {
  const known = KNOWN_CONTRACTS[chainId];

  if (known?.sacrifice) {
    logger.info(`Using known sacrifice contract: ${known.sacrifice}`);
    return known.sacrifice;
  }

  logger.warn('Sacrifice contract not found in known list.');
  logger.warn('Options:');
  logger.warn('  1. Set SACRIFICE_CONTRACT in .env after finding it manually');
  logger.warn('  2. Check browser DevTools Network tab on sacrifice page');
  logger.warn('  3. Use Playwright-based burn (see burnBotUI.js)');

  return null;
}

/**
 * Fetch contract address from app's JavaScript bundle
 */
export async function fetchContractFromBundle(appUrl) {
  try {
    logger.info('Attempting to discover contract from app bundle...');
    const response = await fetch(`${appUrl}/sacrifice`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot)' },
    });
    const html = await response.text();

    // Look for contract addresses in source
    const addressPattern = /0x[a-fA-F0-9]{40}/g;
    const addresses = [...new Set(html.match(addressPattern) || [])];

    logger.info(`Found ${addresses.length} addresses in page source`);

    // Filter out common non-contract addresses
    const candidates = addresses.filter(addr =>
      addr.toLowerCase() !== '0x0000000000000000000000000000000000000000'
    );

    return candidates;
  } catch (err) {
    logger.warn(`Bundle discovery failed: ${err.message}`);
    return [];
  }
}

/**
 * Validate if an address is a contract
 */
export async function isContract(provider, address) {
  try {
    const code = await provider.getCode(address);
    return code !== '0x';
  } catch {
    return false;
  }
}
