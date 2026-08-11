import React, { useState, useEffect } from 'react';
import { Settings, Info } from 'lucide-react';
import { apiFetch } from './utils/api';
import pkg from '../package.json';

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <div onClick={() => onChange(!value)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: value ? 'var(--accent)' : 'var(--glass-border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
    <div style={{ position: 'absolute', top: '3px', left: value ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: value ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'left 0.2s' }} />
  </div>
);

export const System: React.FC = () => {
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    // Fetch initial autostart state
    apiFetch('/api/system/autostart')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.enabled === 'boolean') {
          setAutoStartEnabled(data.enabled);
        }
      })
      .catch(err => console.error("Failed to fetch autostart state:", err));
  }, []);

  const handleToggleAutoStart = async (val: boolean) => {
    if (isChanging) return;
    setIsChanging(true);
    // Optimistic UI update
    setAutoStartEnabled(val);
    try {
      const res = await apiFetch('/api/system/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: val })
      });
      if (!res.ok) {
        // Revert on failure
        setAutoStartEnabled(!val);
        alert("Failed to update Auto-Start configuration.");
      }
    } catch (err) {
      setAutoStartEnabled(!val);
      alert("Network error updating Auto-Start.");
    } finally {
      setIsChanging(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm("Are you sure you want to restart the Nyxora server? The dashboard will disconnect momentarily.")) return;
    try {
      await apiFetch('/api/system/restart', { method: 'POST' });
      
      const checkServer = () => {
        apiFetch('/api/system/autostart')
          .then(() => window.location.reload())
          .catch(() => setTimeout(checkServer, 1000));
      };
      
      // Tunggu 3 detik agar server sempat mati, lalu mulai polling
      setTimeout(checkServer, 3000);
      
    } catch (err) {
      console.error(err);
    }
  };

  const handleShutdown = async () => {
    if (!confirm("DANGER: Are you sure you want to completely shut down the server? You will have to start it manually from the terminal.")) return;
    try {
      await apiFetch('/api/system/shutdown', { method: 'POST' });
      setTimeout(() => {
        alert("Shutdown signal sent. The server is going offline.");
      }, 500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearCache = async () => {
    if (!confirm("Are you sure you want to clear system cache and logs?")) return;
    try {
      const res = await apiFetch('/api/system/clear-cache', { method: 'POST' });
      if (res.ok) {
        alert("System cache and logs cleared successfully!");
      } else {
        alert("Failed to clear cache.");
      }
    } catch (err) {
      alert("Network error while clearing cache.");
    }
  };

  const handleReportBug = () => {
    window.open('https://github.com/perasyudha/Nyxora/discussions', '_blank');
  };

  const handleDonate = () => {
    window.open('https://debank.com/profile/0xe5c21f46993c67cfe04fcf1579486d390be7b535', '_blank');
  };

  return (
    <div className="settings-container styled-scroll" style={{ padding: '32px', width: '100%', boxSizing: 'border-box', overflowY: 'auto', height: '100%' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
        <Settings size={28} color="var(--text-primary)" />
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.6rem', fontWeight: 700 }}>System & Maintenance</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Power controls, cache management, network proxy, and Nyxora details.
          </p>
        </div>
      </div>
      
      <div className="panel" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: '40px' }}>
        <div className="nord-panel-header" style={{ marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
            Power Control
          </h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Restart Server</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Gracefully reboot the system processes.</div>
              </div>
            </div>
            <button onClick={handleRestart} className="nord-btn-primary" style={{ padding: '8px 24px', borderRadius: '6px' }}>Restart</button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Shutdown Server</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Completely halt all backend services.</div>
              </div>
            </div>
            <button onClick={handleShutdown} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 24px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Shutdown</button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: '40px' }}>
        <div className="nord-panel-header" style={{ marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
            Maintenance
          </h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Clear System Cache</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Purge temporary files to free up disk space.</div>
            </div>
            <button onClick={handleClearCache} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Clear
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Auto-Start on Boot</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Automatically launch on system startup.</div>
            </div>
            <Toggle value={autoStartEnabled} onChange={handleToggleAutoStart} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: '40px' }}>
        <div className="nord-panel-header" style={{ marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
            Help & Support
          </h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Report a Bug</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Found an issue? Let us know.</div>
              </div>
            </div>
            <button onClick={handleReportBug} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer' }}>Report</button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Donate</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Support our continuous development!</div>
              </div>
            </div>
            <button onClick={handleDonate} style={{ background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.3)', color: '#ec4899', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Donate</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px 0', marginTop: '8px' }}>
            <Info size={40} color="var(--text-secondary)" opacity={0.5} />
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>Nyxora Agent</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Version: {pkg.version}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default System;
