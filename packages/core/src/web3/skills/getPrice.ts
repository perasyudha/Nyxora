import { safeFetchJson } from '../../utils/httpClient';
import { loadMarketKeys } from '../../config/marketConfigManager';
import { loadConfig } from '../../config/parser';
import { ML_BASE_URL } from '../../config/constants';

export const getPriceToolDefinition = {
  type: "function",
  function: {
    name: "get_price_and_fiat_value",
    description: "Fetches the current price of a cryptocurrency and performs perfect fiat/amount conversion.",
    parameters: {
      type: "object",
      properties: {
        coinId: {
          type: "string",
          description: "The CoinGecko ID of the coin, its symbol, or its exact Contract Address (e.g., 'ethereum', 'bitcoin', 'jrny', '0x123...'). For low-cap/DEX tokens, ALWAYS use the Contract Address if available."
        },
        currency: {
          type: "string",
          description: "The fiat currency to convert to (e.g., 'usd', 'idr', 'eur', 'jpy'). If omitted, it automatically defaults to the user's configured base fiat."
        },
        amount: {
          type: "number",
          description: "Optional. The number of tokens. If provided, the tool calculates the total fiat value exactly."
        }
      },
      required: ["coinId"]
    }
  }
};

export async function getPrice(coinId: string, currency?: string, amount?: number): Promise<string> {
  const config = loadConfig();
  const defaultFiat = config.agent?.base_fiat || 'usd';
  const cur = String(currency || defaultFiat).toLowerCase();
  const curUpper = cur.toUpperCase();
  const keys = loadMarketKeys();

  // Helper to fetch USDT -> Target Fiat rate
  async function getUsdtToFiatRate(): Promise<number> {
    if (cur === 'usd' || cur === 'usdt') return 1;
    // Tier 1 for Fiat: CoinGecko
    try {
      const isPro = !!keys.coingecko_key;
      const baseUrl = isPro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
      const headers = isPro ? { 'x-cg-pro-api-key': keys.coingecko_key } : undefined;
      const data = await safeFetchJson<any>(`${baseUrl}/simple/price?ids=tether&vs_currencies=${cur}`, { headers });
      if (data && data.tether && data.tether[cur]) return data.tether[cur];
    } catch (e) { console.warn('[getPrice] tier failed:', e); }
    // Tier 2 for Fiat: CoinMarketCap
    if (keys.cmc_key) {
      try {
        const data = await safeFetchJson<any>(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?slug=tether&convert=${curUpper}`, {
          headers: { 'X-CMC_PRO_API_KEY': keys.cmc_key }
        });
        const coinList = Object.values(data?.data || {});
        if (coinList[0] && (coinList[0] as any).quote[curUpper]) return (coinList[0] as any).quote[curUpper].price;
      } catch (e) { console.warn('[getPrice] tier failed:', e); }
    }
    return 0; 
  }

  const fiatRate = await getUsdtToFiatRate();
  if (fiatRate === 0 && cur !== 'usd') {
    return `❌ **Failed to fetch fiat exchange rate** for **USDT -> ${curUpper}**.`;
  }

  let tokenUsdPrice = 0;
  let change24h = 0;
  let source = '';
  let tokenName = coinId.toUpperCase();

  // TIER 1: CoinMarketCap (Token -> USD)
  if (keys.cmc_key && tokenUsdPrice === 0) {
    try {
      const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?slug=${coinId.toLowerCase()}&convert=USD`;
      const data = await safeFetchJson<any>(url, { headers: { 'X-CMC_PRO_API_KEY': keys.cmc_key } });
      const coin: any = Object.values(data?.data || {})[0];
      if (coin && coin.quote && coin.quote.USD) {
        tokenUsdPrice = coin.quote.USD.price;
        change24h = coin.quote.USD.percent_change_24h;
        tokenName = coin.symbol;
        source = 'CoinMarketCap Pro';
      }
    } catch(e) { console.warn('[getPrice] tier failed:', e); }
  }

  // TIER 2: CoinGecko (Token -> USD)
  if (tokenUsdPrice === 0) {
    try {
      const isPro = !!keys.coingecko_key;
      const baseUrl = isPro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
      const headers = isPro ? { 'x-cg-pro-api-key': keys.coingecko_key } : undefined;
      const url = `${baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`;
      const data = await safeFetchJson<any>(url, { headers });
      if (data && data[coinId]) {
        tokenUsdPrice = data[coinId].usd;
        change24h = data[coinId].usd_24h_change || 0;
        source = `CoinGecko ${isPro ? 'Pro' : 'Public'}`;
      }
    } catch(e) { console.warn('[getPrice] tier failed:', e); }
  }

  // TIER 3: Nyxora Python ML Engine (For obscure/low-cap DEX tokens)
  if (tokenUsdPrice === 0) {
    try {
      const mlData = await safeFetchJson<any>(`${ML_BASE_URL}/web3/analyze?query=${coinId}&chain=ethereum`, { timeoutMs: 35000, retries: 1 });
      if (mlData && mlData.currentPrice) {
        tokenUsdPrice = mlData.currentPrice;
        change24h = mlData.priceChange24h || 0;
        tokenName = mlData.officialSymbol || coinId.toUpperCase();
        source = 'ML Engine (On-Chain/DEX Routing)';
      }
    } catch(e) { console.warn('[getPrice] tier failed:', e); }
  }

  // TIER 4: DexScreener (Direct CA or Symbol Search)
  if (tokenUsdPrice === 0) {
    try {
      const data = await safeFetchJson<any>(`https://api.dexscreener.com/latest/dex/search?q=${coinId}`);
      if (data?.pairs && Array.isArray(data.pairs) && data.pairs.length > 0) {
        // Filter by minimum liquidity and sort by liquidity desc for best accuracy
        const filteredPairs = data.pairs
          .filter((p: any) => (p.liquidity?.usd || 0) > 1000)
          .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        const pair = filteredPairs[0] || data.pairs[0]; // fallback to first if none pass filter
        if (pair?.priceUsd) {
          const price = parseFloat(pair.priceUsd);
          if (!isNaN(price) && price > 0) {
            tokenUsdPrice = price;
            change24h = pair.priceChange?.h24 || 0;
            tokenName = pair.baseToken?.symbol || tokenName;
            source = 'DexScreener';
          }
        }
      }
    } catch(e) { console.warn('[getPrice] tier failed:', e); }
  }

  if (tokenUsdPrice === 0) {
    return `❌ **Failed to fetch price:** Could not find price data for **${coinId.toUpperCase()}** on CMC, CoinGecko, or DexScreener.`;
  }

  // Final Math: Amount * Token(USD) * USDT(Fiat Rate)
  const finalPricePerUnit = tokenUsdPrice * fiatRate;
  const isPositive = change24h >= 0;
  const arrow = isPositive ? '📈 🟩 +' : '📉 🟥 ';
  
  const formatter = new Intl.NumberFormat(cur === 'idr' ? 'id-ID' : 'en-US', { style: 'currency', currency: curUpper });
  const priceFormatted = formatter.format(finalPricePerUnit);
  const changeFormatted = change24h ? change24h.toFixed(2) : '0.00';

  let report = `💰 **Price Update for ${tokenName}**\n\n`;
  if (amount !== undefined && amount !== null) {
    const totalVal = amount * finalPricePerUnit;
    const totalFormatted = formatter.format(totalVal);
    report += `- **Amount**: ${amount} ${tokenName}\n`;
    report += `- **Price per Unit (${curUpper})**: \`${priceFormatted}\`\n`;
    report += `- **Total Value**: \`${totalFormatted}\`\n`;
  } else {
    report += `- **Price (${curUpper})**: \`${priceFormatted}\`\n`;
  }
  report += `- **24h Change**: ${arrow}${changeFormatted}%\n`;
  if (cur !== 'usd' && cur !== 'usdt') {
    report += `- **USDT Rate**: \`${formatter.format(fiatRate)}\` / USDT\n`;
  }
  report += `_Source: ${source} (Token) | Live Fiat Oracle (USDT Rate)_`;

  return report;
}
