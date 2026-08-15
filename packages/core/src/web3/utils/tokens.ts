import { ChainName } from '../config';
import { getUserWhitelist } from '../../utils/userWhitelistManager';

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  }
] as const;

export const TOKEN_MAP: Record<ChainName, Record<string, `0x${string}`>> = {
  ethereum: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  },
  arbitrum: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f352415231c111",
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "USDC.E": "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
  },
  base: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
  },
  optimism: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    USDT: "0x94b008aA00579c1307b0EF2c499aD98a8ce58e58"
  },
  bsc: {
    BNB: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32CD580d",
    USDT: "0x55d398326f99059fF775485246999027B3197955"
  },
  sepolia: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Circle Faucet Sepolia USDC
    USDT: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0"  // Common Sepolia USDT
  },
  polygon: {
    MATIC: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    POL: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    WPOL: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  },
  base_sepolia: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  },
  arbitrum_sepolia: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  },
  optimism_sepolia: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  },
  robinhood: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    // WETH on Robinhood chain — required for native ETH price lookup via DexScreener.
    // Confirmed from DexScreener live pairs: https://dexscreener.com/robinhood
    WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  },
  robinhood_testnet: {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  }
};

export function resolveToken(tokenSymbolOrAddress: string, chainName: ChainName): `0x${string}` {
  if (tokenSymbolOrAddress.startsWith("0x") && tokenSymbolOrAddress.length === 42) {
    return tokenSymbolOrAddress as `0x${string}`;
  }
  
  const symbolUpper = tokenSymbolOrAddress.toUpperCase().trim();
  
  if (["ETH", "MATIC", "POL", "BNB", "AVAX", "NATIVE"].includes(symbolUpper)) {
    return "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  }

  const chainTokens = TOKEN_MAP[chainName];
  if (chainTokens && chainTokens[symbolUpper]) {
    return chainTokens[symbolUpper];
  }

  const whitelistData = getUserWhitelist();
  for (const addr in whitelistData) {
    const tokens = whitelistData[addr];
    const match = tokens.find(t => t.chainName === chainName && t.symbol === symbolUpper);
    if (match) return match.address as `0x${string}`;
  }

  throw new Error(`Token "${tokenSymbolOrAddress}" on chain ${chainName} was not found. Please use the direct contract address (0x...).`);
}

export interface TokenMetadata {
  decimals: number;
  symbol: string;
}

// Bounded LRU Cache to prevent RAM bloat from fake tokens (OOM protection)
const MAX_CACHE_SIZE = 1000;
const tokenMetadataCache = new Map<string, TokenMetadata>();

export async function getTokenMetadata(client: any, tokenAddress: `0x${string}`): Promise<TokenMetadata> {
  // If it's the native token address placeholder — return a generic 'NATIVE' symbol.
  // We can't know the exact symbol (ETH, BNB, MATIC) without the chain context here.
  // Callers that need the exact symbol should resolve it from nativeSymbolMap in their own context.
  if (tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" || tokenAddress === "0x0000000000000000000000000000000000000000") {
    return { decimals: 18, symbol: "NATIVE" };
  }

  const cacheKey = `${client.chain?.id || 'unknown'}-${tokenAddress.toLowerCase()}`;
  if (tokenMetadataCache.has(cacheKey)) {
    return tokenMetadataCache.get(cacheKey)!;
  }

  // Multicall Chunking: Reduce HTTP overhead by batching decimals and symbol in 1 request
  let decimals = 18;
  let symbol = "TOKEN";
  try {
    const results = await client.multicall({
      contracts: [
        { address: tokenAddress, abi: ERC20_ABI, functionName: 'decimals' },
        { address: tokenAddress, abi: ERC20_ABI, functionName: 'symbol' }
      ]
    });
    if (results[0].status === 'success') decimals = results[0].result as number;
    if (results[1].status === 'success') symbol = results[1].result as string;
  } catch {}

  const metadata: TokenMetadata = { decimals, symbol };

  // Evict oldest (Map iterates in insertion order)
  if (tokenMetadataCache.size >= MAX_CACHE_SIZE) {
    const firstKey = tokenMetadataCache.keys().next().value;
    if (firstKey) tokenMetadataCache.delete(firstKey);
  }
  
  tokenMetadataCache.set(cacheKey, metadata);
  return metadata;
}

// Self-Healing Cache: Invalidates cache if a transaction fails (e.g. proxy upgrade changing decimals)
export function invalidateTokenCache(client: any, tokenAddress: `0x${string}`) {
  const cacheKey = `${client.chain?.id || 'unknown'}-${tokenAddress.toLowerCase()}`;
  tokenMetadataCache.delete(cacheKey);
}

// Preload Allowance Dinamis (Boot-up)
export async function preloadTokenMetadataAndAllowance(client: any, userAddress: `0x${string}`, chainName: ChainName) {
  const tokens = Object.values(TOKEN_MAP[chainName] || {});
  const contracts = [];
  
  for (const token of tokens) {
    if (token === "0x0000000000000000000000000000000000000000" || token === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") continue;
    contracts.push({ address: token, abi: ERC20_ABI, functionName: 'decimals' });
    contracts.push({ address: token, abi: ERC20_ABI, functionName: 'symbol' });
    // In actual AA flow, you'd add allowance checks here against common spenders.
  }

  // Chunking multicall in batches of 20
  const CHUNK_SIZE = 20;
  for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
    const chunk = contracts.slice(i, i + CHUNK_SIZE);
    await client.multicall({ contracts: chunk }).catch(() => null); // Fire and forget in background
  }
}
