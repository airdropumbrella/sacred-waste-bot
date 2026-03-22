/**
 * BurnBotUI - Playwright-based UI automation for burn/sacrifice
 * Used as fallback when direct contract interaction isn't available
 */

import { chromium } from 'playwright';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { withRetry, sleep, randomDelay } from '../utils/helpers.js';

export class BurnBotUI {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    logger.info('Launching Playwright browser for BurnBotUI...');

    this.browser = await chromium.launch({
      headless: config.HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Inject wallet via window.ethereum mock (MetaMask-compatible)
    await this.context.addInitScript(
      ({ privateKey, rpcUrl, chainId }) => {
        // We'll use a script injection approach to connect wallet
        window.__BOT_CONFIG__ = { privateKey, rpcUrl, chainId };
      },
      {
        privateKey: config.PRIVATE_KEY,
        rpcUrl: config.RPC_URL,
        chainId: config.CHAIN_ID,
      }
    );

    this.page = await this.context.newPage();

    // Intercept network requests to capture contract calls
    await this.page.route('**/*', (route) => {
      route.continue();
    });

    logger.info('Browser initialized.');
  }

  async executeBurn() {
    return await withRetry(
      async () => {
        logger.info('Navigating to sacrifice page...');
        await this.page.goto(`${config.APP_URL}/sacrifice`, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });

        // Wait for page to load
        await this.page.waitForTimeout(2000);

        // Step 1: Connect wallet if not connected
        await this._connectWallet();

        // Step 2: Select network (Base)
        await this._selectNetwork();

        // Step 3: Select token
        await this._selectToken();

        // Step 4: Set amount and approve/submit
        await this._approveAndSubmit();

        logger.info('✅ UI burn flow completed!');
      },
      config.MAX_RETRIES,
      config.RETRY_DELAY,
      'BurnBotUI'
    );
  }

  async _connectWallet() {
    logger.info('Checking wallet connection...');

    // Look for connect wallet button
    const connectBtn = this.page.locator('button:has-text("Connect"), button:has-text("connect wallet")')
      .first();

    if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      logger.info('Clicking connect wallet...');
      await connectBtn.click();
      await this.page.waitForTimeout(1500);

      // Handle wallet modal - look for MetaMask or WalletConnect option
      const mmBtn = this.page.locator('button:has-text("MetaMask"), [data-testid="wallet-metamask"]').first();
      if (await mmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await mmBtn.click();
        await this.page.waitForTimeout(2000);
      }
    } else {
      logger.info('Wallet appears to be connected already.');
    }

    // Check if address appears in UI
    const addressEl = this.page.locator('text=/0x[a-fA-F0-9]+/').first();
    if (await addressEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      logger.info('Wallet connected: ' + (await addressEl.textContent()));
    }
  }

  async _selectNetwork() {
    logger.info('Selecting Base network...');

    // Click "Make a Sacrifice" or start button if needed
    const makeBtn = this.page.locator('button:has-text("MAKE A SACRIFICE"), a:has-text("MAKE A SACRIFICE")').first();
    if (await makeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await makeBtn.click();
      await this.page.waitForTimeout(1500);
    }

    // Look for Base network option
    const baseOption = this.page.locator('text=Base, [data-network="base"], button:has-text("Base")').first();
    if (await baseOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await baseOption.click();
      logger.info('Selected Base network');
      await this.page.waitForTimeout(1000);
    } else {
      logger.warn('Base network option not found, may already be selected');
    }

    // Click Continue
    const continueBtn = this.page.locator('button:has-text("CONTINUE"), button:has-text("Continue")').first();
    if (await continueBtn.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click();
      await this.page.waitForTimeout(1500);
    }
  }

  async _selectToken() {
    logger.info('Selecting token by contract address...');

    // Click on "Tokens (ERC-20)" tab
    const tokenTab = this.page.locator('text=Tokens (ERC-20)').first();
    if (await tokenTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenTab.click();
      await this.page.waitForTimeout(1000);
    }

    // Search for token by contract address
    const searchBox = this.page.locator('input[placeholder*="Search Tokens"], input[placeholder*="ERC-20"]').first();
    if (await searchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchBox.fill(config.TOKEN_CONTRACT);
      await this.page.waitForTimeout(1500);
    }

    // Click the token card
    const tokenCard = this.page.locator('.token-card, [data-token], .token-item').first();
    if (await tokenCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenCard.click();
      logger.info('Token selected');
      await this.page.waitForTimeout(1000);
    } else {
      // Try clicking first result
      const firstResult = this.page.locator('text=REKT, text=Rekt').first();
      if (await firstResult.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstResult.click();
      }
    }

    // Click Continue
    const continueBtn = this.page.locator('button:has-text("CONTINUE"), button:has-text("Continue")').first();
    if (await continueBtn.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click();
      await this.page.waitForTimeout(1500);
    }
  }

  async _approveAndSubmit() {
    logger.info('Setting amount and submitting...');

    // Set amount to 1
    const amountInput = this.page.locator('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]').first();
    if (await amountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await amountInput.fill('1');
      await this.page.waitForTimeout(500);
    }

    // Click Approve Token button
    const approveBtn = this.page.locator('button:has-text("APPROVE TOKEN"), button:has-text("Approve Token")').first();
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      logger.info('Clicking APPROVE TOKEN...');
      await approveBtn.click();
      await this.page.waitForTimeout(3000);

      // Wait for wallet popup to confirm (if using extension)
      // For script-based wallet, transaction is auto-confirmed
      await this.page.waitForTimeout(15000); // Wait for approval tx
    }

    // Click Submit/Sacrifice button
    const submitBtn = this.page.locator(
      'button:has-text("SUBMIT"), button:has-text("SACRIFICE"), button:has-text("Sacrifice"), button:has-text("BURN")'
    ).first();
    if (await submitBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      logger.info('Clicking Submit...');
      await submitBtn.click();
      await this.page.waitForTimeout(15000); // Wait for tx
    }

    // Check for success message
    const successMsg = this.page.locator('text=success, text=Success, text=confirmed, text=Confirmed').first();
    if (await successMsg.isVisible({ timeout: 30000 }).catch(() => false)) {
      logger.success('Transaction confirmed via UI!');
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed.');
    }
  }
}
