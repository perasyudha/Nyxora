# Contributing to Nyxora

We warmly welcome community contributions! Whether you want to fix a bug, improve documentation, or build a whole new Web3 Plugin, we'd love to have your help. Nyxora is designed to be highly extensible, and the community is at the heart of our mission to build the ultimate zero-trust AI agent framework.

---

## 🏗️ The Plugin Architecture

Nyxora features an extensible **Plugin Architecture** that makes it incredibly easy to add new capabilities (like new DEXs, Oracles, Chains, or external integrations) *without* modifying the core reasoning engine. 

Instead of hacking into complex AI prompt loops, you can simply leverage our robust IoC (Inversion of Control) containers. All third-party capabilities are cleanly sandboxed via our dedicated **`SystemExternalPlugin`** and **`Web3MarketPlugin`** classes.

### ✨ How to Build a New Plugin / Skill
1. **Scaffold with AI**: You don't even have to start from scratch! You can prompt Nyxora's CLI to scaffold a plugin for you using the native `create_agent_skill` tool.
2. **Standardization**: Every skill consists of two files:
   - `execute.ts`: The actual Node.js runtime code for your logic.
   - `SKILL.md`: A strictly formatted YAML frontmatter document defining the tool's schema, arguments, and required security policies.
3. **Registration**: Simply drop your new skill directory into the `packages/core/src/system/skills` or `packages/core/src/web3/skills` folder, and the dynamic Skill Extractor will automatically parse and register it on boot.

> [!TIP]
> For an in-depth tutorial on crafting plugins, please refer to the [Creating Custom Plugins](/plugins/custom-plugins) guide.

---

## ✨ Finding an Issue

If you're looking for a way to contribute but aren't sure where to start, check out the [Issues page](https://github.com/perasyudha/Nyxora/issues) on our GitHub repository.
- Look for issues tagged with `good first issue` for great beginner-friendly tasks.
- Issues tagged with `help wanted` are areas where we explicitly need community assistance.
- Feel free to ask questions in the issue comments if you need clarification before starting work.

---

## 💡 Pull Request Workflow

We use a standard Git workflow for all contributions:

1. **Fork the Repository**: Start by forking the [Nyxora Repository](https://github.com/perasyudha/Nyxora) to your own GitHub account.
2. **Clone Locally**: Clone your fork to your local machine.
   ```bash
   git clone https://github.com/YOUR-USERNAME/Nyxora.git
   cd Nyxora
   ```
3. **Create a Branch**: Always create a descriptive branch name for your work.
   ```bash
   git checkout -b feature/amazing-new-plugin
   # or
   git checkout -b fix/annoying-bug
   ```
4. **Make Your Changes**: Write your code! Ensure you adhere to the project's coding standards and TypeScript typings.
5. **Commit with Convention**: We enforce [Conventional Commits](https://www.conventionalcommits.org/). Use prefixes like `feat:`, `fix:`, `docs:`, or `chore:`.
   ```bash
   git commit -m "feat: add support for Uniswap V3 oracle"
   ```
6. **Push and PR**: Push your branch to your fork and submit a Pull Request to our `main` branch. A maintainer will review your code shortly.

---

## 📌 Running the System Locally

To verify your changes before submitting a PR, you need to compile and run the Nyxora Monorepo locally.

### ✨ Prerequisites
- Node.js (v22+)
- Docker (optional, for isolated sandbox testing)

### ✨ Build Steps
```bash
# 1. Install all dependencies across the workspaces
npm install

# 🖥️ 2. Compile the core engine and dashboard
npm run build

# 3. Start the local daemon and frontend services
npm run dev
```

> [!IMPORTANT]
> When testing Web3 plugins, ensure you run the system against a local fork (like Anvil or Hardhat) or a Testnet. **Never** use a production wallet key with real mainnet funds while developing unverified plugins.
