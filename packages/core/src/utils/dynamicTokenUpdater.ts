import fs from 'fs';
import path from 'path';
import os from 'os';
import { safeFetchJson } from './httpClient';

const CACHE_FILE = path.join(os.homedir(), '.nyxora', 'dynamic_tokens.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const TOKEN_LIST_URLS: Record<string, string> = {
  ethereum: 'https://tokens.coingecko.com/uniswap/all.json',
  base: 'https://raw.githubusercontent.com/ethereum-optimism/ethereum-optimism.github.io/master/optimism.tokenlist.json',
  arbitrum: 'https://bridge.arbitrum.io/token-list-42161.json',
  optimism: 'https://static.optimism.io/optimism.tokenlist.json',
  bsc: 'https://tokens.pancakeswap.finance/pancakeswap-extended.json'
};

// Numeric chainId for each chain so we can filter token lists by chainId field
const CHAIN_ID_MAP: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  bsc: 56,
};

export interface DynamicTokens {
  [chainName: string]: Array<{ symbol: string, address: string }>;
}

export async function fetchDynamicTokens(): Promise<DynamicTokens> {
  // Check cache first
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      if (Date.now() - stats.mtimeMs < CACHE_TTL) {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      }
    }
  } catch {}

  const result: DynamicTokens = {};
  console.log('[DynamicTokenUpdater] Fetching updated token lists...');

  const fetchPromises = Object.entries(TOKEN_LIST_URLS).map(async ([chain, url]) => {
    try {
      const data = await safeFetchJson<any>(url, { timeoutMs: 8000 });
      
      let tokens: Array<{symbol: string, address: string}> = [];
      const targetChainId = CHAIN_ID_MAP[chain];

      if (data && data.tokens && Array.isArray(data.tokens)) {
        // Filter strictly by chainId to prevent cross-chain token bleed
        const filtered = targetChainId
          ? data.tokens.filter((t: any) => t.chainId === targetChainId)
          : data.tokens;
        // Limit to top 50 to avoid massive multicall
        const topTokens = filtered.slice(0, 50);
        tokens = topTokens.map((t: any) => ({
          symbol: t.symbol,
          address: t.address
        }));
      }
      
      return { chain, tokens };
    } catch (err) {
      console.warn(`[DynamicTokenUpdater] Failed to fetch list for ${chain}:`, err);
      return { chain, tokens: [] };
    }
  });

  const results = await Promise.all(fetchPromises);
  for (const { chain, tokens } of results) {
    result[chain] = tokens;
  }

  // Save to cache
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2), 'utf-8');
  } catch (e) {
    console.error('[DynamicTokenUpdater] Failed to write cache', e);
  }

  return result;
}

export async function getDynamicTokensForChain(chainName: string): Promise<Array<{symbol: string, address: string}>> {
  const allTokens = await fetchDynamicTokens();
  return allTokens[chainName] || [];
}
