import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, loadApiKeys } from '../config/parser';
import { LLMProvider, AnthropicAdapter, GeminiAdapter, OpenAIAdapter } from '../agent/llmProvider';

let cachedLLMClient: LLMProvider | null = null;
let cachedProviderName = '';
let cachedApiKey = '';

export const PROVIDER_CONFIGS: Record<string, { baseURL?: string; requiresApiKey: boolean }> = {
  ollama: { baseURL: process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/v1` : 'http://localhost:11434/v1', requiresApiKey: false },
  '9router': { baseURL: 'http://localhost:20128/v1', requiresApiKey: true },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', requiresApiKey: true },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1', requiresApiKey: true },
  groq: { baseURL: 'https://api.groq.com/openai/v1', requiresApiKey: true },
  mistral: { baseURL: 'https://api.mistral.ai/v1', requiresApiKey: true },
  xai: { baseURL: 'https://api.x.ai/v1', requiresApiKey: true },
  deepseek: { baseURL: 'https://api.deepseek.com', requiresApiKey: true },
  nvidia: { baseURL: 'https://integrate.api.nvidia.com/v1', requiresApiKey: true },
  openai: { requiresApiKey: true },
  custom_provider: { requiresApiKey: true }
};

export function getEstimatedMaxContext(model: string): number {
  if (!model) return 32768;
  const m = model.toLowerCase();

  // ── Very small models (2K–4K context) ────────────────────────────────────
  // These need special handling — even an 8K estimate will cause 400s.
  if (m.includes('smollm') || m.includes('smol-lm')) return 2048;
  if (m.includes('tinyllama')) return 2048;
  if (m.includes('1.1b') || m.includes('1b:')) return 2048;
  if (m.includes('phi3:mini') || m.includes('phi-3-mini') || m.includes('phi3-mini')) return 4096;
  if (m.includes('phi3.5') || m.includes('phi-3.5')) return 4096;
  if (m.includes('phi3') || m.includes('phi-3')) return 4096; // generic phi3 variants

  // ── Small models (8K context) ─────────────────────────────────────────────
  if (m.includes('1.5b') || m.includes('3b')) return 8192;
  if (m.includes('gemma:2b') || m.includes('gemma2b')) return 8192;
  if (m.includes('gemma2:9b') || m.includes('gemma2:27b')) return 8192;
  if (m.includes('gemma2') || m.includes('gemma-2')) return 8192;
  if (m.includes('gemma')) return 8192; // all gemma variants default to 8K
  if (m.includes('codegemma')) return 8192;
  if (m.includes('aya')) return 8192;
  if (m.includes('llama-3') || m.includes('llama3')) return 8192;

  // ── Mid models (32K context) ──────────────────────────────────────────────
  if (m.includes('7b') || m.includes('8b') || m.includes('9b') || m.includes('14b')) return 32768;
  if (m.includes('mixtral') || m.includes('mistral')) return 32768;

  // ── Large cloud models ────────────────────────────────────────────────────
  if (m.includes('gemini-1.5-pro')) return 2000000;
  if (m.includes('gemini-1.5-flash') || m.includes('gemini-2')) return 1000000;
  if (m.includes('gemini')) return 1000000;
  if (m.includes('gpt-4o') || m.includes('gpt-4-turbo') || m.includes('gpt-4')) return 128000;
  if (m.includes('claude-3') || m.includes('claude-4')) return 200000;
  if (m.includes('grok')) return 128000;
  if (m.includes('deepseek')) return 128000;
  if (m.includes('nemotron') || m.includes('command')) return 128000;
  if (m.includes('qwen')) return 128000;
  if (m.includes('llama-3.1') || m.includes('llama-3.2') || m.includes('llama-3.3') || m.includes('llama3.1')) return 128000;

  return 32768;
}

/** Returns true when context window is ≤ 8192 tokens (small/local model). */
export function isSmallModel(model: string): boolean {
  return getEstimatedMaxContext(model) <= 8192;
}

/** Returns true for local providers (Ollama, 9router) that don't support all OpenAI params. */
export function isLocalProvider(provider: string): boolean {
  const p = (provider || '').toLowerCase();
  return p === 'ollama' || p === '9router';
}

export async function getOpenAI(): Promise<OpenAI> {
  const config = loadConfig();
  const vaultKeys = await loadApiKeys();
  const providerName = config.llm.provider || 'openai';
  
  // Audio Transcription Fallback: Always try to use OpenAI/Groq if Anthropic/Gemini
  let actualProvider = (providerName === 'anthropic' || providerName === 'gemini') ? 'openai' : providerName;
  const providerConf = PROVIDER_CONFIGS[actualProvider] || PROVIDER_CONFIGS['openai'];

  let apiKey = 'local';
  if (providerConf.requiresApiKey) {
    const keyName = `${actualProvider}_key`;
    apiKey = vaultKeys[keyName] || config.credentials?.[keyName] || '';
    if (!apiKey && actualProvider === 'openai') {
        // Last resort fallback to groq for audio if openai key is missing
        actualProvider = 'groq';
        apiKey = vaultKeys['groq_key'] || config.credentials?.['groq_key'] || '';
    }
    if (!apiKey) {
      throw new Error(`[Security] No Audio Transcription API Key found (OpenAI/Groq). Please run 'nyxora set-key openai <key>'.`);
    }
  }

  return new OpenAI({
    baseURL: actualProvider === 'custom_provider' ? config.llm.base_url : (PROVIDER_CONFIGS[actualProvider] || PROVIDER_CONFIGS['openai']).baseURL,
    apiKey: apiKey,
    timeout: 600 * 1000,
    maxRetries: 0
  });
}

export async function getLLMClient(): Promise<LLMProvider> {
  const config = loadConfig();
  const vaultKeys = await loadApiKeys();
  const providerName = config.llm.provider || 'openai';
  const providerConf = PROVIDER_CONFIGS[providerName] || PROVIDER_CONFIGS['openai'];

  let apiKey = '';
  const keyName = `${providerName}_key`;
  const keyNameAlias = `${providerName}_api_key`; // support alias (e.g. 9router_api_key)
  apiKey = vaultKeys[keyName] || vaultKeys[keyNameAlias] || config.credentials?.[keyName] || config.credentials?.[keyNameAlias] || '';

  if (!apiKey && providerConf.requiresApiKey) {
    throw new Error(`[Security] No API Key found for ${providerName} in OS Keyring. Please run 'nyxora set-key ${providerName} <key>' or 'nyxora setup'.`);
  }

  if (cachedLLMClient && cachedProviderName === providerName && cachedApiKey === apiKey) {
      return cachedLLMClient;
  }

  if (providerConf.requiresApiKey) {
    console.log(`[LLM] Using API Key securely unlocked from OS Keyring vault for ${providerName}.`);
  }

  cachedProviderName = providerName;
  cachedApiKey = apiKey;

  if (providerName === 'anthropic') {
    const client = new Anthropic({ apiKey });
    cachedLLMClient = new AnthropicAdapter(client);
    return cachedLLMClient;
  }

  if (providerName === 'gemini') {
    cachedLLMClient = new GeminiAdapter(apiKey);
    return cachedLLMClient;
  }

  // Default fallback (OpenAI, Groq, OpenRouter, xAI, Mistral, DeepSeek, Custom)
  const client = new OpenAI({
    baseURL: providerName === 'custom_provider' ? config.llm.base_url : providerConf.baseURL,
    apiKey: apiKey || 'local',
    timeout: 600 * 1000,
    maxRetries: 0
  });
  cachedLLMClient = new OpenAIAdapter(client);
  return cachedLLMClient;
}

/**
 * Detects whether a 400 error is caused by an unsupported parameter rather than
 * an auth/context issue. These errors are recoverable: strip the offending params and retry.
 */
function isUnsupportedParamError(errMsg: string): boolean {
  return (
    errMsg.includes('unsupported parameter') ||
    errMsg.includes('unknown field') ||
    errMsg.includes('extra inputs are not permitted') ||
    errMsg.includes('unrecognized request argument') ||
    errMsg.includes('is not supported') && (errMsg.includes('frequency_penalty') || errMsg.includes('presence_penalty') || errMsg.includes('top_p') || errMsg.includes('tool_choice') || errMsg.includes('reasoning_effort'))
  );
}

export async function executeWithRetry(
  requestBuilder: (client: LLMProvider) => Promise<any>,
  maxRetries = 3
): Promise<any> {
  let retries = 0;
  let strippedParams = false;

  while (retries <= maxRetries) {
    try {
      const client = await getLLMClient();
      return await requestBuilder(client);
    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      const errMsg = (error?.message || '').toLowerCase();

      // If a 400 error contains "quota" or "rate limit", it's actually a Rate Limit.
      const isFake400RateLimit = status === 400 && (errMsg.includes('quota') || errMsg.includes('rate limit') || errMsg.includes('reset after'));

      // --- Recoverable 400: unsupported parameter (local/small model) ---
      // Some local or small models reject frequency_penalty, presence_penalty, top_p, tool_choice.
      // Retry once with a stripped-down requestBuilder that omits these params.
      if (status === 400 && !isFake400RateLimit && !strippedParams && isUnsupportedParamError(errMsg)) {
        console.warn(`[LLM] 400 due to unsupported parameter: "${error.message}". Retrying with stripped params...`);
        strippedParams = true;
        // Wrap the original requestBuilder to intercept the payload and strip optional params
        const strippedBuilder = async (client: LLMProvider) => {
          const originalChat = client.chat.bind(client);
          const originalStream = client.stream.bind(client);
          const stripPayload = (payload: any) => {
            const stripped = { ...payload };
            delete stripped.frequency_penalty;
            delete stripped.presence_penalty;
            delete stripped.repetition_penalty;
            delete stripped.reasoning_effort;
            // Only strip top_p if both temperature and top_p are set (some models reject the combo)
            if (stripped.temperature !== undefined && stripped.top_p !== undefined) {
              delete stripped.top_p;
            }
            return stripped;
          };
          // Temporarily override chat/stream on the client object for this call
          const patchedClient: LLMProvider = {
            ...client,
            chat: (payload: any) => originalChat(stripPayload(payload)),
            stream: (payload: any, onChunk: any, onReasoning: any) => originalStream(stripPayload(payload), onChunk, onReasoning),
          };
          return requestBuilder(patchedClient);
        };
        try {
          const client = await getLLMClient();
          return await strippedBuilder(client);
        } catch (strippedError: any) {
          // If it still fails, fall through to the normal fatal error path
          console.error(`[LLM] Stripped-param retry also failed: ${strippedError.message}`);
          throw strippedError;
        }
      }

      // 401 Unauthorized or true 400 Bad Request (context overflow, schema error) — fatal
      if ((status === 401 || status === 400) && !isFake400RateLimit) {
        console.error(`[LLM] Fatal Error ${status}: ${error.message}. Aborting.`);
        throw error;
      }

      // Check if any error message specifies a reset delay (e.g., NVIDIA/Nemotron 502 with "reset after 11s")
      let waitMs = 0;
      if (errMsg.includes('reset after')) {
        const match = errMsg.match(/reset after (\d+)s/);
        if (match && match[1]) {
          waitMs = parseInt(match[1]) * 1000 + 1000;
        }
      }

      // 429 Rate Limit or Fake 400 Rate Limit — backoff and retry
      if (status === 429 || isFake400RateLimit) {
        console.warn(`[LLM] Rate Limit hit (${status}). Backing off...`);
        retries++;
        if (retries > maxRetries) throw error;
        const delayMs = waitMs > 0 ? waitMs : 2000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      // 500, 502, 503, Timeout, Network error — Exponential Backoff
      retries++;
      if (retries > maxRetries) {
        console.error(`[LLM] Max retries reached.`);
        throw error;
      }
      const delayMs = waitMs > 0 ? waitMs : Math.pow(2, retries) * 1000;
      console.warn(`[LLM] API Error (${status || error.message}). Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
