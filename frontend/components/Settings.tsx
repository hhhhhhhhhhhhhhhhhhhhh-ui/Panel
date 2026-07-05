'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import { encrypt, decrypt } from '../lib/crypto';
import { QRCodeSVG } from 'qrcode.react';
import { addActivityLog, getActivityLogs, ActivityLog } from '../lib/storage';
import { 
  Shield, Key, Database, RefreshCw, CheckCircle2, AlertTriangle, 
  Clock, Download, Play, Trash2, ShieldAlert, Check
} from 'lucide-react';

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
}

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function Settings() {
  const { token, masterKey } = useAuth();
  const [enabled2FA, setEnabled2FA] = useState(false);
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  
  // Credentials and API Keys States
  const [megaEmail, setMegaEmail] = useState('');
  const [megaPassword, setMegaPassword] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [claudeKeySet, setClaudeKeySet] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);

  // Load Claude API Key and Mega credentials
  useEffect(() => {
    if (!token) return;
    
    // 1. Fetch Claude Key Config
    axios.get('/api/fb-mcp/config', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      setClaudeKeySet(res.data.claudeApiKeySet);
      if (res.data.claudeApiKey) {
        setClaudeApiKey(res.data.claudeApiKey);
      }
    }).catch(err => console.error('Failed to load Claude key config', err));

    // 2. Load and decrypt MEGA credentials
    if (masterKey) {
      try {
        const encrypted = localStorage.getItem('operator_credentials_vault');
        const nonce = localStorage.getItem('operator_credentials_nonce');
        if (encrypted && nonce) {
          const decryptedJson = decrypt(encrypted, nonce, masterKey);
          const creds = JSON.parse(decryptedJson);
          if (creds.megaEmail) setMegaEmail(creds.megaEmail);
          if (creds.megaPassword) setMegaPassword(creds.megaPassword);
        }
      } catch (e) {
        console.error('Failed to decrypt Mega credentials', e);
      }
    }
  }, [token, masterKey]);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSavingKeys(true);

    try {
      // 1. Save Claude API Key to backend (if updated and not masked)
      if (claudeApiKey && !claudeApiKey.includes('••••')) {
        await axios.post('/api/fb-mcp/config', {
          claudeApiKey: claudeApiKey.trim()
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setClaudeKeySet(true);
      }

      // 2. Save MEGA credentials client-side (encrypted)
      if (masterKey) {
        const credsObj = {
          megaEmail: megaEmail.trim(),
          megaPassword: megaPassword.trim()
        };
        const { ciphertext, nonce } = encrypt(JSON.stringify(credsObj), masterKey);
        localStorage.setItem('operator_credentials_vault', ciphertext);
        localStorage.setItem('operator_credentials_nonce', nonce);
      }

      setSuccess('🔑 API Keys and integration credentials updated successfully!');
      
      if (masterKey) {
        await addActivityLog(
          'Update Credentials',
          'Security Settings',
          'Symmetrically encrypted integration keys updated.',
          masterKey
        );
      }
      loadLogs();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save configuration.');
    } finally {
      setSavingKeys(false);
    }
  };
  
  // Backup manager states
  const [backingUp, setBackingUp] = useState(false);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  const getMegaHeaders = () => {
    const baseHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (masterKey) {
      try {
        const encrypted = localStorage.getItem('operator_credentials_vault');
        const nonce = localStorage.getItem('operator_credentials_nonce');
        if (encrypted && nonce) {
          const decryptedJson = decrypt(encrypted, nonce, masterKey);
          const creds = JSON.parse(decryptedJson);
          if (creds.megaEmail && creds.megaPassword) {
            baseHeaders['x-mega-email'] = creds.megaEmail;
            baseHeaders['x-mega-password'] = creds.megaPassword;
          }
        }
      } catch (e) {
        console.error('Failed to decrypt Mega headers', e);
      }
    }
    return baseHeaders;
  };

  // Fetch list of backups from MEGA
  const fetchBackupsList = async () => {
    if (!token) return;
    setLoadingBackups(true);
    try {
      const res = await axios.get('/api/backup/list', {
        headers: getMegaHeaders()
      });
      setBackups(res.data || []);
    } catch (err) {
      console.error('Failed to fetch backups list', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchBackupsList();
    }
  }, [token]);

  // Run database backup to MEGA
  const handleRunBackup = async () => {
    setError('');
    setSuccess('');
    setBackingUp(true);
    try {
      const res = await axios.post('/api/backup/export', {}, {
        headers: getMegaHeaders()
      });
      
      const { filename, sizeBytes, message } = res.data;
      const formattedSize = formatBytes(sizeBytes);
      
      setSuccess(message || `🛡️ Symmetrically encrypted DB backup successfully uploaded to Mega! File: ${filename}`);

      if (masterKey) {
        await addActivityLog(
          'Database Backup',
          'System Backup',
          `Encrypted SQL dump pushed to Mega storage. Filename: ${filename} (${formattedSize})`,
          masterKey
        );
      }
      
      loadLogs();
      fetchBackupsList();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Database backup export failed.');
    } finally {
      setBackingUp(false);
    }
  };

  // Restore database backup
  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(`⚠️ WARNING: Restoring backup "${filename}" will clear all current tables and inject backup data. This action is irreversible. Proceed?`)) {
      return;
    }

    setError('');
    setSuccess('');
    setRestoringFile(filename);

    try {
      const res = await axios.post('/api/backup/restore', { filename }, {
        headers: getMegaHeaders()
      });

      setSuccess(`✅ ${res.data.message || 'Database successfully restored.'}`);

      if (masterKey) {
        await addActivityLog(
          'Database Restore',
          'System Restore',
          `Restored workspace database state from backup: ${filename}`,
          masterKey
        );
      }

      loadLogs();
      // Reload page after short delay to refresh panel context with new dataset
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Database restore failed.');
    } finally {
      setRestoringFile(null);
    }
  };

  // Load Secure local logs
  const loadLogs = async () => {
    if (masterKey) {
      const activity = await getActivityLogs(masterKey);
      setLogs([...activity].reverse()); // Show newest first
    }
  };

  useEffect(() => {
    loadLogs();
  }, [masterKey]);

  const handleStartSetup = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/2fa/setup', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSetupData(res.data);
    } catch (err: any) {
      setError('Failed to initiate 2FA setup. Please verify server connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode || !setupData || !masterKey) return;

    setError('');
    setLoading(true);
    try {
      await axios.post('/api/auth/2fa/verify', 
        { code: verifyCode, secret: setupData.secret },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setEnabled2FA(true);
      setSuccess('🛡️ Two-Factor Authentication successfully enabled! Your console is now protected.');
      
      await addActivityLog(
        'Enable 2FA',
        'Security Settings',
        'Multi-factor authenticator key registered and validated.',
        masterKey
      );
      
      setSetupData(null);
      setVerifyCode('');
      loadLogs();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification code failed. Please verify sync timing.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-lg shadow-sm select-none">
      
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold text-slate-200">Security & Workspace System</h2>
        <p className="text-xs text-slate-400">Manage time-locked authorization tokens and secure cloud backup recovery.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-950/20 border border-red-900/50 rounded-lg text-xs text-red-400 text-center font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 rounded-lg text-xs text-emerald-400 text-center font-medium">
          {success}
        </div>
      )}

      {/* 2FA/TOTP Setup Card */}
      <div className="p-6 bg-slate-950 border border-slate-850 rounded-lg space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-200">Two-Factor Authentication (TOTP)</h3>
            <p className="text-xs text-slate-500">Secure operator logins with hardware/app-based time-locked codes.</p>
          </div>
          <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
            enabled2FA 
              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50' 
              : 'bg-slate-900 text-slate-500 border-slate-800'
          }`}>
            {enabled2FA ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>

        {!setupData && !enabled2FA && (
          <button
            onClick={handleStartSetup}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
          >
            {loading ? 'Initiating...' : 'Setup Multi-Factor Auth'}
          </button>
        )}

        {setupData && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              
              {/* QR Code Container */}
              <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg flex items-center justify-center shrink-0">
                <QRCodeSVG 
                  value={setupData.otpauthUrl} 
                  size={150} 
                  bgColor="#020617" 
                  fgColor="#e2e8f0" 
                  level="M" 
                  includeMargin={true}
                />
              </div>

              {/* Step-by-Step wizard */}
              <div className="space-y-4 flex-1">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-350 uppercase">Step 1: Scan QR Code</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Scan the QR code with your authenticator application (Google Authenticator, Aegis, 2FAS, or Bitwarden).
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-350 uppercase">Step 2: Backup Secret Key</p>
                  <code className="block p-2 bg-slate-950 border border-slate-850 rounded text-xs font-mono text-slate-200 tracking-wider text-center select-all">
                    {setupData.secret.match(/.{1,4}/g)?.join(' ')}
                  </code>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Save this key in a secure backup container if you lose access to your device.
                  </p>
                </div>
              </div>
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerifySetup} className="border-t border-slate-800 pt-4 flex flex-col md:flex-row items-end gap-4">
              <div className="space-y-1 flex-1">
                <label className="text-xs font-medium text-slate-400" htmlFor="verify-code">
                  Enter 6-digit verification code
                </label>
                <input
                  id="verify-code"
                  type="text"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  disabled={loading}
                  className="w-full px-3 py-2 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 text-sm tracking-widest text-center placeholder-slate-800 focus:outline-none focus:border-slate-700 transition font-mono"
                />
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setSetupData(null)}
                  className="px-4 py-2 bg-slate-900 border border-slate-850 text-slate-400 text-xs font-semibold rounded-lg transition flex-1 md:flex-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || verifyCode.length !== 6}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex-1 md:flex-none"
                >
                  {loading ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* API Keys & Integration Credentials */}
      <div className="p-6 bg-slate-950 border border-slate-850 rounded-lg space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
            <Key className="w-4 h-4 text-indigo-400" />
            API Keys & Integration Credentials
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Configure integration keys for Claude AI Copywriter and client-side encrypted credentials for MEGA backup sync.
          </p>
        </div>

        <form onSubmit={handleSaveCredentials} className="space-y-4 pt-2 border-t border-slate-850">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Claude API Key */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400" htmlFor="claude-key">
                Claude (Anthropic) API Key
              </label>
              <input
                id="claude-key"
                type="password"
                value={claudeApiKey}
                onChange={e => setClaudeApiKey(e.target.value)}
                placeholder={claudeKeySet ? '••••••••••••••••' : 'sk-ant-api03-...'}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs tracking-wider placeholder-slate-700 focus:outline-none focus:border-slate-700 transition font-mono"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Used by the Creative Studio AI copywriter. Saved securely in server-side configuration.
              </p>
            </div>

            {/* Empty space/aligned block */}
            <div className="space-y-1 hidden md:block"></div>

            {/* Mega Email */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400" htmlFor="mega-email">
                MEGA Account Email
              </label>
              <input
                id="mega-email"
                type="email"
                value={megaEmail}
                onChange={e => setMegaEmail(e.target.value)}
                placeholder="operator@mega.nz"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs placeholder-slate-700 focus:outline-none focus:border-slate-700 transition"
              />
            </div>

            {/* Mega Password */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400" htmlFor="mega-pass">
                MEGA Account Password
              </label>
              <input
                id="mega-pass"
                type="password"
                value={megaPassword}
                onChange={e => setMegaPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs tracking-wider placeholder-slate-700 focus:outline-none focus:border-slate-700 transition font-mono"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingKeys}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5"
            >
              {savingKeys ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {savingKeys ? 'Saving...' : 'Save Credentials'}
            </button>
          </div>
        </form>
      </div>

      {/* Encrypted Backups Card */}
      <div className="p-6 bg-slate-950 border border-slate-855 rounded-lg space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-400" />
              Zero-Knowledge Workspace Backups
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Dump and restore symmetrically encrypted SQL states (users, notes, chat logs, mail accounts, and project boards) to your Mega cloud.
            </p>
          </div>

          <button
            onClick={handleRunBackup}
            disabled={backingUp || !token}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
          >
            {backingUp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            {backingUp ? 'Backing up…' : 'Backup Now'}
          </button>
        </div>

        {/* Backups List */}
        <div className="space-y-2 border-t border-slate-850 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Available Recovery Points</span>
            <button onClick={fetchBackupsList} disabled={loadingBackups} className="text-slate-550 hover:text-white transition-colors" title="Reload list">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingBackups && backups.length === 0 ? (
            <div className="flex justify-center py-6">
              <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
            </div>
          ) : backups.length === 0 ? (
            <p className="text-xs text-slate-600 italic py-4 text-center">No backup archives discovered in Mega vault.</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {backups.map(file => (
                <div key={file.name} className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-850 rounded-xl text-xs hover:border-slate-800 transition-all">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-300 truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span>{formatBytes(file.size)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(file.createdAt).toLocaleString()}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestoreBackup(file.name)}
                    disabled={restoringFile !== null}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-bold transition-all active:scale-95 shrink-0"
                  >
                    {restoringFile === file.name ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {restoringFile === file.name ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Zero-Knowledge Local Activity Logs Timeline */}
      <div className="p-6 bg-slate-950 border border-slate-850 rounded-lg space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">🔒 Zero-Knowledge Activity Ledger</h3>
          <p className="text-xs text-slate-500 mt-1">
            All panel actions are symmetrically encrypted client-side and saved only inside this browser. No server can audit these events.
          </p>
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center">No logged events in current browser vault.</p>
        ) : (
          <div className="relative border-l border-slate-800 ml-3 pl-6 space-y-6 pt-2">
            {logs.map((log) => (
              <div key={log.id} className="relative space-y-1">
                <span className="absolute -left-[30px] top-1.5 w-2 h-2 rounded-full bg-slate-700 border border-slate-950"></span>
                
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium">
                  <span className="text-slate-400 font-bold uppercase tracking-wider bg-slate-900 px-2 py-0.5 rounded">
                    {log.moduleName}
                  </span>
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-xs font-semibold text-slate-200">{log.action}</p>
                <p className="text-xs text-slate-400 font-mono leading-relaxed select-text">{log.details}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
