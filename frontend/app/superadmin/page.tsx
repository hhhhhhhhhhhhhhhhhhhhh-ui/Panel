'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { ThemeProvider } from '../../components/ThemeProvider';
import { Shield, Users, Activity, Settings, LogOut } from 'lucide-react';
import AdminManager from '../../components/SuperAdmin/AdminManager';
import SystemHealth from '../../components/SuperAdmin/SystemHealth';

export default function SuperAdminDashboard() {
  const { role, token, initializing, logout, loadSession } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'admins' | 'system'>('admins');

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!initializing && (!token || role !== 'superadmin')) {
      router.push('/auth/login');
    }
  }, [token, role, initializing, router]);

  if (initializing || role !== 'superadmin') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading Super Admin...</div>;
  }

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans">
        
        {/* Super Admin Sidebar */}
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden md:flex">
          <div className="p-6 border-b border-slate-800 flex items-center gap-3 text-emerald-400">
            <Shield size={24} />
            <h1 className="font-bold text-lg uppercase tracking-wider text-slate-100">Super Admin</h1>
          </div>

          <div className="flex-1 py-6 space-y-2 px-4">
            <button 
              onClick={() => setActiveTab('admins')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'admins' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              <Users size={18} />
              Tenant Admins
            </button>
            <button 
              onClick={() => setActiveTab('system')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'system' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              <Activity size={18} />
              System Metrics
            </button>
          </div>

          <div className="p-4 border-t border-slate-800">
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors">
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/50 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-slate-100">
              {activeTab === 'admins' ? 'Manage Tenants' : 'System Overview'}
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                Super Admin Active
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {activeTab === 'admins' && <AdminManager />}
            {activeTab === 'system' && <SystemHealth />}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
