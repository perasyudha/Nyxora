import { DefiAggregatorProvider, ProviderExecutionContext, ProviderHealth, ProviderManifest, QuoteRequest, CanonicalRouteQuote } from '../types';
import { safeFetch } from '../../../utils/httpClient';
import crypto from 'crypto';

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1, base: 8453, bsc: 56, arbitrum: 42161, optimism: 10, polygon: 137, robinhood: 4663
};

export class OneInchProvider implements DefiAggregatorProvider {
  public manifest: ProviderManifest = {
    id: 'oneinch',
    name: '1inch Network',
    version: '1.0.0',
    networks: ['mainnet'],
    capabilities: ['swap'],
    requiredApiKeys: [
      {
        id: 'inch_key',
        label: '1inch API Key',
        envKey: 'INCH_API_KEY',
        required: true,
        secret: true,
        docsUrl: 'https://portal.1inch.dev'
      }
    ],
    allowedDomains: ['api.1inch.dev'],
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
    // 1inch only supports same-chain swaps on specific mainnets
    if (request.fromChain !== request.toChain) return false;
    if (!CHAIN_IDS[request.fromChain]) return false;
    return true;
  }

  public async getQuote(request: QuoteRequest, context: ProviderExecutionContext): Promise<CanonicalRouteQuote> {
    const key = context.apiKeys['inch_key'];
    if (!key) {
      throw new Error(`[OneInchProvider] Missing required API key 'inch_key'`);
    }

    const chainId = CHAIN_IDS[request.fromChain];
    const slippage = request.slippageTolerance === "auto" ? "0.5" : request.slippageTolerance.toString();
    // Re-added &disableEstimate=true to prevent 1inch API from returning 400 Bad Request on unapproved tokens
    const url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap?src=${request.fromToken}&dst=${request.toToken}&amount=${request.amountInWei}&from=${request.userAddress}&slippage=${slippage}&disableEstimate=true`;

    const res = await safeFetch(url, {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: context.abortSignal,
      retries: 0
    });

    if (!res.ok) {
      throw new Error(`1inch API Error: ${await res.text()}`);
    }

    const data = await res.json();

    if (!data.dstAmount) throw new Error('1inch returned no output amount (dstAmount is missing). The token pair may have insufficient liquidity.');

    return {
      provider: this.manifest.name,
      routeId: `1inch-${crypto.randomUUID()}`,
      fromChainId: chainId,
      toChainId: chainId,
      inputAmount: BigInt(request.amountInWei),
      outputAmount: BigInt(data.dstAmount),
      executable: true,
      expiresAt: Date.now() + 60000, // Quote valid for roughly 60s
      execution: {
        target: data.tx.to,
        calldata: data.tx.data,
        value: BigInt(data.tx.value || 0)
      },
      raw: data
    };
  }

  public async isHealthy(context: ProviderExecutionContext): Promise<ProviderHealth> {
    // Usually ping an endpoint, but for now we assume true if not rate-limited
    return { ok: true, checkedAt: Date.now() };
  }
}
