import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { loadConfig, loadApiKeys, loadPolicyConfig } from '../config/parser';
import { Logger } from '../memory/logger';
import { Tracker } from '../gateway/tracker';
import { episodicDB } from '../memory/episodic';
import { isSkillActive } from '../utils/skillManager';
import { cognitiveManager } from '../cognitive/cognitiveManager';
import { ReasoningScratchpad } from './reasoningScratchpad';
import { compressHistory, needsCompression } from '../utils/contextSummarizer';
import { sanitizeHistoryForLLM, pruneLoopedHistory } from '../utils/historySanitizer';
import { TrajectoryLogger } from '../memory/trajectoryLogger';
import { realignMarkdownTables } from '../utils/markdownTables';
import { stripThinkBlocks, StreamingThinkScrubber } from '../utils/thinkScrubber';
import { ML_BASE_URL } from '../config/constants';
import { recordFailedCall, checkAndCaptureCorrection, clearSessionFailures } from './autoCorrectionCapture';

import { promptBuilder } from './promptBuilder';

import { pluginManager, initializePlugins } from '../plugin/registry';

import { getPath } from '../config/paths';
import pc from 'picocolors';

// --- REGISTER LIFECYCLE HOOKS ---
pluginManager.registerHook({
  name: 'ReasoningGate',
  beforeToolCall: async (toolName, args, context) => {
    // FIX: Use actual Nyxora tool names (not legacy names). Removed run_terminal_command to prevent infinite loops.
    const toolsRequiringReasoning = ['write_local_file', 'edit_local_file', 'execute_script'];
    if (toolsRequiringReasoning.includes(toolName)) {
      const responseMessage = context.responseMessage || {};
      const hasThinkingTag = /<(think|thought|thinking|reasoning|analysis|reflection)>[\s\S]*?<\/\1>/i.test(responseMessage.content || '');
      const hasNativeReasoning = !!(responseMessage as any).reasoning_content;
      // Allow smart models (like Claude 3.5 Sonnet) to pass if they output standard chain-of-thought text before the tool call.
      // 80 chars ≈ one short sentence — enough to confirm the model provided reasoning.
      // 30 was too low: models that write "Sure, let me help!" (22 chars) got blocked.
      const hasStandardCoT = (responseMessage.content || '').trim().length > 80;
      
      if (!hasThinkingTag && !hasNativeReasoning && !hasStandardCoT) {
        const msg = `[System Error] BLOCKED BY REASONING GATE: You MUST explain your plan (or use a <think> block) BEFORE calling the '${toolName}' tool. Please rethink and try again.`;
        console.log(pc.red(`[❌ Blocked] Tool ${toolName} blocked by Reasoning Gate.`));
        return { block: true, reason: msg };
      }
    }
  }
});

pluginManager.registerHook({
  name: 'Web3FastReturn',
  afterToolCall: async (toolName, args, result, context) => {
    const fastReturnTools = ['transfer_token', 'transfer_native', 'swap_token', 'bridge_token', 'mint_nft', 'custom_tx', 'revoke_approval', 'supply_aave', 'deposit_yield_vault', 'provide_liquidity_v3'];
    if (fastReturnTools.includes(toolName)) {
      // FIX: Only trigger fast-return if the tool succeeded!
      // If the tool returns an error, we MUST let the LLM see it and reflect/retry.
      if (typeof result === 'string' && (result.includes('[System Error]') || result.startsWith('Error:') || result.includes('[Error]'))) {
        console.log(pc.yellow(`[Fast Return] Cancelled for ${toolName} due to error result.`));
        return { terminate: false };
      }
      return { terminate: true };
    }
  }
});

pluginManager.registerHook({
  name: 'SecurityGate',
  beforeToolCall: async (toolName, args, context) => {
    const policy = loadPolicyConfig();
    const isWeb3Tx = ['transfer_token', 'transfer_native', 'swap_token', 'bridge_token', 'mint_nft', 'custom_tx', 'revoke_approval', 'supply_aave', 'deposit_yield_vault', 'provide_liquidity_v3'].includes(toolName);
    
    // 1. Blacklist Check
    if (isWeb3Tx && policy.blacklisted_addresses && policy.blacklisted_addresses.length > 0) {
      const targetAddress = args.toAddress || args.recipient || args.contractAddress || args.target;
      if (targetAddress && typeof targetAddress === 'string') {
        const isBlacklisted = policy.blacklisted_addresses.some((addr: string) => addr.toLowerCase() === targetAddress.toLowerCase());
        if (isBlacklisted) {
          const msg = `[Security Blocked] The destination address ${targetAddress} is blacklisted by the user's security policy.`;
          console.log(pc.red(`[❌ Blocked] ${toolName} blocked by Blacklist.`));
          return { block: true, reason: msg };
        }
      }
    }

    // 2. Shell Command Auto-Approve Check
    if ((toolName === 'run_terminal_command' || toolName === 'run_terminal_command_pty')) {
      // If user disabled auto-approve for shell, and it's not a read-only safe command
      if (policy.auto_approve_shell === false) {
        // We need to check if user explicitly approved it in the last message
        const history = logger.getHistory(context.sessionId);
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
        const userText = String(lastUserMsg?.content || '').toLowerCase();
        
        // Very basic intent check for approval
        const hasApproved = /\b(yes|ya|y|approve|proceed|lanjut|ok|oke|sure)\b/.test(userText);
        
        // If not approved, block and ask LLM to ask user
        if (!hasApproved) {
          const msg = `[Security Blocked] Executing shell commands requires explicit user approval because auto_approve_shell is OFF. Please ask the user for permission to run: ${args.command}`;
          console.log(pc.yellow(`[⚠️ Blocked] ${toolName} blocked by auto_approve_shell=false.`));
          return { block: true, reason: msg };
        }
      }
    }
    
    // Note: max_usd_per_tx check is complex here due to async price fetching. 
    // For now, we rely on the user to approve the tx via the UI if require_approval is true.
  }
});
// --- END LIFECYCLE HOOKS ---

export const logger = new Logger();

const sessionItersSinceSkill = new Map<string, number>();

// Helper to trigger background review async
const triggerBackgroundReview = async (sessionId?: string) => {
  try {
    const history = logger.getHistory(sessionId, 100);
    const sid = sessionId || 'default';
    const res = await fetch(`${ML_BASE_URL}/cognitive/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history,
        session_id: sid,
        trigger: 'turn_end'
      })
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.success && data.actions && data.actions.length > 0) {
        const summary = data.actions.join(' · ');
        logger.addEntry({
          role: 'system' as any,
          content: `💾 Self-improvement review: ${summary}`
        }, sid);
      }
    }
  } catch (e) {
    // silently fail
  }
};


import { getOpenAI, executeWithRetry, isLocalProvider } from '../utils/llmUtils';
import { deduplicateRepetitions } from './llmProvider';

/**
 * Robust JSON repair for small/local model tool arguments.
 * Handles: missing closing brace, truncated values, trailing commas, unquoted keys.
 * Returns parsed object or empty object if all repair attempts fail.
 */
function repairJSON(raw: string): any {
  if (!raw || !raw.trim()) return {};
  let s = raw.trim();
  try { return JSON.parse(s); } catch {}

  // Fix 1: balance open/close braces
  const open = (s.match(/\{/g) || []).length;
  const close = (s.match(/\}/g) || []).length;
  if (open > close) s += '}'.repeat(open - close);
  try { return JSON.parse(s); } catch {}

  // Fix 2: trailing comma before closing brace/bracket
  s = s.replace(/,\s*([\}\]])/g, '$1');
  try { return JSON.parse(s); } catch {}

  // Fix 3: unclosed string at end of input (truncated by streaming)
  s = s.replace(/("(?:[^"\\]|\\.)*?)$/, '$1"');
  try { return JSON.parse(s); } catch {}

  // Fix 4: unquoted keys (e.g. {amount: "100"} → {"amount": "100"})
  s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  try { return JSON.parse(s); } catch {}

  // Fix 5: single quotes → double quotes
  s = s.replace(/'/g, '"');
  try { return JSON.parse(s); } catch {}

  return {};
}

// Per-session guard: prevents concurrent background-review calls from OOM-ing
// small local models (Ollama) that can't handle 2 simultaneous LLM requests.
const _activeReviews = new Set<string>();
import crypto from 'crypto';

/**
 * Tools that run silently in the background — never shown to the user in the UI.
 * Add any internal/memory/recall tools here to keep the interface clean.
 */
const SILENT_TOOLS = new Set([
  'search_memory',
  'recall_memory',
  'get_user_profile',
  'update_user_profile',
  'get_user_preferences',
  'save_memory',
  'delete_memory',
  'list_memories',
  'memory_search',
]);

/** Strip XML-like parameter tags that may appear in raw tool argument values */
function sanitizeLabel(text: string): string {
  return text
    .replace(/<parameter=[^>]*>/gi, '')  // remove <parameter=xxx>
    .replace(/<\/parameter>/gi, '')       // remove </parameter>
    .replace(/<[a-z_][a-z0-9_]*>/gi, '') // remove any other bare XML tags
    .replace(/\s+/g, ' ')               // collapse newlines/whitespace
    .trim();
}

function getToolLabel(n: string, firstArgValue: string, rawArgs?: any): string {
  const safeArg = firstArgValue ? sanitizeLabel(String(firstArgValue)) : '';
  if (n === 'run_terminal_command' || n === 'run_terminal_command_pty') {
    // Always use rawArgs?.command explicitly — firstArgValue may be 'envType' or 'dockerImage'
    // if the LLM serialises those keys first, causing the label to show 'local' instead of the command.
    const cmd = sanitizeLabel(String(rawArgs?.command || firstArgValue || ''));
    return `💻 terminal\n\`\`\`shell\n${cmd.substring(0, 100)}${cmd.length > 100 ? '...' : ''}\n\`\`\``;
  }
  const fileArg = rawArgs?.filePath || rawArgs?.path || rawArgs?.file || safeArg;
  if (n === 'write_local_file') return `✍️ Writing ${fileArg ? String(fileArg).split('/').pop() : 'file'}...`;
  if (n === 'read_local_file') return `📖 Reading ${fileArg ? String(fileArg).split('/').pop() : 'file'}...`;
  if (n === 'edit_local_file') return `✏️ Editing ${fileArg ? String(fileArg).split('/').pop() : 'file'}...`;
  if (n === 'search_web' || n === 'search_files') {
    // Explicitly read 'query' / 'q' keys — firstArgValue may be a different key (e.g. 'engine').
    const query = sanitizeLabel(String(rawArgs?.query || rawArgs?.q || firstArgValue || ''));
    return `🔍 Searching for: ${query.substring(0, 120)}${query.length > 120 ? '...' : ''}`;
  }
  if (n === 'todo_write' || n === 'todo_read') return `📋 Task tracker: ${n}`;
  if (n === 'send_telegram_file') return `📤 Sending file to Telegram...`;
  if (n.includes('git')) return `🐙 Git: ${safeArg.substring(0, 80)}${safeArg.length > 80 ? '...' : ''}`;
  if (n === 'generate_image') return `🎨 Generating image...`;
  if (n === 'analyze_local_image') return `👁️ Analyzing image...`;
  if (n === 'computer') {
    // Use the 'action' key directly — first arg value may contain raw multiline
    // parameter XML tags (e.g. <parameter=coordinate> [100, 100]) that leak into UI
    const action = rawArgs?.action || rawArgs?.type || safeArg;
    const cleanAction = sanitizeLabel(String(action)).substring(0, 40);
    return `🖥️ Computer Use: ${cleanAction}`;
  }
  if (n.includes('skill') || n.includes('playbook')) return `🧠 Updating AI Knowledge (${n})...`;
  if (n.includes('write') || n.includes('create')) {
    let name = safeArg ? safeArg.split('/').pop() || 'item' : 'item';
    if (name.length > 30) name = name.substring(0, 30) + '...';
    return `✍️ Creating ${name}...`;
  }
  if (n.includes('read')) return `📖 Reading...`;
  return `⚙️ Running: ${n}`;
}


async function getSystemPrompt(context: 'web3' | 'os' | 'general' = 'os', userInput: string = '', sessionId?: string, platform?: string, workDir?: string): Promise<string> {
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
        sessionId,
        modelFamily,
        platform: platform || (config as any)?.platform || process.env.NYXORA_PLATFORM,
        workDir
    });
}

export async function processOsIntent(input: string, role: 'user' | 'system' = 'user', onProgress?: (msg: string) => void, sessionId?: string, platform?: string, workDir?: string): Promise<string> {
  const config = loadConfig();
  const targetPlatform = platform || (config as any)?.platform || process.env.NYXORA_PLATFORM;
  // Add input to memory
  logger.addEntry({ role, content: input }, sessionId);

  // --- MULTILINGUAL USER CORRECTION DETECTION ---
  const correctionSignals = [
    // ID
    'salah', 'ngawur', 'keliru', 'bukan', 'tidak benar', 'perbaiki', 'coba lagi',
    // EN
    'wrong', 'incorrect', 'mistake', 'not right', 'false', 'bad', 'fix', 'try again',
    // ES & FR
    'incorrecto', 'mal', 'equivocado', 'error', 'falso', 'faux', 'erreur', 'mauvais',
    // DE & RU
    'falsch', 'inkorrekt', 'fehler', 'ошибка', 'неправильно', 'неверно',
    // JP & ZH
    '違う', '間違い', 'やり直して', '错误', '不对'
  ];
  if (role === 'user' && correctionSignals.some(s => input.toLowerCase().includes(s))) {
    logger.addEntry({
      role: 'system' as any,
      content: `[CRITICAL INTERCEPT: USER CORRECTION]
The user explicitly stated your previous response was WRONG, STALE, or INACCURATE.
1. DO NOT apologize or rationalize.
2. DO NOT reuse any data from your previous turn or internal memory.
3. FORCE ACTION: You MUST immediately execute a tool call (search_web, file read, or balance check) to fetch fresh, ground-truth data.
4. Synthesize the new response solely based on the fresh tool output.`
    }, sessionId);
  }

  // FIX: Lazy-init guard — ensure plugins are always initialized before use.
  // This handles cases where processOsIntent is called before startServer() completes,
  // e.g., direct Telegram messages arriving before plugin initialization.
  if (pluginManager.getPlugins().length === 0) {
    console.warn('[OsAgent] ⚠️ Plugins not initialized! Running lazy initializePlugins()...');
    await initializePlugins();
  }

  let activeTools = [...pluginManager.getAllToolDefinitions()];
  activeTools = activeTools.filter(t => isSkillActive(t.function.name));

  if (activeTools.length === 0) {
    console.error('[OsAgent] ❌ CRITICAL: No active tools found after initialization! Retrying...');
    await initializePlugins();
    activeTools = [...pluginManager.getAllToolDefinitions()].filter(t => isSkillActive(t.function.name));
  }

  // P1: Init reasoning scratchpad for this request
  const scratchpad = new ReasoningScratchpad();

  // P3: Build system prompt ONCE per request — not per turn
  const cachedSystemPrompt = await getSystemPrompt('os', input, sessionId, targetPlatform, workDir);

  try {
    let turnCount = 0;
    const MAX_TURNS = config.agent.max_turns || 50; // Dynamically configurable max iterations
    let consecutiveToolErrors = 0;
    let criticHasFired = false; // Critic Pass hanya aktif 1x per request
    // Anti-loop: track (toolName+argsHash) pairs from the PREVIOUS turn to
    // detect identical-call repetitions across turns.
    let prevTurnCallSigs = new Set<string>();

    // ── Per-tool-name call count tracker ──────────────────────────────────────────────
    // Catches loops where args differ per turn (e.g. search_web different query each time).
    const osToolCallCounts = new Map<string, number>();
    // OS_TOOL_CALL_LIMITS removed: We now use soft-warnings (self-reflection) instead of hard limits.

    // P6: Compress history ONCE before loop starts (not per iteration)
    const rawHistory = logger.getHistory(sessionId);
    const initialHistory = pruneLoopedHistory(rawHistory); // Collapse any failed loop runs
    const baseHistory = needsCompression(initialHistory)
      ? await compressHistory(initialHistory, sessionId)
      : initialHistory;
    
    let loopMessages: any[] = [];

    let accumulatedResults: string[] = [];
    let canFastReturnAll = true;

    let nudgeCount = 0;
    let thinkingPrefillRetries = 0;

    while (turnCount < MAX_TURNS) {
      turnCount++;
      // Reset per-turn accumulators
      accumulatedResults = [];
      canFastReturnAll = true;

      // Combine: compressed base + new messages from loop
      const historyToUse = loopMessages.length > 0 
        ? [...baseHistory, ...loopMessages]
        : baseHistory;

      const sanitizedHistory = sanitizeHistoryForLLM(historyToUse, activeTools, config.llm.provider);

      // P1: Inject scratchpad into system prompt for turns > 1
      const sysPrompt = turnCount === 1
        ? cachedSystemPrompt
        : cachedSystemPrompt + scratchpad.getInjection();

      const messages: any[] = [
        { role: 'system', content: sysPrompt },
        ...sanitizedHistory
      ];


      const response = await executeWithRetry(async (client) => {
        return await client.chat({
            model: config.llm.model,
            temperature: config.llm.temperature, frequency_penalty: config.llm.frequency_penalty, presence_penalty: config.llm.presence_penalty, repetition_penalty: config.llm.repetition_penalty,
            messages: messages,
            tools: activeTools,
            reasoning_effort: (!config.llm.reasoning_effort || config.llm.reasoning_effort === 'none') ? undefined : config.llm.reasoning_effort as any
        });
      });

      const responseMessage = response.message;
      
      if (turnCount === 1) {
        Tracker.addMessage();
      }
      
      if (response.usage?.total_tokens) {
        Tracker.addTokens(response.usage.total_tokens, config.llm.provider);
      }
      Tracker.addEvent('llm.response', { provider: config.llm.provider, tool_calls: responseMessage.tool_calls?.length || 0 });

      // P1: Capture <think> blocks for scratchpad, get clean content
      let cleanedContent = scratchpad.capture(responseMessage.content || '', turnCount);
      cleanedContent = realignMarkdownTables(stripThinkBlocks(cleanedContent, targetPlatform));

      // --- ANTI-LOOP MECHANISM ---
      const lastAsstMsg = sanitizedHistory.slice().reverse().find((m: any) => m.role === 'assistant');
      if (lastAsstMsg && lastAsstMsg.content === cleanedContent && cleanedContent.trim() !== '') {
         logger.addEntry({
           role: 'system' as any,
           content: '[SYSTEM WARNING] You just repeated your exact previous message. This means you ignored the latest user input or failed to recover from a tool error. READ the latest user message carefully and CHANGE your approach!'
         }, sessionId);
         console.log(pc.yellow(`[Anti-Loop] Detected identical response. Injected system warning.`));
      }

      const asstMsg = {
        role: 'assistant' as any,
        content: cleanedContent || '',
        tool_calls: responseMessage.tool_calls,
      };
      logger.addEntry(asstMsg, sessionId);
      loopMessages.push(asstMsg);

      // --- LLM FALLBACK COMMAND PARSER (local/open-weight model fix) ---
      // IMPORTANT: Only activate for local providers (Ollama, 9router) that
      // don't support native tool calls reliably.
      // Never run on cloud models (GPT-4o, Claude, Gemini) — they produce
      // proper tool_calls and their text may contain bash examples that would
      // be falsely intercepted as executable commands.
      const _isLocalFallback = isLocalProvider(config.llm.provider);
      if (_isLocalFallback && (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) && responseMessage.content) {
        const fallbacks: any[] = [];
        
        // 1. Slash commands (/swap amount="100")
        const regex = /^\/([a-zA-Z0-9_]+)\s+(.*)$/gm;
        let match;
        while ((match = regex.exec(responseMessage.content)) !== null) {
          const toolName = match[1];
          let argsStr = match[2];
          const argsObj: any = {};
          
          const kvRegex = /([a-zA-Z0-9_]+)=(".*?"|'.*?'|[^\s]+)/g;
          let kvMatch;
          while ((kvMatch = kvRegex.exec(argsStr)) !== null) {
            let key = kvMatch[1];
            let val = kvMatch[2].replace(/^["']|["']$/g, '');
            argsObj[key] = val;
          }
          
          // Map generic names if needed
          let mappedToolName = toolName;
          if (toolName === 'transfer' && argsObj.mode === 'bridge') mappedToolName = 'bridge_token';
          if (toolName === 'swap') mappedToolName = 'swap_token';
          
          fallbacks.push({
            id: 'call_fallback_' + Math.random().toString(36).substr(2, 9),
            type: 'function',
            function: {
              name: mappedToolName,
              arguments: JSON.stringify(argsObj)
            }
          });
        }
        
        // 2. Markdown bash blocks (```bash ... ```)
        const mdRegex = /```(?:bash|sh|zsh)?\n([\s\S]*?)```/g;
        let mdMatch;
        while ((mdMatch = mdRegex.exec(responseMessage.content)) !== null) {
          const bashCmd = mdMatch[1].trim();
          if (bashCmd) {
            fallbacks.push({
              id: 'call_fallback_' + Math.random().toString(36).substr(2, 9),
              type: 'function',
              function: {
                name: 'run_terminal_command',
                arguments: JSON.stringify({ command: bashCmd })
              }
            });
          }
        }

        // 3. <tool_code> JSON arrays
        const toolCodeRegex = /<tool_code>([\/\s\S]*?)<\/tool_code>/g;
        let toolCodeMatch;
        while ((toolCodeMatch = toolCodeRegex.exec(responseMessage.content)) !== null) {
          try {
            const jsonStr = toolCodeMatch[1].trim();
            const parsedArray = JSON.parse(jsonStr);
            if (Array.isArray(parsedArray)) {
              for (const item of parsedArray) {
                if (item.function_name && item.tool_args) {
                  fallbacks.push({
                    id: 'call_fallback_' + Math.random().toString(36).substr(2, 9),
                    type: 'function',
                    function: {
                      name: item.function_name,
                      arguments: typeof item.tool_args === 'string' ? item.tool_args : JSON.stringify(item.tool_args)
                    }
                  });
                }
              }
            }
          } catch (e) {
            // Ignore parse errors, maybe it's not JSON
          }
        }
        
        // 4. <execute_bash> or <execute> blocks
        const executeRegex = /<(?:execute_bash|execute)>([\/\s\S]*?)<\/(?:execute_bash|execute)>/g;
        let executeMatch;
        while ((executeMatch = executeRegex.exec(responseMessage.content)) !== null) {
          const bashCmd = executeMatch[1].trim();
          if (bashCmd) {
            fallbacks.push({
              id: 'call_fallback_' + Math.random().toString(36).substr(2, 9),
              type: 'function',
              function: {
                name: 'run_terminal_command',
                arguments: JSON.stringify({ command: bashCmd })
              }
            });
          }
        }

        // 5. <patch path="...">...diff...</patch> blocks → edit_local_file
        const patchRegex = /<patch(?:\s+path=["']([^"']+)["'])?>([\/\s\S]*?)<\/patch>/g;
        let patchMatch;
        while ((patchMatch = patchRegex.exec(responseMessage.content)) !== null) {
          const patchPath = patchMatch[1]?.trim();
          const patchContent = patchMatch[2]?.trim();
          if (patchContent) {
            fallbacks.push({
              id: 'call_fallback_' + Math.random().toString(36).substr(2, 9),
              type: 'function',
              function: {
                name: 'edit_local_file',
                arguments: JSON.stringify({
                  filePath: patchPath ?? '',
                  searchString: '',
                  replacementString: patchContent
                })
              }
            });
          }
        }

        // 6. <write_file path="...">content</write_file> blocks → write_local_file
        const writeFileTagRegex = /<write_file\s+path=["']([^"']+)["']>([\/\s\S]*?)<\/write_file>/g;
        let writeFileTagMatch;
        while ((writeFileTagMatch = writeFileTagRegex.exec(responseMessage.content)) !== null) {
          const wfPath = writeFileTagMatch[1]?.trim();
          const wfContent = writeFileTagMatch[2];
          if (wfPath) {
            fallbacks.push({
              id: 'call_fallback_' + Math.random().toString(36).substr(2, 9),
              type: 'function',
              function: {
                name: 'write_local_file',
                arguments: JSON.stringify({ filePath: wfPath, content: wfContent ?? '' })
              }
            });
          }
        }
        
        if (fallbacks.length > 0) {
          responseMessage.tool_calls = fallbacks;
          responseMessage.content = responseMessage.content.replace(/^\/[a-zA-Z0-9_]+\s+.*$/gm, '').replace(/```(?:bash|sh|zsh)?\n([\s\S]*?)```/g, '').replace(/<tool_code>([\s\S]*?)<\/tool_code>/g, '').replace(/<(?:execute_bash|execute)>([\s\S]*?)<\/(?:execute_bash|execute)>/g, '').trim();
          console.log(pc.cyan(`[Fallback Parser] Intercepted ${fallbacks.length} raw text commands and converted to tool_calls.`));
          const fbAsstMsg = {
             role: 'assistant' as any,
             content: responseMessage.content || "",
             tool_calls: responseMessage.tool_calls,
          };
          // Update logger entry with the intercepted tool calls
          logger.addEntry(fbAsstMsg, sessionId);
          loopMessages.push(fbAsstMsg);
        }
      }
      // -----------------------------------------------------

      // --- DISPLAY SANITIZATION ---
      // Remove commonly leaked XML tags (reasoning & tool calls) to prevent UI clutter
      if (responseMessage.content) {
        const tagsToRemove = ['tool_code', 'tool_call', 'tool_calls', 'function_call', 'function_calls', 'execute', 'execute_bash', 'think', 'thought', 'reasoning'];
        tagsToRemove.forEach(tag => {
            // Remove complete tags and their contents
            const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>\\s*`, 'gi');
            responseMessage.content = responseMessage.content.replace(regex, '');
            
            // Remove any orphaned closing tags
            const orphanRegex = new RegExp(`<\\/${tag}>\\s*`, 'gi');
            responseMessage.content = responseMessage.content.replace(orphanRegex, '');
        });
        responseMessage.content = responseMessage.content.trim();
        cleanedContent = responseMessage.content;
      }
      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        // Support global languages: English, Indonesian, Spanish, French, German filler words
        const isConversationalFiller = cleanedContent.length > 0 && cleanedContent.length < 250 && /(wait|checking|executing|processing|give me a moment|let me check|one moment|hold on|tunggu|sebentar|lagi proses|lanjut cek|gue cek|aku cek|un momento|attendez|bitte warten)[\s\.\!a-z]*$/i.test(cleanedContent.trim());

        if (!cleanedContent || isConversationalFiller) {
          const hasNativeReasoning = !!(responseMessage as any).reasoning_content;
          const isThinkOnlyResponse = hasNativeReasoning && !cleanedContent;

          const maxPrefillRetries = (config.llm.provider === 'gemini') ? 4 : 2;
          if (isThinkOnlyResponse && thinkingPrefillRetries < maxPrefillRetries) {
            thinkingPrefillRetries++;
            console.warn(`[OsAgent] ⚠️ Think-only silent stop — prefilling to continue (${thinkingPrefillRetries}/${maxPrefillRetries})...`);
            continue;
          }

          const maxNudges = (config.llm.provider === 'gemini') ? 5 : 3;
          if (nudgeCount < maxNudges) {
            nudgeCount++;
            const recentUserMsg = logger.getHistory(sessionId).filter((m: any) => m.role === 'user').slice(-1)[0]?.content || 'the user request';

            let nudgeContent: string;
            if (isThinkOnlyResponse) {
              console.warn(`[OsAgent] ⚠️ Think-only prefill exhausted. System nudge (${nudgeCount}/${maxNudges})...`);
              nudgeContent = `[SYSTEM NUDGE ${nudgeCount}/${maxNudges} — SILENT STOP DETECTED]\nYou completed your internal reasoning but produced NO output (no tool call, no text).\nThis is a silent stop — it is not acceptable.\nTask: "${(typeof recentUserMsg === 'string' ? recentUserMsg : JSON.stringify(recentUserMsg)).substring(0, 200)}"\nYou MUST act RIGHT NOW. Output a tool call or a final text answer. Do NOT think again.`;
            } else {
              console.warn(`[OsAgent] ⚠️ Empty or filler response. System nudge (${nudgeCount}/${maxNudges})...`);
              nudgeContent = `[SYSTEM NUDGE ${nudgeCount}/${maxNudges}] Your last response was empty or contained conversational filler without tool calls. You MUST take action now.\nTask: "${(typeof recentUserMsg === 'string' ? recentUserMsg : JSON.stringify(recentUserMsg)).substring(0, 200)}"\nYou MUST either call a tool or output a complete text answer.`;
            }

            logger.addEntry({ role: 'system' as any, content: nudgeContent }, sessionId);
            loopMessages.push({ role: 'system' as any, content: nudgeContent });
            continue;
          } else {
            console.warn(`[OsAgent] ⚠️ LLM failed to recover after nudges. Using fallback.`);
            triggerBackgroundReview(sessionId);
            clearSessionFailures(sessionId || 'default');
            return '⚠️ I encountered an issue processing your request. This can happen with very complex multi-step tasks. Please try rephrasing or breaking the request into smaller steps.';
          }
        }

        thinkingPrefillRetries = 0;
        triggerBackgroundReview(sessionId);
        clearSessionFailures(sessionId || 'default');
        return cleanedContent;
      }

      // ── TOOL EXECUTION: parallel for read-only tools, serial for write tools ──
      //
      // Read-only tools are safe to run concurrently — they have no side effects and
      // their results are order-independent. Write tools must stay serial to maintain
      // deterministic file-system state.
      const PARALLEL_SAFE_TOOLS = new Set([
        'read_local_file', 'search_files', 'search_web',
        'analyze_local_image', 'todo_read',
        'get_balance', 'get_price_and_fiat_value', 'get_my_address',
        'get_tx_history', 'resolve_ens', 'analyze_market',
      ]);
      const TOOL_EXEC_TIMEOUT_MS = 60_000;

      // Compute call-signature hash for each tool call (anti-loop guard)
      const thisCallSigs = new Set<string>();

      // Single async executor for one tool call — used by both parallel and serial paths
      const executeSingleTool = async (toolCall: any): Promise<{ toolCall: any; result: string }> => {
        const toolName: string = toolCall.function.name;
        let result = '';
        let args: any = {};

        // Compute call sig
        const sig = `${toolName}:${crypto.createHash('md5').update(toolCall.function.arguments ?? '').digest('hex')}`;
        thisCallSigs.add(sig);

        // Progress notification
        let firstArgValue = '';
        let parsedPreview: any = {};
        try {
          parsedPreview = JSON.parse(toolCall.function.arguments || '{}');
          const firstKey = Object.keys(parsedPreview)[0];
          if (firstKey) firstArgValue = String(parsedPreview[firstKey]);
        } catch { /* ignore */ }
        const previewMsg = getToolLabel(toolName, firstArgValue, parsedPreview);
        console.log(pc.yellow(`[⚡ Tool Execution] AI is calling ${toolName}...`));
        if (onProgress) onProgress(previewMsg);

        // Parse arguments
        try {
          const argStr = toolCall.function.arguments;
          args = repairJSON(argStr);
          if (Object.keys(args).length === 0 && argStr && argStr.trim().length > 2) {
            throw new SyntaxError(`Could not repair JSON: ${argStr.substring(0, 80)}`);
          }
        } catch (parseError: any) {
          result = `[System Error] Arguments for ${toolName} must be valid JSON. Error: ${parseError.message}`;
          console.error(pc.red(`[LLM Validation Error] ${toolName}: ${parseError.message}`));
          return { toolCall, result };
        }

        // Skill gate
        if (!isSkillActive(toolName)) {
          result = `[System Error] Access denied: Skill '${toolName}' is currently disabled.`;
          console.warn(pc.red(`[Security] Blocked disabled skill: ${toolName}`));
          return { toolCall, result };
        }

        // Execute
        try {
          const pluginResult = await pluginManager.executeTool(toolName, args, { sessionId });
          result = pluginResult !== null ? pluginResult : `Error: Tool ${toolName} is not implemented.`;
          const isErrResult = result.includes('[Security Blocked]') || result.startsWith('Error:') ||
            result.includes('[System Error]') || result.includes('[Error]');
          if (isErrResult) {
            console.log(pc.red(`[❌ Failed] ${toolName} error.`));
            // Record the failure for auto-correction capture
            recordFailedCall(sessionId || 'default', toolName, args, result);
          } else {
            console.log(pc.green(`[✅ Success] ${toolName} succeeded.`));
            // Check if this is a successful retry of a previously failed call — capture the correction
            await checkAndCaptureCorrection(sessionId || 'default', toolName, args);
          }
        } catch (toolError: any) {
          result = `Error executing ${toolName}: ${toolError.message}`;
          console.error(pc.red(`[❌ Error Crash] ${toolName}: ${toolError.message}`));
          recordFailedCall(sessionId || 'default', toolName, args, toolError.message);
        }
        return { toolCall, result };
      };

      // ── Enhanced Anti-Loop: any-sig repeat + per-tool-name count ──────────────
      // Fix A: ANY repeat (not ALL) — catches partial loops where LLM adds one new
      // call to evade the "all identical" check.
      const anyRepeatSig = prevTurnCallSigs.size > 0 &&
        responseMessage.tool_calls.some((tc: any) => {
          const s = `${tc.function.name}:${crypto.createHash('md5').update(tc.function.arguments ?? '').digest('hex')}`;
          return prevTurnCallSigs.has(s);
        });
      if (anyRepeatSig) {
        logger.addEntry({
          role: 'system' as any,
          content: '[SYSTEM BLOCK] One or more tool calls this turn are identical to the previous turn. ' +
            'This indicates a loop. Change your approach: use a different tool, fix parameters, or explain to the user. ' +
            'Do NOT emit the same call again.'
        }, sessionId);
        console.log(pc.red('[Anti-Loop] Repeat tool call signature detected across turns. Injecting block.'));
      }

      // Fix B: Per-tool-name count soft-warning (prevents hallucination)
      for (const tc of responseMessage.tool_calls) {
        const tn = (tc as any).function.name as string;
        const count = osToolCallCounts.get(tn) || 0;
        
        // Soft Warning every 5 times a tool is used
        if (count > 0 && count % 5 === 0) {
          const warningMsg = `[SYSTEM WARNING] You have used the tool '${tn}' ${count} times in this session. Are you making progress? If you are stuck in a loop of errors or hallucinating fixes without success, STOP using this tool and ask the user for clarification.`;
          logger.addEntry({ role: 'system' as any, content: warningMsg }, sessionId);
          console.warn(pc.yellow(`[OsAgent] ⚠️ ANTI-LOOP SOFT WARNING: '${tn}' called ${count}x. Injected self-reflection prompt.`));
        }
      }


      // ── Partition into parallel (read-only) and serial (write) batches ───
      const parallelCalls: any[] = [];
      const serialCalls: any[] = [];
      for (const tc of responseMessage.tool_calls) {
        if (PARALLEL_SAFE_TOOLS.has(tc.function.name)) parallelCalls.push(tc);
        else serialCalls.push(tc);
      }

      // Execute parallel batch
      const parallelOutputs: Array<{ toolCall: any; result: string }> = [];
      if (parallelCalls.length > 0) {
        if (parallelCalls.length === 1) {
          parallelOutputs.push(await executeSingleTool(parallelCalls[0]));
        } else {
          const settled = await Promise.allSettled(
            parallelCalls.map(tc =>
              Promise.race([
                executeSingleTool(tc),
                new Promise<{ toolCall: any; result: string }>(resolve =>
                  setTimeout(() =>
                    resolve({ toolCall: tc, result: `[System Error] Tool ${tc.function.name} timed out after ${TOOL_EXEC_TIMEOUT_MS / 1000}s.` }),
                    TOOL_EXEC_TIMEOUT_MS
                  )
                ),
              ])
            )
          );
          for (const s of settled) {
            if (s.status === 'fulfilled') parallelOutputs.push(s.value);
            else parallelOutputs.push({ toolCall: null, result: `[System Error] Parallel tool failed: ${s.reason}` });
          }
        }
      }

      // Execute serial batch
      const serialOutputs: Array<{ toolCall: any; result: string }> = [];
      for (const tc of serialCalls) {
        serialOutputs.push(await executeSingleTool(tc));
      }

      // Restore original order and log all results
      const allOutputs = [...parallelOutputs, ...serialOutputs];
      // Sort by original order
      const orderMap = new Map(responseMessage.tool_calls.map((tc: any, i: number) => [tc.id, i]));
      allOutputs.sort((a, b) => (Number(orderMap.get(a.toolCall?.id) ?? 0)) - (Number(orderMap.get(b.toolCall?.id) ?? 0)));


      for (const { toolCall: tc, result } of allOutputs) {
        if (!tc) continue;
        const toolMsg = {
          role: 'tool' as any,
          tool_call_id: tc.id,
          name: tc.function?.name,
          content: result,
        };
        logger.addEntry(toolMsg, sessionId);
        loopMessages.push(toolMsg);
        accumulatedResults.push(result);
        const isErrorResult = typeof result === 'string' &&
          (result.includes('[System Error]') || result.startsWith('Error:') ||
           result.includes('[Error]') || result.includes('[Security Blocked]'));
        if (!['transfer_token', 'transfer_native', 'swap_token', 'bridge_token', 'mint_nft',
              'custom_tx', 'revoke_approval', 'supply_aave', 'deposit_yield_vault',
              'provide_liquidity_v3'].includes(tc.function?.name ?? '') || isErrorResult) {
          canFastReturnAll = false;
        }
        // Increment per-tool-name count on success
        if (!isErrorResult && tc.function?.name) {
          const tn = tc.function.name as string;
          osToolCallCounts.set(tn, (osToolCallCounts.get(tn) || 0) + 1);
          
          const sid = sessionId || 'default';
          if (tn !== 'skill_manage') {
             sessionItersSinceSkill.set(sid, (sessionItersSinceSkill.get(sid) || 0) + 1);
          } else {
             sessionItersSinceSkill.set(sid, 0); // Reset if they used skill manage
          }
        }
      }

      // Proactive trigger for background review
      const sid = sessionId || 'default';
      if ((sessionItersSinceSkill.get(sid) || 0) >= 10) {
        triggerBackgroundReview(sessionId);
        sessionItersSinceSkill.set(sid, 0);
      }

      // Update anti-loop state
      prevTurnCallSigs = thisCallSigs;

      // P4: Self-reflection — if ALL tools failed, inject reflection before next turn
      const allFailed = accumulatedResults.length > 0 && accumulatedResults.every(
        r => r.startsWith('Error') || r.includes('[System Error]') || r.includes('[Security Blocked]')
      );
      if (allFailed) {
        consecutiveToolErrors++;
        const reflection = `[SELF-REFLECTION] All ${accumulatedResults.length} tool call(s) failed (attempt ${consecutiveToolErrors}). ` +
          `Errors: ${accumulatedResults.join(' | ')}. ` +
          `Analyze WHY each failed. Options: (1) retry with corrected params, (2) use alternative tool, (3) inform user clearly. ` +
          `Do NOT repeat the exact same failed call.`;
        logger.addEntry({ role: 'system' as any, content: reflection }, sessionId);
        console.log(pc.magenta(`[Self-Reflection] Turn ${turnCount}: all tools failed, injecting reflection.`));

        if (consecutiveToolErrors >= 2) {
          const errorSummary = `⚠️ Unable to complete this request after multiple attempts.\n${accumulatedResults.join('\n')}`;
          logger.addEntry({ role: 'assistant', content: errorSummary }, sessionId);
          triggerBackgroundReview(sessionId);
          return errorSummary;
        }
      } else {
        consecutiveToolErrors = 0;
      }

      // V2 Optimization: Zero-LLM Fast Return for transaction tools
      if (canFastReturnAll && accumulatedResults.length > 0) {
        const finalContent = accumulatedResults.join('\n\n---\n\n');
        logger.addEntry({ role: 'user', content: `[System Notification: The tool executed successfully and returned the following result directly to the user]\n${finalContent}` }, sessionId);
        triggerBackgroundReview(sessionId);
        return finalContent;
      }
      
      // Loop continues, sending tool results in the next turn
    }
    
    const maxTurnMsg = `⚠️ Reached maximum interaction limit (${MAX_TURNS} turns). Context and progress have been preserved. Please review my work so far, and type "continue" or /resume to keep debugging.`;
    logger.addEntry({ role: 'assistant', content: maxTurnMsg }, sessionId);
    triggerBackgroundReview(sessionId);
    clearSessionFailures(sessionId || 'default');
    return maxTurnMsg;
  } catch (error: any) {
    console.error("LLM Error:", error);
    const status = error?.status || error?.response?.status;
    let errorMsg = '⚠️ All models are temporarily rate-limited. Please try again in a few minutes.';
    
    if (error.message && error.message.toLowerCase().includes('invalid api key')) {
      errorMsg = '⚠️ Invalid API Key. Please check your LLM provider credentials in Settings.';
    } else if (status === 400 || (error.message && error.message.toLowerCase().includes('invalid'))) {
      errorMsg = '⚠️ Failed to parse instruction. The LLM had trouble determining the appropriate tool format. Please describe your command more specifically.';
    }
    
    logger.addEntry({ role: 'assistant', content: errorMsg }, sessionId);
    return errorMsg;
  }
}

export async function processOsIntentStream(
  input: string,
  onChunk: (text: string) => void,
  onProgress?: (msg: string) => void,
  sessionId?: string,
  onReasoning?: (text: string) => void,
  platform?: string,
  workDir?: string
): Promise<string> {
  const config = loadConfig();
  const targetPlatform = platform || (config as any)?.platform || process.env.NYXORA_PLATFORM;
  logger.addEntry({ role: 'user', content: input }, sessionId);

  // --- MULTILINGUAL USER CORRECTION DETECTION ---
  const correctionSignals = [
    // ID
    'salah', 'ngawur', 'keliru', 'bukan', 'tidak benar', 'perbaiki', 'coba lagi',
    // EN
    'wrong', 'incorrect', 'mistake', 'not right', 'false', 'bad', 'fix', 'try again',
    // ES & FR
    'incorrecto', 'mal', 'equivocado', 'error', 'falso', 'faux', 'erreur', 'mauvais',
    // DE & RU
    'falsch', 'inkorrekt', 'fehler', 'ошибка', 'неправильно', 'неверно',
    // JP & ZH
    '違う', '間違い', 'やり直して', '错误', '不对'
  ];
  if (correctionSignals.some(s => input.toLowerCase().includes(s))) {
    logger.addEntry({
      role: 'system' as any,
      content: `[CRITICAL INTERCEPT: USER CORRECTION]
The user explicitly stated your previous response was WRONG, STALE, or INACCURATE.
1. DO NOT apologize or rationalize.
2. DO NOT reuse any data from your previous turn or internal memory.
3. FORCE ACTION: You MUST immediately execute a tool call (search_web, file read, or balance check) to fetch fresh, ground-truth data.
4. Synthesize the new response solely based on the fresh tool output.`
    }, sessionId);
  }

  // FIX: Lazy-init guard — same as processOsIntent
  if (pluginManager.getPlugins().length === 0) {
    console.warn('[OsAgentStream] ⚠️ Plugins not initialized! Running lazy initializePlugins()...');
    await initializePlugins();
  }

  const pluginTools = pluginManager.getAllToolDefinitions();
  let activeTools = [...pluginTools].filter(t => isSkillActive(t.function.name));

  if (activeTools.length === 0) {
    console.error('[OsAgentStream] ❌ CRITICAL: No active tools found after initialization! Retrying...');
    await initializePlugins();
    activeTools = [...pluginManager.getAllToolDefinitions()].filter(t => isSkillActive(t.function.name));
  }
// FIX: Cache system prompt ONCE before loop (was being rebuilt every turn — wasteful)
  const cachedSystemPromptStream = await getSystemPrompt('os', input, sessionId, targetPlatform, workDir);

  try {
    // Global loop state
    let turnCount = 0;
    let nudgeCount = 0;
    const MAX_TURNS = config.agent.max_turns || 50; // Configurable auto-pause limit
    let thinkingPrefillRetries = 0; // Prefill-continuation retries for think-only silent stops
    let antiLoopStrikes = 0;

    let fullResponse = '';
    let criticHasFiredStream = false; // Critic Pass hanya aktif 1x per request
    let prevCallSigs = new Set<string>(); // Tracks tool calls from the immediately preceding turn

    // ── Per-tool-name call count tracker (stream) ─────────────────────────────────────
    // Catches loops where args differ per turn (e.g. search_web with different queries).
    const osToolCallCountsStream = new Map<string, number>();
    // OS_TOOL_CALL_LIMITS_STREAM removed: We now use soft-warnings (self-reflection) instead of hard limits.

    // P6: Compress history ONCE before loop starts (not per iteration)
    const rawHistoryStream = logger.getHistory(sessionId);
    const initialHistoryStream = pruneLoopedHistory(rawHistoryStream); // Collapse any failed loop runs
    const baseHistoryStream = needsCompression(initialHistoryStream)
      ? await compressHistory(initialHistoryStream, sessionId)
      : initialHistoryStream;
    
    let loopMessagesStream: any[] = [];

    while (turnCount < MAX_TURNS) {
      turnCount++;
      
      // Combine: compressed base + new messages from loop
      const historyToUse = loopMessagesStream.length > 0
        ? [...baseHistoryStream, ...loopMessagesStream]
        : baseHistoryStream;
        
      const sanitizedHistory = sanitizeHistoryForLLM(historyToUse, activeTools, config.llm.provider);
      // FIX: Use cached system prompt — no longer rebuilt every turn
      let messages: any[] = [
        { role: 'system', content: cachedSystemPromptStream },
        ...sanitizedHistory
      ];

      // --- TOTAL PAYLOAD SAFETY CHECK ---
      const { getEstimatedMaxContext } = require('../utils/llmUtils');
      const finalMaxContext = config.llm.max_context || getEstimatedMaxContext(config.llm.model);
      const absTotalChars = Math.floor(finalMaxContext * 4 * 0.90);
      
      let payloadTotalChars = 0;
      for (const m of messages) {
         payloadTotalChars += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
      }

      if (payloadTotalChars > absTotalChars) {
         console.warn(`[osAgent] ⚠️ Final payload (${payloadTotalChars} chars) exceeds safe limit (${absTotalChars} chars). Priority-based truncation...`);
         // Priority-based truncation:
         //   1. System prompt (messages[0]) — NEVER truncate (contains tool schemas + identity)
         //   2. Last 3 messages — NEVER truncate (LLM needs recent context to continue)
         //   3. Middle messages — truncate proportionally to reclaim budget
         const KEEP_TAIL = 3;
         const middleStart = 1; // skip system prompt
         const middleEnd = Math.max(1, messages.length - KEEP_TAIL);
         const middleMessages = messages.slice(middleStart, middleEnd);

         if (middleMessages.length > 0) {
           // Calculate how many chars the protected messages (system + tail) consume
           const systemChars = typeof messages[0].content === 'string' ? messages[0].content.length : JSON.stringify(messages[0].content).length;
           const tailChars = messages.slice(middleEnd).reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
           const budgetForMiddle = Math.max(0, absTotalChars - systemChars - tailChars - 500);
           const maxPerMiddle = middleMessages.length > 0 ? Math.floor(budgetForMiddle / middleMessages.length) : 0;

           for (let i = middleStart; i < middleEnd; i++) {
             const m = messages[i];
             if (maxPerMiddle < 200) {
               // No budget left — drop middle message content entirely, leave role intact
               m.content = '[context omitted — exceeded context window]';
             } else if (typeof m.content === 'string' && m.content.length > maxPerMiddle) {
               m.content = m.content.substring(0, maxPerMiddle - 80) + '\n...[TRUNCATED]';
             } else if (Array.isArray(m.content)) {
               for (const b of m.content) {
                 if (b.type === 'text' && typeof b.text === 'string' && b.text.length > maxPerMiddle) {
                   b.text = b.text.substring(0, maxPerMiddle - 80) + '\n...[TRUNCATED]';
                 }
               }
             }
           }
         }
      }

      let streamedContent = '';
      const turnStartTime = Date.now();
      let lastEmittedChunkLength = 0; // Track how much was actually pushed to UI this turn
      const response = await executeWithRetry(async (client) => {
        streamedContent = '';
        lastEmittedChunkLength = 0;
        // RC#1 FIX: Always clear the buffer at the start of the stream turn.
        // This ensures the client UI doesn't append duplicate preambles across multi-turn executions.
        onChunk('[CLEAR_STREAM]');
        const scrubber = new StreamingThinkScrubber(targetPlatform);
        const res = await client.stream(
          { model: config.llm.model, temperature: config.llm.temperature, frequency_penalty: config.llm.frequency_penalty, presence_penalty: config.llm.presence_penalty, repetition_penalty: config.llm.repetition_penalty, max_tokens: (config.llm as any).max_tokens || 4096, messages, tools: activeTools, reasoning_effort: (!config.llm.reasoning_effort || config.llm.reasoning_effort === 'none') ? undefined : config.llm.reasoning_effort as any },
          (chunk: string) => {
            streamedContent += chunk;
            const scrubbedChunk = scrubber.feed(chunk);
            if (scrubbedChunk) {
              lastEmittedChunkLength += scrubbedChunk.length;
              onChunk(scrubbedChunk);
            }
          },
          onReasoning ? (reasoning: string) => {
            onReasoning(reasoning);
          } : undefined
        );
        const tail = scrubber.flush();
        if (tail) {
          onChunk(tail);
        }
        return res;
      });
      const duration_ms = Date.now() - turnStartTime;

      const responseMessage = response.message;

      if (turnCount === 1) Tracker.addMessage();
      if (response.usage?.total_tokens) Tracker.addTokens(response.usage.total_tokens, config.llm.provider);
      Tracker.addEvent('llm.response', { provider: config.llm.provider, tool_calls: responseMessage.tool_calls?.length || 0 });

      const asstMsgStream = {
        role: 'assistant' as any,
        content: realignMarkdownTables(stripThinkBlocks(responseMessage.content || '', targetPlatform)),
        reasoning_content: (responseMessage as any).reasoning_content,
        tool_calls: responseMessage.tool_calls,
        duration_ms,
      };
      logger.addEntry(asstMsgStream, sessionId);
      loopMessagesStream.push(asstMsgStream);

      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        let finalContent = realignMarkdownTables(stripThinkBlocks(responseMessage.content || '', targetPlatform));

        // Support global languages: English, Indonesian, Spanish, French, German filler words
        const isConversationalFiller = finalContent.length > 0 && finalContent.length < 250 && /(wait|checking|executing|processing|give me a moment|let me check|one moment|hold on|tunggu|sebentar|lagi proses|lanjut cek|gue cek|aku cek|un momento|attendez|bitte warten)[\s\.\!a-z]*$/i.test(finalContent.trim());

        if (finalContent === '' || isConversationalFiller) {
          // Detect think-only response: model reasoned but produced no tool calls or visible text.
          const hasNativeReasoning = !!(responseMessage as any).reasoning_content;
          const hasThinkTagInStream = /<(think|thought|thinking|reasoning)[\s\S]*?<\//i.test(streamedContent);
          const isThinkOnlyResponse = hasNativeReasoning || hasThinkTagInStream;

          // ── THINKING-PREFILL CONTINUATION ──
          // If model produced reasoning but no visible output, append the assistant message as-is
          // so the model sees its own reasoning on the next turn and continues naturally.
          // This avoids restarting the reasoning chain from scratch (which is what nudges do).
          // Gemini tends to need more prefill attempts — allow up to 4.
          const maxPrefillRetries = (config.llm.provider === 'gemini') ? 4 : 2;
          if (isThinkOnlyResponse && thinkingPrefillRetries < maxPrefillRetries) {
            thinkingPrefillRetries++;
            console.warn(`[OsAgentStream] ⚠️ Think-only silent stop — prefilling to continue (${thinkingPrefillRetries}/${maxPrefillRetries})...`);
            // The assistant message is already in logger from the addEntry above.
            // The model will see its own reasoning and produce a tool call or text next turn.
            continue;
          }

          // ── NUDGE FALLBACK (after prefill exhaustion or truly empty) ──
          // Gemini needs more nudges — allow up to 5 for Gemini, 3 for others
          const maxNudges = (config.llm.provider === 'gemini') ? 5 : 3;
          if (nudgeCount < maxNudges) {
            nudgeCount++;
            const recentUserMsg = logger.getHistory(sessionId)
              .filter((m: any) => m.role === 'user').slice(-1)[0]?.content || 'the user request';

            let nudgeContent: string;
            if (isThinkOnlyResponse) {
            console.warn(`[OsAgentStream] ⚠️ Think-only prefill exhausted. System nudge (${nudgeCount}/${maxNudges}) for ${config.llm.provider}...`);
              nudgeContent = `[SYSTEM NUDGE ${nudgeCount}/${maxNudges} — SILENT STOP DETECTED]
You completed your internal reasoning but produced NO output (no tool call, no text).
This is a silent stop — it is not acceptable.

Task: "${(typeof recentUserMsg === 'string' ? recentUserMsg : JSON.stringify(recentUserMsg)).substring(0, 200)}"

You MUST act RIGHT NOW. Do one of these:
  A) Call the first required tool immediately (e.g., write_local_file, run_terminal_command, send_telegram_file)
  B) Output a final text answer

Do NOT think again. Execute step 1 of the task NOW.`;
            } else {
              console.warn(`[OsAgentStream] ⚠️ Empty or filler response. System nudge (${nudgeCount}/${maxNudges}) for ${config.llm.provider}...`);
              nudgeContent = `[SYSTEM NUDGE ${nudgeCount}/${maxNudges}] Your last response was empty or contained conversational filler without tool calls. You MUST take action now.

Task: "${(typeof recentUserMsg === 'string' ? recentUserMsg : JSON.stringify(recentUserMsg)).substring(0, 200)}"

Available tools: write_local_file, run_terminal_command, send_telegram_file, search_web and others.
You MUST either:
  A) Call one or more tools, OR
  B) Output a complete final text answer

Do NOT output filler text like "Wait, I will check". Act now.`;
            }

            logger.addEntry({
              role: 'system' as any,
              content: nudgeContent
            }, sessionId);
            continue;

          } else {
            console.warn(`[OsAgentStream] ⚠️ LLM (${config.llm.provider}) failed to recover after prefill + ${maxNudges} nudges. Using fallback.`);
            finalContent = '⚠️ I encountered an issue processing your request. This can happen with very complex multi-step tasks. Please try rephrasing or breaking the request into smaller steps.';
          }
        }
        // Reset prefill counter on successful response
        thinkingPrefillRetries = 0;

        // ── REPETITION SCRUB (Gemini end-of-stream loop fix) ──────────────
        // Gemini sometimes emits repeated suffix phrases at end of stream
        // (e.g. "fair. fair. fair.") that pass through chunk-level scrubbers.
        // Deduplicate on the complete finalContent and re-emit if changed.
        const dedupedContent = deduplicateRepetitions(finalContent);
        if (dedupedContent !== finalContent) {
          console.warn(`[OsAgentStream] ⚠️ Gemini repetition detected & truncated.`);
          finalContent = dedupedContent;
          // Re-emit the corrected version — REPLACE_STREAM clears the buffer but 
          // keeps the message ID so it edits the same bubble instead of duplicating.
          await onChunk('[REPLACE_STREAM]');
          await onChunk(finalContent);
        }

        fullResponse = finalContent;
        triggerBackgroundReview(sessionId);

        // ── COMPLETION GUARANTEE ──────────────────────────────────────────
        // The final text was streamed real-time via onChunk above, but if the
        // stream was interrupted (e.g. rate-limit, Nemotron silent stop) the
        // UI may have received a [CLEAR_STREAM] without the follow-up text.
        // Re-emit the final content if nothing was actually pushed to the UI
        // this turn, so the user ALWAYS gets a completion message.
        if (finalContent && lastEmittedChunkLength === 0) {
          await onChunk(finalContent);
        }
        break;
      }

      // Tool calls detected — pause stream visually and execute tools concurrently
      // Only emit [TOOL_CALL_DETECTED] if at least one tool is NOT a silent background tool.
      // Silent tools (search_memory, recall_memory, etc.) run invisibly without UI feedback.
      const hasVisibleToolsStream = responseMessage.tool_calls?.some((tc: any) => !SILENT_TOOLS.has(tc.function.name));
      if (hasVisibleToolsStream) {
        await onChunk('[TOOL_CALL_DETECTED]');
      }
      let shouldFastReturn = false;
      const accumulatedResults: string[] = [];

      // Deduplicate identical tool calls to prevent double execution bugs in the same turn
      const uniqueToolCalls = [];
      const seenToolCalls = new Set<string>();
      const thisCallSigs = new Set<string>();

      // Helper to normalize JSON arguments for smarter duplicate detection
      const normalizeArgs = (argsStr: string): string => {
        try {
          const parsed = JSON.parse(argsStr);
          return JSON.stringify(parsed); // Re-stringify in canonical form
        } catch {
          return argsStr.trim(); // Fallback: just trim whitespace
        }
      };

      for (const tc of responseMessage.tool_calls) {
        const normalizedArgs = normalizeArgs(tc.function.arguments);
        const sig = `${tc.function.name}:${normalizedArgs}`;

        // Per-tool-name count soft warning (prevents hallucination)
        const tnS = (tc as any).function.name as string;
        const countS = osToolCallCountsStream.get(tnS) || 0;
        
        // Soft Warning every 5 times a tool is used
        if (countS > 0 && countS % 5 === 0) {
          console.warn(`[OsAgentStream] ⚠️ ANTI-LOOP SOFT WARNING: '${tnS}' called ${countS}x. Injected self-reflection prompt.`);
          const warningMsg = `[SYSTEM WARNING] You have used the tool '${tnS}' ${countS} times in this session. Are you making progress? If you are stuck in a loop of errors or hallucinating fixes without success, STOP using this tool and ask the user for clarification.`;
          logger.addEntry({ role: 'system' as any, content: warningMsg }, sessionId);
        }

        if (!seenToolCalls.has(sig)) {
          seenToolCalls.add(sig);
          thisCallSigs.add(sig);
          uniqueToolCalls.push(tc);
        }
      }

      // --- CONSECUTIVE CYCLE DETECTION ---
      const intersection = new Set([...thisCallSigs].filter(x => prevCallSigs.has(x)));
      if (intersection.size === thisCallSigs.size && thisCallSigs.size > 0) {
        antiLoopStrikes++;
        console.warn(`[OsAgentStream] Anti-loop strike ${antiLoopStrikes}/3`);
        if (antiLoopStrikes >= 3) {
          const forceMsg = `⚠️ I stopped myself from repeating the exact same action. Let me know if you want me to try a different approach.`;
          logger.addEntry({ role: 'assistant', content: forceMsg }, sessionId);
          await onChunk('\\n\\n' + forceMsg);
          fullResponse = forceMsg;
          triggerBackgroundReview(sessionId);
          break;
        }
      } else {
        antiLoopStrikes = 0;
      }
      prevCallSigs = thisCallSigs;
      // ------------------------------------

      if (uniqueToolCalls.length > 0 && onProgress) {
        uniqueToolCalls.forEach((tc: any) => {
          // Skip progress notification for silent background tools
          if (SILENT_TOOLS.has(tc.function.name)) return;
          let firstArgValue = '';
          let parsedPreview: any = {};
          try {
            parsedPreview = JSON.parse(tc.function.arguments || '{}');
            const firstKey = Object.keys(parsedPreview)[0];
            if (firstKey) firstArgValue = String(parsedPreview[firstKey]);
          } catch { /* ignore */ }
          // FIX: pass parsedPreview as rawArgs so getToolLabel can look up
          // rawArgs?.command / rawArgs?.query explicitly (prevents 'local' / wrong-key bugs).
          onProgress(getToolLabel(tc.function.name, firstArgValue, parsedPreview));
        });
      }

      const promises = uniqueToolCalls.map(async (_toolCall: any) => {
        const toolCall = _toolCall;
        const toolName = toolCall.function.name;
        let result = '';
        let args: any = {};
        
        let cwd: string | undefined = workDir;
        if (!cwd && sessionId) {
          const session = logger.getSession(sessionId);
          if (session && session.project_id) {
            const project = logger.getProject(session.project_id);
            if (project) {
              cwd = project.path;
            }
          }
        }
        
        const context = { sessionId, toolCallId: toolCall.id, responseMessage, cwd };

        console.log(pc.yellow(`[⚡ Tool Execution] AI is calling ${toolName}...`));

        try {
          const argStr = toolCall.function.arguments;
          args = repairJSON(argStr);
          if (Object.keys(args).length === 0 && argStr && argStr.trim().length > 2) {
            throw new SyntaxError(`Could not repair JSON: ${argStr.substring(0, 80)}`);
          }
        } catch (parseError: any) {
          result = `[System Error] Arguments for ${toolName} must be valid JSON. Error: ${parseError.message}`;
          const errToolMsg = { role: 'tool' as any, tool_call_id: toolCall.id, name: toolName, content: result };
          logger.addEntry(errToolMsg, sessionId);
          loopMessagesStream.push(errToolMsg);
          return { toolName, result };
        }

        if (!isSkillActive(toolName)) {
          result = `[System Error] Access denied: Skill '${toolName}' is currently disabled.`;
          const skillErrToolMsg = { role: 'tool' as any, tool_call_id: toolCall.id, name: toolName, content: result };
          logger.addEntry(skillErrToolMsg, sessionId);
          loopMessagesStream.push(skillErrToolMsg);
          return { toolName, result };
        }

        // --- LIFECYCLE: BEFORE TOOL CALL ---
        const beforeRes = await pluginManager.triggerBeforeHooks(toolName, args, context);
        if (beforeRes && beforeRes.block) {
          result = beforeRes.reason || `[System Error] Blocked by hook for ${toolName}`;
          const hookErrToolMsg = { role: 'tool' as any, tool_call_id: toolCall.id, name: toolName, content: result };
          logger.addEntry(hookErrToolMsg, sessionId);
          loopMessagesStream.push(hookErrToolMsg);
          return { toolName, result };
        }

        try {
          const pluginResult = await pluginManager.executeTool(toolName, args, context, (partialResult: string) => {
            // Partial Streaming callback
            if (onProgress) onProgress(`⏳ [${toolName}] ${partialResult}...`);
          });
          
          result = pluginResult !== null ? pluginResult : `Error: Tool ${toolName} is not implemented.`;
          
          if (typeof result === 'string' && (result.includes('[Security Blocked]') || result.startsWith('Error:'))) {
            console.log(pc.red(`[❌ Failed] Tool ${toolName} returned an error or was blocked.`));
          } else {
            console.log(pc.green(`[✅ Success] Tool ${toolName} executed successfully.`));
          }
        } catch (toolError: any) {
          result = `Error executing ${toolName}: ${toolError.message}`;
          console.error(pc.red(`[❌ Error Crash] Execution of ${toolName} failed: ${toolError.message}`));
        }

        // --- LIFECYCLE: AFTER TOOL CALL ---
        const afterRes = await pluginManager.triggerAfterHooks(toolName, args, result, context);
        result = afterRes.content || result;
        if (afterRes.terminate) {
          shouldFastReturn = true;
        }

        const okToolMsg = { role: 'tool' as any, tool_call_id: toolCall.id, name: toolName, content: result };
        logger.addEntry(okToolMsg, sessionId);
        loopMessagesStream.push(okToolMsg);

        // Increment per-tool-name count on success
        if (typeof result === 'string' && !result.includes('[System Error]') &&
            !result.startsWith('Error:') && !result.includes('[Security Blocked]')) {
          osToolCallCountsStream.set(toolName, (osToolCallCountsStream.get(toolName) || 0) + 1);
        }

        return { toolName, result };
      });

      const results = await Promise.all(promises);
      results.forEach(r => accumulatedResults.push(r.result));

      if (hasVisibleToolsStream) {
        await onChunk('[TOOL_CALL_FINISHED]');
      }

      if (shouldFastReturn && accumulatedResults.length > 0) {
        const finalContent = accumulatedResults.join('\n\n---\n\n');
        const cleanContent = finalContent.replace(/\[SILENT_FAST_RETURN\] /g, '');
        const fastReturnMsg = { role: 'assistant' as any, content: cleanContent };
        logger.addEntry(fastReturnMsg, sessionId);
        loopMessagesStream.push(fastReturnMsg);
        
        if (!finalContent.includes('[SILENT_FAST_RETURN]')) {
          await onChunk(finalContent);
        }
        fullResponse = finalContent; // Return the unstripped content so caller knows it's silent
        triggerBackgroundReview(sessionId);
        break;
      }
    }

    if (!fullResponse) {
      const maxTurnMsg = `⚠️ Reached maximum interaction limit (${MAX_TURNS} turns). Context and progress have been preserved. Please review my work so far, and type "continue" or /resume to keep debugging.`;
      logger.addEntry({ role: 'assistant', content: maxTurnMsg }, sessionId);
      fullResponse = maxTurnMsg;
      triggerBackgroundReview(sessionId);
    }

    // --- Trajectory Logging ---
    const finalHistory = logger.getHistory(sessionId);
    // Find the current interaction span (from the user input forward)
    const turnMessages = [
      { role: 'user', content: input },
      ...finalHistory.slice(initialHistoryStream.length)
    ];
    TrajectoryLogger.logTurn(
      input, 
      turnMessages, 
      turnCount < 10, 
      turnCount, 
      { model: config.llm.model }
    );

    return fullResponse;
  } catch (error: any) {
    console.error('LLM Stream Error:', error);
    const status = error?.status || error?.response?.status;
    let errorMsg = '⚠️ All models are temporarily rate-limited. Please try again in a few minutes.';
    if (error.message && error.message.toLowerCase().includes('invalid api key')) {
      errorMsg = '⚠️ Invalid API Key. Please check your LLM provider credentials in Settings.';
    } else if (status === 400 || (error.message && error.message.toLowerCase().includes('invalid'))) {
      errorMsg = '⚠️ Failed to parse instruction. Please describe your command more specifically.';
    }
    logger.addEntry({ role: 'assistant', content: errorMsg }, sessionId);
    try {
      onChunk(errorMsg);
    } catch {}
    return errorMsg;
  }
}
