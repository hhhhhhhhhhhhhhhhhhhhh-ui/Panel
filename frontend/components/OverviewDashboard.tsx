'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  Activity, Server, Database, Webhook, Zap, FileText, 
  BarChart2, Radio, CheckCircle2, XCircle, ShieldAlert,
  Sliders, ArrowUp, ArrowDown, Eye, EyeOff
} from 'lucide-react';
import type { Tab } from './Sidebar';

interface OverviewStats {
  webhookLogs: number;
  notes: number;
  trackedAds: number;
  databaseLatency: number;
  uptime: number;
  memoryUsage: number;
}

interface DashboardWidget {
  id: 'metrics' | 'chart' | 'actions' | 'activity';
  name: string;
  visible: boolean;
  width: 'full' | 'two-thirds' | 'one-third';
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024, dm = 2, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const RECENT_ACTIVITY = [
  { id: 1, time: '2m ago', type: 'system', text: 'System diagnostics auto-check completed.' },
  { id: 2, time: '15m ago', type: 'webhook', text: 'Webhook payload received on /stripe-live.' },
  { id: 3, time: '1h ago', type: 'notes', text: 'Encrypted private note successfully updated.' },
  { id: 4, time: '3h ago', type: 'ads', text: 'Meta Ads tokens verified.' }
];

const CHART_DATA = [
  { time: '00:00', events: 10 }, { time: '04:00', events: 25 },
  { time: '08:00', events: 45 }, { time: '12:00', events: 80 },
  { time: '16:00', events: 120 }, { time: '20:00', events: 65 },
  { time: '24:00', events: 40 }
];

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'metrics', name: 'Key Metrics Grid', visible: true, width: 'full' },
  { id: 'chart', name: 'System Traffic Chart', visible: true, width: 'two-thirds' },
  { id: 'actions', name: 'Quick Actions Panel', visible: true, width: 'one-third' },
  { id: 'activity', name: 'Recent Activity Feed', visible: true, width: 'one-third' }
];

export default function OverviewDashboard({ setActiveTab }: { setActiveTab: (t: Tab) => void }) {
  const { token, userId } = useAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Widget Layout Editor states
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);
  const [isEditingLayout, setIsEditingLayout] = useState(false);

  // Load custom widgets layout
  useEffect(() => {
    if (userId) {
      const savedLayout = localStorage.getItem(`dashboard_layout_${userId}`);
      if (savedLayout) {
        try {
          setWidgets(JSON.parse(savedLayout));
        } catch (e) {
          setWidgets(DEFAULT_WIDGETS);
        }
      }
    }
  }, [userId]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/overview/stats', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStats(res.data);
      } catch (e) {
        console.error('Failed to load stats');
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchStats();
  }, [token]);

  const saveLayout = (newWidgets: DashboardWidget[]) => {
    setWidgets(newWidgets);
    if (userId) {
      localStorage.setItem(`dashboard_layout_${userId}`, JSON.stringify(newWidgets));
    }
  };

  const moveWidget = (index: number, direction: 'up' | 'down') => {
    const nextWidgets = [...widgets];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < nextWidgets.length) {
      const temp = nextWidgets[index];
      nextWidgets[index] = nextWidgets[targetIndex];
      nextWidgets[targetIndex] = temp;
      saveLayout(nextWidgets);
    }
  };

  const toggleWidgetVisibility = (index: number) => {
    const nextWidgets = [...widgets];
    nextWidgets[index].visible = !nextWidgets[index].visible;
    saveLayout(nextWidgets);
  };

  const changeWidgetWidth = (index: number, width: 'full' | 'two-thirds' | 'one-third') => {
    const nextWidgets = [...widgets];
    nextWidgets[index].width = width;
    saveLayout(nextWidgets);
  };

  const resetLayout = () => {
    saveLayout(DEFAULT_WIDGETS);
  };

  const getColSpanClass = (width: 'full' | 'two-thirds' | 'one-third') => {
    if (width === 'full') return 'lg:col-span-3';
    if (width === 'two-thirds') return 'lg:col-span-2';
    return 'lg:col-span-1';
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* 1. Header & Quick Status */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">Overview</h2>
          <p className="text-sm text-[var(--muted)]">Real-time system health and unified metrics.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setIsEditingLayout(!isEditingLayout)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              isEditingLayout 
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' 
                : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--border)]'
            }`}
          >
            <Sliders size={14} />
            <span>Customize Dashboard</span>
          </button>

          <div className="panel-2 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--success)]">
            <Radio size={14} className="animate-pulse" />
            <span>API Online</span>
          </div>
          <div className="panel-2 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
            <Database size={14} className="text-[var(--accent)]" />
            <span>DB Latency: {stats ? `${stats.databaseLatency}ms` : '...'}</span>
          </div>
          <div className="panel-2 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
            <Server size={14} className="text-[var(--accent)]" />
            <span>Uptime: {stats ? formatUptime(stats.uptime) : '...'}</span>
          </div>
        </div>
      </div>

      {/* Widget Layout Editor Panel */}
      {isEditingLayout && (
        <div className="panel p-5 border-indigo-500/30 bg-[#0c0e17] animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Dashboard Layout Manager</h3>
              <p className="text-xs text-gray-400">Toggle visibility, resize columns, and drag/reorder layout widgets.</p>
            </div>
            <button 
              onClick={resetLayout}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              Reset to Default
            </button>
          </div>

          <div className="space-y-3">
            {widgets.map((widget, idx) => (
              <div key={widget.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] gap-3">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => toggleWidgetVisibility(idx)}
                    className={`p-1.5 rounded-lg transition ${widget.visible ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 bg-gray-900'}`}
                    title={widget.visible ? "Hide Widget" : "Show Widget"}
                  >
                    {widget.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <span className={`text-sm font-medium ${widget.visible ? 'text-white' : 'text-gray-500 line-through'}`}>{widget.name}</span>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Width:</label>
                    <select
                      value={widget.width}
                      disabled={!widget.visible}
                      onChange={(e) => changeWidgetWidth(idx, e.target.value as any)}
                      className="bg-slate-950 border border-slate-850 text-xs text-white rounded px-2 py-1 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="one-third">1/3 Column</option>
                      <option value="two-thirds">2/3 Columns</option>
                      <option value="full">Full Width</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => moveWidget(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded bg-slate-900 border border-slate-800 text-gray-400 hover:text-white disabled:opacity-30 transition"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => moveWidget(idx, 'down')}
                      disabled={idx === widgets.length - 1}
                      className="p-1 rounded bg-slate-900 border border-slate-800 text-gray-400 hover:text-white disabled:opacity-30 transition"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Dynamic Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {widgets.map((widget) => {
          if (!widget.visible) return null;

          switch (widget.id) {
            case 'metrics':
              return (
                <div key={widget.id} className={`${getColSpanClass(widget.width)} grid grid-cols-1 md:grid-cols-3 gap-4`}>
                  <div 
                    onClick={() => setActiveTab('notes')}
                    className="panel p-4 cursor-pointer hover:border-[var(--accent)] transition group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="p-2 rounded-lg bg-[var(--surface-2)] text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition">
                        <FileText size={20} />
                      </div>
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text)]">{stats?.notes || 0}</h3>
                    <p className="text-xs text-[var(--muted)] mt-1 font-medium">Private Notes</p>
                  </div>

                  <div 
                    onClick={() => setActiveTab('adstracker')}
                    className="panel p-4 cursor-pointer hover:border-[var(--accent)] transition group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="p-2 rounded-lg bg-[var(--surface-2)] text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition">
                        <BarChart2 size={20} />
                      </div>
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text)]">{stats?.trackedAds || 0}</h3>
                    <p className="text-xs text-[var(--muted)] mt-1 font-medium">Tracked Ads</p>
                  </div>

                  <div 
                    onClick={() => setActiveTab('diagnostics')}
                    className="panel p-4 cursor-pointer hover:border-[var(--accent)] transition group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="p-2 rounded-lg bg-[var(--surface-2)] text-green-400 group-hover:bg-green-500 group-hover:text-white transition">
                        <Activity size={20} />
                      </div>
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text)]">
                      {stats ? formatBytes(stats.memoryUsage) : '0 MB'}
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-1 font-medium">Heap Memory Used</p>
                  </div>
                </div>
              );

            case 'chart':
              return (
                <div key={widget.id} className={`${getColSpanClass(widget.width)} panel p-5`}>
                  <h3 className="text-sm font-bold text-[var(--text)] mb-4 flex items-center gap-2">
                    <Activity size={16} className="text-[var(--accent)]" />
                    System Traffic (24h)
                  </h3>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={CHART_DATA} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                        <XAxis dataKey="time" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '12px' }}
                          itemStyle={{ color: 'var(--accent)' }}
                        />
                        <Area type="monotone" dataKey="events" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorEvents)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );

            case 'actions':
              return (
                <div key={widget.id} className={`${getColSpanClass(widget.width)} panel p-5`}>
                  <h3 className="text-sm font-bold text-[var(--text)] mb-4 flex items-center gap-2">
                    <Zap size={16} className="text-[var(--accent)]" />
                    Quick Actions
                  </h3>
                  <div className="space-y-2">
                    <button onClick={() => setActiveTab('mail')} className="w-full btn-primary text-xs py-2.5">
                      Generate Temp Mail
                    </button>
                    <button onClick={() => setActiveTab('files')} className="w-full bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)] text-xs font-semibold py-2.5 rounded-lg transition">
                      Open Cloud Files
                    </button>
                    <button onClick={() => setActiveTab('settings')} className="w-full bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 text-xs font-semibold py-2.5 rounded-lg transition flex justify-center items-center gap-2">
                      <ShieldAlert size={14} />
                      Security Audit
                    </button>
                  </div>
                </div>
              );

            case 'activity':
              return (
                <div key={widget.id} className={`${getColSpanClass(widget.width)} panel p-5 flex flex-col`}>
                  <h3 className="text-sm font-bold text-[var(--text)] mb-4">Recent Activity</h3>
                  <div className="space-y-4 flex-1">
                    {RECENT_ACTIVITY.map(log => (
                      <div key={log.id} className="flex gap-3 items-start">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--accent)' }} />
                        <div>
                          <p className="text-xs text-[var(--text)] leading-relaxed">{log.text}</p>
                          <p className="text-[10px] text-[var(--muted)] mt-0.5">{log.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );

            default:
              return null;
          }
        })}

      </div>
    </div>
  );
}
