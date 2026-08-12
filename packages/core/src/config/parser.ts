import fs from 'fs';
import yaml from 'yaml';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getPath } from './paths';
let cachedEncryptionKey: Buffer | null = null;
function getEncryptionKeySync(): Buffer {
    if (cachedEncryptionKey) return cachedEncryptionKey;
    let masterKeyRaw = process.env.NYXORA_MASTER_KEY;
    if (!masterKeyRaw) {
        try {
            const { execSync } = require('child_process');
            const output = execSync(`node -e "require('@napi-rs/keyring').Entry.prototype.getPassword.call(new (require('@napi-rs/keyring').Entry)('nyxora', 'config_master')).then(console.log).catch(()=>console.log(''))"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const pk = output?.trim();
            if (pk) masterKeyRaw = pk;
        } catch {}
    }
    if (!masterKeyRaw) {
        try {
            const masterKeyPath = path.join(os.homedir(), '.nyxora', 'auth', 'master.key');
            if (fs.existsSync(masterKeyPath)) {
                masterKeyRaw = fs.readFileSync(masterKeyPath, 'utf8').trim();
            } else {
                masterKeyRaw = crypto.randomBytes(32).toString('hex');
                try { fs.writeFileSync(masterKeyPath, masterKeyRaw, { mode: 0o600 }); } catch {}
            }
        } catch (e) {
            masterKeyRaw = 'default_fallback_nyxora_key';
        }
    }
    cachedEncryptionKey = crypto.createHash('sha256').update(masterKeyRaw).digest();
    return cachedEncryptionKey;
}

export function encryptDataSync(text: string): string {
    if (!text || text.startsWith('ENC:')) return text;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKeySync(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `ENC:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptDataSync(encryptedText: string): string {
    if (!encryptedText) return encryptedText;
    if (!encryptedText.startsWith('ENC:')) {
        return encryptedText;
    }
    try {
        const parts = encryptedText.split(':');
        if (parts.length < 4) return encryptedText;
        const iv = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        const encrypted = parts.slice(3).join(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKeySync(), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return encryptedText; // return raw if decryption fails
    }
}

export function loadRpcConfig(): Record<string, string | string[]> {
  const rpcPath = getPath('rpc_key.yaml');
  if (fs.existsSync(rpcPath)) {
    try {
      return yaml.parse(fs.readFileSync(rpcPath, 'utf8')) || {};
    } catch (e) {
      console.error('[Config] Failed to parse rpc_key.yaml', e);
    }
  }
  return {};
}

export function saveRpcConfig(rpcUrls: Record<string, string | string[]>): void {
  const rpcPath = getPath('rpc_key.yaml');
  try {
    const tempPath = rpcPath + '.tmp.' + Date.now();
    fs.writeFileSync(tempPath, yaml.stringify(rpcUrls), 'utf8');
    fs.renameSync(tempPath, rpcPath);
  } catch (error) {
    console.error('Failed to save rpc_key.yaml', error);
  }
}

export async function loadApiKeys(): Promise<Record<string, string>> {
  const config = loadConfig();
  return (config.credentials as Record<string, string>) || {};
}

export async function saveApiKeys(newKeys: Record<string, string>): Promise<void> {
  const config = loadConfig();
  if (!config.credentials) config.credentials = {};
  config.credentials = { ...config.credentials, ...newKeys };
  saveConfig(config);
}

export interface NyxoraConfig {
  agent: {
    name: string;
    description: string;
    default_chain: string;
    default_router?: string;
    default_slippage?: number | "auto";
    log_level?: 'info' | 'debug';
    base_fiat?: string;
    python_path?: string;
    max_turns?: number;
  };
  llm: {
    provider: string;
    model: string;
    temperature: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    repetition_penalty?: number;
    reasoning_effort?: 'low' | 'medium' | 'high' | 'none';
    api_keys?: string[];
    credentials?: any; // Deprecated, kept for parsing during migration
    base_url?: string;
    image_provider?: string;
    image_model?: string;
    max_tokens?: number;
    max_context?: number;
    vision_provider?: string;  // Dedicated vision provider (e.g. 'gemini'), falls back to llm.provider
    vision_model?: string;     // Dedicated vision model (e.g. 'gemini-2.5-flash'), falls back to llm.model
  };
  web_search?: {
    provider: 'tavily' | 'brave' | 'duckduckgo' | 'mesh' | 'serpapi';
    enabled: boolean;
    scraper?: string;
    fallback_provider?: 'tavily' | 'brave' | 'duckduckgo' | 'mesh' | 'serpapi';
  };
  credentials?: {
    openai_key?: string;
    gemini_key?: string;
    anthropic_key?: string;
    openrouter_key?: string;
    '9router_key'?: string;
    nvidia_key?: string;
    mistral_key?: string;
    xai_key?: string;
    deepseek_key?: string;
    groq_key?: string;
    custom_provider_key?: string;
    tavily_key?: string;
    brave_key?: string;
    serpapi_key?: string;
    [key: string]: string | undefined;
  };
  memory: {
    type: string;
    path: string;
  };
  web3?: {
    rpc_urls?: Record<string, string | string[]>;
    explorer_api_key?: string;
  };
  integrations?: {
    telegram?: {
      enabled: boolean;
      bot_token?: string;
      authorized_chat_id?: number;
    };
    discord?: {
      enabled: boolean;
      bot_token?: string;
      client_id?: string;
    };
  };
  security?: {
    dashboard_password?: string;
  };
  skills?: {
    web3: string[];
    os: string[];
  };
  channels?: {
    active: string[];
  };
  mcp_servers?: Record<string, any>;
  curator?: {
    enabled: boolean;
    archive_after_days: number;
  };
}

let cachedNyxoraConfig: NyxoraConfig | null = null;
let lastConfigLoadTime = 0;

export function loadConfig(): NyxoraConfig {
  const now = Date.now();
  if (cachedNyxoraConfig && now - lastConfigLoadTime < 5000) {
    return cachedNyxoraConfig;
  }
  const configPath = getPath('config.yaml');
  const rpcPath = getPath('rpc_key.yaml');
  let rpcUrls = loadRpcConfig();
  
  try {
    const file = fs.readFileSync(configPath, 'utf8');
    const parsed = yaml.parse(file) as Partial<NyxoraConfig>;
    
    // Load external MCP servers from nyxmcp.yaml if present
    const nyxmcpPath = getPath('nyxmcp.yaml');
    if (fs.existsSync(nyxmcpPath)) {
      try {
        const nyxmcpFile = fs.readFileSync(nyxmcpPath, 'utf8');
        const nyxmcpParsed = yaml.parse(nyxmcpFile) || {};
        const servers = nyxmcpParsed.mcp_servers || nyxmcpParsed;
        if (servers && typeof servers === 'object') {
          parsed.mcp_servers = {
            ...(parsed.mcp_servers || {}),
            ...servers
          };
        }
      } catch (err) {
        console.error('[Config] Failed to parse nyxmcp.yaml', err);
      }
    }
    
    let needsSave = false;
    
    // Decrypt credentials
    if (parsed.credentials) {
      for (const key in parsed.credentials) {
        if (parsed.credentials[key]) {
            if (parsed.credentials[key]!.startsWith('ENC:')) needsSave = true;
            parsed.credentials[key] = decryptDataSync(parsed.credentials[key]!);
        }
      }
    }
    if (parsed.integrations?.telegram?.bot_token) {
      if (parsed.integrations.telegram.bot_token.startsWith('ENC:')) needsSave = true;
      parsed.integrations.telegram.bot_token = decryptDataSync(parsed.integrations.telegram.bot_token);
    }
    
    
    // Auto-migration logic: move llm.credentials to root credentials
    if (parsed.llm && (parsed.llm as any).credentials) {
      if (!parsed.credentials) {
        parsed.credentials = {};
      }
      const oldCreds = (parsed.llm as any).credentials;
      Object.keys(oldCreds).forEach(key => {
        if (oldCreds[key] && !parsed.credentials![key]) {
          parsed.credentials![key] = oldCreds[key];
        }
      });
      delete (parsed.llm as any).credentials;
      needsSave = true;
    }

    // Ensure we don't accidentally overwrite rpc_key.yaml with old config.yaml data.
    if (parsed.web3 && parsed.web3.rpc_urls) {
      delete parsed.web3.rpc_urls;
      needsSave = true;
    }

    // Auto-migration logic: move permissions to policy.yaml
    const policyPath = getPath('policy.yaml');
    if (!fs.existsSync(policyPath)) {
      const defaultPolicy = `auto_approve_limit_usd: 0\ncustom_llm_rules: []\n`;
      fs.writeFileSync(policyPath, defaultPolicy, 'utf8');
      console.log('[Config] Created default policy.yaml.');
    }
    if ((parsed as any).permissions) {
      delete (parsed as any).permissions;
      needsSave = true;
    }

    if (needsSave) {
      try {
        saveConfig(parsed as NyxoraConfig);
        console.log('[Config] Auto-migrated config file safely.');
      } catch (e) {
        console.error('[Config] Failed to auto-migrate config file', e);
      }
    }
    

    
    
    const validatedConfig: NyxoraConfig = {
      agent: parsed.agent || { name: 'Nyxora-Default', description: 'Your Personal Web3 Assistant.', default_chain: 'base', default_router: 'auto', default_slippage: 'auto' },
      llm: {
        provider: parsed.llm?.provider || 'openai',
        model: parsed.llm?.model || 'gpt-4o-mini',
        temperature: parsed.llm?.temperature ?? 0.2,
        frequency_penalty: parsed.llm?.frequency_penalty ?? 0.6,
        presence_penalty: parsed.llm?.presence_penalty ?? 0.3,
        repetition_penalty: parsed.llm?.repetition_penalty ?? 1.15,
        reasoning_effort: parsed.llm?.reasoning_effort,
        api_keys: parsed.llm?.api_keys || [],
        base_url: parsed.llm?.base_url,
        image_provider: parsed.llm?.image_provider,
        image_model: parsed.llm?.image_model,
        max_tokens: (parsed.llm?.max_tokens && parsed.llm.max_tokens > 4096) ? 4096 : (parsed.llm?.max_tokens || 4096),
        max_context: parsed.llm?.max_context
      },
      web_search: parsed.web_search || {
        provider: 'mesh',
        enabled: true
      },
      credentials: parsed.credentials || {},
      memory: parsed.memory || { type: 'file', path: './memory.json' },
      web3: { ...parsed.web3, rpc_urls: rpcUrls },
      integrations: parsed.integrations || {
        telegram: { enabled: false },
        discord: { enabled: false }
      },
      security: parsed.security || { dashboard_password: '123456' },
      skills: parsed.skills,
      channels: parsed.channels,
      mcp_servers: parsed.mcp_servers || {},
      curator: parsed.curator || { enabled: true, archive_after_days: 14 }
    };

    cachedNyxoraConfig = validatedConfig;
    lastConfigLoadTime = Date.now();
    return validatedConfig;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('[Config] No config.yaml found. Using default configuration.');
    } else if (error.name === 'YAMLError' || error.message?.includes('YAML')) {
      console.warn('[Parser] YAML Parse Error:', error.message);
    } else {
      console.error('[Config] Failed to load config.yaml. Using default configuration.', error);
    }
    const defaultConfig: NyxoraConfig = {
      agent: {
        name: "Nyxora-Default",
        description: "Your Personal Web3 Assistant.",
        default_chain: "ethereum",
        default_router: "auto",
        default_slippage: "auto"
      },
      llm: { 
        provider: 'openai', 
        model: 'gpt-4o-mini', 
        temperature: 0.2,
        frequency_penalty: 0.6,
        presence_penalty: 0.3,
        repetition_penalty: 1.0,
        api_keys: []
      },
      web_search: {
        provider: 'mesh',
        enabled: true
      },
      credentials: {},
      memory: { type: 'file', path: './memory.json' },
      web3: { rpc_urls: rpcUrls },
      integrations: {
        telegram: { enabled: false },
        discord: { enabled: false }
      },
      mcp_servers: {},
      curator: { enabled: true, archive_after_days: 14 }
    };
    
    cachedNyxoraConfig = defaultConfig;
    lastConfigLoadTime = Date.now();
    return defaultConfig;
  }
}

export function saveConfig(newConfig: NyxoraConfig): void {
  const configPath = getPath('config.yaml');
  try {
    cachedNyxoraConfig = null;
    lastConfigLoadTime = 0;
    const configToSave = JSON.parse(JSON.stringify(newConfig));
    if (configToSave.web3 && configToSave.web3.rpc_urls) {
      delete configToSave.web3.rpc_urls;
    }
    if (configToSave.mcp_servers) {
      delete configToSave.mcp_servers;
    }

    // Keys are no longer encrypted before saving. They are stored in plain text.

    const yamlStr = yaml.stringify(configToSave);
    const tempPath = configPath + '.tmp.' + Date.now();
    fs.writeFileSync(tempPath, yamlStr, 'utf8');
    fs.renameSync(tempPath, configPath);
  } catch (error) {
    console.error('Failed to save config.yaml', error);
  }
}

export interface PolicyConfig {
  max_usd_per_tx?: number;
  whitelist_only?: boolean;
  require_approval?: boolean;
  auto_approve_limit_usd?: number;
  custom_llm_rules?: string[];
  auto_approve_shell?: boolean;
  blacklisted_addresses?: string[];
}

export function loadPolicyConfig(): PolicyConfig {
  const policyPath = getPath('policy.yaml');
  if (fs.existsSync(policyPath)) {
    try {
      return yaml.parse(fs.readFileSync(policyPath, 'utf8')) || {};
    } catch (e) {
      console.error('[Config] Failed to parse policy.yaml', e);
    }
  }
  return {};
}
