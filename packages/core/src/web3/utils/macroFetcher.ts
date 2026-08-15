import { safeFetchJson } from '../../utils/httpClient';

export interface MacroContext {
  dxy: number | null;
  sp500: number | null;
  tnx: number | null; // 10-year Treasury Yield
  btcPrice: number | null;
}

const macroCache: { data: MacroContext | null; timestamp: number } = { data: null, timestamp: 0 };
const MACRO_CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

/**
 * Fetches macroeconomic indicators (DXY, S&P500, 10y Treasury) and BTC price
 * to provide broader market context for crypto analysis.
 */
export async function getMacroContext(): Promise<MacroContext> {
  const now = Date.now();
  if (macroCache.data && now - macroCache.timestamp < MACRO_CACHE_TTL) {
    return macroCache.data;
  }

  const context: MacroContext = { dxy: null, sp500: null, tnx: null, btcPrice: null };

  const YAHOO_SYMBOLS: Record<string, keyof MacroContext> = {
    'DX-Y.NYB': 'dxy',
    '^GSPC': 'sp500',
    '^TNX': 'tnx',
  };

  try {
    // Fetch Yahoo Finance symbols in parallel using safeFetchJson (handles timeouts & Node.js compat)
    const yahooPromises = Object.entries(YAHOO_SYMBOLS).map(async ([sym, key]) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
        const data = await safeFetchJson<any>(url, { headers: YAHOO_HEADERS, timeoutMs: 8000 });
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        return { key, price: typeof price === 'number' ? price : null };
      } catch {
        return { key, price: null };
      }
    });

    // Fetch BTC price from DexScreener, sorting pairs by liquidity to avoid scam pairs
    const btcPromise = (async (): Promise<number | null> => {
      try {
        const url = 'https://api.dexscreener.com/latest/dex/tokens/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'; // WBTC on Ethereum
        const data = await safeFetchJson<any>(url, { timeoutMs: 8000 });
        if (data?.pairs?.length > 0) {
          // Sort by liquidity descending to get the most liquid (real) pair
          const sorted = [...data.pairs].sort((a: any, b: any) =>
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          );
          const price = parseFloat(sorted[0].priceUsd);
          return isNaN(price) ? null : price;
        }
      } catch {
        console.warn('[MacroFetcher] Failed to fetch BTC price from DexScreener');
      }
      return null;
    })();

    const [yahooResults, btcPrice] = await Promise.all([Promise.all(yahooPromises), btcPromise]);

    for (const result of yahooResults) {
      context[result.key] = result.price;
    }
    context.btcPrice = btcPrice;

    macroCache.data = context;
    macroCache.timestamp = now;
  } catch (error) {
    console.error('[MacroFetcher] Unexpected error:', error);
  }

  return context;
}
