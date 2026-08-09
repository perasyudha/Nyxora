import React, { useState, useEffect } from 'react';
import { PillSelect } from './components/PillSelect';
import { LlmIcon } from './components/LlmIcons';
import { Save, Cpu, Key } from 'lucide-react';
import { apiFetch } from './utils/api';

interface Config {
  agent: {
    max_turns?: number;
    [key: string]: any;
  };
  llm: { 
    provider: string; 
    model: string; 
    temperature: number; 
    base_url?: string; 
    reasoning_effort?: 'low' | 'medium' | 'high';
    image_provider?: string;
    image_model?: string;
  };
  web3?: any;
  credentials?: any;
}

interface ModelsProps {
  config: Config | null;
  onConfigChange: (newConfig: Config) => void;
}

export const Models: React.FC<ModelsProps> = ({ config, onConfigChange }) => {
  const [formData, setFormData] = useState<Config | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (config) {
      setFormData({
        agent: config.agent,
        llm: {
          provider: config.llm?.provider || 'openai',
          model: config.llm?.model || 'gpt-4',
          temperature: config.llm?.temperature || 0.7,
          frequency_penalty: config.llm?.frequency_penalty,
          presence_penalty: config.llm?.presence_penalty,
          repetition_penalty: config.llm?.repetition_penalty,
          base_url: config.llm?.base_url || '',
          reasoning_effort: config.llm?.reasoning_effort || 'medium',
          image_provider: config.llm?.image_provider || 'openai',
          image_model: config.llm?.image_model || ''
        },
        web3: config.web3,
        credentials: config.credentials || {}
      });
    }
  }, [config]);

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => {
      if (!prev) return prev;
      
      const newLlm = { ...prev.llm, [field]: field === 'temperature' ? Number(value) : value };

      if (field === 'provider' && value !== 'custom_provider') {
        newLlm.base_url = '';
      }

      return { ...prev, llm: newLlm };
    });
  };

  const handleAgentChange = (field: string, value: string | number) => {
    setFormData(prev => {
      if (!prev) return prev;
      return { ...prev, agent: { ...(prev.agent || {}), [field]: value } };
    });
  };

  const handleCredentialChange = (key: string, value: string) => {
    setFormData(prev => prev ? { ...prev, credentials: { ...(prev.credentials || {}), [key]: value } } : prev);
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    setSaveStatus('');
    try {
      const res = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setSaveStatus('Saved successfully');
        onConfigChange(formData);
        setTimeout(() => setSaveStatus(''), 3000);
      } else {
        setSaveStatus('Failed to save');
      }
    } catch (e) {
      setSaveStatus('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (!formData) return <div className="overview-container">Loading...</div>;

  return (
    <div className="overview-container" style={{ padding: '24px', width: '100%', margin: '0 auto', color: 'var(--text-secondary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
          <Cpu size={24} color="var(--accent)" />
          Models Configuration
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saveStatus && (
            <span style={{ fontSize: '0.9rem', color: saveStatus.includes('Failed') ? 'var(--danger)' : 'var(--accent)' }}>
              {saveStatus}
            </span>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="save-button"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </div>

      <div className="nord-panel" style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', marginBottom: '24px' }}>
        <div className="nord-panel-header" style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>LLM Engine</h3>
        </div>
        <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Provider</label>
            <PillSelect 
              value={formData.llm.provider}
              onChange={(val) => handleChange('provider', val)}

              options={[
                { id: 'gemini', label: 'Google Gemini', icon: <LlmIcon provider="gemini" size={14} /> },
                { id: 'anthropic', label: 'Anthropic (Claude)', icon: <LlmIcon provider="anthropic" size={14} /> },
                { id: 'openai', label: 'OpenAI', icon: <LlmIcon provider="openai" size={14} /> },
                { id: 'nvidia', label: 'NVIDIA (NIM)', icon: <LlmIcon provider="nvidia" size={14} /> },
                { id: 'openrouter', label: 'OpenRouter', icon: <LlmIcon provider="openrouter" size={14} /> },
                { id: '9router', label: '9Router (Local Proxy)', icon: <LlmIcon provider="9router" size={14} /> },
                { id: 'ollama', label: 'Ollama (Local)', icon: <LlmIcon provider="ollama" size={14} /> },
                { id: 'groq', label: 'Groq', icon: <LlmIcon provider="groq" size={14} /> },
                { id: 'mistral', label: 'Mistral AI', icon: <LlmIcon provider="mistral" size={14} /> },
                { id: 'xai', label: 'xAI (Grok)', icon: <LlmIcon provider="xai" size={14} /> },
                { id: 'deepseek', label: 'DeepSeek', icon: <LlmIcon provider="deepseek" size={14} /> },
                { id: 'custom_provider', label: 'Custom Provider', icon: <LlmIcon provider="custom_provider" size={14} /> }
              ]}
            />
          </div>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Model Name</label>
            <input 
              className="nord-pill-input"
              style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
              type="text" 
              value={formData.llm.model} 
              onChange={e => handleChange('model', e.target.value)} 
            />
          </div>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Temperature ({formData.llm.temperature})</label>
            <input 
              className="nord-slider"
              style={{ width: '100%' }}
              type="range" 
              min="0" max="1" step="0.1"
              value={formData.llm.temperature} 
              onChange={e => handleChange('temperature', e.target.value)} 
            />
          </div>
        </div>
        <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Frequency Penalty ({formData.llm.frequency_penalty ?? 0.6})</label>
            <input 
              className="nord-slider"
              style={{ width: '100%' }}
              type="range" 
              min="-2" max="2" step="0.1"
              value={formData.llm.frequency_penalty ?? 0.6} 
              onChange={e => handleChange('frequency_penalty', parseFloat(e.target.value))} 
            />
          </div>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Presence Penalty ({formData.llm.presence_penalty ?? 0.3})</label>
            <input 
              className="nord-slider"
              style={{ width: '100%' }}
              type="range" 
              min="-2" max="2" step="0.1"
              value={formData.llm.presence_penalty ?? 0.3} 
              onChange={e => handleChange('presence_penalty', parseFloat(e.target.value))} 
            />
          </div>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Repetition Penalty ({formData.llm.repetition_penalty ?? 1.0})</label>
            <input 
              className="nord-slider"
              style={{ width: '100%' }}
              type="range" 
              min="0" max="2" step="0.05"
              value={formData.llm.repetition_penalty ?? 1.0} 
              onChange={e => handleChange('repetition_penalty', parseFloat(e.target.value))} 
            />
          </div>
        </div>
        <div className="form-row" style={{ display: 'flex', gap: '16px' }}>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Reasoning Effort (O1/O3)</label>
            <PillSelect 
              value={formData.llm.reasoning_effort || 'medium'}
              onChange={(val) => handleChange('reasoning_effort', val)}

              options={[
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' }
              ]}
            />
          </div>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Max Auto-Pause Turns ({formData.agent?.max_turns || 50})</label>
            <input 
              className="nord-slider"
              style={{ width: '100%' }}
              type="range" 
              min="10" max="500" step="10"
              value={formData.agent?.max_turns || 50} 
              onChange={e => handleAgentChange('max_turns', parseInt(e.target.value))} 
            />
          </div>
          <div className="form-group flex-1" style={{ flex: 1 }}></div>
        </div>

        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Key size={14} color="var(--accent)" />
            <label style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              {formData.llm.provider.charAt(0).toUpperCase() + formData.llm.provider.slice(1)} API Key
            </label>
          </div>
          <input 
            type="password" 
            placeholder={`Enter API Key for ${formData.llm.provider}...`}
            value={formData.credentials?.[`${formData.llm.provider}_api_key`] || ''} 
            onChange={e => handleCredentialChange(`${formData.llm.provider}_api_key`, e.target.value)} 
            style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '10px 20px', borderRadius: '9999px', fontSize: '0.85rem', outline: 'none' }}
          />
        </div>

        {formData.llm.provider === 'custom_provider' && (
          <div className="form-row" style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
            <div className="form-group flex-1" style={{ flex: 1 }}>
              <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Custom API Base URL</label>
              <input 
                className="nord-pill-input"
                style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                type="text" 
                placeholder="e.g. http://localhost:1234/v1"
                value={formData.llm.base_url || ''} 
                onChange={e => handleChange('base_url', e.target.value)} 
              />
            </div>
          </div>
        )}
      </div>

      <div className="nord-panel" style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
        <div className="nord-panel-header" style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Image Generation Engine</h3>
        </div>
        <div className="form-row" style={{ display: 'flex', gap: '16px' }}>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Provider</label>
            <PillSelect 
              value={formData.llm.image_provider || 'openai'}
              onChange={(val) => handleChange('image_provider', val)}

              options={[
                { id: 'openai', label: 'OpenAI (DALL-E)' },
                { id: 'gemini', label: 'Google Gemini (Native)' }
              ]}
            />
          </div>
          <div className="form-group flex-1" style={{ flex: 1 }}>
            <label className="nord-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Image Model Name</label>
            <input 
              className="nord-pill-input"
              style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
              type="text" 
              placeholder={formData.llm.image_provider === 'gemini' ? "gemini-2.0-flash-exp" : "dall-e-3"}
              value={formData.llm.image_model || ''} 
              onChange={e => handleChange('image_model', e.target.value)} 
            />
          </div>
        </div>

        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Key size={14} color="var(--accent)" />
            <label style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              {formData.llm.image_provider.charAt(0).toUpperCase() + formData.llm.image_provider.slice(1)} API Key (Image)
            </label>
          </div>
          <input 
            type="password" 
            placeholder={`Enter API Key for ${formData.llm.image_provider}...`}
            value={formData.credentials?.[`${formData.llm.image_provider}_api_key`] || ''} 
            onChange={e => handleCredentialChange(`${formData.llm.image_provider}_api_key`, e.target.value)} 
            style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '10px 20px', borderRadius: '9999px', fontSize: '0.85rem', outline: 'none' }}
          />
        </div>
      </div>
    </div>
  );
};

export default Models;
