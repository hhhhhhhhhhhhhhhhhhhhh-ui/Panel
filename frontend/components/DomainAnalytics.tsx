'use client';

import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Users,
  Eye,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  ArrowLeft,
  Calendar,
  Zap,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

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

interface DomainAnalyticsProps {
  domain: string;
  stats: AnalyticsEvent[];
  onBack: () => void;
}

// User Agent parser helper
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

// World country coordinates mapping for our dotted SVG map
const countryCoordinates: Record<string, { name: string; x: number; y: number }> = {
  US: { name: 'United States', x: 22, y: 35 },
  CA: { name: 'Canada', x: 22, y: 22 },
  GB: { name: 'United Kingdom', x: 47, y: 26 },
  DE: { name: 'Germany', x: 51, y: 28 },
  FR: { name: 'France', x: 49, y: 31 },
  IN: { name: 'India', x: 69, y: 48 },
  CN: { name: 'China', x: 76, y: 40 },
  JP: { name: 'Japan', x: 84, y: 38 },
  AU: { name: 'Australia', x: 86, y: 76 },
  BR: { name: 'Brazil', x: 36, y: 68 },
  ZA: { name: 'South Africa', x: 54, y: 73 },
  RU: { name: 'Russia', x: 68, y: 24 },
  SG: { name: 'Singapore', x: 74, y: 55 },
  AE: { name: 'UAE', x: 61, y: 44 },
};

const ToggleSwitch = ({ checked, onChange, label, description }: { checked: boolean, onChange: (c: boolean) => void, label: string, description?: string }) => (
  <label className="flex items-start gap-3 p-2 cursor-pointer hover:bg-[var(--surface-2)] rounded-lg transition text-left">
    <div className="relative inline-flex items-center mt-0.5 shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="w-9 h-5 bg-[var(--surface)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]"></div>
    </div>
    <div>
      <span className="text-xs font-semibold text-[var(--text)] block">{label}</span>
      {description && <span className="text-[9px] text-[var(--muted)] leading-tight block mt-0.5">{description}</span>}
    </div>
  </label>
);

const CountryTagInput = ({ tags, onChange, placeholder }: { tags: string[], onChange: (tags: string[]) => void, placeholder: string }) => {
  const [input, setInput] = useState('');
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      const code = input.trim().toUpperCase();
      if (code && code.length === 2 && !tags.includes(code)) {
        onChange([...tags, code]);
      }
      setInput('');
    }
  };
  const handleRemove = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5 p-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg min-h-[40px] items-center focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/30 transition-all duration-200">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono bg-[var(--accent)]/10 text-[var(--accent)] pl-2.5 pr-1.5 py-1 rounded-md border border-[var(--accent)]/20 shadow-sm transition-all hover:bg-[var(--accent)]/20">
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(tag)}
              className="hover:bg-red-500/20 hover:text-red-400 rounded-md w-3.5 h-3.5 flex items-center justify-center font-sans text-xs leading-none transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="text-xs bg-transparent outline-none flex-grow min-w-[70px] text-[var(--text)] uppercase placeholder-[var(--muted)]"
          maxLength={2}
        />
      </div>
      <p className="text-[9px] text-[var(--muted)] pl-1">Type 2-letter ISO country code (e.g. US, IN) and press Enter to add.</p>
    </div>
  );
};

export default function DomainAnalytics({ domain, stats, onBack }: DomainAnalyticsProps) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [timeRange, setTimeRange] = useState<'12h' | '24h' | 'yesterday' | '7d' | '30d' | 'custom'>('7d');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  // Status & Rules States
  const [rules, setRules] = useState<any>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [statusToggling, setStatusToggling] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Settings configurations states
  const [allowedCountries, setAllowedCountries] = useState<string[]>([]);
  const [blockedCountries, setBlockedCountries] = useState<string[]>([]);
  const [allowedDevices, setAllowedDevices] = useState<string[]>([]);
  const [redirectUrl, setRedirectUrl] = useState('');
  const [blockRedirectUrl, setBlockRedirectUrl] = useState('');
  const [enableCloaking, setEnableCloaking] = useState(false);
  const [enableVpnBlocking, setEnableVpnBlocking] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramAlertsEnabled, setTelegramAlertsEnabled] = useState(false);
  const [telegramViewThreshold, setTelegramViewThreshold] = useState('');
  const [telegramViewRepeat, setTelegramViewRepeat] = useState(false);
  const [enableAnomalyAlerts, setEnableAnomalyAlerts] = useState(false);
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string | null>(null);

  // Fetch domain-specific configurations
  const fetchRules = async () => {
    setRulesLoading(true);
    try {
      const res = await axios.get(`/api/analytics/rules?domain=${domain}`, { headers });
      const data = res.data;
      setRules(data);

      setAllowedCountries(Array.isArray(data.allowed_countries) ? data.allowed_countries : []);
      setBlockedCountries(Array.isArray(data.blocked_countries) ? data.blocked_countries : []);
      setAllowedDevices(data.allowed_devices || []);
      setRedirectUrl(data.redirect_url || '');
      setBlockRedirectUrl(data.block_redirect_url || '');
      setEnableCloaking(!!data.enable_cloaking);
      setEnableVpnBlocking(!!data.enable_vpn_blocking);
      setTelegramBotToken(data.telegram_bot_token || '');
      setTelegramChatId(data.telegram_chat_id || '');
      setTelegramAlertsEnabled(!!data.telegram_alerts_enabled);
      setTelegramViewThreshold(data.telegram_view_threshold || '');
      setTelegramViewRepeat(!!data.telegram_view_repeat);
      setEnableAnomalyAlerts(!!data.enable_anomaly_alerts);
    } catch (err: any) {
      console.error('Failed to fetch rules:', err);
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [domain, token]);

  // Handle Online/Offline Status Toggling
  const handleToggleStatus = async () => {
    if (!rules) return;
    const nextStatus = !rules.is_offline;
    setStatusToggling(true);
    setMsg(null);
    try {
      const res = await axios.post('/api/analytics/rules/toggle-status', {
        domain,
        is_offline: nextStatus
      }, { headers });
      setRules(res.data);
      setMsg({
        type: 'ok',
        text: `Domain status set to ${nextStatus ? 'Offline (Redirecting all traffic to Google)' : 'Online (Working normally)'}.`
      });
    } catch (err: any) {
      setMsg({
        type: 'err',
        text: err.response?.data?.error || 'Failed to toggle status.'
      });
    } finally {
      setStatusToggling(false);
    }
  };

  // Save rules changes
  const handleSaveRules = async () => {
    setRulesSaving(true);
    setMsg(null);
    try {
      const res = await axios.post('/api/analytics/rules', {
        domain,
        allowed_countries: allowedCountries,
        blocked_countries: blockedCountries,
        allowed_devices: allowedDevices,
        blocked_devices: [],
        redirect_url: redirectUrl,
        block_redirect_url: blockRedirectUrl,
        enable_cloaking: enableCloaking,
        enable_vpn_blocking: enableVpnBlocking,
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId,
        telegram_alerts_enabled: telegramAlertsEnabled,
        telegram_view_threshold: telegramViewThreshold,
        telegram_view_repeat: telegramViewRepeat,
        enable_anomaly_alerts: enableAnomalyAlerts,
        is_offline: rules ? rules.is_offline : false
      }, { headers });

      setRules(res.data);
      setMsg({
        type: 'ok',
        text: `Traffic control rules successfully deployed for ${domain}!`
      });
    } catch (err: any) {
      setMsg({
        type: 'err',
        text: err.response?.data?.error || 'Failed to save traffic rules.'
      });
    } finally {
      setRulesSaving(false);
    }
  };

  // 1. Filter stats by time range
  const timeFilteredStats = useMemo(() => {
    const now = new Date();
    return stats.filter((event) => {
      const date = new Date(event.created_at);
      const diffMs = now.getTime() - date.getTime();
      if (timeRange === '12h') return diffMs <= 12 * 60 * 60 * 1000;
      if (timeRange === '24h') return diffMs <= 24 * 60 * 60 * 1000;
      if (timeRange === 'yesterday') {
        const startOfYesterday = new Date();
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        startOfYesterday.setHours(0, 0, 0, 0);

        const endOfYesterday = new Date();
        endOfYesterday.setDate(endOfYesterday.getDate() - 1);
        endOfYesterday.setHours(23, 59, 59, 999);

        return date >= startOfYesterday && date <= endOfYesterday;
      }
      if (timeRange === '7d') return diffMs <= 7 * 24 * 60 * 60 * 1000;
      if (timeRange === '30d') return diffMs <= 30 * 24 * 60 * 60 * 1000;
      if (timeRange === 'custom') {
        if (!customStart) return true;
        const start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        const end = customEnd ? new Date(customEnd) : new Date();
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }
      return true;
    });
  }, [stats, timeRange, customStart, customEnd]);

  // 2. Filter stats by domain
  const domainFilteredStats = useMemo(() => {
    return timeFilteredStats.filter((event) => event.domain === domain);
  }, [timeFilteredStats, domain]);

  // 3. Filter stats by country selection
  const finalFilteredStats = useMemo(() => {
    if (!selectedCountryFilter) return domainFilteredStats;
    return domainFilteredStats.filter(s => (s.country || 'unknown').toUpperCase() === selectedCountryFilter.toUpperCase());
  }, [domainFilteredStats, selectedCountryFilter]);

  // Compute country list from domainFilteredStats (unaffected by selectedCountryFilter)
  const mapCountries = useMemo(() => {
    const countriesMap: Record<string, number> = {};
    domainFilteredStats.forEach((e) => {
      const c = e.country || 'unknown';
      countriesMap[c] = (countriesMap[c] || 0) + 1;
    });
    return Object.entries(countriesMap)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [domainFilteredStats]);

  // Real-time Active Visitors Counter (Active in last 5 minutes)
  const activeVisitors = useMemo(() => {
    const now = new Date().getTime();
    const activeThreshold = 5 * 60 * 1000; // 5 mins
    const activeEvents = stats.filter((event) => {
      if (event.domain !== domain) return false;
      if (selectedCountryFilter && (event.country || 'unknown').toUpperCase() !== selectedCountryFilter.toUpperCase()) return false;
      const date = new Date(event.created_at);
      return now - date.getTime() <= activeThreshold;
    });
    return new Set(activeEvents.map((e) => e.session_id)).size;
  }, [stats, domain, selectedCountryFilter]);

  // Metrics computation
  const metrics = useMemo(() => {
    const pageviews = finalFilteredStats.length;
    const uniqueSessions = new Set(finalFilteredStats.map((e) => e.session_id)).size;

    // Top Pages
    const pagesMap: Record<string, number> = {};
    finalFilteredStats.forEach((e) => {
      pagesMap[e.path] = (pagesMap[e.path] || 0) + 1;
    });
    const topPages = Object.entries(pagesMap)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);

    // Top Referrers
    const referrersMap: Record<string, number> = {};
    finalFilteredStats.forEach((e) => {
      referrersMap[e.referrer] = (referrersMap[e.referrer] || 0) + 1;
    });
    const topReferrers = Object.entries(referrersMap)
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count);

    // Device Types
    const devicesMap: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
    finalFilteredStats.forEach((e) => {
      const d = e.device_type?.toLowerCase() || 'desktop';
      if (d in devicesMap) {
        devicesMap[d] = (devicesMap[d] || 0) + 1;
      }
    });

    // Country distribution
    const countriesMap: Record<string, number> = {};
    finalFilteredStats.forEach((e) => {
      const c = e.country || 'unknown';
      countriesMap[c] = (countriesMap[c] || 0) + 1;
    });
    const countryStats = Object.entries(countriesMap)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    // UTM Source, Medium, Campaign analytics
    const utmSources: Record<string, number> = {};
    const utmMediums: Record<string, number> = {};
    const utmCampaigns: Record<string, number> = {};

    finalFilteredStats.forEach((e) => {
      const p = e.payload || {};
      const src = p.utm_source || 'organic';
      const med = p.utm_medium || 'none';
      const camp = p.utm_campaign || 'none';

      utmSources[src] = (utmSources[src] || 0) + 1;
      utmMediums[med] = (utmMediums[med] || 0) + 1;
      utmCampaigns[camp] = (utmCampaigns[camp] || 0) + 1;
    });

    // Web Vitals Performance Calculations
    let totalTtfb = 0;
    let totalLoadTime = 0;
    let perfLogsCount = 0;

    finalFilteredStats.forEach((e) => {
      const perf = e.payload?.performance;
      if (perf && (perf.ttfb > 0 || perf.load_time > 0)) {
        totalTtfb += perf.ttfb;
        totalLoadTime += perf.load_time;
        perfLogsCount++;
      }
    });

    const avgTtfb = perfLogsCount > 0 ? Math.round(totalTtfb / perfLogsCount) : 0;
    const avgLoadTime = perfLogsCount > 0 ? parseFloat((totalLoadTime / perfLogsCount / 1000).toFixed(2)) : 0;

    // OS and Browser breakdown
    const osMap: Record<string, number> = {};
    const browserMap: Record<string, number> = {};

    finalFilteredStats.forEach((e) => {
      const ua = e.payload?.user_agent || '';
      const parsed = parseUserAgent(ua);
      osMap[parsed.os] = (osMap[parsed.os] || 0) + 1;
      browserMap[parsed.browser] = (browserMap[parsed.browser] || 0) + 1;
    });

    return {
      pageviews,
      uniqueSessions,
      topPages,
      topReferrers,
      devices: devicesMap,
      countries: countryStats,
      utm: {
        sources: Object.entries(utmSources).sort((a, b) => b[1] - a[1]).slice(0, 5),
        mediums: Object.entries(utmMediums).sort((a, b) => b[1] - a[1]).slice(0, 5),
        campaigns: Object.entries(utmCampaigns).sort((a, b) => b[1] - a[1]).slice(0, 5),
      },
      performance: {
        avgTtfb,
        avgLoadTime,
      },
      os: Object.entries(osMap).sort((a, b) => b[1] - a[1]),
      browser: Object.entries(browserMap).sort((a, b) => b[1] - a[1]),
    };
  }, [finalFilteredStats]);

  // Cohort analysis over last 12 weeks
  const cohortsData = useMemo(() => {
    const sessionStarts: Record<string, Date> = {};
    const sessionVisits: Record<string, Set<number>> = {};

    const cohortEvents = stats.filter((event) => event.domain === domain);

    cohortEvents.forEach((e) => {
      const date = new Date(e.created_at);
      const session = e.session_id;

      if (!sessionStarts[session] || date < sessionStarts[session]) {
        sessionStarts[session] = date;
      }
    });

    const getWeekStart = (d: Date) => {
      const temp = new Date(d.getTime());
      const day = temp.getDay();
      const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
      temp.setDate(diff);
      temp.setHours(0, 0, 0, 0);
      return temp;
    };

    const cohortCohorts: Record<string, { start: Date; sessions: string[] }> = {};

    Object.entries(sessionStarts).forEach(([session, startDate]) => {
      const weekStart = getWeekStart(startDate);
      const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      
      if (!cohortCohorts[label]) {
        cohortCohorts[label] = { start: weekStart, sessions: [] };
      }
      cohortCohorts[label].sessions.push(session);
    });

    cohortEvents.forEach((e) => {
      const date = new Date(e.created_at);
      const session = e.session_id;
      const start = sessionStarts[session];
      if (!start) return;

      const weekDiff = Math.floor((getWeekStart(date).getTime() - getWeekStart(start).getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weekDiff >= 0 && weekDiff < 12) {
        if (!sessionVisits[session]) {
          sessionVisits[session] = new Set<number>();
        }
        sessionVisits[session].add(weekDiff);
      }
    });

    const sortedCohorts = Object.entries(cohortCohorts)
      .sort((a, b) => b[1].start.getTime() - a[1].start.getTime())
      .slice(0, 10);

    return sortedCohorts.map(([label, cohort]) => {
      const totalSessions = cohort.sessions.length;
      const weeklyCounts = Array(12).fill(0);

      cohort.sessions.forEach((session) => {
        const visits = sessionVisits[session];
        if (visits) {
          visits.forEach((weekOffset) => {
            weeklyCounts[weekOffset]++;
          });
        }
      });

      const weeklyPercentages = weeklyCounts.map((count) =>
        totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0
      );

      return {
        label,
        size: totalSessions,
        percentages: weeklyPercentages,
      };
    });
  }, [stats, domain]);

  // User Flow paths (Step 1 -> Step 2 -> Step 3)
  const userFlows = useMemo(() => {
    const sessionPaths: Record<string, string[]> = {};

    const sortedEvents = [...finalFilteredStats].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    sortedEvents.forEach((e) => {
      const sid = e.session_id;
      if (!sessionPaths[sid]) {
        sessionPaths[sid] = [];
      }
      const lastPath = sessionPaths[sid][sessionPaths[sid].length - 1];
      if (lastPath !== e.path) {
        sessionPaths[sid].push(e.path);
      }
    });

    const step1: Record<string, number> = {};
    const step1To2: Record<string, number> = {};
    const step2To3: Record<string, number> = {};

    Object.values(sessionPaths).forEach((pathSeq) => {
      if (pathSeq.length > 0) {
        const p1 = pathSeq[0];
        step1[p1] = (step1[p1] || 0) + 1;

        if (pathSeq.length > 1) {
          const p2 = pathSeq[1];
          const key = `${p1}→${p2}`;
          step1To2[key] = (step1To2[key] || 0) + 1;

          if (pathSeq.length > 2) {
            const p3 = pathSeq[2];
            const key2 = `${p2}→${p3}`;
            step2To3[key2] = (step2To3[key2] || 0) + 1;
          }
        }
      }
    });

    const topStep1 = Object.entries(step1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topStep1To2 = Object.entries(step1To2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topStep2To3 = Object.entries(step2To3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      step1: topStep1,
      step1To2: topStep1To2,
      step2To3: topStep2To3,
    };
  }, [finalFilteredStats]);

  // Timeline chart data
  const chartDataFinal = useMemo(() => {
    const countsMap: Record<string, number> = {};
    
    const isSingleDay = (() => {
      if (timeRange === '12h' || timeRange === '24h' || timeRange === 'yesterday') return true;
      if (timeRange === 'custom') {
        if (!customStart) return false;
        const s = new Date(customStart);
        const e = customEnd ? new Date(customEnd) : new Date();
        return (e.getTime() - s.getTime()) <= 24 * 60 * 60 * 1000;
      }
      return false;
    })();

    finalFilteredStats.forEach((e) => {
      const date = new Date(e.created_at);
      let label = '';
      if (isSingleDay) {
        label = `${String(date.getHours()).padStart(2, '0')}:00`;
      } else {
        label = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      }
      countsMap[label] = (countsMap[label] || 0) + 1;
    });

    if (timeRange === '12h') {
      const list = [];
      const currentHour = new Date().getHours();
      for (let i = 11; i >= 0; i--) {
        const h = (currentHour - i + 24) % 24;
        const label = `${String(h).padStart(2, '0')}:00`;
        list.push({ name: label, Pageviews: countsMap[label] || 0 });
      }
      return list;
    }
    if (timeRange === '24h') {
      const list = [];
      const currentHour = new Date().getHours();
      for (let i = 23; i >= 0; i--) {
        const h = (currentHour - i + 24) % 24;
        const label = `${String(h).padStart(2, '0')}:00`;
        list.push({ name: label, Pageviews: countsMap[label] || 0 });
      }
      return list;
    }
    if (timeRange === 'yesterday') {
      const list = [];
      for (let h = 0; h < 24; h++) {
        const label = `${String(h).padStart(2, '0')}:00`;
        list.push({ name: label, Pageviews: countsMap[label] || 0 });
      }
      return list;
    }
    if (timeRange === 'custom') {
      if (isSingleDay) {
        const list = [];
        for (let h = 0; h < 24; h++) {
          const label = `${String(h).padStart(2, '0')}:00`;
          list.push({ name: label, Pageviews: countsMap[label] || 0 });
        }
        return list;
      }
      const list = [];
      const start = new Date(customStart || new Date());
      const end = customEnd ? new Date(customEnd) : new Date();
      const dayDiff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      for (let i = 0; i <= dayDiff; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        list.push({ name: label, Pageviews: countsMap[label] || 0 });
      }
      return list;
    }

    const list = [];
    const days = timeRange === '7d' ? 7 : 30;
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      list.push({ name: label, Pageviews: countsMap[label] || 0 });
    }
    return list;
  }, [finalFilteredStats, timeRange, customStart, customEnd]);

  // Compute mean, stdDev, and spikeThreshold for the chart data
  const chartMetrics = useMemo(() => {
    if (chartDataFinal.length === 0) return { mean: 0, stdDev: 0, spikeThreshold: 0 };
    const values = chartDataFinal.map((d: any) => d.Pageviews);
    const sum = values.reduce((a, b) => a + b, 0);
    const meanVal = sum / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - meanVal, 2), 0) / values.length;
    const stdDevVal = Math.sqrt(variance);
    // Spike threshold: mean + 1.5 * stdDev (min 2 to avoid marking low traffic/normal state as spike)
    const threshold = stdDevVal > 0 ? meanVal + 1.5 * stdDevVal : Math.max(2, meanVal + 2);
    return { mean: meanVal, stdDev: stdDevVal, spikeThreshold: threshold };
  }, [chartDataFinal]);

  return (
    <div className="space-y-6 font-sans pb-10" style={{ color: 'var(--text)' }}>
      {/* Header controls section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] rounded-lg transition"
            title="Back to master dashboard"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold font-mono text-[var(--text)] leading-none">{domain}</h2>
              {rulesLoading ? (
                <RefreshCw className="animate-spin text-[var(--muted)]" size={12} />
              ) : rules ? (
                <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-0.5 shadow-sm select-none">
                  <span className="text-[9px] uppercase font-bold text-[var(--muted)] px-1.5">Domain Status</span>
                  <button
                    onClick={handleToggleStatus}
                    disabled={statusToggling}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 ${
                      rules.is_offline ? 'bg-red-500/30' : 'bg-green-500/30'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow transition duration-200 ease-in-out ${
                        rules.is_offline ? 'translate-x-0 bg-red-500' : 'translate-x-5 bg-green-500'
                      }`}
                    />
                  </button>
                  <span className={`text-[9px] font-bold uppercase tracking-wider pr-1.5 ${rules.is_offline ? 'text-red-400' : 'text-green-400'}`}>
                    {rules.is_offline ? 'Offline' : 'Online'}
                  </span>
                </div>
              ) : null}

              {activeVisitors > 0 && (
                <span className="flex items-center gap-1 text-[11px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20 font-mono font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  {activeVisitors} active
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              {rules?.is_offline ? '🔴 Offline Mode: All visitors are currently redirected to google.com.' : '🟢 Online Mode: Processing visitor traffic and applying geo-rules.'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface)] text-[var(--text)] rounded-lg transition"
          >
            <Shield size={14} className={showSettings ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
            <span>Settings</span>
            {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-0.5 flex flex-wrap gap-0.5">
            {(['12h', '24h', 'yesterday', '7d', '30d', 'custom'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition ${
                  timeRange === r
                    ? 'bg-[var(--accent)] text-white shadow'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {r === '12h' ? '12h' : r === '24h' ? '24h' : r === 'yesterday' ? 'Yesterday' : r === '7d' ? '7d' : r === '30d' ? '30d' : 'Custom'}
              </button>
            ))}
          </div>

          {timeRange === 'custom' && (
            <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-0.5">
              <div className="flex items-center gap-1.5 pl-2">
                <span className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Start</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--text)] outline-none focus:border-[var(--accent)] transition h-7"
                />
              </div>
              <div className="flex items-center gap-1.5 pl-1 pr-2">
                <span className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">End</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--text)] outline-none focus:border-[var(--accent)] transition h-7"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            msg.type === 'ok' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Traffic Rules Settings block */}
      {showSettings && (
        <div className="panel p-6 space-y-6 bg-[var(--surface-2)] border border-[var(--accent)]/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <Shield className="text-[var(--accent)]" size={16} />
                <span>Traffic Control & Rules Manager</span>
              </h3>
              <p className="text-[11px] text-[var(--muted)]">
                Manage geo-fencing, device locks, bot cloaking, smart redirects, and real-time Telegram alerts for {domain}.
              </p>
            </div>
            <span className="text-[11px] font-mono bg-[var(--accent)]/10 text-[var(--accent)] px-2.5 py-1 rounded-full border border-[var(--accent)]/20 font-bold">
              Domain: {domain}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Routing & Filters */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">🔗 Smart Traffic Routing</h4>
                <div className="space-y-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                      Target Redirect URL (Clean Traffic)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. https://myoffer.com/landing"
                      value={redirectUrl}
                      onChange={(e) => setRedirectUrl(e.target.value)}
                      className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)] transition"
                    />
                    <span className="text-[9px] text-[var(--muted)]">Redirect allowed visitors to this link. Leave empty to display the website normally.</span>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                      Block Redirect URL (Blocked Traffic)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. https://google.com"
                      value={blockRedirectUrl}
                      onChange={(e) => setBlockRedirectUrl(e.target.value)}
                      className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)] transition"
                    />
                    <span className="text-[9px] text-[var(--muted)]">Redirect filtered traffic/bots to this link. Leave empty to show a benign 404 page.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">🛡️ Access Filters</h4>
                <div className="space-y-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-[var(--muted)] block mb-1">
                        Whitelisted Countries
                      </label>
                      <CountryTagInput
                        tags={allowedCountries}
                        onChange={setAllowedCountries}
                        placeholder="Add Whitelisted Countries"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-[var(--muted)] block mb-1">
                        Blacklisted Countries
                      </label>
                      <CountryTagInput
                        tags={blockedCountries}
                        onChange={setBlockedCountries}
                        placeholder="Add Blacklisted Countries"
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1.5">
                      Allowed Devices (Unchecked = All Allowed)
                    </label>
                    <div className="flex gap-4">
                      {['desktop', 'mobile', 'tablet'].map((dev) => (
                        <label key={dev} className="flex items-center gap-1.5 text-xs text-[var(--text)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowedDevices.includes(dev)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAllowedDevices([...allowedDevices, dev]);
                              } else {
                                setAllowedDevices(allowedDevices.filter(d => d !== dev));
                              }
                            }}
                            className="accent-[var(--accent)] rounded"
                          />
                          <span className="capitalize">{dev}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Cloaking & Telegram Settings */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">🔒 Security, VPN & Bot Cloaking</h4>
                <div className="space-y-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                  <ToggleSwitch
                    checked={enableCloaking}
                    onChange={setEnableCloaking}
                    label="Enable Bot / Crawler Cloaking"
                    description="Identifies and filters bots, search engine indexers, web crawlers, and headless browser scrapers."
                  />

                  <div className="border-t border-[var(--border)] pt-2.5">
                    <ToggleSwitch
                      checked={enableVpnBlocking}
                      onChange={setEnableVpnBlocking}
                      label="Block VPN / Proxies"
                      description="Detects request headers containing proxy variables or multiple route hops."
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">💬 Live Telegram Traffic Alerts</h4>
                <div className="space-y-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                  <ToggleSwitch
                    checked={telegramAlertsEnabled}
                    onChange={setTelegramAlertsEnabled}
                    label="Enable Real-Time Visitor Alerts"
                    description="Send messages to Telegram on new unique visitors or blocked traffic occurrences."
                  />

                  <div className="border-t border-[var(--border)] pt-2.5">
                    <ToggleSwitch
                      checked={enableAnomalyAlerts}
                      onChange={setEnableAnomalyAlerts}
                      label="Enable Peak & Anomaly Alerts"
                      description="Trigger Telegram messages if traffic spikes 3x above the 24-hour average baseline (min 5 views/5m)."
                    />
                  </div>

                  {(telegramAlertsEnabled || enableAnomalyAlerts) && (
                    <div className="space-y-3 pt-2 border-t border-[var(--border)] animate-in fade-in duration-200">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                          Telegram Bot Token
                        </label>
                        <input
                          type="password"
                          placeholder="e.g. 123456789:ABCdef..."
                          value={telegramBotToken}
                          onChange={(e) => setTelegramBotToken(e.target.value)}
                          className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)] transition"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                          Chat / Channel ID
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. -100123456789 or @mychannel"
                          value={telegramChatId}
                          onChange={(e) => setTelegramChatId(e.target.value)}
                          className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)] transition"
                        />
                      </div>
                      {telegramAlertsEnabled && (
                        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[var(--border)]/50">
                          <div>
                            <label className="text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
                              Milestone Views (X)
                            </label>
                            <input
                              type="number"
                              placeholder="e.g. 100"
                              value={telegramViewThreshold}
                              onChange={(e) => setTelegramViewThreshold(e.target.value)}
                              className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text)] outline-none focus:border-[var(--accent)] transition"
                            />
                          </div>
                          <div className="flex items-center pl-2 pt-4">
                            <ToggleSwitch
                              checked={telegramViewRepeat}
                              onChange={setTelegramViewRepeat}
                              label="Repeat Milestone"
                              description="Alert every X views"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveRules}
                  disabled={rulesSaving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white font-semibold text-xs rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {rulesSaving ? (
                    <RefreshCw className="animate-spin" size={13} />
                  ) : (
                    <Shield size={13} />
                  )}
                  <span>{rulesSaving ? 'Saving rules...' : 'Save & Deploy Rules'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {finalFilteredStats.length === 0 ? (
        <div className="panel p-8 text-center flex flex-col items-center justify-center space-y-3 py-20 bg-[var(--surface-2)] border border-[var(--border)]">
          <Activity size={40} className="text-[var(--muted)]" />
          <h3 className="text-sm font-semibold">No website analytics data found for this domain</h3>
          <p className="text-xs text-[var(--muted)] max-w-sm">
            Ensure you installed the script snippet correctly and have visited the site to send the initial telemetry payload.
          </p>
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs px-4 py-2 bg-[var(--accent)] text-white font-medium rounded-lg shadow-sm transition hover:bg-[var(--accent)]/90"
          >
            Go Back
          </button>
        </div>
      ) : (
        <>
          {selectedCountryFilter && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-xs text-[var(--text)] select-none animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                Filtered by Country: <strong className="font-mono text-[var(--accent)]">{countryCoordinates[selectedCountryFilter]?.name || selectedCountryFilter}</strong>
              </span>
              <button
                onClick={() => setSelectedCountryFilter(null)}
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] font-semibold transition"
              >
                Clear Filter [x]
              </button>
            </div>
          )}
          {/* Metrics summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-indigo-500/[0.01] p-4 flex items-center gap-3 transition-all duration-300 hover:shadow-sm">
              <div className="p-2.5 rounded-lg bg-slate-500/5 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <Eye size={18} />
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Pageviews</p>
                <h3 className="text-lg font-black text-[var(--text)]">{metrics.pageviews.toLocaleString()}</h3>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.01] p-4 flex items-center gap-3 transition-all duration-300 hover:shadow-sm">
              <div className="p-2.5 rounded-lg bg-slate-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Users size={18} />
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Unique Visitors</p>
                <h3 className="text-lg font-black text-[var(--text)]">{metrics.uniqueSessions.toLocaleString()}</h3>
              </div>
            </div>

            <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/[0.08] to-purple-500/[0.01] p-4 flex items-center gap-3 transition-all duration-300 hover:shadow-sm">
              <div className="p-2.5 rounded-lg bg-slate-500/5 border border-purple-500/20 text-purple-600 dark:text-purple-400">
                <Activity size={18} />
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Active Users (5m)</p>
                <h3 className="text-lg font-black text-[var(--text)] flex items-center gap-1.5">
                  <span>{activeVisitors}</span>
                  {activeVisitors > 0 && <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />}
                </h3>
              </div>
            </div>

            <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.08] to-orange-500/[0.01] p-4 flex items-center gap-3 transition-all duration-300 hover:shadow-sm">
              <div className="p-2.5 rounded-lg bg-slate-500/5 border border-orange-500/20 text-orange-600 dark:text-orange-400">
                <Globe size={18} />
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Monitored Site</p>
                <h3 className="text-sm font-semibold truncate max-w-[140px] font-mono text-[var(--text)]">
                  {domain}
                </h3>
              </div>
            </div>
          </div>

          {/* Web Vitals Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="panel p-4 space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                <span>Time to First Byte (TTFB)</span>
                <Zap size={14} className="text-yellow-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{metrics.performance.avgTtfb || '—'}</span>
                <span className="text-xs text-[var(--muted)]">ms</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                {metrics.performance.avgTtfb === 0 ? (
                  <span className="text-[var(--muted)]">No data yet</span>
                ) : metrics.performance.avgTtfb < 200 ? (
                  <span className="text-green-500 font-semibold">● Excellent speed</span>
                ) : metrics.performance.avgTtfb < 600 ? (
                  <span className="text-yellow-500 font-semibold">● Average loading</span>
                ) : (
                  <span className="text-red-500 font-semibold">● High server latency</span>
                )}
              </div>
            </div>

            <div className="panel p-4 space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                <span>Average Page Load</span>
                <Activity size={14} className="text-green-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{metrics.performance.avgLoadTime || '—'}</span>
                <span className="text-xs text-[var(--muted)]">sec</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                {metrics.performance.avgLoadTime === 0 ? (
                  <span className="text-[var(--muted)]">No data yet</span>
                ) : metrics.performance.avgLoadTime < 2.5 ? (
                  <span className="text-green-500 font-semibold">● Fast load</span>
                ) : metrics.performance.avgLoadTime < 4.0 ? (
                  <span className="text-yellow-500 font-semibold">● Needs improvement</span>
                ) : (
                  <span className="text-red-500 font-semibold">● Poor loading time</span>
                )}
              </div>
            </div>

            <div className="panel p-4 space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                <span>Unique Sessions</span>
                <Users size={14} className="text-purple-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{metrics.uniqueSessions}</span>
                <span className="text-xs text-[var(--muted)]">sessions</span>
              </div>
              <p className="text-[10px] text-[var(--muted)]">
                Average interaction events: {metrics.pageviews > 0 && metrics.uniqueSessions > 0 ? (metrics.pageviews / metrics.uniqueSessions).toFixed(1) : 0} pages/session
              </p>
            </div>
          </div>

          {/* Map and Chart Area */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* World Dotted Map (Col-Span-2) */}
            <div className="panel p-5 md:col-span-2 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block">
                  Geographic Visitor Density (Edge Geolocated)
                </span>
                {hoveredCountry && (
                  <span className="text-xs font-semibold text-[var(--accent)] font-mono">
                    {hoveredCountry}
                  </span>
                )}
              </div>

              {/* Styled Dotted SVG World Map */}
              <div className="relative w-full aspect-[2/1] bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex items-center justify-center">
                <svg viewBox="0 0 100 50" className="w-full h-full opacity-35 select-none pointer-events-none">
                  {/* North America */}
                  <circle cx="15" cy="20" r="1.5" fill="var(--muted)" />
                  <circle cx="18" cy="23" r="1" fill="var(--muted)" />
                  <circle cx="21" cy="25" r="1.2" fill="var(--muted)" />
                  <circle cx="25" cy="22" r="1.4" fill="var(--muted)" />
                  <circle cx="28" cy="18" r="1" fill="var(--muted)" />
                  <circle cx="12" cy="15" r="1" fill="var(--muted)" />
                  {/* South America */}
                  <circle cx="34" cy="38" r="1.2" fill="var(--muted)" />
                  <circle cx="36" cy="42" r="1.5" fill="var(--muted)" />
                  <circle cx="38" cy="46" r="1.1" fill="var(--muted)" />
                  {/* Europe / Africa */}
                  <circle cx="48" cy="20" r="1.3" fill="var(--muted)" />
                  <circle cx="51" cy="24" r="1.5" fill="var(--muted)" />
                  <circle cx="50" cy="32" r="1.1" fill="var(--muted)" />
                  <circle cx="52" cy="38" r="1.3" fill="var(--muted)" />
                  <circle cx="54" cy="44" r="1.4" fill="var(--muted)" />
                  {/* Asia / Russia */}
                  <circle cx="65" cy="18" r="1.5" fill="var(--muted)" />
                  <circle cx="70" cy="22" r="1.7" fill="var(--muted)" />
                  <circle cx="74" cy="28" r="1.4" fill="var(--muted)" />
                  <circle cx="78" cy="32" r="1.2" fill="var(--muted)" />
                  <circle cx="82" cy="26" r="1.5" fill="var(--muted)" />
                  <circle cx="71" cy="34" r="1.1" fill="var(--muted)" />
                  <circle cx="68" cy="38" r="1.3" fill="var(--muted)" />
                  {/* Australia */}
                  <circle cx="84" cy="42" r="1.1" fill="var(--muted)" />
                  <circle cx="86" cy="45" r="1.4" fill="var(--muted)" />
                </svg>

                {/* Country nodes layer */}
                <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full">
                  {mapCountries.map((cStat) => {
                    const coord = countryCoordinates[cStat.code];
                    if (!coord) return null;

                    const totalViews = domainFilteredStats.length || 1;
                    const percent = Math.round((cStat.count / totalViews) * 100) || 0;
                    const radius = Math.max(1.2, Math.min(4, 1.2 + (cStat.count / totalViews) * 3));

                    return (
                      <g
                        key={cStat.code}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredCountry(`${coord.name}: ${cStat.count} hits (${percent}%)`)}
                        onMouseLeave={() => setHoveredCountry(null)}
                        onClick={() => setSelectedCountryFilter(selectedCountryFilter === cStat.code ? null : cStat.code)}
                      >
                        <circle
                          cx={coord.x}
                          cy={coord.y}
                          r={radius * 1.8}
                          fill={selectedCountryFilter === cStat.code ? "#10b981" : "var(--accent)"}
                          className="opacity-25 animate-ping"
                        />
                        <circle
                          cx={coord.x}
                          cy={coord.y}
                          r={radius}
                          fill={selectedCountryFilter === cStat.code ? "#10b981" : "var(--accent)"}
                          className="hover:fill-green-400 transition"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Top Countries List Table */}
            <div className="panel p-5 space-y-4">
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block">
                Top Countries
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {mapCountries.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] py-4 text-center">No locations mapped.</p>
                ) : (
                  mapCountries.map((c, idx) => {
                    const coord = countryCoordinates[c.code];
                    const name = coord ? coord.name : c.code;
                    const totalViews = domainFilteredStats.length || 1;
                    const percent = Math.round((c.count / totalViews) * 100) || 0;
                    const isSelected = selectedCountryFilter === c.code;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedCountryFilter(isSelected ? null : c.code)}
                        className={`flex justify-between items-center w-full text-xs py-1.5 px-2 rounded border-b border-[var(--border)] hover:bg-[var(--surface)] text-left transition ${
                          isSelected ? 'bg-[var(--accent)]/15 border-l-2 border-l-[var(--accent)]' : ''
                        }`}
                      >
                        <span className="text-[var(--text)] font-medium truncate max-w-[120px]">{name}</span>
                        <span className="text-[var(--muted)] font-mono">
                          {c.count} ({percent}%)
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* Timeline Chart */}
          <div className="panel p-5">
            <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-4">
              Visitor Traffic Volume
            </span>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDataFinal} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="name"
                    stroke="var(--border)"
                    tick={{ fill: 'var(--muted)', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--border)"
                    tick={{ fill: 'var(--muted)', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface-2)',
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  {chartMetrics.spikeThreshold > 0 && (
                    <ReferenceLine
                      y={chartMetrics.spikeThreshold}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{
                        value: `Spike Threshold (${Math.round(chartMetrics.spikeThreshold)})`,
                        fill: '#ef4444',
                        fontSize: 9,
                        position: 'top'
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="Pageviews"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPv)"
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      const isSpike = payload.Pageviews > chartMetrics.spikeThreshold && payload.Pageviews >= 3;
                      if (isSpike) {
                        return (
                          <g key={props.key || props.index}>
                            <circle cx={cx} cy={cy} r={7} fill="#ef4444" className="animate-ping opacity-60" />
                            <circle cx={cx} cy={cy} r={4.5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
                          </g>
                        );
                      }
                      return <circle key={props.key || props.index} cx={cx} cy={cy} r={3} fill="var(--accent)" stroke="#fff" strokeWidth={1} />;
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* User Flow (Sankey Paths) */}
          <div className="panel p-5 space-y-4">
            <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block">
              User Flow Diagram (First 3 steps sequence)
            </span>

            <div className="grid grid-cols-3 gap-6 items-start relative min-h-[140px] pt-4">
              {/* Step 1 Node Column */}
              <div className="space-y-2 flex flex-col items-center">
                <span className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Step 1: Landing</span>
                {userFlows.step1.length === 0 ? (
                  <span className="text-xs text-[var(--muted)]">No flows</span>
                ) : (
                  userFlows.step1.map(([path, count], idx) => (
                    <div key={idx} className="w-full text-center py-2 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs font-mono font-medium truncate max-w-[150px]">
                      {path} <span className="text-[var(--accent)] font-bold ml-1">({count})</span>
                    </div>
                  ))
                )}
              </div>

              {/* Step 2 Transitions */}
              <div className="space-y-2 flex flex-col items-center">
                <span className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Step 2: Transition</span>
                {userFlows.step1To2.length === 0 ? (
                  <span className="text-xs text-[var(--muted)]">No transition</span>
                ) : (
                  userFlows.step1To2.map(([transition, count], idx) => {
                    const [p1, p2] = transition.split('→');
                    return (
                      <div key={idx} className="w-full text-center py-2 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs font-mono font-medium truncate max-w-[150px]">
                        {p2} <span className="text-[var(--accent)] font-bold ml-1">({count})</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Step 3 Transitions */}
              <div className="space-y-2 flex flex-col items-center">
                <span className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider">Step 3: Exit / Next</span>
                {userFlows.step2To3.length === 0 ? (
                  <span className="text-xs text-[var(--muted)]">No transition</span>
                ) : (
                  userFlows.step2To3.map(([transition, count], idx) => {
                    const [p2, p3] = transition.split('→');
                    return (
                      <div key={idx} className="w-full text-center py-2 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs font-mono font-medium truncate max-w-[150px]">
                        {p3} <span className="text-[var(--accent)] font-bold ml-1">({count})</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Retention Cohort Analysis Grid */}
          <div className="panel p-5 space-y-4 overflow-x-auto">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block">
                User Cohort Retention Grid
              </span>
              <p className="text-[10px] text-[var(--muted)] mt-0.5">
                Week-by-week return rate of unique session IDs over a 12-week range.
              </p>
            </div>

            {cohortsData.length === 0 ? (
              <p className="text-xs text-[var(--muted)] text-center py-4">No cohort history recorded.</p>
            ) : (
              <table className="w-full border-collapse text-left text-xs min-w-[600px] font-mono">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)] font-semibold">
                    <th className="py-2 pr-4">Cohort Week</th>
                    <th className="py-2 pr-4 text-center">Size</th>
                    {Array(12).fill(0).map((_, i) => (
                      <th key={i} className="py-2 text-center w-[50px]">W{i}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {cohortsData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[var(--surface)]/20">
                      <td className="py-2 pr-4 font-sans font-medium text-[var(--text)]">{row.label}</td>
                      <td className="py-2 pr-4 text-center text-[var(--muted)]">{row.size}</td>
                      {row.percentages.map((pct, wIdx) => {
                        const opacity = pct > 0 ? Math.max(0.1, pct / 100) : 0;
                        const bgColor = pct > 0 ? `rgba(79, 110, 247, ${opacity})` : 'transparent';
                        const textColor = pct > 45 ? '#fff' : 'var(--text)';

                        return (
                          <td
                            key={wIdx}
                            className="py-2 text-center text-[10px] font-bold transition border-l border-[var(--border)]"
                            style={{ background: bgColor, color: textColor }}
                          >
                            {pct}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Traffic Sources & UTM Campaign Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Standard Referrers */}
            <div className="panel p-5 space-y-4">
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                Top Traffic Referrers
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {metrics.topReferrers.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] py-4 text-center">No referrers recorded.</p>
                ) : (
                  metrics.topReferrers.slice(0, 5).map((ref, idx) => {
                    const percent = Math.round((ref.count / metrics.pageviews) * 100) || 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-[var(--text)] truncate max-w-[280px]">{ref.referrer}</span>
                          <span className="text-[var(--muted)]">
                            {ref.count} ({percent}%)
                          </span>
                        </div>
                        <div className="w-full bg-[var(--surface-2)] h-1 rounded-full overflow-hidden">
                          <div
                            className="bg-green-500 h-full rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* UTM Campaigns Breakdown */}
            <div className="panel p-5 space-y-4">
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                UTM Campaign Performance
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 font-mono text-xs">
                {metrics.utm.campaigns.length === 0 || (metrics.utm.campaigns.length === 1 && metrics.utm.campaigns[0][0] === 'none') ? (
                  <p className="text-xs text-[var(--muted)] py-4 text-center">No campaign parameters detected in visitor URLs.</p>
                ) : (
                  metrics.utm.campaigns.filter(([name]) => name !== 'none').map(([name, count], idx) => {
                    const percent = Math.round((count / metrics.pageviews) * 100) || 0;
                    return (
                      <div key={idx} className="flex justify-between items-center py-1.5 border-b border-[var(--border)]">
                        <span className="text-[var(--text)] truncate max-w-[200px]">{name}</span>
                        <span className="text-[var(--muted)]">
                          {count} visits ({percent}%)
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* Devices, OS, Browsers Breakdown Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Devices */}
            <div className="panel p-5 space-y-4">
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Devices</span>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center p-3 bg-[var(--surface-2)] rounded-lg">
                  <Monitor size={16} className="text-[var(--accent)] mb-1" />
                  <span className="text-[8px] uppercase font-semibold text-[var(--muted)]">Desktop</span>
                  <span className="text-sm font-bold mt-1">{metrics.devices.desktop || 0}</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-[var(--surface-2)] rounded-lg">
                  <Smartphone size={16} className="text-green-500 mb-1" />
                  <span className="text-[8px] uppercase font-semibold text-[var(--muted)]">Mobile</span>
                  <span className="text-sm font-bold mt-1">{metrics.devices.mobile || 0}</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-[var(--surface-2)] rounded-lg">
                  <Tablet size={16} className="text-purple-500 mb-1" />
                  <span className="text-[8px] uppercase font-semibold text-[var(--muted)]">Tablet</span>
                  <span className="text-sm font-bold mt-1">{metrics.devices.tablet || 0}</span>
                </div>
              </div>
            </div>

            {/* Operating Systems */}
            <div className="panel p-5 space-y-3">
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block">Operating Systems</span>
              <div className="space-y-1.5 max-h-24 overflow-y-auto text-xs pr-1 font-mono">
                {metrics.os.length === 0 ? (
                  <span className="text-[var(--muted)]">No OS logs</span>
                ) : (
                  metrics.os.map(([os, count], idx) => (
                    <div key={idx} className="flex justify-between py-0.5 border-b border-[var(--border)]">
                      <span>{os}</span>
                      <span className="text-[var(--muted)]">{count} hits</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Browsers */}
            <div className="panel p-5 space-y-3">
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider block">Browsers</span>
              <div className="space-y-1.5 max-h-24 overflow-y-auto text-xs pr-1 font-mono">
                {metrics.browser.length === 0 ? (
                  <span className="text-[var(--muted)]">No browser logs</span>
                ) : (
                  metrics.browser.map(([browser, count], idx) => (
                    <div key={idx} className="flex justify-between py-0.5 border-b border-[var(--border)]">
                      <span>{browser}</span>
                      <span className="text-[var(--muted)]">{count} hits</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
