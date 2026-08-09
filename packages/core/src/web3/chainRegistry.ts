import { defineChain, Chain } from 'viem';
import { supportedChains, normalizeChainName } from './utils/chains';

export interface CustomChainConfig {
  name: string; // e.g. "monad_testnet", "berachain_artio"
  chainId: number;
  rpcUrl: string;
  explorerUrl?: string;
  nativeSymbol?: string;
  nativeDecimals?: number;
  faucetUrl?: string;
}

class ChainRegistry {
  private customChains: Map<string, Chain> = new Map();
  private chainConfigs: Map<string, CustomChainConfig> = new Map();

  constructor() {
    // Load pre-existing viem chains into registry
    for (const [key, chain] of Object.entries(supportedChains)) {
      this.customChains.set(key, chain as Chain);
    }
  }

  /**
   * Register a new chain or custom testnet manually at runtime.
   */
  public registerCustomChain(config: CustomChainConfig): Chain {
    const key = normalizeChainName(config.name);
    const nativeSymbol = config.nativeSymbol || 'ETH';
    const decimals = config.nativeDecimals || 18;

    const viemChain = defineChain({
      id: config.chainId,
      name: config.name,
      nativeCurrency: {
        name: nativeSymbol,
        symbol: nativeSymbol,
        decimals: decimals,
      },
      rpcUrls: {
        default: { http: [config.rpcUrl] },
        public: { http: [config.rpcUrl] },
      },
      blockExplorers: config.explorerUrl
        ? {
            default: { name: 'Explorer', url: config.explorerUrl },
          }
        : undefined,
    });

    this.customChains.set(key, viemChain);
    this.chainConfigs.set(key, config);
    console.log(`✅ [ChainRegistry] Custom chain registered: ${config.name} (ID: ${config.chainId}, RPC: ${config.rpcUrl})`);
    return viemChain;
  }

  /**
   * Get Viem Chain definition by name or chain ID.
   */
  public getChain(nameOrId: string | number): Chain | undefined {
    if (typeof nameOrId === 'number') {
      for (const chain of this.customChains.values()) {
        if (chain.id === nameOrId) return chain;
      }
      return undefined;
    }

    const key = normalizeChainName(nameOrId);
    return this.customChains.get(key);
  }

  /**
   * Fetch chain configuration from Chainlist API if not present in registry.
   */
  public async fetchAndRegisterChainlist(chainId: number): Promise<Chain | undefined> {
    try {
      const res = await fetch(`https://chainid.network/chains.json`);
      if (!res.ok) return undefined;
      const chainsData: any[] = await res.json();
      const found = chainsData.find((c) => c.chainId === chainId);

      if (found && found.rpc && found.rpc.length > 0) {
        const validRpc = found.rpc.find((r: string) => r.startsWith('https://') && !r.includes('${'));
        if (validRpc) {
          return this.registerCustomChain({
            name: found.shortName || found.name,
            chainId: found.chainId,
            rpcUrl: validRpc,
            explorerUrl: found.explorers?.[0]?.url,
            nativeSymbol: found.nativeCurrency?.symbol || 'ETH',
          });
        }
      }
    } catch (e: any) {
      console.warn(`[ChainRegistry] Chainlist fetch failed for chainId ${chainId}: ${e.message}`);
    }
    return undefined;
  }

  public getRegisteredChainNames(): string[] {
    return Array.from(this.customChains.keys());
  }

  public getConfig(nameOrId: string | number): CustomChainConfig | undefined {
    const chain = this.getChain(nameOrId);
    if (!chain) return undefined;
    const key = normalizeChainName(chain.name);
    return this.chainConfigs.get(key) || {
      name: chain.name,
      chainId: chain.id,
      rpcUrl: chain.rpcUrls.default.http[0],
      explorerUrl: chain.blockExplorers?.default?.url,
      nativeSymbol: chain.nativeCurrency.symbol,
    };
  }
}

export const chainRegistry = new ChainRegistry();
