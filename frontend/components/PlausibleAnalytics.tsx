'use client';

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Activity, Users, Eye, Globe, Trash2, Shield, RefreshCw,
  AlertCircle, CheckCircle, Copy, Check, Code, TrendingUp,
  Clock, Filter, ChevronRight, ChevronLeft, ArrowUpRight,
  Zap, Monitor, Smartphone, Tablet,
} from 'lucide-react';
import DomainAnalytics from './DomainAnalytics';

interface AnalyticsEvent {
  id: string;
  event_type: string;
  path: string;
  session_id: string;
  referrer: string;
  device_type: string;
  country: string;
  domain: string;
  payload: any;
  created_at: string;
}

function parseUserAgent(ua: string) {
  if (!ua) return { os: 'Other', browser: 'Other' };
  let os = 'Other';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';
  let browser = 'Other';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg') || ua.includes('Edge')) browser = 'Edge';
  return { os, browser };
}

const ToggleSwitch = ({ checked, onChange, label, description }: {
  checked: boolean; onChange: (c: boolean) => void; label: string; description?: string;
}) => (
  <label className="flex items-start gap-3 p-2.5 cursor-pointer hover:bg-[var(--surface-2)] rounded-xl transition-all duration-200">
    <div className="relative inline-flex items-center mt-0.5 shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="w-9 h-5 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]"></div>
    </div>
    <div>
      <span className="text-xs font-semibold text-[var(--text)] block">{label}</span>
      {description && <span className="text-[9px] text-[var(--muted)] leading-tight block mt-0.5">{description}</span>}
    </div>
  </label>
);

const CountryTagInput = ({ tags, onChange, placeholder }: {
  tags: string[]; onChange: (tags: string[]) => void; placeholder: string;
}) => {
  const [input, setInput] = useState('');
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      const code = input.trim().toUpperCase();
      if (code && code.length === 2 && !tags.includes(code)) onChange([...tags, code]);
      setInput('');
    }
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl min-h-[38px] items-center focus-within:border-[var(--accent)]/50 transition-all">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-bold font-mono bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-lg border border-[var(--accent)]/20">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="hover:text-red-400 ml-0.5">×</button>
        </span>
      ))}
      <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''} maxLength={2}
        className="text-xs bg-transparent outline-none flex-grow min-w-[60px] text-[var(--text)] uppercase placeholder-[var(--muted)]" />
    </div>
  );
};

// Mini sparkline SVG component
const Sparkline = ({ data, color = 'var(--accent)', height = 32 }: { data: number[]; color?: string; height?: number }) => {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const max = Math.max(...data, 1);
  const w = 120;
  const h = height;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h * 0.85}`).join(' ');
  const fillPoints = `0,${h} ${points} ${w},${h}`;
  const gradientId = `sg-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible" style={{ height }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${gradientId})`} points={fillPoints} />
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
};

// Progress bar row component
const ProgressRow = ({ label, count, total, color = 'var(--accent)' }: { label: string; count: number; total: number; color?: string }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[var(--text)] truncate pr-2 max-w-[180px]">{label}</span>
        <span className="text-[var(--muted)] font-mono shrink-0">{count.toLocaleString()} <span className="text-[var(--muted)]/60">({pct}%)</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
};

export default function PlausibleAnalytics() {
  const { token } = useAuth();
  const [viewMode, setViewMode] = useState<'master' | 'domain'>('master');
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Date range & domain filter
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [domainFilter, setDomainFilter] = useState<string>('all');

  // Wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardDomain, setWizardDomain] = useState('');
  const [wizardCloaking, setWizardCloaking] = useState(true);
  const [wizardVpn, setWizardVpn] = useState(true);
  const [wizardRedirect, setWizardRedirect] = useState('');
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardCodeReady, setWizardCodeReady] = useState(false);
  const [wizardAllowedCountries, setWizardAllowedCountries] = useState<string[]>([]);
  const [wizardBlockedCountries, setWizardBlockedCountries] = useState<string[]>([]);
  const [wizardBlockRedirectUrl, setWizardBlockRedirectUrl] = useState('');
  const [wizardTelegramBotToken, setWizardTelegramBotToken] = useState('');
  const [wizardTelegramChatId, setWizardTelegramChatId] = useState('');
  const [wizardTelegramAlertsEnabled, setWizardTelegramAlertsEnabled] = useState(false);
  const [wizardEnableAnomalyAlerts, setWizardEnableAnomalyAlerts] = useState(false);
  const [configuredDomains, setConfiguredDomains] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchStats = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [statsRes, domainsRes] = await Promise.all([
        axios.get('/api/analytics/stats', { headers }),
        axios.get('/api/analytics/domains', { headers }),
      ]);
      setStats(statsRes.data || []);
      setConfiguredDomains(domainsRes.data || []);
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Failed to fetch analytics data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [headers]);

  // Date-range filtered + domain filtered stats
  const filteredStats = useMemo(() => {
    const now = Date.now();
    return stats.filter(e => {
      if (domainFilter !== 'all' && e.domain !== domainFilter) return false;
      const t = new Date(e.created_at).getTime();
      if (dateRange === '24h') return now - t <= 86400000;
      if (dateRange === '7d')  return now - t <= 604800000;
      if (dateRange === '30d') return now - t <= 2592000000;
      return true;
    });
  }, [stats, domainFilter, dateRange]);

  // Active visitors (last 5 min)
  const activeVisitors = useMemo(() => {
    const now = Date.now();
    const active = stats.filter(e => {
      if (domainFilter !== 'all' && e.domain !== domainFilter) return false;
      return now - new Date(e.created_at).getTime() <= 300000;
    });
    return new Set(active.map(e => e.session_id)).size;
  }, [stats, domainFilter]);

  // Session-level aggregates: bounce rate + avg duration
  const sessionStats = useMemo(() => {
    const sessions: Record<string, { timestamps: number[]; count: number }> = {};
    filteredStats.forEach(e => {
      const sid = e.session_id;
      const t = new Date(e.created_at).getTime();
      if (!sessions[sid]) sessions[sid] = { timestamps: [], count: 0 };
      sessions[sid].timestamps.push(t);
      sessions[sid].count += 1;
    });
    const total = Object.keys(sessions).length;
    if (total === 0) return { bounceRate: 0, avgDuration: '—', pagesPerSession: '—' };
    let bounces = 0, totalDur = 0, durCount = 0, totalPages = 0;
    Object.values(sessions).forEach(s => {
      totalPages += s.count;
      if (s.count === 1) { bounces++; }
      else {
        const mn = Math.min(...s.timestamps), mx = Math.max(...s.timestamps);
        totalDur += mx - mn; durCount++;
      }
    });
    const bounceRate = Math.round((bounces / total) * 100);
    const avgSec = durCount > 0 ? Math.round(totalDur / durCount / 1000) : 0;
    const avgDuration = avgSec >= 60 ? `${Math.floor(avgSec / 60)}m ${avgSec % 60}s` : (avgSec > 0 ? `${avgSec}s` : '—');
    const pagesPerSession = total > 0 ? (totalPages / total).toFixed(1) : '—';
    return { bounceRate, avgDuration, pagesPerSession };
  }, [filteredStats]);

  // Aggregate metrics
  const aggMetrics = useMemo(() => ({
    pageviews: filteredStats.length,
    uniqueSessions: new Set(filteredStats.map(e => e.session_id)).size,
  }), [filteredStats]);

  // 24h heatmap
  const heatmap = useMemo(() => {
    const b = Array(24).fill(0);
    filteredStats.forEach(e => { b[new Date(e.created_at).getHours()]++; });
    const mx = Math.max(...b, 1);
    return b.map((c, h) => ({ h, c, pct: c / mx }));
  }, [filteredStats]);

  // Top metrics
  const metrics = useMemo(() => {
    const pagesMap: Record<string, number> = {};
    const refMap: Record<string, number> = {};
    const devMap = { desktop: 0, mobile: 0, tablet: 0 };
    const utmSrc: Record<string, number> = {};
    const utmCamp: Record<string, number> = {};
    let ttfb = 0, load = 0, perfN = 0;

    filteredStats.forEach(e => {
      pagesMap[e.path] = (pagesMap[e.path] || 0) + 1;
      refMap[e.referrer] = (refMap[e.referrer] || 0) + 1;
      const d = e.device_type?.toLowerCase() || 'desktop';
      if (d in devMap) devMap[d as keyof typeof devMap]++;
      const p = e.payload || {};
      utmSrc[p.utm_source || 'organic'] = (utmSrc[p.utm_source || 'organic'] || 0) + 1;
      utmCamp[p.utm_campaign || 'none'] = (utmCamp[p.utm_campaign || 'none'] || 0) + 1;
      const perf = p.performance;
      if (perf?.ttfb > 0 || perf?.load_time > 0) { ttfb += perf.ttfb; load += perf.load_time; perfN++; }
    });

    return {
      topPages: Object.entries(pagesMap).sort((a, b) => b[1] - a[1]).slice(0, 8),
      topReferrers: Object.entries(refMap).sort((a, b) => b[1] - a[1]).slice(0, 8),
      devices: devMap,
      utmSources: Object.entries(utmSrc).sort((a, b) => b[1] - a[1]).slice(0, 6),
      utmCampaigns: Object.entries(utmCamp).sort((a, b) => b[1] - a[1]).slice(0, 6),
      avgTtfb: perfN > 0 ? Math.round(ttfb / perfN) : 0,
      avgLoad: perfN > 0 ? (load / perfN / 1000).toFixed(2) : '—',
    };
  }, [filteredStats]);

  // Timeline chart
  const chartData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredStats.forEach(e => {
      const d = new Date(e.created_at);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      map[label] = (map[label] || 0) + 1;
    });
    const dates = Array.from(new Map(filteredStats.map(e => {
      const d = new Date(e.created_at);
      return [d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }), new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()];
    })).entries()).sort((a, b) => a[1] - b[1]);
    return dates.map(([label]) => ({ name: label, Pageviews: map[label] || 0 }));
  }, [filteredStats]);

  // All domains
  const allDomains = useMemo(() => {
    const fromStats = Array.from(new Set(stats.map(s => s.domain).filter(Boolean)));
    return Array.from(new Set([...fromStats, ...configuredDomains])).sort();
  }, [stats, configuredDomains]);

  // Domain card stats with sparkline data
  const domainCards = useMemo(() => {
    const now = Date.now();
    return allDomains.map(domain => {
      const domainEvents = stats.filter(e => e.domain === domain);
      const events24h = domainEvents.filter(e => now - new Date(e.created_at).getTime() <= 86400000);
      const active5m = new Set(domainEvents.filter(e => now - new Date(e.created_at).getTime() <= 300000).map(e => e.session_id)).size;

      // 7 day sparkline
      const buckets = Array(7).fill(0);
      domainEvents.forEach(e => {
        const daysAgo = Math.floor((now - new Date(e.created_at).getTime()) / 86400000);
        if (daysAgo < 7) buckets[6 - daysAgo]++;
      });

      return { domain, views24h: events24h.length, active5m, sparkline: buckets, isLive: active5m > 0 };
    });
  }, [allDomains, stats]);

  // Host URL for snippet
  const hostUrl = useMemo(() => typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com', []);

  const trackingSnippet = useMemo(() => `<!-- Secure Analytics Tracker v2 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/tweetnacl/1.0.3/nacl-fast.min.js"></script>
<script>
(function(){
  var API="${hostUrl}",D="${wizardDomain||'auto'}";
  function h(a){return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('')}
  function f(s){return new Uint8Array((s.match(/.{1,2}/g)||[]).map(b=>parseInt(b,16)))}
  function sid(){var s=sessionStorage.getItem('_az');if(!s){s=h(nacl.randomBytes(16));sessionStorage.setItem('_az',s)}return s}
  function track(){
    fetch(API+'/api/analytics/public-key').then(r=>r.json()).then(({publicKey:pk})=>{
      var p=f(pk),ep=nacl.box.keyPair(),n=nacl.randomBytes(24);
      var params=new URLSearchParams(location.search);
      var data={event_type:'pageview',path:location.pathname,session_id:sid(),
        referrer:document.referrer?new URL(document.referrer).hostname:'direct',
        device_type:innerWidth<768?'mobile':innerWidth<1024?'tablet':'desktop',
        country:'unknown',domain:D==='auto'?location.hostname:D,
        payload:{screen_width:innerWidth,user_agent:navigator.userAgent,
          utm_source:params.get('utm_source')||'organic',
          utm_medium:params.get('utm_medium')||'none',
          utm_campaign:params.get('utm_campaign')||'none'}};
      var msg=new TextEncoder().encode(JSON.stringify(data));
      var cipher=nacl.box(msg,n,p,ep.secretKey);
      fetch(API+'/api/analytics/events',{method:'POST',
        headers:{'Content-Type':'application/json'},keepalive:true,
        body:JSON.stringify({ciphertext:h(cipher),ephemPubKey:h(ep.publicKey),nonce:h(n)})})
      .then(r=>r.json()).then(res=>{
        if(res.block){res.redirectUrl?location.replace(res.redirectUrl):(document.body.innerHTML='<h1 style="font-family:sans-serif;text-align:center;padding:4rem;color:#666">404 Not Found</h1>')}
        else if(res.redirectUrl) location.replace(res.redirectUrl);
      }).catch(()=>{});
    }).catch(()=>{});
  }
  var lp=location.pathname;track();
  setInterval(()=>{if(location.pathname!==lp){lp=location.pathname;track()}},800);
})();
</script>`, [hostUrl, wizardDomain]);

  const copySnippet = () => {
    navigator.clipboard.writeText(trackingSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWizardGenerate = async () => {
    if (!wizardDomain) return;
    setWizardSaving(true);
    try {
      await axios.post('/api/analytics/rules', {
        domain: wizardDomain,
        allowed_countries: wizardAllowedCountries,
        blocked_countries: wizardBlockedCountries,
        allowed_devices: [],
        blocked_devices: [],
        redirect_url: wizardRedirect,
        block_redirect_url: wizardBlockRedirectUrl,
        enable_cloaking: wizardCloaking,
        enable_vpn_blocking: wizardVpn,
        telegram_bot_token: wizardTelegramBotToken,
        telegram_chat_id: wizardTelegramChatId,
        telegram_alerts_enabled: wizardTelegramAlertsEnabled,
        enable_anomaly_alerts: wizardEnableAnomalyAlerts,
      }, { headers });
      setWizardCodeReady(true);
      setWizardStep(3);
      fetchStats();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Failed to save rules.' });
    } finally {
      setWizardSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Purge all analytics logs? This is permanent.')) return;
    setResetting(true);
    try {
      await axios.delete('/api/analytics/reset', { headers });
      setStats([]);
      setMsg({ type: 'ok', text: 'All analytics logs purged.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: 'Failed to purge logs.' });
    } finally {
      setResetting(false);
    }
  };

  if (viewMode === 'domain' && activeDomain) {
    return (
      <DomainAnalytics
        domain={activeDomain}
        stats={stats}
        onBack={() => { setViewMode('master'); setActiveDomain(null); }}
      />
    );
  }

  const rangeLabels = { '24h': '24 Hours', '7d': '7 Days', '30d': '30 Days', 'all': 'All Time' };

  return (
    <div className="space-y-6 pb-12 font-sans" style={{ color: 'var(--text)' }}>

      {/* ── TOP HEADER BAR (Adaptive Gradient) ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--accent)]/[0.12] via-[var(--surface)] to-[var(--surface-2)] p-5 shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)]/5 rounded-full blur-3xl" />

        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                <Activity size={16} className="text-[var(--accent)]" />
              </div>
              <h2 className="text-sm font-extrabold text-[var(--text)] tracking-tight">Web Analytics</h2>
              {activeVisitors > 0 && (
                <span className="flex items-center gap-1.5 text-[10px] font-extrabold bg-emerald-500/10 text-emerald-500 px-2.5 py-0.5 rounded-full border border-emerald-500/20 backdrop-blur-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  {activeVisitors} LIVE
                </span>
              )}
            </div>
            <p className="text-[10px] text-[var(--muted)]">Encrypted edge-routed analytics across all monitored domains</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Domain selector */}
            <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2 hover:border-[var(--accent)]/30 transition-all select-none">
              <Globe size={11} className="text-[var(--muted)]" />
              <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
                className="bg-transparent text-xs text-[var(--text)] outline-none cursor-pointer font-semibold pr-1">
                <option value="all">All Domains</option>
                {allDomains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Date range picker */}
            <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-xl p-0.5 gap-0.5">
              {(['24h', '7d', '30d', 'all'] as const).map(r => (
                <button key={r} onClick={() => setDateRange(r)}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    dateRange === r ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}>
                  {r === 'all' ? 'ALL' : r.toUpperCase()}
                </button>
              ))}
            </div>

            <button onClick={() => { setShowWizard(!showWizard); setWizardStep(1); setWizardCodeReady(false); }}
              className={`flex items-center gap-1.5 text-xs px-3.5 py-2.5 font-bold rounded-xl transition-all duration-200 ${
                showWizard ? 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]' : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-md'
              }`}>
              <Code size={13} />
              {showWizard ? 'Close Wizard' : '+ Add Domain'}
            </button>

            <button onClick={fetchStats} disabled={loading}
              className="p-2.5 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/30 text-[var(--muted)] hover:text-[var(--text)] rounded-xl transition-all">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ── MESSAGE BANNER ── */}
      {msg && (
        <div className={`flex items-center gap-2.5 p-3.5 rounded-xl text-xs font-semibold border backdrop-blur-sm ${
          msg.type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        }`}>
          {msg.type === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto opacity-60 hover:opacity-100 font-bold">×</button>
        </div>
      )}

      {/* ── ADD DOMAIN WIZARD ── */}
      {showWizard && (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          {/* Step indicator header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-2)]">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                <Code size={14} className="text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-[var(--text)]">Domain Setup Wizard</h3>
                <p className="text-[10px] text-[var(--muted)] mt-0.5">Configure tracking rules and generate your secure snippet</p>
              </div>
            </div>

            {/* Step bubbles */}
            <div className="flex items-center gap-2">
              {[
                { n: 1, label: 'Domain' },
                { n: 2, label: 'Rules' },
                { n: 3, label: 'Snippet' },
              ].map(({ n, label }) => (
                <React.Fragment key={n}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-full text-[10px] font-black flex items-center justify-center transition-all duration-300 ${
                      wizardStep === n ? 'bg-[var(--accent)] text-white shadow-md scale-110'
                        : wizardStep > n ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-500'
                        : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)]'
                    }`}>
                      {wizardStep > n ? <Check size={12} /> : n}
                    </div>
                    <span className="text-[8px] font-bold text-[var(--muted)] uppercase tracking-widest">{label}</span>
                  </div>
                  {n < 3 && <div className={`w-8 h-px mt-[-14px] transition-all duration-300 ${wizardStep > n ? 'bg-emerald-500/30' : 'bg-[var(--border)]'}`} />}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="p-6 bg-[var(--surface)]">
            {/* STEP 1 */}
            {wizardStep === 1 && (
              <div className="max-w-lg mx-auto space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest block font-sans">Website Domain</label>
                  <input type="text" placeholder="e.g. mysite.com" value={wizardDomain}
                    onChange={e => setWizardDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && wizardDomain && setWizardStep(2)}
                    className="w-full text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--muted)]/50 outline-none focus:border-[var(--accent)]/50 transition-all duration-200 font-mono" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest block">Clean Traffic → Redirect To</label>
                    <input type="text" placeholder="https://offer.com/landing" value={wizardRedirect}
                      onChange={e => setWizardRedirect(e.target.value)}
                      className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[var(--text)] placeholder-[var(--muted)]/40 outline-none focus:border-[var(--accent)]/50 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest block">Blocked Traffic → Redirect To</label>
                    <input type="text" placeholder="https://google.com" value={wizardBlockRedirectUrl}
                      onChange={e => setWizardBlockRedirectUrl(e.target.value)}
                      className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[var(--text)] placeholder-[var(--muted)]/40 outline-none focus:border-[var(--accent)]/50 transition-all" />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={() => wizardDomain ? setWizardStep(2) : null}
                    disabled={!wizardDomain}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-sm">
                    Configure Rules <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {wizardStep === 2 && (
              <div className="max-w-2xl mx-auto space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest block">Allowed Countries</label>
                      <CountryTagInput tags={wizardAllowedCountries} onChange={setWizardAllowedCountries} placeholder="Type US, IN, GB..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest block">Blocked Countries</label>
                      <CountryTagInput tags={wizardBlockedCountries} onChange={setWizardBlockedCountries} placeholder="Type CN, RU, KP..." />
                    </div>
                  </div>

                  <div className="space-y-1.5 p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl">
                    <p className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest mb-3">Protection Rules</p>
                    <ToggleSwitch checked={wizardCloaking} onChange={setWizardCloaking} label="Bot & Crawler Cloaking" description="Filters headless browsers, bots and scrapers" />
                    <ToggleSwitch checked={wizardVpn} onChange={setWizardVpn} label="VPN & Proxy Blocking" description="Detects multi-hop proxy headers" />
                    <ToggleSwitch checked={wizardTelegramAlertsEnabled} onChange={setWizardTelegramAlertsEnabled} label="Telegram Visitor Alerts" description="Notify on new unique sessions" />
                    <ToggleSwitch checked={wizardEnableAnomalyAlerts} onChange={setWizardEnableAnomalyAlerts} label="Traffic Spike Alerts" description="Alert on 3x above baseline spikes" />
                  </div>
                </div>

                {(wizardTelegramAlertsEnabled || wizardEnableAnomalyAlerts) && (
                  <div className="grid grid-cols-2 gap-3 p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest block">Bot Token</label>
                      <input type="password" value={wizardTelegramBotToken} onChange={e => setWizardTelegramBotToken(e.target.value)}
                        placeholder="123456:ABCdef..." className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] placeholder-[var(--muted)]/40 outline-none focus:border-[var(--accent)]/50 transition-all" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest block">Chat ID</label>
                      <input type="text" value={wizardTelegramChatId} onChange={e => setWizardTelegramChatId(e.target.value)}
                        placeholder="-100123456789" className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] placeholder-[var(--muted)]/40 outline-none focus:border-[var(--accent)]/50 transition-all" />
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setWizardStep(1)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface)] text-[var(--text)] text-xs font-bold rounded-xl transition-all">
                    <ChevronLeft size={13} /> Back
                  </button>
                  <button onClick={handleWizardGenerate} disabled={wizardSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
                    {wizardSaving ? <RefreshCw size={13} className="animate-spin" /> : <Code size={13} />}
                    {wizardSaving ? 'Saving...' : 'Generate Snippet'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {wizardStep === 3 && (
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Domain configured — snippet ready!</p>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5 font-medium">Paste this into <code className="text-[var(--accent)] font-semibold">&lt;head&gt;</code> on <strong className="text-[var(--text)]">{wizardDomain}</strong>.</p>
                  </div>
                </div>

                <div className="relative group">
                  <button onClick={copySnippet}
                    className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/30 text-[10px] font-bold text-[var(--text)] hover:shadow-sm rounded-lg transition-all">
                    {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                  <pre className="p-5 pt-12 bg-[var(--surface-2)] font-mono text-[10px] rounded-xl border border-[var(--border)] overflow-x-auto whitespace-pre select-all max-h-56 leading-relaxed text-[var(--text)] opacity-90 shadow-inner">
                    {trackingSnippet}
                  </pre>
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={() => { setShowWizard(false); setWizardStep(1); setWizardDomain(''); setWizardCodeReady(false); }}
                    className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-sm">
                    Complete Setup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {stats.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-16 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.03),transparent_70%)]" />
          <div className="relative space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center mx-auto">
              <Activity size={28} className="text-[var(--accent)]" />
            </div>
            <h3 className="text-sm font-bold text-[var(--text)]">No Telemetry Logs Detected</h3>
            <p className="text-xs text-[var(--muted)] max-w-xs mx-auto">Add a website domain and integrate the generated javascript script header.</p>
            <button onClick={() => setShowWizard(true)} className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-sm">
              <Code size={12} /> Add Website
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── HIGH VISIBILITY PREMIUM STAT CARDS ROW ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Pageviews', value: aggMetrics.pageviews.toLocaleString(), icon: Eye, color: 'indigo', border: 'border-indigo-500/20', bg: 'from-indigo-500/[0.08] to-indigo-500/[0.01]', text: 'text-indigo-600 dark:text-indigo-400', sub: rangeLabels[dateRange] },
              { label: 'Unique Visitors', value: aggMetrics.uniqueSessions.toLocaleString(), icon: Users, color: 'emerald', border: 'border-emerald-500/20', bg: 'from-emerald-500/[0.08] to-emerald-500/[0.01]', text: 'text-emerald-600 dark:text-emerald-400', sub: 'Distinct sessions' },
              { label: 'Bounce Rate', value: `${sessionStats.bounceRate}%`, icon: ArrowUpRight, color: 'rose', border: 'border-rose-500/20', bg: 'from-rose-500/[0.08] to-rose-500/[0.01]', text: 'text-rose-600 dark:text-rose-400', sub: 'Single-page events' },
              { label: 'Avg Session Time', value: sessionStats.avgDuration, icon: Clock, color: 'amber', border: 'border-amber-500/20', bg: 'from-amber-500/[0.08] to-amber-500/[0.01]', text: 'text-amber-600 dark:text-amber-400', sub: `${sessionStats.pagesPerSession} pages/session` },
            ].map(({ label, value, icon: Icon, border, bg, text, sub }) => (
              <div key={label} className={`relative overflow-hidden rounded-2xl border ${border} bg-gradient-to-br ${bg} p-4 hover:shadow-md transition-all duration-300 group`}>
                <div className={`inline-flex p-2 rounded-xl bg-slate-500/5 border ${border} mb-3`}>
                  <Icon size={16} className={text} />
                </div>
                <p className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black mt-0.5 text-[var(--text)]">{value}</p>
                <p className="text-[9px] text-[var(--muted)]/80 mt-1 font-medium">{sub}</p>
              </div>
            ))}
          </div>

          {/* ── HEATMAP + LIVE COUNTER (Premium Glass Panel) ── */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="space-y-0.5">
                <h4 className="text-xs font-extrabold text-[var(--text)] flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  Traffic Density Heatmap (24h)
                </h4>
                <p className="text-[10px] text-[var(--muted)] font-medium">Hourly view distributions over filtered period</p>
              </div>
              <div className="flex items-center gap-2">
                {activeVisitors > 0 ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    {activeVisitors} active visitor{activeVisitors !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--muted)] font-semibold">No active sessions</span>
                )}
              </div>
            </div>

            {/* Heatmap column bars */}
            <div className="flex gap-1" style={{ height: '40px' }}>
              {heatmap.map(({ h: hour, c, pct }) => (
                <div key={hour} className="flex-1 flex flex-col justify-end" title={`${hour}:00 — ${c} views`}>
                  <div
                    className="rounded-sm transition-all duration-500 hover:scale-110 cursor-default"
                    style={{
                      height: `${Math.max(pct * 100, c > 0 ? 10 : 2)}%`,
                      backgroundColor: pct > 0 ? 'var(--accent)' : 'var(--border)',
                      opacity: pct > 0 ? Math.max(0.15, pct) : 0.25,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[8px] font-bold text-[var(--muted)] mt-2 px-0.5 uppercase tracking-widest select-none">
              <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span>
            </div>
          </div>

          {/* ── TIMELINE AREA CHART (Dynamic Variable Accent Mapping) ── */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <h4 className="text-xs font-extrabold text-[var(--text)] mb-4">Traffic Timeline — {rangeLabels[dateRange]}</h4>
            <div style={{ height: 200 }}>
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--muted)] italic">No chart points available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="var(--border)" fontSize={9} tickLine={false} tick={{ fill: 'var(--muted)' }} />
                    <YAxis stroke="var(--border)" fontSize={9} tickLine={false} tick={{ fill: 'var(--muted)' }} />
                    <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '11px', color: 'var(--text)' }} />
                    <Area type="monotone" dataKey="Pageviews" stroke="var(--accent)" strokeWidth={2.5} fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── TRACKED DOMAIN CARDS ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">Tracked Domain Workspaces</h4>
              <span className="text-[9px] text-[var(--accent)] font-bold uppercase tracking-wider select-none">Click domain card to view settings</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {domainCards.map(d => {
                const isSelected = domainFilter === d.domain;
                return (
                  <div key={d.domain}
                    onClick={() => {
                      setActiveDomain(d.domain);
                      setViewMode('domain');
                    }}
                    className={`relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md group ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-2)]'
                    }`}>
                    <div className="p-4 flex flex-col h-full justify-between">
                      <div className="flex items-start justify-between mb-4">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text)] font-mono truncate">{d.domain}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${d.isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${d.isLive ? 'text-emerald-500' : 'text-[var(--muted)]'}`}>
                              {d.isLive ? 'Active' : 'Idle'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {d.active5m > 0 && (
                            <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                              {d.active5m} active
                            </span>
                          )}
                          <ArrowUpRight size={13} className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors" />
                        </div>
                      </div>

                      <div className="flex items-end justify-between mt-2">
                        <div>
                          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-bold">24h views</p>
                          <p className="text-xl font-black text-[var(--text)] leading-none">{d.views24h.toLocaleString()}</p>
                        </div>
                        <div className="w-28 h-8 opacity-70 group-hover:opacity-100 transition-opacity">
                          <Sparkline data={d.sparkline} color={d.isLive ? 'var(--accent)' : 'var(--muted)'} height={32} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── BREAKDOWNS SECTION ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Top Page Paths */}
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
              <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                <Eye size={11} className="text-indigo-500" /> Top Page Paths
              </h4>
              <div className="space-y-3">
                {metrics.topPages.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] italic">No pages logged</p>
                ) : metrics.topPages.map(([path, count]) => (
                  <ProgressRow key={path} label={path} count={count} total={aggMetrics.pageviews} color="var(--accent)" />
                ))}
              </div>
            </div>

            {/* Traffic Sources */}
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
              <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={11} className="text-emerald-500" /> Traffic Sources
              </h4>
              <div className="space-y-3">
                {metrics.topReferrers.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] italic">No referrers logged</p>
                ) : metrics.topReferrers.map(([ref, count]) => (
                  <ProgressRow key={ref} label={ref} count={count} total={aggMetrics.pageviews} color="#10b981" />
                ))}
              </div>
            </div>

            {/* Device Lock & Speed metrics */}
            <div className="space-y-4">
              {/* Devices Card */}
              <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
                <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                  <Monitor size={11} className="text-amber-500" /> Device Type Shares
                </h4>
                {[
                  { type: 'desktop', label: 'Desktop OS', icon: Monitor, color: 'var(--accent)' },
                  { type: 'mobile', label: 'Mobile Device', icon: Smartphone, color: '#10b981' },
                  { type: 'tablet', label: 'Tablet Screen', icon: Tablet, color: '#f59e0b' },
                ].map(({ type, label, icon: Icon, color }) => {
                  const count = metrics.devices[type as keyof typeof metrics.devices] || 0;
                  const total = Object.values(metrics.devices).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <Icon size={13} style={{ color }} className="shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[var(--text)] font-semibold">{label}</span>
                          <span className="text-[var(--muted)] font-mono">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--surface-2)]">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Performance Speed Indicators */}
              <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2 mb-3">
                  <Zap size={11} className="text-yellow-500" /> Core Web Vitals
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-[var(--surface-2)] rounded-xl">
                    <p className="text-[8px] font-bold text-[var(--muted)] uppercase tracking-widest">TTFB (Latency)</p>
                    <p className="text-lg font-black text-[var(--text)]">{metrics.avgTtfb || '—'}<span className="text-[9px] text-[var(--muted)] font-bold ml-0.5">ms</span></p>
                  </div>
                  <div className="p-3 bg-[var(--surface-2)] rounded-xl">
                    <p className="text-[8px] font-bold text-[var(--muted)] uppercase tracking-widest">Page Load Time</p>
                    <p className="text-lg font-black text-[var(--text)]">{metrics.avgLoad}<span className="text-[9px] text-[var(--muted)] font-bold ml-0.5">s</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── UTM CAMPAIGNS BREAKDOWN ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
              <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                <Globe size={11} className="text-purple-500" /> UTM Campaign Sources
              </h4>
              <div className="space-y-3">
                {metrics.utmSources.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] italic">No source campaign events registered</p>
                ) : metrics.utmSources.map(([src, count]) => (
                  <ProgressRow key={src} label={src} count={count} total={aggMetrics.pageviews} color="#a78bfa" />
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
              <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                <Activity size={11} className="text-rose-500" /> UTM Active Campaigns
              </h4>
              <div className="space-y-3">
                {metrics.utmCampaigns.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] italic">No marketing campaigns registered</p>
                ) : metrics.utmCampaigns.map(([camp, count]) => (
                  <ProgressRow key={camp} label={camp} count={count} total={aggMetrics.pageviews} color="#f43f5e" />
                ))}
              </div>
            </div>
          </div>

          {/* ── ENCRYPTION & DATA PURGE COMPLIANCE BAR ── */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Shield size={14} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Strict Privacy Protocol Active</p>
                <p className="text-[10px] text-[var(--muted)] mt-0.5 font-medium">Asymmetrical client-side public-key cryptography. Zero-cookies. GDPR compliant.</p>
              </div>
            </div>
            <button onClick={handleReset} disabled={resetting}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 border border-red-500/25 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 text-red-500 rounded-xl text-xs font-bold transition-all w-full md:w-auto justify-center">
              {resetting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Purge Database Logs
            </button>
          </div>
        </>
      )}
    </div>
  );
}
