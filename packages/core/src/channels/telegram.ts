import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { run } from '@grammyjs/runner';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { processUserInput, processUserInputStream, logger } from '../agent/reasoning';
import { loadConfig, saveConfig } from '../config/parser';
import { txManager } from '../agent/transactionManager';
import { executeTransfer } from '../web3/skills/transfer';
import { executeSwap } from '../web3/skills/swapToken';
import { executeBridge } from '../web3/skills/bridgeToken';
import { executeMintNft } from '../web3/skills/mintNft';
import { executeCustomTx } from '../web3/skills/customTx';
import { executeApprove, executeAaveSupply, executeVaultDeposit, executeUniv3Mint } from '../web3/skills/executeDefi';
import { executeRevokeApproval } from '../web3/skills/revokeApprovals';
import { checkRegistryStatus } from '../web3/skills/checkRegistryStatus';
import { formatTransactionSuccess, formatTransactionError } from '../utils/formatter';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';

let globalBotInstance: Bot | null = null;
let runnerInstance: any = null;
const activeTypingIntervals = new Map<string, NodeJS.Timeout>();

// ─────────────────────────────────────────────────────────────────────────────
// Telegram Rich Markdown Formatter
// Keeps raw Markdown but strips LLM artifacts for sendRichMessage
// ─────────────────────────────────────────────────────────────────────────────
export function formatToRichMarkdown(text: string): string {
  if (!text) return '';
  let md = text;

  // Strip reasoning blocks
  const reasoningTags = 'think|thought|thinking|reasoning|analysis|reflection';
  md = md.replace(new RegExp(`<(${reasoningTags})>[\\s\\S]*?<\\/\\1>\\n?`, 'gi'), '');

  // Strip tool execution artifact blocks
  const artifactTags = 'tool_code|tool_call|execute_tool|execute_bash|execute';
  md = md.replace(new RegExp(`<(${artifactTags})>[\\s\\S]*?<\\/\\1>\\n?`, 'gi'), '');

  // Strip markdown tool calls
  md = md.replace(/```(?:json)?\s*\[?\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]\s*```|```|$)/gi, '');
  // Strip raw JSON tool arrays
  md = md.replace(/\[\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]|$)/gi, '');

  // Strip UI-specific HTML tags (e.g. span for colors) that leak in Telegram
  md = md.replace(/<\/?span[^>]*>/gi, '');

  return md.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram HTML Formatter
export function formatToTelegramHTML(text: string): string {
  if (!text) return '';
  
  // Strip UI-specific HTML tags (e.g. span) before escaping
  let html = text.replace(/<\/?span[^>]*>/gi, '');

  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Strip reasoning blocks (escaped and raw forms) ONLY if they are properly closed.
  const reasoningTags = 'think|thought|thinking|reasoning|analysis|reflection';
  html = html.replace(new RegExp(`&lt;(${reasoningTags})&gt;[\\s\\S]*?&lt;\\/\\1&gt;\\n?`, 'gi'), '');
  html = html.replace(new RegExp(`<(${reasoningTags})>[\\s\\S]*?<\\/\\1>\\n?`, 'gi'), '');

  // Strip tool execution artifact blocks (escaped and raw forms)
  const artifactTags = 'tool_code|tool_call|execute_tool|execute_bash|execute';
  html = html.replace(new RegExp(`&lt;(${artifactTags})&gt;[\\s\\S]*?&lt;\\/\\1&gt;\\n?`, 'gi'), '');
  html = html.replace(new RegExp(`&lt;(${artifactTags})&gt;[\\s\\S]*$`, 'gi'), '');
  html = html.replace(new RegExp(`<(${artifactTags})>[\\s\\S]*?<\\/\\1>\\n?`, 'gi'), '');
  html = html.replace(new RegExp(`<(${artifactTags})>[\\s\\S]*$`, 'gi'), '');

  // Strip markdown tool calls
  html = html.replace(/```(?:json)?\s*\[?\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]\s*```|```|$)/gi, '');
  // Strip raw JSON tool arrays
  html = html.replace(/\[\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]|$)/gi, '');

  // Convert markdown formatting
  html = html.replace(/```(\w+)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trimEnd()}</code></pre>`;
  });
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([\s\S]*?)\*\*/g, (match, p1) => {
    if (p1.includes('<pre>') || p1.includes('<code>')) return match;
    return `<b>${p1}</b>`;
  });
  html = html.replace(/(?<!\w)\*(?!\s)([\s\S]*?)(?<!\s)\*(?!\w)/g, (match, p1) => {
    if (p1.includes('<b>') || p1.includes('</b>') || p1.includes('<pre>') || p1.includes('<code>')) return match;
    return `<i>${p1}</i>`;
  });

  // Un-flatten accidentally joined table rows (small model hallucination)
  // 1. Separate table header from preceding text on same line (e.g., "4. Layanan: | col1 | col2 | |---|---|")
  html = html.replace(/(^|\n)([^|\r\n]+?)[ \t]*(\|[^\r\n]+\|)[ \t]*(?=\|[ \t]*[-:]+[-| :]*\|)/g, '$1$2\n$3');
  // 2. Separate header row from separator row if stuck together
  html = html
    .replace(/\|[ \t]*\|[ \t]*(?=[-:]+[-| :]*\|)/g, '|\n|')
    .replace(/(\|[ \t]*[-:]+[-| :]*\|)[ \t]*\|/g, '$1\n|');
  // 3. Separate table data rows that are joined on the same line
  html = html.replace(/\|[ \t]*\|[ \t]*(?=[^| \t\r\n])/g, '|\n|');

  // Convert markdown tables to preformatted text
  const tableRegex = /(?:\|.*\|(?:\n|$))+/g;
  html = html.replace(tableRegex, (match) => `<pre>${match.trim()}</pre>\n`);

  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Bubble — Two-bubble design.
//
// Workflow the user sees:
//   1. LLM initial text ("Oke, gue cariin...") → Bubble A (streamed live, then frozen)
//   2. Tool progress ("⚡ search_web...")        → Bubble B (edited in place)
//   3. Final answer                              → Bubble B (edited in place)
//
// Design rules:
//   - ALL state mutations go through an async queue — no race conditions
//     even when multiple onProgress calls arrive simultaneously (parallel tools).
//   - [CLEAR_STREAM]: new agent turn — reset Bubble B to ⏳, don't create a message
//   - [TOOL_CALL_DETECTED]: first occurrence freezes Bubble A, creates Bubble B
//     Subsequent occurrences just reset Bubble B to ⏳
//   - onProgress: edits Bubble B only
//   - sendFinal: edits Bubble B with the final answer
// ─────────────────────────────────────────────────────────────────────────────
interface StreamBubble {
  onChunk: (chunk: string) => void;
  onProgress: (msg: string) => void;
  markFinalized: () => void;
  sendFinal: (response: string, markup?: any) => Promise<void>;
  dispose: () => void;
}

function createStreamBubble(ctx: any, replyToMsgId?: number): StreamBubble {
  // ── State ──────────────────────────────────────────────────────────────────
  let buffer = '';
  let textMsgId: number | null = null;
  let progressMsgId: number | null = null;
  let hasRepliedToUser = false;
  let isFinalized = false;
  let pendingFlushTimer: NodeJS.Timeout | null = null;
  let lastProgressHtml = '';               // dedup: skip edit if content unchanged
  let lastEditTime = 0;
  let currentDraftId = Date.now() + Math.floor(Math.random() * 1000);
  let hasEmittedPreamble = false;

  const MIN_EDIT_MS = 1100;   // Telegram safe edit interval
  const COOLDOWN_MS = 800;    // min gap between consecutive sends
  const MAX_RETRIES = 3;
  const TELEGRAM_MAX = 4000;

  // ── Typing indicator — refreshed every 4.5s (Telegram clears it after 5s) ──
  let typingInterval: NodeJS.Timeout | null = setInterval(() => {
    ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
  }, 4500);
  // Send immediately on start so it shows up right away
  ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});

  // ── Async queue — all state mutations run here, one at a time ──────────────
  const opQueue: (() => Promise<void>)[] = [];
  let draining = false;

  const enqueue = (op: () => Promise<void>): void => {
    opQueue.push(op);
    if (!draining) setImmediate(drainQueue);
  };

  const drainQueue = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    while (opQueue.length > 0) {
      const op = opQueue.shift()!;
      try { await op(); } catch {}
    }
    draining = false;
  };

  // ── Low-level helpers ──────────────────────────────────────────────────────

  /** Send a brand-new message, returns the message_id. */
  const sendNew = async (html: string): Promise<number | null> => {
    const now = Date.now();
    const wait = COOLDOWN_MS - (now - lastEditTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    try {
      let sent;
      if (replyToMsgId && !hasRepliedToUser) {
        hasRepliedToUser = true;
        sent = await ctx.reply(html, { parse_mode: 'HTML', reply_parameters: { message_id: replyToMsgId } as any });
      } else {
        sent = await ctx.reply(html, { parse_mode: 'HTML' });
      }
      lastEditTime = Date.now();
      return sent.message_id;
    } catch (e: any) {
      console.error('[Telegram] sendNew failed:', e?.description || e?.message);
      return null;
    }
  };

  /** Edit Bubble B (progress/final). Creates it if it doesn't exist yet. */
  const editProgressBubble = async (html: string, markup?: any): Promise<void> => {
    if (!html || html.trim() === '') return;
    if (html === lastProgressHtml && !markup) return; // nothing changed

    if (!progressMsgId) {
      progressMsgId = await sendNew(html);
      if (progressMsgId) lastProgressHtml = html;
      return;
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await ctx.api.editMessageText(ctx.chat.id, progressMsgId, html, {
          parse_mode: 'HTML',
          ...(markup ? { reply_markup: markup } : {}),
        });
        lastProgressHtml = html;
        lastEditTime = Date.now();
        return;
      } catch (e: any) {
        const is429      = e?.error_code === 429 || e?.description?.includes('Too Many Requests');
        const unchanged  = e?.description?.includes('message is not modified');
        if (unchanged) { lastProgressHtml = html; return; }
        if (is429 && attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
          continue;
        }
        // Non-retriable: fall back to a new message
        progressMsgId = await sendNew(html);
        if (progressMsgId) lastProgressHtml = html;
        return;
      }
    }
  };

  let richDraftDisabled = false;

  /** Edit Bubble A (initial text) using sendRichMessageDraft. */
  const editTextBubble = async (bufferStr: string): Promise<void> => {
    if (!bufferStr || bufferStr.trim() === '') return;
    const md = formatToRichMarkdown(bufferStr);
    const htmlFallback = formatToTelegramHTML(bufferStr);
    if (!md || md.trim() === '') return;

    if (!richDraftDisabled) {
      try {
        // Send as Rich Message Draft. If textMsgId exists (due to fallback or pre-existing),
        // we can still use it as draft_id, or just use currentDraftId if textMsgId is null.
        await (ctx.api.raw as any).sendRichMessageDraft({
          chat_id: ctx.chat.id,
          draft_id: textMsgId || currentDraftId,
          rich_message: { markdown: md }
        });
        return; // Success! No need to create a real message during streaming.
      } catch (e: any) {
        const errMsg = e?.description || e?.message || '';
        if (errMsg.includes('method not found') || errMsg.includes('unsupported')) {
          richDraftDisabled = true;
          console.warn('[Telegram] sendRichMessageDraft unsupported, falling back to legacy edits.');
        } else {
          // Transient error, just return and let the next chunk try again
          return;
        }
      }
    }

    // Fallback: Legacy HTML edit/create
    if (!textMsgId) {
      textMsgId = await sendNew(htmlFallback);
      return;
    }

    try {
      await ctx.api.editMessageText(ctx.chat.id, textMsgId, htmlFallback, { parse_mode: 'HTML' });
    } catch (fe: any) {
      if (!fe?.description?.includes('message is not modified')) {
        console.warn('[Telegram] editTextBubble fallback failed:', fe?.description || fe?.message);
      }
    }
  };

  // ── Helper: finalizeBuffer ──────────────────────────────────────────────────
  const finalizeBuffer = async (markup?: any): Promise<void> => {
    if (!buffer.trim()) return;

    if (!richDraftDisabled) {
      const md = formatToRichMarkdown(buffer);
      if (md && md.trim() !== '') {
        try {
          const payload: any = {
            chat_id: ctx.chat.id,
            rich_message: { markdown: md },
            ...(markup ? { reply_markup: markup } : {})
          };
          if (replyToMsgId && !hasRepliedToUser) {
            payload.reply_parameters = { message_id: replyToMsgId };
          }
          await (ctx.api.raw as any).sendRichMessage(payload);
          // Only set to true if it succeeds
          if (payload.reply_parameters) {
            hasRepliedToUser = true;
          }
        } catch (e: any) {
          console.warn('[Telegram] finalizeBuffer rich delivery failed:', e?.message);
          richDraftDisabled = true;
          const htmlFallback = formatToTelegramHTML(buffer);
          if (htmlFallback && htmlFallback.trim() !== '') {
            if (textMsgId) {
              try {
                await ctx.api.editMessageText(ctx.chat.id, textMsgId, htmlFallback, { parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) });
              } catch (fe) {}
            } else {
              textMsgId = await sendNew(htmlFallback);
            }
          }
        }
      }
    } else {
      // HTML fallback mode: textMsgId might be null if stream was fast
      const htmlFallback = formatToTelegramHTML(buffer);
      if (htmlFallback && htmlFallback.trim() !== '') {
        if (textMsgId) {
          try {
            await ctx.api.editMessageText(ctx.chat.id, textMsgId, htmlFallback, { parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) });
          } catch (fe) {}
        } else {
          textMsgId = await sendNew(htmlFallback);
        }
      }
    }

    // Reset state so the next streamed text creates a NEW, chronologically ordered bubble
    buffer = '';
    textMsgId = null;
    currentDraftId = Date.now() + Math.floor(Math.random() * 1000);
  };

  // ── Debounced flush of streaming text → Bubble A or B ─────────────────────
  const scheduleFlush = (): void => {
    if (pendingFlushTimer || isFinalized) return;
    pendingFlushTimer = setTimeout(() => {
      pendingFlushTimer = null;
      enqueue(async () => {
        if (isFinalized) return;
        await editTextBubble(buffer);
      });
    }, MIN_EDIT_MS);
  };

  // ── Public: onChunk ────────────────────────────────────────────────────────
  const onChunk = (chunk: string): void => {
    enqueue(async () => {
      if (isFinalized) return;

      if (chunk === '[CLEAR_STREAM]') {
        // New agent turn starting.
        if (pendingFlushTimer) { clearTimeout(pendingFlushTimer); pendingFlushTimer = null; }
        
        // Finalize any remaining text from the previous turn into a real message
        await finalizeBuffer();
        
        // Sequential workflow: Reset message IDs so the next turn creates NEW bubbles
        // instead of editing the previous turn's bubbles.
        progressMsgId = null;
        lastProgressHtml = '';
        return;
      }

      if (chunk === '[REPLACE_STREAM]') {
        // Clear buffer but keep textMsgId intact so we REPLACE the current text
        // in the existing Telegram bubble instead of creating a duplicate.
        if (pendingFlushTimer) { clearTimeout(pendingFlushTimer); pendingFlushTimer = null; }
        buffer = '';
        return;
      }

      if (chunk === '[TOOL_CALL_DETECTED]') {
        if (pendingFlushTimer) { clearTimeout(pendingFlushTimer); pendingFlushTimer = null; }

        // Guard: Claude sometimes streams a trivial preamble ("...", "…", whitespace)
        // before emitting a tool_use block. Don't create an empty-looking bubble for it.
        const visibleContent = buffer.replace(/[\s.…·\-_]+/g, '').trim();
        if (visibleContent.length < 4) {
          // Discard the trivial preamble — don't send it as a bubble
          buffer = '';
          textMsgId = null;
        } else {
          // Flush and finalize any meaningful conversational text
          await finalizeBuffer();
        }
        
        // Create or reset Bubble B with ⏳
        // This is the first time Bubble B appears — always AFTER the previous text was finalized
        lastProgressHtml = '';
        await editProgressBubble('⏳ Processing...');
        return;
      }

      if (chunk === '[TOOL_CALL_FINISHED]') {
        // Keep Bubble B as-is — onProgress will update it shortly
        return;
      }

      // Normal streaming text — accumulate and debounce-flush.
      // scheduleFlush() internally routes to Bubble A.
      buffer = buffer ? buffer + chunk : chunk;
      if (!pendingFlushTimer && !isFinalized) {
        pendingFlushTimer = setTimeout(() => {
          pendingFlushTimer = null;
          enqueue(async () => {
            if (isFinalized) return;
            const html = formatToTelegramHTML(buffer);
            if (!html || !html.trim()) return;
            await editTextBubble(html);
          });
        }, MIN_EDIT_MS);
      }
    });
  };

  // ── Public: onProgress ─────────────────────────────────────────────────────
  // Creates a new bubble per distinct tool call so each tool action is
  // visible as its own message (intended UX for multi-step tool chains).
  const onProgress = (msg: string): void => {
    enqueue(async () => {
      if (isFinalized) return;
      if (pendingFlushTimer) { clearTimeout(pendingFlushTimer); pendingFlushTimer = null; }
      const newHtml = formatToTelegramHTML(msg);
      
      if (newHtml === lastProgressHtml) {
        return; // Prevent spamming duplicate bubbles (e.g. 6x check_portfolio)
      }
      
      if (lastProgressHtml === '⏳ Processing...') {
        // First tool call of this turn: edit the ⏳ placeholder in place
        await editProgressBubble(newHtml);
      } else {
        // Subsequent tool calls: send a new bubble so each tool is visible
        const newMsgId = await sendNew(newHtml);
        if (newMsgId) {
          progressMsgId = newMsgId;
          lastProgressHtml = newHtml;
        }
      }
    });
  };

  // ── Public: markFinalized ─────────────────────────────────────────────────
  const markFinalized = (): void => {
    enqueue(async () => {
      isFinalized = true;
      if (pendingFlushTimer) { clearTimeout(pendingFlushTimer); pendingFlushTimer = null; }
    });
  };

  // ── Helpers: split long messages ──────────────────────────────────────────
  const splitMessage = (html: string): string[] => {
    if (html.length <= TELEGRAM_MAX) return [html];
    const chunks: string[] = [];
    let remaining = html;
    while (remaining.length > TELEGRAM_MAX) {
      let splitAt = TELEGRAM_MAX;
      const lastPara = remaining.lastIndexOf('\n\n', TELEGRAM_MAX);
      if (lastPara > TELEGRAM_MAX / 2) { splitAt = lastPara + 2; }
      else {
        const lastNl = remaining.lastIndexOf('\n', TELEGRAM_MAX);
        if (lastNl > TELEGRAM_MAX / 2) { splitAt = lastNl + 1; }
        else {
          const lastSp = remaining.lastIndexOf(' ', TELEGRAM_MAX);
          if (lastSp > TELEGRAM_MAX / 2) splitAt = lastSp + 1;
        }
      }
      let chunk = remaining.substring(0, splitAt);
      const lastOpen = chunk.lastIndexOf('<');
      const lastClose = chunk.lastIndexOf('>');
      if (lastOpen > lastClose) { splitAt = lastOpen; chunk = remaining.substring(0, splitAt); }
      remaining = remaining.substring(splitAt);
      const tagRe = /<\/?(b|i|code|pre)>/g;
      let m: RegExpExecArray | null;
      const open: string[] = [];
      while ((m = tagRe.exec(chunk)) !== null) {
        if (m[0].startsWith('</')) { if (open.length && open[open.length - 1] === m[1]) open.pop(); }
        else { open.push(m[1]); }
      }
      const closing = open.reverse().map(t => `</${t}>`).join('');
      const opening = open.reverse().map(t => `<${t}>`).join('');
      chunks.push(chunk.trim() + closing);
      remaining = opening + remaining;
    }
    if (remaining.trim()) chunks.push(remaining.trim());
    return chunks;
  };

  // ── Public: sendFinal ─────────────────────────────────────────────────────
  // Waits for queue to drain, then finalizes the last text bubble.
  const sendFinal = async (response: string, markup?: any): Promise<void> => {
    await new Promise<void>(resolve => enqueue(async () => { resolve(); }));

    if (response.includes('[SILENT_FAST_RETURN]')) return;
    
    // The final answer text is already in the buffer from the last streamed turn.
    // Finalize it into a real message.
    await finalizeBuffer(markup);
  };

  // ── Public: dispose — clean up timers ─────────────────────────────────────
  const dispose = (): void => {
    if (pendingFlushTimer) { clearTimeout(pendingFlushTimer); pendingFlushTimer = null; }
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
  };


  return { onChunk, onProgress, markFinalized, sendFinal, dispose };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot Initialization
// ─────────────────────────────────────────────────────────────────────────────
export function startTelegramBot() {
  const config = loadConfig();
  const token = config.integrations?.telegram?.bot_token;

  if (!token) {
    console.log('[Telegram] No TELEGRAM_BOT_TOKEN found in config.yaml. Bot is disabled.');
    return;
  }

  try {
    const bot = new Bot(token);
    globalBotInstance = bot;

    const throttler = apiThrottler();
    bot.api.config.use(throttler);

    // Graceful retry on connection errors
    bot.api.config.use(async (prev, method, payload, signal) => {
      try {
        return await prev(method, payload, signal);
      } catch (err: any) {
        if (method === 'getUpdates' && err.message?.includes('ETIMEDOUT')) {
          console.log(pc.yellow('[Telegram] API connection lost (Timeout). Retrying...'));
        } else if (method === 'getUpdates') {
          console.log(pc.yellow(`[Telegram] Failed to fetch updates: ${err.message}`));
        }
        throw err;
      }
    });

    // ── Pairing ──────────────────────────────────────────────────────────────
    const isPaired = !!config.integrations?.telegram?.authorized_chat_id;
    let generatedPin = '';
    let pinExpiry = 0;

    if (!isPaired) {
      generatedPin = Math.floor(100000 + Math.random() * 900000).toString();
      pinExpiry = Date.now() + 5 * 60 * 1000;
      console.log(pc.yellow('\n==================================================='));
      console.log(pc.yellow('🔐 TELEGRAM BOT AUTHORIZATION REQUIRED'));
      console.log(pc.yellow('==================================================='));
      console.log('Open Telegram and send the following command to your bot:\n');
      console.log(pc.cyan(`  /auth ${generatedPin}\n`));
      console.log(pc.gray('(This OTP code will expire in 5 minutes)\n'));
      console.log('⏳ Waiting for incoming message...');
    }

    // ── Auth Middleware ───────────────────────────────────────────────────────
    bot.use(async (ctx, next) => {
      const currentConfig = loadConfig();
      const authId = currentConfig.integrations?.telegram?.authorized_chat_id;
      if (authId) {
        if (ctx.chat?.id !== authId) return;
        return next();
      }
      if (ctx.message && 'text' in ctx.message) {
        const text = ctx.message.text || '';
        if (text.startsWith('/auth ')) {
          const pin = text.split(' ')[1];
          if (Date.now() > pinExpiry) {
            await ctx.reply('❌ The pairing PIN has expired. Please restart the CLI to generate a new one.');
            return;
          }
          if (pin === generatedPin) {
            if (!currentConfig.integrations) currentConfig.integrations = {};
            if (!currentConfig.integrations.telegram) currentConfig.integrations.telegram = { enabled: true, bot_token: token };
            currentConfig.integrations.telegram.authorized_chat_id = ctx.chat?.id;
            saveConfig(currentConfig);
            await ctx.reply('✅ Authorization Successful! Connection secured.');
            console.log(pc.green(`\n[Telegram] Paired with Chat ID: ${ctx.chat?.id}`));
            return;
          }
          await ctx.reply('❌ Incorrect PIN.');
          return;
        }
      }
    });

    // ── /clear ────────────────────────────────────────────────────────────────
    bot.command('clear', async (ctx) => {
      const threadId = ctx.message?.message_thread_id ? `_${ctx.message.message_thread_id}` : '';
      logger.clear(`telegram_${ctx.chat?.id}${threadId}`);
      await ctx.reply("✅ AI memory has been cleared. Let's start a new chat!");
    });

    // ── /reasoning ────────────────────────────────────────────────────────────
    bot.command('reasoning', async (ctx) => {
      const parts = (ctx.message?.text || '').split(' ');
      if (parts.length < 2) {
        await ctx.reply('ℹ️ Usage: `/reasoning [high|medium|low|none]`', { parse_mode: 'Markdown' });
        return;
      }
      const effort = parts[1].toLowerCase();
      if (!['high', 'medium', 'low', 'none'].includes(effort)) {
        await ctx.reply('❌ Invalid reasoning effort. Use: high, medium, low, or none.');
        return;
      }
      const cfg = loadConfig();
      if (!cfg.llm) cfg.llm = {} as any;
      cfg.llm.reasoning_effort = effort as any;
      saveConfig(cfg);
      await ctx.reply(`✅ Reasoning effort set to: **${effort.toUpperCase()}**`, { parse_mode: 'Markdown' });
    });

    // ── Text Messages ─────────────────────────────────────────────────────────
    bot.on('message:text', async (ctx) => {
      const text = ctx.message.text;
      if (text.startsWith('/')) return;
      console.log(`[Telegram] Received from ${ctx.from?.first_name || 'User'}: ${text}`);
      await ctx.replyWithChatAction('typing').catch(() => {});

      const threadId = ctx.message.message_thread_id ? `_${ctx.message.message_thread_id}` : '';
      const sessionId = `telegram_${ctx.chat?.id}${threadId}`;

      if (activeTypingIntervals.has(sessionId)) {
        clearInterval(activeTypingIntervals.get(sessionId));
      }
      const typingInterval = setInterval(() => ctx.replyWithChatAction('typing').catch(() => {}), 5000);
      activeTypingIntervals.set(sessionId, typingInterval);
      
      const bubble = createStreamBubble(ctx, ctx.message.message_id);

      try {
        const response = await processUserInputStream(text, bubble.onChunk, bubble.onProgress, sessionId);
        bubble.markFinalized();
        clearInterval(typingInterval);

        let markup: any;
        if (/Reply \*\*Yes\*\*/i.test(response) && /\*\*No\*\* to cancel/i.test(response)) {
          markup = new InlineKeyboard().text('✅ Approve', 'tx_approve').text('❌ Reject', 'tx_reject');
        }
        await bubble.sendFinal(response, markup);
      } catch (error: any) {
        clearInterval(typingInterval);
        console.error('[Telegram] Error processing message:', error);
        await ctx.reply('❌ Sorry, I encountered an error while processing your message.', {
          reply_parameters: { message_id: ctx.message.message_id } as any
        }).catch(() => {});
      } finally {
        bubble.dispose();
      }
    });

    // ── Inline Keyboard Callbacks (tx_approve / tx_reject) ────────────────────
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (data !== 'tx_approve' && data !== 'tx_reject') return;

      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});

      const simulatedText = data === 'tx_approve' ? 'yes' : 'no';
      console.log(`[Telegram] User clicked ${simulatedText.toUpperCase()} via Inline Keyboard`);

      if (!ctx.chat) return;
      await ctx.replyWithChatAction('typing').catch(() => {});

      const msg = ctx.callbackQuery.message as any;
      const threadId = msg?.message_thread_id ? `_${msg.message_thread_id}` : '';
      const sessionId = `telegram_${ctx.chat.id}${threadId}`;

      if (activeTypingIntervals.has(sessionId)) {
        clearInterval(activeTypingIntervals.get(sessionId));
      }
      const typingInterval = setInterval(() => ctx.replyWithChatAction('typing').catch(() => {}), 5000);
      activeTypingIntervals.set(sessionId, typingInterval);

      const bubble = createStreamBubble(ctx);

      try {
        const response = await processUserInputStream(simulatedText, bubble.onChunk, bubble.onProgress, sessionId);
        bubble.markFinalized();
        clearInterval(typingInterval);

        let markup: any;
        if (/Reply \*\*Yes\*\*/i.test(response) && /\*\*No\*\* to cancel/i.test(response)) {
          markup = new InlineKeyboard().text('✅ Approve', 'tx_approve').text('❌ Reject', 'tx_reject');
        }
        await bubble.sendFinal(response, markup);
      } catch (error) {
        clearInterval(typingInterval);
        await ctx.reply('❌ Sorry, I encountered an error.').catch(() => {});
      } finally {
        bubble.dispose();
      }
    });

    // ── Document Messages ─────────────────────────────────────────────────────
    bot.on('message:document', async (ctx) => {
      const doc = ctx.message.document;
      const caption = ctx.message.caption || '';
      console.log(`[Telegram] Received document from ${ctx.from?.first_name || 'User'}: ${doc.file_name}`);
      await ctx.replyWithChatAction('typing');

      const sessionId = `telegram_${ctx.chat?.id}`;
      if (activeTypingIntervals.has(sessionId)) {
        clearInterval(activeTypingIntervals.get(sessionId));
      }
      const typingInterval = setInterval(() => ctx.replyWithChatAction('typing').catch(() => {}), 5000);
      activeTypingIntervals.set(sessionId, typingInterval);

      const bubble = createStreamBubble(ctx, ctx.message.message_id);

      try {
        const file = await ctx.api.getFile(doc.file_id);
        const fileLink = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        const docsDir = path.join(os.homedir(), '.nyxora', 'docs');
        if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
        const safeName = (doc.file_name || 'telegram_doc').replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const localFilePath = path.join(docsDir, `${Date.now()}-${safeName}`);
        const res = await fetch(fileLink);
        const buf = await res.arrayBuffer();
        fs.writeFileSync(localFilePath, Buffer.from(buf));

        const prompt = `Please analyze this document: ${localFilePath}\n\n${caption}`;
        const response = await processUserInputStream(prompt, bubble.onChunk, bubble.onProgress, `telegram_${ctx.chat?.id}`);
        bubble.markFinalized();
        clearInterval(typingInterval);
        await bubble.sendFinal(response);
      } catch (error: any) {
        clearInterval(typingInterval);
        console.error('[Telegram] Error processing document:', error);
        await ctx.reply('❌ Sorry, I failed to download or analyze the document.', {
          reply_parameters: { message_id: ctx.message.message_id } as any
        }).catch(() => {});
      } finally {
        bubble.dispose();
      }
    });

    // ── Photo Messages ────────────────────────────────────────────────────────
    bot.on('message:photo', async (ctx) => {
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      const caption = ctx.message.caption || 'Tolong analisa gambar ini.';
      console.log(`[Telegram] Received photo from ${ctx.from?.first_name || 'User'}`);
      await ctx.replyWithChatAction('typing');

      const sessionId = `telegram_${ctx.chat?.id}`;
      if (activeTypingIntervals.has(sessionId)) {
        clearInterval(activeTypingIntervals.get(sessionId));
      }
      const typingInterval = setInterval(() => ctx.replyWithChatAction('typing').catch(() => {}), 5000);
      activeTypingIntervals.set(sessionId, typingInterval);

      const bubble = createStreamBubble(ctx, ctx.message.message_id);

      try {
        const file = await ctx.api.getFile(photo.file_id);
        const fileLink = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        const imgDir = path.join(os.homedir(), '.nyxora', 'images');
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
        const ext = path.extname(file.file_path || '') || '.jpg';
        const localFilePath = path.join(imgDir, `telegram_photo_${Date.now()}${ext}`);
        const res = await fetch(fileLink);
        const buf = await res.arrayBuffer();
        fs.writeFileSync(localFilePath, Buffer.from(buf));

        const prompt = `${caption}\n[System Alert: An image was attached at path: ${localFilePath}. You MUST emit a standard JSON tool call for 'analyze_local_image'. DO NOT use <tool_code> or Python!]`;
        const response = await processUserInputStream(prompt, bubble.onChunk, bubble.onProgress, `telegram_${ctx.chat?.id}`);
        bubble.markFinalized();
        clearInterval(typingInterval);
        await bubble.sendFinal(response);
      } catch (error: any) {
        clearInterval(typingInterval);
        console.error('[Telegram] Error processing photo:', error);
        await ctx.reply('❌ Sorry, I failed to analyze the photo.', {
          reply_parameters: { message_id: ctx.message.message_id } as any
        }).catch(() => {});
      } finally {
        bubble.dispose();
      }
    });

    // ── Error handler ─────────────────────────────────────────────────────────
    bot.catch((err) => {
      console.error('[Telegram] Grammy error:', err);
    });

    runnerInstance = run(bot, { runner: { silent: true } });

    if (isPaired) {
      console.log('🤖 Telegram Bot is running and securely listening for your messages...');
    }

    process.once('SIGINT', () => { runnerInstance?.stop(); });
    process.once('SIGTERM', () => { runnerInstance?.stop(); });

  } catch (error) {
    console.error('[Telegram] Failed to initialize bot:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Push Notification (external calls from agent)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPushNotification(chatId: string | number, message: string, withdrawalId?: string) {
  if (!globalBotInstance) return;
  try {
    const extraParams: any = { parse_mode: 'HTML' };
    if (withdrawalId) {
      extraParams.reply_markup = new InlineKeyboard().text('✅ Approve Claim', `claim_${withdrawalId}`);
    }
    await globalBotInstance.api.sendMessage(chatId, formatToTelegramHTML(message), extraParams);
  } catch (error) {
    console.error('[Telegram] Failed to send push notification:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File Upload (called by send_telegram_file tool)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendTelegramDocument(absolutePath: string): Promise<string> {
  const cfg = loadConfig();
  const chatId = cfg.integrations?.telegram?.authorized_chat_id;
  if (!chatId) return '[Error] No authorized Telegram chat ID found. Please pair Telegram first.';
  if (!globalBotInstance) return '[Error] Telegram bot is not initialized.';
  if (!fs.existsSync(absolutePath)) return `[Error] File not found: ${absolutePath}`;

  try {
    const file = new InputFile(absolutePath);
    // Brief delay so any streaming progress message finishes before the file arrives
    await new Promise(r => setTimeout(r, 1500));
    const ext = absolutePath.toLowerCase();
    if (ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.gif') || ext.endsWith('.webp')) {
      await globalBotInstance.api.sendPhoto(chatId, file);
    } else {
      await globalBotInstance.api.sendDocument(chatId, file);
    }
    return 'Success! File has been uploaded directly to the Telegram chat. Please tell the user that the file has been successfully sent.';
  } catch (err: any) {
    return `[Error] Failed to upload document to Telegram: ${err.message}`;
  }
}
