import { normalizeChainName } from '../utils/chains';
import { formatEther, formatUnits } from 'viem';
import { getPublicClient, ChainName, SUPPORTED_CHAIN_NAMES } from '../config';
import { TOKEN_MAP, ERC20_ABI } from '../utils/tokens';
import { safeFetchJson } from '../../utils/httpClient';

const portfolioCache: Record<string, { data: string, timestamp: number }> = {};
const CACHE_TTL = 5000; // 5 seconds TTL

const TESTNET_CHAINS = new Set(['sepolia', 'base_sepolia', 'arbitrum_sepolia', 'optimism_sepolia', 'robinhood_testnet']);

export async function checkPortfolio(chainName: ChainName, address?: `0x${string}`): Promise<string> {
  try {
    chainName = normalizeChainName(chainName);
    const isTestnet = TESTNET_CHAINS.has(chainName);
    const client = getPublicClient(chainName);
    
    let targetAddress = address;
    if (!targetAddress) {
      const { getAddress } = await import('../config');
      targetAddress = (await getAddress()) as `0x${string}`;
    }

    if (!targetAddress) {
      throw new Error('Address is required but could not be resolved from private key.');
    }

    const safeTargetAddress = String(targetAddress || "");
    const cacheKey = `${chainName}:${safeTargetAddress.toLowerCase()}`;
    const now = Date.now();
    if (portfolioCache[cacheKey] && now - portfolioCache[cacheKey].timestamp < CACHE_TTL) {
      return portfolioCache[cacheKey].data + `\n\n*(Cached from ${(now - portfolioCache[cacheKey].timestamp) / 1000}s ago)*`;
    }

    const nativeSymbolMap: Record<string, string> = {
      ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC',
      base: 'ETH', arbitrum: 'ETH', optimism: 'ETH',
      sepolia: 'ETH', base_sepolia: 'ETH',
      // BUG #1 FIX: Complete the map for all supported chains
      arbitrum_sepolia: 'ETH', optimism_sepolia: 'ETH',
      robinhood: 'ETH', robinhood_testnet: 'ETH'
    };
    const nativeSymbol = nativeSymbolMap[chainName] || 'ETH';

    const tokensToScan: Array<{ symbol: string, address: `0x${string}`, isNative: boolean }> = [
      { symbol: nativeSymbol, address: '0x0000000000000000000000000000000000000000', isNative: true }
    ];

    const chainTokens = TOKEN_MAP[chainName];

    // BUG #2 FIX: Map each chain's native token to its wrapped version for price lookup.
    // Previously, Polygon MATIC was always $0 because TOKEN_MAP.polygon has no 'WETH' or 'WBNB'.
    // Must be declared AFTER chainTokens to avoid "used before declaration" TS error.
    const NATIVE_WRAPPED_MAP: Record<string, string | undefined> = {
      ethereum:          chainTokens?.WETH,
      base:              chainTokens?.WETH,
      arbitrum:          chainTokens?.WETH,
      optimism:          chainTokens?.WETH,
      sepolia:           chainTokens?.WETH,
      base_sepolia:      chainTokens?.WETH,
      arbitrum_sepolia:  chainTokens?.WETH,
      optimism_sepolia:  chainTokens?.WETH,
      bsc:               chainTokens?.WBNB,
      polygon:           chainTokens?.WMATIC || chainTokens?.WPOL,
      robinhood:         chainTokens?.WETH,
      robinhood_testnet: chainTokens?.WETH,
    };
    const nativeWrappedAddress = NATIVE_WRAPPED_MAP[chainName];

    if (chainTokens) {
      for (const [sym, addr] of Object.entries(chainTokens)) {
        if (addr !== "0x0000000000000000000000000000000000000000") {
          tokensToScan.push({ symbol: sym, address: addr as `0x${string}`, isNative: false });
        }
      }
    }

    // Merge User-Defined Whitelist
    const { getUserTokens } = await import('../../utils/userWhitelistManager');
    const userCustomTokens = getUserTokens(targetAddress, chainName);
    
    for (const tokenAddr of userCustomTokens) {
      if (!tokensToScan.find(t => String(t.address).toLowerCase() === String(tokenAddr).toLowerCase())) {
        tokensToScan.push({ symbol: 'Token', address: tokenAddr as `0x${string}`, isNative: false });
      }
    }

    // Merge Dynamic Trending Whitelist (CoinGecko lists)
    // ⚠️ Skip on testnets: token lists are mainnet-only and would cause false positives
    if (!isTestnet) {
      const { getDynamicTokensForChain } = await import('../../utils/dynamicTokenUpdater');
      const dynamicTokens = await getDynamicTokensForChain(chainName);
      for (const dToken of dynamicTokens) {
        if (!tokensToScan.find(t => String(t.address).toLowerCase() === String(dToken.address).toLowerCase())) {
          tokensToScan.push({ symbol: dToken.symbol, address: dToken.address as `0x${string}`, isNative: false });
        }
      }
    }

    // Merge Flexible Auto-Detect (Rabby Wallet style via Blockscout V2)
    // This fetches all ERC-20 tokens the user ACTUALLY holds instead of just guessing
    const BLOCKSCOUT_DOMAINS: Record<string, string> = {
      ethereum: 'https://eth.blockscout.com',
      base: 'https://base.blockscout.com',
      optimism: 'https://optimism.blockscout.com',
      arbitrum: 'https://arbitrum.blockscout.com',
      polygon: 'https://polygon.blockscout.com',
      sepolia: 'https://eth-sepolia.blockscout.com',
      robinhood: 'https://robinhoodchain.blockscout.com',
    };
    
    const blockscoutDomain = BLOCKSCOUT_DOMAINS[chainName];
    if (blockscoutDomain) {
      try {
        const explorerUrl = `${blockscoutDomain}/api/v2/addresses/${targetAddress}/token-balances`;
        const { safeFetchJson } = await import('../../utils/httpClient');
        const tokenBalances = await safeFetchJson<any[]>(explorerUrl);
        
        if (Array.isArray(tokenBalances)) {
          for (const item of tokenBalances) {
            const token = item.token;
            if (token && token.type === 'ERC-20' && token.address_hash) {
              if (!tokensToScan.find(t => String(t.address).toLowerCase() === String(token.address_hash).toLowerCase())) {
                tokensToScan.push({ 
                  symbol: token.symbol || 'Token', 
                  address: token.address_hash as `0x${string}`, 
                  isNative: false 
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[checkPortfolio] Flexible Auto-detect failed for ${chainName}:`, err);
      }
    }

    const testnetWarning = isTestnet
      ? `\n> ⚠️ **Testnet Mode** — USD prices are not available for testnet tokens. Only native ETH balances are real.\n`
      : '';
    let report = `📊 **Portfolio for ${targetAddress} on ${chainName.toUpperCase()}**${testnetWarning}\n\n`;
    let totalUsdValue = 0;

    // 1. Fetch Native Balance directly (works on all chains even without Multicall3)
    let nativeBalanceNum = 0;
    try {
      const nativeRaw = await client.getBalance({ address: targetAddress as `0x${string}` });
      nativeBalanceNum = parseFloat(formatEther(nativeRaw));
    } catch (e) {
      console.error(`Failed to get native balance for ${chainName}:`, e);
    }

    // 2. Prepare Multicall for ERC20s only
    const contracts: any[] = [];
    for (const t of tokensToScan) {
      if (!t.isNative) {
        contracts.push({ address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [targetAddress as `0x${string}`] });
        contracts.push({ address: t.address, abi: ERC20_ABI, functionName: 'decimals' });
      }
    }

    const CHUNK_SIZE = 60; // 30 tokens (2 calls per token)
    const multicallResults: any[] = [];
    
    // BUG #9 FIX: Use an aborted flag to prevent the background multicall loop from
    // pushing to multicallResults after we've already read it (race condition).
    let multicallAborted = false;
    try {
      if (contracts.length > 0) {
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => {
            multicallAborted = true;
            reject(new Error('RPC request timed out'));
          }, 5000)
        );

        const executionPromise = (async () => {
          for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
            if (multicallAborted) break; // Stop fetching new chunks if timed out
            const chunk = contracts.slice(i, i + CHUNK_SIZE);
            const res = await client.multicall({ contracts: chunk, allowFailure: true } as any);
            if (!multicallAborted) multicallResults.push(...res);
          }
        })();

        await Promise.race([executionPromise, timeoutPromise]);
      }
    } catch (e: any) {
      console.warn(`[checkPortfolio] Multicall timeout or fail on ${chainName}, proceeding with native balance only.`);
    }

    // Map results back to tokens
    let resultIndex = 0;
    const balances = tokensToScan.map((t) => {
      let balanceNum = 0;
      if (t.isNative) {
        balanceNum = nativeBalanceNum;
      } else {
        const balResult = multicallResults[resultIndex++];
        const decResult = multicallResults[resultIndex++];
        if (balResult?.status === 'success' && balResult.result !== undefined && decResult?.status === 'success' && decResult.result !== undefined) {
          balanceNum = parseFloat(formatUnits(balResult.result as bigint, Number(decResult.result)));
        }
      }
      return { ...t, balanceNum };
    });

    const nonZeroBalances = balances.filter(b => b.balanceNum > 0);

    if (nonZeroBalances.length === 0) {
      return report + `No funds found for standard tokens on this chain. Net Worth: $0.00`;
    }

    // Now fetch prices from Dexscreener
    // Prepare addresses to fetch
    // BUG #2 FIX: Use chain-specific wrapped address for native price lookup.
    // Previously used chainTokens?.WETH which was undefined on polygon (causing $0 price for MATIC).
    const addressesToFetch = nonZeroBalances
      .map(b => b.isNative ? nativeWrappedAddress : b.address)
      .filter(Boolean);
    
    const priceMap: Record<string, number> = {};
    if (addressesToFetch.length > 0) {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${addressesToFetch.join(',')}`;
      try {
        const data = await safeFetchJson<any>(url);
        if (data.pairs) {
          data.pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
          const chainMatched = new Set<string>();

          data.pairs.forEach((p: any) => {
            const baseAddr = String(p.baseToken?.address || "").toLowerCase();
            const quoteAddr = String(p.quoteToken?.address || "").toLowerCase();
            const priceUsd = parseFloat(p.priceUsd || "0");
            const priceNative = parseFloat(p.priceNative || "0");

            if (baseAddr && priceUsd > 0) {
               if (!priceMap[baseAddr] || (!chainMatched.has(baseAddr) && p.chainId === chainName)) {
                 priceMap[baseAddr] = priceUsd;
                 if (p.chainId === chainName) chainMatched.add(baseAddr);
               }
            }
            
            if (quoteAddr && priceUsd > 0 && priceNative > 0) {
               const quotePriceUsd = priceUsd / priceNative;
               if (!priceMap[quoteAddr] || (!chainMatched.has(quoteAddr) && p.chainId === chainName)) {
                 priceMap[quoteAddr] = quotePriceUsd;
                 if (p.chainId === chainName) chainMatched.add(quoteAddr);
               }
            }
          });
        }
      } catch {}
    }

    for (const b of nonZeroBalances) {
      const lookupAddr = String((b.isNative ? (chainTokens?.WETH || chainTokens?.WBNB) : b.address) || "").toLowerCase();
      const price = priceMap[lookupAddr] || 0;
      const usdValue = b.balanceNum * price;
      totalUsdValue += usdValue;

      const formattedUsd = usdValue > 0 && usdValue < 0.01 ? usdValue.toFixed(4) : usdValue.toFixed(2);
      
      const pnlIndicator = usdValue > 0 ? '🟢' : (b.isNative ? '🔵' : '⚪');
      report += `${pnlIndicator} **$${b.symbol}** | ${b.balanceNum.toFixed(4)} ${b.symbol}${!isTestnet && usdValue > 0 ? ` ($${formattedUsd})` : ''}\n`;
    }

    report += `\n💰 **Estimated Net Worth: $${totalUsdValue.toFixed(2)}**`;
    
    portfolioCache[cacheKey] = { data: report, timestamp: Date.now() };
    
    return report;
  } catch (error: any) {
    return `Failed to check portfolio: ${error.message}`;
  }
}

export const checkPortfolioToolDefinition = {
  type: "function",
  function: {
    name: "check_portfolio",
    description: "Scans the user's wallet for common tokens on a specific chain (ethereum, base, bsc, arbitrum, optimism, polygon, robinhood, sepolia, base_sepolia, arbitrum_sepolia, optimism_sepolia, robinhood_testnet) and calculates their total USD Net Worth (PNL proxy) using live prices. Supports both mainnets and testnets.",
    parameters: {
      type: "object",
      properties: {
        chainName: {
          type: "string",
          enum: SUPPORTED_CHAIN_NAMES,
          description: "The blockchain network",
        },
        address: {
          type: "string",
          description: "Optional wallet address. If omitted, uses the AI agent's own wallet.",
        }
      },
      required: ["chainName"],
    },
  },
};
