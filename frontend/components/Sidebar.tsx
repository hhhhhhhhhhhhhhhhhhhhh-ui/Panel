'use client';
import React from 'react';
import {
  Home, BarChart2, MessageCircle, Zap, Image, Plug, Webhook, Mail,
  Settings, FileText, Activity, FolderOpen, Monitor, Shield,
  Key, X, LogOut, Moon, Sun, ChevronRight, Layers, Briefcase,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';

export type Tab = 'overview' | 'notes' | 'diagnostics' | 'settings' | 'files' | 'guacamole' | 'mail' | 'chat' | 'media' | 'plausible' | 'projects' | 'adstracker';

interface NavItem { id: Tab; label: string; icon: React.ReactNode; }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Console',
    items: [
      { id: 'overview',  label: 'Overview',        icon: <Home size={16} /> },
    ],
  },
  {
    label: 'Campaign',
    items: [
      { id: 'plausible', label: 'Web Analytics',    icon: <Activity size={16} /> },
      { id: 'media',     label: 'Creative Studio',  icon: <Image size={16} /> },
      { id: 'adstracker', label: 'Meta Ads Tracker', icon: <Layers size={16} /> },
    ],
  },
  {
    label: 'Communication',
    items: [
      { id: 'chat',       label: 'Team Chat',       icon: <MessageCircle size={16} /> },
      { id: 'mail',       label: 'Temp Mailbox',    icon: <Mail size={16} /> },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'projects',  label: 'Projects Hub',    icon: <Briefcase size={16} /> },
      { id: 'files',     label: 'Mega Sync',       icon: <FolderOpen size={16} /> },
      { id: 'guacamole', label: 'SSH / RDP',        icon: <Monitor size={16} /> },
      { id: 'notes',     label: 'Private Notes',    icon: <FileText size={16} /> },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'diagnostics',  label: 'Diagnostics',         icon: <Activity size={16} /> },
      { id: 'settings',     label: 'Security & Audit',    icon: <Shield size={16} /> },
    ],
  },
];

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

function NavButton({ item, active, onClick, collapsed }: {
  item: NavItem; active: boolean; onClick: () => void; collapsed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
        active
          ? 'text-white'
          : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
      }`}
      style={active ? { background: 'var(--accent)', color: '#fff' } : {}}
    >
      <span className="shrink-0">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && (
        <span className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
          {item.label}
        </span>
      )}
    </button>
  );
}

function SidebarContent({ activeTab, setActiveTab, onClose, onLogout, collapsed }: {
  activeTab: Tab; setActiveTab: (t: Tab) => void;
  onClose?: () => void; onLogout: () => void; collapsed?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center justify-between h-14 px-4 border-b border-[var(--border)] shrink-0 ${collapsed ? 'px-0 justify-center' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: 'var(--accent)' }}>A</div>
            <span className="font-semibold text-sm text-[var(--text)]">Admin Panel</span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: 'var(--accent)' }}>A</div>
        )}
        {onClose && !collapsed && (
          <button onClick={onClose} className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition md:hidden">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)] opacity-60">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={activeTab === item.id}
                  onClick={() => { setActiveTab(item.id); onClose?.(); }}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-[var(--border)] p-2 space-y-1 shrink-0`}>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition"
          title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-2)] transition"
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ activeTab, setActiveTab, isOpen, onClose, onLogout }: SidebarProps) {
  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside
        className="hidden lg:flex flex-col border-r border-[var(--border)] shrink-0"
        style={{ width: 'var(--sidebar-w)', background: 'var(--surface)' }}
      >
        <SidebarContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onLogout={onLogout}
        />
      </aside>

      {/* Tablet icon rail */}
      <aside
        className="hidden md:flex lg:hidden flex-col border-r border-[var(--border)] shrink-0"
        style={{ width: 'var(--rail-w)', background: 'var(--surface)' }}
      >
        <SidebarContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onLogout={onLogout}
          collapsed
        />
      </aside>

      {/* Mobile drawer backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile slide-in drawer */}
      <aside
        className={`sidebar-drawer fixed top-0 left-0 h-full z-50 md:hidden flex flex-col border-r border-[var(--border)] ${isOpen ? 'open' : ''}`}
        style={{ width: 280, background: 'var(--surface)' }}
      >
        <SidebarContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={onClose}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
}

export { NAV_GROUPS };
