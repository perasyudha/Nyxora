import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import http from 'http';
import { encode } from '@msgpack/msgpack';

function getInternalToken(): string | undefined {
  try {
    const tokenPath = path.join(os.homedir(), '.nyxora', 'auth', 'runtime.token');
    if (fs.existsSync(tokenPath)) {
      return fs.readFileSync(tokenPath, 'utf8').trim();
    }
  } catch {}
  return undefined;
}

// Cross-platform IPC: check for Unix socket on Linux/Mac, use TCP on Windows
const IS_WINDOWS = process.platform === 'win32';

function getPolicyOptions(path_: string, method: string, token?: string, extraHeaders?: Record<string, any>): http.RequestOptions {
  const POLICY_SOCKET = '/tmp/nyxora-policy.sock';
  const headers: Record<string, any> = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(extraHeaders || {})
  };
  // On Linux/Mac, prefer Unix socket if available (faster IPC)
  if (!IS_WINDOWS && fs.existsSync(POLICY_SOCKET)) {
    return { socketPath: POLICY_SOCKET, path: path_, method, headers };
  }
  // Fallback: TCP (always used on Windows)
  return { host: '127.0.0.1', port: parseInt(process.env.POLICY_PORT || '3001', 10), path: path_, method, headers };
}

export async function getAddress(): Promise<string> {
  const token = getInternalToken();
  return new Promise((resolve, reject) => {
    const options = getPolicyOptions('/address', 'GET', token);

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(data));
            return;
          }
          const parsed = JSON.parse(data);
          resolve(parsed.address);
        } catch (e: any) {
          reject(new Error(`Failed to get address from vault: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Failed to get address from vault: ${error.message}`));
    });

    // getAddress is a simple GET — if the Policy Engine is not responding within 5s,
    // fail fast instead of hanging all Web3 skills for up to 2 minutes.
    req.setTimeout(5000, () => {
      req.destroy(new Error('Timeout: Policy Engine did not respond to /address within 5s. Is it running?'));
    });

    req.end();
  });
}


export async function submitTransaction(txPayload: any): Promise<string> {
  const token = getInternalToken();
  if (txPayload.details) {
    const expiresAt = txPayload.details.expiresAt || txPayload.details.rawQuote?.expiresAt;
    if (expiresAt && Date.now() > expiresAt) {
      throw new Error(`Quote Expired. Market prices may have changed. Please ask the agent to generate a new swap/bridge quote.`);
    }
  }

  if (txPayload.autoApprove) {
    txPayload.details = txPayload.details || {};
    // ROOT FIX: Force amountWei in payload to prevent Policy Engine misinterpretation
    txPayload.details.amountWei = txPayload.details.amountWei || txPayload.details.valueWei || "0";
    
    const amountWei = txPayload.details.amountWei;
    const secret = getInternalToken() || '';
    txPayload.internalSignature = crypto.createHmac('sha256', secret).update(txPayload.chainName + amountWei).digest('hex');
  }
  return new Promise((resolve, reject) => {
    const sanitizedPayload = JSON.parse(JSON.stringify(txPayload, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    const payloadBuffer = encode(sanitizedPayload);

    const options = getPolicyOptions('/request-tx', 'POST', token, {
      'Content-Type': 'application/msgpack',
      'Content-Length': payloadBuffer.length
    });

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed.error || 'Failed to submit transaction'));
            return;
          }
          if (parsed.status === 'pending') {
            resolve(`Pending (ID: ${parsed.txId})`);
            return;
          }
          resolve(parsed.signedHash || parsed.hash || parsed.txHash || parsed.status || 'Transaction executed successfully (No Hash returned)');
        } catch (e: any) {
          reject(new Error(`Failed to parse vault response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Transaction submission failed: ${error.message}`));
    });

    req.setTimeout(120000, () => {
      req.destroy(new Error('Timeout'));
    });

    req.write(payloadBuffer);
    req.end();
  });
}

export async function signPersonalMessage(message: string): Promise<string> {
  const token = getInternalToken();
  return new Promise((resolve, reject) => {
    const payloadBuffer = Buffer.from(JSON.stringify({ message }));
    const options = getPolicyOptions('/sign-message', 'POST', token, {
      'Content-Type': 'application/json',
      'Content-Length': payloadBuffer.length
    });

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed.error || 'Failed to sign message'));
            return;
          }
          resolve(parsed.signature);
        } catch (e: any) {
          reject(new Error(`Failed to parse vault signature response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Message signing failed: ${error.message}`));
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout waiting for message signature'));
    });

    req.write(payloadBuffer);
    req.end();
  });
}

