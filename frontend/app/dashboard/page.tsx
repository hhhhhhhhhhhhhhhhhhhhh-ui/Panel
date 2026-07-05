'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Menu, Bell, AlertTriangle, Info, AlertOctagon, X } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

import { ThemeProvider } from '../../components/ThemeProvider';
import Sidebar, { type Tab } from '../../components/Sidebar';
import BottomNav from '../../components/BottomNav';
import PanicButton from '../../components/PanicButton';

import Notes from '../../components/Notes';
import Diagnostics from '../../components/Diagnostics';
import Settings from '../../components/Settings';
import MegaFileManager from '../../components/MegaFileManager';
import GuacamoleConsole from '../../components/GuacamoleConsole';
import TempMailbox from '../../components/TempMailbox';
import MediaOptimizer from '../../components/MediaOptimizer';
import PlausibleAnalytics from '../../components/PlausibleAnalytics';
import MetaAdsLibraryTracker from '../../components/MetaAdsLibraryTracker';
import OverviewDashboard from '../../components/OverviewDashboard';
import ProjectsHub from '../../components/ProjectsHub';
import TeamChat from '../../components/TeamChat';

const PAGE_TITLE: Record<Tab, string> = {
  overview: 'System Overview',
  plausible: 'Web Analytics',
  media: 'Creative Studio',
  chat: 'Team Chat',
  mail: 'Temp Mailbox',
  files: 'Mega Sync',
  guacamole: 'SSH / RDP Gateway',
  notes: 'Private Notes',
  diagnostics: 'Diagnostics',
  settings: 'Security & Audit',
  adstracker: 'Meta Ads Tracker',
  projects: 'Projects Hub',
};

export default function DashboardPage() {
  const [activeTab, setActiveTabState] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<{ id: string, message: string, type: string } | null>(null);
  const { token, initializing, loadSession, logout } = useAuth();
  const router = useRouter();

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <OverviewDashboard setActiveTab={setActiveTab} />;
      case 'plausible': return <PlausibleAnalytics />;
      case 'media': return <MediaOptimizer />;
      case 'chat': return <TeamChat />;
      case 'mail': return <TempMailbox />;
      case 'files': return <MegaFileManager />;
      case 'guacamole': return <GuacamoleConsole />;
      case 'notes': return <Notes />;
      case 'diagnostics': return <Diagnostics />;
      case 'settings': return <Settings />;
      case 'adstracker': return <MetaAdsLibraryTracker />;
      case 'projects': return <ProjectsHub />;
      default: return <OverviewDashboard setActiveTab={setActiveTab} />;
    }
  };

  const renderAnnouncement = () => {
    if (!announcement) return null;
    
    let Icon = Info;
    let bgClass = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
    if (announcement.type === 'warning') {
      Icon = AlertTriangle;
      bgClass = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    } else if (announcement.type === 'critical') {
      Icon = AlertOctagon;
      bgClass = 'bg-red-500/10 border-red-500/20 text-red-400';
    }

    return (
      <div className={`m-4 p-4 rounded-xl border flex items-start justify-between gap-4 animate-fade-in-up shadow-lg backdrop-blur-sm ${bgClass}`}>
        <div className="flex items-center gap-3">
          <Icon size={20} className="shrink-0" />
          <p className="text-sm font-medium">{announcement.message}</p>
        </div>
        <button 
          onClick={() => setAnnouncement(null)}
          className="p-1 hover:bg-black/10 rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    );
  };

  useEffect(() => { loadSession(); }, []);

  useEffect(() => {
    if (!initializing && !token) router.push('/auth/login');
  }, [token, initializing, router]);

  useEffect(() => {
    if (token) {
      const socket: Socket = io();
      socket.on('global_announcement', (data) => {
        setAnnouncement(data);
      });
      return () => {
        socket.disconnect();
      };
    }
  }, [token]);

  useEffect(() => {
    const parseTabFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') as Tab;
      if (tab && PAGE_TITLE[tab]) {
        setActiveTabState(tab);
      } else {
        setActiveTabState('overview');
      }
    };

    parseTabFromUrl();
    window.addEventListener('popstate', parseTabFromUrl);
    return () => window.removeEventListener('popstate', parseTabFromUrl);
  }, []);

  const setActiveTab = (newTab: Tab) => {
    setActiveTabState(newTab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', newTab);
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  if (initializing) {
    return (
      <ThemeProvider>
        <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (!token) return null;

  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={logout}
        />

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 h-[100dvh] relative z-10 transition-transform duration-300">
          <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 sm:px-8 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 text-slate-400 hover:text-slate-200 md:hidden"
              >
                <Menu size={20} />
              </button>
              <h2 className="text-lg font-semibold text-slate-100 truncate">{PAGE_TITLE[activeTab]}</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20 hidden sm:flex">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                System Operational
              </div>
              <PanicButton />
            </div>
          </header>

          {renderAnnouncement()}

          {/* Content area */}
          <main
            className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6 fade-in"
            style={{ background: 'var(--bg)' }}
            key={activeTab}
          >
            {activeTab === 'overview'     && <OverviewDashboard setActiveTab={setActiveTab} />}
            {activeTab === 'plausible'    && <PlausibleAnalytics />}
            {activeTab === 'notes'        && <Notes />}
            {activeTab === 'diagnostics'  && <Diagnostics />}
            {activeTab === 'settings'     && <Settings />}
            {activeTab === 'files'        && <MegaFileManager />}
            {activeTab === 'guacamole'    && <GuacamoleConsole />}
            {activeTab === 'mail'         && <TempMailbox />}
            {activeTab === 'chat'         && <TeamChat />}
            {activeTab === 'media'        && <MediaOptimizer />}
            {activeTab === 'adstracker'   && <MetaAdsLibraryTracker />}
            {activeTab === 'projects'     && <ProjectsHub />}
          </main>
        </div>

        {/* Mobile bottom nav */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onMore={() => setSidebarOpen(true)}
        />
      </div>
    </ThemeProvider>
  );
}
