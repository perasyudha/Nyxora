# Contributing to Nyxora 🌌

First off, thank you for considering contributing to Nyxora! It's people like you that make this Zero-Trust Autonomous Web3 Assistant a reality.

## Code of Conduct

By participating in this project, you are expected to uphold our standard community guidelines. Treat everyone with respect and kindness.

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for Nyxora. Following these guidelines helps maintainers understand your report, reproduce the behavior, and find related issues.

*   **Check existing issues:** Before creating a bug report, please check the existing issues to see if the problem has already been reported.
*   **Use the Bug Report Template:** When you create an issue, use the provided Bug Report template.
*   **Provide Context:** Explain how you are running Nyxora (OS, Node version, Local GUI vs CLI).

### Suggesting Enhancements

If you have a great idea for Nyxora, we want to hear it!

*   **Use the Feature Request Template:** Fill out the Feature Request template to help us understand the problem you're solving and the solution you propose.
*   **Keep it Modular:** If your feature is highly specific (e.g., integrating a new obscure DEX or chain), consider proposing it as a **Plugin** rather than a core engine modification.

### Building Plugins

Nyxora features an extensible Plugin Manager! You don't need to modify the core `reasoning.ts` to add capabilities.
Check out the `packages/core/src/web3/plugins/` directory to see how we define Skills and Plugins. Adding a new plugin is the easiest and most welcome way to contribute!

## Local Development Setup

Nyxora uses a Monorepo architecture and employs a strict **Bring Your Own Keys (BYOK)** model.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/perasyudha/Nyxora.git
   cd Nyxora
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Initialize Configuration (Crucial Step):**
   Nyxora **DOES NOT** use `.env` files for API keys to maintain a Zero-Trust threat model. All secrets are stored externally in your OS user directory (`~/.nyxora/`).
   
   Run the interactive setup wizard to configure your local keys:
   ```bash
   npm run setup
   # Or globally: nyxora setup
   ```

4. **Build the Application:**
   ```bash
   npm run build
   ```

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```

## Pull Request Process

1. Fork the repo and create your branch from `main`.
2. Write clean, readable TypeScript code.
3. If you've added code that should be tested, add tests.
4. Ensure the test suite passes (`npm run build` should complete without TypeScript errors).
5. Use the provided Pull Request template and fill in all the details.
6. A maintainer will review your PR and may request changes before merging.

## Coding Standards

- **TypeScript:** We use strict TypeScript. Avoid `any` where possible.
- **Async/Await:** Use `async/await` instead of raw Promises.
- **Error Handling:** Use `try/catch` and provide meaningful error messages, as these are often passed back to the LLM or displayed on the UI.
