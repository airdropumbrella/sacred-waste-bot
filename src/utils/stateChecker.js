/**
 * StateChecker - Cek status harian (vote & burn) via Playwright network intercept
 * Menangkap API response dari Sacred Waste saat page load
 * Sehingga bot tahu berapa vote/burn yang sudah dilakukan hari ini
 */

import { logger } from './logger.js';

export class StateChecker {
  /**
   * Cek daily vote state dengan intercept response dari page
   * Returns: { used, max, remaining }
   */
  static async getDailyVoteState(page) {
    try {
      // Method 1: Baca dari UI element (paling reliable)
      const uiState = await StateChecker._readVoteFromUI(page);
      if (uiState) return uiState;

      // Method 2: Intercept dari API response
      const apiState = await StateChecker._readVoteFromAPI(page);
      if (apiState) return apiState;
    } catch (err) {
      logger.warn(`StateChecker vote error: ${err.message}`);
    }

    // Fallback: assume 0 used
    return { used: 0, max: 20, remaining: 20 };
  }

  static async _readVoteFromUI(page) {
    try {
      // Pattern: "X / 20" atau "28 / 20" di halaman rewards/hot-or-not
      const selectors = [
        'text=/\\d+\\s*\\/\\s*20/',        // "0 / 20" atau "20 / 20"
        '[data-testid="daily-votes"]',
        '.daily-votes',
        'text=/Daily votes/i',
      ];

      for (const sel of selectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          const text = await el.textContent();
          const match = text.match(/(\d+)\s*\/\s*(\d+)/);
          if (match) {
            const used = parseInt(match[1]);
            const max  = parseInt(match[2]);
            logger.info(`  [StateChecker] Vote UI: ${used}/${max}`);
            return { used, max, remaining: Math.max(0, max - used) };
          }
        }
      }

      // Cek teks "Daily limit reached"
      const limitReached = await page.locator('text=/daily limit reached/i, text=/come back tomorrow/i').first()
        .isVisible({ timeout: 2000 }).catch(() => false);
      if (limitReached) {
        logger.info(`  [StateChecker] Daily vote limit already reached!`);
        return { used: 20, max: 20, remaining: 0 };
      }
    } catch {}
    return null;
  }

  static async _readVoteFromAPI(page) {
    try {
      // Intercept semua XHR/fetch response saat navigate
      const apiData = {};

      page.on('response', async (response) => {
        const url = response.url();
        if (
          url.includes('vote') ||
          url.includes('user') ||
          url.includes('daily') ||
          url.includes('reward') ||
          url.includes('activity')
        ) {
          try {
            const json = await response.json().catch(() => null);
            if (json) {
              // Simpan semua API response untuk dianalisis
              Object.assign(apiData, { [url]: json });
              logger.info(`  [StateChecker] API: ${url.split('/').slice(-2).join('/')}`);
            }
          } catch {}
        }
      });

      // Navigate ke rewards page (paling banyak data daily state)
      await page.goto('https://app.sacredwaste.io/rewards', {
        waitUntil: 'networkidle',
        timeout: 15000,
      });
      await page.waitForTimeout(2000);

      // Cari vote count di API responses
      for (const [url, data] of Object.entries(apiData)) {
        const str = JSON.stringify(data);
        const match = str.match(/"votes?\s*(?:count|used|today|daily)?"?\s*:?\s*(\d+)/i);
        if (match) {
          const used = parseInt(match[1]);
          logger.info(`  [StateChecker] Vote from API (${url}): ${used}/20`);
          return { used, max: 20, remaining: Math.max(0, 20 - used) };
        }
      }
    } catch (err) {
      logger.warn(`  [StateChecker] API intercept error: ${err.message}`);
    }
    return null;
  }

  /**
   * Cek daily burn/sacrifice count dari rewards page UI
   */
  static async getDailyBurnState(page) {
    try {
      // Navigate ke rewards page
      await page.goto('https://app.sacredwaste.io/rewards', {
        waitUntil: 'networkidle',
        timeout: 15000,
      });
      await page.waitForTimeout(2000);

      // Baca sacrifice count hari ini dari UI
      // Patterns yang mungkin: "X sacrifices today", "10/10", dll
      const patterns = [
        /(\d+)\s*\/\s*(\d+)\s*(?:sacrifice|burn|today)/i,
        /(?:sacrifice|burn)[^:]*:\s*(\d+)/i,
        /(\d+)\s*(?:sacrifice|burn)s?\s*today/i,
      ];

      const bodyText = await page.locator('body').textContent().catch(() => '');

      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const used = parseInt(match[1]);
          const max  = match[2] ? parseInt(match[2]) : null;
          logger.info(`  [StateChecker] Burn today: ${used}${max ? '/'+max : ''}`);
          return { used, max, canBurn: !max || used < max };
        }
      }

      // Cek completed badge
      const completed = await page.locator('text=/completed today/i').first()
        .textContent({ timeout: 2000 }).catch(() => '');
      if (completed) {
        const match = completed.match(/\((\d+)\/(\d+)\)/);
        if (match) {
          const used = parseInt(match[1]);
          const max  = parseInt(match[2]);
          logger.info(`  [StateChecker] Burn completed: ${used}/${max}`);
          return { used, max, canBurn: used < max };
        }
      }
    } catch (err) {
      logger.warn(`  [StateChecker] Burn state error: ${err.message}`);
    }

    return { used: 0, max: null, canBurn: true };
  }
}
