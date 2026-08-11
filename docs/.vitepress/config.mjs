import { defineConfig } from 'vitepress'

const globalSidebar = [
  {
    text: '👋 INTRODUCTION',
    items: [
      { text: 'Overview', link: '/' },
      { text: 'Getting Started', link: '/docs' },
      { text: 'Installation Guide', link: '/installation' },
      { text: 'Nyxora Ecosystem', link: '/ecosystem' }
    ]
  },
  {
    text: '🏗️ DEVELOPER & ARCHITECTURE',
    items: [
      { text: 'Technical Architecture', link: '/architecture' },
      { text: 'Cross-Chain Routing', link: '/bridge-routing' },
      { text: 'Codebase Structure', link: '/structure' },
      { text: 'Contributing Guide', link: '/contributing' },
      { text: 'Guarded Autonomy', link: '/guarded_autonomy' },
      { text: 'Memory Architecture', link: '/memory-architecture' },
      { text: 'Nyxora Next Update', link: '/roadmap' }
    ]
  },
  {
    text: '🛡️ OPERATIONS & SECURITY',
    items: [
      { text: 'Base Smart Contract', link: '/smart-contract' },
      { text: 'Wallet Import Guide', link: '/wallet_import' },
      { text: 'OS-Native Keyring Vault', link: '/vault' },
      { text: 'Policy Engine', link: '/sandbox' },
      { text: 'Analytics Dashboard', link: '/dashboard' },
      { text: 'Troubleshooting', link: '/troubleshooting' }
    ]
  },
  {
    text: '⚖️ LEGAL',
    items: [
      { text: 'Privacy Policy', link: '/privacy' },
      { text: 'Terms of Service', link: '/terms' }
    ]
  }
];

export default defineConfig({
  ignoreDeadLinks: true,
  title: "Nyxora Protocol",
  description: "Secure AI execution framework for Web3 agents",
  base: '/Nyxora/',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/Nyxora/favicon.svg' }],
    ['meta', { name: 'talentapp:project_verification', content: 'c2efaae47344a9e37665b659cea484364b58a60fe274af503d41914c26f547eea61393229ee5ba8f49dbdcc088d9eaad66687065bd84181dbacf87c2e70aceb9' }],
    [
      'script',
      { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-NK5D8WN7RE' }
    ],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-NK5D8WN7RE');`
    ]
  ],
  themeConfig: {
    search: {
      provider: 'local'
    },
    logo: { light: '/favicon-light.svg', dark: '/favicon.svg' },
    nav: [
      { text: '🏠 Home', link: '/' },
      { text: '📖 Docs', link: '/docs', activeMatch: '^/(?!$|index\\.html|cli/|mcp/|plugins/|sdk/|core/)' },
      { text: '🧠 Core', link: '/core/native', activeMatch: '^/core/' },
      { text: '💻 CLI Reference', link: '/cli/', activeMatch: '^/cli/' },
      { text: '⚙️ MCP', link: '/mcp/', activeMatch: '^/mcp/' },
      { text: '🔌 Plugin Registry', link: '/plugins/', activeMatch: '^/plugins/' },
      { text: '🧩 Nyxora SDK', link: '/sdk/', activeMatch: '^/sdk/' }
    ],

    sidebar: {
      '/sdk/': [
        {
          text: '🧩 NYXORA SDK FRAMEWORK',
          items: [
            { text: 'Overview & Architecture', link: '/sdk/' },
            { text: 'Core SDK', link: '/sdk/core' },
            { text: 'Policy SDK', link: '/sdk/policy' },
            { text: 'Signer SDK', link: '/sdk/signer' }
          ]
        }
      ],
      '/plugins/': [
        {
          text: '🔌 PLUGIN REGISTRY',
          items: [
            { text: 'System Overview', link: '/plugins/' },
            { text: 'Creating Custom Plugins', link: '/plugins/custom-plugins' },
            { text: 'Custom DeFi Providers', link: '/plugins/defi-providers' }
          ]
        }
      ],
      '/cli/': [
        {
          text: '💻 CLI REFERENCE',
          items: [
            { text: 'Overview & Flags', link: '/cli/' },
            { text: 'Daemon & Interface', link: '/cli/daemon' },
            { text: 'Desktop Application', link: '/cli/desktop' },
            { text: 'TUI Interface', link: '/cli/tui' },
            { text: 'Setup & Diagnostics', link: '/cli/setup' }
          ]
        }
      ],
      '/mcp/': [
        {
          text: '⚙️ MCP INTEGRATION',
          items: [
            { text: 'Overview & Setup', link: '/mcp/' },
            { text: 'Claude Desktop', link: '/mcp/claude' },
            { text: 'Cursor IDE', link: '/mcp/cursor' },
            { text: 'Managing External MCPs', link: '/mcp/external-servers' },
            { text: 'Available Capabilities', link: '/mcp/capabilities' }
          ]
        }
      ],
      '/core/': [
        {
          text: '🧠 CORE CAPABILITIES',
          items: [
            { text: 'Native Skills', link: '/core/native' },
            { text: 'Workflows (Playbooks)', link: '/core/playbooks' },
            { text: 'Python ML Engine', link: '/core/ml-engine' },
            { text: 'Market Intelligence', link: '/core/market-intelligence' },
            { text: 'Web Search & Deep Research', link: '/core/web-search' },
            { text: 'Google Workspace MVP', link: '/core/google-workspace' },
            { text: 'DeFi Configuration', link: '/core/defi-config' },
            { text: 'Market Oracles', link: '/core/market-oracles' },
            { text: 'Understanding Slippage', link: '/core/slippage' },
            { text: 'Chain Specifics', link: '/core/chains' },
            { text: 'Custom RPC Configuration', link: '/core/rpc' },
            { text: 'Etherscan API V2 Key', link: '/core/etherscan' },
            { text: 'NLP Security Policy', link: '/core/nlp' }
          ]
        }
      ],
      '/': globalSidebar
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/perasyudha/Nyxora' },
      { 
        icon: {
          svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="currentColor"/><path d="M15.418 7H17.2L13.3 11.45L17.882 17.5H14.3L11.498 13.84L8.298 17.5H6.518L10.74 12.678L6.37 7H10.052L12.59 10.334L15.418 7ZM14.814 16.434H15.8L9.382 7.962H8.322L14.814 16.434Z" fill="var(--vp-c-bg)"/></svg>'
        }, 
        link: 'https://x.com/Nyxora_AI' 
      },
      {
        icon: {
          svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" fill="currentColor"/></svg>'
        },
        link: 'https://t.me/nyxoraprotocol'
      }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Nyxora Protocol'
    }
  }
})
