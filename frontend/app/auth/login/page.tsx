'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { ThemeProvider, useTheme } from '../../../components/ThemeProvider';
import { Eye, EyeOff, Sun, Moon, ArrowLeft } from 'lucide-react';
import axios from 'axios';

function LoginForm() {
  const [isRegister, setIsRegister] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [fetchingSetup, setFetchingSetup] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, token, role } = useAuth();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => { 
    if (token) {
      if (role === 'superadmin') router.push('/superadmin');
      else router.push('/dashboard');
    }
  }, [token, role, router]);

  useEffect(() => {
    axios.get('/api/auth/setup-status').then(res => {
      setNeedsSetup(res.data.needsSetup);
      setIsRegister(res.data.needsSetup);
      setFetchingSetup(false);
    }).catch(() => {
      setFetchingSetup(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    if (requires2FA && !totpCode) { setError('Please enter your 2FA code.'); return; }
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password);
        const currentRole = useAuth.getState().role;
        router.push(currentRole === 'superadmin' ? '/superadmin' : '/dashboard');
      } else {
        const result = await login(email, password, requires2FA ? totpCode : undefined);
        if (result?.requires2FA) { setRequires2FA(true); setLoading(false); return; }
        const currentRole = useAuth.getState().role;
        router.push(currentRole === 'superadmin' ? '/superadmin' : '/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative" style={{ background: 'var(--bg)' }}>
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 p-2 rounded-lg transition text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-sm">
        {fetchingSetup ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent)] text-white mb-4 shadow-lg shadow-[var(--accent)]/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7z"></path></svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text)]">
            {requires2FA ? 'Two-Factor Authentication' : isRegister ? 'Create Superadmin' : 'Secure Login'}
          </h2>
          <p className="text-[var(--muted)] text-sm mt-1">
            {requires2FA ? 'Verify your identity to proceed' : isRegister ? 'Initialize the first administrative account' : 'Enter your credentials to access the console'}
          </p>
        </div>

        {/* Form */}
        <div className="panel p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!requires2FA ? (
              <>
                <div>
                  <label className="label" htmlFor="email">Email address</label>
                  <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com" disabled={loading} className="input-field" />
                </div>
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <div className="relative">
                    <input id="password" type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                      disabled={loading} className="input-field pr-10" />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition">
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted)] text-center">Enter the 6-digit code from your authenticator app.</p>
                <input type="text" maxLength={6} value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000 000" disabled={loading}
                  className="input-field text-center text-2xl tracking-[0.5em] font-mono" />
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Please wait...
                </span>
              ) : requires2FA ? 'Verify code' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Toggle */}
        <div className="mt-4 text-center">
          {requires2FA && (
            <button onClick={() => { setRequires2FA(false); setTotpCode(''); setError(''); }}
              className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] transition mx-auto">
              <ArrowLeft size={14} /> Back to sign in
            </button>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ThemeProvider>
      <LoginForm />
    </ThemeProvider>
  );
}
