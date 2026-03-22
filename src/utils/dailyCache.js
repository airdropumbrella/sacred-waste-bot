/**
 * DailyCache - Simpan state harian ke file JSON lokal
 * Sebagai sumber kebenaran utama agar tidak dobel burn/vote
 *
 * File: logs/daily-state-YYYY-MM-DD.json
 * Reset otomatis setiap hari baru (UTC midnight)
 *
 * Structure:
 * {
 *   "date": "2026-03-21",
 *   "wallets": {
 *     "0xABCD...": { "burns": 10, "votes": 20, "lastUpdate": "2026-03-21T09:00:00Z" }
 *   }
 * }
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../../logs');

function getTodayUTC() {
  return new Date().toISOString().split('T')[0]; // "2026-03-21"
}

function getCacheFile() {
  return path.join(CACHE_DIR, `daily-state-${getTodayUTC()}.json`);
}

function loadCache() {
  const file = getCacheFile();
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      // Validasi tanggal - reject jika bukan hari ini
      if (data.date === getTodayUTC()) return data;
    }
  } catch {}
  return { date: getTodayUTC(), wallets: {} };
}

function saveCache(data) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(getCacheFile(), JSON.stringify(data, null, 2), 'utf8');
}

export class DailyCache {
  /**
   * Ambil burn count hari ini untuk wallet tertentu
   */
  static getBurns(address) {
    const cache = loadCache();
    const addr  = address.toLowerCase();
    return cache.wallets[addr]?.burns || 0;
  }

  /**
   * Ambil vote count hari ini untuk wallet tertentu
   */
  static getVotes(address) {
    const cache = loadCache();
    const addr  = address.toLowerCase();
    return cache.wallets[addr]?.votes || 0;
  }

  /**
   * Tambah burn count (dipanggil setelah tiap burn berhasil)
   */
  static addBurn(address) {
    const cache = loadCache();
    const addr  = address.toLowerCase();
    if (!cache.wallets[addr]) cache.wallets[addr] = { burns: 0, votes: 0 };
    cache.wallets[addr].burns++;
    cache.wallets[addr].lastUpdate = new Date().toISOString();
    saveCache(cache);
    logger.info(`  [Cache] ${addr.slice(0,10)}... burns today: ${cache.wallets[addr].burns}`);
  }

  /**
   * Tambah vote count
   */
  static addVote(address) {
    const cache = loadCache();
    const addr  = address.toLowerCase();
    if (!cache.wallets[addr]) cache.wallets[addr] = { burns: 0, votes: 0 };
    cache.wallets[addr].votes++;
    cache.wallets[addr].lastUpdate = new Date().toISOString();
    saveCache(cache);
  }

  /**
   * Set burn count dari sumber eksternal (BaseScan/getLogs)
   * Hanya update jika nilai baru LEBIH BESAR dari cache (tidak pernah turun)
   */
  static syncBurns(address, countFromChain) {
    const cache    = loadCache();
    const addr     = address.toLowerCase();
    const current  = cache.wallets[addr]?.burns || 0;
    const synced   = Math.max(current, countFromChain);

    if (!cache.wallets[addr]) cache.wallets[addr] = { burns: 0, votes: 0 };
    cache.wallets[addr].burns      = synced;
    cache.wallets[addr].lastUpdate = new Date().toISOString();
    saveCache(cache);

    if (synced !== countFromChain) {
      logger.info(`  [Cache] Sync burns: chain=${countFromChain}, cache=${current} → using ${synced}`);
    }

    return synced;
  }

  /**
   * Print state semua wallet hari ini
   */
  static printTodaySummary() {
    const cache = loadCache();
    logger.info(`  [Cache] Today (${cache.date}):`);
    for (const [addr, state] of Object.entries(cache.wallets)) {
      logger.info(`    ${addr.slice(0, 10)}... → burns: ${state.burns}, votes: ${state.votes}`);
    }
  }
}