# Custom DeFi Providers

Nyxora features an **Extensible DeFi Liquidity-Routing Runtime** (Meta-Aggregator v2). This architecture allows community developers and users to seamlessly integrate any third-party Decentralized Exchange (DEX), Bridge, or Aggregator into Nyxora's routing engine with **zero friction**.

Because of the **Auto-Discovery** mechanism in the `AggregatorRegistry`, you do not need to modify the core routing engine (`defiRouter.ts`). You simply drop a single file into the `providers` folder!

---

## ✨ Step-by-Step Integration Guide

### 1. Create a New TypeScript File
Navigate to the providers directory in the core package:
`packages/core/src/web3/aggregator/providers/`

Create a new file, for example: `JupiterProvider.ts`.

### 2. Implement the `DefiAggregatorProvider` Interface
Your class must adhere to the standard provider interface. This guarantees that Nyxora can treat your provider equally alongside 1inch, 0x, and LI.FI during parallel Hedged Fetching.

Here is a complete template:

```typescript
import { 
  DefiAggregatorProvider, 
  ProviderExecutionContext, 
  ProviderHealth, 
  ProviderManifest, 
  QuoteRequest, 
  CanonicalRouteQuote 
} from '../types';

export class JupiterProvider implements DefiAggregatorProvider {
  // 1. The Provider Manifest (Auto-read by Dashboard UI!)
  public manifest: ProviderManifest = {
    id: 'jupiter',
    name: 'Jupiter Aggregator',
    version: '1.0.0',
    networks: ['mainnet'],
    capabilities: ['swap'],
    // Declare API Keys here. The Dashboard UI will auto-generate the input fields!
    requiredApiKeys: [], 
    allowedDomains: ['quote-api.jup.ag'],
    permissions: {
      network: true,
      // SECURITY REQUIREMENT: MUST be 'none'. 
      // If you request 'sign', your provider will be blocked at boot.
      walletAccess: 'none', 
      filesystem: 'none'
    }
  };

  // Does this provider support cross-chain bridging?
  public isCrossChainSupported(): boolean {
    return false;
  }

  // 2. Routing Eligibility Check
  // Tell the router if you support the requested chains/tokens
  public supports(request: QuoteRequest): boolean {
    // Example: Jupiter only supports Solana
    return request.fromChain === 'solana' && request.toChain === 'solana';
  }

  // 3. Core Logic: Fetch and Normalize Quote
  public async getQuote(request: QuoteRequest, context: ProviderExecutionContext): Promise<CanonicalRouteQuote> {
    // ALWAYS use context.abortSignal to respect Nyxora's timeout constraints
    const res = await fetch(`https://quote-api.jup.ag/v6/quote?...`, { 
      signal: context.abortSignal 
    });
    
    if (!res.ok) throw new Error("Jupiter API failed");
    const data = await res.json();

    return {
      provider: this.manifest.name,
      routeId: `jup-${Date.now()}`,
      fromChainId: 101, // Solana mock ID
      toChainId: 101,
      inputAmount: BigInt(request.amountInWei),
      outputAmount: BigInt(data.outAmount),
      executable: true,
      expiresAt: Date.now() + 60000,
      execution: {
        target: data.programId,
        calldata: data.transactionData,
        value: BigInt(0)
      },
      raw: data
    };
  }

  // 4. Circuit Breaker Health Check
  public async isHealthy(): Promise<ProviderHealth> {
    return { ok: true, checkedAt: Date.now() };
  }
}
```

### 3. Restart Nyxora
Save the file and restart your Nyxora Daemon (`nyxora restart`). 

Upon boot:
1. `providerRegistry.ts` will recursively scan the `providers/` directory.
2. It will discover `JupiterProvider.ts`.
3. It will verify that your `walletAccess` permission is securely set to `'none'`.
4. Jupiter will instantly be included in the `Promise.allSettled` fetching race alongside all other DEXs!

---

## 🏗️ Zero-Trust Architecture

You might be wondering: **Why is `walletAccess: 'sign'` strictly blocked?**

In Nyxora, a Provider's **ONLY** responsibility is to query external APIs and return the mathematical blueprint (the `calldata`) of a transaction. 

**Providers must NEVER touch Private Keys.** 

Transaction signing is securely isolated deep within Nyxora's native Vault Client. Once your Provider returns the `CanonicalRouteQuote`, Nyxora places it into the `txManager` pending queue and alerts the user. Only when the user manually clicks **Approve** in the Dashboard will the Vault Client sign and execute the payload. 

This Zero-Trust sandbox guarantees that even if a user installs a malicious community provider, the provider is physically incapable of draining funds or signing rogue transactions in the background.

---

## ✨ Dynamic UI Integration

If your provider requires a private API key (to bypass rate limits), simply declare it in your manifest:

```typescript
requiredApiKeys: [
  {
    id: 'jup_premium_key',
    label: 'Jupiter Premium API Key',
    required: false,
    docsUrl: 'https://jup.ag/api-keys'
  }
]
```

**Magic:** You do NOT need to write any React code for the form itself. Nyxora's Dashboard reads the active manifests via `/api/defi-keys` and will dynamically render a new password input field titled **"Jupiter Premium API Key"** on the **DeFi Configuration** page!

### 🔸 Adding Your Custom Logo
By default, custom providers will render without a logo. To display a beautiful icon next to your custom DeFi configuration field:
1. Place your transparent icon file (e.g., `jupiter.png`) inside `packages/dashboard/public/routers/`.
2. Open `packages/dashboard/src/utils/logos.ts`.
3. Add your provider's `id` (or the API key `id` from your manifest) to the `getRouterLogoUrl` mapping:
   ```typescript
   case 'jup_premium_key': return '/routers/jupiter.png';
   ```
4. Rebuild the dashboard: `npm run build --workspace=packages/dashboard`.

---

## 🔹 Autonomous Installation (Self-Upgrading AI)

Don't want to deal with manual file creation? Nyxora's Local Agent comes equipped with the `install_defi_provider` skill.

You can simply tell your Nyxora Agent in the chat:
> *"Hey Nyxora, please install the Jupiter DEX provider from this Github link: https://github.com/perasyudha/plugins/blob/main/JupiterProvider.ts"*

### 🚀 How the Autonomous Installer Works:
1. **URL Translation:** Nyxora automatically converts standard Github web URLs into `raw.githubusercontent.com` direct download links.
2. **Security Scan:** Nyxora downloads the code into memory and performs a Regex scan. If the developer maliciously requested `walletAccess: 'sign'`, Nyxora's firewall will immediately block the file from being saved.
3. **LLM Self-Healing:** If the downloaded code is blocked because it is simply missing the `walletAccess: 'none'` string, the skill won't crash. Instead, it throws a textual error back to the LLM. Nyxora will read the code in its memory, *inject the missing security policy*, and seamlessly try saving it again.
4. **Activation:** The agent saves the secure, healed TypeScript file directly to your `providers/` directory. Just restart the daemon and your new provider is ready to route!
