import React, { useState } from 'react';
import { Key, Upload, Shield, X, CheckCircle, Copy } from 'lucide-react';
import { apiFetch, API_BASE_URL } from '../utils/api';

interface GoogleAuthWizardProps {
  onClose: () => void;
}

export const GoogleAuthWizard: React.FC<GoogleAuthWizardProps> = ({ onClose }) => {
  const [step, setStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const text = await file.text();
      // Basic validation
      const parsed = JSON.parse(text);
      if (!parsed.web && !parsed.installed) {
        throw new Error('Invalid credentials format. Expected "web" or "installed" key.');
      }

      const res = await apiFetch('/api/upload-google-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: parsed })
      });

      if (!res.ok) {
        throw new Error('Failed to upload credentials to server.');
      }

      setUploadSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse JSON file.');
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(46, 52, 64, 0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)'
    }}>
      <div className="panel" style={{ width: '600px', maxWidth: '90%', position: 'relative', overflow: 'hidden' }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'
        }}>
          <X size={20} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: 'rgba(163, 190, 140, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px auto', color: '#a3be8c'
          }}>
            <Shield size={24} />
          </div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Google Workspace Setup</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>
            Configure Nyxora to access your personal Gmail and Google Drive locally.
          </p>
        </div>

        <div style={{ display: 'flex', marginBottom: '24px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: '4px', margin: '0 4px', borderRadius: '2px',
              backgroundColor: s <= step ? 'var(--accent)' : 'var(--tool-bg)',
              transition: 'background-color 0.3s'
            }} />
          ))}
        </div>

        {step === 1 && (
          <div className="wizard-step">
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>Step 1: Create a Google Cloud Project</h3>
            <ol style={{ color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '20px' }}>
              <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Google Cloud Console</a>.</li>
              <li>Create a new project (e.g., "Nyxora Local Agent").</li>
              <li>Navigate to <strong>APIs & Services {'>'} Library</strong>.</li>
              <li>Search for and enable the following APIs:
                <ul style={{ marginTop: '8px', marginBottom: '8px', color: '#a3be8c' }}>
                  <li>Gmail API</li>
                  <li>Google Calendar API</li>
                  <li>Google Drive API</li>
                  <li>Google Docs API</li>
                  <li>Google Sheets API</li>
                  <li>Google Forms API</li>
                </ul>
              </li>
            </ol>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
              <button className="nord-btn-primary" onClick={() => setStep(2)}>Next Step</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>Step 2: Configure OAuth Consent</h3>
            <ol style={{ color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '20px' }}>
              <li>Go to <strong>APIs & Services {'>'} OAuth consent screen</strong>.</li>
              <li>Choose <strong>External</strong> User Type.</li>
              <li>Fill in the App Information. Use the URLs provided below for the App Domain:</li>
            </ol>
            
            <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', marginTop: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Privacy Policy URL:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>https://perasyudha.github.io/privacy</span>
                  <button onClick={() => copyToClipboard('https://perasyudha.github.io/privacy')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><Copy size={13} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Terms of Service URL:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>https://perasyudha.github.io/terms</span>
                  <button onClick={() => copyToClipboard('https://perasyudha.github.io/terms')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><Copy size={13} /></button>
                </div>
              </div>
            </div>

            <ol start={4} style={{ color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '20px' }}>
              <li>Add your personal email to the <strong>Test Users</strong> list so you can bypass app verification.</li>
            </ol>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
              <button className="nord-btn" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }} onClick={() => setStep(1)}>Back</button>
              <button className="nord-btn-primary" onClick={() => setStep(3)}>Next Step</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step">
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>Step 3: Upload Credentials</h3>
            <ol style={{ color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '20px', marginBottom: '24px' }}>
              <li>Go to <strong>APIs & Services {'>'} Credentials</strong>.</li>
              <li>Click <strong>Create Credentials {'>'} OAuth client ID</strong>.</li>
              <li>Choose <strong>Desktop app</strong> (Recommended for CLI) OR <strong>Web application</strong>.</li>
              <li>If you chose Web application, under <strong>Authorized redirect URIs</strong>, add this URI: 
                <ul style={{ marginTop: '8px' }}>
                  <li><code style={{color: 'var(--accent)', padding: '2px 4px', background: 'var(--bg-sidebar)', borderRadius: '4px'}}>{API_BASE_URL}/api/auth/google/callback</code></li>
                </ul>
              </li>
              <li>Click Download JSON and upload the file here:</li>
            </ol>

            {uploadSuccess ? (
              <div style={{ textAlign: 'center', padding: '32px', border: '1px dashed #a3be8c', borderRadius: '8px', backgroundColor: 'rgba(163, 190, 140, 0.05)' }}>
                <CheckCircle size={32} color="#a3be8c" style={{ marginBottom: '16px' }} />
                <h4 style={{ color: '#a3be8c', margin: 0 }}>Credentials Saved!</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>You can now use Google Workspace skills.</p>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input 
                  type="file" 
                  accept=".json"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    opacity: 0, cursor: 'pointer'
                  }}
                />
                <div style={{ 
                  textAlign: 'center', padding: '32px', 
                  border: '1px dashed var(--glass-border)', borderRadius: '8px',
                  backgroundColor: 'rgba(46, 52, 64, 0.5)',
                  transition: 'border-color 0.3s'
                }}>
                  <Upload size={24} color="var(--text-secondary)" style={{ marginBottom: '16px' }} />
                  <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{isUploading ? 'Uploading...' : 'Click or Drag JSON File'}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '8px' }}>
                    Requires <code>client_id</code> and <code>client_secret</code>
                  </p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div style={{ color: '#bf616a', fontSize: '0.85rem', marginTop: '16px', textAlign: 'center' }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
              <button className="nord-btn" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }} onClick={() => setStep(2)}>Back</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
