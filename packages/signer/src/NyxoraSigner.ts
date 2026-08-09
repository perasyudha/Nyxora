import fs from 'fs';
import path from 'path';
import os from 'os';
import { Entry } from '@napi-rs/keyring';
import { privateKeyToAccount, PrivateKeyAccount } from 'viem/accounts';
import { createWalletClient, http, publicActions, WalletClient, PublicClient } from 'viem';
import * as chains from 'viem/chains';

export interface NyxoraSignerOptions {
  customRpcUrls?: Record<string, string | string[]>;
}

export class NyxoraSigner {
  private vaultPrivateKey: `0x${string}` | null = null;
  private vaultAddress: string | null = null;
  private account: PrivateKeyAccount | null = null;
  private nonceLocks: Record<number, Promise<void>> = {};
  private nonceCache: Record<number, number> = {};
  private options: NyxoraSignerOptions;

  constructor(options?: NyxoraSignerOptions) {
    this.options = options || {};
  }

  public async unlock(): Promise<string | null> {
    // 1. Try OS Keyring
    try {
      const entry = new Entry('nyxora', 'wallet');
      const pk = await entry.getPassword();
      if (pk) {
        this.setPrivateKey(pk);
        console.log(`✅ [Signer SDK] Vault unlocked securely from OS Keyring. Agent Address: ${this.vaultAddress}`);
        return this.vaultAddress;
      }
    } catch (e) {
      console.warn(`⚠️ [Signer SDK] OS Keyring failed (module mismatch or headless). Using fallback.`);
    }

    // 2. Fallback to vault.key
    const vaultPath = path.join(os.homedir(), '.nyxora', 'auth', 'vault.key');
    if (fs.existsSync(vaultPath)) {
      const stats = fs.statSync(vaultPath);
      const mode = stats.mode & 0o777;
      if (os.platform() !== 'win32' && mode !== 0o600) {
        throw new Error(`FATAL: Insecure permissions detected on vault.key. File permissions must be strictly 0600 (-rw-------). Current permissions: 0${mode.toString(8)}. Refusing to start.`);
      }

      const content = fs.readFileSync(vaultPath, 'utf8');
      const match = content.match(/PRIVATE_KEY=(.+)/);
      if (match && match[1]) {
        this.setPrivateKey(match[1].trim());
        console.log(`✅ [Signer SDK] Vault unlocked from vault.key fallback. Agent Address: ${this.vaultAddress}`);
        return this.vaultAddress;
      }
    }

    console.log(`❌ [Signer SDK] No Private Key found in OS Keyring or vault.key. Web3 features will fail.`);
    return null;
  }

  public lock(): void {
    console.log('[Signer SDK] Locking vault...');
    this.vaultPrivateKey = null;
    this.account = null;
    this.vaultAddress = null;
  }

  public getAddress(): string | null {
    return this.vaultAddress;
  }

  public isUnlocked(): boolean {
    return this.vaultPrivateKey !== null;
  }

  private setPrivateKey(pk: string) {
    this.vaultPrivateKey = pk.startsWith('0x') ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`);
    this.account = privateKeyToAccount(this.vaultPrivateKey);
    this.vaultAddress = this.account.address;
  }

  private getChain(chainName: string) {
    const normalized = chainName.toLowerCase().replace(/_/g, '-');
    const normalizedSpace = chainName.toLowerCase().replace(/_/g, ' ');
    // @ts-ignore
    const found = Object.values(chains).find(
      (c) => c.name.toLowerCase() === normalizedSpace ||
              c.name.toLowerCase() === normalized ||
              (c as any).network === normalized
    );
    if (!found) {
      // SECURITY: Never silently fall back to mainnet.
      // An unknown chain name must throw explicitly to prevent funds being sent to the wrong chain.
      throw new Error(
        `[NyxoraSigner] Unknown chain: "${chainName}". ` +
        `Cannot sign transaction. Please use a supported chain name (e.g. 'ethereum', 'base', 'arbitrum').`
      );
    }
    return found;
  }

  public async signTransaction(txPayload: any): Promise<string> {
    if (!this.account || !this.vaultPrivateKey) {
      throw new Error('Vault is locked. Unlock first.');
    }
    if (!txPayload || !txPayload.chainName) {
      throw new Error('Invalid payload');
    }

    const chain = this.getChain(txPayload.chainName);
    
    // Resolve Custom RPC
    const customRpcRaw = this.options.customRpcUrls?.[txPayload.chainName.toLowerCase()];
    let customRpc: string | undefined = undefined;
    if (customRpcRaw) {
      if (Array.isArray(customRpcRaw) && customRpcRaw.length > 0) customRpc = customRpcRaw[0];
      else if (typeof customRpcRaw === 'string' && customRpcRaw.trim()) customRpc = customRpcRaw.trim();
    }
    
    const client = createWalletClient({ 
      account: this.account, 
      chain, 
      transport: http(customRpc, { timeout: 15000 }) 
    }).extend(publicActions) as any;
    
    const chainId = chain.id;

    // Mutex lock for nonce management
    if (!this.nonceLocks[chainId]) this.nonceLocks[chainId] = Promise.resolve();
    
    return new Promise((resolve, reject) => {
      this.nonceLocks[chainId] = this.nonceLocks[chainId].then(async () => {
        try {
          const rpcNonce = await client.getTransactionCount({ address: this.account!.address, blockTag: 'pending' });
          let nextNonce = Math.max(rpcNonce, this.nonceCache[chainId] || 0);
          
          const txRequest = txPayload.details?.txRequest || txPayload.details?.txData || txPayload;
          const toAddress = txRequest.to || txRequest.target;
          const txDataStr = txRequest.data || txRequest.calldata;
          const txValue = txRequest.value ? BigInt(txRequest.value) : 0n;
          
          // Phase 2: Transaction Simulation (Dry-Run / Anti-Fail)
          try {
            await client.estimateGas({
              account: this.account!,
              to: toAddress,
              data: txDataStr,
              value: txValue
            });
          } catch (simError: any) {
            throw new Error(`Simulation failed: ${simError.shortMessage || simError.message}`);
          }
          
          // @ts-ignore
          const hash = await client.sendTransaction({
            account: this.account!,
            to: toAddress,
            data: txDataStr,
            value: txValue,
            nonce: nextNonce,
            gas: txRequest.gas ? BigInt(txRequest.gas) : undefined,
            maxFeePerGas: txRequest.maxFeePerGas ? BigInt(txRequest.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas ? BigInt(txRequest.maxPriorityFeePerGas) : undefined,
          });
          
          this.nonceCache[chainId] = nextNonce + 1;
          
          try {
            const receipt = await client.waitForTransactionReceipt({ 
              hash, 
              timeout: 60000 
            });
            if (receipt.status === 'reverted') {
              reject(new Error(`Transaction reverted on-chain. Hash: ${hash}`));
              return;
            }
            resolve(hash);
          } catch (receiptError: any) {
            // If it times out waiting for the block, we don't know if it succeeded or reverted.
            // We return a "Pending" message to the AI, rather than throwing an error or claiming success.
            const name = receiptError?.name || '';
            const msg = receiptError?.message?.toLowerCase() || '';
            if (name.includes('Timeout') || msg.includes('timeout') || msg.includes('timed out')) {
              console.warn(`[Signer SDK] Receipt wait timeout for ${hash}, assuming pending.`);
              resolve(`Transaction broadcasted (Pending receipt). Hash: ${hash}`);
            } else {
              reject(receiptError);
            }
          }
        } catch (err: any) {
          reject(err);
        }
      }).catch(reject);
    });
  }

  public async signPersonalMessage(message: string): Promise<string> {
    if (!this.account || !this.vaultPrivateKey) {
      throw new Error('Vault is locked. Unlock first.');
    }
    return await this.account.signMessage({ message });
  }
}
