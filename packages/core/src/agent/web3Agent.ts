import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { loadConfig, loadApiKeys } from '../config/parser';
import { Logger } from '../memory/logger';
import { Tracker } from '../gateway/tracker';
import { episodicDB } from '../memory/episodic';
import { isSkillActive } from '../utils/skillManager';
import { pluginManager, initializePlugins } from '../plugin/registry';
import { cognitiveManager } from '../cognitive/cognitiveManager';
import { ReasoningScratchpad } from './reasoningScratchpad';
import { compressHistory, needsCompression } from '../utils/contextSummarizer';
import { sanitizeHistoryForLLM, pruneLoopedHistory } from '../utils/historySanitizer';

import { promptBuilder } from './promptBuilder';

export const logger = new Logger();

import { getOpenAI, executeWithRetry, isLocalProvider } from '../utils/llmUtils';
import { getPath } from '../config/paths';
import pc from 'picocolors';

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

async function getSystemPrompt(context: 'web3' | 'os' | 'general' = 'web3', userInput: string = '', sessionId?: string): Promise<string> {
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
        modelFamily
    });
}

export async function processWeb3Intent(input: string, role: 'user' | 'system' = 'user', onProgress?: (msg: string) => void, sessionId?: string): Promise<string> {
  const config = loadConfig();
  // Add input to memory
  logger.addEntry({ role, content: input }, sessionId);

  // FIX: Lazy-init guard — ensure plugins are always loaded before tool execution.
  // Handles race conditions where Web3Agent is called before startServer() fully completes.
  if (pluginManager.getPlugins().length === 0) {
    console.warn('[Web3Agent] ⚠️ Plugins not initialized! Running lazy initializePlugins()...');
    await initializePlugins();
  }

  const pluginTools = pluginManager.getAllToolDefinitions();
  let activeTools = [...pluginTools];
  activeTools = activeTools.filter(t => isSkillActive(t.function.name));

  if (activeTools.length === 0) {
    console.error('[Web3Agent] ❌ CRITICAL: No active tools found after initialization! Retrying...');
    await initializePlugins();
    activeTools = [...pluginManager.getAllToolDefinitions()].filter(t => isSkillActive(t.function.name));
  }

  // P1: Init reasoning scratchpad for this request
  const scratchpad = new ReasoningScratchpad();

  // P3: Build system prompt ONCE per request — not per turn
  const cachedSystemPrompt = await getSystemPrompt('web3', input, sessionId);

  try {
    let turnCount = 0;
    const MAX_TURNS = 10;
    let consecutiveToolErrors = 0;

    // ── Per-tool-name call count tracker ─────────────────────────────────────────────
    // Counts how many times each tool has been called SUCCESSFULLY this session.
    // If a single tool exceeds its limit, we inject a hard-stop and force final answer.
    // This catches loops even when tool args differ per call (e.g. different chainName).
    const toolCallCounts = new Map<string, number>();
    const TOOL_CALL_LIMITS: Record<string, number> = {
      'check_portfolio': 15,     // 12 networks + 3 retry buffer
      'get_balance': 8,
      'get_token_balance': 10,
      'get_token_price': 12,
      'get_gas_price': 8,
      'get_nft_holdings': 8,
      '__default__': 15,         // fallback for any other tool
    };

    // P6: Compress history ONCE before loop starts (not per iteration)
    const rawHistory = logger.getHistory(sessionId);
    const initialHistory = pruneLoopedHistory(rawHistory); // Collapse any failed loop runs
    const baseHistory = needsCompression(initialHistory)
      ? await compressHistory(initialHistory, sessionId)
      : initialHistory;
    
    let loopMessages: any[] = [];

    while (turnCount < MAX_TURNS) {
      turnCount++;
      
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
            tools: activeTools
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
      const isLocal = isLocalProvider(config.llm.provider);
      if (isLocal && (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) && responseMessage.content) {
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
        const toolCodeRegex = /<tool_code>([\s\S]*?)<\/tool_code>/g;
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
        const executeRegex = /<(?:execute_bash|execute)>([\s\S]*?)<\/(?:execute_bash|execute)>/g;
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
      // ---------------------------------------------------------------

      // --- DISPLAY SANITIZATION ---
      // Remove commonly leaked XML tags (reasoning & tool calls) to prevent UI clutter
      if (responseMessage.content) {
        const tagsToRemove = ['tool_code', 'tool_call', 'tool_calls', 'function_call', 'function_calls', 'execute', 'think', 'thought', 'reasoning'];
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
      // ---------------------------------------------------------------

      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        return cleanedContent || '⚠️ I encountered an issue processing your request. This can happen with very complex multi-step tasks. Please try rephrasing or breaking the request into smaller steps.';
      }

      let canFastReturnAll = true;
      let accumulatedResults: string[] = [];
      // Read-only / informational tools: fast-return after success so LLM doesn't
      // loop back and call them again unnecessarily.
      const fastReturnTools: string[] = [
        // Transactions (existing & NFT)
        'transfer_token', 'transfer_native', 'swap_token', 'bridge_token',
        'mint_nft', 'custom_tx', 'revoke_approval', 'supply_aave',
        'deposit_yield_vault', 'provide_liquidity_v3', 'confirm_pending_tx',
        // Read-only info fetches (new) — these NEVER need a follow-up LLM turn
        'check_portfolio', 'get_balance', 'get_token_balance', 'get_wallet_balance',
        'get_token_price', 'get_gas_price', 'get_network_stats',
        'check_allowance', 'get_transaction_status', 'get_nft_holdings',
      ];

      for (const _toolCall of responseMessage.tool_calls) {
        const toolCall = _toolCall as any;
        let result = "";
        let args: any = {};
        const toolName = toolCall.function.name;

        const getToolEmoji = (n: string) => {
          if (n.includes('swap')) return '🔄';
          if (n.includes('bridge')) return '🌉';
          if (n.includes('transfer') || n.includes('send')) return '💸';
          if (n.includes('mint') || n.includes('nft')) return '🎨';
          if (n.includes('price') || n.includes('chart')) return '📈';
          if (n.includes('wallet') || n.includes('balance')) return '👛';
          return '⚙️';
        };
        const emoji = getToolEmoji(toolName);
        let argsPreview = "";
        try {
            const parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
            const firstKey = Object.keys(parsedArgs)[0];
            if (firstKey) argsPreview = `"${parsedArgs[firstKey]}"`;
        } catch(e) {}
        const previewMsg = argsPreview ? `${toolName}: ${argsPreview}` : toolName;

        console.log(pc.yellow(`[⚡ Tool Execution] AI is calling ${toolName}...`));
        if (onProgress) onProgress(`*${emoji} ${previewMsg}*`);

        try {
          const argStr = toolCall.function.arguments;
          args = repairJSON(argStr);
          if (Object.keys(args).length === 0 && argStr && argStr.trim().length > 2) {
            // repairJSON returned empty object for a non-empty string — it's likely fully malformed
            throw new SyntaxError(`Could not repair JSON: ${argStr.substring(0, 80)}`);
          }
        } catch (parseError: any) {
          console.error(pc.red(`[LLM Validation Error] Invalid JSON arguments for ${toolName}: ${parseError.message}`));
          result = `[System Error] Arguments for ${toolName} must be valid JSON. Please correct the format. Error: ${parseError.message}`;
          
          logger.addEntry({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result
          }, sessionId);
          
          continue;
        }

        if (!isSkillActive(toolName)) {
          console.warn(pc.red(`[Security] Blocked illegal execution of disabled skill: ${toolName}`));
          result = `[System Error] Access denied: Skill '${toolName}' is currently disabled by the user.`;
          logger.addEntry({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result
          }, sessionId);
          continue;
        }

        try {
          // ── Per-tool-name call count guard ────────────────────────────────────────
          const currentCount = toolCallCounts.get(toolName) || 0;
          const maxAllowed = TOOL_CALL_LIMITS[toolName] ?? TOOL_CALL_LIMITS['__default__'];
          if (currentCount >= maxAllowed) {
            console.log(pc.yellow(`[Anti-Loop] ${toolName} has been called ${currentCount} times (limit: ${maxAllowed}). Injecting hard stop.`));
            const stopWarning = `[SYSTEM: LOOP DETECTED] '${toolName}' has been called ${currentCount} times this session, which exceeds the safe limit. ` +
              `This indicates you are stuck in a loop. ` +
              `You MUST stop calling tools and produce your FINAL answer to the user using the data you have already collected. ` +
              `DO NOT call '${toolName}' or any other tool again.`;
            logger.addEntry({ role: 'system' as any, content: stopWarning }, sessionId);
            const forceStopMsg = `⚠️ Loop breaker: '${toolName}' was called too many times (${currentCount}). Stopping. Please try again.`;
            logger.addEntry({ role: 'assistant', content: forceStopMsg }, sessionId);
            return forceStopMsg;
          }
          // ────────────────────────────────────────────────────────────────

          // 1. Execute via PluginManager
          const pluginResult = await pluginManager.executeTool(toolName, args, { sessionId });
          if (pluginResult !== null) {
            result = pluginResult;
          } else {
            result = `Error: Tool ${toolName} is not implemented.`;
          }

          if (result.includes('[Security Blocked]') || result.startsWith('Error:')) {
            console.log(pc.red(`[❌ Failed] Tool ${toolName} returned an error or was blocked.`));
          } else {
            console.log(pc.green(`[✅ Success] Tool ${toolName} executed successfully.`));
            // Increment count on success
            toolCallCounts.set(toolName, (toolCallCounts.get(toolName) || 0) + 1);
          }

        } catch (toolError: any) {
          result = `Error executing ${toolName}: ${toolError.message}`;
          console.error(pc.red(`[❌ Error Crash] Execution of ${toolName} failed completely: ${toolError.message}`));
        }

        const toolMsg = {
          role: 'tool' as any,
          tool_call_id: toolCall.id,
          name: toolCall.function?.name,
          content: result,
        };
        logger.addEntry(toolMsg, sessionId);
        loopMessages.push(toolMsg);

        accumulatedResults.push(result);
        const isErrorResult = typeof result === 'string' && (result.includes('[System Error]') || result.startsWith('Error:') || result.includes('[Error]') || result.includes('[Security Blocked]'));
        if (!fastReturnTools.includes(toolName) || isErrorResult) {
          canFastReturnAll = false;
        }
      }

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
          return errorSummary;
        }
      } else {
        consecutiveToolErrors = 0;
      }

      if (canFastReturnAll && accumulatedResults.length > 0) {
        const rawData = accumulatedResults.join('\n\n---\n\n');

        // ── Opsi A: Final summary pass (no tools) ──────────────────────────────
        // Tool results are already in history. Make ONE final LLM call with
        // tools=[] (no tools) so the LLM narrates the results naturally.
        // Since tools are disabled, looping is physically impossible.
        const summaryMessages: any[] = [
          { role: 'system', content: cachedSystemPrompt },
          ...sanitizeHistoryForLLM([...baseHistory, ...loopMessages], [], config.llm.provider),
          { role: 'user', content: `All requested tasks are complete. Based on the data gathered, provide a clear, concise, conversational final answer to me. Do NOT mention tools, internal processes, or that tools are disabled.` }
        ];

        try {
          const summaryResponse = await executeWithRetry(async (client) =>
            client.chat({
              model: config.llm.model,
              temperature: config.llm.temperature, frequency_penalty: config.llm.frequency_penalty, presence_penalty: config.llm.presence_penalty, repetition_penalty: config.llm.repetition_penalty,
              messages: summaryMessages,
              tools: [],  // physically disables tool calls
            })
          );
          const narrative = (summaryResponse.message.content || rawData)
            .replace(/<(think|thought|thinking|reasoning)[\s\S]*?<\/\1>/gi, '').trim();
          logger.addEntry({ role: 'assistant', content: narrative }, sessionId);
          return narrative;
        } catch {
          // If summary call fails, fall back to raw data
          logger.addEntry({ role: 'assistant', content: rawData }, sessionId);
          return rawData;
        }
        // ────────────────────────────────────────────────────────────────
      }
      
      // Loop continues, sending tool results in the next turn
    }
    
    const maxTurnMsg = "⚠️ Reached maximum interaction limit (10 turns). Please be more specific or break the task into smaller steps.";
    logger.addEntry({ role: 'assistant', content: maxTurnMsg }, sessionId);
    return maxTurnMsg;
  } catch (error: any) {
    console.error("LLM Error:", error);
    const status = error?.status || error?.response?.status;
    let errorMsg = '⚠️ All models are temporarily rate-limited. Please try again in a few minutes.';
    
    if (status === 400 || (error.message && error.message.toLowerCase().includes('invalid'))) {
      errorMsg = '⚠️ Failed to parse instruction. The LLM had trouble determining the appropriate tool format. Please describe your command more specifically.';
    }
    
    logger.addEntry({ role: 'assistant', content: errorMsg }, sessionId);
    return errorMsg;
  }
}

export async function processWeb3IntentStream(
  input: string,
  onChunk: (text: string) => void,
  onProgress?: (msg: string) => void,
  sessionId?: string
): Promise<string> {
  const config = loadConfig();
  logger.addEntry({ role: 'user', content: input }, sessionId);

  // FIX: Lazy-init guard — same pattern as processWeb3Intent
  if (pluginManager.getPlugins().length === 0) {
    console.warn('[Web3AgentStream] ⚠️ Plugins not initialized! Running lazy initializePlugins()...');
    await initializePlugins();
  }

  const pluginTools = pluginManager.getAllToolDefinitions();
  let activeTools = [...pluginTools].filter(t => isSkillActive(t.function.name));

  if (activeTools.length === 0) {
    console.error('[Web3AgentStream] ❌ CRITICAL: No active tools found after initialization! Retrying...');
    await initializePlugins();
    activeTools = [...pluginManager.getAllToolDefinitions()].filter(t => isSkillActive(t.function.name));
  }

  // FIX: Cache system prompt ONCE before the loop (was rebuilt on every turn)
  const cachedWeb3SystemPrompt = await getSystemPrompt('web3', input, sessionId);


  try {
    let turnCount = 0;
    let nudgeCount = 0;
    const MAX_TURNS = 10; // Reduced from 20
    let thinkingPrefillRetries = 0;
    let fullResponse = '';

    // ── Per-tool-name call count tracker (same as non-stream) ──────────────────────────
    const toolCallCountsStream = new Map<string, number>();
    const TOOL_CALL_LIMITS_STREAM: Record<string, number> = {
      'check_portfolio': 15,
      'get_balance': 8,
      'get_token_balance': 10,
      'get_token_price': 12,
      'get_gas_price': 8,
      'get_nft_holdings': 8,
      '__default__': 15,
    };

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
        { role: 'system', content: cachedWeb3SystemPrompt },
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
         console.warn(`[web3Agent] ⚠️ Final payload (${payloadTotalChars} chars) exceeds safe limit (${absTotalChars} chars). Forcing extreme truncation...`);
         for (let i = 0; i < messages.length; i++) {
            let m = messages[i];
            const maxPerMsg = Math.floor(absTotalChars / messages.length);
            if (typeof m.content === 'string' && m.content.length > maxPerMsg) {
                m.content = m.content.substring(0, maxPerMsg - 100) + "\n\n...[TRUNCATED]";
            } else if (Array.isArray(m.content)) {
                for (const b of m.content) {
                   if (b.type === 'text' && typeof b.text === 'string' && b.text.length > maxPerMsg) {
                       b.text = b.text.substring(0, maxPerMsg - 100) + "\n\n...[TRUNCATED]";
                   }
                }
            }
         }
      }

      let streamedContent = '';
      const response = await executeWithRetry(async (client) => {
        streamedContent = '';
        // RC#1 FIX: Always clear the buffer at the start of the stream turn.
        // Subsequent turns must wipe the buffer to prevent UI duplication of the planning text.
        onChunk('[CLEAR_STREAM]');
        return await client.stream(
          { model: config.llm.model, temperature: config.llm.temperature, frequency_penalty: config.llm.frequency_penalty, presence_penalty: config.llm.presence_penalty, repetition_penalty: config.llm.repetition_penalty, messages, tools: activeTools, reasoning_effort: config.llm.reasoning_effort },
          (chunk: string) => {
            streamedContent += chunk;
            onChunk(chunk);
          }
        );
      });

      const responseMessage = response.message;

      if (turnCount === 1) Tracker.addMessage();
      if (response.usage?.total_tokens) Tracker.addTokens(response.usage.total_tokens, config.llm.provider);
      Tracker.addEvent('llm.response', { provider: config.llm.provider, tool_calls: responseMessage.tool_calls?.length || 0 });

      const asstMsgStream = {
        role: 'assistant' as any,
        content: responseMessage.content || '',
        reasoning_content: (responseMessage as any).reasoning_content,
        tool_calls: responseMessage.tool_calls,
      };
      logger.addEntry(asstMsgStream, sessionId);
      loopMessagesStream.push(asstMsgStream);

      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        let finalContent = responseMessage.content || '';
        finalContent = finalContent.replace(/<(think|thought|thinking|reasoning|analysis|reflection)[\s\S]*?<\/\1>\n?/gi, '').trim();
        finalContent = finalContent.replace(/^\s*(?:\*\*)?(?:think|thought|thinking|reasoning|analysis|reflection)(?:\*\*)?\s*?\n[\s\S]*?\n\n/i, '').trim();
        
        // Support global languages: English, Indonesian, Spanish, French, German filler words
        const isConversationalFiller = finalContent.length > 0 && finalContent.length < 250 && /(wait|checking|executing|processing|give me a moment|let me check|one moment|hold on|tunggu|sebentar|lagi proses|lanjut cek|gue cek|aku cek|un momento|attendez|bitte warten)[\s\.\!a-z]*$/i.test(finalContent.trim());

        if (finalContent === '' || isConversationalFiller) {
          const hasNativeReasoning = !!(responseMessage as any).reasoning_content;
          const hasThinkTagInStream = /<(think|thought|thinking|reasoning)[\s\S]*?<\//i.test(streamedContent);
          const isThinkOnlyResponse = hasNativeReasoning || hasThinkTagInStream;

          // ── THINKING-PREFILL CONTINUATION ──
          // Gemini tends to need more prefill attempts — allow up to 4.
          const maxPrefillRetriesW = (config.llm.provider === 'gemini') ? 4 : 2;
          if (isThinkOnlyResponse && thinkingPrefillRetries < maxPrefillRetriesW) {
            thinkingPrefillRetries++;
            console.warn(`[Web3AgentStream] ⚠️ Think-only silent stop — prefilling to continue (${thinkingPrefillRetries}/${maxPrefillRetriesW})...`);
            continue;
          }

          // ── NUDGE FALLBACK (after prefill exhaustion or truly empty) ──
          // Gemini needs more nudges — allow up to 5 for Gemini, 3 for others
          const maxNudgesW = (config.llm.provider === 'gemini') ? 5 : 3;
          if (nudgeCount < maxNudgesW) {
            nudgeCount++;
            const recentUserMsg = logger.getHistory(sessionId)
              .filter((m: any) => m.role === 'user').slice(-1)[0]?.content || 'the user request';

            let nudgeContent: string;
            if (isThinkOnlyResponse) {
              console.warn(`[Web3AgentStream] ⚠️ Think-only prefill exhausted. System nudge (${nudgeCount}/${maxNudgesW}) for ${config.llm.provider}...`);
              nudgeContent = `[SYSTEM NUDGE ${nudgeCount}/${maxNudgesW} — SILENT STOP DETECTED]
You completed your internal reasoning but produced NO output (no tool call, no text).
This is a silent stop — it is not acceptable.

Task: "${(typeof recentUserMsg === 'string' ? recentUserMsg : JSON.stringify(recentUserMsg)).substring(0, 200)}"

You MUST act RIGHT NOW. Do one of these:
  A) Call the first required tool immediately (e.g., get_price, analyze_market, get_balance)
  B) Output a final text answer

Do NOT think again. Execute step 1 of the task NOW.`;
            } else {
              console.warn(`[Web3AgentStream] ⚠️ Empty or filler response. System nudge (${nudgeCount}/${maxNudgesW}) for ${config.llm.provider}...`);
              nudgeContent = `[SYSTEM NUDGE ${nudgeCount}/${maxNudgesW}] Your last response was empty or contained conversational filler without tool calls. You MUST take action now.

Task: "${(typeof recentUserMsg === 'string' ? recentUserMsg : JSON.stringify(recentUserMsg)).substring(0, 200)}"

Available tools: swap_token, get_portfolio, etc.
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
            console.error(`[Web3AgentStream] ❌ LLM (${config.llm.provider}) failed to recover after prefill + ${maxNudgesW} nudges. Aborting.`);
            finalContent = '⚠️ I encountered an issue processing your request. This can happen with very complex multi-step tasks. Please try rephrasing or breaking the request into smaller steps.';
          }
        }
        // Reset prefill counter on successful response
        thinkingPrefillRetries = 0;


        fullResponse = finalContent;
        break;
      }

      // Tool calls detected — pause stream visually and execute tools
      // BUG#1 FIX: Wipe turn-1 planning text. See osAgent.ts for full explanation.
      await onChunk('[TOOL_CALL_DETECTED]');
      const fastReturnTools: string[] = [
        // Transactions
        'transfer_token', 'transfer_native', 'swap_token', 'bridge_token',
        'mint_nft', 'custom_tx', 'revoke_approval', 'supply_aave',
        'deposit_yield_vault', 'provide_liquidity_v3', 'confirm_pending_tx',
        'get_my_address', 'get_tx_history', 'resolve_ens', 'send_telegram_file',
        // Read-only info fetches — never need follow-up LLM turn
        'check_portfolio', 'get_balance', 'get_token_balance', 'get_wallet_balance',
        'get_token_price', 'get_gas_price', 'get_network_stats',
        'check_allowance', 'get_transaction_status', 'get_nft_holdings',
      ];
      let canFastReturnAll = true;
      const accumulatedResults: string[] = [];

      // Deduplicate identical tool calls to prevent double execution bugs
      const uniqueToolCalls = [];
      const seenToolCalls = new Set();
      
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
        if (!seenToolCalls.has(sig)) {
          seenToolCalls.add(sig);
          uniqueToolCalls.push(tc);
        }
      }

      for (const _toolCall of uniqueToolCalls) {
        const toolCall = _toolCall as any;
        const toolName = toolCall.function.name;
        let result = '';
        let args: any = {};
        
        let cwd: string | undefined;
        if (sessionId) {
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
        if (onProgress) onProgress(`⚙️ Running: ${toolName}`);

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
          continue;
        }

        if (!isSkillActive(toolName)) {
          result = `[System Error] Access denied: Skill '${toolName}' is currently disabled.`;
          const skillErrToolMsg = { role: 'tool' as any, tool_call_id: toolCall.id, name: toolName, content: result };
          logger.addEntry(skillErrToolMsg, sessionId);
          loopMessagesStream.push(skillErrToolMsg);
          continue;
        }

        try {
          // ── Per-tool-name call count guard (stream) ──────────────────────────
          const currentCountS = toolCallCountsStream.get(toolName) || 0;
          const maxAllowedS = TOOL_CALL_LIMITS_STREAM[toolName] ?? TOOL_CALL_LIMITS_STREAM['__default__'];
          if (currentCountS >= maxAllowedS) {
            console.log(pc.yellow(`[Anti-Loop Stream] ${toolName} called ${currentCountS} times (limit: ${maxAllowedS}). Hard stop.`));
            const stopWarning = `[SYSTEM: LOOP DETECTED] '${toolName}' has been called ${currentCountS} times, exceeding the safe limit. ` +
              `You MUST produce your FINAL answer using data already collected. DO NOT call any tool again.`;
            logger.addEntry({ role: 'system' as any, content: stopWarning }, sessionId);
            const forceMsg = `⚠️ Loop breaker: '${toolName}' called too many times (${currentCountS}x). Please try again.`;
            logger.addEntry({ role: 'assistant', content: forceMsg }, sessionId);
            await onChunk(forceMsg);
            return forceMsg;
          }
          // ────────────────────────────────────────────────────────────────

          const pluginResult = await pluginManager.executeTool(toolName, args, context);
          result = pluginResult !== null ? pluginResult : `Error: Tool ${toolName} is not implemented.`;
          if (result.includes('[Security Blocked]') || result.startsWith('Error:')) {
            console.log(pc.red(`[❌ Failed] Tool ${toolName} returned an error or was blocked.`));
          } else {
            console.log(pc.green(`[✅ Success] Tool ${toolName} executed successfully.`));
            toolCallCountsStream.set(toolName, (toolCallCountsStream.get(toolName) || 0) + 1);
          }
        } catch (toolError: any) {
          result = `Error executing ${toolName}: ${toolError.message}`;
          console.error(pc.red(`[❌ Error Crash] Execution of ${toolName} failed: ${toolError.message}`));
        }

        const okToolMsg = { role: 'tool' as any, tool_call_id: toolCall.id, name: toolName, content: result };
        logger.addEntry(okToolMsg, sessionId);
        loopMessagesStream.push(okToolMsg);
        accumulatedResults.push(result);
        
        const isErrorResult = typeof result === 'string' && (result.includes('[System Error]') || result.startsWith('Error:') || result.includes('[Error]') || result.includes('[Security Blocked]'));
        if (!fastReturnTools.includes(toolName) || isErrorResult) canFastReturnAll = false;
      }

      await onChunk('[TOOL_CALL_FINISHED]');

      if (canFastReturnAll && accumulatedResults.length > 0) {
        const rawData = accumulatedResults.join('\n\n---\n\n');
        const isSilent = rawData.includes('[SILENT_FAST_RETURN]');

        if (isSilent) {
          // Transaction confirmations: send raw, no narration needed
          const cleanContent = rawData.replace(/\[SILENT_FAST_RETURN\] /g, '');
          const fastReturnMsg = { role: 'assistant' as any, content: cleanContent };
          logger.addEntry(fastReturnMsg, sessionId);
          loopMessagesStream.push(fastReturnMsg);
          fullResponse = cleanContent;
          break;
        }

        // ── Opsi A: Final summary pass (no tools, stream) ─────────────────────
        const summaryMessagesS: any[] = [
          { role: 'system', content: cachedWeb3SystemPrompt },
          ...sanitizeHistoryForLLM([...baseHistoryStream, ...loopMessagesStream], [], config.llm.provider),
          { role: 'user', content: `All requested tasks are complete. Based on the data gathered, provide a clear, concise, conversational final answer to me. Do NOT mention tools, internal processes, or that tools are disabled.` }
        ];

        try {
          let narrativeStream = '';
          await executeWithRetry(async (client) => {
            narrativeStream = '';
            onChunk('[CLEAR_STREAM]');
            return await client.stream(
              { model: config.llm.model, temperature: config.llm.temperature, frequency_penalty: config.llm.frequency_penalty, presence_penalty: config.llm.presence_penalty, repetition_penalty: config.llm.repetition_penalty, messages: summaryMessagesS, tools: [] },
              (chunk: string) => { narrativeStream += chunk; onChunk(chunk); }
            );
          });
          const cleanNarrative = narrativeStream
            .replace(/<(think|thought|thinking|reasoning)[\s\S]*?<\/\1>/gi, '').trim();
          logger.addEntry({ role: 'assistant', content: cleanNarrative }, sessionId);
          fullResponse = cleanNarrative;
        } catch {
          // Fallback to raw data if summary call fails — clean it first
          const cleanRawData = rawData
            .replace(/\[SILENT_FAST_RETURN\] /g, '')
            .replace(/\[System Error\][^\n]*/g, '')
            .trim();
          onChunk('[CLEAR_STREAM]');
          await onChunk(cleanRawData);
          logger.addEntry({ role: 'assistant', content: cleanRawData }, sessionId);
          fullResponse = cleanRawData;
        }
        // ────────────────────────────────────────────────────────────────
        break;
      }
    }

    if (!fullResponse) {
      const maxTurnMsg = `⚠️ Reached maximum interaction limit (${MAX_TURNS} turns). Please be more specific.`;
      logger.addEntry({ role: 'assistant', content: maxTurnMsg }, sessionId);
      fullResponse = maxTurnMsg;
    }

    return fullResponse;
  } catch (error: any) {
    console.error('LLM Stream Error:', error);
    const status = error?.status || error?.response?.status;
    let errorMsg = '⚠️ All models are temporarily rate-limited. Please try again in a few minutes.';
    if (status === 400 || (error.message && error.message.toLowerCase().includes('invalid'))) {
      errorMsg = '⚠️ Failed to parse instruction. Please describe your command more specifically.';
    }
    logger.addEntry({ role: 'assistant', content: errorMsg }, sessionId);
    try {
      onChunk(errorMsg);
    } catch {}
    return errorMsg;
  }
}
