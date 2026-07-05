'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { decrypt, deriveKey } from '../lib/crypto';

export default function UnlockVault() {
  const { unlockVault } = useAuth();
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockEmail, setUnlockEmail] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const email = localStorage.getItem('user_email') || '';
      setUnlockEmail(email);
    }
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword) return;
    setUnlocking(true);
    setUnlockError('');

    try {
      if (!unlockEmail) {
        setUnlockError('Email is required to derive encryption key.');
        setUnlocking(false);
        return;
      }

      // Derive key locally
      const key = deriveKey(unlockPassword, unlockEmail);

      // Verify key if a vault exists
      const encrypted = localStorage.getItem('operator_credentials_vault');
      const nonce = localStorage.getItem('operator_credentials_nonce');

      if (encrypted && nonce) {
        try {
          decrypt(encrypted, nonce, key);
        } catch (err) {
          setUnlockError('Invalid password. Failed to decrypt credentials vault.');
          setUnlocking(false);
          return;
        }
      }

      // Also verify key against master key vault if it exists
      const masterVault = localStorage.getItem('master_key_vault');
      const masterNonce = localStorage.getItem('master_key_nonce');
      if (masterVault && masterNonce) {
        try {
          decrypt(masterVault, masterNonce, key);
        } catch (err) {
          setUnlockError('Invalid password. Failed to decrypt secure master key.');
          setUnlocking(false);
          return;
        }
      }

      // Update the Zustand auth state
      unlockVault(unlockEmail, unlockPassword);
    } catch (err: any) {
      setUnlockError('Unlock failed: ' + err.message);
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 bg-slate-900 border border-slate-805/70 rounded-xl p-6 shadow-xl space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-slate-950 border border-slate-800 text-xl">
          🔓
        </div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100 font-mono">Unlock Secure Vault</h2>
        <p className="text-xs text-slate-400">
          Your private data is encrypted client-side. Enter your password to derive your decryption key in-browser.
        </p>
      </div>

      {unlockError && (
        <div className="p-3 bg-red-955/20 border border-red-900/50 rounded text-xs text-red-400 font-medium font-mono">
          &gt; {unlockError}
        </div>
      )}

      <form onSubmit={handleUnlock} className="space-y-4 text-xs">
        <div>
          <label className="block text-[10px] text-slate-400 font-semibold uppercase mb-1">
            Account Email
          </label>
          <input
            type="email"
            value={unlockEmail}
            onChange={e => setUnlockEmail(e.target.value)}
            placeholder="e.g. operator@domain.com"
            required
            className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-2 text-slate-200 outline-none focus:border-slate-800 font-mono cursor-text"
          />
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 font-semibold uppercase mb-1">
            Account Password
          </label>
          <input
            type="password"
            value={unlockPassword}
            onChange={e => setUnlockPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-2 text-slate-200 outline-none focus:border-slate-800 font-mono cursor-text"
          />
        </div>

        <button
          type="submit"
          disabled={unlocking}
          className="w-full bg-slate-100 hover:bg-slate-205 text-slate-955 font-bold uppercase py-2.5 rounded-lg transition"
        >
          {unlocking ? 'Verifying Key...' : 'Unlock Vault'}
        </button>
      </form>
    </div>
  );
}
