'use client';
import React from 'react';
import { BarChart2, MessageCircle, FileText, FolderOpen, MoreHorizontal } from 'lucide-react';
import type { Tab } from './Sidebar';

const PINNED: { id: Tab | 'more'; label: string; icon: React.ReactNode }[] = [
  { id: 'adstracker', label: 'Ads',    icon: <BarChart2 size={20} /> },
  { id: 'notes',    label: 'Notes',    icon: <FileText size={20} /> },
  { id: 'files',    label: 'Files',    icon: <FolderOpen size={20} /> },
  { id: 'more',     label: 'More',     icon: <MoreHorizontal size={20} /> },
];

interface BottomNavProps {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  onMore: () => void;
}

export default function BottomNav({ activeTab, setActiveTab, onMore }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden pb-safe"
      style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
    >
      <div className="flex items-stretch h-16">
        {PINNED.map(item => {
          const isActive = item.id !== 'more' && activeTab === item.id;
          const isMore = item.id === 'more';
          return (
            <button
              key={item.id}
              onClick={() => isMore ? onMore() : setActiveTab(item.id as Tab)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }}
            >
              <span className={`transition-transform ${isActive ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && (
                <span
                  className="absolute bottom-0 h-0.5 w-8 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
