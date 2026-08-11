# Comprehensive Installation Guide

Nyxora is designed for a frictionless onboarding experience. We provide a CLI-based Interactive Setup Wizard that guides you from zero to fully operational in minutes.

---

## 🛠️ Prerequisites
Before installing Nyxora, ensure your system meets the following requirements:
1. **Node.js** (Version 22 or higher).
2. **Python 3.10+** (Optional. Nyxora will automatically download a sandboxed Portable Python runtime if missing).
3. A minimum of 2GB RAM.
4. A valid API Key from one of the supported providers (OpenAI, Gemini, Anthropic, OpenRouter, 9Router, Custom Provider, Groq, Mistral, xAI, DeepSeek) or a local Ollama instance.

---

## ⚡ Option 1: One-Line Installer (Recommended)

The cleanest way to install Nyxora. This script automatically handles Node.js setup, installs Nyxora with **zero warnings**, and sets up the Python ML Engine.

**Linux & macOS:**
```bash
curl -fsSL https://perasyudha.github.io/Nyxora/install.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr -useb https://perasyudha.github.io/Nyxora/install.ps1 | iex
```

> ✅ **Zero warnings.** The installer handles all dependency permissions automatically via `--allow-scripts`.

---

## 📦 Option 2: Global Installation (NPM)

If you already have Node.js 22+ installed, you can natively install Nyxora globally via NPM:

```bash
npm install -g nyxora
```

> ℹ️ You may see `npm warn allow-scripts` during install — this is **normal and expected**. All components still install correctly. Run `nyxora setup` afterward to complete the ML Engine setup.

Then get started:
```bash
# ⚙️ Run the interactive setup wizard
nyxora setup

# Start the background daemon
nyxora start

# 🖥️ Open the interactive UI dashboard
nyxora dashboard

# 🖥️ Open the full Terminal UI (interactive dashboard for VPS/CLI users)
nyxora tui

# 💬 Open a simple interactive chat session in terminal
nyxora chat
```

The interactive command-line wizard (`nyxora setup`) guides you through:
1. **AI Engine Selection:** Choose your primary LLM provider (OpenAI, 9Router, Custom Provider, DeepSeek, etc.) and your preferred Web Search provider. Input your API keys or Base URLs securely.
2. **Skill Selection (Pure Assistant Mode):** The CLI will ask if you want to enable Web3 Skills. If you select "No", the CLI generates a `disabled_skills.json` file. This securely locks the agent out of the Web3 Signer and Wallet capabilities, creating a pure, lightweight coding/OS assistant.
3. **Wallet Setup:** Auto-generate or manually securely input an Ethereum/EVM private key into your OS-Native Keyring (if Web3 skills are enabled).
4. **Integration:** Configure dynamic generic channels (Telegram, Discord, Dashboard, and other community plugins).

---

## 💻 Option 3: Local Development (Source Code)

Nyxora operates on a Monorepo architecture using NPM Workspaces. If you want to run it locally from the source code, modify its behaviors, or contribute to the repository, follow these steps:

### 1. Clone the Repository
```bash
git clone https://github.com/perasyudha/Nyxora.git
cd Nyxora
```

### 2. Install Dependencies
Run `npm install` from the root directory to securely install all packages across the monorepo:
```bash
npm install
```

### 3. Build the Packages
Compile the core engine, TUI, MCP Server, and the React Dashboard by running the build script:
```bash
npm run build
```

### ⚙️ 4. Setup and Launch
Once built, run the setup wizard and start the application:
```bash
# ⚙️ Interactive Setup Wizard (Also installs Python ML dependencies via pip)
npm run setup

# Start the Application (Spawns Node.js Core and Python FastAPI sidecar)
npm start

# (Optional) Run the Native Desktop App locally
npm run desktop
> 💡 **Linux Sandbox Compatibility**: The Desktop app automatically applies `--no-sandbox` and `ELECTRON_DISABLE_SANDBOX=1` flags to run safely on Linux distributions without SUID permissions.
```
*(If you are actively developing and modifying the source code, use `npm run dev` to enable hot-reloading for the frontend and backend).*

> ** IMPORTANT:** Whenever you re-run `setup` or manually edit the config files, you **must restart the server** for the changes to take effect.

---

## 🔹 Uninstallation & Reset

If you ever need to securely wipe the AI's episodic memory, delete your API keys, and completely remove Nyxora's configuration from your operating system, simply run:

```bash
nyxora uninstall
```

This acts as a master reset switch to return your environment to a clean state.

