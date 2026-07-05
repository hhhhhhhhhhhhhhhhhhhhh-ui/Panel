import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import io, { Socket } from 'socket.io-client';
import { useAuth } from '../../lib/hooks/useAuth';
import { 
  Server, Cpu, HardDrive, Database, Activity, RefreshCw, Radio, 
  ArrowUp, ArrowDown, ShieldCheck, AlertCircle, Wifi 
} from 'lucide-react';

interface MetricData {
  cpu: { usagePercentage: string; cores: number };
  memory: { total: string; used: string; percentage: string };
  database: { latencyMs: number; status: string };
  redis: { status: string };
  uptime: number;
  disk?: { total: string; used: string; percentage: string };
  network?: { rxSec: string; txSec: string };
  timestamp?: number;
}

export default function SystemHealth() {
  const { token } = useAuth();
  const [health, setHealth] = useState<MetricData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  
  // Broadcast Announcement states
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState('info');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);

  // Rolling metrics history (limit to 25 items for smooth streaming render)
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [netRxHistory, setNetRxHistory] = useState<number[]>([]);
  const [netTxHistory, setNetTxHistory] = useState<number[]>([]);

  const socketRef = useRef<any>(null);

  const parseSpeedToKb = (speedStr?: string) => {
    if (!speedStr) return 0;
    const num = parseFloat(speedStr);
    if (speedStr.includes('MB/s')) {
      return num * 1024;
    }
    return num;
  };

  // REST Fallback fetcher
  const fetchHealthFallback = async () => {
    try {
      const res = await axios.get('/api/superadmin/health', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHealth(res.data);
      
      // Update basic histories from polling
      setCpuHistory(prev => [...prev.slice(-24), Number(res.data.cpu.usagePercentage)]);
      setMemHistory(prev => [...prev.slice(-24), Number(res.data.memory.percentage)]);
      if (res.data.network) {
        setNetRxHistory(prev => [...prev.slice(-24), parseSpeedToKb(res.data.network.rxSec)]);
        setNetTxHistory(prev => [...prev.slice(-24), parseSpeedToKb(res.data.network.txSec)]);
      }
    } catch (err) {
      console.error('REST fallback health check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch broadcasts (separate from socket metrics)
  const fetchBroadcasts = async () => {
    try {
      const res = await axios.get('/api/superadmin/broadcasts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBroadcastHistory(res.data || []);
    } catch (err) {
      console.error('Failed to fetch broadcasts:', err);
    }
  };

  useEffect(() => {
    if (!token) return;
    
    fetchBroadcasts();

    // 1. Initialize WebSocket connection to superadmin namespace
    const socketUrl = window.location.origin.replace('3000', '3001');
    const socketClient = io(`${socketUrl}/superadmin`, {
      auth: { token }
    });

    socketRef.current = socketClient;

    socketClient.on('connect', () => {
      setIsSocketConnected(true);
      setLoading(false);
    });

    socketClient.on('metrics', (data: MetricData) => {
      setHealth(data);
      
      // Append usage statistics to histories
      setCpuHistory(prev => [...prev.slice(-24), Number(data.cpu.usagePercentage)]);
      setMemHistory(prev => [...prev.slice(-24), Number(data.memory.percentage)]);
      
      const rxVal = data.network ? parseSpeedToKb(data.network.rxSec) : 0;
      const txVal = data.network ? parseSpeedToKb(data.network.txSec) : 0;
      setNetRxHistory(prev => [...prev.slice(-24), rxVal]);
      setNetTxHistory(prev => [...prev.slice(-24), txVal]);
    });

    socketClient.on('connect_error', () => {
      setIsSocketConnected(false);
      // Fallback immediately to manual polling
      fetchHealthFallback();
    });

    socketClient.on('disconnect', () => {
      setIsSocketConnected(false);
    });

    // 2. Setup periodic fallback checks if websocket is offline
    const interval = setInterval(() => {
      if (!socketRef.current?.connected) {
        fetchHealthFallback();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      socketClient.disconnect();
    };
  }, [token]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage) return;
    setIsBroadcasting(true);
    try {
      await axios.post('/api/superadmin/broadcast', 
        { message: broadcastMessage, type: broadcastType },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBroadcastMessage('');
      fetchBroadcasts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to send broadcast');
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Render rolling SVG linear sparkline with gradients
  const renderGradientSparkline = (dataPoints: number[], color: string, gradientId: string, maxLimit = 100) => {
    if (dataPoints.length < 2) {
      return (
        <div className="h-[80px] flex items-center justify-center text-[10px] text-slate-600 italic">
          Accumulating data...
        </div>
      );
    }
    const width = 500;
    const height = 80;
    const maxVal = Math.max(...dataPoints, maxLimit);
    const minVal = 0;
    const range = maxVal - minVal || 1;
    
    const points = dataPoints.map((val, index) => {
      const x = (index / (dataPoints.length - 1)) * width;
      const y = height - ((val - minVal) / range) * height;
      return { x, y };
    });
    
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[80px] overflow-visible select-none" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {/* Horizontal reference grids */}
        <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3 3" />
        {/* Fill Area */}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        {/* Line Path */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Current Endpoint Dot */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" fill={color} stroke="#020617" strokeWidth="1.5" />
      </svg>
    );
  };

  if (loading && !health) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Listening to server monitoring gateway...</p>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="p-6 bg-red-950/20 border border-red-900/50 rounded-xl flex items-center gap-3 text-red-400">
        <AlertCircle />
        <span className="text-xs font-semibold">Failed to establish system metrics connection tunnel.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header Info */}
      <div className="flex justify-between items-center bg-slate-950 p-6 border border-slate-850 rounded-xl">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-400" />
            SuperAdmin Host Monitoring
          </h2>
          <p className="text-xs text-slate-500 mt-1">Real-time system telemetry pushed directly over secure WebSockets.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-lg text-[10px] font-bold">
          <span className={`w-2.5 h-2.5 rounded-full ${isSocketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
          <span className={isSocketConnected ? 'text-emerald-400' : 'text-amber-400'}>
            {isSocketConnected ? 'LIVE SOCKET ACTIVE' : 'REST POLLING MODE'}
          </span>
        </div>
      </div>

      {/* Primary Graphs & Telemetry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* CPU Monitoring Card */}
        <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Processor Telemetry</span>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-emerald-400" />
                CPU Core Load
              </h3>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white">{health.cpu.usagePercentage}%</span>
              <p className="text-[10px] text-slate-500 font-semibold">{health.cpu.cores} Cores Enabled</p>
            </div>
          </div>
          
          <div className="p-2 bg-slate-900/40 border border-slate-900 rounded-lg">
            {renderGradientSparkline(cpuHistory, '#10b981', 'cpuGrad')}
          </div>
        </div>

        {/* Memory RAM Monitoring Card */}
        <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Memory Allocation</span>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                RAM Allocation
              </h3>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white">{health.memory.percentage}%</span>
              <p className="text-[10px] text-slate-500 font-semibold">{health.memory.used} / {health.memory.total}</p>
            </div>
          </div>
          
          <div className="p-2 bg-slate-900/40 border border-slate-900 rounded-lg">
            {renderGradientSparkline(memHistory, '#06b6d4', 'memGrad')}
          </div>
        </div>

        {/* Network Bandwidth Speed Card */}
        <div className="bg-slate-950 border border-slate-855 p-5 rounded-xl space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Network Throughput</span>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-indigo-400" />
                Bandwidth Band Rate
              </h3>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><ArrowDown className="w-3.5 h-3.5 text-indigo-400" /> RX</span>
                <span className="text-sm font-black text-white">{health.network?.rxSec || '0.0 KB/s'}</span>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><ArrowUp className="w-3.5 h-3.5 text-fuchsia-400" /> TX</span>
                <span className="text-sm font-black text-white">{health.network?.txSec || '0.0 KB/s'}</span>
              </div>
            </div>
          </div>

          <div className="p-2 bg-slate-900/40 border border-slate-900 rounded-lg space-y-2">
            <div className="h-[80px] relative">
              {renderGradientSparkline(netRxHistory, '#6366f1', 'netRxGrad', 1000)}
              <div className="absolute inset-0 opacity-40">
                {renderGradientSparkline(netTxHistory, '#d946ef', 'netTxGrad', 1000)}
              </div>
            </div>
            <div className="flex justify-center gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Download Speed</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fuchsia-500"></span> Upload Speed</span>
            </div>
          </div>
        </div>

        {/* Disk Space & Core Services Status */}
        <div className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-5">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Core Storage & Service Health</span>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              Core Infrastructure Status
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Database latency */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Database Link</p>
              <div className="text-lg font-black text-slate-200">{health.database.latencyMs} ms</div>
              <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ACTIVE
              </span>
            </div>

            {/* Redis latency */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Redis Cache</p>
              <div className="text-lg font-black text-slate-200 uppercase">{health.redis.status}</div>
              <span className={`text-[9px] font-bold flex items-center gap-1 ${health.redis.status === 'healthy' ? 'text-emerald-400' : 'text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${health.redis.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                {health.redis.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Disk Progress Tracker */}
          {health.disk && (
            <div className="space-y-1.5 p-3.5 bg-slate-900/40 border border-slate-900 rounded-xl">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-400">Disk Partition Space</span>
                <span className="text-slate-200">{health.disk.used} / {health.disk.total} ({health.disk.percentage}%)</span>
              </div>
              <div className="w-full bg-slate-950 border border-slate-850 rounded-full h-2">
                <div 
                  className="bg-indigo-500 h-1.5 rounded-full mt-[0.5px] ml-[0.5px]" 
                  style={{ width: `${Math.min(100, Number(health.disk.percentage))}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Global Broadcast Panel */}
      <div className="bg-slate-950 border border-slate-850 p-6 rounded-xl space-y-5">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-indigo-400 animate-pulse" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Global Announcements</h3>
            <p className="text-xs text-slate-500 mt-0.5">Broadcast real-time messages to all tenant operators.</p>
          </div>
        </div>

        <form onSubmit={handleBroadcast} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alert Message</label>
            <input 
              type="text" 
              value={broadcastMessage}
              onChange={e => setBroadcastMessage(e.target.value)}
              placeholder="e.g. Server core optimization scheduled in 10 minutes..."
              required
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none transition-all placeholder:text-slate-600"
            />
          </div>
          <div className="w-full sm:w-40 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Urgency Level</label>
            <select 
              value={broadcastType}
              onChange={e => setBroadcastType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none transition-all appearance-none"
            >
              <option value="info">Info (Blue)</option>
              <option value="warning">Warning (Yellow)</option>
              <option value="critical">Critical (Red)</option>
            </select>
          </div>
          <button 
            type="submit"
            disabled={isBroadcasting || !broadcastMessage}
            className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0 h-[38px] flex items-center justify-center gap-1.5"
          >
            {isBroadcasting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
            Send Alert
          </button>
        </form>

        {broadcastHistory.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-slate-900">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Announcement Ledger</span>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {broadcastHistory.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-900 rounded-xl text-xs">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      b.type === 'critical' ? 'bg-rose-500 animate-pulse' :
                      b.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
                    }`}></span>
                    <span className="text-slate-300 font-semibold">{b.message}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">{new Date(b.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
