<script lang="ts">
  import { Key, Upload, Shield, X, CheckCircle, Copy } from '@lucide/svelte';
  import { apiFetch, API_BASE_URL } from '$lib/utils/api';

  const { onClose } = $props<{ onClose: () => void }>();

  let step = $state(1);
  let isUploading = $state(false);
  let uploadSuccess = $state(false);
  let errorMsg = $state<string | null>(null);

  async function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    isUploading = true;
    errorMsg = null;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.web && !parsed.installed) {
        throw new Error('Invalid credentials format. Expected "web" or "installed" key.');
      }

      const res = await apiFetch('/api/upload-google-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: parsed })
      });

      if (!res.ok) {
        throw new Error('Failed to upload credentials to server.');
      }

      uploadSuccess = true;
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      errorMsg = err.message || 'Failed to parse JSON file.';
    } finally {
      isUploading = false;
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
</script>

<div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
  <div class="bg-white dark:bg-[#18181b] border border-gray-200 dark:border-white/10 rounded-xl w-[600px] max-w-[90%] relative overflow-hidden shadow-2xl">
    <button 
      onclick={onClose} 
      class="absolute top-4 right-4 bg-transparent border-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer p-1"
    >
      <X size={20} />
    </button>

    <div class="p-8">
      <div class="text-center mb-8">
        <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-500">
          <Shield size={24} />
        </div>
        <h2 class="text-gray-900 dark:text-white text-xl font-semibold m-0">Google Workspace Setup</h2>
        <p class="text-gray-500 dark:text-gray-400 text-sm mt-2 mb-0">
          Configure Nyxora to access your personal Gmail and Google Drive locally.
        </p>
      </div>

      <div class="flex mb-8 gap-2">
        {#each [1, 2, 3] as s}
          <div class="flex-1 h-1 rounded-full transition-colors {s <= step ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-800'}"></div>
        {/each}
      </div>

      {#if step === 1}
        <div>
          <h3 class="text-gray-900 dark:text-white font-medium mb-4">Step 1: Create a Google Cloud Project</h3>
          <ol class="text-gray-600 dark:text-gray-300 text-[0.9rem] leading-relaxed pl-5 mb-0 space-y-2">
            <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" class="text-blue-500 hover:underline">Google Cloud Console</a>.</li>
            <li>Create a new project (e.g., "Nyxora Local Agent").</li>
            <li>Navigate to <strong>APIs & Services {'>'} Library</strong>.</li>
            <li>Search for and enable the following APIs:
              <ul class="text-blue-600 dark:text-blue-400 mt-2 mb-2 list-disc pl-4 space-y-1">
                <li>Gmail API</li>
                <li>Google Calendar API</li>
                <li>Google Drive API</li>
                <li>Google Docs API</li>
                <li>Google Sheets API</li>
                <li>Google Forms API</li>
              </ul>
            </li>
          </ol>
          <div class="flex justify-end mt-8">
            <button class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors" onclick={() => step = 2}>Next Step</button>
          </div>
        </div>
      {/if}

      {#if step === 2}
        <div>
          <h3 class="text-gray-900 dark:text-white font-medium mb-4">Step 2: Configure OAuth Consent</h3>
          <ol class="text-gray-600 dark:text-gray-300 text-[0.9rem] leading-relaxed pl-5 mb-0 space-y-2">
            <li>Go to <strong>APIs & Services {'>'} OAuth consent screen</strong>.</li>
            <li>Choose <strong>External</strong> User Type.</li>
            <li>Fill in the App Information. Use the URLs provided below for the App Domain:</li>
          </ol>
          
          <div class="bg-gray-50 dark:bg-[#27272a]/50 p-4 rounded-xl border border-gray-200 dark:border-white/5 my-4">
            <div class="flex justify-between items-center mb-3">
              <span class="text-gray-500 text-sm">Privacy Policy URL:</span>
              <div class="flex items-center gap-2">
                <span class="text-gray-900 dark:text-gray-200 font-mono text-sm bg-white dark:bg-black/20 px-2 py-0.5 rounded">https://perasyudha.github.io/privacy</span>
                <button onclick={() => copyToClipboard('https://perasyudha.github.io/privacy')} class="bg-transparent border-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer p-1"><Copy size={14} /></button>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500 text-sm">Terms of Service URL:</span>
              <div class="flex items-center gap-2">
                <span class="text-gray-900 dark:text-gray-200 font-mono text-sm bg-white dark:bg-black/20 px-2 py-0.5 rounded">https://perasyudha.github.io/terms</span>
                <button onclick={() => copyToClipboard('https://perasyudha.github.io/terms')} class="bg-transparent border-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer p-1"><Copy size={14} /></button>
              </div>
            </div>
          </div>

          <ol start={4} class="text-gray-600 dark:text-gray-300 text-[0.9rem] leading-relaxed pl-5 mb-0">
            <li>Add your personal email to the <strong>Test Users</strong> list so you can bypass app verification.</li>
          </ol>

          <div class="flex justify-between mt-8">
            <button class="px-5 py-2.5 bg-transparent border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors" onclick={() => step = 1}>Back</button>
            <button class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors border-none" onclick={() => step = 3}>Next Step</button>
          </div>
        </div>
      {/if}

      {#if step === 3}
        <div>
          <h3 class="text-gray-900 dark:text-white font-medium mb-4">Step 3: Upload Credentials</h3>
          <ol class="text-gray-600 dark:text-gray-300 text-[0.9rem] leading-relaxed pl-5 mb-6 space-y-2">
            <li>Go to <strong>APIs & Services {'>'} Credentials</strong>.</li>
            <li>Click <strong>Create Credentials {'>'} OAuth client ID</strong>.</li>
            <li>Choose <strong>Desktop app</strong> (Recommended for CLI) OR <strong>Web application</strong>.</li>
            <li>If you chose Web application, under <strong>Authorized redirect URIs</strong>, add both of these URIs: 
              <ul class="mt-2 space-y-1 list-none pl-0">
                <li><code class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">{API_BASE_URL}/api/auth/google/callback</code></li>
                <li><code class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">http://localhost:50000/api/auth/google/callback</code></li>
              </ul>
            </li>
            <li>Click Download JSON and upload the file here:</li>
          </ol>

          {#if uploadSuccess}
            <div class="text-center p-8 border border-dashed border-green-500/50 rounded-xl bg-green-50 dark:bg-green-900/10">
              <CheckCircle size={32} class="text-green-500 mx-auto mb-4" />
              <h4 class="text-green-600 dark:text-green-400 m-0 text-lg font-medium">Credentials Saved!</h4>
              <p class="text-green-600/70 dark:text-green-400/70 text-sm mt-2 mb-0">You can now use Google Workspace skills.</p>
            </div>
          {:else}
            <div class="relative group">
              <input 
                type="file" 
                accept=".json"
                onchange={handleFileUpload}
                disabled={isUploading}
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div class="text-center p-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-[#27272a]/50 group-hover:border-blue-500 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-500/5 transition-all">
                <Upload size={24} class="text-gray-400 mx-auto mb-4 group-hover:text-blue-500 transition-colors" />
                <h4 class="text-gray-900 dark:text-white m-0 font-medium">{isUploading ? 'Uploading...' : 'Click or Drag JSON File'}</h4>
                <p class="text-gray-500 text-sm mt-2 mb-0">
                  Requires <code class="bg-white dark:bg-black/20 px-1 rounded">client_id</code> and <code class="bg-white dark:bg-black/20 px-1 rounded">client_secret</code>
                </p>
              </div>
            </div>
          {/if}

          {#if errorMsg}
            <div class="text-red-500 text-sm mt-4 text-center bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-900/20">
              {errorMsg}
            </div>
          {/if}

          <div class="flex justify-between mt-8">
            <button class="px-5 py-2.5 bg-transparent border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors" onclick={() => step = 2}>Back</button>
          </div>
        </div>
      {/if}

    </div>
  </div>
</div>
