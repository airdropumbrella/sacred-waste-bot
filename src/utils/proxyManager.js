/**
 * Proxy Parser & Manager
 *
 * Supports:
 *   http://host:port
 *   http://user:pass@host:port
 *   socks5://host:port
 *   socks5://user:pass@host:port
 *
 * Per-wallet mapping: PROXY_1 → PK_1, PROXY_2 → PK_2, dst.
 * If PROXY_N not set for wallet N, that wallet runs without proxy.
 */

/**
 * Parse proxy URL into structured object
 * @param {string} proxyUrl
 * @returns {{ protocol, host, port, username, password, raw } | null}
 */
export function parseProxy(proxyUrl) {
  if (!proxyUrl || proxyUrl.trim() === '') return null;

  try {
    const url = new URL(proxyUrl.trim());

    const protocol = url.protocol.replace(':', ''); // 'http' | 'socks5' | 'https'
    const host     = url.hostname;
    const port     = parseInt(url.port);
    const username = url.username ? decodeURIComponent(url.username) : null;
    const password = url.password ? decodeURIComponent(url.password) : null;

    if (!host || !port) throw new Error(`Invalid proxy: missing host or port`);

    const supported = ['http', 'https', 'socks5', 'socks4'];
    if (!supported.includes(protocol)) {
      throw new Error(`Unsupported proxy protocol: ${protocol}. Use http or socks5.`);
    }

    return { protocol, host, port, username, password, raw: proxyUrl.trim() };
  } catch (err) {
    throw new Error(`Failed to parse proxy "${proxyUrl}": ${err.message}`);
  }
}

/**
 * Build Playwright proxy config from parsed proxy
 */
export function toPlaywrightProxy(parsed) {
  if (!parsed) return undefined;

  const config = {
    server: `${parsed.protocol}://${parsed.host}:${parsed.port}`,
  };

  if (parsed.username) config.username = parsed.username;
  if (parsed.password) config.password = parsed.password;

  return config;
}

/**
 * Build fetch/http agent options for ethers.js RPC via proxy
 * Uses https-proxy-agent for http/https proxies
 * Uses socks-proxy-agent for socks5
 */
export async function toEthersAgent(parsed) {
  if (!parsed) return null;

  if (parsed.protocol === 'socks5' || parsed.protocol === 'socks4') {
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    return new SocksProxyAgent(parsed.raw);
  } else {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    return new HttpsProxyAgent(parsed.raw);
  }
}

/**
 * Load all PROXY_N values from environment
 * Returns map: { 1: parsedProxy, 2: parsedProxy, ... }
 */
export function loadProxies() {
  const proxies = {};

  for (let i = 1; i <= 50; i++) {
    const raw = process.env[`PROXY_${i}`];
    if (!raw && !process.env[`PK_${i}`]) break; // stop if no more wallets

    if (raw && raw.trim() !== '') {
      try {
        proxies[i] = parseProxy(raw);
      } catch (err) {
        console.warn(`[PROXY_${i}] Parse error: ${err.message} — running without proxy`);
        proxies[i] = null;
      }
    } else {
      proxies[i] = null; // wallet exists but no proxy
    }
  }

  return proxies;
}

/**
 * Format proxy for display (hide password)
 */
export function proxyDisplay(parsed) {
  if (!parsed) return 'none';
  const auth = parsed.username ? `${parsed.username}:***@` : '';
  return `${parsed.protocol}://${auth}${parsed.host}:${parsed.port}`;
}
