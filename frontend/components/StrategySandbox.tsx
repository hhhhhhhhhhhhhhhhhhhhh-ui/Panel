'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export default function StrategySandbox() {
  const { token } = useAuth();
  const [strategyRules, setStrategyRules] = useState(
    '// If campaign CPA < $12 over a 3-day average, scale budget by 20%.\n// If CPA > $18, throttle budget by 15% to maintain ROI thresholds.'
  );
  const [budget, setBudget] = useState('150');
  const [durationDays, setDurationDays] = useState('30');
  const [targetCpa, setTargetCpa] = useState('15');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await axios.post('/api/strategy/backtest', {
        strategyRules,
        budget: Number(budget),
        durationDays: Number(durationDays),
        targetCpa: Number(targetCpa)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResult(res.data);
    } catch (err: any) {
      alert('Backtest simulation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-900 pb-5">
        <h2 className="text-xl font-bold tracking-tight text-slate-100">Interactive Scaling Rules Sandbox</h2>
        <p className="text-xs text-slate-400 mt-1">
          Backtest automated Meta Ad scaling rulesets through Claude's statistical simulation engine. Compute ROI, conversions, and bidding loops.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Rules Config Panel */}
        <div className="lg:col-span-1 bg-slate-900/20 border border-slate-900 rounded-xl p-5 h-fit">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-350 mb-4 font-mono">Sandbox Parameters</h3>
          
          <form onSubmit={runBacktest} className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] text-slate-400 font-semibold uppercase mb-1">Scaling Logic Ruleset</label>
              <textarea
                value={strategyRules}
                onChange={e => setStrategyRules(e.target.value)}
                className="w-full h-32 bg-slate-950 border border-slate-900 rounded px-3 py-2 text-slate-300 font-mono text-[11px] outline-none focus:border-slate-800"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 font-semibold uppercase mb-1">Daily Budget ($)</label>
                <input
                  type="number"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 rounded px-3 py-2 text-slate-200 outline-none focus:border-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-semibold uppercase mb-1">Target CPA ($)</label>
                <input
                  type="number"
                  value={targetCpa}
                  onChange={e => setTargetCpa(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 rounded px-3 py-2 text-slate-200 outline-none focus:border-slate-800"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-semibold uppercase mb-1">Simulation Duration (Days)</label>
              <input
                type="number"
                min="7"
                max="90"
                value={durationDays}
                onChange={e => setDurationDays(e.target.value)}
                className="w-full bg-slate-950 border border-slate-900 rounded px-3 py-2 text-slate-200 outline-none focus:border-slate-800"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold uppercase py-2.5 rounded-lg transition"
            >
              {loading ? 'Running Claude Simulation...' : '⚡ Run Rules Backtest'}
            </button>
          </form>
        </div>

        {/* Simulator Results Output */}
        <div className="lg:col-span-2 space-y-6">
          {loading && (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-8 text-center space-y-3">
              <div className="animate-spin text-slate-400 text-lg">🔄</div>
              <p className="text-xs text-slate-500 font-mono">
                &gt; Analyzing rule thresholds against historical bidding wearout indexes...
                <br />
                &gt; Running Day-by-Day Monte Carlo conversion simulation curves...
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Badges Panel */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4 text-center">
                  <span className="block text-[9px] uppercase font-bold text-slate-550 mb-1">Total Simulated Spend</span>
                  <span className="text-sm font-bold text-slate-100 font-mono">${result.totalSpend}</span>
                </div>
                <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4 text-center">
                  <span className="block text-[9px] uppercase font-bold text-slate-550 mb-1">Total Conversions</span>
                  <span className="text-sm font-bold text-slate-100 font-mono">{result.totalConversions}</span>
                </div>
                <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4 text-center">
                  <span className="block text-[9px] uppercase font-bold text-slate-550 mb-1">Final Avg CPA</span>
                  <span className="text-sm font-bold text-slate-100 font-mono">${result.finalCpa}</span>
                </div>
                <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4 text-center">
                  <span className="block text-[9px] uppercase font-bold text-slate-550 mb-1">Estimated ROI</span>
                  <span className="text-sm font-bold text-emerald-450 font-mono">{result.estimatedRoi}x</span>
                </div>
              </div>

              {/* Chart */}
              {result.chartData && (
                <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-350 mb-4">Simulated Campaign Curve</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={result.chartData}>
                        <defs>
                          <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#475569" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#475569" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#cbd5e1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" stroke="#475569" fontSize={9} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                        <Area name="Simulated Spend ($)" type="monotone" dataKey="spend" stroke="#475569" fillOpacity={1} fill="url(#colorSpend)" />
                        <Area name="Simulated Revenue ($)" type="monotone" dataKey="revenue" stroke="#cbd5e1" fillOpacity={1} fill="url(#colorRevenue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Summary & Execution logs */}
              <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Statistical Summary</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{result.summary}</p>
                </div>

                {result.logs && result.logs.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 font-mono">Rule Automation Execution Logs</h4>
                    <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[10px] text-slate-450 space-y-1.5">
                      {result.logs.map((log: string, idx: number) => (
                        <div key={idx} className="border-b border-slate-900/60 pb-1 last:border-b-0">
                          &gt; {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="flex flex-col items-center justify-center py-24 border border-dashed border-slate-900 rounded-xl text-slate-500 text-xs space-y-2">
              <span>📊 Sandbox Ready for Rule Input.</span>
              <span className="text-[10px] text-slate-600">Simulations model wearout, search trends, budget spikes, and bidding competition.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
