import { DefiAggregatorProvider, ProviderExecutionContext, ProviderHealth, ProviderManifest, QuoteRequest, CanonicalRouteQuote } from '../types';
import { safeFetch } from '../../../utils/httpClient';
import crypto from 'crypto';

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1, base: 8453, bsc: 56, arbitrum: 42161, optimism: 10, polygon: 137, robinhood: 4663
};

export class OpenOceanProvider implements DefiAggregatorProvider {
  public manifest: ProviderManifest = {
    id: 'openocean',
    name: 'OpenOcean',
    version: '1.0.0',
    networks: ['mainnet'],
    capabilities: ['swap'],
    allowedDomains: ['open-api.openocean.finance'],
    permissions: {
      network: true,
      walletAccess: 'none',
      filesystem: 'none'
    }
  };

  public isCrossChainSupported(): boolean {
    return false;
  }

  public supports(request: QuoteRequest): boolean {
    if (request.fromChain !== request.toChain) return false;
    if (!CHAIN_IDS[request.fromChain]) return false;
    return true;
  }

  public async getQuote(request: QuoteRequest, context: ProviderExecutionContext): Promise<CanonicalRouteQuote> {
    const chainId = CHAIN_IDS[request.fromChain];
    const slippage = request.slippageTolerance === "auto" ? "0.5" : request.slippageTolerance.toString();
    
    const inTokenAddress = request.fromToken;
    const outTokenAddress = request.toToken;
    
    // OpenOcean v3 API requires the human-readable amount (e.g., '1' for 1 USDC), not wei.
    if (!request.amountFormatted) {
      throw new Error("OpenOceanProvider requires 'amountFormatted' (decimal string) in QuoteRequest.");
    }
    const amount = request.amountFormatted;
    const account = request.userAddress;

    // NOTE: We omit gasPrice from the query to let OpenOcean estimate it dynamically.
    // Hard-coding gasPrice=5 (gwei) was too low for Ethereum mainnet and caused stuck transactions.
    const url = `https://open-api.openocean.finance/v3/${chainId}/swap_quote?inTokenAddress=${inTokenAddress}&outTokenAddress=${outTokenAddress}&amount=${amount}&slippage=${slippage}&account=${account}`;

    const res = await safeFetch(url, {
      signal: context.abortSignal,
      retries: 0
    });

    if (!res.ok) {
      throw new Error(`OpenOcean API Error: ${await res.text()}`);
    }

    const json = await res.json();
    if (json.code !== 200 || !json.data) {
      throw new Error(`OpenOcean Route Error: ${json.error || 'Unknown error'}`);
    }

    const data = json.data;

    if (!data.outAmount) throw new Error('OpenOcean returned no output amount (outAmount is missing). The token pair may have insufficient liquidity.');

    return {
      provider: this.manifest.name,
      routeId: `openocean-${crypto.randomUUID()}`,
      fromChainId: chainId,
      toChainId: chainId,
      inputAmount: BigInt(request.amountInWei || "0"),
      outputAmount: BigInt(data.outAmount),
      executable: true,
      expiresAt: Date.now() + 60000,
      approvalAddress: data.to,
      execution: {
        target: data.to,
        calldata: data.data,
        value: BigInt(data.value || 0)
      },
      raw: json
    };
  }

  public async isHealthy(context: ProviderExecutionContext): Promise<ProviderHealth> {
    try {
      const res = await safeFetch('https://open-api.openocean.finance/v3/1/tokenList?limit=1', { signal: context.abortSignal });
      return { ok: res.ok, checkedAt: Date.now() };
    } catch (e: any) {
      return { ok: false, checkedAt: Date.now(), reason: e.message };
    }
  }
}
