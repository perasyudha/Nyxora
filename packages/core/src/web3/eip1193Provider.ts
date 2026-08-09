import { getAddress, signPersonalMessage, submitTransaction } from './utils/vaultClient';

export interface EIP1193RequestArgs {
  method: string;
  params?: any[] | Record<string, any>;
}

export class NyxoraEIP1193Provider {
  private chainId: string = '0x1'; // Default Ethereum mainnet (hex)

  constructor(chainIdHex: string = '0x1') {
    this.chainId = chainIdHex;
  }

  public setChainId(chainIdHex: string): void {
    this.chainId = chainIdHex.startsWith('0x') ? chainIdHex : `0x${parseInt(chainIdHex, 10).toString(16)}`;
  }

  public async request(args: EIP1193RequestArgs): Promise<any> {
    const { method, params } = args;

    switch (method) {
      case 'eth_accounts':
      case 'eth_requestAccounts': {
        const address = await getAddress();
        return [address];
      }

      case 'eth_chainId': {
        return this.chainId;
      }

      case 'net_version': {
        return parseInt(this.chainId, 16).toString(10);
      }

      case 'personal_sign': {
        // params: [messageHex, address] or [address, messageHex]
        const p = Array.isArray(params) ? params : [];
        let message = p[0];
        if (typeof message === 'string' && message.startsWith('0x')) {
          // If hex encoded string, try decoding to utf8
          try {
            message = Buffer.from(message.slice(2), 'hex').toString('utf8');
          } catch {}
        }
        return await signPersonalMessage(String(message || ''));
      }

      case 'eth_sign': {
        const p = Array.isArray(params) ? params : [];
        const message = p[1] || p[0];
        return await signPersonalMessage(String(message || ''));
      }

      case 'eth_sendTransaction': {
        const p = Array.isArray(params) ? params : [params];
        const txData = p[0] || {};
        const chainIdNum = parseInt(this.chainId, 16);
        const hash = await submitTransaction({
          chainName: txData.chainName || String(chainIdNum),
          details: txData,
          autoApprove: true
        });
        return hash;
      }

      default:
        throw new Error(`[NyxoraEIP1193] Unsupported method: ${method}`);
    }
  }

  /**
   * Generates a JavaScript injection string for Playwright/Puppeteer page.addInitScript()
   * so dApps detect window.ethereum natively.
   */
  public static getBrowserInjectionScript(userAddress: string, chainIdHex: string = '0x1'): string {
    return `
      (function() {
        if (window.ethereum && window.ethereum.isNyxora) return;
        
        const currentAddress = "${userAddress}";
        let currentChainId = "${chainIdHex}";
        
        window.ethereum = {
          isNyxora: true,
          isMetaMask: true,
          selectedAddress: currentAddress,
          
          request: async function(args) {
            const { method, params } = args;
            if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
              return [currentAddress];
            }
            if (method === 'eth_chainId') {
              return currentChainId;
            }
            if (method === 'net_version') {
              return parseInt(currentChainId, 16).toString(10);
            }
            // For personal_sign or sendTransaction in browser, dispatch custom event to Nyxora Bridge
            const eventId = 'nyxora_req_' + Math.random().toString(36).substring(2);
            return new Promise((resolve, reject) => {
              const handler = (event) => {
                if (event.detail && event.detail.id === eventId) {
                  window.removeEventListener('nyxora_rpc_response', handler);
                  if (event.detail.error) reject(new Error(event.detail.error));
                  else resolve(event.detail.result);
                }
              };
              window.addEventListener('nyxora_rpc_response', handler);
              window.dispatchEvent(new CustomEvent('nyxora_rpc_request', {
                detail: { id: eventId, method, params }
              }));
            });
          },
          
          on: function(event, callback) {},
          removeListener: function(event, callback) {}
        };
      })();
    `;
  }
}
