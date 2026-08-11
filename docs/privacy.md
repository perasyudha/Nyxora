# Privacy Policy

**Effective Date: June 2026**

This Privacy Policy describes how Nyxora ("we", "us", or "our") collects, uses, and shares your information when you use the Nyxora AI Agent and its associated services (the "Service").

## 🏗️ 1. Local-First Architecture
Nyxora is fundamentally designed as a local-first application. 
- All data, including API keys, Google Workspace tokens, and conversational history, are stored locally on your device in the `~/.nyxora` directory.
- We do not host central databases, nor do we harvest or collect your personal data or cryptographic private keys.

## 2. Information Sent to Third Parties
To provide AI and Web3 capabilities, Nyxora must communicate with third-party providers of your choosing:
- **LLM Providers:** (e.g., OpenAI, Anthropic, Google Gemini). Your chat prompts and contextual data are sent to these providers to generate responses.
- **Web Search Engines:** (e.g., Tavily, Brave). Search queries are sent to these engines to fetch real-time data.
- **Google Workspace:** If you connect your Google account, Nyxora will access your Gmail, Calendar, or Docs strictly to perform tasks you explicitly request. We do not store this data centrally.
- **RPC Nodes & Blockchains:** Transaction details are broadcast to public blockchain networks (Ethereum, Polygon, Base, Robinhood, etc.) via RPC endpoints.
- **Social Intelligence APIs:** (e.g., Social Fetch). If you use social media [playbooks](/playbooks), Nyxora will send search queries (such as usernames or topics) and your provided API keys to these services to fetch real-time data from platforms like Twitter, TikTok, and Instagram.

## 🛡️ 3. Data Security
We employ OS-native security mechanisms (such as the OS Keyring via `@napi-rs/keyring`) to encrypt and securely store your sensitive tokens and private keys locally. It is your responsibility to secure the physical access to your device.

## 4. Changes to This Policy
We may update this Privacy Policy from time to time as Nyxora evolves. Any changes will be posted on this page.

## 5. Contact Us
If you have any questions about this Privacy Policy, please open an issue on our [GitHub Repository](https://github.com/perasyudha/Nyxora).
