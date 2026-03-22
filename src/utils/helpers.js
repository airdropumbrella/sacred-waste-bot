/**
 * Utility helpers
 */

/**
 * Sleep for given milliseconds
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max ms
 */
export function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick random item from array
 */
export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Retry a function up to maxRetries times
 */
export async function withRetry(fn, maxRetries = 3, delayMs = 10000, label = 'operation') {
  const { logger } = await import('./logger.js');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) {
        logger.error(`[${label}] All ${maxRetries} attempts failed. Last error: ${err.message}`);
        throw err;
      }
      logger.warn(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delayMs / 1000}s...`);
      await sleep(delayMs);
    }
  }
}

/**
 * Format token amount with decimals
 */
export function formatAmount(amount, decimals = 18) {
  const { ethers } = require('ethers');
  return ethers.parseUnits(amount.toString(), decimals);
}

/**
 * Truncate address for display
 */
export function shortAddress(addr) {
  if (!addr) return '???';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
