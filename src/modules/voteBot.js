/**
 * VoteBot - Hot or Not voting via direct API
 *
 * Auth token setup:
 *   1. Open https://app.sacredwaste.io, connect wallet
 *   2. DevTools -> Console -> run: localStorage.getItem('sw_token')
 *   3. Copy result to .env:  SW_TOKEN_1=eyJhbGci...
 *   Token is valid ~7-30 days.
 */

import { ethers } from 'ethers';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { sleep, randomDelay, randomChoice } from '../utils/helpers.js';
import { DailyCache } from '../utils/dailyCache.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.resolve(__dirname, '../../logs/jwt-tokens.json');
const BASE       = config.APP_URL;
const DAILY_MAX  = 20;

function loadCache() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { return {}; }
}
function saveCache(data) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}
function getCachedToken(address) {
  const e = loadCache()[address.toLowerCase()];
  if (!e) return null;
  if (e.exp && e.exp < Math.floor(Date.now() / 1000) + 3600) return null;
  return e;
}
function setCachedToken(address, appToken, jwt, jwtExp) {
  const cache = loadCache();
  cache[address.toLowerCase()] = { appToken, jwt, exp: jwtExp, savedAt: new Date().toISOString() };
  saveCache(cache);
}
function decodeExp(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp || null; }
  catch { return null; }
}
function isValid(token) {
  if (!token || !token.includes('.')) return false;
  const exp = decodeExp(token);
  return !exp || exp > Math.floor(Date.now() / 1000) + 3600;
}

function makeHeaders(appToken, jwt) {
  return {
    'Accept':       'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin':       BASE,
    'Referer':      `${BASE}/hot-or-not`,
    'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36',
    ...(appToken && { 'X-Sw-App-Token': appToken }),
    ...(jwt      && { 'Authorization':  `Bearer ${jwt}` }),
  };
}
async function apiGet(url, appToken, jwt) {
  const res  = await fetch(`${BASE}${url}`, { headers: makeHeaders(appToken, jwt), signal: AbortSignal.timeout(12000) });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}
async function apiPost(url, body, appToken, jwt) {
  const res  = await fetch(`${BASE}${url}`, { method: 'POST', headers: makeHeaders(appToken, jwt), body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

export class VoteBot {
  constructor(proxy = null, walletLabel = 'Wallet', privateKey = null, swToken = null) {
    this.proxy       = proxy;
    this.walletLabel = walletLabel;
    this.wallet      = privateKey ? new ethers.Wallet(privateKey) : null;
    this.swToken     = swToken;
    this.appToken    = null;
    this.jwt         = null;
  }

  async init() {
    if (!this.wallet) throw new Error('privateKey required for VoteBot');
    if (!this.swToken) {
      logger.warn(`  Vote: no SW_TOKEN set for ${this.walletLabel}`);
      logger.warn(`  Run in browser console: localStorage.getItem('sw_token')`);
      logger.warn(`  Then add to .env: SW_TOKEN_${this.walletLabel.replace(/\D/g, '') || '?'}=<token>`);
    }
  }

  async runVotingSession() {
    const results = { success: 0, failed: 0 };
    const address = this.wallet.address;

    const cached = DailyCache.getVotes(address);
    if (cached >= DAILY_MAX) {
      logger.info(`  Vote: daily limit already reached (${cached}/${DAILY_MAX})`);
      return results;
    }

    await this._ensureTokens();
    if (!this.jwt && !this.appToken) {
      logger.error(`  Vote: no auth token available — skipping`);
      return results;
    }

    const state = await this._getProgress();
    if (state.current > cached) {
      for (let i = 0; i < state.current - cached; i++) DailyCache.addVote(address);
    }

    const remaining = Math.max(0, state.target - state.current);
    if (remaining <= 0) {
      logger.info(`  Vote: already completed (${state.current}/${state.target})`);
      return results;
    }

    const todo = Math.min(remaining, config.VOTE_COUNT);
    logger.info(`  Vote: ${state.current} done, casting ${todo} more`);

    for (let i = 1; i <= todo; i++) {
      try {
        const total = await this._castVote();
        results.success++;
        DailyCache.addVote(address);
        logger.info(`  Vote [${i}/${todo}] ok  (${total}/${DAILY_MAX})`);
      } catch (err) {
        results.failed++;
        logger.error(`  Vote [${i}/${todo}] failed: ${err.message}`);
        if (err.message.match(/^401|^403|unauthorized/i)) { this._clearCache(); break; }
      }
      if (i < todo) await sleep(randomDelay(config.VOTE_DELAY_MIN, config.VOTE_DELAY_MAX));
    }

    const final = await this._getProgress();
    logger.info(`  Vote: session done — ${final.current}/${final.target}`);
    return results;
  }

  async _ensureTokens() {
    const address = this.wallet.address;

    if (this.swToken && isValid(this.swToken)) {
      this.jwt = this.swToken;
      await this._fetchAppToken();
      const exp = decodeExp(this.jwt) || Math.floor(Date.now() / 1000) + 7 * 86400;
      setCachedToken(address, this.appToken, this.jwt, exp);
      return;
    }
    if (this.swToken && !isValid(this.swToken)) {
      logger.warn(`  Auth: token expired — please refresh SW_TOKEN in .env`);
    }

    const cached = getCachedToken(address);
    if (cached?.jwt && isValid(cached.jwt)) {
      this.appToken = cached.appToken;
      this.jwt      = cached.jwt;
      return;
    }

    await this._fetchAppToken();
    await this._tryAuthFlows();
    if (this.appToken || this.jwt) {
      const exp = this.jwt ? (decodeExp(this.jwt) || Math.floor(Date.now() / 1000) + 7 * 86400) : Math.floor(Date.now() / 1000) + 86400;
      setCachedToken(address, this.appToken, this.jwt, exp);
    }
  }

  async _fetchAppToken() {
    try {
      const res = await apiGet('/api/app-token', null, null);
      const tok = res.data?.token || res.data?.appToken || res.data?.accessToken;
      if (tok) this.appToken = tok;
    } catch {}
  }

  async _tryAuthFlows() {
    const address = this.wallet.address;
    const flows = [
      async () => {
        const r = await apiGet(`/api/auth/siwe/nonce?address=${address}`, this.appToken, null);
        if (!r.ok || !r.data?.nonce) return null;
        const message = [
          `app.sacredwaste.io wants you to sign in with your Ethereum account:`,
          address, '', 'Sign in to Sacred Waste', '',
          'URI: https://app.sacredwaste.io', 'Version: 1', 'Chain ID: 8453',
          `Nonce: ${r.data.nonce}`, `Issued At: ${new Date().toISOString()}`,
        ].join('\n');
        const v = await apiPost('/api/auth/siwe/verify', { message, signature: await this.wallet.signMessage(message) }, this.appToken, null);
        return v.data?.token || v.data?.jwt;
      },
      async () => {
        const r = await apiGet(`/api/auth/nonce?walletAddress=${address}`, this.appToken, null);
        if (!r.ok) return null;
        const nonce = r.data?.nonce || r.data?.message;
        if (!nonce || (typeof nonce === 'string' && nonce.includes('<html'))) return null;
        const v = await apiPost('/api/auth/verify', { walletAddress: address, signature: await this.wallet.signMessage(nonce), nonce }, this.appToken, null);
        return v.data?.token || v.data?.jwt;
      },
    ];
    for (const flow of flows) {
      try {
        const tok = await flow();
        if (tok && typeof tok === 'string' && tok.includes('.')) { this.jwt = tok; return; }
      } catch {}
    }
  }

  _clearCache() {
    try { const c = loadCache(); delete c[this.wallet.address.toLowerCase()]; saveCache(c); } catch {}
  }

  async _getProgress() {
    try {
      const res = await apiGet(`/api/burn/vote-stats?walletAddress=${this.wallet.address}`, this.appToken, this.jwt);
      const d   = res.data;
      return {
        current: d?.progress?.current ?? d?.votesUsed ?? DailyCache.getVotes(this.wallet.address),
        target:  d?.progress?.target  ?? d?.target    ?? DAILY_MAX,
      };
    } catch { return { current: DailyCache.getVotes(this.wallet.address), target: DAILY_MAX }; }
  }

  async _castVote() {
    const matchup = await apiGet(`/api/burn/matchup?walletAddress=${this.wallet.address}`, this.appToken, this.jwt);
    if (!matchup.ok) throw new Error(`Matchup ${matchup.status}`);

    const { defender, challenger, nonce } = matchup.data;
    if (!defender?.id || !challenger?.id || !nonce) throw new Error('Invalid matchup data');

    const pick     = randomChoice(['defender', 'challenger']);
    const winnerId = pick === 'defender' ? defender.id : challenger.id;

    const res = await apiPost('/api/burn/vote', {
      walletAddress: this.wallet.address,
      defenderId:    defender.id,
      challengerId:  challenger.id,
      groupedWallets: [],
      nonce,
      winnerId,
    }, this.appToken, this.jwt);

    if (res.status === 401 || res.status === 403) throw new Error(`${res.status} Unauthorized`);
    if (res.status === 429)                        throw new Error('429 Rate limited');
    if (!res.ok)                                   throw new Error(`Vote failed ${res.status}`);

    return res.data?.voteCount ?? res.data?.progress?.current ?? (DailyCache.getVotes(this.wallet.address) + 1);
  }

  async cleanup() {}
}