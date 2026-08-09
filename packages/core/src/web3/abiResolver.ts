import { chainRegistry } from './chainRegistry';

export interface ParsedFunction {
  name: string;
  type: 'function';
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
}

class AbiResolver {
  private abiCache: Map<string, any[]> = new Map();

  /**
   * Manually register an ABI for a custom contract (e.g. on testnets without explorer verification).
   */
  public registerManualAbi(contractAddress: string, abi: any[]): void {
    const key = contractAddress.toLowerCase();
    this.abiCache.set(key, abi);
    console.log(`✅ [AbiResolver] Manual ABI registered for ${contractAddress} (${abi.length} items)`);
  }

  /**
   * Get cached ABI or fetch automatically from Explorer / Sourcify.
   */
  public async getOrFetchAbi(contractAddress: string, chainIdOrName: string | number): Promise<any[] | null> {
    const key = contractAddress.toLowerCase();
    if (this.abiCache.has(key)) {
      return this.abiCache.get(key)!;
    }

    const chain = chainRegistry.getChain(chainIdOrName);
    const explorerUrl = chain?.blockExplorers?.default?.url;

    // 1. Try Explorer API (Etherscan/Basescan/Blockscout format)
    if (explorerUrl) {
      try {
        const apiUrl = `${explorerUrl.replace(/\/$/, '')}/api?module=contract&action=getabi&address=${contractAddress}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const data: any = await res.json();
          if (data.status === '1' && data.result) {
            const parsed = JSON.parse(data.result);
            this.abiCache.set(key, parsed);
            console.log(`✅ [AbiResolver] Fetched ABI from Explorer for ${contractAddress}`);
            return parsed;
          }
        }
      } catch (e: any) {
        console.warn(`[AbiResolver] Explorer ABI fetch failed: ${e.message}`);
      }
    }

    // 2. Try Sourcify Repository
    if (chain?.id) {
      try {
        const sourcifyUrl = `https://repo.sourcify.dev/contracts/full_match/${chain.id}/${contractAddress}/metadata.json`;
        const res = await fetch(sourcifyUrl);
        if (res.ok) {
          const data: any = await res.json();
          if (data.output && data.output.abi) {
            this.abiCache.set(key, data.output.abi);
            console.log(`✅ [AbiResolver] Fetched ABI from Sourcify for ${contractAddress}`);
            return data.output.abi;
          }
        }
      } catch (e: any) {
        console.warn(`[AbiResolver] Sourcify ABI fetch failed: ${e.message}`);
      }
    }

    return null;
  }

  /**
   * Extract executable functions from an ABI.
   */
  public parseAbiFunctions(abi: any[]): ParsedFunction[] {
    if (!Array.isArray(abi)) return [];
    return abi
      .filter((item) => item.type === 'function')
      .map((item) => ({
        name: item.name,
        type: 'function',
        stateMutability: item.stateMutability || (item.constant ? 'view' : 'nonpayable'),
        inputs: (item.inputs || []).map((inp: any) => ({ name: inp.name || 'param', type: inp.type })),
        outputs: (item.outputs || []).map((out: any) => ({ name: out.name || 'result', type: out.type })),
      }));
  }
}

export const abiResolver = new AbiResolver();
