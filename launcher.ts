// @ts-ignore
import { initSafeLogger } from './packages/core/src/utils/safeLogger';
initSafeLogger();

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { CORE_PORT, CORE_BASE_URL, ML_PORT } from './packages/core/src/config/constants';

// Fix Node 18+ native fetch randomly failing on dual-stack VPS (IPv6 issues)
dns.setDefaultResultOrder('ipv4first');

const INTERNAL_AUTH_TOKEN = crypto.randomBytes(64).toString('hex');
console.log(`[Launcher] Generated Internal Auth Token: ${INTERNAL_AUTH_TOKEN.substring(0, 8)}...`);

const nyxoraDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.nyxora');
const authDir = path.join(nyxoraDir, 'auth');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
const tokenPath = path.join(authDir, 'runtime.token');
fs.writeFileSync(tokenPath, INTERNAL_AUTH_TOKEN, { mode: 0o600 });
console.log(`[Launcher] Secured runtime token at ${tokenPath} (0600)`);

const env = {
  ...process.env,
  INTERNAL_AUTH_TOKEN,
  SIGNER_SOCKET_PATH: '/tmp/nyxora-signer.sock',
  TS_NODE_CACHE: 'false',
  PYTHONUNBUFFERED: '1'
};

const spawnService = (name: string, command: string, args: string[], env: any, inheritStdio: boolean = false, cwd?: string) => {
  let child: ReturnType<typeof spawn>;
  let crashCount = 0;
  let crashWindowStart = Date.now();
  let isShuttingDown = false;

  const startProcess = () => {
    const spawnOpts: any = { env, stdio: inheritStdio ? 'inherit' : 'pipe', windowsHide: true };
    if (cwd) spawnOpts.cwd = cwd;
    child = spawn(command, args, spawnOpts);
    child.on('error', (err) => {
      console.error(`[Launcher] Failed to spawn ${name}:`, err.message);
      isShuttingDown = true; // Prevent retry loop if spawn fails
    });

    if (!inheritStdio) {
      child.stdout?.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
      child.stderr?.on('data', (data) => {
        const msg = data.toString();
        if (msg.toLowerCase().includes('warn') || msg.toLowerCase().includes('info')) {
          process.stderr.write(`[${name}] ${msg}`);
        } else {
          process.stderr.write(`[${name}] ERROR: ${msg}`);
        }
      });
    }

    child.on('close', async (code) => {
      console.log(`[${name}] Exited with code ${code}`);
      if (isShuttingDown) return;

      const now = Date.now();
      if (now - crashWindowStart > 60000) {
        crashCount = 0;
        crashWindowStart = now;
      }
      
      crashCount++;
      if (crashCount > 5) {
        if (name === 'ML Engine') {
           console.error(`[Launcher] ML Engine crashed 5 times. Disabling it to prevent system shutdown.`);
           isShuttingDown = true;
           return;
        }
        console.error(`[Launcher] FATAL: ${name} crashed 5 times in 1 minute. Initiating emergency shutdown.`);
        isShuttingDown = true;
        try {
          const yaml = require('yaml');
          const configPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.nyxora', 'config', 'config.yaml');
          const actualConfigPath = fs.existsSync(configPath) ? configPath : path.join(process.env.HOME || process.env.USERPROFILE || '', '.nyxora', 'config.yaml');
          if (fs.existsSync(actualConfigPath)) {
            const configStr = fs.readFileSync(actualConfigPath, 'utf8');
            const config = yaml.parse(configStr);
            const tgToken = config?.telegram?.bot_token;
            const tgChatId = config?.telegram?.admin_chat_id;
            
            if (tgToken && tgChatId) {
               const alertText = config?.alerts?.emergency_text || "🚨 FATAL ERROR: A critical process has crashed repeatedly. Nyxora is executing an emergency auto-shutdown to protect your system. Please check the server logs.";
               await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                 method: 'POST',
                 headers: {'Content-Type': 'application/json'},
                 body: JSON.stringify({ chat_id: tgChatId, text: alertText })
               }).catch(() => {});
            }
          }
        } catch(e) {}
        
        console.log('\n[Launcher] Shutting down all services due to emergency shutdown...');
        children.forEach(c => c.kill());
        
        // Give children time to exit cleanly
        setTimeout(() => {
          process.exit(1);
        }, 1000);
        return;
      }

      console.log(`[Launcher] Restarting ${name} in 3 seconds... (Attempt ${crashCount}/5)`);
      setTimeout(startProcess, 3000);
    });
  };

  startProcess();

  return {
    kill: () => {
      isShuttingDown = true;
      if (child && !child.killed && child.pid) {
        try { process.kill(child.pid, 'SIGTERM'); } catch(e) {}
      }
    },
    forceKill: () => {
      if (child && !child.killed && child.pid) {
        try { process.kill(child.pid, 'SIGKILL'); } catch(e) {}
      }
    }
  };
};

console.log('[Launcher] Starting Monorepo Services...');
import { startGoalWorker } from './packages/core/src/agent/goalWorker';
startGoalWorker();
console.log('[Launcher] Goal worker started.');

const socketPath = env.SIGNER_SOCKET_PATH;
if (fs.existsSync(socketPath)) {
  console.log(`[Launcher] Removing stale unix socket at ${socketPath}`);
  fs.unlinkSync(socketPath);
}

const children: { kill: () => void; forceKill: () => void; }[] = [];

const __filenameResolved = __filename;
const __dirnameResolved = __dirname;

const isCompiled = __filenameResolved.endsWith('.js');
const ext = isCompiled ? '.js' : '.ts';
const cmd = isCompiled ? 'node' : path.join(__dirnameResolved, 'node_modules', '.bin', 'ts-node');
const baseArgs = isCompiled ? [] : ['-T'];

const signerPath = path.join(__dirnameResolved, `packages/signer/src/server${ext}`);
const signer = spawnService('Signer', cmd, [...baseArgs, signerPath], env);
children.push(signer);

setTimeout(() => {
  const policyPath = path.join(__dirnameResolved, `packages/policy/src/server${ext}`);
  const policy = spawnService('Policy', cmd, [...baseArgs, policyPath], env);
  children.push(policy);
  
  setTimeout(() => {
    // Spawn ML Engine (Python Sidecar)
    // Cross-platform: Windows uses Scripts/, Unix uses bin/
    const IS_WINDOWS_LAUNCHER = process.platform === 'win32';
    const pythonBinDir = IS_WINDOWS_LAUNCHER ? 'Scripts' : 'bin';
    const pythonExe = IS_WINDOWS_LAUNCHER ? 'python.exe' : 'python';
    const defaultPythonPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.nyxora', 'ml-engine', 'venv', pythonBinDir, pythonExe);
    const pythonPath = process.env.ML_ENGINE_PYTHON_PATH || defaultPythonPath;
    if (fs.existsSync(pythonPath)) {
      let mlDir = path.join(__dirnameResolved, 'packages', 'ml-engine');
      if (!fs.existsSync(mlDir)) mlDir = path.join(__dirnameResolved, '..', 'packages', 'ml-engine');
      const mlArgs = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', ML_PORT.toString()];
      const mlEngine = spawnService('ML Engine', pythonPath, mlArgs, env, false, mlDir);
      children.push(mlEngine);
    } else {
      console.warn('[Launcher] Warning: Python virtual environment not found. ML Engine features (market analysis etc.) will be unavailable. Run: nyxora setup');
    }

    setTimeout(() => {
      const corePath = path.join(__dirnameResolved, `packages/core/src/gateway/cli${ext}`);
      const args = process.argv.slice(2);
      // Kill any lingering process on port 40000 before spawning Core to prevent EADDRINUSE crash loops
      if (process.platform !== 'win32') {
        try { require('child_process').execSync(`fuser -k ${CORE_PORT}/tcp 2>/dev/null || true`); } catch (e) { }
        try { require('child_process').execSync(`lsof -ti tcp:${CORE_PORT} | xargs kill -9 2>/dev/null || true`); } catch (e) { }
      }
      const core = spawnService('Core', cmd, [...baseArgs, corePath, ...args], env, true);
      children.push(core);

      // --- AUTO-TUNNEL (Cloudflare) ---
      // Respects config: set cloudflare_tunnel: false in ~/.nyxora/config/config.yaml to disable.
      setTimeout(() => {
        let cfEnabled = true;
        try {
          const yaml = require('yaml');
          const configPath = path.join(nyxoraDir, 'config', 'config.yaml');
          const fallbackPath = path.join(nyxoraDir, 'config.yaml');
          const actualPath = fs.existsSync(configPath) ? configPath : fallbackPath;
          if (fs.existsSync(actualPath)) {
            const cfg = yaml.parse(fs.readFileSync(actualPath, 'utf8'));
            if (cfg?.cloudflare_tunnel === false) {
              cfEnabled = false;
              console.log('[Launcher] Cloudflare Auto-Tunnel is disabled by config (cloudflare_tunnel: false).');
            }
          }
        } catch (e) {}

        if (cfEnabled) {
          console.log(`[Launcher] Starting Auto-Tunnel (Cloudflare) on port ${CORE_PORT}...`);
          const cf = spawn('npx', ['cloudflared', 'tunnel', '--url', CORE_BASE_URL], { env, shell: true, windowsHide: true });

          children.push({
            kill: () => { try { process.kill(cf.pid!, 'SIGTERM'); } catch(e){} },
            forceKill: () => { try { process.kill(cf.pid!, 'SIGKILL'); } catch(e){} }
          });

          cf.stderr.on('data', (data: Buffer) => {
            const msg = data.toString();
            const match = msg.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
              const url = match[0];
              console.log(`\n[Auto-Tunnel] Secure Public URL generated: ${url}\n`);
              fs.writeFileSync(path.join(nyxoraDir, 'public_url.txt'), url, 'utf8');
            }
          });
        }
      }, 3000);

    }, 1000);
  }, 1000);
}, 1000);


// Ensure all child processes are killed when launcher exits
let isCleaningUp = false;
const cleanup = () => {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log('\n[Launcher] Shutting down all services...');
  children.forEach(c => c.kill());
  // Give them a moment to cleanup
  setTimeout(() => {
    children.forEach(c => {
      try { c.forceKill(); } catch(e) {}
    });
    // pkill is Unix-only — skip on Windows
    if (process.platform !== 'win32') {
      try { require('child_process').execSync('pkill -f ts-node'); } catch (e) {}
      try { require('child_process').execSync('pkill -f uvicorn'); } catch (e) {}
    }
    process.exit(0);
  }, 1000);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
