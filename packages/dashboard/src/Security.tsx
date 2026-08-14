import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, ShieldAlert, Lock, CheckCircle2, Save, Loader2 } from 'lucide-react';
import { apiFetch } from './utils/api';

export const Security: React.FC = () => {
  const [autoApproveTx, setAutoApproveTx] = useState(false);
  const [autoApproveShell, setAutoApproveShell] = useState(false);
  const [maxSpend, setMaxSpend] = useState('100');
  const [blacklist, setBlacklist] = useState('0x000000000000000000000000000000000000dEaD');
  
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'ok' | 'err'} | null>(null);

  const [registryStatus, setRegistryStatus] = useState<{ isActive: boolean; reason?: string } | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const res = await apiFetch('/api/policy');
        const data = await res.json();
        if (data) {
          setAutoApproveTx(!data.require_approval);
          setAutoApproveShell(data.auto_approve_shell || false);
          setMaxSpend(data.max_usd_per_tx?.toString() || '100');
          if (data.blacklisted_addresses && data.blacklisted_addresses.length > 0) {
            setBlacklist(data.blacklisted_addresses.join(', '));
          } else {
            setBlacklist('');
          }
        }
      } catch (err) {
        console.error('Failed to load policy');
      }
    };
    fetchPolicy();
  }, []);

  useEffect(() => {
    fetchRegistryStatus();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        require_approval: !autoApproveTx,
        max_usd_per_tx: parseFloat(maxSpend) || 100,
        auto_approve_shell: autoApproveShell,
        blacklisted_addresses: blacklist.split(',').map(s => s.trim()).filter(s => s.length > 0)
      };
      const res = await apiFetch('/api/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setToast({ msg: 'Policy saved successfully!', type: 'ok' });
      } else {
        setToast({ msg: 'Failed to save policy', type: 'err' });
      }
    } catch (e) {
      setToast({ msg: 'Network error', type: 'err' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const fetchRegistryStatus = async () => {
    setRegistryLoading(true);
    try {
      const res = await apiFetch('/api/registry');
      const data = await res.json();
      setRegistryStatus(data);
    } catch {
      setRegistryStatus(null);
    } finally {
      setRegistryLoading(false);
    }
  };

  return (
    <div className="overview-container" style={{ padding: '24px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '10px' }}>
            <Shield size={24} color="#ef4444" />
          </div>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 700 }}>Security & Guardrails</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Set agent autonomy limits and operational security policies.
            </p>
          </div>
        </div>
        <button onClick={handleSave} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
          {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save
        </button>
      </div>

      {toast && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', background: toast.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: toast.type === 'ok' ? '#10b981' : '#ef4444', border: `1px solid ${toast.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {toast.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '16px', marginBottom: '32px' }}>
        <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h4 style={{ margin: '0 0 4px 0', color: '#f59e0b', fontSize: '0.9rem' }}>Safety Warning</h4>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Settings on this page control the agent's level of autonomy. Enable automatic authorization only if you fully trust the agent and have set a maximum spend limit.
          </p>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '12px' }}>ACTION AUTHORIZATIONS (APPROVALS)</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} color="var(--accent)" /> Web3 Transactions (Send/Swap Tokens)
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Allows the agent to sign blockchain transactions without your explicit approval.</div>
          </div>
          <div onClick={() => setAutoApproveTx(!autoApproveTx)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: autoApproveTx ? '#ef4444' : 'var(--glass-border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '3px', left: autoApproveTx ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: autoApproveTx ? '#fff' : 'var(--text-secondary)', transition: 'left 0.2s' }} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={16} color="var(--accent)" /> Shell Command Execution (Terminal)
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Allows the agent to execute commands directly on your operating system.</div>
          </div>
          <div onClick={() => setAutoApproveShell(!autoApproveShell)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: autoApproveShell ? '#ef4444' : 'var(--glass-border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '3px', left: autoApproveShell ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: autoApproveShell ? '#fff' : 'var(--text-secondary)', transition: 'left 0.2s' }} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '12px' }}>RISK LIMITS</div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '24px' }}>
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px', fontSize: '0.95rem' }}>Maximum Spend Limit (USD)</label>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '12px' }}>The agent will reject transactions estimating a value higher than this limit per transaction.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', fontWeight: 600 }}>$</span>
            <input 
              type="number" 
              value={maxSpend}
              onChange={e => setMaxSpend(e.target.value)}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '10px 16px', borderRadius: '6px', fontSize: '1rem', outline: 'none', width: '150px' }}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '24px' }}>
          <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px', fontSize: '0.95rem' }}>Blacklisted Addresses</label>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '12px' }}>The agent will not be able to send funds or interact with these smart contracts (comma separated).</p>
          <textarea 
            value={blacklist}
            onChange={e => setBlacklist(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem', outline: 'none', minHeight: '80px', resize: 'vertical' }}
          />
        </div>
      </div>

      {/* Kill Switch Section */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '12px' }}>ON-CHAIN KILL SWITCH (BASE SEPOLIA)</div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={16} color="var(--accent)" /> Agent Registry Status
              </div>
              <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                Register your agent on-chain to enable the Kill Switch. Once registered, your controller wallet can deactivate the agent remotely at any time — immediately blocking all transactions.
              </p>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Contract:{' '}
                <a href="https://base-sepolia.blockscout.com/address/0x19F00Ac093B6b0a6Ae2f669dF698384ba79E37Be" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  0x19F00...7Be ↗
                </a>
              </div>
              {registryLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <Loader2 size={14} className="spin" /> Checking on-chain status...
                </div>
              ) : registryStatus ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                    background: registryStatus.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: registryStatus.isActive ? '#10b981' : '#ef4444',
                    border: `1px solid ${registryStatus.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                  }}>
                    {registryStatus.isActive ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {registryStatus.isActive ? 'Agent Active' : 'Agent Blocked'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{registryStatus.reason}</div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Status unavailable</div>
              )}
            </div>
            <button
              onClick={fetchRegistryStatus}
              disabled={registryLoading}
              style={{ padding: '8px 14px', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', borderRadius: '6px', cursor: registryLoading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
            >
              {registryLoading ? <Loader2 size={13} className="spin" /> : <Shield size={13} />} Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Security;
