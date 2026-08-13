import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Settings as SettingsIcon, Brain, Cpu, MessageSquare, Plus, Trash2, Code, Shield, Network, Terminal, RefreshCw, Send, Image as ImageIcon, Sparkles, Edit2, Zap, ArrowRight, Wallet, Check, AlertTriangle, Bot, Activity, Database, Mic, Copy, Search, LayoutDashboard, Key, Server, Sun, Moon, Monitor, PanelLeftClose, PanelLeftOpen, Paperclip, Loader2, BookOpen, Folder, Clock, Plug, Link, User, Landmark, LineChart, TrendingUp, Router, Share2, Pencil, X, Menu } from 'lucide-react';

import NyxoraLogo from './NyxoraLogo';

import ReconnectOverlay from './components/ReconnectOverlay';
import Login from './Login';
import { apiFetch } from './utils/api';
import './index.css';

// Feature Components
import Sessions from './Sessions';
import Models from './Models';
import Logs from './Logs';
import Cron from './Cron';
import Skills from './Skills';
import Plugins from './Plugins';
import WebSearch from './WebSearch';
import Mcp from './Mcp';
import Webhooks from './Webhooks';
import Pairing from './Pairing';
import Profiles from './Profiles';
import RpcConfig from './RpcConfig';
import { DefiConfig } from './DefiConfig';
import { MarketOracles } from './MarketOracles';
import Memory from './Memory';
import Security from './Security';
import Wallets from './Wallets';
import Workflows from './Workflows';
import Gateway from './Gateway';
import OsTerminal from './OsTerminal';
import Hardware from './Hardware';
import System from './System';

interface Config {
  agent: { name: string; default_chain: string; default_router?: string };
  llm: { provider: string; model: string; temperature: number };
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => localStorage.getItem('nyxora_auth') === 'true');
  const [currentView, setCurrentView] = useState<'sessions' | 'models' | 'logs' | 'cron' | 'skills' | 'plugins' | 'websearch' | 'mcp' | 'webhooks' | 'pairing' | 'profiles' | 'rpcconfig' | 'deficonfig' | 'marketoracles' | 'memory' | 'security' | 'wallets' | 'workflows' | 'gateway' | 'osterminal' | 'hardware' | 'system'>('sessions');
  
  const [config, setConfig] = useState<Config | null>(null);
  
  // Auth Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalInput, setAuthModalInput] = useState('');

  // Auto-Lock State
  const [isLocked, setIsLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState<number>(0);
  const lastActivityRef = useRef<number>(0);
  const [autoLockTime, setAutoLockTime] = useState<number>(() => parseInt(localStorage.getItem('nyxora_auto_lock') || '0'));

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>(() => (localStorage.getItem('nyxora_theme') as 'dark' | 'light' | 'auto') || 'auto');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('nyxora_sidebar_collapsed') === 'true');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleNavClick = (view: typeof currentView) => {
    setCurrentView(view);
    setIsMobileOpen(false);
  };



  useEffect(() => {
    document.title = "Nyxora Dashboard";
  }, []);

  useEffect(() => {
    const applyTheme = (currentTheme: 'dark' | 'light' | 'auto') => {
      if (currentTheme === 'auto') {
        const isSystemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        if (isSystemLight) {
          document.body.classList.add('light-theme');
        } else {
          document.body.classList.remove('light-theme');
        }
      } else if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
    };

    applyTheme(theme);
    localStorage.setItem('nyxora_theme', theme);

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      const handler = () => applyTheme('auto');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('nyxora_sidebar_collapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleAuthError = () => {
      setShowAuthModal(true);
    };
    if (!localStorage.getItem('nyxora_token')) {
      setShowAuthModal(true);
    }
    window.addEventListener('nyxora-auth-error', handleAuthError);
    return () => {
      window.removeEventListener('nyxora-auth-error', handleAuthError);
    };
  }, []);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    const handleActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  useEffect(() => {
    const lockCheck = setInterval(() => {
      // Read directly from localStorage to ensure multi-tab sync and avoid stale closures
      const currentAutoLockTime = parseInt(localStorage.getItem('nyxora_auto_lock') || '0');
      if (currentAutoLockTime > 0 && !isLocked && (Date.now() - lastActivityRef.current > currentAutoLockTime * 60 * 1000)) {
        setIsLocked(true);
        setLockedAt(Date.now());
      }
    }, 1000);
    return () => clearInterval(lockCheck);
  }, [isLocked]);

  useEffect(() => {
    let unlockCheck: NodeJS.Timeout;
    if (isLocked) {
      unlockCheck = setInterval(async () => {
        try {
          const res = await apiFetch('/api/status/lock');
          const data = await res.json();
          if (data.lastUnlockRequest && data.lastUnlockRequest > lockedAt) {
            setIsLocked(false);
            lastActivityRef.current = Date.now();
          }
        } catch {}
      }, 1000);
    }
    return () => clearInterval(unlockCheck);
  }, [isLocked, lockedAt]);

  const fetchConfig = async () => {
    try {
      const res = await apiFetch(`/api/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else {
        setTimeout(fetchConfig, 2000);
      }
    } catch (err) {
      setTimeout(fetchConfig, 2000);
    }
  };

  const updateConfig = async (newConfig: Config) => {
    setConfig(newConfig);
    try {
      await apiFetch(`/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
    } catch (err) {
      console.error('Failed to save config', err);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);



  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  if (isLocked) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', flexDirection: 'column' }}>
        <Shield size={64} color="var(--accent)" style={{ marginBottom: '24px' }} />
        <h2 style={{ marginBottom: '8px' }}>Dashboard Locked</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Awaiting unlock request from Terminal/Mobile App.</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '24px' }}>
          Terminal command: <code>nyxora unlock</code>
        </p>
      </div>
    );
  }

  return (
    <>
      <ReconnectOverlay />
      
      {isMobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsMobileOpen(false)} />
      )}

      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header" style={{ padding: '24px 16px', paddingBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', width: '100%' }}>
            {!isSidebarCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <NyxoraLogo size={28} />
                  <h2 style={{ margin: 0, fontSize: '1.1rem', letterSpacing: '-0.02em', color: 'var(--text-primary)', fontWeight: 700 }}>
                    Nyxora<span style={{color: 'var(--accent)'}}>.</span>
                  </h2>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px', paddingLeft: '38px', fontWeight: 600 }}>
                  Gateway Status: <span style={{color: '#10b981'}}>Online</span>
                </div>
              </div>
            )}


            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                background: 'transparent',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)'; }}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>

        <div className="sidebar-scroll-area">
          <nav className="sidebar-nav" style={{ paddingTop: '16px' }}>
            <div className="nav-items-container">



              <div className={`nav-item ${currentView === 'sessions' ? 'active' : ''}`} onClick={() => handleNavClick('sessions')} title={isSidebarCollapsed ? "SESSIONS" : undefined}>
                <MessageSquare size={16} /> {!isSidebarCollapsed && "SESSIONS"}
              </div>


              <div className={`nav-item ${currentView === 'models' ? 'active' : ''}`} onClick={() => handleNavClick('models')} title={isSidebarCollapsed ? "MODELS" : undefined}>
                <Cpu size={16} /> {!isSidebarCollapsed && "MODELS"}
              </div>
              <div className={`nav-item ${currentView === 'skills' ? 'active' : ''}`} onClick={() => handleNavClick('skills')} title={isSidebarCollapsed ? "SKILLS" : undefined}>
                <Code size={16} /> {!isSidebarCollapsed && "SKILLS"}
              </div>
              <div className={`nav-item ${currentView === 'memory' ? 'active' : ''}`} onClick={() => handleNavClick('memory')} title={isSidebarCollapsed ? "MEMORY" : undefined}>
                <Brain size={16} /> {!isSidebarCollapsed && "MEMORY"}
              </div>
              <div className={`nav-item ${currentView === 'security' ? 'active' : ''}`} onClick={() => handleNavClick('security')} title={isSidebarCollapsed ? "SECURITY" : undefined}>
                <Shield size={16} /> {!isSidebarCollapsed && "SECURITY"}
              </div>
              <div className={`nav-item ${currentView === 'cron' ? 'active' : ''}`} onClick={() => handleNavClick('cron')} title={isSidebarCollapsed ? "CRON" : undefined}>
                <Clock size={16} /> {!isSidebarCollapsed && "CRON"}
              </div>
              <div className={`nav-item ${currentView === 'workflows' ? 'active' : ''}`} onClick={() => handleNavClick('workflows')} title={isSidebarCollapsed ? "WORKFLOWS" : undefined}>
                <Zap size={16} /> {!isSidebarCollapsed && "WORKFLOWS"}
              </div>
              <div className={`nav-item ${currentView === 'osterminal' ? 'active' : ''}`} onClick={() => handleNavClick('osterminal')} title={isSidebarCollapsed ? "OS TERMINAL" : undefined}>
                <Terminal size={16} /> {!isSidebarCollapsed && "OS TERMINAL"}
              </div>
              
              {!isSidebarCollapsed && <div className="nav-section-title" style={{ marginTop: '20px', marginBottom: '8px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', paddingLeft: '12px', textTransform: 'uppercase' }}>WEB3 & ASSETS</div>}
              
              <div className={`nav-item ${currentView === 'wallets' ? 'active' : ''}`} onClick={() => handleNavClick('wallets')} title={isSidebarCollapsed ? "WALLETS" : undefined}>
                <Wallet size={16} /> {!isSidebarCollapsed && "WALLETS"}
              </div>
              <div className={`nav-item ${currentView === 'rpcconfig' ? 'active' : ''}`} onClick={() => handleNavClick('rpcconfig')} title={isSidebarCollapsed ? "RPC Config" : undefined}>
                <Cpu size={16} /> {!isSidebarCollapsed && "RPC Config"}
              </div>
              <div className={`nav-item ${currentView === 'deficonfig' ? 'active' : ''}`} onClick={() => handleNavClick('deficonfig')} title={isSidebarCollapsed ? "DeFi Config" : undefined}>
                <Landmark size={16} /> {!isSidebarCollapsed && "DeFi Config"}
              </div>
              <div className={`nav-item ${currentView === 'marketoracles' ? 'active' : ''}`} onClick={() => handleNavClick('marketoracles')} title={isSidebarCollapsed ? "Market Oracles" : undefined}>
                <TrendingUp size={16} /> {!isSidebarCollapsed && "Market Oracles"}
              </div>

              {!isSidebarCollapsed && <div className="nav-section-title" style={{ marginTop: '20px', marginBottom: '8px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', paddingLeft: '12px' }}>SYSTEM & INTEGRATION</div>}

              <div className={`nav-item ${currentView === 'hardware' ? 'active' : ''}`} onClick={() => handleNavClick('hardware')} title={isSidebarCollapsed ? "HARDWARE" : undefined}>
                <Monitor size={16} /> {!isSidebarCollapsed && "HARDWARE"}
              </div>

              <div className={`nav-item ${currentView === 'gateway' ? 'active' : ''}`} onClick={() => handleNavClick('gateway')} title={isSidebarCollapsed ? "GATEWAY" : undefined}>
                <Router size={16} /> {!isSidebarCollapsed && "GATEWAY"}
              </div>
              <div className={`nav-item ${currentView === 'plugins' ? 'active' : ''}`} onClick={() => handleNavClick('plugins')} title={isSidebarCollapsed ? "PLUGINS" : undefined}>
                <Plug size={16} /> {!isSidebarCollapsed && "PLUGINS"}
              </div>
              <div className={`nav-item ${currentView === 'websearch' ? 'active' : ''}`} onClick={() => handleNavClick('websearch')} title={isSidebarCollapsed ? "WEB SEARCH" : undefined}>
                <Search size={16} /> {!isSidebarCollapsed && "WEB SEARCH"}
              </div>
              <div className={`nav-item ${currentView === 'mcp' ? 'active' : ''}`} onClick={() => handleNavClick('mcp')} title={isSidebarCollapsed ? "MCP" : undefined}>
                <Server size={16} /> {!isSidebarCollapsed && "MCP"}
              </div>
              <div className={`nav-item ${currentView === 'webhooks' ? 'active' : ''}`} onClick={() => handleNavClick('webhooks')} title={isSidebarCollapsed ? "WEBHOOKS" : undefined}>
                <Network size={16} /> {!isSidebarCollapsed && "WEBHOOKS"}
              </div>
              <div className={`nav-item ${currentView === 'pairing' ? 'active' : ''}`} onClick={() => handleNavClick('pairing')} title={isSidebarCollapsed ? "PAIRING" : undefined}>
                <Link size={16} /> {!isSidebarCollapsed && "PAIRING"}
              </div>
              <div className={`nav-item ${currentView === 'profiles' ? 'active' : ''}`} onClick={() => handleNavClick('profiles')} title={isSidebarCollapsed ? "PROFILES" : undefined}>
                <User size={16} /> {!isSidebarCollapsed && "PROFILES"}
              </div>
              <div className={`nav-item ${currentView === 'logs' ? 'active' : ''}`} onClick={() => handleNavClick('logs')} title={isSidebarCollapsed ? "LOGS" : undefined}>
                <Activity size={16} /> {!isSidebarCollapsed && "LOGS"}
              </div>
              <div className={`nav-item ${currentView === 'system' ? 'active' : ''}`} onClick={() => handleNavClick('system')} title={isSidebarCollapsed ? "SYSTEM" : undefined}>
                <SettingsIcon size={16} /> {!isSidebarCollapsed && "SYSTEM"}
              </div>
            </div>
          </nav>
          

        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              title="Toggle Menu"
            >
              <Menu size={18} />
            </button>
            <span className="brand-name">Nyxora</span>
            <span className="view-bullet" style={{color: '#3b82f6'}}>•</span>
            <span className="view-name" style={{color: 'var(--text-primary)', textTransform: 'capitalize'}}>
              {currentView}
            </span>
          </div>
          
          <div className="topbar-right">
              <button 
                className="network-selector-pill" 
                style={{ padding: '8px', borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '38px', height: '38px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                onClick={() => {
                  if (theme === 'dark') setTheme('light');
                  else if (theme === 'light') setTheme('auto');
                  else setTheme('dark');
                }}
                title={`Toggle Theme (Current: ${theme})`}
              >
                {theme === 'dark' && <Moon size={18} />}
                {theme === 'light' && <Sun size={18} />}
                {theme === 'auto' && <Monitor size={18} />}
              </button>

            {!config ? (
              <span style={{ color: '#f59e0b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="dot" style={{ background: '#f59e0b', animation: 'pulse 1s infinite' }}></span> Waiting for API Gateway...
              </span>
            ) : null}

          </div>
        </header>

        {currentView === 'sessions' && <Sessions />}

        {currentView !== 'sessions' && (
          <div className="page-scroll-container">
            {currentView === 'models' && <Models config={config} onConfigChange={setConfig} />}
            {currentView === 'logs' && <Logs config={config as any} sessionsCount={1} />}
            {currentView === 'cron' && <Cron />}
            {currentView === 'skills' && <Skills />}
            {currentView === 'plugins' && <Plugins />}
            {currentView === 'websearch' && <WebSearch config={config} onConfigChange={setConfig} />}
            {currentView === 'mcp' && <Mcp />}
            {currentView === 'webhooks' && <Webhooks />}
            {currentView === 'pairing' && <Pairing />}
            {currentView === 'profiles' && <Profiles config={config} onConfigChange={setConfig} autoLockTime={autoLockTime} setAutoLockTime={(v) => { setAutoLockTime(v); localStorage.setItem('nyxora_auto_lock', v.toString()); }} onLogout={() => { setIsAuthenticated(false); localStorage.removeItem('nyxora_auth'); setCurrentView('sessions'); }} />}
            {currentView === 'rpcconfig' && <RpcConfig />}
            {currentView === 'deficonfig' && <DefiConfig />}
            {currentView === 'marketoracles' && <MarketOracles />}
            {currentView === 'memory' && <Memory />}
            {currentView === 'security' && <Security />}
            {currentView === 'wallets' && <Wallets />}
            {currentView === 'workflows' && <Workflows />}
            {currentView === 'osterminal' && <OsTerminal />}
            {currentView === 'system' && <System />}
            {currentView === 'hardware' && <Hardware />}
            {currentView === 'gateway' && <Gateway />}
          </div>
        )}
      </main>

      {showAuthModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'var(--bg-primary)', borderRadius: '16px', padding: '32px', width: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)', border: '1px solid var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <Shield size={28} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary)', fontWeight: 600 }}>Authentication Required</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '24px' }}>
              Please enter your Nyxora Auth Token to connect to the backend server.
            </p>
            <input 
              type="password" 
              placeholder="x-nyxora-token"
              value={authModalInput}
              onChange={(e) => setAuthModalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && authModalInput.trim()) {
                  localStorage.setItem('nyxora_token', authModalInput.trim());
                  window.location.reload();
                }
              }}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '14px 16px', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', marginBottom: '24px' }}
            />
            <button 
              onClick={() => {
                if (authModalInput.trim()) {
                  localStorage.setItem('nyxora_token', authModalInput.trim());
                  window.location.reload();
                }
              }}
              disabled={!authModalInput.trim()}
              style={{ width: '100%', background: 'var(--accent)', border: 'none', color: '#13131a', cursor: authModalInput.trim() ? 'pointer' : 'not-allowed', padding: '14px 20px', borderRadius: '12px', fontWeight: 600, fontSize: '1rem', opacity: authModalInput.trim() ? 1 : 0.5 }}
            >
              Connect to Server
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
