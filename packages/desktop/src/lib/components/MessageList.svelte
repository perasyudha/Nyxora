<script lang="ts">
  import { chatStore } from '$lib/stores/chat';
  import StructuredMessage from './chat/StructuredMessage.svelte';
  import UserBubble from './chat/UserBubble.svelte';
  import AgentTrace from './AgentTrace.svelte';

  import { tick } from 'svelte';
  import { ArrowDown, Copy, Check } from '@lucide/svelte';

  let messages = $derived($chatStore.messages);
  let container: HTMLDivElement;
  
  let copiedMessageIndex = $state<number | null>(null);

  function copyMessage(content: string, index: number) {
    navigator.clipboard.writeText(content);
    copiedMessageIndex = index;
    setTimeout(() => {
      if (copiedMessageIndex === index) copiedMessageIndex = null;
    }, 2000);
  }
  
  let isUserScrolledUp = $state(false);
  let previousMessageCount = $state(0);
  let lastSnappedUserIndex = $state(-1);
  let isAutoScrolling = false;
  let spacerHeight = $state(0);

  function updateSpacer() {
     if (!container) return;
     const allMsgs = container.querySelectorAll('.message-fade-in');
     if (allMsgs.length === 0) {
         spacerHeight = 0;
         return;
     }
     const lastMsgEl = allMsgs[allMsgs.length - 1] as HTMLElement;
     
     let lastUserEl = null;
     for(let i = allMsgs.length - 1; i >= 0; i--) {
        if (allMsgs[i].classList.contains('items-end')) {
            lastUserEl = allMsgs[i] as HTMLElement;
            break;
        }
     }
     
     if (lastUserEl) {
         const contentBelowTop = (lastMsgEl.offsetTop + lastMsgEl.offsetHeight) - lastUserEl.offsetTop;
         const desiredMinHeight = container.clientHeight - 80;
         
         if (contentBelowTop < desiredMinHeight) {
             spacerHeight = desiredMinHeight - contentBelowTop;
         } else {
             spacerHeight = 0;
         }
     }
  }

  function handleScroll() {
    if (!container || isAutoScrolling) return;
    const threshold = 100;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    isUserScrolledUp = !isAtBottom;
  }

  function scrollToBottom() {
    if (container) {
      isAutoScrolling = true;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      isUserScrolledUp = false;
      setTimeout(() => { isAutoScrolling = false; }, 500);
    }
  }

  $effect(() => {
    // Track raw messages length to detect session changes (clear) and new messages
    const currentMsgCount = messages.length;
    const merged = mergedMessages();
    const currentMergedCount = merged.length;
    const hasStreaming = merged.some((m: any) => m.isStreaming || (m.subMessages && m.subMessages.some((sm: any) => sm.isStreaming)));

    tick().then(() => {
       updateSpacer();

       // Session switched: messages cleared → reset snap state
       if (currentMsgCount === 0 && previousMessageCount > 0) {
         lastSnappedUserIndex = -1;
         isUserScrolledUp = false;
         previousMessageCount = 0;
         return;
       }

       if (currentMergedCount > 0 && container) {
           let lastUserIndex = -1;
           for (let i = merged.length - 1; i >= 0; i--) {
             if (merged[i].role === 'user') {
               lastUserIndex = i;
               break;
             }
           }

           // New user message detected → snap to it
           if (lastUserIndex !== -1 && lastUserIndex > lastSnappedUserIndex) {
              const el = document.getElementById(`msg-${lastUserIndex}`);
              if (el) {
                 isAutoScrolling = true;
                 setTimeout(() => {
                   el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                   isUserScrolledUp = false;
                   setTimeout(() => { isAutoScrolling = false; }, 800);
                 }, 50);
                 lastSnappedUserIndex = lastUserIndex;
              }
           } else if (hasStreaming && !isUserScrolledUp && !isAutoScrolling) {
              // Stream in progress: keep scrolled to bottom
              const maxScroll = container.scrollHeight - container.clientHeight;
              if (container.scrollTop < maxScroll) {
                  container.scrollTop = maxScroll;
              }
           } else if (!hasStreaming && !isUserScrolledUp) {
              // New assistant message arrived (non-streaming): scroll to bottom
              container.scrollTop = container.scrollHeight;
           }
       }

       previousMessageCount = currentMsgCount;
    });
  });

  function hasRealText(content: string | undefined): boolean {
    if (!content) return false;
    let cleaned = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/\[TOOL_CALL_DETECTED\][\s\S]*?(\[TOOL_CALL_FINISHED\]|$)/g, '')
      .trim();
    return cleaned.length > 0;
  }

  // Merge messages with tool_calls and reasoning
  const mergedMessages = $derived(() => {
    const merged: any[] = [];
    let currentAssistantMsg: any = null;
    
    for (const m of messages) {
      if (m.role === 'user') {
        if (currentAssistantMsg) {
          merged.push(currentAssistantMsg);
          currentAssistantMsg = null;
        }
        merged.push(m);
      } else if (m.role === 'assistant') {
        if (currentAssistantMsg) {
          if (!currentAssistantMsg.subMessages) {
            currentAssistantMsg.subMessages = [{ ...currentAssistantMsg }];
          }
          const subMsgs = currentAssistantMsg.subMessages;
          const lastSub = subMsgs[subMsgs.length - 1];
          
          if (!hasRealText(m.content)) {
            if (m.tool_calls) {
              let parsedTools = m.tool_calls;
              if (typeof parsedTools === 'string') {
                try { parsedTools = JSON.parse(parsedTools); } catch { parsedTools = []; }
              }
              if (!Array.isArray(parsedTools)) parsedTools = [parsedTools];
              
              let currentTools = lastSub.tool_calls || [];
              if (typeof currentTools === 'string') {
                try { currentTools = JSON.parse(currentTools); } catch { currentTools = []; }
              }
              if (!Array.isArray(currentTools)) currentTools = [currentTools];
              
              lastSub.tool_calls = [...currentTools, ...parsedTools];
            }
            if (m.reasoning_content) {
              lastSub.reasoning_content = (lastSub.reasoning_content || '') + m.reasoning_content;
            }
            if (m.content) {
              lastSub.content = (lastSub.content || '') + '\n' + m.content;
            }
            if (m.progressLogs) {
              lastSub.progressLogs = [...(lastSub.progressLogs || []), ...m.progressLogs];
            }
            if (m.duration_ms) {
               lastSub.duration_ms = (lastSub.duration_ms || 0) + m.duration_ms;
            }
            lastSub.isStreaming = m.isStreaming;
          } else {
            subMsgs.push({ ...m });
          }
        } else {
          currentAssistantMsg = { role: 'assistant', subMessages: [{ ...m }] };
        }
      } else if (m.role === 'tool') {
        // Do not push into tool_calls again, as the assistant message already contains the tool_calls definition.
        // This prevents duplicate 'Ran tool' traces.
      }
    }
    
    if (currentAssistantMsg) {
      merged.push(currentAssistantMsg);
    }
    
    return merged;
  });
</script>

<div onscroll={handleScroll} bind:this={container} class="{messages.length > 0 ? 'flex-1 p-4 md:p-8' : 'h-0'} overflow-y-auto flex flex-col gap-6 items-center relative select-text">
  {#if mergedMessages().length > 0}
    <div class="w-full max-w-3xl mx-auto flex flex-col gap-6 relative">
      {#each mergedMessages() as msg, i}
        <div id={`msg-${i}`} class="flex flex-col gap-2 w-full {msg.role === 'user' ? 'items-end' : 'items-start'} message-fade-in group relative">
          <div class="{msg.role === 'user' ? 'max-w-[80%] relative' : 'max-w-full pt-1 w-full'}">
            {#if msg.role === 'user'}
              <UserBubble 
                content={msg.content} 
                index={i} 
                copiedMessageIndex={copiedMessageIndex} 
                onCopy={copyMessage} 
              />
            {:else}
              <StructuredMessage {msg} />
            {/if}
          </div>
        </div>
      {/each}
      
      <!-- Dynamic Spacer to ensure snap-to-top doesn't create permanent empty canvas -->
      <div style="height: {spacerHeight}px; flex-shrink: 0;"></div>
    </div>
  {/if}
  
  <!-- Scroll to Bottom Button -->
  {#if isUserScrolledUp && mergedMessages().length > 0}
    <button 
      onclick={scrollToBottom}
      class="fixed bottom-28 md:bottom-32 right-8 md:right-1/4 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-all z-50 hover:bg-gray-50 dark:hover:bg-gray-700"
      title="Scroll to bottom"
    >
      <ArrowDown size={18} />
    </button>
  {/if}
</div>
