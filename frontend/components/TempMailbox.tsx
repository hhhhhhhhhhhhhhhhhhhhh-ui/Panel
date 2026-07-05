'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import {
  Mail, Plus, Trash2, RefreshCw, Copy, Check, Inbox,
  Zap, Shield, ChevronRight, X, Loader2, AtSign,
  Clock, User, ExternalLink, ArrowLeft, Sparkles, Eye
} from 'lucide-react';

interface MailboxAccount {
  id?: string;
  address: string;
  token: string;
  created_at?: string;
}

interface Message {
  id: string;
  from: { address: string; name: string };
  subject: string;
  intro: string;
  text?: string;
  html?: string[];
  createdAt: string;
  seen?: boolean;
}

const TIPS = [
  'Temp emails auto-expire. Save important data before deleting.',
  'Use unique usernames to prevent guessing your inbox.',
  'Clicking Refresh polls mail.tm for new messages.',
  'Your mailboxes are stored securely per-account.',
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getInitials(name: string, address: string) {
  if (name && name.trim()) return name.trim().charAt(0).toUpperCase();
  if (address) return address.charAt(0).toUpperCase();
  return '?';
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
];
function avatarColor(str: string) {
  let n = 0;
  for (let i = 0; i < str.length; i++) n += str.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export default function TempMailbox() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [domains, setDomains] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<MailboxAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<MailboxAccount | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [tipIndex, setTipIndex] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  // Form
  const [customUser, setCustomUser] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');

  // Load domains & accounts
  useEffect(() => {
    if (!token) return;
    const fetchDomains = async () => {
      try {
        const res = await axios.get('/api/mail/domains', { headers });
        const members = res.data['hydra:member'] || [];
        const names = members.map((m: any) => m.domain);
        setDomains(names.length ? names : ['secmail.pro', 'mailto.plus']);
        setSelectedDomain(names[0] || 'secmail.pro');
      } catch {
        setDomains(['secmail.pro', 'mailto.plus']);
        setSelectedDomain('secmail.pro');
      }
    };
    const fetchAccounts = async () => {
      try {
        const res = await axios.get('/api/mail/accounts', { headers });
        const data: MailboxAccount[] = res.data;
        setAccounts(data);
        if (data.length > 0) setActiveAccount(data[0]);
        else setShowCreatePanel(true);
      } catch {
        setShowCreatePanel(true);
      }
    };
    fetchDomains();
    fetchAccounts();
  }, [token]);

  // Refresh messages when active account changes
  const refreshMessages = useCallback(async (acct?: MailboxAccount) => {
    const target = acct || activeAccount;
    if (!target?.token) return;
    setRefreshing(true);
    setError('');
    try {
      const res = await axios.post('/api/mail/messages', { token: target.token }, { headers });
      setMessages(res.data['hydra:member'] || []);
    } catch (e: any) {
      setError('Could not reach mail server. Showing cached data.');
    } finally {
      setRefreshing(false);
    }
  }, [activeAccount, token]);

  useEffect(() => {
    if (activeAccount) {
      setSelectedMessage(null);
      setMessages([]);
      refreshMessages(activeAccount);
    }
  }, [activeAccount?.address]);

  // Auto-refresh logic
  useEffect(() => {
    if (autoRefresh && activeAccount) {
      autoRefreshRef.current = setInterval(() => refreshMessages(), 15000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, activeAccount, refreshMessages]);

  // Rotate tips
  useEffect(() => {
    const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  const handleGenerateMailbox = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const username = customUser.trim() || `user${Math.random().toString(36).substring(2, 8)}`;
    const password = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 6);
    const domain = selectedDomain || domains[0] || 'secmail.pro';
    try {
      const res = await axios.post('/api/mail/create-account', { username, password, domain }, { headers });
      const newAcc = res.data as MailboxAccount;
      setAccounts(prev => [newAcc, ...prev]);
      setActiveAccount(newAcc);
      setShowCreatePanel(false);
      setCustomUser('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create mailbox.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this mailbox permanently?')) return;
    try {
      await axios.delete(`/api/mail/accounts/${id}`, { headers });
      const updated = accounts.filter(a => a.id !== id);
      setAccounts(updated);
      if (activeAccount?.id === id) {
        setActiveAccount(updated[0] || null);
        if (!updated[0]) setShowCreatePanel(true);
      }
    } catch {
      setError('Failed to delete mailbox.');
    }
  };

  const copyAddress = async () => {
    if (!activeAccount?.address) return;
    await navigator.clipboard.writeText(activeAccount.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const unreadCount = messages.filter(m => !m.seen).length;

  return (
    <div className="h-full flex flex-col gap-0" style={{ minHeight: 'calc(100vh - 120px)' }}>

      {/* ── Top bar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Disposable Mailbox</h2>
            <p className="text-xs text-slate-400">Catch OTPs & verifications without exposing your real email.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            title={autoRefresh ? 'Auto-refresh ON (every 15s)' : 'Auto-refresh OFF'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              autoRefresh
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Auto'}
          </button>
          <button
            onClick={() => setShowCreatePanel(v => !v)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            New Mailbox
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
          <span>{error}</span>
          <button onClick={() => setError('')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Create panel ── */}
      {showCreatePanel && (
        <div className="mb-5 p-5 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 to-slate-950 shadow-xl shadow-cyan-500/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-white">Generate New Mailbox</span>
            </div>
            {accounts.length > 0 && (
              <button onClick={() => setShowCreatePanel(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <form onSubmit={handleGenerateMailbox}>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex items-center bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-all">
                <AtSign className="w-4 h-4 text-slate-500 ml-3 shrink-0" />
                <input
                  type="text"
                  placeholder="username (optional)"
                  value={customUser}
                  onChange={e => setCustomUser(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
                  className="flex-1 bg-transparent px-2 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
                />
                <select
                  value={selectedDomain}
                  onChange={e => setSelectedDomain(e.target.value)}
                  className="bg-slate-700/60 border-l border-slate-700 px-3 py-2.5 text-sm text-slate-300 outline-none cursor-pointer appearance-none"
                >
                  {domains.map(d => <option key={d} value={d}>@{d}</option>)}
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all active:scale-95 whitespace-nowrap"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Creating…' : 'Generate'}
              </button>
            </div>
            <p className="mt-2.5 text-[10px] text-slate-500 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Password is auto-generated and stored securely.
            </p>
          </form>
        </div>
      )}

      {/* ── Main 3-column layout ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ minHeight: 0 }}>

        {/* ── Left: Account list ── */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mailboxes</span>
            <span className="text-[10px] text-slate-600">{accounts.length} total</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: '65vh' }}>
            {accounts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-slate-800 rounded-2xl text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center">
                  <Inbox className="w-6 h-6 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400">No mailboxes yet</p>
                  <p className="text-xs text-slate-600 mt-1">Create one to get started</p>
                </div>
                <button
                  onClick={() => setShowCreatePanel(true)}
                  className="mt-1 px-4 py-1.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg text-xs font-semibold hover:bg-cyan-500/20 transition-colors"
                >
                  + Create Mailbox
                </button>
              </div>
            )}

            {accounts.map(acc => {
              const isActive = activeAccount?.address === acc.address;
              return (
                <div
                  key={acc.id || acc.address}
                  onClick={() => setActiveAccount(acc)}
                  className={`group relative p-3 rounded-xl border cursor-pointer transition-all ${
                    isActive
                      ? 'bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarColor(acc.address)} flex items-center justify-center shrink-0 text-white text-xs font-bold`}>
                        {acc.address.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${isActive ? 'text-cyan-300' : 'text-slate-300'}`}>
                          {acc.address.split('@')[0]}
                        </p>
                        <p className="text-[10px] text-slate-600 truncate">@{acc.address.split('@')[1]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(acc.address); }}
                        className="p-1 rounded text-slate-500 hover:text-white transition-colors"
                        title="Copy"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {acc.id && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(acc.id!); }}
                          className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {acc.created_at && (
                    <p className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> Created {timeAgo(acc.created_at)}
                    </p>
                  )}
                  {isActive && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Tips */}
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
            <p className="text-[10px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
              <Shield className="w-3 h-3 text-cyan-500/60 mt-0.5 shrink-0" />
              <span key={tipIndex} className="transition-opacity">{TIPS[tipIndex]}</span>
            </p>
          </div>
        </div>

        {/* ── Middle: Message list ── */}
        <div className="lg:col-span-4 flex flex-col bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Inbox header */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
            {activeAccount ? (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    <p className="text-xs font-bold text-white truncate">{activeAccount.address}</p>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 ml-4">
                    {messages.length} message{messages.length !== 1 ? 's' : ''}
                    {unreadCount > 0 && ` · ${unreadCount} new`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyAddress}
                    title="Copy address"
                    className={`p-1.5 rounded-lg transition-all ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => refreshMessages()}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Checking…' : 'Refresh'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-medium">No inbox selected</p>
            )}
          </div>

          {/* Message list body */}
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(65vh - 60px)' }}>
            {!activeAccount ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-slate-600" />
                </div>
                <p className="text-sm font-semibold text-slate-400">Select a mailbox</p>
                <p className="text-xs text-slate-600">Choose a mailbox on the left or create a new one.</p>
              </div>
            ) : refreshing && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
                <p className="text-xs text-slate-500">Fetching messages…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center">
                  <Inbox className="w-7 h-7 text-slate-600" />
                </div>
                <p className="text-sm font-semibold text-slate-400">Inbox is empty</p>
                <p className="text-xs text-slate-600">Share <span className="text-cyan-400">{activeAccount.address}</span> and check back here.</p>
              </div>
            ) : (
              messages.map(msg => {
                const isSelected = selectedMessage?.id === msg.id;
                return (
                  <button
                    key={msg.id}
                    onClick={() => setSelectedMessage(isSelected ? null : msg)}
                    className={`w-full text-left px-4 py-3.5 border-b border-slate-800/60 transition-all flex items-start gap-3 ${
                      isSelected ? 'bg-cyan-500/8 border-l-2 border-l-cyan-500' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColor(msg.from.address)} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                      {getInitials(msg.from.name, msg.from.address)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <p className="text-xs font-bold text-slate-200 truncate">{msg.from.name || msg.from.address}</p>
                        <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(msg.createdAt)}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-300 truncate">{msg.subject}</p>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">{msg.intro}</p>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 text-slate-600 mt-1 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-cyan-400' : ''}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Message reader ── */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
          {selectedMessage ? (
            <>
              {/* Reader header */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-3"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to inbox
                </button>
                <h3 className="text-sm font-bold text-white leading-snug mb-2">{selectedMessage.subject}</h3>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarColor(selectedMessage.from.address)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {getInitials(selectedMessage.from.name, selectedMessage.from.address)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{selectedMessage.from.name || 'Unknown Sender'}</p>
                    <p className="text-[10px] text-slate-500">{selectedMessage.from.address}</p>
                  </div>
                  <span className="ml-auto text-[10px] text-slate-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {new Date(selectedMessage.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Reader body */}
              <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(65vh - 120px)' }}>
                {selectedMessage.html && selectedMessage.html.length > 0 ? (
                  <div className="p-1">
                    <div className="bg-white rounded-xl overflow-x-auto max-w-full">
                      <div
                        className="p-4 text-sm text-black"
                        dangerouslySetInnerHTML={{ __html: selectedMessage.html[0] }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-5">
                    <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                        {selectedMessage.text || selectedMessage.intro || '(Empty message)'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 py-12">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
                  <Eye className="w-9 h-9 text-cyan-500/60" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center">
                  <Mail className="w-3 h-3 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-300 mb-1">Email Reader</h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-[220px]">
                  Select a message from the inbox to read it here. HTML emails render natively.
                </p>
              </div>
              {messages.length > 0 && (
                <p className="text-xs text-cyan-400/70">{messages.length} message{messages.length !== 1 ? 's' : ''} waiting →</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
