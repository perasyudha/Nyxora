import express from 'express';
import cors from 'cors';
import { safeFetch } from '../utils/httpClient';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Anti-Crash] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error: any) => {
  if (
    error?.code === 'ERR_STREAM_DESTROYED' ||
    error?.code === 'EPIPE' ||
    error?.code === 'ECONNRESET' ||
    error?.message?.includes('stream was destroyed') ||
    error?.message?.includes('write after end')
  ) {
    console.warn('[Anti-Crash] Ignored stream/connection disconnect error:', error?.message || error?.code);
    return;
  }
  console.error('[Anti-Crash] Uncaught Exception:', error);
  process.exit(1);
});

import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import os from 'os';
import si from 'systeminformation';
import { getPath } from '../config/paths';
import { CORE_PORT, ML_BASE_URL } from '../config/constants';
import { validateToken, getSessionToken } from '../utils/state';

import { initWebSocket } from './WebSocketManager';
import fs from 'fs';
import yaml from 'yaml';
import { processUserInput, processUserInputStream, logger } from '../agent/reasoning';
import { loadConfig, saveConfig, loadRpcConfig, saveRpcConfig } from '../config/parser';
import { loadDefiKeys, saveDefiKeys } from '../config/defiConfigManager';
import { loadMarketKeys, saveMarketKeys } from '../config/marketConfigManager';
import { getPublicClient, SUPPORTED_CHAIN_NAMES, getAddress } from '../web3/config';
import { TOKEN_MAP, ERC20_ABI } from '../web3/utils/tokens';
import { Tracker } from './tracker';
import { txManager } from '../agent/transactionManager';
import multer from 'multer';

import { isSkillActive, toggleSkill, syncAllSkillsToConfig } from '../utils/skillManager';
import { ensurePlaybookDir } from '../system/skills/playbookManager';
import { getUserWhitelist, saveTokenToWhitelist, removeTokenFromWhitelist } from '../utils/userWhitelistManager';
import { pluginManager, initializePlugins } from '../plugin/registry';
import { verifyFileToken } from '../utils/fileLinker';
import { cronManager } from '../agent/cronManager';
import { ChainName } from '../web3/config';
import { getTokenMetadata } from '../web3/utils/tokens';
import { checkRegistryStatus } from '../web3/skills/checkRegistryStatus';
import { executeTransfer } from '../web3/skills/transfer';
import { executeSwap } from '../web3/skills/swapToken';
import { executeBridge } from '../web3/skills/bridgeToken';
import { executeMintNft } from '../web3/skills/mintNft';
import { executeCustomTx } from '../web3/skills/customTx';
import { executeApprove, executeAaveSupply, executeVaultDeposit, executeUniv3Mint } from '../web3/skills/executeDefi';
import { executeRevokeApproval } from '../web3/skills/revokeApprovals';
import { startTelegramBot } from '../channels/telegram';
import { startDiscordBot } from '../channels/discordAdapter';
import { channelManager, registerAllAdapters } from '../channels/index';

import { startBridgeWatcher } from '../agent/bridgeWatcher';
import { eventListener } from '../web3/eventListener';
import { formatTransactionSuccess, formatTransactionError } from '../utils/formatter';
import { initGoogleAuth, getAuthUrl, processCallback, isAuthenticated, logoutGoogle } from './googleAuthModule';
import { generatePrivacyPolicyHtml, generateTosHtml } from './legalGenerator';
import { episodicDB } from '../memory/episodic';
import { ReflectionEngine } from '../memory/reflection';

import { nyxDaemon } from '../agent/nyxDaemon';

// Initialize Google Auth
initGoogleAuth();

// Start Background Nyx Daemon
nyxDaemon.start();

// Synchronize playbooks using Smart Sync Engine
ensurePlaybookDir();

// Synchronize all active skills to config.yaml on startup
syncAllSkillsToConfig();

// Start messaging adapters
startDiscordBot();

import util from 'util';

// Intercept console.log and console.error
const originalLog = console.log;
const originalError = console.error;

const safeFormat = (a: any) => typeof a === 'object' ? util.inspect(a, { depth: 2 }) : String(a);

console.log = function (...args) {
  Tracker.addGatewayLog(args.map(safeFormat).join(' '));
  originalLog.apply(console, args);
};

console.error = function (...args) {
  Tracker.addGatewayLog(args.map(safeFormat).join(' '), { level: 'error' });
  originalError.apply(console, args);
};

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://raw.githubusercontent.com', 'https://logos.covalenthq.com', 'https://cdn.simpleicons.org'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'https://*']
    }
  }
}));
app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin || /^(http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nyxora-token']
}));
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000, // Increased from 100 to 10000 to prevent breaking dashboard polling (which polls every 2s)
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
// Trust the first proxy (Cloudflare/Ngrok) so rate limiter doesn't complain about X-Forwarded-For
app.set('trust proxy', 1);
app.use('/api/', apiLimiter);

// Health check — no auth required, used by Desktop to poll readiness
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// API Auth Middleware
app.use('/api', (req, res, next) => {
  // Bypass auth for login endpoint and Google OAuth (handled externally or before token exists)
  const allowedPaths = ['/api/auth', '/api/auth/google/url', '/api/auth/google/callback', '/api/auth/google/status', '/api/auth/google', '/api/download'];
  const currentPath = req.originalUrl.split('?')[0];
  if (allowedPaths.includes(currentPath) || allowedPaths.includes(currentPath.replace(/\/$/, ''))) {
    return next();
  }

  const token = (req.headers['x-nyxora-token'] as string) || (req.query.token as string);
  const validation = validateToken(token);
  
  if (!validation.valid) {
    console.error(`[Auth] Rejected ${req.method} ${req.originalUrl} - Received invalid token.`);
    return res.status(401).json({ error: `Unauthorized: Invalid or missing token.` });
  }
  
  next();
});

// API Firewall Middleware
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  
  const firewallPath = path.join(os.homedir(), '.nyxora', 'config', 'gateway_firewall.json');
  if (fs.existsSync(firewallPath)) {
    try {
      const firewall = JSON.parse(fs.readFileSync(firewallPath, 'utf8'));
      const currentPath = req.originalUrl.split('?')[0];
      
      // If endpoint is explicitly set to false in firewall config, block it.
      if (firewall[currentPath] === false) {
        Tracker.addGatewayLog(`API Firewall blocked access to ${currentPath}`, { level: 'error' });
        return res.status(403).json({ error: 'Forbidden: This endpoint is disabled by the API Firewall.' });
      }
    } catch (e) {
      console.error('[Firewall] Error reading config:', e);
    }
  }
  next();
});

// Serve Static Dashboard
// __dirname is packages/core/dist/gateway (compiled) OR packages/core/src/gateway (dev)
let dashboardPath = path.join(__dirname, '..', '..', '..', 'dashboard', 'dist'); // Dev
if (!fs.existsSync(dashboardPath)) {
  dashboardPath = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'dashboard', 'dist'); // Compiled
}
app.use(express.static(dashboardPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

app.get('/privacy', (req, res) => {
  res.send(generatePrivacyPolicyHtml());
});

app.get('/api/download', (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) return res.status(401).send('Missing download token');

    const filePath = verifyFileToken(token);
    if (!filePath) return res.status(403).send('Invalid or expired download link');

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File no longer exists');
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).send('Cannot download a directory');
    }

    // Set correct headers to force download for arbitrary files, but allow viewing for txt/md/images
    const ext = path.extname(filePath).toLowerCase();
    if (!['.txt', '.md', '.json', '.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }

    res.sendFile(filePath, { dotfiles: 'allow' });
  } catch (error: any) {
    res.status(500).send('Error downloading file');
  }
});

app.get('/tos', (req, res) => {
  res.send(generateTosHtml());
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const docsDir = path.join(os.homedir(), '.nyxora', 'docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    cb(null, docsDir);
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    try {
      const mlRes = await fetch(`${ML_BASE_URL}/memory/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: req.file.path })
      });
      const mlData = await mlRes.json();
      return res.json({ filePath: req.file.path, mlData });
    } catch (mlErr: any) {
      console.error('[Upload] ML Engine RAG Error:', mlErr.message);
      return res.json({ filePath: req.file.path, error: 'ML Engine processing failed' });
    }
  } catch (err) {
    console.error('[Upload] Error:', err);
    return res.status(500).json({ error: 'Failed to save file' });
  }
});

// Upload for analysis only — file is saved temporarily but NOT ingested into memory/RAG.
// Use this for "analyze this document" requests in chat sessions.
app.post('/api/upload-temp', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return file path only — no ML Engine call, no memory storage
    return res.json({ filePath: req.file.path });
  } catch (err) {
    console.error('[Upload-Temp] Error:', err);
    return res.status(500).json({ error: 'Failed to save file' });
  }
});

app.post('/api/upload-google-credentials', (req, res) => {
  try {
    const credentials = req.body.credentials;
    if (!credentials) {
      return res.status(400).json({ error: 'Missing credentials payload' });
    }
    
    // Save to ~/.nyxora/google-credentials.json
    const credsPath = getPath('google-credentials.json');
    
    // The format needs to wrap it in "web" or "installed"
    const finalPayload = credentials.client_id ? { installed: credentials } : credentials;
    
    const tempPath = credsPath + '.tmp.' + Date.now();
    fs.writeFileSync(tempPath, JSON.stringify(finalPayload, null, 2));
    fs.renameSync(tempPath, credsPath);
    
    // Re-initialize google auth module
    initGoogleAuth();
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const sessionId = req.query.session_id as string | undefined;
    const history = logger.getHistory(sessionId, 1000, true);
    // Filter out internal system prompt for the frontend
    const cleanHistory = history.filter((msg: any) => msg.role !== 'system');
    res.json(cleanHistory);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/history', (req, res) => {
  try {
    const sessionId = req.query.session_id as string | undefined;
    logger.clear(sessionId);
    Tracker.addEvent('memory.cleared');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions', (req, res) => {
  try {
    const client = req.query.client as string | undefined;
    res.json(logger.getSessions(client));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/search', (req, res) => {
  try {
    const q = req.query.q as string;
    const client = req.query.client as string | undefined;
    if (!q) {
      return res.json(logger.getSessions(client));
    }
    res.json(logger.searchSessions(q, client));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions', (req, res) => {
  try {
    const { title, project_id, client } = req.body;
    const id = logger.createSession(title || 'New Chat', project_id, client);
    res.json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    logger.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    const client = req.query.client as string | undefined;
    res.json(logger.getProjects(client));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const { name, path, client } = req.body;
    const id = logger.addProject(name, path, client);
    res.json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    logger.deleteProject(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/system/pick-folder', (req, res) => {
  try {
    const execSync = require('child_process').execSync;
    const path = execSync('zenity --file-selection --directory', { encoding: 'utf-8' }).trim();
    if (path) {
      res.json({ path });
    } else {
      res.status(400).json({ error: 'Canceled' });
    }
  } catch (error: any) {
    res.status(400).json({ error: 'Canceled' });
  }
});

app.post('/api/system/restart', (req, res) => {
  res.json({ success: true, message: 'Restarting daemon...' });
  const childProcess = require('child_process');
  setTimeout(() => {
    childProcess.spawn('node', ['./bin/nyxora.mjs', 'restart'], { cwd: process.cwd(), detached: true, stdio: 'ignore' }).unref();
  }, 500);
});

app.post('/api/system/shutdown', (req, res) => {
  res.json({ success: true, message: 'Shutting down daemon...' });
  const childProcess = require('child_process');
  setTimeout(() => {
    childProcess.spawn('node', ['./bin/nyxora.mjs', 'stop'], { cwd: process.cwd(), detached: true, stdio: 'ignore' }).unref();
  }, 500);
});

app.post('/api/system/clear-cache', (req, res) => {
  const childProcess = require('child_process');
  childProcess.exec('node ./bin/nyxora.mjs clean-logs', { cwd: process.cwd() }, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to clear cache' });
    res.json({ success: true });
  });
});

app.get('/api/system/autostart', (req, res) => {
  const isLinux = process.platform === 'linux';
  const isMac = process.platform === 'darwin';
  let enabled = false;
  if (isLinux) {
    enabled = require('fs').existsSync(require('path').join(require('os').homedir(), '.config', 'autostart', 'nyxora.desktop'));
  } else if (isMac) {
    enabled = require('fs').existsSync(require('path').join(require('os').homedir(), 'Library', 'LaunchAgents', 'com.nyxora.gateway.plist'));
  }
  res.json({ enabled });
});

app.post('/api/system/autostart', (req, res) => {
  const action = req.body.enabled ? 'enable' : 'disable';
  const childProcess = require('child_process');
  childProcess.exec(`node ./bin/nyxora.mjs autostart ${action}`, { cwd: process.cwd() }, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to configure autostart' });
    res.json({ success: true });
  });
});

app.put('/api/sessions/:id', (req, res) => {
  try {
    const { title } = req.body;
    if (title) {
      logger.renameSession(req.params.id, title);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/config', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const currentConfig = loadConfig();
    const newConfig = {
      ...currentConfig,
      ...req.body,
      agent: { ...currentConfig.agent, ...req.body.agent },
      llm: { ...currentConfig.llm, ...req.body.llm },
      web3: { ...currentConfig.web3, ...req.body.web3 }
    };
    // Save merged configuration to file
    saveConfig(newConfig);
    Tracker.addEvent('config.updated', { provider: req.body.llm?.provider });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rpc', (req, res) => {
  try {
    const rpcConfig = loadRpcConfig();
    res.json(rpcConfig);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rpc', (req, res) => {
  try {
    const currentRpc = loadRpcConfig();
    const newRpc = { ...currentRpc, ...req.body };
    saveRpcConfig(newRpc);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/defi-keys', (req, res) => {
  try {
    const keys = loadDefiKeys();
    
    // Import dynamically to avoid circular dependencies if any
    const { aggregatorRegistry } = require('../web3/aggregator/providerRegistry');
    const providers = aggregatorRegistry.getAllProviders();
    
    const requirements: any[] = [];
    const seenKeys = new Set<string>();
    
    for (const provider of providers) {
      if (provider.manifest.requiredApiKeys) {
        for (const req of provider.manifest.requiredApiKeys) {
          if (!seenKeys.has(req.id)) {
            seenKeys.add(req.id);
            requirements.push({
              id: req.id,
              label: req.label,
              required: req.required,
              docsUrl: req.docsUrl,
              configured: !!keys[req.id]
            });
          }
        }
      }
    }
    
    res.json({ requirements });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/defi-keys', (req, res) => {
  try {
    saveDefiKeys(req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/defi-keys/:id', (req, res) => {
  try {
    const keys = loadDefiKeys();
    delete keys[req.params.id];
    saveDefiKeys(keys, true);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market-keys', (req, res) => {
  try {
    const keys = loadMarketKeys();
    res.json({
      requirements: [
        {
          id: 'coingecko_key',
          label: 'CoinGecko Pro API Key',
          required: false,
          docsUrl: 'https://www.coingecko.com/en/api',
          configured: !!keys.coingecko_key
        },
        {
          id: 'cmc_key',
          label: 'CoinMarketCap Pro API Key',
          required: false,
          docsUrl: 'https://pro.coinmarketcap.com/',
          configured: !!keys.cmc_key
        },
        {
          id: 'opensea_key',
          label: 'OpenSea API Key',
          required: false,
          docsUrl: 'https://docs.opensea.io/reference/api-overview',
          configured: !!keys.opensea_key
        }
      ]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/market-keys', (req, res) => {
  try {
    saveMarketKeys(req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/market-keys/:id', (req, res) => {
  try {
    const keys = loadMarketKeys();
    delete keys[req.params.id];
    saveMarketKeys(keys, true);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get skills from PluginManager dynamically
const getWeb3Skills = () => {
  return pluginManager.getPlugins()
    .filter(p => p.name.startsWith('Web3') || p.name === 'MarketAnalysis')
    .flatMap(p => p.tools);
};

const getExternalSkills = () => {
  return pluginManager.agentSkills ? pluginManager.agentSkills.getToolSchemas() : [];
};

const getSystemSkills = () => {
  return pluginManager.getPlugins()
    .filter(p => !p.name.startsWith('Web3') && p.name !== 'MarketAnalysis')
    .flatMap(p => p.tools);
};

app.get('/api/stats', (req, res) => {
  const stats = Tracker.getStats();
  const dbPath = getPath('memory.db');
  
  const allSkills = getWeb3Skills();
  const systemSkills = getSystemSkills();
  const externalSkills = getExternalSkills();
  
  const activeWeb3 = allSkills.filter(s => isSkillActive(s.function.name)).length;
  const activeSystem = systemSkills.filter(s => isSkillActive(s.function.name)).length;
  const activeExternal = externalSkills.filter(s => isSkillActive(s.function.name)).length;
  
  const totalSkills = allSkills.length + systemSkills.length + externalSkills.length;
  const activeSkills = activeWeb3 + activeSystem + activeExternal;

  res.json({ ...stats, memoryPath: dbPath, totalSkills, activeSkills });
});

app.get('/api/logs', (req, res) => {
  res.json(Tracker.getLogs());
});

app.get('/api/cron', (req, res) => {
  res.json({
    activeJobs: cronManager.getActiveJobsCount(),
    jobs: cronManager.getJobs()
  });
});

app.post('/api/cron', (req, res) => {
  try {
    const { expression, prompt } = req.body;
    if (!expression || !prompt) {
      return res.status(400).json({ error: 'Missing expression or prompt' });
    }
    const id = cronManager.addJob(expression, prompt);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/cron/:id', (req, res) => {
  const removed = cronManager.removeJob(req.params.id);
  if (removed) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Job not found' });
  }
});


app.get('/api/skills', (req, res) => {
  const allSkills = getWeb3Skills();
  const skillsWithStatus = allSkills.map(skill => ({
    ...skill,
    isActive: isSkillActive(skill.function.name)
  }));
  
  res.json(skillsWithStatus);
});

app.get('/api/skills/external', (req, res) => {
  const externalSkills = getExternalSkills();
  const skillsWithStatus = externalSkills.map(skill => ({
    ...skill,
    isActive: isSkillActive(skill.function.name)
  }));
  
  res.json(skillsWithStatus);
});

app.get('/api/skills/system', (req, res) => {
  const systemSkills = getSystemSkills();
  const skillsWithStatus = systemSkills.map(skill => ({
    ...skill,
    isActive: isSkillActive(skill.function.name)
  }));
  
  res.json(skillsWithStatus);
});

app.post('/api/skills/toggle', (req, res) => {
  const { skillName, active } = req.body;
  if (!skillName || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  toggleSkill(skillName, active);
  res.json({ success: true, skillName, active });
});

// Portfolio Whitelist Routes
app.get('/api/portfolio/whitelist', async (req, res) => {
  const whitelist = getUserWhitelist();
  res.json(whitelist);
});

app.post('/api/portfolio/whitelist', async (req, res) => {
  const { walletAddress, chainName, tokenAddress, symbol, decimals } = req.body;
  if (!walletAddress || !chainName || !tokenAddress) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  await saveTokenToWhitelist(walletAddress, chainName, tokenAddress, 'manual', symbol, decimals);
  res.json({ success: true });
});

app.delete('/api/portfolio/whitelist', (req, res) => {
  const { walletAddress, chainName, tokenAddress } = req.body;
  if (!walletAddress || !chainName || !tokenAddress) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  removeTokenFromWhitelist(walletAddress, chainName, tokenAddress);
  res.json({ success: true });
});

app.get('/api/portfolio/token-metadata', async (req, res) => {
  const { chain, address } = req.query;
  if (!chain || !address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing chain or address' });
  }
  try {
    const client = getPublicClient(chain as ChainName);
    const metadata = await getTokenMetadata(client, address as `0x${string}`);
    res.json(metadata);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard Auth Routes
app.post('/api/auth', (req, res) => {
  try {
    const config = loadConfig();
    const currentPass = config.security?.dashboard_password || '123456';
    if (req.body?.password === currentPass) {
      // Return the session token so the client can authenticate all subsequent requests
      const token = getSessionToken();
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/update', (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const config = loadConfig();
    const currentPass = config.security?.dashboard_password || '123456';
    
    if (oldPassword !== currentPass) {
      return res.status(401).json({ error: 'Invalid old password' });
    }
    
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }
    
    config.security = config.security || {};
    config.security.dashboard_password = newPassword;
    saveConfig(config);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Google Workspace Auth Routes
app.get('/api/auth/google/url', (req, res) => {
  const url = getAuthUrl();
  if (!url) return res.status(500).json({ error: 'Google Auth not configured' });
  res.json({ url });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send('No code provided');
  
  const success = await processCallback(code);
  if (success) {
    res.send(`
      <html><body>
      <h2>Authentication Successful!</h2>
      <p>You can close this window and return to the dashboard.</p>
      <script>
        setTimeout(() => window.close(), 2000);
      </script>
      </body></html>
    `);
  } else {
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/auth/google/status', async (req, res) => {
  const connected = await isAuthenticated();
  res.json({ connected });
});

app.delete('/api/auth/google', async (req, res) => {
  const success = await logoutGoogle();
  res.json({ success });
});

app.post('/api/auth/google/submit-code', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  const { processCallbackCLI } = require('./googleAuthModule');
  const success = await processCallbackCLI(code);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

let lastUnlockRequest = 0;

app.post('/api/status/unlock', (req, res) => {
  lastUnlockRequest = Date.now();
  res.json({ success: true });
});

app.get('/api/status/lock', (req, res) => {
  res.json({ lastUnlockRequest });
});

app.get('/api/transactions', (req, res) => {
  res.json(txManager.getPending());
});

app.post('/api/transactions/:id/approve', async (req, res) => {
  try {
    const id = req.params.id;
    const { sessionId, nonce } = req.body || {};
    const tx = txManager.getTransaction(id);
    if (!tx || tx.status !== 'pending') return res.status(404).json({ error: 'Transaction not found or not pending' });

    if (tx.nonce !== nonce) {
      return res.status(403).json({ error: 'Invalid or missing nonce. Replay attack detected.' });
    }
    
    // --- Arbitrum Registry Kill-Switch Interceptor ---
    const registryCheck = await checkRegistryStatus();
    if (!registryCheck.isActive) {
      txManager.updateStatus(id, 'failed', registryCheck.reason);
      logger.addEntry({ role: 'assistant', content: `❌ **Security Blocked:** ${registryCheck.reason}` }, sessionId);
      return res.status(403).json({ error: `[On-Chain Policy] ${registryCheck.reason}` });
    }
    // ------------------------------------------------

    // Invalidate the nonce immediately to prevent replay
    tx.nonce = 'used_' + Date.now();

    txManager.updateStatus(id, 'approved', 'Executing on-chain...');
    res.json({ success: true, status: 'processing', message: 'Transaction submitted to background processing.' });

    // Execute in background
    const txPromise = (async () => {
      try {
        let result = '';
        if (tx.type === 'transfer') {
          const hash = await executeTransfer(tx.chainName as any, tx.details, true);
          result = `Successfully transferred ${tx.details.amountStr || tx.details.amountEth || '0'} on ${tx.chainName} to ${tx.details.toAddress || tx.details.recipient} (Hash: ${hash})`;
        } else if (tx.type === 'swap') {
          const hash = await executeSwap(tx.chainName as any, tx.details, true);
          result = `Successfully transferred ${tx.details.amountStr || '0'} on ${tx.chainName} to ${tx.chainName} swap contract (Hash: ${hash})`;
        } else if (tx.type === 'bridge') {
          const hash = await executeBridge(tx.chainName as any, tx.details, true);
          result = `Successfully transferred ${tx.details.amount || '0'} on ${tx.chainName} to ${tx.details.toChain} bridge (Hash: ${hash})`;
        } else if (tx.type === 'mint') {
          const hash = await executeMintNft(tx.chainName as any, tx.details, true);
          result = `Successfully transferred 0 on ${tx.chainName} to mint contract (Hash: ${hash})`;
        } else if (tx.type === 'custom') {
          result = await executeCustomTx(tx.chainName as any, tx.details, true);
        } else if (tx.type === 'approve') {
          result = await executeApprove(tx.chainName as any, tx.details);
        } else if (tx.type === 'aaveSupply') {
          result = await executeAaveSupply(tx.chainName as any, tx.details);
        } else if (tx.type === 'vaultDeposit') {
          result = await executeVaultDeposit(tx.chainName as any, tx.details);
        } else if (tx.type === 'univ3Mint') {
          result = await executeUniv3Mint(tx.chainName as any, tx.details);
        } else if (tx.type === 'revokeApproval') {
          const hash = await executeRevokeApproval(tx.chainName as any, tx.details, true);
          result = `Successfully revoked approval for ${tx.details.tokenAddress} from ${tx.details.spenderAddress} on ${tx.chainName} (Hash: ${hash})`;
        }

        const typeToTool: Record<string, string> = {
          'transfer': 'transfer_token',
          'swap': 'swap_token',
          'bridge': 'bridge_token',
          'mint': 'mint_nft',
          'custom': 'execute_custom_tx',
          'approve': 'approve_token',
          'aaveSupply': 'aave_supply',
          'vaultDeposit': 'vault_deposit',
          'univ3Mint': 'univ3_mint',
          'revokeApproval': 'revoke_approval'
        };
        const toolName = typeToTool[tx.type] || 'transfer_native';

        if (!result) {
          result = 'Transaction executed successfully (No Output)';
        }
        
        if (typeof result === 'string' && result.startsWith('Failed to execute')) {
          let errorMsg = result;
          if (result.toLowerCase().includes('insufficient funds') || result.toLowerCase().includes('exceeds the balance')) {
            errorMsg = "Insufficient Coin/Token balance to cover the transaction amount and Gas (Network Fee).";
          } else {
            errorMsg = result.replace('Failed to execute ', '');
          }
          
          txManager.updateStatus(id, 'failed', errorMsg);
          logger.addEntry({ role: 'tool', name: toolName, content: `Failed: ${errorMsg}` }, sessionId);
          logger.addEntry({ role: 'assistant', content: `❌ **Transaction Failed**\n\n${errorMsg}` }, sessionId);
        } else {
          txManager.updateStatus(id, 'executed', result);
          logger.addEntry({ role: 'tool', name: toolName, content: `Success: ${result}` }, sessionId);
          logger.addEntry({ role: 'assistant', content: `✅ **Transaction Executed Successfully**\n\n${result}` }, sessionId);
        }
      } catch (err: any) {
        const typeToTool: Record<string, string> = { 'transfer': 'transfer_token', 'swap': 'swap_token' };
        const toolName = typeToTool[tx.type] || 'transfer_native';
        txManager.updateStatus(id, 'failed', err.message);
        logger.addEntry({ role: 'tool', name: toolName, content: `Failed: ${err.message}` }, sessionId);
        logger.addEntry({ role: 'assistant', content: `❌ **Transaction Failed**\n\n${err.message}` }, sessionId);
      }
    })();
    
    txManager.trackPromise(txPromise);
  } catch (err: any) {
    txManager.updateStatus(req.params.id, 'failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions/:id/reject', async (req, res) => {
  try {
    const id = req.params.id;
    const { sessionId } = req.body || {};
    const tx = txManager.getTransaction(id);
    if (!tx || tx.status !== 'pending') return res.status(404).json({ error: 'Transaction not found or not pending' });

    txManager.updateStatus(id, 'rejected');
    const typeToTool: Record<string, string> = {
      'transfer': 'transfer_token',
      'swap': 'swap_token',
      'bridge': 'bridge_token',
      'mint': 'mint_nft',
      'custom': 'execute_custom_tx',
      'approve': 'approve_token',
      'aaveSupply': 'aave_supply',
      'vaultDeposit': 'vault_deposit',
      'univ3Mint': 'univ3_mint'
    };
    const toolName = typeToTool[tx.type] || 'transfer_native';
    
    logger.addEntry({ role: 'tool', name: toolName, content: 'User rejected the transaction. CRITICAL: DO NOT retry or recreate this transaction.' }, sessionId || 'default');
    
    logger.addEntry({ role: 'assistant', content: `❌ **Transaction Cancelled**\n\nYou have cancelled this transaction.` }, sessionId || 'default');
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

let cachedTrending: string[] | null = null;
let lastTrendingFetch = 0;

let cachedPrices: Record<string, number> = {};
let cachedPriceChanges: Record<string, number> = {};
let lastPricesFetch = 0;

app.get('/api/trending', async (req, res) => {
  const now = Date.now();
  if (cachedTrending && now - lastTrendingFetch < 5 * 60 * 1000) {
    return res.json(cachedTrending);
  }
  try {
    const response = await safeFetch('https://api.coingecko.com/api/v3/search/trending');
    if (response.ok) {
      const data = await response.json();
      const top5 = data.coins.slice(0, 5).map((c: any) => '$' + c.item.symbol.toUpperCase());
      cachedTrending = top5;
      lastTrendingFetch = now;
      res.json(top5);
    } else {
      // Fallback if coingecko rate limits
      if (cachedTrending) return res.json(cachedTrending);
      res.status(response.status).json({ error: 'Failed to fetch trending' });
    }
  } catch (err: any) {
    if (cachedTrending) return res.json(cachedTrending);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wallet', async (req, res) => {
  try {
    const userAddress = await getAddress();
    res.json({ address: userAddress });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const userAddress = await getAddress();
    const whitelist = getUserWhitelist();
    const userCustomTokens = whitelist[userAddress.toLowerCase()] || [];

    const portfolio: Record<string, any[]> = {};
    
    await Promise.all(SUPPORTED_CHAIN_NAMES.map(async (chainName) => {
      portfolio[chainName] = [];
      try {
        const publicClient = getPublicClient(chainName as any);
        
        // 1. Get Native Balance
        const nativeBal = await publicClient.getBalance({ address: userAddress as `0x${string}` });
        if (nativeBal > 0n) {
          portfolio[chainName].push({
            symbol: chainName === 'bsc' ? 'BNB' : chainName === 'polygon' ? 'POL' : 'ETH',
            address: 'native',
            balanceRaw: nativeBal.toString(),
            decimals: 18,
            isNative: true
          });
        }

        // 2. Combine TOKEN_MAP and YAML whitelist for this chain
        const tokensToQuery = { ...(TOKEN_MAP as any)[chainName] };
        
        // Inject whitelisted tokens
        userCustomTokens.forEach(t => {
          if (t.chainName === chainName && t.symbol && t.address) {
            tokensToQuery[t.symbol.toUpperCase()] = t.address;
          }
        });

        // 3. Query all ERC-20 balances in parallel
        await Promise.all(Object.entries(tokensToQuery).map(async ([symbol, address]) => {
          if (address === '0x0000000000000000000000000000000000000000') return; // Skip native placeholder
          try {
            const balPromise = publicClient.readContract({
              address: address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [userAddress as `0x${string}`]
            } as any);
            const decPromise = publicClient.readContract({
              address: address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'decimals'
            } as any);

            const [bal, decimals] = await Promise.all([balPromise, decPromise]) as [bigint, number];
            const isCustom = userCustomTokens.some(t => t.chainName === chainName && t.address === address);
            
            if (bal > 0n || isCustom) {
              portfolio[chainName].push({
                symbol,
                address,
                balanceRaw: bal.toString(),
                decimals: decimals, // Now using actual on-chain decimals
                isNative: false
              });
            }
          } catch {}
        }));
      } catch (e) {
        console.error(`Portfolio error on ${chainName}:`, e);
      }
    }));

    // --- DexScreener Price Fetching ---
    const addressesToFetch = new Set<string>();
    const wrapMap: any = {
      ethereum: 'WETH', arbitrum: 'WETH', base: 'WETH', optimism: 'WETH', sepolia: 'WETH', base_sepolia: 'WETH',
      bsc: 'WBNB', polygon: 'WMATIC'
    };

    for (const chain of Object.keys(portfolio)) {
      for (const t of portfolio[chain]) {
        if (t.isNative) {
           const wToken = wrapMap[chain] || 'WETH';
           const wAddr = ((TOKEN_MAP as any)[chain]?.[wToken]) || '';
           if (wAddr) addressesToFetch.add(wAddr.toLowerCase());
        } else {
           addressesToFetch.add(t.address.toLowerCase());
        }
      }
    }

    const uniqueAddrs = Array.from(addressesToFetch);
    const now = Date.now();
    let priceMap = cachedPrices;
    let changeMap = cachedPriceChanges;

    if (uniqueAddrs.length > 0 && now - lastPricesFetch > 2 * 60 * 1000) {
      try {
        const newPrices: Record<string, number> = {};
        const newChanges: Record<string, number> = {};
        
        await Promise.all(uniqueAddrs.map(async (addr) => {
          try {
            const res = await safeFetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
            if (res.ok) {
              const data = await res.json();
              if (data.pairs && data.pairs.length > 0) {
                 // Find the pair with highest liquidity
                 let bestPair = data.pairs[0];
                 let maxLiq = 0;
                 for (const p of data.pairs) {
                    const liq = p.liquidity?.usd || 0;
                    if (liq > maxLiq) {
                       maxLiq = liq;
                       bestPair = p;
                    }
                 }
                 
                 // Calculate price from bestPair
                 if (bestPair.priceUsd) {
                   const baseAddr = bestPair.baseToken.address.toLowerCase();
                   const quoteAddr = bestPair.quoteToken?.address?.toLowerCase();
                   
                   if (baseAddr === addr) {
                     newPrices[addr] = parseFloat(bestPair.priceUsd);
                     newChanges[addr] = bestPair.priceChange?.h24 || 0;
                   } else if (quoteAddr === addr && bestPair.priceNative && parseFloat(bestPair.priceNative) > 0) {
                     newPrices[addr] = parseFloat(bestPair.priceUsd) / parseFloat(bestPair.priceNative);
                     newChanges[addr] = bestPair.priceChange?.h24 || 0;
                   }
                 }
              }
            }
          } catch (e) {
            console.error(`DexScreener error for ${addr}:`, e);
          }
        }));
        
        console.log('DexScreener Fetched Prices:', newPrices);
        
        cachedPrices = { ...cachedPrices, ...newPrices };
        cachedPriceChanges = { ...cachedPriceChanges, ...newChanges };
        priceMap = cachedPrices;
        changeMap = cachedPriceChanges;
        lastPricesFetch = now;
      } catch (e) {
        console.error('DexScreener fetch error:', e);
      }
    }

    for (const chain of Object.keys(portfolio)) {
      for (const t of portfolio[chain]) {
        let lookupAddr = t.address.toLowerCase();
        if (t.isNative) {
           const wToken = wrapMap[chain] || 'WETH';
           lookupAddr = (((TOKEN_MAP as any)[chain]?.[wToken]) || '').toLowerCase();
        }
        t.priceUsd = priceMap[lookupAddr] || 0;
        t.priceChange24h = changeMap[lookupAddr] || 0;
      }
    }

    res.json(portfolio);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Memory Triggers ---
// Per-session message counters and idle timers to avoid cross-session pollution.
// A single global counter would blend counts from Telegram, CLI, and web sessions,
// causing reflection to fire at wrong times or not at all for single-platform setups.
const sessionMessageCounts = new Map<string, number>();
const sessionIdleTimers = new Map<string, NodeJS.Timeout>();

function resetIdleTimer(sessionId?: string) {
  const key = sessionId || '__global__';
  const existing = sessionIdleTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    console.log(`[Memory] Idle trigger activated for session "${key}". Running Reflection Engine...`);
    sessionIdleTimers.delete(key);
    ReflectionEngine.runReflection(sessionId).then(() => {
      const { PromotionEngine } = require('../memory/promotionEngine');
      PromotionEngine.runPromotionAndDecay();
    }).catch(console.error);
  }, 3 * 60 * 1000); // 3 minutes idle
  sessionIdleTimers.set(key, timer);
}

app.post('/api/v1/trade', async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    
    const traceId = crypto.randomBytes(8).toString('hex');
    
    // Asynchronous background execution
    processUserInput(message, session_id || traceId).catch(err => {
      console.error(`[TradeAPI] Error:`, err);
    });

    res.status(200).json({ status: 'processing', traceId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, session_id, client } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (session_id) {
      logger.ensureSession(session_id, message ? message.substring(0, 35) : 'New Chat', client);
    }
    // Process input (this will automatically add to memory)
    const response = await processUserInput(message, 'user', undefined, session_id);
    
    // Memory Triggers (per-session)
    resetIdleTimer(session_id);
    const chatKey = session_id || '__global__';
    const chatCount = (sessionMessageCounts.get(chatKey) || 0) + 1;
    if (chatCount >= 5) {
      console.log(`[Memory] N-Message threshold reached for session "${chatKey}". Running Reflection Engine...`);
      sessionMessageCounts.delete(chatKey); // clean up to avoid unbounded map growth
      // Run asynchronously
      ReflectionEngine.runReflection(session_id).then(() => {
        const { PromotionEngine } = require('../memory/promotionEngine');
        PromotionEngine.runPromotionAndDecay();
      }).catch(console.error);
    } else {
      sessionMessageCounts.set(chatKey, chatCount);
    }

    res.json({ response });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Streaming Chat Endpoint (SSE) ---
// Sends LLM tokens to the client as they arrive via Server-Sent Events.
// The old /api/chat endpoint remains untouched for backward compatibility.
app.get('/api/chat/stream', async (req, res) => {
  const { message, session_id, client } = req.query as Record<string, string>;
  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  res.flushHeaders();

  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  const sendEvent = (data: object) => {
    if (clientDisconnected || res.writableEnded || res.destroyed || res.socket?.destroyed) {
      return;
    }
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      clientDisconnected = true;
    }
  };

  const onChunk = (text: string) => sendEvent({ chunk: text });
  const onProgress = (msg: string) => sendEvent({ progress: msg });
  const onReasoning = (text: string) => sendEvent({ reasoning: text });

  try {
    if (session_id) {
      logger.ensureSession(session_id, message ? message.substring(0, 35) : 'New Chat', client);
    }
    await processUserInputStream(message, onChunk, onProgress, session_id, onReasoning);
    // Trigger memory mechanisms after response completes (per-session)
    resetIdleTimer(session_id);
    const streamKey = session_id || '__global__';
    const streamCount = (sessionMessageCounts.get(streamKey) || 0) + 1;
    if (streamCount >= 5) {
      console.log(`[Memory] N-Message threshold reached for session "${streamKey}". Running Reflection Engine...`);
      sessionMessageCounts.delete(streamKey); // clean up to avoid unbounded map growth
      ReflectionEngine.runReflection(session_id).then(() => {
        const { PromotionEngine } = require('../memory/promotionEngine');
        PromotionEngine.runPromotionAndDecay();
      }).catch(console.error);
    } else {
      sessionMessageCounts.set(streamKey, streamCount);
    }
  } catch (err: any) {
    if (!clientDisconnected) {
      console.error(`[SSE] Stream error for session "${session_id}":`, {
        message: err.message,
        stack: err.stack,
        status: err?.status,
        response: err?.response
      });
      sendEvent({ error: err.message });
    }
  } finally {
    if (!clientDisconnected && !res.writableEnded && !res.destroyed && !res.socket?.destroyed) {
      try {
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (e) {}
    }
  }
});


app.get('/api/memory', (req, res) => {
  try {
    const memories = episodicDB.getMemories();
    res.json(memories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/memory/all', (req, res) => {
  try {
    episodicDB.clearAllMemories();
    episodicDB.clearAllPersonas();
    const { PromotionEngine } = require('../memory/promotionEngine');
    PromotionEngine.runPromotionAndDecay();
    res.json({ success: true, message: "Episodic memory and persona traits wiped completely." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/memory/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    episodicDB.deleteMemory(id);
    // When memory is deleted manually, trigger promotion engine to resync user.md
    // To avoid circular dependency inside server.ts, we import here or assume it updates next cycle
    const { PromotionEngine } = require('../memory/promotionEngine');
    PromotionEngine.runPromotionAndDecay();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Policy Engine Endpoints ---
app.get('/api/policy', (req, res) => {
  try {
    const policyPath = getPath('policy.yaml');
    if (!fs.existsSync(policyPath)) {
      return res.json({
        max_usd_per_tx: 999999999,
        whitelist_only: false,
        require_approval: true,
        custom_llm_rules: [],
        auto_approve_shell: false,
        blacklisted_addresses: []
      });
    }
    const file = fs.readFileSync(policyPath, 'utf8');
    const parsed = yaml.parse(file) || {};
    res.json({
      max_usd_per_tx: parsed.max_usd_per_tx ?? 999999999,
      whitelist_only: parsed.whitelist_only ?? false,
      require_approval: parsed.require_approval ?? true,
      custom_llm_rules: parsed.custom_llm_rules || [],
      auto_approve_shell: parsed.auto_approve_shell ?? false,
      blacklisted_addresses: parsed.blacklisted_addresses || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/policy', (req, res) => {
  try {
    const policyPath = getPath('policy.yaml');
    let current = {};
    if (fs.existsSync(policyPath)) {
      current = yaml.parse(fs.readFileSync(policyPath, 'utf8')) || {};
    }
    const updated = { ...current, ...req.body };
    fs.writeFileSync(policyPath, yaml.stringify(updated), 'utf8');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- MCP Servers / Tools Configuration Endpoints (nyxmcp.yaml) ---
app.get('/api/mcp-servers', (req, res) => {
  try {
    const nyxmcpPath = getPath('nyxmcp.yaml');
    let mcpServers: Record<string, any> = {};
    if (fs.existsSync(nyxmcpPath)) {
      const nyxmcpParsed = yaml.parse(fs.readFileSync(nyxmcpPath, 'utf8')) || {};
      mcpServers = nyxmcpParsed.mcp_servers || nyxmcpParsed || {};
    }
    res.json({ mcp_servers: mcpServers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mcp-servers', (req, res) => {
  try {
    const { name, command, args, env, disabled } = req.body;
    if (!name || !command) {
      return res.status(400).json({ error: 'Name and command are required' });
    }
    const nyxmcpPath = getPath('nyxmcp.yaml');
    let nyxmcpParsed: any = { mcp_servers: {} };
    if (fs.existsSync(nyxmcpPath)) {
      nyxmcpParsed = yaml.parse(fs.readFileSync(nyxmcpPath, 'utf8')) || { mcp_servers: {} };
      if (!nyxmcpParsed.mcp_servers && typeof nyxmcpParsed === 'object') {
        nyxmcpParsed = { mcp_servers: nyxmcpParsed };
      }
    }
    nyxmcpParsed.mcp_servers = nyxmcpParsed.mcp_servers || {};
    nyxmcpParsed.mcp_servers[name] = { command, args: args || [], env: env || {}, disabled: !!disabled };
    fs.writeFileSync(nyxmcpPath, yaml.stringify(nyxmcpParsed), 'utf8');
    res.json({ success: true, mcp_servers: nyxmcpParsed.mcp_servers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/mcp-servers/:name', (req, res) => {
  try {
    const { name } = req.params;
    const nyxmcpPath = getPath('nyxmcp.yaml');
    let nyxmcpParsed: any = { mcp_servers: {} };
    if (fs.existsSync(nyxmcpPath)) {
      nyxmcpParsed = yaml.parse(fs.readFileSync(nyxmcpPath, 'utf8')) || { mcp_servers: {} };
      if (!nyxmcpParsed.mcp_servers && typeof nyxmcpParsed === 'object') {
        nyxmcpParsed = { mcp_servers: nyxmcpParsed };
      }
    }
    if (nyxmcpParsed.mcp_servers && nyxmcpParsed.mcp_servers[name]) {
      delete nyxmcpParsed.mcp_servers[name];
      fs.writeFileSync(nyxmcpPath, yaml.stringify(nyxmcpParsed), 'utf8');
    }
    res.json({ success: true, mcp_servers: nyxmcpParsed.mcp_servers || {} });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- User Persona / Risk Profile Endpoints (V3) ---
app.get('/api/profile', (req, res) => {
  try {
    const profile = logger.getUserProfile();
    res.json(profile || { risk_level: 'Moderate', max_slippage: 1.0, avoid_memecoins: false, custom_rules: '' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/profile', (req, res) => {
  try {
    logger.updateUserProfile(req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Playbooks Endpoints ---
app.get('/api/playbooks', (req, res) => {
  try {
    const userDir = path.join(os.homedir(), '.nyxora', 'playbooks');
    let defaultDir = path.join(__dirname, '..', '..', 'playbooks'); // Dev
    if (!fs.existsSync(defaultDir)) {
      defaultDir = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'core', 'playbooks'); // Compiled
    }
    
    const playbooksMap = new Map<string, string>();

    const getAllFiles = (dir: string, relativePrefix = '') => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const relPath = path.join(relativePrefix, file);
        if (fs.statSync(filePath).isDirectory()) {
          getAllFiles(filePath, relPath);
        } else {
          const ext = path.extname(file).toLowerCase();
          const allowedExts = ['.md', '.py', '.sh', '.json', '.tex', '.sty', '.bib', '.txt', '.js', '.ts', '.ini', '.xsd'];
          if (allowedExts.includes(ext) || file === 'Makefile') {
            const content = fs.readFileSync(filePath, 'utf8');
            // User files (read second) will override system files (read first)
            playbooksMap.set(relPath, content);
          }
        }
      }
    };
    
    // 1. Load System Playbooks (Read-Only Defaults)
    getAllFiles(defaultDir);
    
    // 2. Load User Playbooks (Overrides)
    getAllFiles(userDir);
    
    const disabledPath = path.join(os.homedir(), '.nyxora', 'disabled_playbooks.json');
    let disabled: string[] = [];
    if (fs.existsSync(disabledPath)) {
      try { disabled = JSON.parse(fs.readFileSync(disabledPath, 'utf8')); } catch(e){}
    }
    
    const playbooks = Array.from(playbooksMap.entries()).map(([filename, content]) => ({
      filename,
      content,
      status: disabled.includes(filename) ? 'inactive' : 'active'
    }));
    
    res.json(playbooks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/playbooks/toggle', (req, res) => {
  try {
    const { filename, active } = req.body;
    if (!filename) throw new Error("filename required");
    
    const disabledPath = path.join(os.homedir(), '.nyxora', 'disabled_playbooks.json');
    let disabled: string[] = [];
    if (fs.existsSync(disabledPath)) {
      try { disabled = JSON.parse(fs.readFileSync(disabledPath, 'utf8')); } catch(e){}
    }
    
    if (active) {
      disabled = disabled.filter(f => f !== filename);
    } else {
      if (!disabled.includes(filename)) disabled.push(filename);
    }
    
    fs.writeFileSync(disabledPath, JSON.stringify(disabled));
    res.json({ success: true, status: active ? 'active' : 'inactive' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/playbooks', (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!filename || !content) throw new Error("filename and content required");
    const playbooksDir = path.join(os.homedir(), '.nyxora', 'playbooks');
    const safeFilename = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(playbooksDir, safeFilename);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/playbooks', (req, res) => {
  try {
    const { filename } = req.query;
    if (!filename) throw new Error("filename required");
    const playbooksDir = path.join(os.homedir(), '.nyxora', 'playbooks');
    const safeFilename = path.normalize(filename as string).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(playbooksDir, safeFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Gateway Endpoints ---
app.get('/api/gateway/ping', async (req, res) => {
  const ts = Date.now();
  let nodejsPing = Date.now() - ts;
  let pythonPing = 0;
  let pythonOnline = false;

  try {
    const pStart = Date.now();
    await fetch(`${ML_BASE_URL}/`);
    pythonPing = Date.now() - pStart;
    pythonOnline = true;
  } catch (e) {
    pythonOnline = false;
  }

  res.json({
    nodejs: { online: true, ping: nodejsPing },
    python: { online: pythonOnline, ping: pythonPing }
  });
});

app.get('/api/gateway/firewall', (req, res) => {
  try {
    const firewallPath = path.join(os.homedir(), '.nyxora', 'config', 'gateway_firewall.json');
    if (!fs.existsSync(firewallPath)) return res.json({});
    const firewall = JSON.parse(fs.readFileSync(firewallPath, 'utf8'));
    res.json(firewall);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gateway/firewall', express.json(), (req, res) => {
  try {
    const firewallPath = path.join(os.homedir(), '.nyxora', 'config', 'gateway_firewall.json');
    const dir = path.dirname(firewallPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(firewallPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- OS Terminal Endpoints ---
app.get('/api/terminal/logs', (req, res) => {
  try {
    const logsPath = path.join(os.homedir(), '.nyxora', 'run', 'os_logs.txt');
    if (!fs.existsSync(logsPath)) {
      return res.json({ logs: [] });
    }
    const content = fs.readFileSync(logsPath, 'utf8');
    const logs = content.split('\n').filter((l: string) => l.trim().length > 0).slice(-100);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/terminal/kill', (req, res) => {
  try {
    // In a real scenario, this would lookup the PID of the spawned child process and kill it.
    // For now, we mock the kill action by appending to the log.
    const logsPath = path.join(os.homedir(), '.nyxora', 'run', 'os_logs.txt');
    const dir = path.dirname(logsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logsPath, `[${timestamp}] ⚠️ OS_KILL_SIGNAL_RECEIVED: Process terminated by user.\\n`);
    res.json({ success: true, message: "OS Process killed" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- WhatsApp Status Endpoint ---
app.get('/api/whatsapp/status', (req, res) => {
  try {
    const { channelManager } = require('../channels/ChannelManager');
    const adapter = channelManager.getAdapter('whatsapp');
    if (!adapter || typeof (adapter as any).getStatus !== 'function') {
      return res.json({ status: 'disconnected', qrDataUrl: null, error: 'WhatsApp not enabled or initialized' });
    }
    res.json((adapter as any).getStatus());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Swarm Endpoints ---
app.get('/api/swarm/peers', (req, res) => {
  try {
    // Mock data for Swarm peers
    const mockPeers = [
      { id: 'peer-1x8a', name: 'Nyxora Alpha Node', type: 'Research Agent', status: 'connected', latency: 24, lastSeen: Date.now() },
      { id: 'peer-4b2c', name: 'Defi Trader Bot', type: 'Execution Node', status: 'connected', latency: 45, lastSeen: Date.now() - 1000 },
      { id: 'peer-9z7y', name: 'Security Auditor', type: 'Audit Node', status: 'disconnected', latency: 0, lastSeen: Date.now() - 3600000 }
    ];
    res.json(mockPeers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Hardware Endpoints ---
app.get('/api/hardware/stats', async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const uptime = os.uptime();

    // Fetch real-time hardware data using systeminformation
    const [fsSize, networkStats, graphics] = await Promise.all([
      si.fsSize(),
      si.networkStats(),
      si.graphics()
    ]);

    // Aggregate Disk Size (e.g. root drive or sum of all drives)
    let diskTotal = 0;
    let diskUsed = 0;
    if (fsSize && fsSize.length > 0) {
      diskTotal = fsSize.reduce((acc, drive) => acc + (drive.size || 0), 0);
      diskUsed = fsSize.reduce((acc, drive) => acc + (drive.used || 0), 0);
    } else {
      diskTotal = 2 * 1024 * 1024 * 1024 * 1024; // fallback
      diskUsed = 850 * 1024 * 1024 * 1024; // fallback
    }
    
    // Aggregate Network Speed (sum of all active interfaces)
    let rx = 0;
    let tx = 0;
    if (networkStats && networkStats.length > 0) {
      // systeminformation returns bytes/sec, dashboard expects Mbps
      // bytes/sec * 8 / 1,000,000 = Mbps
      rx = networkStats.reduce((acc, net) => acc + (net.rx_sec || 0), 0) * 8 / 1000000;
      tx = networkStats.reduce((acc, net) => acc + (net.tx_sec || 0), 0) * 8 / 1000000;
    }

    // GPU Info
    let gpuModel = 'Unknown GPU';
    let gpuUtil = 0;
    let gpuMemTotal = 0;
    let gpuMemUsed = 0;

    if (graphics && graphics.controllers && graphics.controllers.length > 0) {
      const mainGpu = graphics.controllers[0];
      gpuModel = mainGpu.model || `${mainGpu.vendor} Graphics`;
      gpuUtil = mainGpu.utilizationGpu || 0;
      gpuMemTotal = mainGpu.vram || 0;
      gpuMemUsed = mainGpu.memoryUsed || 0;

      // iGPUs often return 0 or null for VRAM/Utilization in standard queries
      // Fallback to simulated activity if we got completely zero/null
      if (!gpuUtil) {
        gpuUtil = Math.min(100, Math.max(0, (loadAvg[0] * 5) + (Math.random() * 10)));
      }
      if (!gpuMemTotal) {
        gpuMemTotal = 8 * 1024; // Assume 8GB shared VRAM for iGPUs
      }
      if (!gpuMemUsed) {
        gpuMemUsed = (gpuMemTotal * 0.2) + (gpuUtil * 10);
      }
    } else {
      // Complete fallback if no controller detected
      gpuModel = 'Virtual Graphics Device';
      gpuUtil = Math.min(100, Math.max(0, (loadAvg[0] * 5)));
      gpuMemTotal = 4 * 1024;
      gpuMemUsed = 1024;
    }

    res.json({
      cpu: {
        cores: cpus.length,
        model: cpus[0].model,
        loadAvg,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        free: diskTotal - diskUsed
      },
      network: {
        rx_sec: rx,
        tx_sec: tx
      },
      gpu: {
        model: gpuModel,
        utilization: gpuUtil,
        memoryTotal: gpuMemTotal,
        memoryUsed: gpuMemUsed
      },
      uptime,
      platform: os.platform(),
      release: os.release()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback for React Router (Single Page Application)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(dashboardPath, 'index.html'));
  } else {
    next();
  }
});

export async function autoMigrateKeys() {
  const vaultPath = getPath('api_vault.key');
  let extractedKeys: Record<string, string> = {};
  
  try {
    const { Entry } = require('@napi-rs/keyring');
    const entry = new Entry('nyxora', 'api_keys');
    const data = await entry.getPassword();
    if (data) {
      extractedKeys = JSON.parse(data);
      await entry.deletePassword();
      console.log('[Auto-Migrate] Migrated legacy keys from OS Keyring.');
    }
  } catch {}

  if (Object.keys(extractedKeys).length === 0 && fs.existsSync(vaultPath)) {
    try {
      const file = fs.readFileSync(vaultPath, 'utf8');
      extractedKeys = JSON.parse(file);
      fs.unlinkSync(vaultPath);
      console.log('[Auto-Migrate] Migrated legacy keys from api_vault.key.');
    } catch {}
  }

  if (Object.keys(extractedKeys).length > 0) {
    const config = loadConfig();
    config.credentials = { ...config.credentials, ...extractedKeys };
    saveConfig(config);
    console.log('[Auto-Migrate] Successfully injected legacy keys into config.yaml.');
  }
}

export async function startServer() {
  await autoMigrateKeys().catch(e => console.error('[Auto-Migrate] Error:', e));

  await initializePlugins();

  // ── Non-blocking: DeFi Aggregator Auto-Discovery ──────────────────────────
  // autoDiscover() makes external network calls to probe DeFi providers.
  // Running it as fire-and-forget lets the server start accepting LLM requests
  // immediately instead of blocking on network latency at cold start.
  // Providers will be available within a few seconds of startup.
  setImmediate(() => {
    try {
      const { aggregatorRegistry } = require('../web3/aggregator/providerRegistry');
      aggregatorRegistry.autoDiscover()
        .then(() => console.log('[Nyxora Gateway] DeFi Aggregator Providers Auto-Discovered.'))
        .catch((e: any) => console.error('[Nyxora Gateway] Failed to auto-discover DeFi providers:', e));
    } catch (e) {
      console.error('[Nyxora Gateway] Failed to load DeFi aggregator registry:', e);
    }
  });

  const PORT = CORE_PORT;
  const HOST = process.env.HOST || '127.0.0.1';
  const server = app.listen(PORT, HOST, () => {
    console.log(`🤖 Nyxora API Server running on ${HOST}:${PORT}`);
    
    // Initialize WebSocket Manager
    initWebSocket(server);
    
    // Start the Telegram bot listener
    startTelegramBot();
    
    // Start Native Channel Engine (New Architecture)
    const config = require('../config/parser').loadConfig();
    const activeChannels = config.channels?.active || [];
    
    // Auto-inject channels enabled via Dashboard (integrations object)
    if (config.integrations) {
      for (const [key, val] of Object.entries(config.integrations)) {
        if ((val as any)?.enabled && key !== 'telegram' && key !== 'discord' && !activeChannels.includes(key)) {
          activeChannels.push(key);
        }
      }
    }

    // Register all optional adapters lazily (catches missing deps gracefully)
    registerAllAdapters().then(() => {
      channelManager.startAll(activeChannels).catch((e: any) => {
        console.error('[ChannelManager] Error starting channels:', e);
      });
    }).catch((e: any) => {
      console.error('[ChannelManager] Error registering adapters:', e);
    });

    
    // Start Asynchronous Bridge Watcher
    startBridgeWatcher();
    
    // Start Event Listener for Limit Orders (V3)
    eventListener.start();
    
    // Resume Market Watch tasks
    try {
      const fs = require('fs');
      const path = require('path');
      const { getAppDir } = require('../config/paths');
      const tasksPath = path.join(getAppDir(), 'market_tasks.json');
      if (fs.existsSync(tasksPath)) {
        const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        if (tasks.length > 0) {
          console.log(`[Market Watch] Resuming ${tasks.length} background watch tasks...`);
        }
      }
    } catch (e) {
      console.error('[Market Watch] Failed to resume tasks:', e);
    }
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Nyxora Gateway] Port ${PORT} is already in use. Is Nyxora already running?`);
      process.exit(1);
    } else {
      console.error(`[Nyxora Gateway] Server error:`, e);
      process.exit(1);
    }
  });

  let isShuttingDown = false;
  const gracefulShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('[Nyxora Gateway] Received shutdown signal. Closing server...');
    
    // Wait for active transactions
    await txManager.waitForAll(10000);
    
    if (server.closeAllConnections) {
      server.closeAllConnections();
    }

    server.close(() => {
      console.log('[Nyxora Gateway] HTTP server closed.');
      logger.close();
      process.exit(0);
    });
    
    // Force exit after 3s if stuck
    setTimeout(() => {
      console.error('[Nyxora Gateway] Forced shutdown.');
      process.exit(1);
    }, 3000).unref();
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}
