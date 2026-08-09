// Removed safeLogger for standalone SDK server wrapper

import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import { NyxoraSigner } from './NyxoraSigner';

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Anti-Crash] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Anti-Crash] Uncaught Exception:', error);
  process.exit(1);
});

// Cross-platform IPC: Unix socket on Linux/Mac, TCP on Windows
// Windows does not support Unix domain sockets natively (without WSL).
const IS_WINDOWS = process.platform === 'win32';
const SIGNER_PORT = parseInt(process.env.SIGNER_PORT || '3002', 10);
const SOCKET_PATH = IS_WINDOWS
  ? undefined
  : (process.env.SIGNER_SOCKET_PATH || '/tmp/nyxora-signer.sock');

const tokenPathAuth = path.join(os.homedir(), '.nyxora', 'auth', 'runtime.token');
let JWT_SECRET = '';
try {
  JWT_SECRET = fs.readFileSync(tokenPathAuth, 'utf8').trim();
} catch (e) {
  console.error("Missing runtime.token in signer process.");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Simple local config parser to avoid depending on @nyxora/core
function getLocalConfig() {
  try {
    const p = path.join(os.homedir(), '.nyxora', 'config.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {}
  return {};
}

// Initialize the SDK
const config = getLocalConfig();
const signer = new NyxoraSigner({
  customRpcUrls: config.web3?.rpc_urls as Record<string, string | string[]>
});

// Unlock on startup
signer.unlock().catch(console.error);

app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });
  
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(403).json({ error: 'Invalid internal token' });
  }
});

app.get('/address', (req, res) => {
  const address = signer.getAddress();
  if (!address) return res.status(403).json({ error: 'Vault is locked' });
  res.json({ address });
});

app.post('/sign-transaction', async (req, res) => {
  const { txPayload } = req.body;
  try {
     const hash = await signer.signTransaction(txPayload);
     res.json({ hash });
  } catch (e: any) {
     const status = e.message.includes('locked') ? 403 : (e.message.includes('Invalid payload') ? 400 : 500);
     res.status(status).json({ error: e.message });
  }
});

app.post('/sign-message', async (req, res) => {
  const { message } = req.body;
  try {
    const signature = await signer.signPersonalMessage(message);
    res.json({ signature });
  } catch (e: any) {
    const status = e.message.includes('locked') ? 403 : 500;
    res.status(status).json({ error: e.message });
  }
});

if (!IS_WINDOWS && SOCKET_PATH && fs.existsSync(SOCKET_PATH)) {
  try {
    fs.unlinkSync(SOCKET_PATH);
  } catch (err) {
    console.error('Failed to unlink socket:', err);
  }
}

if (IS_WINDOWS) {
  // Windows: Use TCP on localhost (Unix sockets not supported without WSL)
  app.listen(SIGNER_PORT, '127.0.0.1', () => {
    console.log(`[Signer Vault] Listening on TCP 127.0.0.1:${SIGNER_PORT} (Windows mode)`);
  });
} else {
  // Linux/Mac: Use Unix domain socket for better IPC security
  app.listen(SOCKET_PATH!, () => {
    try {
      fs.chmodSync(SOCKET_PATH!, 0o600);
      console.log(`[Signer Vault] Listening on Unix Socket: ${SOCKET_PATH}`);
    } catch (err) {
      console.error('Failed to chmod socket:', err);
    }
  });
}


// Graceful Shutdown
const gracefulShutdown = () => {
  signer.lock();
  if (!IS_WINDOWS && SOCKET_PATH) {
    try {
      if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
    } catch {}
  }
  process.exit(0);
};


process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
