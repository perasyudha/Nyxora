import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, loadApiKeys } from '../config/parser';
import { StreamingToolInterceptor } from '../utils/toolInterceptor';

export interface NormalizedChatRequest {
  model: string;
  messages: any[];
  tools?: any[];
  tool_choice?: 'auto' | 'none' | any;
  temperature?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  max_tokens?: number;
  reasoning_effort?: 'low' | 'medium' | 'high' | 'none' | null;
}

export interface NormalizedChatResponse {
  message: {
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: {
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }[];
  };
  usage?: {
    total_tokens: number;
  };
}

export interface LLMProvider {
  chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse>;
  stream(request: NormalizedChatRequest, onChunk: (text: string) => void, onReasoning?: (text: string) => void): Promise<NormalizedChatResponse>;
}

export function extractExecuteTool(content: string, existingToolCalls: any[]): { content: string, toolCalls: any[] } {
  let newContent = content;
  const toolCalls = [...existingToolCalls];
  
  if (newContent) {
    const executeToolMatches = newContent.match(/<execute_tool>([\s\S]*?)<\/execute_tool>/gi);
    if (executeToolMatches) {
      for (const match of executeToolMatches) {
        const innerMatch = match.match(/<execute_tool>([\s\S]*?)<\/execute_tool>/i);
        if (innerMatch && innerMatch[1]) {
          try {
            const parsed = JSON.parse(innerMatch[1].trim());
            if (parsed.tool_name) {
              toolCalls.push({
                id: `call_${Math.random().toString(36).substring(7)}`,
                type: 'function',
                function: {
                  name: parsed.tool_name,
                  arguments: JSON.stringify(parsed.tool_params || {})
                }
              });
            }
          } catch (e) {
            console.warn('[LLM] Failed to parse <execute_tool> JSON', e);
          }
        }
      }
      newContent = newContent.replace(/<execute_tool>[\s\S]*?<\/execute_tool>\n?/gi, '').trim();
    }
  }
  
  return { content: newContent, toolCalls };
}

/**
 * Detects and removes repetition loops that Gemini sometimes emits at end-of-stream.
 * Examples caught:
 *   "...your PC is healthy. your PC is healthy. your PC is healthy."
 *   "...the price of 3.5k is fair.5, the price of 3.5k is fair."
 * 
 * Strategy: We only check the tail of the string (last 400 chars) for CONSECUTIVE 
 * repeated blocks. We do NOT use global sentence tracking, as that causes false 
 * positives on perfectly valid structured data (e.g., multiple "Net Worth: $0.00" 
 * lines in a portfolio).
 */
export function deduplicateRepetitions(text: string): string {
  if (!text || text.length < 20) return text;
  let result = text;

  // Tail-repetition detector — catches Gemini's end-of-stream suffix loops
  // We check phrase lengths from 10 up to 200 characters.
  const tail = result.slice(-400); 
  for (let phraseLen = 10; phraseLen <= 200; phraseLen++) {
    if (phraseLen * 2 > tail.length) break;
    const candidate = tail.slice(-phraseLen);
    const preceding = tail.slice(-(phraseLen * 2), -phraseLen);
    
    // Normalize both: lowercase + collapse whitespace for comparison
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (norm(candidate) === norm(preceding)) {
      // Find where the first repetition starts in the original full text
      const firstOccurrenceEnd = result.length - phraseLen;
      if (firstOccurrenceEnd > 0) {
        result = result.slice(0, firstOccurrenceEnd).trimEnd();
        if (result && !/[.!?]$/.test(result)) result += '.';
      }
      break;
    }
  }

  return result;
}



function sanitizeOpenAIMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return messages;

  // Pass 1: Collect all assistant tool_call IDs and tool result IDs
  const assistantCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id) assistantCallIds.add(tc.id);
      }
    }
    if (m.role === 'tool' && m.tool_call_id) {
      toolResultIds.add(m.tool_call_id);
    }
  }

  // Pass 2: Clean and validate tool call pairing
  const sanitized = messages.map(m => {
    const clean: Record<string, any> = {
      role: m.role,
      content: m.content
    };
    if (m.name !== undefined && m.name !== null) clean.name = m.name;
    if (m.role === 'assistant' && m.reasoning_content !== undefined && m.reasoning_content !== null) {
      clean.reasoning_content = m.reasoning_content;
    }

    if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls)) {
      const validCalls = m.tool_calls.filter((tc: any) => tc?.id && toolResultIds.has(tc.id));
      if (validCalls.length > 0) {
        clean.tool_calls = validCalls;
      } else {
        if (!clean.content || clean.content === '') {
          clean.content = '[Executed external tools]';
        }
      }
    }

    if (m.role === 'tool' && m.tool_call_id) {
      if (assistantCallIds.has(m.tool_call_id)) {
        clean.tool_call_id = m.tool_call_id;
      } else {
        // Orphaned tool response — convert to user message so OpenAI does not throw 400 Bad Request
        clean.role = 'user';
        const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
        clean.content = `[Previous Tool Result (${m.name || 'tool'}): ${contentStr}]`;
        delete clean.name;
      }
    }

    return clean;
  });

  return sanitized;
}

export class OpenAIAdapter implements LLMProvider {
  constructor(private client: OpenAI) {}

  async chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse> {
    const payload = { ...request } as any;
    if (payload.messages) {
      payload.messages = sanitizeOpenAIMessages(payload.messages);
    }
    const supportsReasoningEffort = payload.model.startsWith('o1') || payload.model.startsWith('o3') || payload.model.toLowerCase().includes('gemini') || payload.model.toLowerCase().includes('think') || payload.model.toLowerCase().includes('reason') || payload.model.toLowerCase().includes('r1');
    if (payload.reasoning_effort && !supportsReasoningEffort) {
        delete payload.reasoning_effort;
    }
    // Respect user-provided penalties, default to 0 to avoid breaking structured repetitive outputs (like lists of emails with dates).
    payload.frequency_penalty = request.frequency_penalty !== undefined ? request.frequency_penalty : 0.0;
    payload.presence_penalty = request.presence_penalty !== undefined ? request.presence_penalty : 0.0;
    if (request.repetition_penalty !== undefined && request.repetition_penalty !== 1.0) {
      payload.repetition_penalty = request.repetition_penalty;
    }
    if (payload.top_p === undefined) payload.top_p = 0.95;
    // Enforce max_tokens bounds: min 256 (small models reject lower values), max 8192
    if (!payload.max_tokens || payload.max_tokens < 256) payload.max_tokens = 256;
    if (payload.max_tokens > 8192) payload.max_tokens = 8192;
    let response: any;
    try {
      response = await this.client.chat.completions.create(payload);
    } catch (e: any) {
      if (e.status === 400 && e.message && (e.message.toLowerCase().includes('exceed') || e.message.toLowerCase().includes('too long') || e.message.toLowerCase().includes('context'))) {
        console.warn(`[OpenAIAdapter] Caught 400 Context Length error: ${e.message}. Forcing aggressive payload truncation and retrying...`);
        // Duplicate the messages array so we can mutate it safely
        payload.messages = JSON.parse(JSON.stringify(payload.messages));
        
        if (payload.messages && payload.messages.length > 2) {
            // Keep system prompt (index 0) and the most recent 2 messages
            const sysMsg = payload.messages[0];
            const recentMsgs = payload.messages.slice(-2);
            payload.messages = sanitizeOpenAIMessages([sysMsg, ...recentMsgs]);
        }
        
        // Truncate strings inside remaining messages aggressively (max 4000 chars per message)
        if (payload.messages) {
            for (const m of payload.messages) {
                if (typeof m.content === 'string' && m.content.length > 4000) {
                    m.content = m.content.substring(0, 4000) + "\n\n...[TRUNCATED BY 400 AUTO-RECOVERY]";
                } else if (Array.isArray(m.content)) {
                    for (const b of m.content) {
                        if (b.type === 'text' && typeof b.text === 'string' && b.text.length > 4000) {
                            b.text = b.text.substring(0, 4000) + "\n\n...[TRUNCATED BY 400 AUTO-RECOVERY]";
                        }
                    }
                }
            }
        }
        // Retry the call
        response = await this.client.chat.completions.create(payload);
      } else {
        throw e;
      }
    }

    let content = response.choices[0].message.content || '';
    let reasoning = (response.choices[0].message as any).reasoning_content ||
                    (response.choices[0].message as any).reasoning ||
                    (response.choices[0].message as any).thought ||
                    (response.choices[0].message as any).thinking ||
                    (response.choices[0].message as any).reasoning_text ||
                    null;
    
    // Extract <thinking> tags from content if present
    const thinkingMatch = content.match(/<(think|thought|thinking|reasoning|analysis|reflection)>([\s\S]*?)<\/\1>/i);
    if (thinkingMatch) {
      reasoning = (reasoning || '') + thinkingMatch[2].trim();
      content = content.replace(/<(think|thought|thinking|reasoning|analysis|reflection)>[\s\S]*?<\/\1>\n?/i, '').trim();
    }

    let finalToolCalls = response.choices[0].message.tool_calls as any || [];
    const extracted = extractExecuteTool(content, finalToolCalls);
    content = extracted.content;
    finalToolCalls = extracted.toolCalls;

    return {
      message: {
        content: content || null,
        reasoning_content: reasoning || null,
        tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined
      },
      usage: response.usage ? { total_tokens: response.usage.total_tokens } : undefined
    };
  }

  async stream(request: NormalizedChatRequest, onChunk: (text: string) => void, onReasoning?: (text: string) => void): Promise<NormalizedChatResponse> {
    try {
      const payload = { ...request, stream: true } as any;
      if (payload.messages) {
        payload.messages = sanitizeOpenAIMessages(payload.messages);
      }
      const supportsReasoningEffort = payload.model.startsWith('o1') || payload.model.startsWith('o3') || payload.model.toLowerCase().includes('gemini') || payload.model.toLowerCase().includes('think') || payload.model.toLowerCase().includes('reason') || payload.model.toLowerCase().includes('r1');
      if (payload.reasoning_effort && !supportsReasoningEffort) {
          delete payload.reasoning_effort;
      }
      // Respect user-provided penalties, default to 0 to avoid breaking structured repetitive outputs (like lists of emails with dates).
      payload.frequency_penalty = request.frequency_penalty !== undefined ? request.frequency_penalty : 0.0;
      payload.presence_penalty = request.presence_penalty !== undefined ? request.presence_penalty : 0.0;
      if (request.repetition_penalty !== undefined && request.repetition_penalty !== 1.0) {
        payload.repetition_penalty = request.repetition_penalty;
      }
      if (payload.top_p === undefined) payload.top_p = 0.95; // Force top_p to cull low prob tokens
      // Enforce max_tokens bounds: min 256 (small models reject lower values), max 8192
      if (!payload.max_tokens || payload.max_tokens < 256) payload.max_tokens = 256;
      if (payload.max_tokens > 8192) payload.max_tokens = 8192;
      const streamRes = await this.client.chat.completions.create(payload) as any as AsyncIterable<any>;
      let fullContent = '';
      let reasoningContent = '';
      const toolCallsMap: Record<number, any> = {};
      const toolInterceptor = new StreamingToolInterceptor();

      for await (const chunk of streamRes) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          const safeText = toolInterceptor.feed(delta.content);
          if (safeText) {
            fullContent += safeText;
            onChunk(safeText);
          }
        }
        const rText = delta?.reasoning_content ||
                      (delta as any)?.reasoning ||
                      (delta as any)?.thought ||
                      (delta as any)?.thinking ||
                      (delta as any)?.reasoning_text;
        if (rText) {
          reasoningContent += rText;
          if (onReasoning) onReasoning(rText);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsMap[tc.index]) {
              toolCallsMap[tc.index] = { id: tc.id || '', type: 'function', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } };
            } else {
              if (tc.id) toolCallsMap[tc.index].id = tc.id;
              if (tc.function?.name) toolCallsMap[tc.index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCallsMap[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      }

      const flushed = toolInterceptor.flush();
      if (flushed) {
        fullContent += flushed;
        onChunk(flushed);
      }
      const interceptedTools = toolInterceptor.getExtractedTools();
      let toolIdx = Object.keys(toolCallsMap).length;
      for (const t of interceptedTools) {
        toolCallsMap[toolIdx++] = t;
      }

      const toolCalls = Object.values(toolCallsMap);
      
      // Post-process to extract <thinking> tags that were streamed as part of content
      const thinkingMatch = fullContent.match(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)<\/\1>/i);
      if (thinkingMatch) {
        reasoningContent = (reasoningContent || '') + thinkingMatch[2].trim();
        fullContent = fullContent.replace(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>[\s\S]*?<\/\1>\n?/i, '').trim();
      }

      let finalToolCalls = toolCalls;
      const extracted = extractExecuteTool(fullContent, finalToolCalls);
      fullContent = extracted.content;
      finalToolCalls = extracted.toolCalls;

      return {
        message: {
          content: fullContent || null,
          reasoning_content: reasoningContent || null,
          tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined
        }
      };
    } catch (e) {
      // Fallback to non-streaming if streaming fails
      const chatRes = await this.chat(request);
      if (chatRes.message.content) {
        onChunk('[CLEAR_STREAM]');
        onChunk(chatRes.message.content);
      }
      return chatRes;
    }
  }
}

export class AnthropicAdapter implements LLMProvider {
  constructor(private client: Anthropic) {}

  async chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse> {
    let systemPrompt = '';
    const anthropicMessages: any[] = [];
    for (const m of request.messages) {
      if (m.role === 'system') {
        systemPrompt = m.content;
        continue;
      }
      
      if (m.role === 'user') {
        anthropicMessages.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const blocks: any[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        if (m.tool_calls) {
          m.tool_calls.forEach((tc: any) => {
            try {
              blocks.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments)
              });
            } catch {}
          });
        }
        anthropicMessages.push({ role: 'assistant', content: blocks.length > 0 ? blocks : m.content });
      } else if (m.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content
            }
          ]
        });
      }
    }

    // Merge consecutive roles (Anthropic strictly requires alternating user/assistant)
    const mergedAnthropic: any[] = [];
    for (const m of anthropicMessages) {
      const last = mergedAnthropic[mergedAnthropic.length - 1];
      if (last && last.role === m.role) {
        if (Array.isArray(last.content) && Array.isArray(m.content)) {
          last.content.push(...m.content);
        } else if (typeof last.content === 'string' && typeof m.content === 'string') {
          last.content += '\n\n' + m.content;
        } else if (Array.isArray(last.content) && typeof m.content === 'string') {
          last.content.push({ type: 'text', text: m.content });
        } else if (typeof last.content === 'string' && Array.isArray(m.content)) {
          last.content = [{ type: 'text', text: last.content }, ...m.content];
        }
      } else {
        mergedAnthropic.push(m);
      }
    }

    let anthropicTools: any = undefined;
    if (request.tools) {
      anthropicTools = request.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }));
    }

    const response = await this.client.messages.create({
      model: request.model,
      system: systemPrompt,
      messages: mergedAnthropic,
      tools: anthropicTools,
      temperature: request.temperature,
      max_tokens: request.max_tokens || 4096
    });

    let contentStr = null;
    let reasoningStr = null;
    let toolCalls: any[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        contentStr = (contentStr || '') + block.text;
      } else if (block.type === 'thinking' as any) {
        reasoningStr = (reasoningStr || '') + (block as any).thinking;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    if (contentStr) {
      const thinkingMatch = contentStr.match(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)<\/\1>/i);
      if (thinkingMatch) {
        reasoningStr = (reasoningStr || '') + thinkingMatch[2].trim();
        contentStr = contentStr.replace(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>[\s\S]*?<\/\1>\n?/i, '').trim();
      }
    }

    let finalToolCalls = toolCalls;
    if (contentStr) {
      const extracted = extractExecuteTool(contentStr, finalToolCalls);
      contentStr = extracted.content;
      finalToolCalls = extracted.toolCalls;
    }

    return {
      message: {
        content: contentStr || null,
        reasoning_content: reasoningStr || null,
        tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined
      },
      usage: response.usage ? { total_tokens: response.usage.input_tokens + response.usage.output_tokens } : undefined
    };
  }

  async stream(request: NormalizedChatRequest, onChunk: (text: string) => void, onReasoning?: (text: string) => void): Promise<NormalizedChatResponse> {
    try {
      // Build the same message format as chat()
      let systemPrompt = '';
      const anthropicMessages: any[] = [];
      for (const m of request.messages) {
        if (m.role === 'system') { systemPrompt = m.content; continue; }
        if (m.role === 'user') {
          anthropicMessages.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
          const blocks: any[] = [];
          if (m.content) blocks.push({ type: 'text', text: m.content });
          if (m.tool_calls) m.tool_calls.forEach((tc: any) => {
            try { blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) }); } catch {}
          });
          anthropicMessages.push({ role: 'assistant', content: blocks.length > 0 ? blocks : m.content });
        } else if (m.role === 'tool') {
          anthropicMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }] });
        }
      }
      const mergedAnthropic: any[] = [];
      for (const m of anthropicMessages) {
        const last = mergedAnthropic[mergedAnthropic.length - 1];
        if (last && last.role === m.role) {
          if (Array.isArray(last.content) && Array.isArray(m.content)) last.content.push(...m.content);
          else if (typeof last.content === 'string' && typeof m.content === 'string') last.content += '\n\n' + m.content;
          else if (Array.isArray(last.content) && typeof m.content === 'string') last.content.push({ type: 'text', text: m.content });
          else last.content = [{ type: 'text', text: typeof last.content === 'string' ? last.content : '' }, ...m.content];
        } else { mergedAnthropic.push(m); }
      }
      let anthropicTools: any = undefined;
      if (request.tools && request.tools.length > 0) {
        anthropicTools = request.tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
      }
      const stream = this.client.messages.stream({
        model: request.model,
        system: systemPrompt,
        messages: mergedAnthropic,
        tools: anthropicTools,
        temperature: request.temperature,
        max_tokens: request.max_tokens || 4096
      });

      let fullContent = '';
      let reasoningContent = '';
      const toolCalls: any[] = [];
      const toolInterceptor = new StreamingToolInterceptor();

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const safeText = toolInterceptor.feed(event.delta.text);
          if (safeText) {
            fullContent += safeText;
            onChunk(safeText);
          }
        }
        if (event.type === 'content_block_delta' && (event.delta as any).type === 'thinking_delta') {
          const rText = (event.delta as any).thinking;
          reasoningContent += rText;
          if (onReasoning) onReasoning(rText);
        }
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          toolCalls.push({ id: event.content_block.id, type: 'function', function: { name: event.content_block.name, arguments: '' } });
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          const last = toolCalls[toolCalls.length - 1];
          if (last) last.function.arguments += event.delta.partial_json;
        }
      }

      const flushed = toolInterceptor.flush();
      if (flushed) {
        fullContent += flushed;
        onChunk(flushed);
      }
      const interceptedTools = toolInterceptor.getExtractedTools();
      for (const t of interceptedTools) {
        toolCalls.push(t);
      }

      if (fullContent) {
        const thinkingMatch = fullContent.match(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)<\/\1>/i);
        if (thinkingMatch) {
          reasoningContent = (reasoningContent || '') + thinkingMatch[2].trim();
          fullContent = fullContent.replace(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>[\s\S]*?<\/\1>\n?/i, '').trim();
        }
      }

      let finalToolCalls = toolCalls;
      if (fullContent) {
        const extracted = extractExecuteTool(fullContent, finalToolCalls);
        fullContent = extracted.content;
        finalToolCalls = extracted.toolCalls;
      }

      return { message: { content: fullContent || null, reasoning_content: reasoningContent || null, tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined } };
    } catch {
      const chatRes = await this.chat(request);
      if (chatRes.message.content) {
        onChunk('[CLEAR_STREAM]');
        onChunk(chatRes.message.content);
      }
      return chatRes;
    }
  }
}

function sanitizeGeminiParameters(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map(sanitizeGeminiParameters);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === '$id' || key === '$ref' || key === 'additionalProperties') {
      continue;
    }
    clean[key] = sanitizeGeminiParameters(value);
  }
  return clean;
}

export class GeminiAdapter implements LLMProvider {
  constructor(private apiKey: string) {}

  async chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse> {
    let systemInstruction = '';
    const contents: any[] = [];
    
    for (const m of request.messages) {
      if (m.role === 'system') {
        // Concat all system messages — do NOT overwrite.
        // If multiple system-role messages exist in history (e.g. main system prompt +
        // injected task-plan notes), the last one must NOT silently discard the first.
        systemInstruction = systemInstruction
          ? systemInstruction + '\n\n' + m.content
          : m.content;
        continue;
      }
      
      if (m.role === 'user') {
        if (Array.isArray(m.content)) {
          const parts: any[] = [];
          for (const block of m.content) {
            if (block.type === 'text') parts.push({ text: block.text });
            else if (block.type === 'image_url') {
              const bData = block.image_url.url.replace(/^data:image\/[a-z]+;base64,/, '');
              parts.push({ inlineData: { mimeType: 'image/png', data: bData } });
            }
          }
          contents.push({ role: 'user', parts });
        } else {
          contents.push({ role: 'user', parts: [{ text: m.content }] });
        }
      } else if (m.role === 'assistant') {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.tool_calls) {
          m.tool_calls.forEach((tc: any) => {
            try {
              parts.push({
                functionCall: {
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments)
                }
              });
            } catch {}
          });
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts: parts });
        }
      } else if (m.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: m.name || 'unknown_tool',
              response: { result: m.content }
            }
          }]
        });
      }
    }

    // Merge adjacent messages of the same role
    const mergedContents: any[] = [];
    for (const m of contents) {
      const last = mergedContents[mergedContents.length - 1];
      if (last && last.role === m.role) {
        last.parts.push(...m.parts);
      } else {
        mergedContents.push(m);
      }
    }

    let tools: any = undefined;
    if (request.tools && request.tools.length > 0) {
      tools = [{
        functionDeclarations: request.tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: sanitizeGeminiParameters(t.function.parameters)
        }))
      }];
    }

    const payload: any = {
      contents: mergedContents,
      generationConfig: {
        temperature: request.temperature ?? 0.4,  // lower default: reduces repetition / hallucination on simple prompts
        topP: 0.95,
        topK: 40,
        frequencyPenalty: request.frequency_penalty ?? 0.5,  // Prevent Gemini repetition loop
        presencePenalty: request.presence_penalty ?? 0.3,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }
      ]
    };

    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools) {
      payload.tools = tools;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = await response.json();

    let contentStr = null;
    let toolCalls: any[] = [];
    // reasoningContent collects Gemini thinking-model thought parts (part.thought === true)
    // as well as <think>...</think> blocks from text-only thinking models.
    let reasoningContent: string | null = null;

    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];

      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn(`[LLM] Gemini API returned finishReason: ${candidate.finishReason}`);
      }

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // Gemini thinking models mark internal reasoning with thought: true.
          // Route to reasoningContent — NEVER concat into the visible response.
          if (part.thought === true) {
            reasoningContent = (reasoningContent || '') + (part.text || '');
            continue;
          }
          if (part.text) {
            contentStr = (contentStr || '') + part.text;
          } else if (part.functionCall) {
            toolCalls.push({
              id: `call_${Math.random().toString(36).substring(7)}`,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {})
              }
            });
          }
        }
      }
    }

    let totalTokens = 0;
    if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
      totalTokens = data.usageMetadata.totalTokenCount;
    }

    // For non-thinking models that emit reasoning via <think>...</think> tags in text
    if (contentStr && !reasoningContent) {
      const thinkingMatch = contentStr.match(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)<\/\1>/i);
      if (thinkingMatch) {
        reasoningContent = thinkingMatch[2].trim();
        contentStr = contentStr.replace(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>[\s\S]*?<\/\1>\n?/i, '').trim();
      }
    }

    let finalToolCalls = toolCalls;
    if (contentStr) {
      const extracted = extractExecuteTool(contentStr, finalToolCalls);
      contentStr = extracted.content;
      finalToolCalls = extracted.toolCalls;
    }

    return {
      message: {
        content: contentStr || null,
        reasoning_content: reasoningContent || null,
        tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined
      },
      usage: totalTokens > 0 ? { total_tokens: totalTokens } : undefined
    };
  }

  async stream(request: NormalizedChatRequest, onChunk: (text: string) => void, onReasoning?: (text: string) => void): Promise<NormalizedChatResponse> {
    let systemInstruction = '';
    const contents: any[] = [];
    
    for (const m of request.messages) {
      if (m.role === 'system') {
        // Concat, do NOT overwrite — same fix as in chat()
        systemInstruction = systemInstruction
          ? systemInstruction + '\n\n' + m.content
          : m.content;
        continue;
      }
      if (m.role === 'user') {
        if (Array.isArray(m.content)) {
          const parts: any[] = [];
          for (const block of m.content) {
            if (block.type === 'text') parts.push({ text: block.text });
            else if (block.type === 'image_url') {
              const bData = block.image_url.url.replace(/^data:image\/[a-z]+;base64,/, '');
              const mimeMatch = block.image_url.url.match(/^data:(image\/[a-z]+);base64,/);
              const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
              parts.push({ inlineData: { mimeType: mime, data: bData } });
            }
          }
          contents.push({ role: 'user', parts });
        } else {
          contents.push({ role: 'user', parts: [{ text: m.content }] });
        }
      } else if (m.role === 'assistant') {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.tool_calls) {
          m.tool_calls.forEach((tc: any) => {
            try { parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) } }); } catch {}
          });
        }
        if (parts.length > 0) contents.push({ role: 'model', parts });
      } else if (m.role === 'tool') {
        contents.push({ role: 'function', parts: [{ functionResponse: { name: m.name || 'unknown_tool', response: { result: m.content } } }] });
      }
    }

    const mergedContents: any[] = [];
    for (const m of contents) {
      const last = mergedContents[mergedContents.length - 1];
      if (last && last.role === m.role) last.parts.push(...m.parts);
      else mergedContents.push(m);
    }

    let tools: any = undefined;
    if (request.tools && request.tools.length > 0) {
      tools = [{ functionDeclarations: request.tools.map(t => ({ name: t.function.name, description: t.function.description, parameters: sanitizeGeminiParameters(t.function.parameters) })) }];
    }

    const payload: any = {
      contents: mergedContents,
      generationConfig: {
        temperature: request.temperature ?? 0.4,  // lower default: reduces repetition / hallucination
        topP: 0.95,
        topK: 40,
        frequencyPenalty: request.frequency_penalty ?? 0.5,  // Prevent Gemini repetition loop
        presencePenalty: request.presence_penalty ?? 0.3,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }
      ]
    };

    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (tools) payload.tools = tools;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) return this.chat(request);

      let contentStr = '';
      const toolCalls: any[] = [];
      let totalTokens = 0;
      let reasoningContent: string | null = null;
      const toolInterceptor = new StreamingToolInterceptor();
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const data = JSON.parse(raw);
              if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];
                if (candidate.content && candidate.content.parts) {
                  for (const part of candidate.content.parts) {
                    // Gemini thinking models: route thought parts to reasoning, never to onChunk
                    if (part.thought === true) {
                      reasoningContent = (reasoningContent || '') + (part.text || '');
                      if (onReasoning && part.text) onReasoning(part.text);
                      continue;
                    }
                    if (part.text) {
                      const safeText = toolInterceptor.feed(part.text);
                      if (safeText) {
                        contentStr += safeText;
                        onChunk(safeText);
                      }
                    } else if (part.functionCall) {
                      toolCalls.push({
                        id: `call_${Math.random().toString(36).substring(7)}`,
                        type: 'function',
                        function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) }
                      });
                    }
                  }
                }
              }
              if (data.usageMetadata?.totalTokenCount) totalTokens = data.usageMetadata.totalTokenCount;
            } catch {}
          }
        }
      }

      const flushed = toolInterceptor.flush();
      if (flushed) {
        contentStr += flushed;
        onChunk(flushed);
      }
      const interceptedTools = toolInterceptor.getExtractedTools();
      for (const t of interceptedTools) {
        toolCalls.push(t);
      }

      // For non-thinking models that emit <think>...</think> in text stream
      if (contentStr && !reasoningContent) {
        const thinkingMatch = contentStr.match(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)<\/\1>/i);
        if (thinkingMatch) {
          reasoningContent = thinkingMatch[2].trim();
          contentStr = contentStr.replace(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>[\s\S]*?<\/\1>\n?/i, '').trim();
        }
      }

      let finalToolCalls = toolCalls;
      if (contentStr) {
        const extracted = extractExecuteTool(contentStr, finalToolCalls);
        contentStr = extracted.content;
        finalToolCalls = extracted.toolCalls;
      }

      // Post-process: cut off repetition loops that escaped the model-level penalty
      if (contentStr) {
        contentStr = deduplicateRepetitions(contentStr);
      }

      return {
        message: { content: contentStr || null, reasoning_content: reasoningContent || null, tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined },
        usage: totalTokens > 0 ? { total_tokens: totalTokens } : undefined
      };
    } catch {
      const chatRes = await this.chat(request);
      if (chatRes.message.content) {
        onChunk('[CLEAR_STREAM]');
        onChunk(chatRes.message.content);
      }
      return chatRes;
    }
  }
}
