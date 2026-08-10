# Changelog

All notable changes to this project will be documented in this file.

## [26.8.9]

### Ultimate Web3 Master Plan
- **Airdrop Discovery Engine (`discoveryEngine.ts`)**: Integrated with local `twitter-cli` to autonomously scan timelines of Alpha CT (Crypto Twitter) accounts, searching for "early" Web3 projects (seed rounds, incentivized testnets, points programs) without needing third-party aggregators.
- **Project Anti-Scam Scorer (`projectScorer.ts`)**: Added automated Due Diligence tools to evaluate Web3 projects based on Tier-1 VC backers (e.g. a16z, Paradigm), social proof metrics, and domain age to filter out phishing and scam airdrops.
- **Smart Contract Developer (`smartContractSkills.ts`)**: Integrated `solc` natively to compile Solidity smart contracts and `viem` to deploy them, allowing autonomous creation of smart contracts directly from prompts.
- **Bridge & Yield Optimizer (`bridgeOptimizer.ts`, `yieldOptimizer.ts`)**: Added intelligent routing to find the cheapest cross-chain bridges and highest APY staking/lending opportunities (Aave, Compound, Beefy).
- **Sybil-Resistant Airdrop Engine (`antiSybilEngine.ts`, `playbookExecutor.ts`)**: Upgraded Airdrop playbooks with advanced Route Scrambling to dynamically randomize task order, avoiding linear execution footprints. Added dynamic `useAntiSybil` parameters.
- **MEV & Arbitrage Scanner (`arbitrageEngine.ts`)**: Added capabilities to scan DEXs for spread discrepancies and simulate Flash Loan arbitrage profits.
- **Flashbots Private RPC (`flashbots.ts`)**: Implemented `send_private_transaction` to securely dispatch transactions via Flashbots and avoid front-running or sandwich attacks in the public mempool.

### Autonomous Web3 & Airdrop Hunter System
- **Virtual EIP-1193 Provider & SIWE Signing (`eip1193Provider.ts`, `siweHandler.ts`)**: Built a native EIP-1193 virtual provider (`window.ethereum` injector) for Playwright browser session automation and automated EIP-4361 Sign-In with Ethereum challenge signing directly via Nyxora Keyring Vault.
- **Dynamic Chain & Manual Testnet Manager (`chainRegistry.ts`)**: Replaced static chain dictionary with a dynamic chain registry supporting manual registration of custom testnets, RPC URLs, chain IDs, native symbols, and explorers (`register_custom_chain`).
- **Universal ABI Resolver (`abiResolver.ts`)**: Automated smart contract ABI fetching from Block Explorers (Etherscan/Basescan/Blockscout/Sourcify) and manual ABI injection (`registerManualAbi`) for unverified testnet smart contracts.
- **Custom Quest Perception Engine (`webPerceptor.ts`)**: Intercepts `fetch`/`XHR` network traffic on custom developer quest platforms, automatically discovering authentication, task verification, and reward claim API endpoints.
- **Hybrid Social Quest Automation (`socialAutomation.ts`)**: Integrated hybrid social task execution (X/Twitter, Discord, Telegram) supporting both Official API (OAuth2) and Headless Browser Session automation.
- **Airdrop Playbook DAG Generator & Executor (`playbookParser.ts`, `playbookExecutor.ts`)**: Converts natural language airdrop guides into executable Directed Acyclic Graphs (DAGs) and executes multi-step quest workflows (`execute_airdrop_playbook`).
- **Anti-Sybil Engine (`antiSybilEngine.ts`)**: Added randomized delay jitter and transaction amount randomization to mimic natural human behavior.
- **Agent Skill & Plugin Integration (`airdropSkills.ts`, `Web3WalletPlugin.ts`)**: Exposed 4 new Web3 skills (`register_custom_chain`, `sign_siwe_challenge`, `execute_social_quest`, `execute_airdrop_playbook`) to Nyxora's core Agent OS.

### Desktop UI & Streaming Fixes
- **Live Multi-Turn Trace Display (`ChatComposer.svelte`, `MessageList.svelte`)**: Fixed multi-turn agent streaming to track turn metadata (`reasoning_content`, `progressLogs`, `duration_ms`) live per turn, restoring instant "Thought process" accordion visibility without requiring a page refresh.
- **DOM Flickering & Separator Cleanup**: Cleaned up duplicate `---` separator accumulation during typewriter streaming and fixed `MessageList.svelte` to preserve `subMessages` for smooth DOM rendering.

## [26.8.6]

### 🔭 Vision & Analysis
- **Multi-Modal `analyze_local_image` Upgrade (`analyzeImage.ts`)**: Migrated from hardcoded Gemini SDK to the user-configured LLM provider via `executeWithRetry`. Now supports any OpenAI-compatible vision provider (OpenAI, Anthropic, Gemini, xAI, etc.) using the standard `image_url` message format. Added automatic content-type detection (screenshot, chart, diagram, document, photo) to inject specialized analysis instructions per content type.
- **Native PDF Analysis Skill (`analyzePdf.ts`)**: Introduced `analyze_pdf` skill wrapping the existing `extract_pymupdf.py` playbook script. Supports three modes — `text` (raw extraction), `structured` (pages + metadata), and `summary` (LLM-generated summary of extracted content). Gracefully handles encrypted and scanned PDFs, returning page count and word count metadata.
- **Chart & Diagram Analyzer (`analyzeChart.ts`, `vision.py`)**: Added `analyze_chart` skill backed by a new `POST /vision/analyze-chart` ML Engine endpoint. Returns structured data: title, axes, data points, trend direction, and natural-language key insight. Uses the configured LLM's vision capabilities — no hardcoded provider.
- **Visual Verification Loop (`verifyVisual.ts`, `vision.py`)**: Added `verify_visual_output` skill backed by `POST /vision/verify-screenshot`. Agent can autonomously screenshot → describe expected state → verify → iterate. Returns `{ matches, confidence, issues[], suggestions[] }`. Pairs naturally with the existing `computer_use` skill for full autonomous UI testing.
- **ML Engine Vision Router (`packages/ml-engine/routers/vision.py`)**: New FastAPI router registered at `/vision/*` providing chart analysis and visual verification endpoints. Uses configured LLM provider via `config.py` — no hardcoded API keys.

### 🔧 Software Engineering Upgrade
- **Autonomous Test Runner (`runTestsAndFix.ts`)**: New `run_tests_and_fix` skill that executes the project's test command, parses output (vitest, jest, pytest, cargo test), and returns a structured report: passing count, failing count, per-failure details (file, line, error). Designed as an iterative tool — LLM reads results, applies fixes via `edit_local_file`, then calls again. State tracked via `~/.nyxora/test_loop_state.json`. Max iterations configurable (default 5).
- **Migration Plan Orchestrator (`planMigration.ts`)**: New `plan_migration` skill that scans the codebase for affected files, assesses migration scope, and generates a structured step-by-step migration plan with recommended execution order, module batching, and test gates. Returns actionable plan text — execution is handled by the LLM via existing tools.
- **Software Engineering SOP Prompts (3 new cognitive skills)**:
  - `large-scale-refactor.md`: Pre-refactor checklist, batch-by-module strategy, rollback triggers, progress tracking with `todo_write`.
  - `autonomous-testing.md`: Test-fix loop strategy, flaky test detection, regression prevention, escalation rules.
  - `migration-orchestration.md`: Scope assessment, incremental migration, circular dependency handling, checkpoint + rollback strategy.
- **Cognitive Manager SOP Mappings (`cognitiveManager.ts`)**: Registered keyword triggers for all 3 new SOPs — `migrate/migration/migrasi`, `run tests/fix tests/test loop`, `large scale/bulk change/refactoring` — enabling automatic SOP injection when relevant tasks are requested.

### 🎯 Long-Horizon Task System
- **Persistent Goal Manager (`goalManager.ts`)**: Introduced `goalManager` — a JSON-backed persistent store at `~/.nyxora/goals.json` for multi-day autonomous tasks. Supports full lifecycle: `createGoal`, `advanceStep`, `updateCheckpoint`, `pauseGoal`, `resumeGoal`, `markComplete`, `markFailed`. Auto-pauses goals after 3 consecutive failures. Unlike `cronManager` (recurring schedules), `goalManager` handles one-time multi-step tasks that span days.
- **Background Goal Worker (`goalWorker.ts`)**: `startGoalWorker()` polls active goals every 5 minutes. For each due goal, resumes from last checkpoint, calls `processUserInput` with accumulated context, saves progress, then advances the step counter. Pushes Telegram notifications on step completion, milestone, and failure. Auto-starts 30 seconds after daemon boot to allow services to initialize.
- **Goal Management Skills (`goalSkills.ts`)**: Four new LLM-callable tools: `create_long_term_goal` (register a multi-step async goal), `get_goal_status` (formatted overview of all goals), `pause_goal` / `resume_goal` (lifecycle control).
- **Active Goals System Prompt Injection (`promptBuilder.ts`)**: Active goals are now injected into every system prompt turn via `getGoalSummary()`, keeping the LLM aware of ongoing long-running work without requiring the user to re-explain context.
- **Goal Worker Daemon Integration (`launcher.ts`)**: `startGoalWorker()` is now called at daemon startup, ensuring long-horizon tasks survive restarts and automatically resume from their last checkpoint.

### Bug Fixes
- **Streaming Tool Interceptor (`toolInterceptor.ts`)**: Fixed 4 critical bugs — raw JSON leak on stream end, buffer overflow inside tool block, `tool_params` type safety, and empty payload guard.
- **Telegram Tool Status Flood (`telegram.ts`)**: Fixed `onProgress` sending a new Telegram message per tool call when `Computer Use` tool runs multiple sequential actions (click, key, screenshot, etc.). Reverted to intended multi-bubble behavior while fixing the root cause.
- **Computer Use XML Parameter Leak (`osAgent.ts`)**: `getToolLabel()` was passing raw `firstArgValue` for `computer` tool which contained multiline XML-like parameter tags (`<parameter=coordinate> [100, 100]`). Fixed by: (1) reading `args.action` key directly for computer tool, (2) adding `sanitizeLabel()` helper that strips all `<parameter=...>` XML tags and collapses whitespace across all tool labels.
- **Self-Healer 5 Bugs (`selfHealer.ts`, `agentskills.ts`)**: Fixed invalid `max_tokens` field, broken `?t=` query string cache-bust (replaced with proper `require.cache` deletion), greedy first-match code block regex (now takes last/largest match), over-strict export sanity check (added `module.exports` support), and wasteful LLM calls on un-healable runtime errors (added `isHealableError()` filter).

### Installation & Distribution
- **One-Line Installer Script (`docs/public/install.sh`)**: Linux & macOS zero-warning installer via `curl`.
- **Windows Installer (`docs/public/install.ps1`)**: PowerShell installer via `winget`/Chocolatey.
- **3-Option Installation Documentation**: `npm install -g`, `curl` installer, and developer source install.

## [26.8.5]
### Features & AI Memory Enhancements
- **FTS5 SQLite Memory Search (`logger.ts`, `searchMemory.ts`)**: Upgraded the core SQLite memory database to utilize the FTS5 extension. Nyxora now automatically syncs and indexes conversational memory, allowing the AI to instantly recall past interactions and user preferences using the new `search_memory` cognitive skill.
- **Skill Curator System (`curator.ts`, `playbookManager.ts`)**: Engineered a lightweight background daemon to monitor and auto-archive idle cognitive skills (`.usage.json`), configurable directly via the Dashboard (`curator.archive_after_days`). Web3-related skills and system defaults are strictly safeguarded from archival. Added a dedicated `restore_playbook` skill so the agent can autonomously recall archived playbooks when needed.
- **Advanced Persistent Scheduler (`cronManager.ts`)**: Modernized the `cronManager` with an advanced Catch-up Window. The scheduler now persists execution timestamps (`lastRunAt`) and autonomously detects and re-executes any critical tasks that were missed while the system or daemon was powered off.

### Bug Fixes & Agent Enhancements
- **Small LLM Context Amnesia Fix (`promptBuilder.ts`)**: Removed the hardcoded `.slice(0, 5)` limit for user memory injection in the compact system prompt. Small models (≤8K context) now correctly receive 100% of explicit user instructions, strong personas, and all permanent episodic memories. To accommodate this within strict token limits without crashing, the 39KB `SUPER_DISCIPLINE` rule is now selectively deferred on small models while remaining fully active for standard/large models.
- **Silent Tools UI Cleanup (`osAgent.ts`)**: Introduced a `SILENT_TOOLS` registry for background cognitive skills (e.g., `search_memory`). These tools now execute entirely in the background without emitting `[TOOL_CALL_DETECTED]` and `[TOOL_CALL_FINISHED]` streaming markers, preventing unnecessary loading spinners on the Telegram/Web frontend when the agent is merely recalling internal memory.

## [26.8.4]
### Features & Desktop Enhancements
- **Desktop LLM Engine Parameter Parity (`LlmEngine.svelte`, `config.svelte.ts`)**: Added interactive slider controls for **Frequency Penalty** (-2.0 to 2.0), **Presence Penalty** (-2.0 to 2.0), and **Repetition Penalty** (0.0 to 2.0) to the Desktop app's LLM Engine modal, achieving full parameter parity with the Dashboard web interface.
- **Desktop Settings Dropdown Clipping Fix (`LlmEngine.svelte`, `Appearance.svelte`, `RiskPolicy.svelte`, `SecurityPrivacy.svelte`, `AgentProfile.svelte`)**: Replaced `overflow-hidden` with `overflow-visible` across settings card containers so dropdown menus (such as **Reasoning Effort** in LLM Engine) are no longer clipped or hidden when opened near the bottom of a container.
- **Unified Dropdown & Provider Icons (`Dropdown.svelte`, `LlmIcon.svelte`, `Settings.tsx`)**: Standardized dropdown component typography, alignment, and hover-states across Desktop and Dashboard, and injected visual LLM Provider Icons for enhanced visual consistency.

### Security & Dependency Maintenance
- **NPM Audit Vulnerability Remediation (`package.json`, `package-lock.json`)**: Resolved 6 moderate-to-high security vulnerabilities across core dependencies (including `brace-expansion`, `fast-uri`, `hono`, `ip-address`, `postcss`, and `undici`) by updating lockfile versions and overriding outdated `tar` package resolution. Registered trusted lifecycle scripts in `allowScripts` to maintain secure build environments.

### Documentation & Ecosystem Enhancements
- **Comprehensive Documentation Refresh & New Guides**: Added detailed documentation for Desktop CLI (`docs/cli/desktop.md`), OpenSea API v2 NFT Trading Skills (`docs/core/nft.md`), and External MCP Servers (`docs/mcp/external-servers.md`). Updated core guides across architecture, CLI, chains, Etherscan, Market Oracles, ML Engine, native skills, playbooks, dashboard, privacy, security, and sandbox instructions.
- **Local Version Increment**: Bumped Nyxora version to `v26.8.4` across all workspace packages and submodules.

## [26.8.3]
### Features & Web3 Enhancements
- **OpenSea API v2 NFT Trading & Market Oracle Integration (`getNftMarketStats.ts`, `buyNftOpensea.ts`, `listNftOpensea.ts`)**: Engineered comprehensive NFT market intelligence and trading capabilities using OpenSea API v2 across supported EVM mainnet networks (`ethereum`, `polygon`, `arbitrum`, `optimism`, `base`, `bsc`, and `robinhood`).
  - **NFT Market Oracle**: Created `get_nft_market_stats` skill in `core/src/web3/skills/getNftMarketStats.ts` to query live collection floor price, 24h volume, market cap, and owner statistics directly from OpenSea API v2 with actionable HTTP 401/403/429 guidance.
  - **Seaport NFT Purchase & Policy Guardrail**: Created `buy_nft_opensea` skill in `core/src/web3/skills/buyNftOpensea.ts` to generate official Seaport fulfillment calldata from `/api/v2/listings/fulfillment_data` and route purchases through Nyxora Policy Gate (`require_approval`).
  - **Off-chain Seaport NFT Listing & Auto-Approval**: Created `list_nft_opensea` skill in `core/src/web3/skills/listNftOpensea.ts` to prepare NFT listings, automatically checking ERC-721/ERC-1155 `isApprovedForAll` status against the official Seaport Conduit (`0x1E0049783F008A0085193E00003D00cd54003c71`) and preparing on-chain `setApprovalForAll` transactions when required.
  - **Dashboard & Desktop Market Oracles Management**: Added `opensea_key` configuration to `marketConfigManager.ts`, Gateway API (`GET/POST /api/market-keys` in `server.ts`), and OpenSea UI logo mappings in both Dashboard (`packages/dashboard/src/utils/logos.ts`) and Desktop (`packages/desktop/src/lib/utils/logos.ts`) applications.
  - **LLM System Prompt Injection & Confirmation Routing**: Injected `<nft_trading_rule>` into `promptBuilder.ts` so system prompts instruct models on NFT skill selection, updated `CRITICAL RULE 10` to enforce live tool invocation for NFT statistics, registered tools in `Web3MarketPlugin.ts` (`v1.1.0`), and added `nft`, `opensea`, and `seaport` keyword detection to `reasoning.ts` for fast conversational confirmation routing.

### Bug Fixes & Agent Enhancements
- **LLM Tool-Call Sanitization & Context Boundary Guardrails (`llmProvider.ts`, `contextSummarizer.ts`, `llmUtils.ts`)**: Enhanced `sanitizeOpenAIMessages` with a 2-pass validation algorithm that removes orphaned `tool_calls` and converts unmatched `'tool'` responses to `'user'` role messages, preventing HTTP 400 Bad Request errors (`Invalid parameter: messages with role 'tool' must be a response to a preceding message with 'tool_calls'`). Added Rule 3 to `_snapBoundary` so message slicing never splits an assistant-tool pair, and refined rate-limit detection to exclude tool-call/schema validation errors.
- **LLM Rate-Limit Reset Delay & Silent Stop Remediation (`llmUtils.ts`, `osAgent.ts`, `web3Agent.ts`)**: Enhanced `executeWithRetry` to automatically extract and obey `"reset after <N>s"` delay durations from 502/503/504 and rate-limit API errors (such as NVIDIA NIM / Nemotron timeouts). Added error-stream emission (`onChunk(errorMsg)`) inside agent streaming catch blocks so UI clients immediately receive informative rate-limit notifications instead of terminating silently after tool execution.
- **MCP Server Test Timeout Resilience (`registry.test.ts`)**: Increased the `beforeAll` hook timeout from 30s to 60s when initializing sequential-thinking and long-term-memory stdio MCP servers in test suites, preventing false-positive CI test timeouts under heavy npm/npx I/O load.
- **Local Version Increment**: Bumped Nyxora version to `v26.8.3` across all workspace packages and submodules.

## [26.8.1]
### Bug Fixes & Architecture Enhancements
- **Linux SUID Sandbox Fix for Nyxora Desktop (`bin/nyxora.mjs`, `packages/desktop/electron/main.ts`)**: Resolved a fatal Electron startup crash on Linux (`FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166`) when launching via `nyxora desktop` from unprivileged global or npx directories. Injected `--no-sandbox`, `--disable-gpu-sandbox`, and `--disable-setuid-sandbox` CLI flags and set `ELECTRON_DISABLE_SANDBOX=1` in the spawned process environment, ensuring reliable headless and desktop app execution across Linux distributions.
- **Svelte Icon Library Migration (`packages/desktop`)**: Migrated deprecated `lucide-svelte` dependency to `@lucide/svelte` across all 24 Svelte UI components and workspace configuration files (`package.json`), resolving build deprecation warnings.
- **Market Engine Resilience & Timeout Optimization (`market.py`, `getPrice.ts`, `marketAnalysis.ts`)**: Enhanced `safe_float` null/type-safety handling in the Python ML Engine and increased HTTP timeout thresholds to 35s with retry logic when querying market analysis endpoints from the core gateway, preventing premature timeouts during heavy DEX/CEX data aggregation.
- **Markdown Table Un-flattening Enhancement (`telegram.ts`, `markdownTables.ts`, `StructuredMessage.svelte`)**: Improved regex normalization for single-line table hallucinations produced by smaller models, reliably splitting joined table headers, separator rows, and data rows across Telegram HTML formatting, CLI markdown realignment, and Svelte Desktop chat rendering.
- **Centralized Service Port Architecture & Documentation Refresh (`constants.ts`, `launcher.ts`, `docs/*`)**: Centralized Core Gateway (`40000`) and ML Engine (`50000`) ports and base URLs into a shared `constants.ts` configuration module across all workspace packages, launchers, and CLI tools, and updated system architecture documentation accordingly.
- **PID Command-line Validation for Daemon Check (`bin/nyxora.mjs`)**: Added explicit `/proc/${pid}/cmdline` verification on Linux and macOS inside `isDaemonRunning()` to confirm that a live PID is actually a `node`/`nyxora` process, preventing false-positive daemon detection when operating systems recycle stale process IDs.
- **Strict Permanent Episodic Memory Pinning (`episodic.ts`)**: Updated `getPermanentMemories()` to filter strictly by `rule_type = 'permanent'`, preventing non-permanent observations from crowding core system prompt context while delegating general observations to RAG episodic recall.
- **Multi-Client Chat Session Isolation & Auto-Registration (`server.ts`, `logger.ts`, `packages/desktop`)**: Extracted `ensureSession()` in Logger to automatically register session IDs with specific client tags (`desktop`, `dashboard`, `telegram`, etc.) on stream/API initialization, and enhanced `getSessions()` / `searchSessions()` to strictly isolate desktop chat sessions and searches from web dashboard history.
- **Local Version Increment**: Bumped Nyxora version to `v26.8.1` across all workspace packages and submodules.

## [26.7.27]
### Features & UI/UX Enhancements
- **CJK & Emoji Markdown Table Realignment (`markdownTables.ts`)**: Engineered CJK/emoji-aware markdown table realignment and responsive narrow-screen vertical fallback. Full-width ideographs, emojis, and combining symbols no longer cause table column borders to drift in terminal and CLI environments.
- **Streaming Reasoning / `<think>` Block Scrubber (`thinkScrubber.ts`)**: Implemented a stateful streaming scrubber (`StreamingThinkScrubber`) to cleanly suppress `<think>`, `<reasoning>`, and `<thought>` blocks emitted by open-weight models (e.g., DeepSeek-R1, Mistral, Ollama) on CLI/Telegram while preserving collapsible reasoning cards on Dashboard and Desktop.

### Bug Fixes & Agent Enhancements
- **Strict OpenAI/NIM Message Sanitization (Mistral & Open-Weight Providers Fix)**: Resolved an API validation error (`HTTP 400: Extra inputs are not permitted`) when using Mistral models and other strict Pydantic-validated endpoints on NVIDIA NIM / OpenAI-compatible APIs. Introduced `sanitizeOpenAIMessages()` in `llmProvider.ts` to automatically strip extraneous internal database metadata properties (`session_id`, `id`, `duration_ms`) from message payloads before sending them to the provider.
- **Local Version Increment**: Bumped Nyxora version to `v26.7.27` across all workspace packages and submodules.

## [26.7.25]
### Bug Fixes & Agent Enhancements
- **Web Search Engine Integrations**: Fully implemented robust scraping backend logic for alternative engines in `searchWeb.ts`. Added native Playwright support for `puppeteer` and `browserbase` (via WebSocket CDP) to render heavy JavaScript sites, and added direct REST integration for `crawl4ai`. Updated the Dashboard UI to include a dynamic configuration field for the Crawl4AI API endpoint.
- **Dashboard Chat UI Refinements**: 
  - **Auto-Collapsible Prompts**: Long user prompts (exceeding 500 characters or 5 lines) are now automatically truncated with a sleek `max-height: 180px` constraint. Added a floating circular "Show More" / "Show Less" toggle button to keep the chat interface clean and prevent massive error logs from consuming the viewport.
  - **Textarea Resize Bug**: Fixed a classic React bug where the input textarea (`<textarea>`) remained stuck at an expanded height after sending a multi-line message. The element's height is now forcefully reset to its single-line default immediately upon submission.
- **Telegram Formatting Leak**: Added a pre-processor to `telegram.ts` to automatically strip any `<span>` UI artifacts generated by the agent (e.g. colors or highlights) before sending them to the Telegram API. This prevents raw HTML tags like `<span class="xxx">` from leaking into chat messages.
- **LLM Penalties Dashboard UI Integration**: Added UI slider controls for `frequency_penalty`, `presence_penalty`, and `repetition_penalty` in the Dashboard Models menu. Fixed an initial state hydration bug in `Models.tsx` and `Settings.tsx` where penalty configurations were ignored upon page refresh despite successfully persisting to `config.yaml`.

## [26.7.24]
### Bug Fixes & Agent Enhancements
- **Global `npm install` Crash Fix (Windows)**: Resolved a fatal installation failure for Windows users caused by native compilation of `node-pty`. Moved `node-pty` to `optionalDependencies` and added a dynamic fallback in `executeShellPTY.ts`. The agent now gracefully degrades terminal tools instead of crashing the server if C++ Build Tools are missing.
- **LLM Lost-in-the-Middle Fix**: Relocated the `SUPER_DISCIPLINE` rule to the absolute end of the prompt array in `promptBuilder.ts`. This maximizes the LLM's recency bias and drastically reduces output format hallucinations during long context sessions.
- **Dashboard UI Layout & Markdown Fixes**: Addressed major layout breaks in the Web Dashboard caused by LLM Markdown hallucinations. Implemented strict CSS overrides (`white-space: pre-wrap !important`, `word-break: break-all`) within `.markdown-body pre code` to constrain overflowing code fences and prevent horizontal scrollbar explosions.
- **Strict Code Block & Markdown Layout Rules**: Injected absolute rules into the system prompt strictly forbidding the LLM from using 4-space indentation for code, enforcing isolated triple-backtick fences (\`\`\`bash) on separate lines, and completely banning Markdown tables for email lists to ensure flawless UI rendering.
- **Security Policy Enforcement Engine**: Engineered the `SecurityGate` interceptor within the core plugin registry to natively enforce guardrails defined via the React UI.
- **Real-time Web3 Blacklist**: The agent engine now actively monitors transaction parameters against `blacklisted_addresses`. Any DeFi or transfer action targeting a blacklisted address is instantaneously blocked before broadcasting.
- **Shell Execution Guardrail**: OS Terminal tools now rigorously respect the `auto_approve_shell` flag. When toggled OFF, the interceptor forces the LLM to halt execution, explicitly seek human permission in the chat, and waits for a "yes" approval before granting system access.
- **Web3 Auto-Approve Pipeline**: Refactored the `transfer.ts`, `swapToken.ts`, and `bridgeToken.ts` tools to fully honor `require_approval: false`. Approved transaction intents now bypass the `confirmPendingTx` wait queue and execute autonomously end-to-end.

## [26.7.23]
### Dashboard Features & UI
- **System & Maintenance Module**: Engineered the `System.tsx` component from scratch. The interface now features a sleek, edge-to-edge stacked row list design, completely abandoning the legacy card-based layout for a more professional, native application feel.
- **Native System Operations**: Implemented deep integration between the React frontend and the Node.js daemon. Users can now natively trigger **Restart Server**, **Shutdown Server**, and **Clear System Cache** directly from the UI without touching the CLI.
- **OS Autostart Controller**: Introduced a cross-platform Auto-Start toggle in the dashboard. The system dynamically queries and manages `.desktop` (Linux) and `.plist` (macOS) configurations via `GET/POST /api/system/autostart`.
- **Wallet Balances Fix**: Resolved a data mapping issue in `Wallets.tsx`. The component now correctly utilizes `viem`'s `formatUnits` combined with backend `decimals` and `priceUsd` to flawlessly compute and render real-time fiat values for multi-chain assets. Added a functional Refresh button to sync the latest portfolio states.
- **Minimalist Aesthetic**: Purged redundant icons/emojis across the System settings to achieve a clean, text-heavy minimalist aesthetic, reserving visual icons strictly for the page header and footer.

### Bug Fixes & Agent Enhancements
- **Windows CLI Spawn Fix (Critical)**: Resolved a major UX issue for global Windows users where running `nyxora start` would rapidly spawn multiple visible `cmd.exe` and `node.exe` console windows. Implemented `windowsHide: true` across all detached daemon spawns and Cloudflared sub-processes in `nyxora.mjs` and `launcher.ts`, ensuring Nyxora boots perfectly in headless mode on Windows without spamming the user's desktop.
- **Windows CLI Stop/Restart Fix**: Fixed a critical crash where `nyxora stop` and `nyxora restart` failed on Windows systems. Switched process termination from POSIX-only `-pid` (Process Group Signal) to native Windows `taskkill /pid <PID> /t /f` via `spawnSync`, ensuring all daemon and microservice child processes (like Python ML Engine) are cleanly forcefully terminated without leaving zombie processes.
- **Smart Anti-Loop Breaker V2.0**: Completely overhauled the agent's anti-loop safety mechanism. Removed rigid hard-limits on specific tool usage (e.g. `write_local_file`) to allow unconstrained complex coding sessions. Replaced it with an intelligent "Soft Warning" system that injects a self-reflection prompt into the LLM's context every 5 repetitions, allowing the AI to organically realize if it's hallucinating and ask the user for help. Also increased global `MAX_TURNS` from 30 to 50 for extended autonomous workflows.
- **Auto-Scroll Chat Snap Fix**: Resolved a Dashboard UI glitch where LLM text streaming would scroll the container to the top instead of the bottom. Fixed ResizeObserver spacer calculation timing and exact layout recalculation bounds, ensuring smooth and flawless chat autoscrolling identical to the Desktop app.
## [26.7.22]
### Bug Fixes & Monorepo Enhancements
- **Global `npm install` Crash Fix (Critical Fix)**: Resolved a severe issue where `nyxora start` would crash immediately after global installation (`npm install -g nyxora`) due to missing dependencies. All required workspace dependencies (e.g., `systeminformation`, messaging bot SDKs) have now been synced and hoisted to the root `package.json`, ensuring the background daemon can boot properly for global users without throwing `Cannot find module` errors.
- **Dependency Overrides Synchronization**: Fixed dependency conflict warnings during installation by aligning `lodash-es` and `undici` versions with the root workspace `overrides`.

## [26.7.21]
### Dashboard Features & UI
- **Control Panel Expansion**: Engineered 4 brand new native dashboard menus (`Memory`, `Security`, `Wallets`, `Workflows`) transforming the dashboard into a full-fledged agent control panel.
- **Backend API Integration**: Fully connected the new UI to real-time Nyxora Core APIs. The interface now dynamically fetches and manages state for episodic memory (`/api/memory`), security policies (`/api/policy`), EVM wallet and multi-chain portfolio (`/api/wallet`, `/api/portfolio`), and automated playbooks (`/api/playbooks`).
- **Global Localization**: Ensured all new dashboard components are strictly in English to support the global user base natively.
- **Design System Consistency**: Applied the modern, unified `overview-container` styling across all new pages, featuring consistent glassmorphism effects, responsive card grids, and proper token alignments. Unified the toggle switch design in `Workflows.tsx` to match the custom iOS-style pill toggle used across other menus (e.g., `Skills.tsx`).
- **Playbook Editor (CRUD)**: Implemented full CRUD capabilities in the Workflows menu. Users can now directly create, edit, toggle, and delete scenarios via an integrated Markdown editor modal, with automatic local saving to `~/.nyxora/playbooks/`.
- **Memory Document RAG Upload**: Upgraded the Memory UI with a document upload feature. Connected the Node.js gateway to Python ML Engine's new `/memory/document` RAG endpoint, allowing seamless PDF/TXT/MD file chunking and vectorization using `pypdf`.
- **Wallet Security Enhancement**: Completely removed the raw Private Key display and toggle component from the Wallets UI to ensure maximum operational security.
- **Bug Fix**: Resolved a critical render crash in `Workflows.tsx` caused by a missing lucide-react import (`RefreshCw`), and cleaned up obsolete Episodic Memory fetch logic from the Logs menu.

### AI Memory & RAG Engine
- **Native Document Ingestion**: Introduced a new `/document` endpoint in the Python ML Engine. The system now autonomously parses, chunks, and vectorizes user-uploaded documents (PDF, TXT, MD) utilizing Langchain (`PyPDFLoader`, `RecursiveCharacterTextSplitter`).
- **Episodic Memory Sync**: Ingested document chunks are strictly categorized as `DOCUMENT` and seamlessly synchronized into both the SQLite episodic database and the local ChromaDB vector store for instant RAG retrieval.

### Desktop & Dashboard UI
- **Sidebar State Fix**: Resolved a visual bug in the SvelteKit Desktop app where active chat sessions remained highlighted even while the global Search modal was open.
- **Dashboard Cleanup**: Removed deprecated components (e.g., `DefiKeys.tsx`) and optimized settings panels across the React dashboard.

## [26.7.20]
### Desktop App MVP: UI/UX & Architecture Overhaul
- **Premium Interface Scaling**: Completely redesigned the Settings modal dimensions for desktop viewing. Expanded the modal wrapper to `w-[92vw]` with a maximum width of `1400px`, and removed legacy mobile constraints (`max-w-3xl`) from all submenu components (Agent Profile, LLM Engine, etc.) to utilize the full horizontal workspace natively.
- **Scroll Hierarchy Fixes**: Resolved a severe UX issue where scrolling inside long submenus (like Playbooks) would scroll the entire modal out of view. Enforced a strict height constraint (`h-[72vh]`) and `min-h-0` on inner containers, allowing localized, independent scrolling within the content pane.
- **Svelte 5 Reactivity Migration**: Refactored legacy Svelte 4 `<svelte:component>` dynamic imports within `SettingsModal.svelte`. Replaced them with modern Svelte 5 `{@const}` tags to eliminate compile-time deprecation warnings and ensure full compatibility with the new Runes architecture.
- **Asset Pipeline Synchronization**: Fixed pervasive `404 Not Found` errors for network/router icons (1inch, LiFi, CoinGecko, 0x) in the Desktop app by properly synchronizing the `public/routers/` directory from the Dashboard into the Desktop's `static/routers/` distribution folder.

### Desktop App MVP: Core Features Porting
- **Voice Mode & File Upload**: Successfully ported Dashboard Web features to the SvelteKit Desktop app. The chat composer now fully supports **Voice Mode** (via Web Speech API for TTS/STT) and **File Upload** (document analysis via `/api/upload`).
- **Advanced Risk Policies**: Integrated missing risk settings into the Desktop `Risk & Policy` menu, including **Daily Spend Limit**, **Strictly Avoid Memecoins** toggle, and **Allowed Contracts Whitelist**.
- **Auto-Lock Session (Idle Timeout)**: Added global idle timeout protection to the Desktop app. Users can configure auto-lock (15, 30, or 60 minutes) in `Security & Privacy`. Once locked, a glassmorphism overlay blocks the UI until authorized via the terminal (`nyxora unlock`).

### Desktop Bug Fixes & Semantic Alignment
- **Settings Auto-Save Illusion (Critical Fix)**: Fixed a severe UX logic flaw where settings were retained in memory even if the user cancelled/closed the modal. Introduced an explicit **Save Configuration** and **Cancel** button mechanism. The settings modal now safely fetches a fresh configuration state from the backend upon closing, guaranteeing that unsaved edits are flawlessly discarded.
- **Semantic Text Refinement**: Updated Desktop wording in the Security tab from "Dashboard Access" to "App Access" to accurately reflect the native application environment.

### Frontend Architecture & Core Refactoring
- **SvelteKit Migration (Desktop)**: Overhauled the native desktop interface by migrating from React to SvelteKit. Unified the component design system under `packages/desktop/src/lib/components`.
- **State Management**: Upgraded from React hooks to native Svelte Stores (`stores/app.ts`, `stores/wallet.ts`) for seamless state propagation.
- **Core Integrations**: Updated `osAgent.ts`, `llmProvider.ts`, and `logger.ts` to seamlessly plug into the new architectural layout.

## [26.7.19]
### Web3 & Market Intelligence
- **Super-Report & AI Financial Advisor**: Merged GoPlus Security data directly into the `analyze_market` tool to eliminate duplicate API requests. The LLM now receives a comprehensive dataset including Liquidity, 24h Volume, Pool Age, Holder Concentration (real-time from GoPlus), and smart contract security status (Honeypot, Taxes) in a single unified execution.
- **Advisor Persona Nudge**: Injected a "Sharp Crypto Financial Advisor" persona into the LLM's system note. The AI is now instructed to actively evaluate the combined fundamental and security metrics to provide concrete, strategic recommendations (e.g., Quick Flip, Hold, DCA, Avoid) rather than just passively reciting numbers.

### Agent Intelligence & Context Engine
- **Gen-AI Execution & Discipline Upgrade**: Completely overhauled `promptBuilder.ts` by injecting advanced cognitive discipline instructions (including *Execution Bias* and *Output Directives*). The AI is now significantly more proactive in utilizing tools, highly resilient to failures (*varies strategy* instead of giving up), and responds with a strict, senior-developer brevity (*anti-loop*, *anti-repetition*).
- **Date/Time Context Optimization**: Removed deprecated instructions that forced the LLM to execute a terminal command to check the current time. The system datetime context is now dynamically injected during prompt building, allowing the AI to read it instantly from memory. This saves unnecessary tool calls and reduces API quota consumption.

### Architecture & Memory Unification
- **Memory Fragmentation Cleanup**: Resolved a cross-language memory storage architectural conflict. Previously, the Node.js core wrote explicit preferences to `.nyxora/data/user.md` while the Python ML Engine wrote inferred narrative memories to `.nyxora/memory/USER.md`, creating severe overwrite risks on case-insensitive operating systems (Windows/Mac).
- **ML Engine Refactor**: Modified Python endpoints to exclusively read and write to the `data` directory. AI-generated narrative files have been systematically renamed to `narrative_user.md` and `narrative_memory.md` to cleanly separate them from explicit user profiles.
- **LLM Prompt Header Clarification**: Updated memory injection headers in the Node.js `system prompt` to be strictly descriptive (`EXPLICIT USER PREFERENCES` vs `AI INFERRED USER NARRATIVE`), eliminating LLM context confusion.

### Bug Fixes & Stability
- **Tool Loop Limit Expansion**: Increased the `MAX_TURNS` threshold in `osAgent.ts` from 10 to 30. This empowers the agent to autonomously execute significantly longer chained processes and complex coding refactors without being prematurely interrupted by system limits.
- **System Nudge UI Leak Remediation**: Prevented internal error logs from leaking into the user interface. When the LLM hallucinates or enters a prolonged *Silent Stop* that exhausts the Nudge tolerance, the agent no longer spews raw logs (`{"level":"error"}`). Instead, it gracefully intercepts the failure and returns a polite fallback response to the user.

## [26.7.18]
### NPM Global Installation Fixes
- **Drastic Installation Size Reduction**: Moved UI and Desktop build tools (`electron-builder`, `vite`, `tailwindcss`, `react`, etc.) from `dependencies` to `devDependencies` in the root `package.json`. This ensures global installations (`npm install -g nyxora`) are lightweight and fast.
- **Removed Deprecation Warnings**: By moving `electron-builder` to `devDependencies`, end-users will no longer see deprecation warnings from legacy upstream dependencies (`inflight`, `rimraf@2`, `glob@7`) during global installation.
- **Documentation Update**: Removed the `nyxora desktop` command from public CLI documentation, as this command is designed exclusively for local development and standalone distribution, not for global NPM installations.

### Core Agent Enhancements
- **Robust Context Compression**: Overhauled the context summarizer to eliminate silent API errors (HTTP 400) during long sessions. Introduced `Boundary Snapping` to guarantee that LLM tool calls and tool responses are never split during truncation. Implemented `Soft Archiving` in the SQLite `messages` table, allowing the UI to transparently render the entire conversation history while keeping the LLM context efficiently compressed.

## [26.7.17]
### NPM Global Publishing & Monorepo Enhancements
- **Global `npm install` Support**: Merged `packages/desktop` dependencies (`react`, `electron`, `vite`, etc.) into the root `package.json`. This ensures that when users run `npm install -g nyxora`, all dependencies required for the Desktop MVP are installed gracefully without causing read-only permission errors in the global directory.
- **ML Engine Auto-Setup (`postinstall`)**: Engineered `scripts/install-ml-engine.js` and hooked it into NPM's `postinstall` lifecycle. The framework now automatically spins up an isolated Python virtual environment at `~/.nyxora/ml-engine/venv` and installs all AI dependencies in the background during global installation.
- **CLI Desktop Hardening**: Stripped out the dynamic `npm install` mechanism from the `nyxora desktop` command, relying entirely on the new robust global dependency resolution to prevent `EACCES` permission errors for end-users.

## [26.7.16]
### Architecture Upgrade
- **Docker Sandbox Execution (`run_terminal_command`)**: Upgraded terminal execution tool to support an isolated environment (`envType: "docker"`). When enabled, commands run inside an ephemeral Docker container (default: `python:3.11-slim`), safely sandboxing code execution and file manipulation from the host OS.
- **Trajectory Generation (`TrajectoryLogger`)**: Implemented automated dataset generation. The agent loop now hooks into `TrajectoryLogger` to save execution histories as JSONL files (`~/.nyxora/trajectories.jsonl`). Trajectories are formatted with `<tool_call>` and `<tool_response>` tags, ready for next-gen tool-calling model fine-tuning.
- **Subagent Delegation (`delegate_subagent`)**: Empowered the core agent with the ability to recursively spawn isolated clone instances. Using the new `delegate_subagent` skill, the agent can dispatch long-running or complex tasks in parallel without polluting the main context window.
- **Terminal User Interface (TUI)**: Developed a native TUI using `blessed` for non-GUI / VPS users. Features a multi-pane layout (Chat, Active Tools, Subagents) and utilizes SSE streaming to render real-time LLM responses identically to the Web Dashboard. Launch via `nyxora tui`.

### Features & Platform Expansion
- **Nyxora Desktop MVP**: Successfully engineered and launched a native, standalone Desktop Application using Electron, Vite, and React.
  - The desktop client seamlessly mirrors the sleek aesthetic of the web dashboard while providing a native OS-level experience.
  - Introduced the new `nyxora desktop` CLI command. Running this command autonomously fetches dependencies, builds the renderer, and launches the Electron wrapper.
  - **Zero-Touch Daemon Sync**: Implemented an intelligent lifecycle manager within the Electron main process. The app autonomously bootstraps the Nyxora background daemon (`nyxora start`) upon launch and securely tears it down when closed.
  - **Race Condition & Auth Security Fix**: Engineered a robust asynchronous waiting mechanism and internal Vite proxy (`vite.config.ts`) to flawlessly synchronize the `runtime.token` injection between the backend daemon and the frontend UI, completely eradicating startup race conditions and CORS origin blocks.

### Self-Learning & Continuous Improvement
- **Proactive Tool-Iteration Trigger**: Refactored the core agent loop (`osAgent.ts`) to proactively trigger the background review engine (`ml-engine`) after every 10 tool iterations, rather than waiting for an arbitrary session end or a 3-minute idle timeout.
- **Aggressive Skill Creation**: Upgraded the `_COMBINED_REVIEW_PROMPT` in `ml-engine` to explicitly command the AI to be highly active in creating and patching skills. Frustration and user corrections are now treated as "FIRST-CLASS skill signals".
- **Deep Context Window**: Expanded the history payload sent to the background review engine from 30 messages to 100 messages, ensuring the background reviewer has the complete context of long debugging struggles.
- **UI Learning Notifications**: The core gateway now awaits the background review's execution result. When the AI successfully creates or patches a skill, a `💾 Self-improvement review` system message is automatically injected into the chat UI, providing immediate transparency that the agent is learning.
- **Persistent System Corrections**: Upgraded the Reflection Engine's schema (`reflection.ts`) to extract and permanently store `system_correction` memories. The AI now actively remembers explicit user rules regarding tool limitations or preferred workflows across all future sessions.
- **UI Tool Status Sanitization**: Fixed a visual bug where raw JSON tool arguments and execution states were leaking into the chat interface. Upgraded `getToolLabel` (`osAgent.ts`) to aggressively truncate tool outputs and provide clean status indicators.

## [26.7.15]
### Bug Fixes

#### Sudo Command Refused by LLM
- **Root Cause**: The `[SUDO & PACKAGE INSTALL STRATEGY]` section in `promptBuilder.ts` was written before `run_terminal_command_pty` existed. It told the LLM "this tool runs in a NON-INTERACTIVE shell" and instructed it to tell the user to run sudo manually — causing the LLM to refuse all sudo commands.
- **Fix (`promptBuilder.ts`)**: Rewrote the SUDO section. LLM now knows it has two terminal tools (`run_terminal_command` for non-interactive, `run_terminal_command_pty` for sudo/interactive), is instructed to ALWAYS use PTY for sudo, and is explicitly told it is "FULLY CAPABLE of running sudo commands." Password injection from `config.yaml → security.sudo_password` is handled automatically by the PTY tool.

#### LLM Output Repetition Loop
- **Root Cause**: When the LLM was corrected by the user (e.g., after giving wrong sports results), it entered an uncertain state and looped — echoing the same phrase in multiple rephrasings within a single response (e.g., "gue kabarin hasilnya kalo mau, gue kabarin hasilnya begitu selesai, gue kabarin aja kabarin aja...").
- **Fix #1 (`llmProvider.ts`)**: Added `frequency_penalty: 0.6` and `presence_penalty: 0.3` to all `OpenAIAdapter.chat()` and `.stream()` calls. These parameters suppress token-level repetition at the API level, effective for all OpenAI-compatible providers (Groq, OpenRouter, xAI, Mistral, DeepSeek, etc.).
- **Fix #2 (`promptBuilder.ts`)**: Added `[ANTI-REPETITION]` rule to the universal discipline prompt: LLM is instructed to never repeat the same phrase, clause, or sentence more than once per response — if it catches itself echoing, it must STOP immediately.

#### Search Inaccuracy / Hallucination on Factual Queries
- **Root Cause (5 bugs identified)**:
  1. Temporal keyword `"tadi"` (and others: `kemarin`, `besok`, `pagi ini`, etc.) not detected → date not injected → search engine returned mixed results from multiple years.
  2. LLM frequently ignored `depth=2` instruction in tool description → only snippets fetched → scores/data in article body never reached LLM context.
  3. No `isFactualQuery` detection → sport/news/journal queries not auto-upgraded to `depth=2`.
  4. No rule forbidding LLM from filling data gaps using training memory after an ambiguous search result.
  5. No source citation enforcement → LLM gave hallucinated facts without accountability.
- **Fix #1 (`searchWeb.ts`)**: Expanded `isTimeSensitive` detection with 15+ new Indonesian/English temporal keywords (`tadi`, `kemarin`, `besok`, `malam ini`, `pagi ini`, `sore ini`, `minggu ini`, `bulan ini`, `baru saja`, `habis`, `sudah selesai`, `yesterday`, `tomorrow`, `this week`, `recent`, `breaking`). Added proper date arithmetic for `kemarin`/`yesterday` (now−1 day) and `besok`/`tomorrow` (now+1 day).
- **Fix #2 (`searchWeb.ts`)**: Added `isFactualQuery` detector covering sports (skor, hasil, pertandingan, piala, liga, klasemen), news (berita, kejadian), journals (jurnal, penelitian, paper, studi), and finance (harga, saham, inflasi). Factual queries auto-upgrade to `effectiveDepth = Math.max(depth, 2)` regardless of LLM's depth argument.
- **Fix #3 (`searchWeb.ts`)**: Added `[SEARCH_CONFIDENCE: HIGH/MEDIUM/LOW]` signal to all search outputs. Confidence is derived from how many top-3 articles were successfully scraped. If `LOW` on a factual/temporal query, an explicit warning is injected into the tool result instructing the LLM to admit data unavailability instead of guessing.
- **Fix #4 (`promptBuilder.ts`)**: Replaced `<web_search_accuracy>` section with stronger `[GROUNDED ANSWERS ONLY]` rule: after calling `search_web`, answers must be based strictly on search results. If `[SEARCH_CONFIDENCE: LOW]` or the specific fact is absent, LLM must say "Gue belum nemu data yang spesifik dari search" — never fill gaps from training memory for 2024–2026 events.
- **Fix #5 (`promptBuilder.ts`)**: Added `[SOURCE CITATION]` enforcement: when stating any specific fact (score, result, date, statistic), LLM must include the source URL.
## [26.7.14]
### Agent Identity & Execution Discipline Overhaul
- **Semantic Intent Router Refactor (`reasoning.ts`)**: Upgraded the intent router to utilize a strict \`CLASSIFICATION MATRIX\` and Context Hierarchy Rules. This completely eradicates intent misclassification between Web3 and OS workflows, especially during context-switching.
- **Agent Identity Compression (`promptBuilder.ts`)**: Consolidated verbose \`[CRITICAL EXECUTION RULES]\` into 5 high-impact, token-efficient mandates (e.g., OUTPUT RESTRICTION, THINKING GATE, HARD HARDENING) to maximize model attention retention.
- **Strict Real-World Facts Guardrail**: Introduced mandatory \`search_web\` requirements for sports scores, schedules, and real-world news to completely eliminate LLM hallucination on dynamic data.
- **Anti-Silent Stop / Interactive Execution Flow (`promptBuilder.ts`)**: Replaced standard tool-call enforcements with \`[INTERACTIVE EXECUTION FLOW]\`. The agent is now permitted exactly one short conversational sentence before a tool call (both on success and recovery paths), but is strictly forbidden from ending its turn without attaching the corrected tool payload. This cures the "Silent Stop" / "Promise Without Action" bug while maintaining a natural, conversational UX.
- **Force Action User Correction (`osAgent.ts`)**: Refactored the User Correction Detectors to intercept scoldings with a \`[CRITICAL INTERCEPT: USER CORRECTION]\` signal. The LLM is now forced to fetch fresh ground-truth data via tools instead of endlessly apologizing and recycling stale context.

### UI/UX & Quality of Life
- **Import Project Workflow Redesign**: Relocated the "Import Project" button from the main navigation sidebar into the "Workspaces" section header. The action is now represented by an intuitive `+` icon that perfectly scales with the slightly enlarged `0.85rem` section text, achieving a significantly cleaner UI layout while keeping workspace management centralized.

### Performance — LLM Response Speed Optimization

#### Cold Start Latency Fix
- **Non-Blocking DeFi Aggregator Discovery** (`server.ts`): `aggregatorRegistry.autoDiscover()` was previously `await`-ed synchronously before `app.listen()`, blocking the entire server startup by 2–5 seconds while it probed external DeFi providers. Refactored to `setImmediate()` fire-and-forget so the server starts accepting LLM requests immediately after plugins are loaded, with provider discovery happening in the background.
- **ML Engine Fetch Timeout** (`promptBuilder.ts`): All 3 network calls to the local Python ML Engine (`/memory/rag`, `/memory/narrative`, `/skills/list`) previously had no timeout. During cold start, when the ML Engine is still booting, these calls would hang for up to 2 minutes waiting for a TCP connection. Added `AbortSignal.timeout(1500)` to each fetch — if the ML Engine is not ready, calls fail in ≤1.5s and return empty strings gracefully, keeping the first LLM response fast.

#### Per-Request Latency Optimization
- **Parallel Volatile Prompt Parts** (`promptBuilder.ts`): `buildEpisodicMemories()` and `buildNarrativeMemories()` were called sequentially (`await` one, then `await` the other). Refactored to `Promise.all([...])` — both network calls now run concurrently, saving ~300–600ms per request.
- **Parallel Narrative + Skills Fetch** (`promptBuilder.ts`): Inside `buildNarrativeMemories()`, the `/memory/narrative` and `/skills/list` fetches were also sequential. Parallelized with `Promise.all()`.
- **TTL Cache for Narrative Memory & Skills** (`promptBuilder.ts`): Added a 30-second in-memory TTL cache for narrative memory and skills list. These change only when the user explicitly saves something — re-fetching on every message was wasteful. Cache hit returns instantly with zero network overhead.
- **5-Second Build Cache** (`promptBuilder.ts`): Added a short-lived cache keyed by `agentType + userInput[:80]`. Prevents double-building the system prompt when the router warm-up and the agent's own `getSystemPrompt()` call happen within 5 seconds of each other.
- **Parallel LLM Router + System Prompt Warm-Up** (`reasoning.ts`): For messages that don't match any keyword (triggering the LLM semantic router), the router call and the OS system prompt pre-build now run **simultaneously** via `Promise.all()`. Since `'os'` is the most common fallback, its system prompt is pre-warmed into the 5s build cache while the router is deciding — making the router's latency effectively invisible to the user. Applies to both sync and stream paths.
- **Static Import for `historySanitizer`** (`osAgent.ts`, `web3Agent.ts`): Dynamic `require('../utils/historySanitizer')` inside function bodies (4 occurrences across 2 files) replaced with static ES `import` at the top of each file.

## [26.7.12]
### Features
- **TTY Support for Interactive Commands**: Introduced a new tool `run_terminal_command_pty` implemented using `node-pty` to handle interactive shell commands (like `vim`, `nano`, and REPLs). Nyxora can now automatically execute `sudo` commands by securely injecting a password from `~/.nyxora/config/config.yaml`.
- **Tool Selection Safeguards**: Implemented a defense system (Clearer Descriptions and Runtime Auto-Detection) to help the LLM choose the correct terminal tool and gracefully fail if `sudo` is used with the non-PTY tool.

### Performance
- **Context Compression Optimization**: Refactored the agent loop to move context summarization (`compressHistory`) to a one-time operation before the loop starts, reducing redundant LLM calls by up to 66% and improving response time by ~33%.

## [26.7.11]
### Bug Fixes & Stability
- **Ghost Daemon & Stale Transactions Fix**: Resolved a critical issue where the `Nyx Daemon` leaked into the interactive CLI chat due to a static top-level import in `cli.ts`. Replaced with a dynamic import to keep the CLI environment pure. Additionally, overhauled the SQLite transaction manager by introducing a 3-minute transaction timeout (previously there was no expiration), and implemented an `auto-cleanup` mechanism that forcefully purges (`failed`) all stale pending transactions upon daemon startup to prevent persistent "ghost" transaction prompts after forced system shutdowns.

## [26.7.10]
### Web3 Integrations
- **Robinhood Chain Support**: Officially integrated `Robinhood Chain` (Mainnet) and `Robinhood Testnet` support natively via `viem` `v2.55.0` upgrade. Added seamless RPC mappings, updated the dashboard network selectors with official SVG branding, and ensured high-frequency trading capabilities in the Signer remain stable.

### Core Architecture & Routing
- **Deterministic Intent Fast-Path**: Bypassed the LLM semantic router for short confirmation phrases. Messages containing global confirmation keywords (e.g., "yes", "sure", "proceed") now deterministically inherit the strict contextual boundary (`os` or `web3`) of the Assistant's previous permission request, completely eradicating routing hallucinations.
- **Global Codebase Standardization**: Refactored hardcoded regional slang from the routing logic into a comprehensive, professional English-first `CONFIRM_WORDS` array, natively supporting global users while retaining common localized confirmations as secondary fallbacks.

### Fallback Execution Engine
- **Native `<execute_bash>` Support**: Enhanced the `osAgent` and `web3Agent` Fallback Parsers to autonomously intercept and parse `<execute_bash>` and `<execute>` XML tags. This restores full execution capability for open-weight models that instinctively utilize these tags instead of strict JSON tool calls.
- **Display Sanitization Hardening**: Appended `execute_bash` and `execute` to the automated UI Sanitizer `tagsToRemove` registry. Raw bash execution blocks hallucinated by the LLM are now stripped at the edge layer before streaming to Telegram or the Dashboard.

### Web3 Signer SDK & Execution Guardrails
- **Receipt Waiter Integration (Anti-False-Positive)**: Remediated a severe "Fire-and-Forget" architectural bug in `NyxoraSigner.ts` where broadcasted transactions were immediately reported as successful to the LLM regardless of actual on-chain finality. The Signer now strictly executes a `waitForTransactionReceipt` hook (capped at a 20-second timeout). 
- **Revert Detection**: If a transaction reverts on-chain (e.g., due to strict MEV slippage or gas exhaustion), the Signer violently rejects the promise with `reverted`, preventing the AI from falsely declaring success.
- **Pending Timeout Grace**: If the blockchain experiences congestion and fails to confirm within the 20-second window, the system falls back gracefully by returning `"Transaction broadcasted (Pending receipt)"` to ensure the 30-second Policy Engine HTTP timeout is never triggered, allowing the AI to report accurate pending status.

## [26.7.9]
### Features & Architecture

- **Deep Market Analysis Upgrade**: Significantly enhanced the Python ML Engine (`market.py`) to compute a comprehensive suite of advanced technical indicators including MACD, Bollinger Bands, EMA-20, ATR-14, and OBV using live OHLCV data.
- **Smart Trend Classification**: The ML Engine now runs deterministic trend scoring (`STRONG_BULLISH` to `STRONG_BEARISH`) and generates an AI narrative summary of the market structure to prevent LLM hallucination and provide highly accurate context.
- **Anti-Blocker Data Pipeline**: Bypassed Indonesian ISP blocks (e.g., internetsehat/ICON+) that previously blocked major crypto exchange APIs (Binance, Bybit, KuCoin, OKX) by routing historical candle data through `data-api.binance.vision`.

### Refactor — Dependency & NPM Warning Cleanup

- **Removed Unused & Problematic Dependencies**: Completely uninstalled `@google/genai`, `baileys`, and `@matrix-org/matrix-sdk-crypto-nodejs` from the workspace. This fully eliminates the annoying `npm warn allow-scripts` warnings that users previously encountered when running `npm install -g nyxora` or standard `npm install`.
- **Migrated Image Analysis SDK**: Refactored `analyzeImage.ts` (Dynamic Require) to use `@google/generative-ai` (which has no install scripts) instead of the newer `@google/genai` (which triggers NPM security warnings), maintaining full Gemini 2.5 Flash compatibility.

### Bug Fix — Playbooks Missing for Global npm Users

- **Playbooks Not Distributed to Global Users (Critical Fix)**: Resolved a packaging omission where `packages/core/playbooks/` (containing 70 bundled SKILL.md playbooks) was missing from the `files[]` array in `package.json`. Global users running `npm install -g nyxora` never received any playbooks, causing `search_playbook` to always return "No playbooks available." and the system prompt to never list available skills. Fixed by adding `"packages/core/playbooks"` to the `files[]` field.

### Bug Fix — "No response generated." Crash on Complex Multi-Step Prompts

- **ContextSummarizer Redundant 4x LLM Calls (Critical Fix)**: Fixed a severe loop bug where `compressHistory()` was called once per nudge iteration (up to 4x per request) instead of once per session turn. The compressed result was never persisted back to the logger, so every iteration re-fetched the full uncompressed history and triggered another full LLM summarization call. Added a per-session in-memory cache keyed by text message count: if no new user/assistant messages have arrived, the cached compressed result is reused immediately — eliminating the redundant LLM calls entirely.
- **TaskPlanner Context Bloat**: Refactored the TaskPlanner to inject its execution plan as a `role: 'system'` logger entry instead of prepending it to the user input string. Previously, the plan was concatenated into the user message body (`planInjection + "\n\nUSER REQUEST: " + input`), which inflated the user message size stored in logger and compounded context bloat on every subsequent turn. Also capped generated plans at 120 words to prevent runaway context consumption.
- **Nudge Messages Now Actionable**: Replaced the generic `"[SYSTEM NUDGE] You did not output any tool calls..."` message with a structured, actionable prompt that includes: the original user task (truncated to 200 chars), the list of relevant available tools, and explicit instruction to either call a tool or output a final text answer. Applies to both OS Agent and Web3 Agent.
- **Dead-End Fallback Replaced**: Replaced `"No response generated."` (which leaves the user with no actionable path) with `"⚠️ I encountered an issue processing your request. This can happen with very complex multi-step tasks. Please try rephrasing or breaking the request into smaller steps."` in all 4 abort paths across `osAgent.ts` and `web3Agent.ts`.
- **Thinking-Prefill Continuation (Critical Fix)**: Ported the core silent-stop recovery technique used by the Hermes agent framework. When a reasoning model (e.g. Gemini 2.5 Pro with `reasoning_effort: high`) produces internal thinking content but no visible text or tool calls, Nyxora now appends the assistant's reasoning turn as-is and continues the loop — allowing the model to see its own reasoning on the next turn and naturally produce a tool call or text response. This is a fundamentally different approach from system nudges (which restart the reasoning chain from scratch). Prefill is attempted up to 2 times before falling back to the nudge path. Applies to both OS Agent and Web3 Agent.
- **Anti-Silent-Stop System Prompt Rule**: Added `CRITICAL RULE 6` to the OS agent system prompt explicitly forbidding silent stops: after reasoning is complete, the model MUST produce either tool calls or a visible text answer. Ending a turn with only internal thinking is explicitly stated as not acceptable.
- **MAX_TURNS Raised (OS Agent)**: Increased the stream loop iteration cap from 10 to 15 to give complex multi-step tasks (e.g. write file → send to Telegram) sufficient room to complete without hitting the ceiling.

## [26.7.8]
### Bug Fixes — Global Compatibility & Dashboard Crash

- **Dashboard Not Accessible via `nyxora dashboard` (Critical Fix)**: Resolved a crash-on-startup bug where the entire Core gateway process would exit with code `1` before binding to port 3000, making `http://localhost:3000` unreachable. Root cause: `channels/index.ts` performed static top-level imports of `baileys`, `@slack/bolt`, and `@line/bot-sdk` — packages that are **not listed in `package.json` dependencies** and therefore not installed on global npm users' machines. Resolved by refactoring `channels/index.ts` into a `registerAllAdapters()` async function that uses dynamic `import()` with `MODULE_NOT_FOUND` error handling. Missing adapters now log a clear warning and are skipped instead of crashing the process.
- **WhatsApp Adapter Lazy Load**: Migrated `whatsappAdapter.ts` from a static `import makeWASocket from 'baileys'` to a lazy `await import('baileys')` inside `start()`, with a graceful error and install instructions if `baileys` is absent.
- **Slack Adapter Lazy Load**: Migrated `slackAdapter.ts` `@slack/bolt` import to lazy initialization inside `start()`.
- **LINE Adapter Lazy Load**: Migrated `lineAdapter.ts` `@line/bot-sdk` import to lazy initialization inside `start()`.

### Bug Fixes — Windows & Cross-Platform Compatibility

- **Unix Socket Crash on Windows** (`ENOENT`/`ENOTSUP`): Replaced hardcoded Unix Domain Socket (`/tmp/nyxora-signer.sock`) in `signer/server.ts` with a cross-platform IPC strategy. On Windows, the signer now listens on TCP `127.0.0.1:3002`; Unix/Mac keeps the existing UDS path for security.
- **Policy Engine Cross-Platform IPC**: Refactored all Signer proxy calls in `policy/server.ts` into a unified `signerRequestOptions()` helper that automatically selects Unix socket (Linux/Mac) or TCP (Windows). The optional UDS IPC server is now skipped entirely on Windows.
- **vaultClient TCP Fallback**: Refactored `vaultClient.ts` with a `getPolicyOptions()` helper — on Windows, all Policy Engine requests use TCP; on Linux/Mac, Unix socket is preferred if available with automatic TCP fallback.
- **Python Path on Windows**: Launcher now resolves the ML Engine Python executable to `venv/Scripts/python.exe` on Windows instead of `venv/bin/python`, preventing silent "Python not found" at startup.
- **`pkill` Skipped on Windows**: Graceful shutdown in `launcher.ts` now guards `pkill -f ts-node` and `pkill -f uvicorn` behind a `process.platform !== 'win32'` check.
- **Unix Socket Doctor Checks Skipped on Windows**: `nyxora doctor` now conditionally skips UDS socket health checks on Windows where they are not applicable.

### Improvements — Configuration & Telemetry

- **Cloudflare Tunnel Configurable**: Cloudflare auto-tunnel can now be disabled by setting `cloudflare_tunnel: false` in `~/.nyxora/config/config.yaml`. Previously it always launched unconditionally.
- **ML Engine Health Check in `nyxora doctor`**: Added a dedicated check (#7) that pings `http://127.0.0.1:8000/health` to detect if the Python ML Engine sidecar is running. When daemon is stopped, it verifies the venv is installed and guides with `nyxora setup`.
- **Node.js Version Enforcement**: Added `"engines": { "node": ">=22.0.0" }` to `package.json`. npm will now warn users attempting to install on incompatible Node.js versions instead of silently installing and crashing at runtime.
- **Locale-Neutral System Prompt**: Replaced Indonesian-specific examples (`"cek saldo gue dirupiahin"`, `"fiat/rupiah"`) in `promptBuilder.ts` with multilingual examples (`"0.5 BTC in EUR"`, `"convert 100 SOL to JPY"`) to align with global user base.
- **English-Only Source Code**: Translated the remaining Indonesian comment in `nyxDaemon.ts` (`// Kirim riwayat percakapan...`) to English for open-source contributor clarity.

## [26.7.6]
### Features & Architecture
- **ML Engine Custom Provider Support**: Fixed a `500 Internal Server Error` in the Python ML Engine by explicitly supporting the `custom` and `openrouter` providers and gracefully handling empty API keys with a local fallback, ensuring robust execution for cognitive reasoning and RAG memory tasks.

### Bug Fixes & Dashboard
- **Dashboard Overview Key Detection**: Resolved a UI bug in the Dashboard Overview where custom and proxy providers (`custom_provider_key`, `9router_key`) incorrectly rendered as "Missing Key". The status engine now dynamically queries the exact credential mapping for off-standard providers.
- **LLM Configuration Persistence Bug**: Fixed a configuration merging flaw in `Settings.tsx` where switching away from a `custom_provider` left the old `base_url` intact in the persistent payload. This previously caused subsequent standard LLM providers (e.g., OpenAI) to silently inherit the custom URL and crash. The dashboard now cleanly purges the `base_url` state upon provider transitions.

## [26.7.5]
### Reasoning & Agent Engine Architecture
- **Event-Driven Tool Execution**: Fully refactored the core agent loop (`osAgent.ts`) from a linear synchronous executor to a highly scalable, event-driven architecture using Lifecycle Hooks (`beforeToolCall`, `afterToolCall`). This completely decouples security guardrails and domain-specific logic from the core loop.
- **Parallel Execution Concurrency**: Supercharged the agent's data gathering capabilities by upgrading the execution engine to support parallel processing (`Promise.all`), allowing multiple safe tools to run concurrently for massive speed improvements.
- **Deferred Tool Resolution (MCP Ready)**: Built-in support for dynamic tool resolution, allowing the agent to request and execute external tools (e.g., via Model Context Protocol servers) on-the-fly even if they aren't loaded in the initial context.
- **Partial Streaming Feedback**: Long-running tools can now stream partial updates (`"⏳ Processing..."`) to the user interface (Telegram/Dashboard) before the execution is fully complete, significantly enhancing UX and transparency.
- **Advanced Guardrails**: The strict `Reasoning Gate` and `Web3 Fast Return` logic have been cleanly migrated into standalone middleware hooks, ensuring the main executor remains agnostic and maintainable.
- **Dynamic Reasoning Mapper**: Injected seamless support for `reasoning_effort` across the entire Unified Mapper API, making it universally compatible with both OpenAI and OpenRouter native reasoning models.
- **UX Sanitizer**: Implemented intelligent regex filtering to intercept and strip raw LLM `<think>` tags before they are broadcast to user-facing channels, keeping chat interfaces clean and elegant.

### UI/UX & Design System Overhaul
- **Modern UI Aesthetic**: Executed a comprehensive overhaul of the dashboard interface. Introduced advanced glassmorphism (`backdrop-filter: blur(20px)`) to the sidebar, softened structural corners (`border-radius: 18px`), and applied modern micro-animations and subtle drop-shadows across chat bubbles and input forms.
- **Color Harmony & Contrast**: Refined the Dark Mode palette by shifting the primary accent color to a sleek Cyan (`#32ADE6`). Adjusted typography across UI pills (Network Selectors, Trending Tokens) from harsh contrast to a harmonious, translucent off-white (`rgba(255, 255, 255, 0.85)`) for optimal readability without eye strain.
- **Chat Experience**: Redesigned the chat bubbles to distinctly separate user and agent messages using vibrant colored backgrounds for the user and elegant dark-glass styling for the agent, significantly improving spatial distinction.

### Native Channel Engine (Omni-Channel Integration)
- **Massive Architecture Overhaul**: Replaced the legacy hardcoded Telegram/Discord gateway with a highly scalable `ChannelManager`. Nyxora now natively and dynamically supports 19 distinct messaging platforms without requiring external sidecars.
- **Dynamic CLI Configuration**: Overhauled `setup.ts` to dynamically detect and register available channels, allowing users to select and configure credentials seamlessly via `nyxora start`.
- **19 Native SDK Implementations**: Successfully integrated and compiled native event listeners, Webhooks, and Socket Modes for WhatsApp (Baileys), Slack (Bolt Socket Mode), LINE, Microsoft Teams, Mattermost, Matrix, Google Chat, Synology, Nextcloud, Zalo, Twitch, iMessage, IRC, QQ Bot, Nostr, SMS, and Voice.

### Playbook Ecosystem & Automation
- **Playbook Recorder (Auto-Learn)**: Introduced a powerful Auto-Learn capability (CRITICAL RULE 7) allowing the OS Agent to dynamically record terminal workflows, abstract them into markdown instructions, and autonomously generate new reusable SOPs (Playbooks) based on chat history.
- **Skill Store Dashboard (Split-Pane UI)**: Built a brand-new native Skill Store interface in the dashboard (`Playbooks.tsx`), enabling users to browse, edit, and manage their local AI playbooks seamlessly via a modern split-pane editor without touching the terminal.

### Features & Architecture
- **Self-Learning & Continuous Improvement**: Transformed Nyxora into a continuously evolving AI. The OS Agent (`osAgent.ts`) now natively injects narrative profiles (`MEMORY.md` and `USER.md`) directly into the system prompt at the start of every session.
- **Asynchronous Background Review**: Engineered a non-blocking background auditor (`triggerBackgroundReview`) that executes silently after every interaction. The agent uses LangChain to evaluate recent conversations, autonomously identifying user preferences, extracting reusable workflows, and dynamically creating or patching its own skills (`skill_manager.py`) without user intervention.

### Bug Fixes & Improvements
- **Streaming UI Text Duplication & Glitch Fix**: Resolved a critical issue in the multi-turn streaming architecture where LLM "thought process" text (generated before a tool call) would leak and concatenate with the final answer on Telegram. Implemented a robust `[CLEAR_STREAM]` control signal that gracefully resets the message draft and displays a universal `⏳ Processing...` placeholder, completely eradicating message bubble collapse and visual jitter during tool execution.

## [26.7.4]
### Features & Architecture
- **Cognitive Critic Engine Enhancements (Staleness Detection)**: Added a multilingual time-sensitive detection rule to the Critic Engine (`critic.py`). By injecting the current UTC datetime, the Critic now explicitly flags answers containing time-sensitive keywords (e.g., "today", "kemarin", "now") if they rely on stale training memory rather than fresh tool execution.
- **Multilingual Scolding Detection (Teguran-Aware Mechanism)**: Nyxora now detects if the user scolds or corrects its output (e.g., "salah", "ngawur", "wrong") across multiple languages. It automatically injects an internal system prompt to force the LLM to discard stale assumptions and immediately trigger a fresh `search_web` or relevant tool call to verify facts.

### Bug Fixes & Improvements
- **Nyx Daemon SQLite Constraints**: Fixed a `UNIQUE constraint failed` crash in the background persona auditor (`episodicDB.upsertPersonaByCategory`). It now gracefully catches the constraint collision and shifts existing persona traits to their new dedicated categories without interrupting the daemon cycle.
- **Critic Engine LangChain Parsing**: Escaped raw JSON curly braces in `critic.py`'s system prompt example to prevent LangChain from misinterpreting them as missing template variables (`INVALID_PROMPT_INPUT`).
- **Documentation**: Replaced the "Alpha" status badge with "Prototype" and removed the "Built on Base" badge in `README.md`.

### Features & Google Workspace
- **Gmail Send Capability**: Extended the Google Workspace integration beyond read-only access. The AI agent can now natively compose and send emails via the Gmail API (`POST /gmail/v1/users/me/messages/send`) using RFC 2822 base64url-encoded payloads. The new `send_email` tool accepts `to`, `subject`, and `body` parameters.
- **Google Calendar Write Access**: Added the `add_calendar_event` tool, enabling the AI to autonomously create new events in the user's primary Google Calendar via the Calendar API. Accepts ISO 8601 `startTime`/`endTime` for precise scheduling.
- **OAuth Scope Expansion**: Added `gmail.send` and `calendar.events` scopes to `googleAuthModule.ts`. Users must re-authenticate to grant the new permissions.
- **Setup Wizard Accuracy Fix**: Updated the `GoogleAuthWizard.tsx` (Step 1) to include all required APIs: **Google Calendar API**, **Google Docs API**, and **Google Forms API**, which were previously missing from the setup instructions.
- **OAuth Consent Screen URL Fix**: Replaced unreachable `localhost:3001` Privacy Policy and Terms of Service placeholder URLs in the setup wizard with publicly accessible `nyxoraai.github.io` URLs, preventing `Error 400: unknownerror` during Google OAuth consent screen validation.

## [26.7.3]
### Bug Fixes & Improvements
- **Daemon Graceful Shutdown (Port 8000)**: Improved the `npm run stop` behavior by injecting a `forceKill` (`SIGKILL`) method within `launcher.ts`, explicitly terminating detached ML Engine processes (`uvicorn`) and `ts-node` instances that were previously hanging and preventing clean reboots.
- **Telegram Connectivity Timeout**: Resolved a persistent `Network request for 'getUpdates' failed!` issue in the Telegram integration. Enforced `dns.setDefaultResultOrder('ipv4first')` in `cli.ts` to bypass dual-stack IPv6 conflicts and ensure stable grammatical API fetching.

### Features & Architecture (Python ML Engine)
- **Local Python ML Engine Integration**: Successfully integrated a local Python-based Machine Learning Engine (FastAPI + LangChain + Pandas) alongside the core Node.js gateway. This massively enhances Nyxora's analytical and cognitive capabilities.
- **Cognitive Memory & RAG**: Shifted Persona Dialectic Reasoning and Episodic Memory Semantic Search (RAG) to the new Python Engine. Integrated `langchain_huggingface` using the local `all-MiniLM-L6-v2` embedding model for ultra-fast, offline vector processing without API costs.
- **Market Intelligence Delegation**: Completely refactored `marketPlugin.ts` (Node.js) to delegate deep market analysis and momentum calculations directly to the Python ML Engine (`/web3/analyze`), significantly reducing redundant API calls and code overlap.

## [26.7.2-alpha.4]
### Features & Platform Integrations
- **Telegram Native Streaming (Bot API 9.3+)**: Radically overhauled the Telegram bot integration to completely bypass the standard 1-second `editMessageText` API rate limit. The engine now natively implements the modern `sendMessageDraft` method, streaming ephemeral hardware-accelerated "Typing..." animations directly to the Telegram client at 100ms intervals. This fully resolves UI stuttering and achieves ultra-smooth, real-time typewriter effects matching premium web interfaces.

### Bug Fixes & Stability
- **Telegram Polling Timeout Silence**: Mitigated an issue where sudden network disconnects or API timeouts (`ETIMEDOUT`) would cause the `@grammyjs/runner` to spam the console with massive stack traces. The system now seamlessly intercepts these failures via a custom API config transformer, suppresses the default runner logs, and gracefully emits a clean, single-line reconnection warning.

## [26.7.2-alpha.3]
### Hotfixes
- **Daemon Crash & Missing Dependency**: Resolved a critical crash preventing `nyxora start` from booting the daemon by properly injecting the missing `discord.js` dependency into the core package requirements.
- **MCP Server TypeScript Rigidity**: Fixed a severe TypeScript compilation failure on the MCP Server caused by an un-asserted `type: "text"` field within the JSON-RPC return shape, ensuring `alpha.3` builds securely and passes strict compilation checks before deployment.

## [26.7.2-alpha.2]
- **Core Stability & Graceful Shutdown**: Engineered a robust `Graceful Shutdown` hook in the Gateway API (`server.ts`) to actively track floating Web3 transaction promises. Nyxora now intelligently waits up to 10 seconds for on-chain transactions to finalize before shutting down, completely eradicating dangling transactions and fund loss during SIGINT/SIGTERM.
- **SQLite Transaction Persistence**: Overhauled `transactionManager.ts` to migrate away from volatile RAM Maps and JSON files (`.nyxora_withdrawals.json`). All pending transactions and L2 withdrawals are now persistently written to `memory.db` via `logger.ts`, guaranteeing 100% state recovery and ACID compliance across sudden power losses or daemon reboots.
- **Atomic File Operations**: Fortified configuration write operations (`config.yaml` and Google Credentials) in `parser.ts` using OS-level atomic renames (`fs.renameSync`). This mechanically eliminates the possibility of 0-byte file corruption during sudden server crashes.
- **Unified Message Bus (Multi-Platform Integration)**: Radically expanded Nyxora's gateway architecture beyond Telegram and the Web Dashboard. Successfully engineered and deployed a unified multi-platform message bus:
  - **Discord Integration**: Engineered `discordAdapter.ts` using `discord.js` to allow Nyxora to natively join Discord servers, intercept mentions, and stream Markdown-rich responses via WebSockets in real-time.
  - **Multi-Identity Tracking**: Overhauled the core `logger.ts` memory architecture to persistently track user dialects across multiple platforms by dynamically segmenting SQLite session IDs (`discord_<id>`, `telegram_<id>`).
- **Light Theme Login Readability**: Resolved a severe contrast issue on the Dashboard Login screen. In Light Mode, the dark text was practically invisible against the hardcoded dark card. Appended strict `body.light-theme` overrides in `Login.css` to seamlessly transition the card into a readable "glass" background without polluting or breaking the existing Dark Mode aesthetics.
- **Background Daemon Identity Integration**: Officially formalized the naming convention of the Dialectic User Modeling background process to **Nyx Daemon**. Realigned all core TypeScript files (`nyxDaemon.ts`), internal system logging prefixes, and public documentation to reflect this unified system identity, ensuring a seamless aesthetic and conceptual integration with the broader Nyxora ecosystem.

## [26.7.2-alpha.1]
### Security & Architecture
- **Front-to-Back Slippage Architecture (MEV Protection)**: Patched a critical security vulnerability across `swapToken.ts`, `bridgeToken.ts`, `createLimitOrder.ts`, and `provideLiquidity.ts` where LLM-hallucinated slippage parameters or hardcoded aggregator defaults bypassed the user's Dashboard `max_slippage` settings. All DeFi/AMM transactions now strictly fetch and enforce `max_slippage` from the local SQLite `user_profiles` database, guaranteeing absolute protection against MEV Sandwich Attacks on Mainnet.

### Core Architecture & Anti-LLM Hallucination
- **Mass-Sanitization Chain Name**: Injected an automated whitespace sanitizer (`.trim().replace(/\s+/g, '_')`) across 15 Web3 skills. This guarantees NLP robustness, allowing users to type casual chain names like "arbitrum sepolia" without triggering RouteSelector failures.
- **Skill Extractor YAML Strictness**: Overhauled the `skillExtractor.ts` template generation. It now strictly enforces YAML frontmatter formatting with an indented `required` array, completely eradicating the `property is not defined` Protobuf validation error in Gemini 2.5 Flash.
- **LLM Fallback Command Parser**: Deployed an emergency regex interceptor in `web3Agent.ts`. If an open-weight LLM (like Minimax) hallucinates and outputs raw text commands (e.g., `/transfer amount=...`), the parser autonomously hijacks the text, clears the UI, and synthetically converts it into a valid JSON tool call payload to trigger the UI transaction confirmation seamlessly.

### Infrastructure & Documentation
- **Phantom Dependencies Resolution**: Systematically eliminated phantom dependencies across the monorepo architecture. Explicitly injected essential modules (e.g., `grammy`, `croner`, `viem`, `jsonwebtoken`, `picocolors`) directly into `packages/core/package.json` to ensure the core engine is fully modular, self-contained, and safe for standalone NPM publishing.
- **Documentation Technical Accuracy**: Conducted a massive forensic audit and overhaul of the technical documentation to ensure 100% alignment with the actual codebase:
  - Clarified LLM SDK usage (Native Fetch is used for Gemini, but official SDKs are retained for OpenAI/Anthropic).
  - Corrected IPC Protocol claims (Policy Engine uses a combination of Unix Socket and local TCP Loopback, not exclusively Unix Sockets).
  - Fixed outdated directory references for OS-level skills (now loaded directly from `packages/core/src/system/plugins/`).
  - Removed false claims regarding the BIP-39 mnemonic interception in the Memory Validator.

## [26.7.2-alpha]
### Orchestrator Architecture & Extensibility
- **Multi-Turn Agentic Loop**: Radically overhauled the core LLM execution loop in `web3Agent.ts` and `osAgent.ts`. The engines now utilize a robust `while (turnCount < MAX_TURNS)` architecture. This definitively resolves the "lost context" bug where the AI would drop its tool schemas after a single execution turn, granting Nyxora the endurance to execute highly complex, multi-step operations (e.g., directory scanning followed by programmatic file generation) in a single uninterrupted stream.
- **External Skill Builder (`SystemExternalPlugin`)**: Engineered a completely isolated IoC plugin dedicated solely to third-party integrations. Introduced the `create_agent_skill` tool, enabling the AI to programmatically scaffold new Node.js execution scripts (`execute.ts`) and auto-generate strict YAML frontmatter for `SKILL.md`. This transforms Nyxora into a fully autonomous Agent-Building Platform that can code and register its own tools dynamically without muddying the native OS/Web3 tool ecosystems.

### Cognitive Reasoning & Identity Architecture
- **Cognitive Reasoning Engine**: Implemented a powerful new Cognitive Skill system that parses user intent and routes them to strict Standard Operating Procedures (SOPs). Added `cognitiveManager.ts` and foundational SOPs for Systematic Debugging, Test-Driven Development (TDD), and Architecture Planning to drastically improve agent output reliability and strictly enforce developer disciplines.
- **Episodic Memory V2 Architecture**: Completely overhauled the Episodic Memory SQLite database (`episodic.db`) to fix memory duplication and identity conflict issues (e.g., persona overlap).
  - Added a `key_topic` deduplication layer to ensure old conflicting facts are automatically wiped before new ones are saved.
  - Re-routed the `update_profile` AI tool to write directly to SQLite instead of `user.md`, fixing severe overwrite bugs caused by the background Promotion Engine.
- **`forget_memory` Tool**: Introduced a surgical memory deletion skill. The AI can now autonomously search for and permanently delete specific habits or mistaken persona traits from the SQLite database upon the user's explicit request.

### Architectural Revamps & UI/UX
- **Settings Dashboard Redesign**: Restructured the Settings interface into a sleek, full-width Master-Detail layout with a dedicated sidebar. Consolidated all advanced configuration menus (Web3 Skills, OS Skills, RPC, DeFi, Oracles) previously scattered across the main navigation directly into this unified command center for a cleaner user experience.
- **UI & Layout Optimizations**: Fixed restrictive width constraints on configuration panels, allowing them to fluidly span the entire viewport. Eliminated double-scrollbar bugs on embedded skill panels by seamlessly integrating them into the parent container with unified glassmorphism scrollbar styling.
- **Zero-Latency Conversational Approval**: Completely overhauled the Web3 transaction approval flow. 
  - Eradicated all intrusive UI modals (`PendingTransactions.tsx`) from the Dashboard and ripped out `InlineKeyboard` popup logic from the Telegram Gateway.
  - Transactions are now approved organically via text. The AI autonomously interprets conversational cues (e.g., answering "Yes" or "No") and executes the pending on-chain transaction in the background using the new `confirmPendingTx` skill.
  - **Token Efficiency Intact**: Ingeniously maintained the `fastReturnTools` bypass. Transaction preparation strings now output a direct prompt ("*Please reply with 'Yes' to execute, or 'No' to cancel*") instantly, achieving conversational UX without incurring the latency or API cost of generating an LLM prompt for every single transaction queue.
- **Pre-flight Balance & Gas Security Check**: Engineered a universal `balanceChecker` utility that validates wallet balances across all 9 Web3 transaction skills *before* queuing them.
  - Acts as a smart guardrail similar to Rabby Wallet's UX. It automatically aborts transaction preparations entirely if the user lacks the required ERC20 tokens or if their Native Coin (ETH/BNB) balance is completely depleted (preventing out-of-gas failures).
  - **Human-Readable Error Feedback**: Overhauled the raw error outputs from 18-decimal Wei formats to standard units. The system now dynamically fetches token metadata (decimals and symbols) on-the-fly and applies `formatUnits` to present clean, readable error messages (e.g., *"You need at least 500 USDC"* instead of raw Wei integers), significantly reducing friction for novice users.

## [26.7.1-alpha]
### Bug Fixes & Optimizations
- **Native Coin Resolution Mass Remediation**: Fixed a systemic architectural flaw where Web3 transaction modules strictly validated against the Zero Address (`0x00...00`) for native coins (ETH/BNB/MATIC). The codebase now universally intercepts and processes the `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` pseudo-address generated by aggregators. This stabilizes critical transactional skills including:
  - **DEX Swapping**: Prevents contract decimals parsing crashes during Native to ERC20 swaps (`swapToken.ts`).
  - **Asset Transfers**: Safely bypasses `transfer()` contract calls when sending native coins (`transfer.ts`).
  - **DeFi Lending**: Ensures AAVE dynamically routes to WETH gateways for native deposits (`defiLending.ts`).
  - **Yield Vaults & Liquidity (V3)**: Secures deposit validations and prevents false rejections (`yieldVault.ts`, `provideLiquidity.ts`).
  - **Security Approvals**: Blocks artificial revoke requests on native coins gracefully (`revokeApprovals.ts`).
  - **Balance Queries**: Correctly routes to native balance RPC methods instead of standard ERC20 `balanceOf` (`getBalance.ts`).


## [26.6.30-alpha]
### UI/UX & Quality of Life
- **AI Web Platform Style Empty State**: Overhauled the default chat interface when no messages are present. The dashboard now features a sleek, centered "What's on your mind today?" greeting, automatically repositioning the input bar to the center.
- **Dynamic Trending Tokens**: Replaced static suggestion pills with real-time Trending Tokens powered by the backend CoinGecko integration. Tokens gracefully appear under the input bar when the chat is empty.
- **English Token Prompt Translation**: Updated the auto-fill prompt for trending token analysis to English ("Please provide the latest market analysis for...").
- **Fixed Sticky Routing Cache**: Removed legacy `localStorage` persistence for `currentView`. The application now strictly resets to the `chat` interface upon every reload, preventing users from getting stuck in isolated menus (like Settings) across sessions.

### Infrastructure & Quality Assurance
- **Automated CI/CD Workflows**: Implemented robust GitHub Actions (`.github/workflows/ci.yml`) to automatically validate codebase integrity (build, test) on every push and pull request to the `main` branch.
- **Linter Eradication**: Completely uninstalled and removed all traces of ESLint, Oxlint, `lint-staged`, and Husky pre-commit hooks from the monorepo to grant developers absolute freedom and eliminate commit friction.
- **Mass Codebase Remediation**: Executed a highly targeted regex-based refactoring script across the monorepo to resolve over 150 instances of "empty block statement" warnings specifically targeting hollow `catch (e) {}` blocks, cleaning up legacy code overhead.

### Localization & Architecture
- **Global Codebase Standardization**: Conducted a comprehensive audit and translated 15+ hardcoded Indonesian string literals (UI error boundaries, LLM exception handling, Market Intelligence routing logic) into professional, crypto-native English to support international open-source contributors.
- **Dynamic Local-First Timezones**: Eradicated hardcoded `id-ID` and `Asia/Jakarta` parameter bindings deep within `reasoning.ts`, `osAgent.ts`, and `web3Agent.ts`. Nyxora now natively inherits the user's host OS timezone context while securely formatting dates in `en-US` for accurate LLM semantic parsing.
- **Text-to-Speech (TTS) Accent Correction**: Repaired the Dashboard's audio synthesis module by migrating `utterance.lang` to `en-US`, completely resolving the robotic accent glitch when reading English crypto analytics aloud.

## [26.6.29-alpha]
### Release & Stability
- **Beta Phase (Reverted)**: Nyxora briefly entered the Beta phase here for wider public testing, but the status has since reverted to Alpha in `v26.7.2` to accommodate massive core architectural experiments.
- **NPM Publishing Integrity**: Explicitly whitelisted `CHANGELOG.md` within the `package.json` files array to guarantee release notes are synchronized onto the public NPM registry.

## [26.6.28-alpha]
### Features & Personalization
- **Global Fiat Currency Converter:** Integrated a dynamic fiat currency selector in `Settings.tsx` that fetches live `supported_vs_currencies` from CoinGecko. The `Portfolio.tsx` dashboard now seamlessly converts and renders all balances in the selected global fiat (IDR, EUR, GBP, JPY, etc.) using client-side processing, while safely preserving core backend trading logic in pure USD.
- **Episodic Memory Panic Button:** Introduced a dedicated "Wipe All Episodic Memory" trigger in the UI that routes to `DELETE /api/memory/all`. This systematically purges SQLite records and instantly resynchronizes the LLM `user.md` prompt.
- **Dashboard Theme Selection:** Hard-wired the Theme Selector (Light, Dark, Auto) directly into the Settings panel for greater visibility.
- **Dynamic Log Level Toggle:** Exposed `log_level` (`info`, `debug`) configuration in `NyxoraConfig.agent` to natively control backend verbosity via the Settings UI.

### Security, MCP & Documentation
- **On-Chain Kill-Switch Enforcement:** Moved the `checkRegistryStatus()` Base Sepolia interceptor directly into the core Policy Engine (`/request-tx` and `/approve-tx/:id`). This seals a critical bypass vulnerability, ensuring that all external transactions (including those via Telegram, MCP, or CRON) are strictly blocked if the Kill-Switch is thrown on-chain.
- **MCP Server Hardening:** Refactored MCP Server IPC from TCP (`port 3001`) to Unix Domain Socket (`/tmp/nyxora-policy.sock`) for hyper-optimized security. Enforced End-to-End HMAC Signing on all internal `/request-tx` payloads to protect against request manipulation. Added a strict HTTP Timeout (`10000ms`) to prevent hanging clients.
- **Standalone MCP CLI:** Added a native `nyxora mcp` command to the CLI manager for isolated developer testing, accompanied by dynamically resolved SDK versions (`^1.29.0`).
- **NVM & GUI PATH Troubleshooting:** Overhauled the `docs/guide/mcp-integration.md` to cleanly separate global `nyxora start` and source `npm start` instructions. Appended a dedicated Warning block documenting Node Version Manager (NVM/Volta) PATH failures specific to Claude Desktop.
- **Installation Docs Refinement:** Synchronized `README.md` and VitePress documentation with accurate Smart Wrapper `curl` instructions for Windows, macOS, and Linux, complete with proper uninstallation guidelines.

### Bug Fixes & Optimizations
- **Uniswap V3 LP UX Overhaul:** Significantly lowered the technical barrier for `provideLiquidityV3.ts`. If an AI agent or user does not specify a strict `tickLower` and `tickUpper`, the contract simulation now automatically defaults to **Full Range** (`MIN_TICK` to `MAX_TICK`) based on the selected fee tier's tick spacing.
- **Market Watch Persistence Engine:** Engineered a robust auto-resume sequence for `createMarketWatchAgent.ts`. Background tasks are now serialized to `~/.nyxora/data/market_tasks.json` upon creation and seamlessly resurrected by the Gateway `server.ts` upon daemon restart.
- **RPC Fallback Integrity:** Fixed an edge-case bug in `rpcEngine.ts` where empty array definitions bypassed fallback transports. Added HTTP and WSS failovers for the `base_sepolia` network.
- **DeFi Keys Architecture:** Stripped legacy `envKey` dependencies in `/api/defi-keys`. Replaced it with pure `id` lookups and injected a `Set` deduplication algorithm to prevent duplicated API key requirements rendering in the UI.
- **OpenOcean Decimal Parsing:** Resolved a critical application crash where `OpenOceanProvider.ts` incorrectly parsed fractional `amount` inputs directly into `BigInt`. It now strictly targets raw wei values.
- **Market Oracles Lazy Loading:** Relocated the global `MARKET_KEYS_FILE` declaration within `marketConfigManager.ts` to execute lazily, resolving startup path resolution race conditions.
- **Waterfall Fallback Engine:** Rewired `marketEngine.ts` to gracefully cascade across CoinGecko, CoinMarketCap, and DexScreener. If a token fails to resolve globally, the Engine now returns a clean, LLM-friendly diagnostic error instead of silently defaulting.
- **Transparent Key Storage Security:** Eliminated misleading "Encrypted Locally" notices across `DefiKeys.tsx`, `MarketOracles.tsx`, and `Settings.tsx`. Disabled `explorer_api_key` decryption inside `parser.ts` to strictly enforce isolated Plain Text storage as per design constraints.
- **Etherscan V2 Compatibility:** Emptied the legacy `YourApiKeyToken` default placeholder in `getTxHistory.ts` to ensure the Etherscan public fallback gracefully defaults to rate-limited public access.
- **Dev Mode Authentication Loop:** Introduced an interactive `AuthModal` inside `App.tsx` that automatically traps HTTP 401/403 responses and prompts developers to input their `x-nyxora-token`, terminating the silent failure loop.
- **Vite Local Proxying:** Configured `server.proxy` within `vite.config.ts` to seamlessly tunnel `/api` requests to port `3000`. Stripped hardcoded loopbacks from `API_BASE_URL` to completely eliminate Dev CORS errors and resolve production relative-path resolution.
- **Concurrent Transaction Race Conditions:** Upgraded `loadingId` state architecture in `PendingTransactions.tsx` from a single string to a `Set<string>`. The UI now accurately renders independent spinner states when executing parallel "Approve All" routines.
- **WebSocket Gateway Security:** Patched a dangerous type coercion vulnerability inside `WebSocketManager.ts` where `validateToken()` returned an object. The handshake now properly unwraps `.valid` to strictly reject unauthorized socket upgrades.
- **Global Chat Search Integration:** Added a native `GET /api/sessions/search?q=` SQLite query endpoint. Re-wired `SearchChat.tsx` to utilize a debounced remote API instead of purely filtering local session titles.
- **Settings Race Condition:** Segregated secondary `apiFetch` dispatches (Profile, Policy) within their own localized `try/catch` enclosures inside `Settings.tsx` to prevent localized failures from blocking the primary config persistence notification.
- **Dynamic Model Verification:** Eliminated the hardcoded "1 ok" text on the `Overview.tsx` dashboard panel. The UI now dynamically infers LLM readiness by securely checking for API Key presence.
- **Modular DeFi Keys Removal:** Added full lifecycle support for DeFi aggregator keys by exposing a `DELETE /api/defi-keys/:id` endpoint on the server, paired with a dynamic Delete button in the frontend.
- **Excessive Polling Memory Leaks:** Architected a `usePolling.ts` custom hook incorporating the `Page Visibility API`. Globally migrated HTTP polling intervals (`Overview`, `App`, `PendingTransactions`) from aggressive 2-second ticks down to efficient 5-second intervals that automatically sleep when the browser tab is hidden.
- **Reflection Engine Provider Agnosticism:** Migrated `getOpenAI()` to a dynamic `getLLMClient()` resolution. Dropped hardcoded `json_object` enforcement in favor of strict system prompts to natively support Anthropic, Gemini, and OpenRouter implementations.
- **Reflection Engine Noise Filtering:** Hard-filtered `role === 'tool'` messages from the episodic history payload to prevent the LLM from falsely treating background RPC/blockchain logs as user behavioral preferences.
- **Background Memory Synchronization:** Patched a severe lifecycle bug where memory updates (`user.md`) only compiled when users manually deleted a memory in the UI. `PromotionEngine` now executes automatically in the background milliseconds after `ReflectionEngine` completes its analysis.
- **Memory Confidence Overflow Limits:** Introduced an aggressive `.min(1.0, confidence)` clamp at the `episodic.ts` `INSERT` & `UPDATE` boundary. This prevents permanent memory overrides from pushing confidence ratios to mathematically impossible boundaries.
- **SearchSessions SQL Target Fix:** Shifted `ORDER BY s.updated_at` to `s.timestamp` within `logger.ts` to align with the active schema layout and prevent SQLite termination errors.
- **Reflection Engine Session Binding:** Bound `ReflectionEngine` directly to the active `sessionId` pipeline and introduced an early-return safeguard, properly restoring episodic extraction which previously failed due to NULL session targets.
- **Relaxed Cryptographic Sanitization:** Disarmed the extremely aggressive 12-word regex heuristic in `validator.ts` that historically flagged standard conversational text inputs as security violations.

## [26.6.27-alpha]
### Bug Fixes & Security
- **Aggregator Decimal Normalization:** Fixed a critical overflow bug in `swapToken.ts` and `bridgeToken.ts` where token amounts were hardcoded to 18 decimals (`parseUnits(amountStr, 18)`). The system now strictly queries `getTokenMetadata` via `viem` to fetch the true on-chain decimals (e.g., 6 for USDC/USDT) before transaction construction.
- **Native Token Consistency:** Standardized the Native Token fallback address inside `tokens.ts` (`TOKEN_MAP`). The application now strictly utilizes `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` across all layers instead of blending it with `0x000...`, which fixes execution anomalies with KyberSwap and 1inch resolvers.
- **Circuit Breaker Health Checks:** Patched `routeSelector.ts` to actively invoke `healthService.recordFailure()` on rejected promises, successfully restoring the circuit-breaker logic to ban persistently failing DeFi endpoints.
- **Sandwich Attack Protection (Expiry):** Implemented a rigorous check within the inner `submitTransaction` boundary (`vaultClient.ts`) to re-validate `expiresAt`. If the user leaves the UI confirmation prompt idle and the market shifts past the quote expiration window, the core engine will now violently abort to protect from extreme slippage / MEV attacks.
- **Deterministic Routing Engine:** Repaired the `providerName` pass-through parameter from the AI `swapToken` intention down to the `routeSelector.ts`. When users explicitly specify an aggregator (e.g., "Swap using 1inch"), Nyxora now forcefully filters out all other providers.
- **RelayProvider Output Integrity:** Mitigated a silent-failure condition in `RelayProvider.ts` by explicitly throwing errors when the output amounts equal zero.
- **Module Auto-Discovery Safety:** Re-wrote the Aggregator `providerRegistry.ts` scanner to dynamically evaluate its execution environment (`dist/` vs `src/`) to ensure `.ts` files aren't blindly imported during production execution.
- **OpenOcean Capabilities & LIFI Pathing:** Stripped inaccurate cross-chain capabilities from the `OpenOceanProvider` mock to save compute cycles, and migrated `LifiProvider.ts` to securely utilize strict numeric `Chain IDs` instead of loose string nomenclature.
- **Aggregator Connection Bloat (Memory Leak):** Enforced `controller.abort()` in `routeSelector.ts` instantly after the optimal `routeScorer` quote is decided. This kills lingering background HTTP connections to slower, unselected aggregators.
- **LLM Dashboard Cost Tracking (Tokens Recovery):** Fixed an issue in `llmProvider.ts` where LLM usage statistics (`total_tokens`) were stripped during the adapter standardization process. The system now perfectly propagates token counts from Gemini, OpenAI, and Anthropic back to the Tracker, ensuring accurate real-time cost accumulation on the Nyxora Dashboard.
- **Optimistic UI Chat Flickering:** Fixed an edge-case visual bug in `App.tsx` where user messages would temporarily disappear (flicker) while waiting for the AI response. The dashboard now properly safeguards optimistic state injections from being blindly overwritten by delayed server sync pulses.
- **Chat History Sliding Window Layout Jump:** Fixed a critical bug in `logger.ts` where the `LIMIT 40` hard constraint (designed for LLM context optimization) was also inadvertently restricting the Dashboard UI data feed. This caused the entire chat interface to dramatically shift/flicker up by one message each time a new message pushed the oldest one out of the 40-message sliding window. The UI now securely pulls up to 1000 messages, eliminating layout shifts completely.
- **Real-Time Aggregator Race Engine:** Repaired `httpClient.ts` (`safeFetch`) to natively inherit and honor external `AbortSignal` chains, unconditionally terminating zombie network threads once the 4-second parallel race concludes. Enforced aggressive `retries: 0` constraints across all 6 Mainnet providers (1inch, 0x, KyberSwap, LIFI, Relay, OpenOcean) to guarantee millisecond-level routing without suffering from exponential sleep-backoffs during external API rate-limits.
- **OpenOcean Precision Normalization:** Added architectural support for formatting human-readable decimals (`amountFormatted`) across the `QuoteRequest` interface to properly serve OpenOcean's API, resolving a critical logic inversion where it previously interpreted inputs as raw wei.
- **Aggregator Endpoint Patches:** Fixed `KyberSwapProvider` payload targeting to extract calldata from `buildData.data.data`, mapped `OpenOceanProvider` requests with enforced `gasPrice` thresholds, and migrated the `RelayProvider` HTTP method from the deprecated `/quote/v2` namespace down to `/quote` (POST).

## [26.6.26-alpha]
### Bug Fixes & Improvements
- **Comprehensive Workspace Hardening**: Fixed missing workspace dependencies across `policy`, `signer`, `mcp-server`, and `dashboard` packages. Removed unused endpoints (`/sign-typed-data` in policy) and dead code (`decryptKey` in signer). Strengthened error handling by wrapping all JSON parsing of signer responses with robust `try/catch` blocks in the policy engine. Upgraded transaction IDs to use secure `crypto.randomUUID()`. Addressed critical frontend type safety by implementing optional chaining in `SwapWidget` to prevent React crashes and correcting `default_slippage` types in `Settings.tsx`. Improved Dashboard TypeScript configuration by adding `DOM.Iterable` support.
- **LLM Architecture Refactor (Bypass Prevention)**: Extracted and centralized LLM provider instantiation (`getLLMClient` & `getOpenAI`) and generic retry logic into `llmUtils.ts`. Eliminated dangerous anti-patterns in `osAgent.ts` and `web3Agent.ts` where the `LLMProvider` adapter was being bypassed by direct OpenAI client calls, which broke multi-provider support (Gemini/Anthropic).
- **History Sanitizer Amnesia Fix**: Modified `historySanitizer.ts` to be provider-aware. Unconditionally stripping `tool_calls` is now correctly isolated only to the `gemini` provider (to prevent 400 Bad Request on empty payloads), whereas OpenAI and Anthropic will now properly retain tool call history and maintain deep conversational context.
- **General Agent Identity Recovery**: Overhauled the orchestrator's *General Agent* fallback branch (`reasoning.ts`). Replaced the hardcoded, context-blind prompt with `getSystemPrompt('general')`, fully restoring the AI's episodic memories, persona (`user.md` & `IDENTITY.md`), and risk profiles. Fixed inconsistent memory synchronization that previously injected `contents: []` to Gemini on fresh sessions.
- **Gemini Adapter Payload Hardening**: Hardened `GeminiAdapter` (`llmProvider.ts`) to intercept and drop empty `parts` arrays triggered by `content_len: 0` assistant messages, preventing catastrophic API rejections.
- **Zero-Latency Config & Security Caching**: Implemented an aggressive 5-second TTL in-memory cache for `loadConfig()` inside `parser.ts`. This wholly eradicates the massive synchronous cryptographic overhead (AES-256-GCM decryption) and disk I/O bottlenecks that previously executed 10-20 times per user message, resulting in lightning-fast response times.
- **LLM Client Singleton Optimization**: Introduced a client reuse architecture (`cachedLLMClient`) in `llmUtils.ts`. Eliminates redundant OpenAI/Gemini/Anthropic client instantiations during the multi-stage intent processing (Router → Execution → Synthesis), which completely solves the spammy duplication of `[LLM] Using API Key securely unlocked...` console logs.
- **CoinGecko UI Integration**: Restored the missing official CoinGecko logo inside the Market Oracles configuration dashboard. Added explicit image mapping for both `coingecko_key` and `coingecko_pro_key` directly to the static CDN.
- **NPM Package Optimization**: Fully sterilized the distribution pipeline by automatically purging unused development testing scripts (`test_security.ts`, `test.ts`) prior to publishing.

## [26.6.25-alpha]
### Architecture Updates
- **Market Oracles & Smart Fallback Engine:** Decoupled Data Oracles (Market Intelligence) from Transaction Routers (DeFi Aggregators) into a dedicated `marketConfigManager.ts`. Upgraded the `analyzeMarket` and `getPrice` AI skills with an extreme dual-tier Smart Routing fallback architecture. Tier 1 dynamically intercepts and prioritizes premium endpoints (`pro-api.coingecko.com` & `pro-api.coinmarketcap.com`) if API keys are configured in the new Zero-Trust "Market Oracles" Dashboard. If unconfigured, Tier 2 gracefully cascades to CoinGecko Public, CoinMarketCap Public, and finally DexScreener, ensuring robust, error-free token intelligence discovery even for obscure unlisted memecoins.
- **Extensible DeFi Liquidity-Routing Runtime (Meta-Aggregator v2):** Replaced hardcoded aggregator scripts with a highly modular `DefiAggregatorProvider` interface. Introduced an IoC registry (`AggregatorRegistry`) with Auto-Discovery for loading providers (1inch, 0x, Relay, LIFI, KyberSwap, ArbitrumBridge, OpBridge).
- **Zero-Trust Wallet Architecture:** Implemented a strict security boundary via `ProviderManifest`. Providers are completely blocked during registration if they request `walletAccess: 'sign'`. Providers are isolated to merely generating `CanonicalRouteQuote` data payloads, guaranteeing that actual transaction signing and private key execution remain strictly locked inside Nyxora's core Vault Client.
- **Hedged Routing Engine & Timeout Guardrails:** Upgraded the legacy sequential router to `routeSelector.ts`, utilizing `Promise.allSettled` for parallel hedged fetching across all active providers. Guarded by `AbortSignal` timeouts and a `ProviderHealthService` circuit breaker.
- **Dynamic API Key Dashboard Schema:** Revamped the `DefiKeys.tsx` Dashboard component and the backend gateway. API Key configuration fields are now schema-driven and auto-generated dynamically based on the specific requirements declared by the currently active DeFi providers.
- **Inversion of Control Plugin System:** Completely overhauled the agent execution architecture (`web3Agent.ts` and `osAgent.ts`) from a static, hardcoded `switch-case` paradigm to a dynamic `PluginManager` architecture. Successfully migrated over 30+ disparate skills into 8 distinct modular plugins (`Web3DefiPlugin`, `SystemCorePlugin`, `GoogleWorkspacePlugin`, etc.). This major refactoring dramatically improves the Developer Experience (DX) by allowing third-party developers to inject new capabilities seamlessly without modifying the core agent brains, while maintaining Zero-Trust Local Execution boundaries.
- **Zero-Dependency Gemini Engine:** Completely removed the `@google/genai` SDK and its heavy dependency tree (`protobufjs`, `google-auth-library`, `node-fetch`, etc.) in favor of a zero-dependency, native `fetch` REST implementation. This architectural refactor definitively eradicates both the `npm warn allow-scripts` security warning and the deprecated `node-domexception` warning during global installations, resulting in a cleaner, faster, and more secure dependency footprint.

## [26.6.24-alpha]
### Features & Architectural Upgrades
- **Base Sepolia Registry Migration:** Successfully deployed and verified the `NyxoraAgentRegistry` smart contract on the Base Sepolia network. Shifted the global On-Chain Kill-Switch architecture from Arbitrum to Base. Synchronized all local Gateway configurations and VitePress documentation.
- **Physical Tri-Core Agent Architecture:** Radically restructured the monolithic `reasoning.ts` engine into three physically isolated files (`reasoning.ts`, `web3Agent.ts`, and `osAgent.ts`). Implemented a Facade Router pattern in `reasoning.ts` to intelligently route user intents without breaking external API contracts (`server.ts`, `telegram.ts`, `cli.ts`). This guarantees True Capability Isolation where the Web3 Agent is physically incapable of accessing OS tools, and completely eliminates context and tool bleeding between domains.
- **Multi-SDK Adapter Architecture:** Broke free from OpenAI-exclusive lock-in by implementing a Unified LLM Provider interface (Adapter Pattern). Nyxora can now natively utilize `@anthropic-ai/sdk` (Claude) and `@google/genai` (Gemini Native) without breaking its internal Web3/OS tool ecosystem. All tool schemas and message arrays are translated on-the-fly, allowing end-users to securely configure `claude-4.6` directly via `nyxora setup`.
- **Hybrid Audio Fallback:** Added a dynamic failover safety net for audio transcription. If a user utilizes a non-audio capable model (like Anthropic Claude) as their core agent, Nyxora's `nyxora audio` CLI command will intelligently fallback to OpenAI/Groq's Whisper API in the background.
- **Zero-Warning NPM Global Install:** Migrated the core Zero-Copy MessagePack Serialization engine from `msgpackr` to `@msgpack/msgpack`. This eliminates the annoying `allow-scripts` NPM security warning caused by C++ native add-ons during global installation (`npm install -g nyxora`), while still maintaining native memory-speed serialization for the Unix Domain Sockets IPC pipeline.
- **Grammy Telegram Rewrite & Throttler:** Completely rewrote the Telegram Bot module from `telegraf` to `grammy` (saving over 300 lines of legacy code) and implemented `@grammyjs/transformer-throttler` to prevent Telegram API rate limits during heavy agent activities. The bot now natively supports multi-threaded long polling via `@grammyjs/runner`.
- **Timezone-Aware Cron Engine:** Replaced `node-cron` with `croner` for the AI Scheduler. This fixes C++ compilation issues and provides mathematically precise timezone evaluation for background cron tasks.
- **DOM Parsing for Web Search:** Upgraded the `searchWeb` AI skill to use `@mozilla/readability` and `linkedom` for raw HTML DOM parsing. The LLM now receives clean, article-extracted text (without menus/footers) instead of raw HTML or short snippets, significantly improving deep research quality and saving context window tokens.
- **Policy Engine Security & Hot-Reload:** Fortified the Unix Domain Socket Policy Daemon by integrating `zod` for strict payload structure validation, preventing LLM-generated malformed JSON from crashing the Daemon. Additionally integrated `chokidar.watch` to instantly hot-reload `policy.yaml` rules into memory without rebooting the server.
- **Race Condition Immunity:** Wrapped the `tracker.ts` metric gateway using `proper-lockfile`. This fully secures real-time cost and token tracking across the UI Dashboard and Background Daemon, making Nyxora immune to parallel write corruption on `tracker.json`.
- **Vitest & Oxlint Dev Ecosystem:** Migrated the monolithic testing ecosystem to `vitest` for lightning-fast unit tests and integrated `oxlint` into the deployment scripts for instant syntax validation.

### Bug Fixes
- **Policy Engine Zombie Socket:** Patched a critical bug where the Policy Engine lacked a graceful shutdown hook. Previously, stopping the daemon would orphan the Unix Domain Socket (`/tmp/nyxora-policy.sock`) and trigger an `EADDRINUSE` lockup on the next boot. The Policy Engine now safely unlinks its IPC socket upon receiving `SIGTERM`/`SIGINT`.
- **Doctor CLI Port & UDS Calibration:** Updated the `nyxora doctor` utility to properly identify Port 3000 as `Core/Gateway API` and Port 3001 as `Policy Engine Fallback`. Additionally injected a UDS health-check module that proactively scans for and warns users about stale/zombie sockets (`/tmp/nyxora-*.sock`).
- **Documentation Restructure:** Synchronized the VitePress technical documentation (`index.md`, `architecture.md`, `troubleshooting.md`) to accurately reflect the new Unix Domain Sockets (UDS) architecture, removing outdated references to Port 3001. Relocated `bridge-routing.md` to `docs/guide/` and eliminated empty artifact folders.

## [26.6.23-alpha]
### Features & Architectural Upgrades
- **Hybrid API Gateway (HTTP + WebSocket):** Upgraded the core API Gateway (`server.ts`) to operate on a dual HTTP and WebSocket architecture. UI clients now initiate asynchronous tasks via instant HTTP `POST /api/v1/trade` and receive real-time, zero-latency streaming terminal logs via WebSocket (`ws://.../ws/stream?traceId=...`). This definitively eliminates 504 Gateway Timeouts during heavy Web3 transaction analysis.
- **WebSocket Anti-Race Condition (Ring Buffer):** Engineered a 5-second, `traceId`-bound memory Ring Buffer inside the new `WebSocketManager`. This acts as a critical guardrail, caching high-speed logs emitted by the Core Runtime and instantly flushing them to the UI upon WS handshake, guaranteeing zero dropped logs during the microsecond gap between HTTP response and WS connection.
- **Hyper-Optimized IPC (Unix Domain Sockets):** Drastically slashed internal communication latency by migrating the pipeline between `Core Runtime` and `Policy Engine` from standard TCP Loopback (`127.0.0.1:3001`) to native Unix Domain Sockets (`/tmp/nyxora-policy.sock`), routing IPC traffic directly through kernel memory for `< 1ms` hop times.
- **Zero-Copy MessagePack Serialization:** Eliminated Node.js Event Loop blocking caused by massive `JSON.stringify()` operations. The UDS IPC pipeline natively encodes and decodes binary payloads at memory speed.
- **L3 Web Search Failover (Free Built-in Search):** Reintegrated `duck-duck-scrape` as a native Layer-3 fallback safety net for the `searchWeb` skill. The CLI `nyxora setup` now offers "DuckDuckGo (Free & Built-in)" as a zero-configuration provider, enabling rapid onboarding without API keys while acting as an automatic fallback if Tavily/Brave premium keys hit rate limits (HTTP 429).

## [26.6.22-1-alpha]
### Bug Fixes
- **Hotfix: Missing Core Dependency:** Patched a severe global installation crash by explicitly injecting the missing `node-cron` module into the root `package.json` dependency tree. The AI Scheduler background daemon now correctly resolves its dependencies in global NPM environments, fully restoring the `nyxora dashboard` routing capability that was collateral damage from the crash.

## [26.6.22-alpha]
### Features & Enhancements
- **Intelligent First-Time Onboarding:** Introduced a dynamic AI onboarding flow. When a user installs Nyxora for the first time, the `reasoning.ts` engine automatically detects the absence of identity files and enforces an Onboarding Mode. The AI will warmly welcome the user and refuse to execute any commands until it collects 4 essential variables: User's Name, AI's Name, User's Hobbies/Job, and AI's Persona.
- **Persistent Tracker State (Cost & Logs):** Engineered a persistent state caching mechanism for the core `tracker.ts` gateway metric system. Real-time cost, token counts, and terminal Gateway Logs are now asynchronously serialized to disk (`tracker.json`). This ensures runtime state is securely preserved across daemon reboots (`nyxora restart`). Additionally, hooked into the `nyxora stop` lifecycle event to physically purge the cache file, ensuring clean state wipes when the daemon is intentionally shut down.
- **Identity Isolation & Update Tool:** Engineered a brand new `update_identity` LLM tool strictly dedicated to managing the core AI personality (`IDENTITY.md`). This enforces a clean separation of concerns, ensuring `user.md` is strictly for user preferences (via `update_profile`), while the AI's core persona is safely isolated.
- **AI Scheduler (CRON Jobs):** Introduced a new background execution engine using `node-cron`. The Nyxora AI now has `schedule_task` and `cancel_task` system skills, allowing it to understand natural language scheduling prompts (e.g., "Check BTC price every hour" or "Stop monitoring"). The backend `CronManager` autonomously executes these AI prompts in the background and pushes clean, refined analysis reports directly to the user's smartphone via the Nyxora Telegram Bot integration.

### Bug Fixes
- **Idle Server LLM Error 400:** Fixed a critical memory leak causing the AI to crash with an OpenAI 400 Bad Request error when the server was left running 24/7. Background Cron jobs were cross-contaminating the default chat session query, causing the sliding context window to aggressively truncate tool execution sequences in half. Implemented strict `WHERE session_id IS NULL` SQL filtering and a proactive orphaned tool message filter to stabilize 24/7 continuous memory context.
- **Global Reflection Engine (Memory Log) Sync:** Fixed a critical architectural blindspot where the autonomous Reflection Engine (`Memory Log`) failed to extract habits from the Dashboard chat. The Engine was historically designed for a single-session CLI environment and queried the database with `WHERE session_id IS NULL`, rendering it blind to the modern Multi-Session Dashboard chats. The extraction query has been upgraded to a global scope, allowing the AI's Subconscious Brain to holistically analyze the user's latest interactions across all active dashboard tabs.
- **CLI Chat Transaction UI:** Fixed a critical bug in `nyxora chat` where the CLI would blindly skip over transaction approvals (e.g. bridging, swapping). Injected an asynchronous transaction interceptor into the chat loop that actively polls `/api/transactions` and uses `@clack/prompts` to freeze the terminal and render a pop-up confirmation `Approve Transaction [TYPE] on [CHAIN]? (y/n)` directly inside the CLI.
- **Dashboard Metric Desync:** Fixed a UI desynchronization issue on the Dashboard Overview page where the active Chat Sessions count and CRON Jobs count were completely hardcoded to static values. The metrics are now dynamically synced with the active frontend state and the backend `/api/cron` endpoint.

### UI/UX & Layout Fixes
- **Collapsible Sidebar (Hidden Mode):** Introduced a completely new space-saving "Collapsed" mode for the Dashboard sidebar. Users can now toggle the sidebar to hide text labels and recent chat history, retaining only a sleek, icon-only vertical navigation bar with seamless CSS animations and `localStorage` state persistence.
- **Search Chat & Session Filter:** Deployed a new "Search Chat" navigation menu inside the Dashboard. Users can now instantly search and filter their entire historical chat session list in real-time by title, jumping straight back into specific conversations with a single click.
- **Dynamic Theme Integration (Light, Dark, & Auto Mode):** Added full Light Mode, Dark Mode, and Auto (System Default) theme options to the dashboard, complete with dynamic color palettes and improved contrast for terminal logs.

## [26.6.21-alpha]
### Security Fixes
- **Disabled Skill Execution Blocker:** Patched a critical vulnerability where the AI agent (e.g. Gemini) could hallucinate and illegally execute Web3 skills that were explicitly toggled off by the user. The `reasoning.ts` engine now actively intercepts and blocks unauthorized skill calls before execution.
- **On-Chain Parameter Safeguards:** Implemented strict `undefined` parameter validation across all 10 On-Chain skills (Transfer, Swap, Bridge, Mint NFT, Custom Tx, DeFi Yield/Supply, etc.). This prevents the Node.js process from crashing with `TypeError` when the AI provides incomplete or hallucinated JSON tool payloads.
- **Config State Synchronization:** The skill toggle state in the UI is now fully synchronized with `config.yaml`. Disabling a skill securely removes it from the configuration, preventing the LLM from accessing its schema.
- **Cross-Chain Routing Breakdown Prevention:** Patched a severe routing logic flaw in the Mainnet Meta-Aggregator where the KyberSwap provider API (which only supports same-chain swaps) was inadvertently exposed to cross-chain bridging requests. Injected a strict `!isCrossChain` constraint to prevent user funds from being mistakenly swapped into spoofed destination-chain token addresses on the origin network.

### Features & Enhancements
- **Custom Token Whitelist & Auto-Fetch:** Unified the custom token storage architecture by migrating legacy JSON formats into a centralized `user_whitelist.yaml`. Introduced an elegant "Add Custom Crypto" Modal UI in the Dashboard Portfolio with an auto-fetch mechanism that instantly retrieves token symbols and decimals from the blockchain upon pasting a contract address. The AI (LLM) parser now intrinsically reads this YAML whitelist, enabling natural language swaps for manually added memecoins by symbol.
- **Clean Uninstallation Wizard:** Added the `nyxora uninstall` command. Users can now safely and cleanly remove all traces of Nyxora from their system. This wizard securely clears the AI's SQLite memory database, purges stored credentials from the OS Native Keyring, and completely deletes the `~/.nyxora` configuration directory.
- **Interactive CLI Chat (`nyxora chat`):** Introduced a new terminal-based interactive chat interface. Users who prefer the command line can now converse directly with the Nyxora background daemon using `@clack/prompts` without needing to open the web dashboard. Features graceful background-safe exits.
- **Dynamic Dashboard Status Metrics:** Obliterated hardcoded mock values from the Dashboard's Overview page. The Gateway API (`/api/stats`) has been redesigned to actively calculate the total number of loaded Web3 and OS skills in real-time. Additionally, the Memory Storage directory indicator is now dynamically injected based on the user's OS architecture (e.g., `~/.nyxora/data/memory.db`).

## [26.6.20-alpha]
### Features & Enhancements
- **Unified Portfolio Scanner Redesign:** Completely overhauled the `Portfolio.tsx` Dashboard UI to provide a denser, more data-rich aesthetic. Token balances across all chains are now aggregated, flattened, and sorted globally by total USD value, replacing the old tabbed per-chain layout.
- **Dynamic 24h Percentage Change:** Upgraded the core backend (`server.ts`) to actively fetch and cache 24-hour percentage price changes (`h24`) via the DexScreener API. The frontend now dynamically calculates and displays a live, weighted average portfolio change instead of a hardcoded placeholder.
- **Unified Global Chain Filtering:** Integrated a new custom `<NetworkSelector>` into the Portfolio page that syncs seamlessly with the global top-bar. It natively supports an "All Chains" wildcard option, allowing users to instantly filter the aggregated token list by a specific network without losing the unified cross-chain view.
- **Wallet Address Exposure API:** Deployed a new `/api/wallet` core endpoint, allowing the Dashboard frontend to securely fetch and display the user's primary connected wallet address directly inside the Portfolio scanner header.
- **Dynamic Fiat Currency Support:** Upgraded the AI's `get_price` semantic skill to recognize and accept a dynamic `currency` parameter. The system can now instantly translate and format cryptocurrency prices into any global fiat currency (such as IDR, EUR, JPY) based on the user's natural language request.

### UI/UX & Layout Fixes
- **Full-Width Fluid Dashboard Containers:** Stripped legacy `max-width` hard-limiters (1200px) from the root `overview.css` and all primary sidebar panels (`Overview`, `Portfolio`, `Web3 Skills`, `OS Skills`, `Settings`, `RPC`, `DeFi`). The dashboard now natively spans the full horizontal resolution of any monitor edge-to-edge.
- **Flexbox Overlap Patch:** Patched a responsive layout bug in the Portfolio header where long network names (e.g., "Base Sepolia (Testnet)") would physically overlap and bleed into the "Portfolio Scanner" title. Added proper `flexWrap: 'wrap'` and flexible gap spacing to guarantee clean degradation on smaller viewports.

## [26.6.19-alpha]
### Bug Fixes
- **Dashboard Skill Toggle Sync:** Fixed a bug where disabling skills in the `setup` wizard (CLI) did not reflect on the web Dashboard UI. The wizard stored skill names in `camelCase`, but the core AI engine checked for `snake_case` definitions, bypassing the blacklist. A dictionary mapping was added to `setup.ts` to translate names correctly before saving to `disabled_skills.json`.
- **Third-Party LLM Provider Unblocking:** Removed a legacy, hardcoded restriction block in `reasoning.ts` that artificially rejected LLM providers other than OpenAI, Gemini, Ollama, and OpenRouter. Users can now seamlessly connect Groq, xAI (Grok), Mistral, and DeepSeek via the setup wizard, utilizing their native OpenAI SDK compatibility.
- **Google Workspace OAuth Callback Routing:** Fixed a critical bug in the core `server.ts` global authentication middleware where Express.js path mounting behavior implicitly stripped the `/api` prefix from `req.path`. This caused the Google OAuth callback whitelist exception to fail, resulting in an `Unauthorized: Invalid or missing token` error during dashboard login. The middleware now correctly utilizes `req.originalUrl` for accurate bypass verification.


## [26.6.18-alpha]
### Bug Fixes & Build Pipeline
- **NPM Publish Recompilation Fix:** Fixed a critical bug in the NPM `prepare` hook where `npm publish` would skip compiling the core backend TypeScript files. This caused versions `v26.6.16` and `v26.6.17` to inadvertently ship with stale, uncompiled JavaScript `dist/` artifacts. The root `tsc` build step is now explicitly injected into the pre-publish hook to ensure the CLI uses the latest codebase.

## [26.6.17-alpha]
### Bug Fixes
- **CLI Setup API Key Overwrite Bug:** Fixed a race condition during `nyxora setup` where newly entered LLM API keys were successfully written to the config file but instantly overwritten by a stale in-memory config save sequence.
- **Removed Zombie `installSkill` CLI Option:** Removed the legacy `installSkill` selection option from the CLI setup wizard to correctly align with the new fully-native, sandbox-free architecture (introduced in v26.6.15).

## [26.6.16-alpha]
### Bug Fixes & Stability
- **Global `nyxora start` `ENOENT` Crash Fix:** Resolved a critical bug where launching the daemon on a completely fresh install (or after deleting `~/.nyxora`) would instantly crash due to missing nested log and auth directories. The CLI now gracefully auto-creates all deeply nested required structures before attempting to access them.
- **Node.js ESM Compilation Crash (`launcher.ts`):** Stripped out legacy `import.meta.url` syntax in favor of bulletproof CommonJS `__filename` globals. This permanently eliminates the fatal `exports is not defined` parsing crash on newer Node.js versions running compiled production builds.
- **`nyxora unlock` Missing Dependency Panic:** Refactored the dashboard unlock CLI command to utilize native Node.js 18+ `fetch()` APIs, completely removing the hazardous dynamic import to `node-fetch` (which was missing from NPM `dependencies`).
- **NPM Monorepo Resolution Fix:** Stripped the hardcoded `.ts` extension from `safeLogger` imports to prevent `MODULE_NOT_FOUND` errors on compiled production artifacts.
- **`mcp-server` Publishing:** Wired the `mcp-server` into the root compilation step and included its `dist/` artifacts in the `files` array, ensuring the Universal Bridge is fully operational out-of-the-box for NPM installations.

## [26.6.15-alpha]
### Security & Architecture
- **Policy Engine Hard-coded Firewall**: Extracted security constraints (`whitelist_only`, `max_usd_per_tx`, `require_approval`) from `config.yaml` and implemented a fully decoupled backend `policy.yaml` evaluation engine running on a secure local port (3001). This solidifies the Zero-Trust Architecture by guaranteeing rules are enforced prior to cryptographic signing.
- **Unified NLP Semantic Rules**: Migrated `security_policy.md` directly into the `policy.yaml` state (`custom_llm_rules`). AI native skills (`updateSecurityPolicy`) now dynamically append human-language constraints to the centralized policy module, providing a single source of truth for both hard-coded and semantic safeguards.

### UI/UX Enhancements
- **Policy Engine Configuration Panel**: Added a dedicated "Policy Engine (Hard-coded Firewall)" module to the Dashboard Settings page. Users can now easily toggle transaction approvals, strict whitelists, and input custom semantic NLP rules directly from the GUI.
- **Pristine Local Development Logs**: Injected `NODE_NO_WARNINGS=1` environment variables into the core `launcher.ts` monorepo runner. This entirely suppresses noisy `MODULE_TYPELESS_PACKAGE_JSON` CommonJS/ESM reparsing warnings during `npm run dev`, providing a flawless, 100% clean boot log for presentation and development purposes.
- **Internal Version Synchronization**: Synced all sub-packages (`core`, `signer`, `policy`, `mcp-server`) explicitly to `v26.6.15` for consistent NPM publishing.

### Bug Fixes
- **Rapid Graceful Shutdown**: Refactored the core gateway server shutdown sequence to aggressively call `server.closeAllConnections()`. This eliminates the 10-second hang caused by persistent UI polling / SSE connections when stopping the daemon via `CTRL+C`.
- **Market Analysis Cascade Architecture**: Rewired the AI `analyzeMarket` capability in `reasoning.ts` to correctly route through the advanced `analyzeMarketEngine`. This strictly enforces the 3-Tier Cascading Fallback logic (CoinMarketCap  CoinGecko  DexScreener), maximizing market data resilience against API rate-limits.

## [26.6.14-alpha]
### Security & Privacy
- **Isolated Private RPC Vault**: Extracted `web3.rpc_urls` from the main `config.yaml` and moved them into a highly isolated `~/.nyxora/config/rpc_key.yaml` file. This guarantees zero risk of leaking Premium Node Endpoints (Alchemy, Infura) when sharing config files or prompts.
- **Auto-Migration Engine**: Implemented a background migration routine (`parser.ts`) that automatically detects legacy RPC setups and seamlessly extracts, transfers, and wipes them from `config.yaml` during the next daemon boot without data loss.
- **Frontend Key Masking**: Upgraded the new "RPC Configuration" UI to strictly use `type="password"`, ensuring sensitive API keys are never visible in plaintext during screen-sharing or recordings.

### UI/UX Enhancements
- **Dedicated RPC Dashboard**: Added a brand-new "RPC Configuration" tab to the Web Dashboard sidebar, complete with Public Fallback awareness and full support for all Mainnet and Testnet environments.
- **DeFi Configuration Refactor**: Overhauled the "DeFi Configuration" interface layout to utilize a clean, elegant horizontal list design, achieving absolute visual consistency with the new RPC module.
- **Clean Daemon Boot (NPM Suppression)**: Refactored `launcher.ts` and `package.json` to directly invoke local binaries (`./node_modules/.bin/ts-node`), completely bypassing `npx`. This definitively eliminates the annoying `npm warn allow-scripts` console spam during the multi-service boot sequence.

## [26.6.13-alpha]
### Bug Fixes & UX Hardening
- **Telegram Reasoning Leak**: Implemented a strict Regex pre-processor within the Telegram `formatToTelegramHTML` pipeline to silently intercept and annihilate raw `<think>` and `<thought>` Chain of Thought XML tags. This guarantees a clean, distraction-free user experience when integrating reasoning models (like DeepSeek R1) via the Telegram Bot interface.
- **Zero-LLM Fast Return (Instant UI Popups)**: Re-enabled the `fastReturnTools` bypass architecture for all transactional Web3 skills (transfer, swap, bridge, etc.). This optimization skips the redundant secondary LLM summarization phase, cutting transaction generation latency by 3-10 seconds and delivering the UI Approve/Reject popup instantly upon tool completion.
- **One-Liner Transaction UX**: Radically refactored the raw `TRANSACTION_PENDING` LLM string outputs across 9 Web3 modules (Bridge, Swap, Transfer, DeFi Lending, etc.) into ultra-sleek, single-line Markdown formats. This maximizes screen real-estate and delivers an HFT (High-Frequency Trading) aesthetic to the Dashboard and Telegram chat interfaces.
- **Critical KyberSwap Vulnerability Patch**: Fixed a fatal logic bug in the Mainnet Meta-Aggregator where the `txPayload.value` for KyberSwap routes was erroneously mapped to `amountInUsd`. This bug would cause Native ETH swaps to revert (due to insufficient WEI value mismatch) and ERC20 swaps to leak dust ETH. The aggregator now dynamically calculates strict WEI values based on the asset type.

### Cross-Chain Architecture
- **L2 Asynchronous Watcher**: Built a robust Node.js background daemon (`bridgeWatcher.ts`) to autonomously track the 7-day L2-to-L1 challenge periods. This completely modernizes withdrawal operations from blocking UI threads to a passive, state-managed background cron-job.
- **Push Notifications with Inline Actions**: Telegram gateway now natively supports pushing spontaneous server-to-client alerts. The L2 Watcher triggers an immediate Telegram push notification the exact minute an L1 Claim becomes valid, complete with an inline `[ Approve Claim ]` callback button.
- **Universal OP Stack Native Bridge**: Implemented a dedicated `nativeOpBridge.ts` module hardcoded with strictly validated (EIP-55 fully lowercased) `L1StandardBridgeProxy` addresses for both Base Sepolia and OP Sepolia. Nyxora can now encode and simulate native OP Stack portal deposits without relying on external APIs.
- **Testnet Meta-Aggregator Hierarchy**: Overhauled the logic inside `aggregatorTestnet.ts`. The router now intelligently prioritizes the `nativeOpBridge` for all OP Stack chains, gracefully degrading to `fetchRelayTestnet` for Base and `fetchArbitrumBridgeTestnet` for Arbitrum exclusively.

## [26.6.12-alpha]
### Security & Web3 Routing
- **Relay API Mainnet Fallback**: Fixed a critical routing bug for native ETH. The aggregator now precisely translates the native token identifier (`0xeeee...`) into the Zero Address (`0x0000...`) exclusively when communicating with Relay's cross-chain API. This completely neutralizes "Invalid input currency" rejections on mainnet bridges.

### Documentation & Architecture
- **Guarded Autonomy Reboot**: Completely rewrote the core conceptual architecture documents (`guarded_autonomy.md`). Eradicated legacy "Quantitative Scoring Engine" hallucinations, solidly aligning the documentation with Nyxora's actual defense-in-depth architecture: a free-thinking AI sandboxed by an immutable, local NLP Policy Engine interceptor.
- **Slippage & Security Guide**: Added a dedicated, comprehensive page (`slippage.md`) clearly delineating the operational differences between the AI's *Default Slippage* and the strict *Max Allowed Slippage* security hard-limit to educate users on MEV and honeypot attack vectors.
- **Roadmap Cleansing**: Removed completed technical milestones (e.g., Universal MCP Client Integration) from the `roadmap.md`. The roadmap now exclusively highlights high-tier enterprise visions such as the Rust-Native Signer and Multi-VM Solana architecture.

### Maintenance & Refactor
- **Clean Installation Initiative**: Completely removed `exceljs` to eliminate all `npm warn deprecated` warnings (e.g., `inflight`, `rimraf@2`, `glob@7`) during global installations. 
- **Modernized Excel/CSV Engine**: Refactored `generateExcel.ts` and `analyzeDocument.ts` to use ultra-lightweight, zero-dependency modern libraries (`write-excel-file` and `csv-parse`), ensuring a 100% warning-free and vulnerability-free `npm install -g nyxora` experience.

### Dashboard & UI Refactoring
- **Clean Agent Reasoning UI**: Restructured the frontend message rendering (`App.tsx`) to completely isolate and strip out raw `<think>` blocks from the AI's internal Chain of Thought. The user interface is now 100% focused on final outputs, keeping the conversation view clean.
- **Strict Think Block Escaping**: Hardened the system prompt in `reasoning.ts` with a new Anti-Hallucination rule. The AI is now strictly forbidden from injecting conversational text or final answers inside the `<think>` block, completely neutralizing the bug where the UI appeared to be "stuck" due to missing output.

## [26.6.11-2-alpha]
### Hotfixes
- **Monorepo Dependency Resolver**: Fixed an NPM workspace bug by elevating internal package dependencies (`playwright`, `twitter-api-v2`, `@notionhq/client`) directly to the root `package.json`, completely resolving `Error: Cannot find module` crashes during daemon boot.

## [26.6.11-1-alpha]
### Hotfixes
- **Global Installation Path Fix**: Included the compiled `dist/` directory into the NPM tarball, preventing `ts-node` fallback crashes during `nyxora start`.

## [26.6.11-alpha]
### Security
- **Foundry Registry Migration**: Successfully migrated the `NyxoraAgentRegistry` Arbitrum Smart Contract from Hardhat to Foundry, stripping out hundreds of vulnerable NPM dependencies and drastically reducing the attack surface.

### Core AI Engine (Reasoning V2)
- **Zero-Hallucination Framework**: Injected 11 new advanced Critical Rules into the core System Prompt (`reasoning.ts`). The AI is now explicitly forbidden from guessing or hallucinating missing parameters (tokens, chains, amounts) and will gracefully ask for user clarification.
- **Transaction Intent Confirmation**: Mandated a strict 4-step execution flow for all state-changing actions. The AI must gather details, display a markdown summary, await UI approval, and only then execute.
- **Network Safety & Risk Disclosure**: For high-level financial strategies (e.g., "Find yield"), the AI is now required to draft a plan and explicitly disclose major DeFi risks (Impermanent Loss, Smart Contract Risk) before requesting execution approval.

### Web3 Architecture Restructuring
- **Separation of Concerns (SoC)**: Completely restructured the `web3` engine into isolated domains (`aggregator/`, `skills/`, and `config`). The AI business logic (`skills/`) is now entirely decoupled from the routing execution layer, enabling massive scalability without spaghetti code.
- **Testnet/Mainnet Contamination Shield**: Aggregator logic is now strictly split between `aggregatorMainnet.ts` (1inch/0x/LI.FI) and `aggregatorTestnet.ts` (Relay). This absolute physical separation ensures experimental testnet logic can never leak into or crash production mainnet operations.
- **Zero-Trust AI Sandbox**: The AI no longer has direct access to execution paths. It can only call functions within `skills/` to prepare transaction drafts, which are then passed to `defiRouter.ts` for strictly controlled optimal routing.

### Performance & Security
- **Native EOA Transfer Fast-Path**: Integrated a strict `getCode` verification check in `transfer.ts`. If the recipient is confirmed as a pure EOA (`0x`), the AI immediately bypasses costly `estimateGas` dry-runs and injects a raw `21000` gas limit, achieving instant P2P Native Transfers. ZK-aware.
- **JSON-RPC Rate Limit Optimization**: Implemented `batchSize: 100` chunking for all `createPublicClient` HTTP transports, coupled with a WSS Auto-Reconnect mechanism that gracefully degrades to HTTP polling.
- **Multicall Chunking & Self-Healing Cache**: Refactored `tokens.ts` metadata fetching using batched `multicall` with persistent self-healing caching. Added Background Preload Allowance dynamic checking on boot.
- **Independent Parallel Execution**: Refactored `swapToken.ts` to perform Quote fetching and Balance checking in strict parallel via `Promise.all`.
- **Safe-Path Enforcement**: Added mandatory `estimateGas()` dry-runs in complex DeFi transactions to detect reverts before broadcasting, saving user gas fees.
- **Meta-Aggregator Architecture**: Built `defiRouter.ts` to seamlessly route Mainnet transactions to 6 competing APIs (1inch, 0x, LI.FI, Relay, OpenOcean, KyberSwap) for best quotes, while exclusively routing all Testnets (e.g. `base_sepolia`) via Relay to prevent conflicts.
- **DeFi Keys (BYOK) Security**: Added a unified `defiConfigManager.ts` securely saving API Keys in `~/.nyxora/defi_keys.yaml` to prevent leaks. Integrated a Dashboard UI panel with `IS_SET` masking so sensitive keys never return to the browser frontend. Removed all insecure `process.env` dependencies.
- **Unified Chain Registry**: Consolidated all supported Mainnet and Testnet network IDs into a single `chains.ts` registry, completely eliminating hardcoded chain bugs across the Dashboard UI and CLI logic.

## [26.6.10-alpha] - 2026-06-09

### The DeFi Optimization Update
- **DeFi Lending Engine**: Integrated native Aave V3 support across all EVM chains. The AI can now autonomously fetch dynamic `Pool` addresses via `PoolAddressesProvider` and securely draft `supply` payloads to earn yield on idle assets.
- **DeFi Security Guard (Revoke)**: Shipped a critical security skill allowing users to purge "Infinite Approvals". The AI can now construct 0-value `approve()` payloads to instantly revoke access from malicious or vulnerable smart contracts across any chain.
- **DEX LP Manager**: Integrated Uniswap V3 (and PancakeSwap V3 for BSC) liquidity provision. Enforces strict safety barriers by mandating human-in-the-loop input for `tickLower` and `tickUpper` price ranges, completely neutralizing AI hallucination risks in complex liquidity deployments.
- **Auto-Compounder Vaults**: Integrated Beefy Finance (Primary) and Yearn Finance (Secondary). The AI can seamlessly route idle LP tokens into auto-compounding smart contracts to automatically maximize yield.
- **Transaction Chaining (Smart Approve)**: Upgraded the `viem` contract simulator to intelligently read user allowances prior to execution. If a user attempts to supply Aave or deposit to Beefy without prior authorization, the AI will autonomously intercept the request and draft a precise `approve` payload first, drastically improving UX.
### Enterprise Reporting & History
- **Automated Excel Reporting**: The AI can now autonomously generate formatted `.xlsx` reports from raw JSON data (e.g., PnL, token balances) via the new `generate_excel_file` OS Skill.
- **Deep Transaction History**: Integrated `get_tx_history` Web3 skill to fetch complete 30-day (or N-day) history for Native and ERC-20 transfers using the new Unified Etherscan API V2. A single API key now powers cross-chain fetching across 60+ Mainnets and Testnets, featuring a graceful fallback mechanism to public endpoints.

### The Masterpiece Memory Architecture
- **Air-Gapped Security Vault**: Implemented a strict 4-Layer Memory Architecture. The LLM Reflection Engine is now completely air-gapped from the OS Keyring and Wallet System, establishing absolute immunity against memory-based Private Key leakage.
- **Hard-Coded Anti-Injection Validator**: Deployed a rule-based RegExp Validator (`validator.ts`) acting as the ultimate gatekeeper before SQLite insertion. It autonomously detects and annihilates Private Keys, 12/24 BIP-39 Seed Phrases, API Tokens, and System Prompt Override attempts without relying on LLM behavior.
- **Smart Suggestion Engine**: The Agent Reasoning Pipeline now natively hooks into the Layer-2 Episodic Database. By injecting the top 10 most confident habits directly into the System Prompt, Nyxora can now autonomously autocomplete repetitive transaction parameters (e.g., preferred network, preferred token) slashing human-in-the-loop latency by up to 90%.
- **Persistent Background Reflection**: Eliminated static interval timers. The Reflection Engine is now seamlessly triggered via 3 infallible hooks: a 3-minute Idle Timer, an N-Message threshold (every 5 messages), and a `SIGTERM` Graceful Shutdown hook, ensuring resilient memory retention across daemon lifecycles.
- **Real-Time Memory Log Dashboard**: Exposed a robust `/api/memory` CRUD endpoint and integrated a sleek "Memory Log" panel directly into the Web Dashboard Overview tab. Users can now audit, review confidence scores, and forcefully delete false observations in real-time with zero state desynchronization.

## [26.6.9-alpha]
### Security & UX Hardening
- **Zero-Trust Auto-Lock (Passwordless)**: Implemented a robust idle timeout mechanism in the React Dashboard with an elegant glassmorphism blur overlay. The dashboard securely locks after periods of inactivity, requiring the user to authorize unlock directly via the CLI (`nyxora unlock`) to prevent unauthorized local access.
- **Approval Replay Protection (Nonce Guard)**: Hardened the `transactionManager` to cryptographically sign all pending transaction payloads with a randomized 16-byte Nonce. The `/api/transactions/:id/approve` endpoint now strictly enforces Nonce matching and immediately marks it as `used_` upon first validation, completely eliminating double-spending and Replay Attack vectors.
- **Graceful Shutdown (SQLite WAL Guard)**: Integrated deep `SIGTERM` and `SIGINT` signal listeners within the Gateway server. When the daemon is halted, the system now safely terminates active incoming requests and explicitly invokes `logger.close()` to securely flush SQLite Write-Ahead Logs (WAL) before exiting, completely eliminating the risk of database corruption.
- **Resilient UI (Reconnect Overlay)**: Engineered a global network interceptor inside the Dashboard's React `apiFetch` utility. If the daemon goes offline unexpectedly or is restarting, the UI instantly pauses and deploys a transparent, pulsing "Nyxora Daemon Offline" screen. Once the daemon is revived, the overlay automatically lifts, preserving the user's workflow seamlessly.

### Architecture & System Stability
- **Dynamic Port Anti-Collision**: Replaced the hardcoded `3001` Policy Server port with a dynamic `process.env.POLICY_PORT` fallback. All Web3 Agents (Bridge, Swap, Transfer, etc.) are now dynamically linked to this environment variable, completely eliminating `ECONNREFUSED` crashes when port 3001 is occupied by other local developer applications.
- **Robust Path Resolution**: Eliminated hardcoded `process.cwd()` dependencies across the Gateway, Dashboard, and Plugin Manager. The CLI now utilizes robust absolute `__dirname` and `getAppDir()` traversal, guaranteeing the Dashboard UI and External Skills load flawlessly regardless of where the global CLI command is executed from.


## [26.6.8-alpha]
### Enterprise Features & Web3 Enhancements
- **Zero-Downtime Directory Migration**: Restructured the root `~/.nyxora` local data directory into a strict `config/`, `data/`, `auth/`, and `run/` subdirectory architecture. Implemented a Lazy Auto-Migration Engine (`getPath()`) that seamlessly relocates legacy files to their new secure zones instantly upon access, ensuring zero-downtime and zero-data-loss upgrades for existing users.
### Security & UX Updates
- **Proactive Anti-Crash Engine**: Implemented `Max Retry` & `Exponential Backoff` auto-respawn logic inside the Monorepo Launcher. The daemon now features robust global `unhandledRejection` and `uncaughtException` guards across the Core, Policy, and Signer subsystems, ensuring sporadic Web3 network timeouts can no longer crash the main reasoning engine.
- **Death Loop Telegram Alerts**: Integrated a critical emergency monitoring system into the Launcher. If a core microservice crashes catastrophically (5 times within 1 minute), the daemon will autonomously initiate an emergency lock-down to protect the system state and immediately broadcast a high-priority alert directly to the administrator's Telegram.
- **Unix Socket Anti-EADDRINUSE Guard**: Implemented aggressive pre-flight cleanup routines for the `nyxora-signer.sock` IPC channel. The system now guarantees secure file unlinking before rebinding, eliminating recurring `EADDRINUSE` daemon failures upon rapid restart commands.

### Bug Fixes & Optimizations
- **NPM Package Optimization**: Added `assets/` to `.npmignore` to exclude large architectural diagrams and images from the NPM registry tarball, reducing the total package download size by over 11 MB.
- **Docker Multi-Stage Build**: Radically refactored `Dockerfile` to a Multi-Stage architecture. The production image now exclusively installs runtime dependencies (`--omit=dev`) and leaves behind heavy build tools (`python3`, `make`, `g++`), dramatically shrinking the final container image size.
- **Docker Security Patch**: Hardened `.dockerignore` to explicitly block local keystores (`keystore.json`), persistent memory (`memory.db`), and local credentials from accidentally leaking into Docker image layers during local builds.

## [26.6.7-alpha]
### Enterprise Features & Web3 Enhancements
- **Enterprise Portfolio Scanner**: Integrated a fully decentralized, real-time Dashboard UI (Nord Theme) to scan all native and ERC-20 token balances across 8 EVM chains natively, without relying on centralized third-party APIs.
- **Real-Time USD Valuation**: Integrated DexScreener API into the Portfolio Scanner backend to actively compute and display USD portfolio values in real-time. Features an adaptive 2-minute memory cache system to ensure complete immunity against API rate-limits and eliminate LLM token consumption.
- **Official Web3 Branding**: Integrated TrustWallet and CovalentHQ CDNs to automatically resolve and render official Native Chain icons and ERC-20 Token logos with dynamic address casing, delivering an authentic Tier-1 exchange aesthetic.
- **Custom Token Management (AI Skill)**: Deployed the new `manage_custom_tokens` Web3 skill. The AI agent can now autonomously recognize, store, and manage user-specified custom token addresses (e.g., obscure/degen tokens) to `~/.nyxora/custom_tokens.json`. These are instantly synced with the Portfolio Scanner.
- **MEV-Blocker Integration**: Upgraded the Ethereum mainnet routing core in `config.ts` to strictly prioritize `rpc.mevblocker.io` and `rpc.flashbots.net` as primary transports. All user transactions are now forcefully routed through Private Mempools, establishing complete immunity against sandwich attacks and front-running bots.
- **System Diagnosis (`nyxora doctor`)**: Added a new CLI tool `nyxora doctor` to automatically verify OS requirements, node versions, filesystem permissions, SQLite database r/w access, Keyring vault security, and network port availability for seamless troubleshooting.

### Security & UX Updates
- **CLI Wallet Management (`nyxora wallet update`)**: Added a highly requested sub-command to allow users to securely overwrite their OS Keyring Web3 wallet directly via the CLI without having to re-run the full LLM setup wizard. Features an aggressive visual confirmation step to prevent accidental Private Key destruction.
- **Terminal UI Resilience**: Replaced dynamic `note()` text rendering with static linear console logs in the `nyxora setup` wizard. This completely eliminates a UI truncation bug where the `clack` prompter would swallow the 12-word mnemonic phrase on small terminal windows.
- **Helmet CSP Optimization**: Adjusted the Gateway Server's Content Security Policy (CSP) to securely whitelist decentralized image repositories (GitHub raw, CovalentHQ) without compromising strict anti-XSS protection protocols.
- **BIP-39 Mnemonic Generation**: Upgraded the `nyxora setup` CLI wizard. When auto-generating a new wallet, the system now provides a standard 12-word Seed Phrase (Mnemonic) instead of a raw hex Private Key, vastly improving user security and cross-wallet compatibility (e.g., MetaMask). The private key is still autonomously extracted and locked in the OS Keyring.
- **One-Liner Install Script**: Added a new hacker-style `curl | bash` installation method at `https://nyxoraai.github.io/Nyxora/install.sh` for Linux/macOS, and a native PowerShell script `install.ps1` for Windows, providing an instant, frictionless setup experience across all major operating systems.
- **Global Localization Standardization**: Swept and translated the entire AI reasoning log engine (`reasoning.ts`) from Indonesian to standardized English to maintain strict international professional standards across console output and UI feedback.

### Bug Fixes & Optimizations
- **ERC-20 Decimals Resolution**: Completely eradicated a critical math bug where all custom tokens were assumed to have 18 decimals. The backend now executes parallel `decimals()` on-chain queries alongside `balanceOf()`, guaranteeing 100% mathematical precision for tokens like USDC/USDT (6 decimals).
- **NPM Monorepo Build Fix**: Fixed the `packages/core` workspace `package.json` to correctly include the `"build": "tsc"` script and aligned its internal versioning (`v26.6.7`). This resolves the NPM workspace lifecycle crash during global build triggers.
- **NPM Optimization**: Added official keywords (`web3`, `ai`, `agent`, `crypto`, `mcp`, `automation`, `defi`, `zero-trust`) to the root `package.json` to significantly improve Nyxora's discoverability and SEO on the NPM Registry.

## [26.6.6-alpha]
### Enterprise Stability Upgrades
- **Strict LLM Output Validation**: Added robust try-catch parsing for LLM tool arguments in `reasoning.ts`. If the AI outputs malformed JSON, the error is fed back into the reasoning loop, allowing the model to autonomously self-correct without crashing the agent pipeline.
- **Transaction Simulation (Dry-Run)**: Integrated `publicClient.estimateGas` in the Signer Vault before broadcasting transactions. This ensures all Web3 transactions are simulated at the node level, preventing users from wasting gas fees on reverted transactions (e.g., due to insufficient slippage or balance).
- **Graceful Shutdown (Keyring Security)**: Replaced `SIGKILL` with `SIGTERM` in `launcher.ts` and added explicit process termination listeners in the Signer server. When a user exits the CLI using `Ctrl+C`, the system elegantly clears the in-memory `vaultPrivateKey` reference and unlinks unix sockets, securing the local Keyring vault before terminating.
- **Undefined Function Fix**: Fixed a silent `TypeError` bug in `reasoning.ts` where a failed LLM parsing attempt would call an undefined `executeReasoningLoop` function. Now gracefully loops via standard `logger.addEntry` continuation.

### Bug Fixes & UX Enhancements
- **Destructive Config Overwrite Fix**: Fixed a critical bug in `/api/config` where saving settings via the Dashboard UI would silently delete the user's Telegram Bot token and system permissions. The API now performs a deep merge with `config.yaml`.
- **Asynchronous Transaction UI**: Detached the Web3 transaction execution loop from the Dashboard UI `/approve` endpoint. Approvals now instantly return a success state to the UI (preventing 3-minute freezes) while the transaction safely confirms in the background and reports back via chat.

### Performance & Speed Optimizations
- **SQLite Indexing (O(1) Lookup)**: Added an automatic `CREATE INDEX` for `session_id` in the memory logger database, drastically reducing query latency from O(n) full table scans to instantaneous lookups for large chat histories.
- **Sliding Window Context Limit**: Overhauled `getHistory()` with an SQL subquery `LIMIT 40` approach. The agent now only feeds the most recent 40 messages to the LLM context, massively reducing API token costs and preventing latency bloat.
- **Pre-Compiled Runtime (ts-node Elimination)**: Replaced on-the-fly TypeScript compilation (`ts-node`) with ahead-of-time compilation (`tsc`). `launcher.ts` and `nyxora.mjs` now natively detect and execute compiled `.js` files from the `dist/` directory, resulting in near-instant daemon startup times.
- **Global Token Metadata Cache (OOM Protected)**: Implemented an in-memory Bounded LRU Cache (max 1000 items) in `tokens.ts` for caching `decimals` and `symbol`. This eliminates repetitive RPC calls for immutable token data, shielding the system from Out-Of-Memory crashes if spammed with fake tokens.
- **Web3 RPC Parallelization**: Refactored `transfer.ts`, `swapToken.ts`, `bridgeToken.ts`, and `getBalance.ts` to replace slow, sequential `readContract` calls with `Promise.all` fetching via `getTokenMetadata()`. Web3 action preparation latency has been reduced to near 0ms for cached tokens.

## [26.6.5-1.0]
### Bug Fixes & Improvements
- **Transaction Stability**: Added 30-second `AbortSignal` timeout safety net across all Web3 skills (`swapToken`, `transfer`, `bridgeToken`, `mintNft`, `customTx`) to prevent UI hanging when RPC nodes are unresponsive.
- **Multi-Session Transaction Logs**: Fixed an issue where Web3 transaction status messages (Approve/Reject/Success/Failure) were logged to the `default` session instead of the user's active session window, by attaching the correct `sessionId` with `Content-Type: application/json` headers in dashboard API requests.
- **UI Tool Rendering Bug**: Fixed a React rendering bug in `App.tsx` where the AI's internal tool execution notification (green bubble) would be hidden if the AI generated both conversational text and a tool execution in the same response.
- **Base Sepolia Support**: Officially added `base_sepolia` testnet to the supported networks list and `bridgeToken` mappings to prevent AI confusion when resolving bridge destinations.
- **Default Policy Override (Plug & Play)**: Adjusted the default `config.yaml` template and internal Policy Engine defaults to set `allow_transfer`, `allow_swap`, `allow_shell_execution`, and `allow_file_write` to `true`. Also uncapped `max_usd_per_tx` to `$999,999,999` by default, ensuring a seamless "plug and play" experience for new users without needing manual configuration edits.
- **Viem RPC Timeout**: Injected a strict 15-second timeout inside the `signer` vault's `viem` HTTP transport to prevent indefinite freezing during blockchain gas estimation when the node is heavily rate-limited.
- **Auto-Approve Signature Fix**: Added internal HMAC signature generation across all Web3 transaction execution modules (Transfer, Bridge, Mint, CustomTx) to resolve the `Missing internal signature for autoApprove` error during manual dashboard approvals or policy bypasses.
- **LayerZero Testnet Route**: Upgraded the testnet Bridge mock implementation to utilize LayerZero's V2 Endpoint router (`0x1a44...`) for simulated testnet bridging transactions.
- **Transaction Result Formatting**: Fixed an issue where the AI would output raw JSON stringified payloads for successful transactions. The chat notification is now properly formatted to clearly display the transaction hash.
- **Base Sepolia UI Integration**: Synchronized the Dashboard's Network Selector dropdown and Default Web3 Chain settings menu to include the newly added `Base Sepolia (Testnet)` network.
- **LayerZero Mainnet Removal (Stargate V2)**: Completely removed the experimental LayerZero/Stargate V2 integration from the core bridging engine to prevent interaction with potentially outdated or unverified mainnet smart contracts. Removed the corresponding "LayerZero" routing option from the Dashboard UI dropdown to ensure a highly stable and secure bridging experience exclusively via Li.Fi and Relay.
- **Relay MEV Protection (Slippage)**: Hardened the `getRelayQuote` HTTP POST request by injecting a strict `slippageTolerance` parameter (default 0.5%). This closes a critical vulnerability where unbounded Relay executions could expose user funds to front-running and MEV attacks during volatile market conditions.
- **Strict NLP Exactness (Rule 8)**: Injected CRITICAL RULE 8 into the core reasoning pipeline (`reasoning.ts`). The AI is now strictly forbidden from hallucinating or guessing ambiguous transaction parameters (tokens, amounts, or destination networks). It will automatically halt and politely ask the user for explicit clarification before constructing any Web3 payloads.
- **NLP Context Override System**: Documented the NLP fallback override mechanism in `README.md` and Vitepress documentation to clarify how explicit user chat instructions dynamically bypass Dashboard configurations.

### UI/UX Fixes
- **Pending Transactions Widget**: Fixed a rendering bug where the Approve/Reject popup was not being injected into the DOM, preventing users from signing transactions.

### Core AI Engine
- **Strict Language Matching**: Optimized CRITICAL RULE 2 in the System Prompt. The AI now completely ignores historical chat language context and strictly matches the language of the user's latest prompt.

## [26.6.5-alpha] - 2026-06-04 (Hotfix Patch)
### Fixed
- **NPM Monorepo Resolution:** Synced `@inquirer/search` and `duck-duck-scrape` to root `package.json` to prevent `MODULE_NOT_FOUND` and `ERR_CONNECTION_REFUSED` on global installations.

## [26.6.4-alpha]

### AI Engine Optimizations
- **Semantic Keyword Router (Zero-Latency)**: Restructured the `reasoning.ts` pipeline to dynamically group tools into specific clusters (`WEB3`, `SYSTEM`, `GOOGLE`). The engine now intercepts the user's prompt using highly optimized Regex keyword-matching. This eliminates "Context Bloat" by only injecting relevant tools into the LLM payload, dramatically increasing LLM responsiveness and minimizing API token consumption.
- **Zero-LLM Fast Return Expansion**: Expanded the V2 `Fast Return` optimization (which skips the redundant secondary LLM summarization step) to include 7 additional data-heavy read-only tools: `get_price`, `get_my_address`, `analyze_market`, `check_token_security`, `search_web`, `read_gmail_inbox`, and `list_calendar_events`. For these queries, the agent now returns the raw markdown payload instantaneously, cutting response latency by 50-80%.

### Universal LLM Expansion
- **Dictionary Mapping Refactor**: Completely flattened the massive `if-else` blocks in `reasoning.ts` into a highly dynamic 15-line dictionary map. Adding new LLM providers in the future now only takes a single line of code.
- **Expanded Provider Ecosystem**: Added native support for **Groq, Mistral AI, xAI (Grok), dan DeepSeek**, seamlessly integrated into the React Dashboard UI's dropdown. 

### CLI Enhancements
- **Searchable Model Prompt**: Replaced the static `@clack/prompts` list with `@inquirer/search` inside `nyxora setup`. Users can now instantly fuzzy-search their desired AI model out of dozens of variants using their keyboard.
- **2026 Model Roster**: Injected an exhaustive list of the latest frontier models into the CLI (including `gpt-5.5`, `o3-mini`, `gemini-3.1-pro`, `deepseek-reasoner`). A fail-safe `[Tulis Manual / Custom Model]` option is also hardcoded at the bottom of every list.

### Backend Stability (Core Engine)
- **Zero-Crash SQLite (WAL Mode)**: Enabled `PRAGMA journal_mode = WAL` and `busy_timeout = 5000` on the `node:sqlite` database engine (`logger.ts`). This allows parallel reads and writes without throwing fatal `SQLITE_BUSY` (database locked) errors during high-concurrency operations.
- **Anti-Zombie LLM Timeout**: Hardcoded a `timeout: 120000` (120 seconds) limit on the core OpenAI SDK instantiation (`reasoning.ts`). If an external AI provider (e.g., local Ollama or OpenRouter) hangs, the system will now correctly severe the connection and trigger Exponential Backoff rather than freezing indefinitely. Disabled internal SDK retries (`maxRetries: 0`) to prevent retry collisions with Nyxora's native retry wrapper.

### UI & Developer Experience
- **CLI Memory Purge**: Introduced a new developer utility command: `nyxora clear`. It instantly and atomically resets the AI's short-term/long-term memory SQLite database. Includes a mandatory `--force` flag safeguard to prevent accidental data destruction.
## [1.7.3-alpha]

### Web3 Routing & Integrations
- **Multi-Router Selection (DeFi)**: Added a dynamic Router dropdown to the Dashboard UI, allowing users to forcefully route transactions through specific protocols natively. Supported routers include `1inch`, `CowSwap (MEV-Protected)`, `Li.Fi`, `Relay`, `Uniswap V2`, `Uniswap V3`, and `PancakeSwap`. This integration heavily relies on deep aggregator proxying (bypassing the need for complex V2/V3 ABI calldata overhead) to ensure 100% smooth, anti-fail execution without requiring additional API keys.

### Security & Polish
- **Dashboard:** Redacted the sensitive Nyxora Auth Token from appearing in the Gateway Logs component on the frontend to prevent visual leakage during screen sharing or screenshots.

## [1.7.2-alpha]

### UI/UX Enhancements
- **Google Workspace Logout**: Users can now easily disconnect their Google Workspace accounts directly from the Dashboard (OS Skills tab). This triggers a secure token purge from both the OS Keyring and local storage, ensuring privacy and seamless account switching.

### Cloud-Native Deployment
- **Official Docker & GHCR Support**: Added comprehensive Docker containerization support (`Dockerfile`) and automated publishing pipelines to GitHub Container Registry (GHCR). 
- **Docker Documentation**: Added a dedicated `DOCKER.md` guide explaining how to pull, interactively configure, and run the Nyxora daemon via Docker with isolated Volume storage (`/root/.nyxora`).

### Documentation & Compliance
- **Legal Infrastructure**: Added standard `Privacy Policy` (`privacy.md`) and `Terms of Service` (`terms.md`) to the VitePress documentation to prepare for official Google OAuth App Verification.
- **Enterprise Roadmap Evolution**: Updated the documentation roadmap to reflect our "Nyxora Next Update" vision, outlining future plans for a Rust-Native Signer, Idempotent Policy Engine, Multi-VM Architecture, and Google App Verification.

## [1.7.1-alpha]

### CLI Enhancements
- **Global Version Checker**: Implemented native version checking for the global CLI manager. Users can now run `nyxora -v`, `nyxora --version`, or `nyxora version` to instantly check their installed daemon version without starting the application.
- **Smart Web Search Setup Wizard**: The `nyxora setup` command now includes an interactive prompt allowing users to choose their preferred Web Search Engine (Tavily, Brave, or Decentralized Mesh) and configure their API keys.
- **Fast CLI Shortcuts**: Added the `nyxora set-key <provider> <key>` global command shortcut allowing developers to quickly inject or override any API Key (OpenAI, Gemini, OpenRouter, Tavily, Brave) directly into the secure vault without traversing the wizard.

### AI Engine Optimizations

- **Web Search Smart Memory Cache**: Embedded a local Memory Cache (`Map`) into the `searchWeb` skill with a 5-minute (300,000ms) TTL. Exact duplicate queries now execute in 0ms and consume 0 API quota, dramatically improving conversation flow.
- **Deep Research Mode**: The `search_web` tool definition now accepts a dynamic `depth` parameter (1 to 3). If users instruct the AI to conduct comprehensive research, Nyxora will automatically trigger `advanced` API payloads and extract up to 15 top web snippets simultaneously.
- **Strict Skill Prioritization**: Added CRITICAL RULE 7 to the core NLP System Prompt. The AI is now hard-coded to prioritize native Web3 Skills (e.g. `get_price`, `analyze_market`, `check_security`) for all crypto-related queries, using `search_web` exclusively as a fallback mechanism.
- **Dual-Engine Web Search (L3 Failover)**: Completely removed the fragile `duck-duck-scrape` dependency. The `search_web` skill is now powered by a robust L3 Auto-Failover architecture. Users can configure enterprise-grade search providers (Tavily or Brave). If the primary provider hits a rate limit (429) or invalid key (401/403), Nyxora seamlessly falls back to the secondary provider, and ultimately to a Decentralized SearXNG Mesh as a final safety net, guaranteeing 100% uptime.


## [1.7.0-alpha]

### Bug Fixes & Optimizations
- **Time Sync Hallucination**: Fixed a critical issue where the AI hallucinates the current date and time. Nyxora now dynamically injects the host OS's exact `new Date().toLocaleString()` into the system prompt upon every execution.
- **Aggressive UI Auto-Scroll**: Resolved a severe React rendering bug in the dashboard where the 2-second history polling forced the chat window to aggressively scroll to the bottom. Auto-scroll is now strictly isolated to new message arrivals (`messages.length`).
- **Orphaned OS Skills**: Re-wired the `search_web` (Internet Search) and `analyze_document` (PDF/DOCX Extractor) skills back into the core reasoning engine. These skills were previously orphaned and inaccessible to the AI despite being active in the dashboard.
- **Multicall3 Portfolio Engine**: Fully replaced parallel `client.getBalance` and ERC20 fetching with a hyper-efficient `Multicall3` architecture. Balances are now chunked (max 30 tokens per batch) to guarantee zero rate-limits and payload errors on public RPCs.
- **ChatGPT-Level NLP Persona**: Upgraded the AI's core reasoning engine to natively understand unstructured text, slang, and informal contexts. Rigidly enforced Markdown Table generation for all financial data.
- **Telegram HTML Parser**: Implemented a custom `formatToTelegramHTML` function. Nyxora now escapes dangerous characters (`<`, `>`, `&`) and automatically wraps AI-generated Markdown tables into `<pre>` monospaced blocks, completely eliminating the "Bad Request" rendering crash on Telegram.
- **Dynamic Tx Formatter (Tap-to-Copy)**: The post-transaction approval message is now bilingual (auto-detecting English/Indonesian from chat history). Transaction Hashes and wallet addresses are wrapped in `<code>` tags for seamless tap-to-copy UX on mobile devices.
- **CLI Setup Typography**: Updated outdated CLI prompts that falsely referenced legacy `AES-256-GCM` encryption. The CLI now correctly informs the user that Private Keys are securely locked inside the OS Native Keyring Vault.

## [1.6.7-alpha]

### UI/UX
- **New Nyxora Brand Logo**: Replaced the standard dashboard `Bot` icon with a native, 100% transparent SVG component of the Nyxora Cosmic Star.
- **Dashboard Avatar Overhaul**: Removed the rigid box border/shadow surrounding the agent avatar and maximized the logo scale (from 28px to 48px) for a bold, premium aesthetic.
- **SVG Optimization**: Cropped the internal viewBox (padding) of the logo to ensure it renders with maximum density and solidity at any resolution.
- **Favicon Update**: Synchronized the browser tab favicon with the newly optimized Nyxora logo.
- **Network Sync**: Synchronized network dropdown ordering (ETH > BSC > Base > Optimism > Arbitrum > Sepolia) across Dashboard UI, Settings, and CLI setup.

### Developer Experience
- **Single-Command Boot**: Introduced `npm run dev` in the root workspace utilizing `concurrently` to launch the backend orchestrator (Vault/Policy/Core) and the Vite frontend simultaneously, providing a seamless "Plug & Play" dev experience.

### Agent Intelligence
- **Cross-Chain Context**: Upgraded the core LLM prompt to automatically detect network mentions in chat (e.g., "on BNB") and override the default chain dynamically.
- **Portfolio Enforcement**: Instructed the agent to prioritize the comprehensive `check_portfolio` tool when users ask for general balances, while providing polite network confirmations.
- **Dust Asset Precision**: Improved portfolio USD calculations to render micro-assets (< $0.01) up to 4 decimal places (e.g., ~$0.0050) preventing inaccurate $0.00 rounding.
- **"Lean Degen" Auto-Whitelist**: AI now automatically intercepts and permanently saves Contract Addresses (CAs) into `user_whitelist.json` whenever users execute token swaps or check specific balances.
- **Dynamic Portfolio Merging**: The `checkPortfolio` engine now executes a hyper-fast, 0% rate-limit risk Multicall that merges standard tokens, user-defined CAs, and CoinGecko's daily trending list into a clean, unified dashboard report.

### Dual-Engine & OS Skills (Google Workspace MVP)
- **Native Google Integration**: Agent can now autonomously interact with Gmail (`read_gmail_inbox`), Google Calendar (`list_calendar_events`), Google Docs (`read_google_docs`), Google Sheets (`append_row_to_sheets`), and Google Forms (`read_google_form_responses`).
- **Security Upgrade (OS Keyring)**: Completely migrated OAuth token storage to the OS-Native Keyring Vault. Google Refresh Tokens are now securely locked and encrypted by the host OS, preventing plaintext credential theft.
- **Performance Optimization**: Scrapped the heavy `googleapis` dependency in favor of lightweight Native `fetch`, resulting in zero NPM install warnings, smaller footprint, and faster execution.
- **Bugfix**: Resolved TypeScript compilation errors (TS2349) related to the `pdf-parse` ESM dependency.
## [1.6.6-alpha]

### Hotfix: Global Monorepo Dependencies

This release patches a critical bug where global installations via `npm install -g nyxora` would fail to start the daemon due to missing C++ native modules.

#### Fixes
- **Dependency Hoisting Fix**: Explicitly bundled essential runtime modules (isolated-vm, telegraf, @modelcontextprotocol/sdk) into the root package.json to support monolithic publishing.
- **Zero-Crash Boot**: Resolves the MODULE_NOT_FOUND fatal error for isolated-vm when starting the daemon after a clean global install.
- **Dashboard Stability**: Ensures the background API server connects flawlessly to the React Dashboard without encountering Connection Refused.
## [1.6.5-alpha]

### The Universal Bridge (MCP Integration)

Nyxora now natively supports the Model Context Protocol (MCP). This massive upgrade transforms Nyxora from a standalone agent into a Universal Web3 Middleware. External AI clients (like Claude Desktop or Cursor IDE) can now securely interact with the Nyxora ecosystem out-of-the-box.

#### Key Features
- **StdioServerTransport**: Deep integration allowing Claude Desktop to securely spawn Nyxora as a child process.
- **Universal Bridge**: Exposes Nyxora's core crypto actions (swap, transfer, market analysis) as standard MCP Tools.
- **Enterprise Security**: All external MCP commands are strictly routed through Nyxora's battle-tested Policy Engine, ensuring no unauthorized transactions occur.
## [1.6.4-alpha]

### Added
- **Node.js Native Database Engine**: Migrated the core `logger.ts` memory subsystem to use the built-in `node:sqlite` engine (Node 22+), maintaining ultra-fast 100% synchronous operations while dramatically reducing dependency bloat.
- **Next-Gen OS Keyring (N-API)**: Migrated `keytar` to `@napi-rs/keyring`. This replaces legacy C++ bindings with modern Rust/NAPI-RS, retaining identical OS-level security (Mac Keychain, Windows Credential Manager) while eliminating the `prebuild-install` deprecation warning and streamlining global installation.

### Removed
- `better-sqlite3` and `keytar` dependencies entirely removed from the monorepo architecture.

## [1.6.3-alpha]

### Added
- Implemented **Zero-Click Multi-Session** for instantaneous chat creation and switching.
- Introduced **Smart Auto-Naming** for automatic contextual session titles.

### Changed
- **Redesigned Sidebar Architecture**: enhanced utility-centric design, significantly reducing gaps for a compact, elegant look.
- Integrated **OS-Native Keyring**, replacing legacy AES-256-GCM and Master Password mechanics.
- Updated and cleaned up legacy cryptography references in VitePress guides and README.

### Fixed
- Resolved deeply-nested monorepo CI/CD deployment failures by isolating `package-lock.json` and mitigating peer-dependency conflicts.

## [1.4.5-alpha]

### Fixed
- Re-rendered Architecture Workflow diagram as a solid-background PNG to fix dark mode visibility issues.
- Added `assets` directory to the NPM package `files` list so the diagram is included in published packages.
- Added `repository` field in `package.json` for proper GitHub link resolution on NPMJS.
- Updated `README.md` to use the absolute raw GitHub image URL for universal rendering compatibility.

## [1.4.4-alpha]

### Fixed
- Fixed Architecture Workflow diagram rendering issue on NPM by replacing the `mermaid` code block with a static SVG image.

## [1.4.3-alpha]

### Changed
- Completely rewrote `README.md` (English) to follow the structured, security-first Web3-Ops template. 

## [1.4.2-alpha]

### Changed
- Updated `README.md` to highlight Web3-Ops capabilities (System Automation, NLP Security Policies, and Dynamic Plugins).

## [1.4.0-alpha]

### Added
- **System Automation Capabilities**: Allow Nyxora to execute shell commands, read/write local files, and browse the web autonomously.
- **NLP Security Policy**: Users can enforce rules (e.g. "do not touch partition E") in plain text via the chat, which Nyxora respects autonomously.
- **Plugin System**: Dynamically load third-party skills from the `src/external_skills` folder without modifying the core codebase.

### Changed
- Moved AI initialization logic to support dynamic importing of external skills.
- UI Settings: Fixed a fatal rendering bug when the configuration lacks `api_keys` array formatting.

### Fixed
- Fixed bug on rendering Settings menu due to incorrect `config.yaml` types.
