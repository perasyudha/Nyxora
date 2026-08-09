<script lang="ts">
  import { chatStore } from '$lib/stores/chat';
  import { appState } from '$lib/stores/app';

  let input = $state('');
  let isLoading = $derived($chatStore.isLoading);
  let activeWorkspace = $derived($appState.activeWorkspace);

  let isListening = $state(false);
  let isVoiceMode = $state(false);
  let isSpeaking = $state(false);
  let cancelCurrentGeneration: (() => void) | null = $state(null);
  let recognition: any = null;
  let fileInput: HTMLInputElement;
  let pendingFiles: {name: string, path: string}[] = $state([]);
  let showActions = $state(false);

  import { onMount } from 'svelte';
  onMount(() => {
    const pending = sessionStorage.getItem('nyxora_pending_prompt');
    if (pending) {
      sessionStorage.removeItem('nyxora_pending_prompt');
      input = pending;
      setTimeout(() => handleSubmit(), 100);
    }

    const handleQuickPrompt = (e: any) => {
      if (e.detail?.prompt && !isLoading) {
        input = e.detail.prompt;
        setTimeout(() => handleSubmit(), 50);
      }
    };
    window.addEventListener('nyxora:quick-prompt', handleQuickPrompt);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        input = event.results[0][0].transcript;
        isListening = false;
        handleSubmit(); // Auto submit on voice input
      };
      recognition.onerror = () => isListening = false;
      recognition.onend = () => isListening = false;
    }

    return () => {
      window.removeEventListener('nyxora:quick-prompt', handleQuickPrompt);
    };
  });

  function initRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        input = event.results[0][0].transcript;
        isListening = false;
        handleSubmit(); // Auto submit on voice input
      };
      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        isListening = false;
      };
      recognition.onend = () => {
        isListening = false;
      };
    }
  }

  function startListening() {
    if (!recognition) {
      initRecognition();
    }
    if (!recognition) {
      alert('Speech recognition is not supported in this desktop/browser environment.');
      return;
    }
    try {
      recognition.start();
      isListening = true;
    } catch (e) {
      isListening = true;
    }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.onstart = () => isSpeaking = true;
    utterance.onend = () => {
      isSpeaking = false;
      if (isVoiceMode) startListening();
    };
    window.speechSynthesis.speak(utterance);
  }

  function toggleVoiceMode() {
    isVoiceMode = !isVoiceMode;
    if (isVoiceMode) {
      startListening();
    } else {
      try { recognition?.stop(); } catch (e) {}
      isListening = false;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      isSpeaking = false;
    }
  }

  async function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // Optimistically add to UI
    const tempId = Date.now().toString();
    pendingFiles = [...pendingFiles, { name: file.name, path: '', isUploading: true, id: tempId }];

    chatStore.setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/upload-temp', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        pendingFiles = pendingFiles.map(f => (f as any).id === tempId ? { name: file.name, path: data.filePath } : f);
      } else {
        console.error("Upload failed");
        pendingFiles = pendingFiles.filter(f => (f as any).id !== tempId);
      }
      console.error(err);
      pendingFiles = pendingFiles.filter(f => (f as any).id !== tempId);
    } finally {
      chatStore.setLoading(false);
    }
    if (fileInput) fileInput.value = '';
  }

  function adjustHeight(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 256)}px`;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  import { API_BASE_URL, getToken, apiFetch } from '$lib/utils/api';

  async function handleSubmit() {
    if ((!input.trim() && pendingFiles.length === 0) || isLoading) return;
    
    let userMsg = input.trim();
    if (pendingFiles.length > 0) {
      const attachments = pendingFiles.map(f => `[Attached File: ${f.name} (Path: ${f.path})]`).join('\n');
      userMsg = userMsg ? `${attachments}\n\n${userMsg}` : attachments;
      pendingFiles = [];
    }
    input = '';
    
    // Reset height
    const textarea = document.querySelector('textarea');
    if (textarea) textarea.style.height = 'auto';

    chatStore.setLoading(true);
    
    const tempId = `temp-${Date.now()}`;
    chatStore.addMessage({ role: 'user', content: userMsg, isOptimistic: true });
    
    const streamingId = `streaming-${Date.now()}`;
    const streamStartTime = Date.now();
    chatStore.addMessage({ role: 'assistant', content: '', id: streamingId, isStreaming: true });

    try {
      let currentSessionId = $appState.activeSessionId;
      
      if (!currentSessionId && !activeWorkspace) {
        // Create session via API (synced with dashboard)
        const title = userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : userMsg;
        try {
          const response = await apiFetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, client: 'desktop' })
          });
          const data = await response.json();
          currentSessionId = data.id;
          appState.setActiveSession(currentSessionId);
          chatStore.setSessions([
            { id: currentSessionId, title, project_id: null },
            ...$chatStore.sessions
          ]);
        } catch (err) {
          console.error('Failed to create session:', err);
          // Fallback to local session if API fails
          currentSessionId = `desktop-${Date.now()}`;
          appState.setActiveSession(currentSessionId);
          chatStore.setSessions([
            { id: currentSessionId, title, project_id: null },
            ...$chatStore.sessions
          ]);
        }
      } else if (!currentSessionId && activeWorkspace) {
        // Create project-specific session
        const title = userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : userMsg;
        try {
          const projectsRes = await apiFetch('/api/projects?client=desktop');
          const projects = await projectsRes.json();
          let project = projects.find((p: any) => p.path === activeWorkspace);
          if (!project && activeWorkspace) {
            const name = activeWorkspace.split(/[/\\]/).pop() || activeWorkspace;
            try {
              const newProjRes = await apiFetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, path: activeWorkspace, client: 'desktop' })
              });
              project = await newProjRes.json();
            } catch (e) {
              console.warn('Failed to auto-create project:', e);
            }
          }
          
          const sessionBody = project && project.id
            ? { title, project_id: project.id, client: 'desktop' }
            : { title, client: 'desktop' };

          const response = await apiFetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionBody)
          });
          const data = await response.json();
          currentSessionId = data.id;
          appState.setActiveSession(currentSessionId);
          // Include project_id so sidebar filter (s.project_id === projectId) finds this session
          chatStore.setSessions([
            { id: currentSessionId, title, project_id: project?.id ?? null },
            ...$chatStore.sessions
          ]);
        } catch (err) {
          console.error('Failed to create project session:', err);
          // Fallback to local session so the message still goes through
          currentSessionId = `desktop-${Date.now()}`;
          appState.setActiveSession(currentSessionId);
          chatStore.setSessions([
            { id: currentSessionId, title },
            ...$chatStore.sessions
          ]);
        }
      }

      const params = new URLSearchParams({
        message: userMsg,
        session_id: currentSessionId || '',
        token: getToken(),
        client: 'desktop',
      });
      if (activeWorkspace) {
        params.append('workspace', activeWorkspace);
      }

      const source = new EventSource(`${API_BASE_URL}/api/chat/stream?${params}`);
      
      let fullResponse = '';
      let renderedResponse = '';
      let previousTurnsText = '';
      let currentProgressLogs: { text: string; time: number }[] = [];
      let currentReasoning = '';
      let isSourceClosed = false;
      let intervalId: any;

      cancelCurrentGeneration = () => {
        source.close();
        isSourceClosed = true;
        clearInterval(intervalId);
        const combinedContent = previousTurnsText ? previousTurnsText + '\n\n---\n\n' + renderedResponse : renderedResponse;
        chatStore.updateMessage(streamingId, { isStreaming: false, duration_ms: Date.now() - streamStartTime, content: combinedContent + '\n\n*(Canceled)*' });
        chatStore.setLoading(false);
        cancelCurrentGeneration = null;
      };

      intervalId = setInterval(() => {
        if (renderedResponse.length < fullResponse.length) {
          const remaining = fullResponse.length - renderedResponse.length;
          const inThink = fullResponse.lastIndexOf('<think>') > fullResponse.lastIndexOf('</think>');
          const charsPerFrame = inThink ? Math.max(50, remaining) : Math.max(2, Math.ceil(remaining / 4));
          const charsToAdd = fullResponse.slice(renderedResponse.length, renderedResponse.length + charsPerFrame);
          renderedResponse += charsToAdd;
          const combinedContent = previousTurnsText ? previousTurnsText + '\n\n---\n\n' + renderedResponse : renderedResponse;
          chatStore.updateMessage(streamingId, { content: combinedContent });
        } else if (isSourceClosed) {
          clearInterval(intervalId);
          chatStore.updateMessage(streamingId, { isStreaming: false, duration_ms: Date.now() - streamStartTime });
          chatStore.setLoading(false);
          cancelCurrentGeneration = null;
          if (isVoiceMode && fullResponse) speak(fullResponse);
        }
      }, 30);

      source.onmessage = (event) => {
        if (event.data === '[DONE]') {
          source.close();
          isSourceClosed = true;
          return;
        }
        try {
          const data = JSON.parse(event.data);
          if (data.chunk) {
            let cleanChunk = data.chunk;
            if (cleanChunk.includes('[CLEAR_STREAM]')) {
              // Flush any pending animation before clearing
              renderedResponse = fullResponse;
              const combinedContent = previousTurnsText ? previousTurnsText + '\n\n---\n\n' + renderedResponse : renderedResponse;
              chatStore.updateMessage(streamingId, { content: combinedContent });
              previousTurnsText = combinedContent;
              // Now reset both buffers
              fullResponse = '';
              renderedResponse = '';
              cleanChunk = cleanChunk.split('[CLEAR_STREAM]').pop() || '';
            }
            cleanChunk = cleanChunk.replace(/\[TOOL_CALL_DETECTED\]|\[TOOL_CALL_FINISHED\]/g, '');
            if (cleanChunk) {
              fullResponse += cleanChunk;
            }
          }
          if (data.reasoning) {
            currentReasoning += data.reasoning;
            chatStore.updateMessage(streamingId, { reasoning_content: currentReasoning });
          }
          if (data.progress) {
            currentProgressLogs.push({ text: data.progress, time: Date.now() });
            chatStore.updateMessage(streamingId, { progress: data.progress, progressLogs: currentProgressLogs });
          }
          if (data.error) {
            source.close();
            isSourceClosed = true;
            chatStore.updateMessage(streamingId, { 
              content: fullResponse + `\n\n**Error:** ${data.error}`
            });
          }
        } catch (e) {
          console.error('Error parsing stream chunk', e);
        }
      };

      source.onerror = (error) => {
        source.close();
        isSourceClosed = true;
      };
    } catch (error) {
      chatStore.updateMessage(streamingId, { content: "Error connecting to backend.", isStreaming: false });
      chatStore.setLoading(false);
    }
  }
  import { Mic, Headphones, Paperclip, X, Plus } from '@lucide/svelte';
  import NyxoraLogo from './NyxoraLogo.svelte';
</script>

<div class="w-full flex-col flex { $chatStore.messages.length === 0 ? 'flex-1 items-center justify-center px-4' : 'px-4 md:px-8 max-w-4xl mx-auto mb-2 shrink-0' }">
  
  {#if $chatStore.messages.length === 0}
      <!-- Empty State Header -->
      <div class="flex items-center justify-center gap-4 mb-10 text-blue-500 dark:text-[#0a84ff]">
        <NyxoraLogo size={36} color="currentColor" />
        <div class="text-2xl font-medium">Nyxora<span class="text-blue-500 dark:text-[#0a84ff]">.</span></div>
      </div>
  {/if}

  <div class="w-full max-w-3xl transition-all duration-500">
    {#if activeWorkspace}
      <div class="mb-2 px-2 flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-[#0a84ff]">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
        Chatting in {activeWorkspace.split(/[/\\]/).pop()}
      </div>
    {/if}
    <div class="relative bg-white dark:bg-[#1d1d1f] border border-gray-200 dark:border-[#48484a] rounded-3xl shadow-sm focus-within:border-blue-500 focus-within:ring-1 ring-blue-500 transition-all flex flex-col">
      <!-- Thumbnail chips -->
      {#if pendingFiles.length > 0}
        <div class="flex flex-wrap gap-2 pt-3 px-4">
          {#each pendingFiles as file, i}
             <div class="flex items-center gap-1.5 bg-gray-100 dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#3a3a3c] rounded-xl px-2.5 py-1.5 text-xs text-gray-700 dark:text-[#e5e5ea] {(file as any).isUploading ? 'opacity-60' : ''}">
               <Paperclip size={12} class="text-gray-500" />
               <span class="max-w-[120px] truncate">{file.name}</span>
               {#if !(file as any).isUploading}
                 <button onclick={() => pendingFiles = pendingFiles.filter((_, idx) => idx !== i)} class="hover:text-red-500 ml-1"><X size={12} /></button>
               {:else}
                 <span class="ml-1 text-gray-400 animate-pulse">...</span>
               {/if}
             </div>
          {/each}
        </div>
      {/if}
      
      <!-- Live Audio Mode Indicator Banner -->
      {#if isVoiceMode || isListening || isSpeaking}
        <div class="mx-3 mt-3 px-3.5 py-2 rounded-2xl flex items-center justify-between {isSpeaking ? 'bg-purple-500/10 border border-purple-500/20 dark:border-purple-400/20' : isListening ? 'bg-red-500/10 border border-red-500/20 dark:border-red-400/20' : 'bg-blue-500/10 border border-blue-500/20 dark:border-blue-400/20'} transition-all">
          <div class="flex items-center gap-2.5">
            {#if isSpeaking}
              <div class="flex items-center gap-1">
                <span class="w-1 h-3 bg-purple-500 dark:bg-purple-400 rounded-full animate-pulse"></span>
                <span class="w-1 h-4 bg-purple-500 dark:bg-purple-400 rounded-full animate-pulse" style="animation-delay: 150ms;"></span>
                <span class="w-1 h-2.5 bg-purple-500 dark:bg-purple-400 rounded-full animate-pulse" style="animation-delay: 300ms;"></span>
              </div>
              <span class="text-xs font-medium text-purple-700 dark:text-purple-300">Nyxora is speaking...</span>
            {:else if isListening}
              <div class="relative flex h-2.5 w-2.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </div>
              <span class="text-xs font-medium text-red-600 dark:text-red-400">Listening to microphone...</span>
            {:else if isVoiceMode}
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse"></span>
                <span class="text-xs font-medium text-blue-600 dark:text-blue-400">Listen mode active</span>
              </div>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            {#if isSpeaking}
              <button
                onclick={() => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); isSpeaking = false; }}
                class="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-white/80 dark:bg-[#2c2c2e] hover:bg-white dark:hover:bg-[#3a3a3c] text-gray-700 dark:text-gray-200 border border-gray-200/60 dark:border-white/10 transition-colors"
              >
                Mute
              </button>
            {/if}
            {#if isVoiceMode}
              <button
                onclick={toggleVoiceMode}
                class="text-[11px] font-medium px-2.5 py-0.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition-colors flex items-center gap-1"
              >
                End Listen Mode
              </button>
            {:else if isListening}
              <button
                onclick={() => { try { recognition?.stop(); } catch(e){} isListening = false; }}
                class="text-[11px] font-medium px-2.5 py-0.5 rounded-lg bg-gray-200/80 dark:bg-[#2c2c2e] hover:bg-gray-300 dark:hover:bg-[#3a3a3c] text-gray-700 dark:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <div class="flex items-end w-full">
        <!-- Action Menu (Plus button) inside left -->
        <div class="pl-3 pb-2 shrink-0 relative flex items-center justify-center">
           {#if showActions}
             <!-- Click outside overlay to close -->
             <div class="fixed inset-0 z-0" onclick={() => showActions = false}></div>
             <div class="absolute bottom-12 left-0 flex flex-col gap-1 bg-white dark:bg-[#1d1d1f] border border-gray-200 dark:border-[#48484a] p-2 rounded-2xl shadow-lg z-10 w-44">
               <button onclick={() => { fileInput.click(); showActions = false; }} class="p-2.5 hover:bg-gray-100 dark:hover:bg-[#3a3a3c] rounded-xl text-gray-600 dark:text-[#e5e5ea] transition-colors flex items-center gap-3 w-full" title="Upload Document">
                 <Paperclip size={16}/>
                 <span class="text-sm font-medium">File</span>
               </button>
               <button onclick={() => { startListening(); showActions = false; }} class="p-2.5 rounded-xl transition-colors flex items-center justify-between w-full {isListening ? 'bg-red-500/15 text-red-600 dark:text-red-400 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-[#3a3a3c] text-gray-600 dark:text-[#e5e5ea]'}" title="Voice Input">
                 <div class="flex items-center gap-3">
                   <Mic size={16}/>
                   <span class="text-sm font-medium">Voice</span>
                 </div>
                 {#if isListening}
                   <span class="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-bold">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                     REC
                   </span>
                 {/if}
               </button>
               <button onclick={() => { toggleVoiceMode(); showActions = false; }} class="p-2.5 rounded-xl transition-colors flex items-center justify-between w-full {isVoiceMode ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-[#3a3a3c] text-gray-600 dark:text-[#e5e5ea]'}" title="Headphone Mode">
                 <div class="flex items-center gap-3">
                   <Headphones size={16}/>
                   <span class="text-sm font-medium">Listen</span>
                 </div>
                 {#if isVoiceMode}
                   <span class="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                     <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                     ON
                   </span>
                 {/if}
               </button>
             </div>
           {/if}
           <button onclick={() => showActions = !showActions} class="p-2 rounded-full transition-all duration-200 {showActions ? 'rotate-45 bg-gray-100 dark:bg-gray-700' : ''} {isListening ? 'text-red-500 bg-red-500/10 animate-pulse' : isVoiceMode ? 'text-blue-500 bg-blue-500/10' : 'text-gray-500 dark:text-[#e5e5ea] hover:bg-gray-100 dark:hover:bg-gray-700'}" title="More Actions"><Plus size={18}/></button>
        </div>
        
        <textarea 
          bind:value={input}
          oninput={adjustHeight}
          onkeydown={handleKeydown}
          class="w-full bg-transparent resize-none outline-none py-3.5 px-2 min-h-[52px] max-h-64 text-[15px] text-gray-900 dark:text-[#ffffff] placeholder-gray-400 scrollbar-none disabled:opacity-50" 
          placeholder={isListening ? "Listening to microphone..." : isVoiceMode ? "Listen mode active... speak or type" : "How can I help you today?"} 
          rows="1"
        ></textarea>
        
        <input type="file" bind:this={fileInput} onchange={handleFileUpload} hidden />
        
        <!-- Buttons inside right -->
        <div class="pr-3 pb-2 flex items-center gap-1 shrink-0">
          {#if isLoading && cancelCurrentGeneration}
            <button 
              onclick={() => cancelCurrentGeneration?.()}
              class="p-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full hover:opacity-80 transition-colors shadow-sm"
              title="Stop generating">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1" ry="1"/></svg>
            </button>
          {:else}
            <button 
              onclick={handleSubmit}
              disabled={isLoading || (!input.trim() && pendingFiles.length === 0)}
              class="p-2 {(input.trim() || pendingFiles.length > 0) ? 'bg-blue-500 dark:bg-[#0a84ff] text-white cursor-pointer' : 'bg-gray-100 dark:bg-[#3a3a3c] text-gray-400 dark:text-[#48484a] cursor-not-allowed'} rounded-full hover:opacity-80 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            </button>
          {/if}
        </div>
      </div>
    </div>

    {#if $chatStore.messages.length === 0}
      <!-- Suggested Prompts -->
      <div class="mt-6 flex justify-center w-full px-4">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 w-full max-w-3xl">
          <button onclick={() => input = "Show me a code snippet "} class="text-left flex flex-col items-start gap-0.5 p-3 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#3a3a3c] transition-colors opacity-80 hover:opacity-100 group">
             <div class="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-[#e5e5ea] mb-1"><span class="rotate-45 font-serif text-sm">✦</span> Suggested</div>
             <div class="font-medium text-sm text-gray-800 dark:text-[#f5f5f7]">Show me a code snippet</div>
             <div class="text-xs text-gray-500">of a website's sticky header</div>
          </button>
          <button onclick={() => input = "Help me study "} class="text-left flex flex-col items-start gap-0.5 p-3 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#3a3a3c] transition-colors opacity-80 hover:opacity-100 hidden md:flex">
             <div class="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-[#e5e5ea] mb-1 opacity-0"><span class="rotate-45 font-serif text-sm">✦</span></div>
             <div class="font-medium text-sm text-gray-800 dark:text-[#f5f5f7]">Help me study</div>
             <div class="text-xs text-gray-500">vocabulary for a college entrance exam</div>
          </button>
          <button onclick={() => input = "Overcome procrastination "} class="text-left flex flex-col items-start gap-0.5 p-3 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#3a3a3c] transition-colors opacity-80 hover:opacity-100 hidden lg:flex">
             <div class="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-[#e5e5ea] mb-1 opacity-0"><span class="rotate-45 font-serif text-sm">✦</span></div>
             <div class="font-medium text-sm text-gray-800 dark:text-[#f5f5f7]">Overcome procrastination</div>
             <div class="text-xs text-gray-500">give me tips</div>
          </button>
        </div>
      </div>
    {/if}
  </div>
  
  {#if $chatStore.messages.length > 0}
    <div class="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-2">
      Nyxora can make mistakes. Consider verifying important information.
    </div>
  {/if}
</div>
