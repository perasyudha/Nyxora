import { getAddress, signPersonalMessage } from './utils/vaultClient';

export interface SIWEMessageOptions {
  domain: string;
  uri: string;
  statement?: string;
  chainId?: number;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
}

export class SIWEHandler {
  /**
   * Constructs an EIP-4361 compliant SIWE message string.
   */
  public static createSiweMessage(address: string, options: SIWEMessageOptions): string {
    const domain = options.domain || 'localhost';
    const uri = options.uri || `https://${domain}`;
    const statement = options.statement || 'Sign in with Ethereum to Nyxora dApp Session.';
    const chainId = options.chainId || 1;
    const nonce = options.nonce || Math.random().toString(36).substring(2, 15);
    const issuedAt = options.issuedAt || new Date().toISOString();

    let msg = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

    if (options.expirationTime) {
      msg += `\nExpiration Time: ${options.expirationTime}`;
    }

    return msg;
  }

  /**
   * Autonomously signs a SIWE challenge using Nyxora's internal vault wallet
   * and optionally submits it to a verification API endpoint.
   */
  public static async signSiweChallenge(options: SIWEMessageOptions, verifyApiUrl?: string): Promise<{ address: string; message: string; signature: string; token?: string }> {
    const address = await getAddress();
    const message = this.createSiweMessage(address, options);
    console.log(`🔐 [SIWE] Signing EIP-4361 challenge for ${options.domain} (${address})...`);

    const signature = await signPersonalMessage(message);
    let token: string | undefined = undefined;

    if (verifyApiUrl) {
      try {
        const res = await fetch(verifyApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, signature, address })
        });
        if (res.ok) {
          const body: any = await res.json();
          token = body.token || body.accessToken || body.jwt || body.sessionToken;
          console.log(`✅ [SIWE] Verified successfully with ${verifyApiUrl}. Received auth token.`);
        }
      } catch (e: any) {
        console.warn(`[SIWE] Verification API request failed: ${e.message}`);
      }
    }

    return { address, message, signature, token };
  }
}
