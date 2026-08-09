<script lang="ts">
  import AgentTrace from '../AgentTrace.svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { Copy, Check } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  let { msg } = $props();
  let copied = $state(false);

  function copyAllText() {
    let rawText = '';
    for (const block of allParsedBlocks) {
       rawText += block.segments.filter((s: any) => s.type === 'text').map((s: any) => s.content).join('');
    }
    navigator.clipboard.writeText(rawText);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  function fixMarkdown(text: string): string {
    let t = text;
    
    // Fix broken tables where the first data row lacks a '|'
    // Converts the header to bold text and removes the separator row
    t = t.replace(/^(\|.+?\|)\s*\n(\|\s*[-:]+[-| :]*\|)\s*\n([^|\n]+)$/gm, (match, header, sep, nextLine) => {
      let cleanHeader = header.replace(/(^\||\|$)/g, '').split('|').map(s => `**${s.trim()}**`).join(' - ');
      return `${cleanHeader}\n\n${nextLine}`;
    });

    // Fix mismatched table headers and separators (e.g. LLM outputs 3 header cols but 2 sep cols)
    t = t.replace(/^(\|.+?\|)\s*\n(\|\s*[-:]+[-| :]*\|)/gm, (match, header, sep) => {
      const headerCols = (header.match(/\|/g) || []).length - 1;
      const sepCols = (sep.match(/\|/g) || []).length - 1;
      if (headerCols > 0 && sepCols > 0 && headerCols !== sepCols) {
        let newSep = '|' + Array(Math.max(1, headerCols)).fill('---').join('|') + '|';
        return `${header}\n${newSep}`;
      }
      return match;
    });

    // Fix table rows where LLM forgot '|' before '>'
    t = t.replace(/^(\|[^\n]+\|)$/gm, (match) => {
      if (/^\|\s*[-:]+[-| :]*\|$/.test(match)) return match;
      const pipeCount = (match.match(/\|/g) || []).length;
      if (pipeCount <= 3 && match.includes('>')) {
         return match.replace(/\s*>\s*/g, ' | > ');
      }
      return match;
    });

    // Fix single-line tables or tables with mismatched separators by ensuring newlines are preserved
    t = t.replace(/(^|\n)([^|\r\n]+?)[ \t]*(\|[^\r\n]+\|)[ \t]*(?=\|[ \t]*[-:]+[-| :]*\|)/g, '$1$2\n$3');
    t = t
      .replace(/\|[ \t]*\|[ \t]*(?=[-:]+[-| :]*\|)/g, '|\n|')
      .replace(/(\|[ \t]*[-:]+[-| :]*\|)[ \t]*\|/g, '$1\n|');
    t = t.replace(/\|[ \t]*\|[ \t]*(?=[^| \t\r\n])/g, '|\n|');
    
    // Fix emoji lists by converting them to markdown lists with a hidden span for CSS targeting
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}{2})\s+(.*)/ugm;
    t = t.replace(emojiRegex, (match, emoji, rest) => {
      if (match.trim().startsWith('-') || match.trim().startsWith('*')) return match;
      return `- <span class="emoji-bullet">${emoji}</span>${rest}`;
    });

    return t;
  }

  function renderMarkdown(text: string): string {
    let cleaned = text
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, '')
      .replace(/\[TOOL_CALL_DETECTED\][\s\S]*?(\[TOOL_CALL_FINISHED\]|$)/g, '')
      .replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?|t(?:o(?:o(?:l(?:_(?:c(?:a(?:l(?:l)?)?)?)?)?)?)?)?|)$/i, '')
      .replace(/\[T(?:O(?:O(?:L(?:_(?:C(?:A(?:L(?:L(?:_(?:D(?:E(?:T(?:E(?:C(?:T(?:E(?:D)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?$/i, '')
      .trim();
    if (!cleaned) return '';
    
    cleaned = fixMarkdown(cleaned);
    
    return DOMPurify.sanitize(marked.parse(cleaned, { gfm: true, breaks: true }) as string, { ADD_ATTR: ['class'] });
  }

  function enhanceMarkdown(node: HTMLElement) {
    function apply() {
      const preBlocks = node.querySelectorAll('pre');
      preBlocks.forEach(pre => {
        if (pre.parentElement?.classList.contains('code-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper relative group my-4';
        pre.parentNode?.insertBefore(wrapper, pre);
        
        // Remove margin from pre since wrapper has it
        pre.style.margin = '0';
        wrapper.appendChild(pre);

        const btn = document.createElement('button');
        btn.className = 'copy-btn absolute top-2 right-2 px-2 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-1.5 text-[11px] font-sans shadow-sm border border-gray-300 dark:border-gray-600';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy`;
        
        btn.onclick = () => {
          const code = pre.querySelector('code')?.innerText || '';
          navigator.clipboard.writeText(code);
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
          setTimeout(() => {
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy`;
          }, 2000);
        };
        
        wrapper.appendChild(btn);
      });
    }

    apply();
    return { update: apply };
  }

  let allParsedBlocks = $derived.by(() => {
    const blocks: any[] = [];
    const msgsToProcess = (msg.subMessages && msg.subMessages.length > 0) ? msg.subMessages : [msg];
    
    for (const m of msgsToProcess) {
      const raw = m.content || '';
      const segments: any[] = [];
      let currentIndex = 0;

      while (currentIndex < raw.length) {
        const nextThinkStart = raw.indexOf('<think>', currentIndex);
        const nextToolStart1 = raw.indexOf('[TOOL_CALL_DETECTED]', currentIndex);
        const nextToolStart2 = raw.indexOf('<tool_call>', currentIndex);

        let nextToolStart = -1;
        let toolStartStr = '';
        let toolEndStr = '';

        if (nextToolStart1 !== -1 && (nextToolStart2 === -1 || nextToolStart1 < nextToolStart2)) {
          nextToolStart = nextToolStart1;
          toolStartStr = '[TOOL_CALL_DETECTED]';
          toolEndStr = '[TOOL_CALL_FINISHED]';
        } else if (nextToolStart2 !== -1) {
          nextToolStart = nextToolStart2;
          toolStartStr = '<tool_call>';
          toolEndStr = '</tool_call>';
        }

        let nextTagStart = -1;
        let tagType = '';
        let activeEndStr = '';

        if (nextThinkStart !== -1 && (nextToolStart === -1 || nextThinkStart < nextToolStart)) {
          nextTagStart = nextThinkStart;
          tagType = 'think';
          activeEndStr = '</think>';
        } else if (nextToolStart !== -1) {
          nextTagStart = nextToolStart;
          tagType = 'tool';
          activeEndStr = toolEndStr;
        }

        if (nextTagStart === -1) {
          const remaining = raw.substring(currentIndex);
          if (remaining.trim()) segments.push({ type: 'text', content: remaining });
          break;
        }

        if (nextTagStart > currentIndex) {
          const textBefore = raw.substring(currentIndex, nextTagStart);
          if (textBefore.trim()) segments.push({ type: 'text', content: textBefore });
        }

        if (tagType === 'think') {
          const thinkEndIndex = raw.indexOf(activeEndStr, nextTagStart);
          if (thinkEndIndex !== -1) {
            const content = raw.substring(nextTagStart + '<think>'.length, thinkEndIndex);
            segments.push({ type: 'think', content, closed: true });
            currentIndex = thinkEndIndex + activeEndStr.length;
          } else {
            const content = raw.substring(nextTagStart + '<think>'.length);
            segments.push({ type: 'think', content, closed: false });
            break;
          }
        } else if (tagType === 'tool') {
          const toolEndIndex = raw.indexOf(activeEndStr, nextTagStart);
          if (toolEndIndex !== -1) {
            const content = raw.substring(nextTagStart + toolStartStr.length, toolEndIndex);
            segments.push({ type: 'tool', content, closed: true });
            currentIndex = toolEndIndex + activeEndStr.length;
          } else {
            const content = raw.substring(nextTagStart + toolStartStr.length);
            segments.push({ type: 'tool', content, closed: false });
            break;
          }
        }
      }

      let parsedMsgTools = m.tool_calls || [];
      if (typeof parsedMsgTools === 'string') {
        try { parsedMsgTools = JSON.parse(parsedMsgTools); } catch { parsedMsgTools = []; }
      }
      if (!Array.isArray(parsedMsgTools)) parsedMsgTools = [parsedMsgTools];
      const rawToolCalls = [...parsedMsgTools];
      let reasoningContent = m.reasoning_content || '';
      const progressLogs = m.progressLogs || [];
      
      for (const seg of segments) {
        if (seg.type === 'tool') {
          try {
            const parsed = JSON.parse(seg.content);
            rawToolCalls.push({ function: { name: parsed.tool_name || parsed.function_name || 'tool' }, arguments: seg.content });
          } catch {
            rawToolCalls.push({ function: { name: 'tool' }, arguments: seg.content });
          }
        } else if (seg.type === 'think') {
          reasoningContent += (reasoningContent ? '\n\n' : '') + seg.content;
        }
      }

      const seen = new Set();
      const toolCalls = rawToolCalls.filter(tc => {
        const sig = `${tc.function?.name}:${tc.function?.arguments || tc.arguments || ''}`;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
      });

      blocks.push({
        segments,
        traceProps: { toolCalls, reasoningContent: reasoningContent.trim(), progressLogs },
        isStreaming: m.isStreaming,
        durationMs: m.duration_ms,
        hasTrace: toolCalls.length > 0 || reasoningContent.trim() !== '' || progressLogs.length > 0,
        progress: m.progress
      });
    }
    return blocks;
  });

  let isCurrentlyStreaming = $derived(
    msg.isStreaming || (allParsedBlocks.length > 0 && allParsedBlocks[allParsedBlocks.length - 1].isStreaming)
  );
  
  let showIntermediate = $state(
    msg.isStreaming || (msg.subMessages && msg.subMessages.length > 0 && msg.subMessages[msg.subMessages.length - 1].isStreaming) || false
  );

  let hasAutoHidden = false;
  $effect(() => {
    // Only auto-hide when the stream has COMPLETELY finished (last character outputted)
    if (!isCurrentlyStreaming && !hasAutoHidden) {
      const hasFinalText = finalSegments.some(s => s.content.trim().length > 0);
      if (hasFinalText) {
        hasAutoHidden = true;
        // Smooth delay before collapsing
        setTimeout(() => {
          showIntermediate = false;
        }, 300);
      }
    }
  });

  function toggleIntermediate() {
    showIntermediate = !showIntermediate;
  }

  let intermediateBlocks = $derived.by(() => {
    if (allParsedBlocks.length === 0) return [];
    
    const blocks = [];
    for (let i = 0; i < allParsedBlocks.length - 1; i++) {
      blocks.push(allParsedBlocks[i]);
    }
    
    const lastBlock = allParsedBlocks[allParsedBlocks.length - 1];
    if (lastBlock.hasTrace || (lastBlock.segments.length === 0 && lastBlock.isStreaming)) {
      blocks.push({
        ...lastBlock,
        segments: [] 
      });
    }
    
    return blocks;
  });

  let finalSegments = $derived.by(() => {
    if (allParsedBlocks.length === 0) return [];
    const lastBlock = allParsedBlocks[allParsedBlocks.length - 1];
    return lastBlock.segments.filter((s: any) => s.type === 'text');
  });

  let hasIntermediateContent = $derived(
    intermediateBlocks.some(b => b.hasTrace || b.segments.length > 0 || (b.segments.length === 0 && b.isStreaming))
  );
</script>

<div class="flex flex-col w-full group">
  {#if hasIntermediateContent}
    <div class="mb-1">
      <button onclick={toggleIntermediate} class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors font-medium">
        <svg class="transition-transform duration-200 {showIntermediate ? 'rotate-90' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        {showIntermediate ? 'Hide thought process' : 'Thought process'}
      </button>
    </div>
    
    {#if showIntermediate}
      <div transition:slide={{ duration: 500, easing: quintOut }} class="flex flex-col w-full border-l-2 border-gray-200 dark:border-gray-700 pl-4 ml-2 mb-2 overflow-hidden">
        {#each intermediateBlocks as block, bIdx}
          {#if block.hasTrace}
            <div class="mt-4 first:mt-0">
              <AgentTrace 
                toolCalls={block.traceProps.toolCalls} 
                progressLogs={block.traceProps.progressLogs}
                reasoningContent={block.traceProps.reasoningContent}
                isStreaming={block.isStreaming}
                durationMs={block.durationMs}
              />
            </div>
          {/if}

          {#if block.segments.length === 0 && block.isStreaming}
            <div class="working-indicator mt-4 first:mt-0">
              <span class="working-dots">{block.progress && block.progress.includes('tool') ? 'Working' : 'Thinking'}</span>
            </div>
          {/if}

          {#each block.segments as segment, i}
            {#if segment.type === 'text'}
              {@const isLastStreaming = block.isStreaming && i === block.segments.length - 1}
              {@const html = renderMarkdown(segment.content)}
              {#if html}
                <div use:enhanceMarkdown class="markdown-body text-gray-900 dark:text-[#f5f5f7] mt-4 first:mt-0 opacity-80 {isLastStreaming ? 'message-streaming' : ''}">
                  {@html html}
                </div>
              {/if}
            {/if}
          {/each}
        {/each}
      </div>
    {/if}
  {/if}

  {#each finalSegments as segment, i}
    {@const isLastStreaming = msg.isStreaming && i === finalSegments.length - 1}
    {@const html = renderMarkdown(segment.content)}
    {#if html}
      <div use:enhanceMarkdown class="markdown-body text-gray-900 dark:text-[#f5f5f7] {i === 0 ? (hasIntermediateContent ? 'mt-1' : 'mt-0') : 'mt-4'} {isLastStreaming ? 'message-streaming' : ''}">
        {@html html}
      </div>
    {/if}
  {/each}
  
  {#if !msg.isStreaming && allParsedBlocks.some(b => b.segments.some((s: any) => s.type === 'text'))}
    <div class="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onclick={copyAllText} class="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#1d1d1f] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" title="Copy Message">
        {#if copied}
          <Check size={14} class="text-green-500" />
        {:else}
          <Copy size={14} />
        {/if}
      </button>
    </div>
  {/if}
</div>
