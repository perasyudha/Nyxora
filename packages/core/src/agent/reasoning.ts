import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { LLMProvider, OpenAIAdapter, AnthropicAdapter, GeminiAdapter } from './llmProvider';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, loadApiKeys } from '../config/parser';
import { Logger } from '../memory/logger';
import { Tracker } from '../gateway/tracker';
import { episodicDB } from '../memory/episodic';
import { createSmartStreamWrapper } from '../utils/streamSimulator';
import { needsCompression, compressHistory } from '../utils/contextSummarizer';

import { getPath } from '../config/paths';
import pc from 'picocolors';

export const logger = new Logger();



import { getOpenAI, executeWithRetry } from '../utils/llmUtils';
import { txManager } from './transactionManager';
import { promptBuilder } from './promptBuilder';

async function getSystemPrompt(context: 'web3' | 'os' | 'general' = 'general', userInput: string = ''): Promise<string> {
    const config = loadConfig();
    const provider = (config?.llm?.provider || '').toLowerCase();
    let modelFamily: 'openai' | 'google' | 'anthropic' | 'grok' | 'unknown' = 'unknown';
    if (provider.includes('openai')) modelFamily = 'openai';
    else if (provider.includes('gemini') || provider.includes('google')) modelFamily = 'google';
    else if (provider.includes('anthropic') || provider.includes('claude')) modelFamily = 'anthropic';
    else if (provider.includes('grok') || provider.includes('xai')) modelFamily = 'grok';

    return await promptBuilder.buildSystemPrompt({
        agentType: context,
        userInput,
        config,
        modelFamily
    });
}

// ──────────────────────────────────────────────────────────────────
// Module-level routing keyword constants
// Defined here once and shared by both processUserInput() and processUserInputStream()
// to ensure consistent routing across sync and streaming paths.
//
// NOTE: Arrays are intentionally multilingual. Nyxora targets a global user base.
// Indonesian terms are included as the primary non-English locale.
// To add another language, extend these arrays — no other changes required.
// ──────────────────────────────────────────────────────────────────
const OS_KEYWORDS: string[] = [
  // Files, Documents & Notes
  'excel', 'xlsx', 'spreadsheet', 'generate excel',
  'file', 'folder', 'directory', 'read file', 'write file', 'pdf', 'word', 'docx', 'document',
  'note', 'catat', 'catatan', 'keep', 'download', 'unduh', 'link',
  // Terminal & Git & System
  'terminal', 'command', 'shell', 'bash', 'script', 'run command',
  'git', 'commit', 'push', 'pull', 'clone', 'branch', 'merge',
  'install', 'installin', 'uninstall', 'apt', 'npm', 'pip', 'yarn', 'docker', 'system',
  'search web', 'google', 'browse', 'scrape', 'weather', 'news', 'search', 'find', 'look up',
  // Email & Workspace
  'email', 'gmail', 'google docs', 'google sheets', 'notion', 'calendar',
  // Social & Media
  'twitter', 'tweet', 'x post', 'transcribe', 'audio',
  // Messaging & File Upload
  'telegram', 'discord', 'kirim file', 'send file', 'upload file', 'upload', 'attach', 'share file', 'share link',
  // AI Settings
  'rename agent', 'change persona', 'update profile', 'update identity', 'setting',
  // Summarization
  'summarize', 'summary', 'ringkas',
  // Search & Info queries (Global + ID)
  'cariin', 'cari', 'lihat', 'jadwal', 'info', 'berita', 'schedule',
  'cek email', 'cek kalender', 'cek file', 'cek folder', 'check email', 'check calendar', 'check file',
];

const WEB3_KEYWORDS: string[] = [
  // Transactions
  'swap', 'bridge', 'transfer',
  // Safe Send Actions (Explicit)
  'send token', 'send eth', 'send bnb', 'send usdt', 'send usdc', 'send sol',
  'send btc', 'send crypto', 'send coin', 'send nft', 'send funds',
  'buy', 'sell', 'purchase', 'trade',
  'mint', 'stake', 'unstake', 'claim', 'deposit', 'withdraw', 'approve',
  // Assets & Wallets
  'token', 'crypto', 'coin', 'nft', 'wallet', 'address', 'contract',
  'check balance', 'check portfolio', 'check wallet', 'check address', 'my address', 'my balance',
  'porto', 'saldo', 'cek address', 'cek porto', 'cek saldo', 'cek wallet',
  // Major Chains & L2s
  'ethereum', 'polygon', 'arbitrum', 'optimism', 'bsc', 'mainnet', 'testnet',
  'on-chain', 'blockchain', 'solana', 'avalanche', 'base', 'robinhood',
  // Top 50+ Global Assets / Tickers
  'eth', 'bnb', 'usdt', 'usdc', 'sol', 'matic', 'arb', 'op', 'btc', 'bitcoin',
  'xrp', 'doge', 'dogecoin', 'avax', 'ada', 'cardano', 'pepe', 'shib', 'shiba',
  'link', 'chainlink', 'dot', 'polkadot', 'trx', 'tron', 'ton', 'wbtc', 'dai',
  // DeFi & Market
  'defi', 'dex', 'liquidity', 'pool', 'aave', 'uniswap', 'apy', 'apr', 'yield',
  'price', 'chart', 'market', 'portfolio', 'balance', 'mc', 'marketcap',
  'gas', 'fee', 'slippage', 'transaction', 'tx', 'gwei',
  // Fiat & Currency
  'usd', 'eur', 'gbp', 'jpy', 'aud', 'idr', 'fiat', 'currency', 'convert', 'exchange', 'rate', 'value',
];

const CONFIRM_WORDS_GLOBAL: string[] = [
  'yes', 'y', 'ya', 'boleh', 'silakan', 'lanjut', 'gas', 'ok', 'oke', 'confirm', 'execute', 'do it', 'setuju', 'go ahead',
  'no', 'n', 'tidak', 'nggak', 'jangan', 'cancel', 'batal', 'stop', 'wait', 'tunggu'
];



// ── P2: Multi-Intent Decomposer ─────────────────────────────────────────────
/**
 * Detects if the user message contains BOTH web3 AND os intents.
 * Returns 'compound' when both are present so we can route to both agents.
 * 
 * IMPORTANT: This check runs BEFORE the LLM router to save tokens.
 * Keyword matching must be precise to avoid false 'compound' classifications
 * that would cause two agents to run in parallel unnecessarily.
 */
function determinePrimaryIntent(
  lowerInput: string,
  osKeywords: string[],
  web3Keywords: string[]
): 'web3' | 'os' {
  // Score-based detection to pick the single most appropriate agent.
  // Both agents share the same toolset, so picking the dominant one
  // is sufficient and prevents dangerous concurrent double-execution.

  // Helper to escape regex special characters from keywords
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  
  // Use word boundaries to prevent substring false positives (e.g. "stop" matching "op")
  const matchKeyword = (kw: string) => new RegExp(`\\\\b${escapeRegExp(kw)}\\\\b`, 'i').test(lowerInput);

  const osScore = osKeywords.filter(matchKeyword).length;
  const web3Score = web3Keywords.filter(matchKeyword).length;

  if (osScore === 0 && web3Score === 0) return 'os';
  
  // If scores are equal, prioritize web3 if it's a crypto context, otherwise OS
  if (web3Score >= osScore) return 'web3';
  return 'os';
}


// ── P7: Task Planner ─────────────────────────────────────────────────────────
// Trigger keywords for complex requests that benefit from a planning step first.
// Intentionally multilingual: includes common terms from Indonesian (id), English (en),
// and universal finance/trading vocabulary to support Nyxora's global user base.
const PLAN_TRIGGER_KEYWORDS = [
  // Indonesian
  'buatkan', 'buat rencana', 'rencanakan', 'strategi', 'gimana cara', 'bagaimana cara',
  'langkah', 'optimasi', 'apa yang harus',
  // English
  'strategy', 'plan', 'planning', 'step by step', 'breakdown', 'optimize',
  'rebalance', 'what should i do', 'help me decide', 'how do i',
  // Universal finance terms
  'roadmap', 'approach', 'framework',
];

function shouldPlan(input: string): boolean {
  const lower = input.toLowerCase();
  return PLAN_TRIGGER_KEYWORDS.some(kw => lower.includes(kw));
}

async function runTaskPlanner(input: string, context: string): Promise<string> {
  const config = loadConfig();
  try {
    const truncatedInput = input.length > 8000 ? input.substring(0, 8000) + '...[TRUNCATED]' : input;
    const planRes = await executeWithRetry(async (client) =>
      client.chat({
        model: config.llm.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are a concise task planning assistant.
The user has a complex multi-step request. Output a brief, ordered execution plan with 3-5 bullet points (max 120 words total).
Each bullet = one concrete action or tool call.
Be extremely concise. No intros, no explanations.
Context domain: ${context}`
          },
          { role: 'user', content: `Plan execution for: ${truncatedInput}` }
        ]
      })
    );
    const plan = planRes.message?.content?.trim() || '';
    if (!plan) return '';
    // Enforce max length — truncate to ~120 words to prevent context bloat
    const words = plan.split(/\s+/);
    const trimmedPlan = words.length > 120 ? words.slice(0, 120).join(' ') + '...' : plan;
    console.log(pc.blue('[TaskPlanner] Plan generated, injecting into agent context.'));
    return `--- 📋 EXECUTION PLAN ---\n${trimmedPlan}\n--- END PLAN ---`;
  } catch {
    return ''; // planning is best-effort, never block the agent
  }
}

import { processWeb3Intent } from './web3Agent';
import { processOsIntent } from './osAgent';
import { processWeb3IntentStream } from './web3Agent';
import { processOsIntentStream } from './osAgent';

async function ensureSessionProject(sessionId?: string, workDir?: string) {
  if (!sessionId || !workDir) return;
  try {
    const session = logger.getSession(sessionId);
    if (session && !session.project_id) {
      const name = workDir.split(/[/\\]/).pop() || workDir;
      const projId = logger.addProject(name, workDir, 'desktop');
      logger.updateSessionProject(sessionId, projId);
      console.log(pc.green(`[Orchestrator] Auto-linked session ${sessionId} to project ${name} (${workDir})`));
    }
  } catch (e) { /* ignore */ }
}

export async function processUserInput(input: string, role: 'user' | 'system' = 'user', onProgress?: (msg: string) => void, sessionId?: string, platform?: string, workDir?: string): Promise<string> {
  const lowerInput = input.toLowerCase();
  
  const config = loadConfig();
  const history = logger.getHistory(sessionId);
  
  // Filter history to text-only for Router & General agent to prevent Gemini 400 Invalid Argument
  const textOnlyHistory = history
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
    .map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content || "" }));
  
  // Uses module-level OS_KEYWORDS and WEB3_KEYWORDS constants defined above.
  // Routing logic: deterministic keyword check first (no LLM call needed),
  // with LLM router as fallback for ambiguous inputs.


  let context: 'web3' | 'os' = 'os';
  let preCheckMatched = false;

  const primaryIntent = determinePrimaryIntent(lowerInput, OS_KEYWORDS, WEB3_KEYWORDS);
  
  const pendingTxs = txManager.getPending();
  const isConfirmWordGlobal = lowerInput.length < 25 && CONFIRM_WORDS_GLOBAL.some(kw => lowerInput.includes(kw));

  if (pendingTxs.length > 0 && (isConfirmWordGlobal && primaryIntent !== 'os' || primaryIntent === 'web3')) {
    context = 'web3';
    preCheckMatched = true;
  } else if (primaryIntent === 'web3') {
    context = 'web3';
    preCheckMatched = true;
  } else if (primaryIntent === 'os') {
    context = 'os';
    preCheckMatched = true;
  }

  if (!preCheckMatched) {
    // Support global confirmation keywords for short fast-path routing
    const CONFIRM_WORDS = [
      // English (Global Defaults)
      'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'alright', 'confirm', 'proceed', 'continue', 'do it', 'go ahead', 'exactly', 'indeed',
      // Common Localizations (e.g., ID, ES)
      'ya', 'yakin', 'boleh', 'gas', 'lanjut', 'setuju', 'si', 'sí', 'vale', 'claro'
    ];
    const isConfirm = lowerInput.length < 25 && CONFIRM_WORDS.some(kw => lowerInput.includes(kw));
    if (isConfirm && textOnlyHistory.length > 0) {
      const lastMsg = textOnlyHistory[textOnlyHistory.length - 1];
      if (lastMsg.role === 'assistant') {
        const lastContent = typeof lastMsg.content === 'string' ? lastMsg.content.toLowerCase() : '';
        // Check if the assistant was asking for permission to run an OS command
        if (lastContent.includes('sudo ') || lastContent.includes('terminal') || lastContent.includes('apt') || lastContent.includes('perintah') || lastContent.includes('install') || lastContent.includes('command')) {
          context = 'os';
          preCheckMatched = true;
        // Check if the assistant was asking for permission to run a Web3 transaction
        } else if (lastContent.includes('swap') || lastContent.includes('transfer') || lastContent.includes('token') || lastContent.includes('wallet') || lastContent.includes('transaction') || lastContent.includes('nft')) {
          context = 'web3';
          preCheckMatched = true;
        }
      }
    }
  }

  if (preCheckMatched) {
    console.log(pc.cyan(`[Orchestrator] Intent pre-classified as: ${context.toUpperCase()}`));
  } else {
    // ── Parallel: LLM Router + OS system prompt warm-up ──────────────────────
    // The router needs to classify the intent, but we don't need to wait for it
    // before starting system-prompt work. Since 'os' is the most common fallback,
    // we pre-warm its system prompt concurrently. The result lands in the 5s build
    // cache, so processOsIntent's own getSystemPrompt() call becomes nearly instant.
    const routerPrompt = `You are Nyxora's Semantic Intent Router. Classify the user's FINAL message: 'web3' or 'os'.

CLASSIFICATION MATRIX:
- WEB3: Crypto, tokens, wallets, balances, portfolio, chains (EVM/non-EVM), smart contracts, dex, tx hashes, asset prices.
- OS: Files, local scripts, system status, web search, installations, facts, greetings, chitchat, or ambiguous requests.

CONTEXT HIERARCHY RULES:
1. ALWAYS prioritize the FINAL message.
2. If the final message is a brief confirmation/slang (e.g., "ya", "gas", "do it", "ok", "yes"), look DIRECTLY at the immediate previous turn. If the previous turn was OS-related, output 'os'. If Web3-related, output 'web3'.
3. Ignore user conversational noise. Focus strictly on execution domain.

Reply with EXACTLY ONE WORD: web3 or os. DO NOT include punctuation, spaces, or formatting.`;

    const truncatedRouterInput = input.length > 8000 ? input.substring(0, 8000) + '...[TRUNCATED]' : input;
    const routerMessages = [
        { role: 'system', content: routerPrompt },
        ...textOnlyHistory.slice(-10),
        { role: 'user', content: truncatedRouterInput }
    ];

    try {
        const provider = (config?.llm?.provider || '').toLowerCase();
        let modelFamily: 'openai' | 'google' | 'anthropic' | 'grok' | 'unknown' = 'unknown';
        if (provider.includes('openai')) modelFamily = 'openai';
        else if (provider.includes('gemini') || provider.includes('google')) modelFamily = 'google';
        else if (provider.includes('anthropic') || provider.includes('claude')) modelFamily = 'anthropic';
        else if (provider.includes('grok') || provider.includes('xai')) modelFamily = 'grok';

        // Run router + OS prompt warm-up in parallel — no sequential overhead
        const [routerResponse] = await Promise.all([
            executeWithRetry(async (client) => {
                return await client.chat({
                    model: config.llm.model,
                    messages: routerMessages as any,
                    temperature: 0.1,
                    max_tokens: 10
                });
            }, 3),
            // Pre-warm OS system prompt into the 5s build cache while router runs
            promptBuilder.buildSystemPrompt({
                agentType: 'os',
                userInput: input,
                config,
                modelFamily,
                sessionId,  // ← pass sessionId so workDir is resolved correctly
                workDir
            }).catch(() => {}) // Non-blocking: failure here is fine
        ]);
        
        let contextResponse = (routerResponse.message.content || 'os').toLowerCase().trim();
        
        if (contextResponse.includes('web3')) context = 'web3';
        else context = 'os';
    } catch (e) {
        console.warn(`[Orchestrator] Router LLM failed, falling back to os. Error:`, e);
        context = 'os';
    }

    console.log(pc.magenta(`[Orchestrator] Intent classified as: ${context.toUpperCase()}`));
  }
  
  await ensureSessionProject(sessionId, workDir);

  if (context === 'web3') {
      // P7: Inject task plan as a system note (NOT prepended to user input to avoid context bloat)
      if (shouldPlan(input)) {
        const planInjection = await runTaskPlanner(input, 'web3');
        if (planInjection) {
          // Inject plan as system message — visible to LLM but doesn't pollute user message size
          logger.addEntry({ role: 'system' as any, content: planInjection }, sessionId);
        }
      }
      return await processWeb3Intent(input, role, onProgress, sessionId);
  } else {
      if (shouldPlan(input)) {
        const planInjection = await runTaskPlanner(input, 'os');
        if (planInjection) {
          logger.addEntry({ role: 'system' as any, content: planInjection }, sessionId);
        }
      }
      return await processOsIntent(input, role, onProgress, sessionId, platform, workDir);
  }
}

/**
 * Streaming variant of processUserInput().
 * Calls onChunk() for each LLM token as it arrives.
 * Falls back to onChunk() with full response if streaming is not supported.
 */
export async function processUserInputStream(
  input: string,
  originalOnChunk: (text: string) => void,
  onProgress?: (msg: string) => void,
  sessionId?: string,
  onReasoning?: (text: string) => void,
  workDir?: string
): Promise<string> {
  const smartStream = createSmartStreamWrapper(originalOnChunk);
  const onChunk = smartStream.onChunk;

  try {
    const lowerInput = input.toLowerCase();
    const config = loadConfig();
    const history = logger.getHistory(sessionId);

    const textOnlyHistory = history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content || '' }));

    // Use module-level keyword constants for consistent routing across sync and stream paths.
    // detectCompoundIntent and shouldPlan are also shared from the module scope.

    let context: 'web3' | 'os' = 'os';
    let preCheckMatched = false;

    // P2: Determine primary intent (stream path)
    const primaryIntentStream = determinePrimaryIntent(lowerInput, OS_KEYWORDS, WEB3_KEYWORDS);

    const pendingTxs = txManager.getPending();
    const isConfirmWordGlobal = lowerInput.length < 25 && CONFIRM_WORDS_GLOBAL.some(kw => lowerInput.includes(kw));

    if (pendingTxs.length > 0 && (isConfirmWordGlobal && primaryIntentStream !== 'os' || primaryIntentStream === 'web3')) {
      context = 'web3';
      preCheckMatched = true;
    } else if (primaryIntentStream === 'web3') {
      context = 'web3';
      preCheckMatched = true;
    } else if (primaryIntentStream === 'os') {
      context = 'os';
      preCheckMatched = true;
    }
    if (!preCheckMatched) {
      // Support global confirmation keywords for short fast-path routing
      const CONFIRM_WORDS = [
        // English (Global Defaults)
        'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'alright', 'confirm', 'proceed', 'continue', 'do it', 'go ahead', 'exactly', 'indeed',
        // Common Localizations (e.g., ID, ES)
        'ya', 'yakin', 'boleh', 'gas', 'lanjut', 'setuju', 'si', 'sí', 'vale', 'claro'
      ];
      const isConfirm = lowerInput.length < 25 && CONFIRM_WORDS.some(kw => lowerInput.includes(kw));
      if (isConfirm && textOnlyHistory.length > 0) {
        const lastMsg = textOnlyHistory[textOnlyHistory.length - 1];
        if (lastMsg.role === 'assistant') {
          const lastContent = typeof lastMsg.content === 'string' ? lastMsg.content.toLowerCase() : '';
          // Check if the assistant was asking for permission to run an OS command
          if (lastContent.includes('sudo ') || lastContent.includes('terminal') || lastContent.includes('apt') || lastContent.includes('perintah') || lastContent.includes('install') || lastContent.includes('command')) {
            context = 'os';
            preCheckMatched = true;
          // Check if the assistant was asking for permission to run a Web3 transaction
          } else if (lastContent.includes('swap') || lastContent.includes('transfer') || lastContent.includes('token') || lastContent.includes('wallet') || lastContent.includes('transaction')) {
            context = 'web3';
            preCheckMatched = true;
          }
        }
      }
    }

    if (!preCheckMatched) {
      // ── Parallel: LLM Router + OS system prompt warm-up (stream path) ────────
      // Same strategy as the sync path: router + OS prompt warm-up run together.
      const routerPrompt = `You are Nyxora's Semantic Intent Router. Classify the user's FINAL message: 'web3' or 'os'.

CLASSIFICATION MATRIX:
- WEB3: Crypto, tokens, wallets, balances, portfolio, chains (EVM/non-EVM), smart contracts, dex, tx hashes, asset prices.
- OS: Files, local scripts, system status, web search, installations, facts, greetings, chitchat, or ambiguous requests.

CONTEXT HIERARCHY RULES:
1. ALWAYS prioritize the FINAL message.
2. If the final message is a brief confirmation/slang (e.g., "ya", "gas", "do it", "ok", "yes"), look DIRECTLY at the immediate previous turn. If the previous turn was OS-related, output 'os'. If Web3-related, output 'web3'.
3. Ignore user conversational noise. Focus strictly on execution domain.

Reply with EXACTLY ONE WORD: web3 or os. DO NOT include punctuation, spaces, or formatting.`;
      const truncatedRouterInput = input.length > 8000 ? input.substring(0, 8000) + '...[TRUNCATED]' : input;
      const routerMessages = [
        { role: 'system', content: routerPrompt },
        ...textOnlyHistory.slice(-10),
        { role: 'user', content: truncatedRouterInput }
      ];
      try {
        const provider = (config?.llm?.provider || '').toLowerCase();
        let modelFamily: 'openai' | 'google' | 'anthropic' | 'grok' | 'unknown' = 'unknown';
        if (provider.includes('openai')) modelFamily = 'openai';
        else if (provider.includes('gemini') || provider.includes('google')) modelFamily = 'google';
        else if (provider.includes('anthropic') || provider.includes('claude')) modelFamily = 'anthropic';
        else if (provider.includes('grok') || provider.includes('xai')) modelFamily = 'grok';

        const [routerResponse] = await Promise.all([
          executeWithRetry(async (client) =>
            client.chat({ model: config.llm.model, messages: routerMessages as any, temperature: 0.1, max_tokens: 10 })
          , 3),
          // Pre-warm OS system prompt into 5s build cache while router runs
          promptBuilder.buildSystemPrompt({
            agentType: 'os',
            userInput: input,
            config,
            modelFamily,
            sessionId,  // ← pass sessionId so workDir is resolved correctly
            workDir
          }).catch(() => {})
        ]);
        const cr = (routerResponse.message.content || 'os').toLowerCase().trim();
        if (cr.includes('web3')) context = 'web3';
        else context = 'os';
      } catch {
        context = 'os';
      }
    }

    console.log(pc.cyan(`[Stream Orchestrator] Intent classified as: ${context.toUpperCase()}`));

    await ensureSessionProject(sessionId, workDir);

    let finalResult = '';
    if (context === 'web3') {
      // P7: Inject task plan as a system note (NOT prepended to user input to avoid context bloat)
      if (shouldPlan(input)) {
        const planInjection = await runTaskPlanner(input, 'web3');
        if (planInjection) {
          logger.addEntry({ role: 'system' as any, content: planInjection }, sessionId);
        }
      }
      finalResult = await processWeb3IntentStream(input, onChunk, onProgress, sessionId);
    } else {
      if (shouldPlan(input)) {
        const planInjection = await runTaskPlanner(input, 'os');
        if (planInjection) {
          logger.addEntry({ role: 'system' as any, content: planInjection }, sessionId);
        }
      }
      finalResult = await processOsIntentStream(input, onChunk, onProgress, sessionId, onReasoning, undefined, workDir);
    }
    
    return finalResult;
  } finally {
    await smartStream.wait();
  }
}
