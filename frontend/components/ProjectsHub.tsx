'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import {
  Briefcase,
  Plus,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  Save,
  PlusCircle,
  Code,
  Activity,
  FileText,
  RefreshCw,
  PlusSquare,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Highlighter,
  Link,
  Image as ImageIcon,
  Palette,
  Search,
  Timer,
  Calendar,
  Smile,
} from 'lucide-react';

interface ProjectLink {
  id?: string;
  name: string;
  url: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  settings: {
    todo_list?: { id: string; text: string; done: boolean; due_date?: string }[];
    docs?: string;
    tech_stack?: string[];
    theme?: string;
  };
  links: ProjectLink[];
  created_at: string;
  updated_at: string;
}

const NOTEBOOK_THEMES = [
  { id: 'neon', name: 'Cyberpunk Neon', bg: '#0b0f19', color: '#38bdf8', border: '#1e293b', paper: '#111827' },
  { id: 'ruled', name: 'Ruled Yellow Pad', bg: '#fef3c7', color: '#1e293b', border: '#fcd34d', paper: '#fffbeb', ruled: true },
  { id: 'pastel', name: 'Lavender Pastel', bg: '#faf5ff', color: '#581c87', border: '#e9d5ff', paper: '#f3e8ff' },
  { id: 'chalkboard', name: 'Chalkboard Green', bg: '#064e3b', color: '#ecfdf5', border: '#047857', paper: '#022c22' },
];

const NOTEBOOK_STICKERS = [
  { label: '🚨 Critical', color: '#ef4444' },
  { label: '🚀 LFG!', color: '#3b82f6' },
  { label: '🚧 WIP', color: '#f59e0b' },
  { label: '✅ Deployed', color: '#10b981' },
  { label: '🔥 Hot', color: '#ec4899' },
  { label: '💡 Idea', color: '#8b5cf6' },
];

export default function ProjectsHub() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Selected Project
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Onboarding Wizard Creation Form State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardDesc, setWizardDesc] = useState('');
  const [wizardStatus, setWizardStatus] = useState('Planning');
  const [wizardStack, setWizardStack] = useState('');
  
  // Wizard Local Collections
  const [wizardLinks, setWizardLinks] = useState<ProjectLink[]>([]);
  const [wizardLinkName, setWizardLinkName] = useState('');
  const [wizardLinkUrl, setWizardLinkUrl] = useState('');

  const [wizardTodos, setWizardTodos] = useState<{ text: string; due_date?: string }[]>([]);
  const [wizardTodoText, setWizardTodoText] = useState('');
  const [wizardTodoDueDate, setWizardTodoDueDate] = useState('');

  const [creating, setCreating] = useState(false);

  // Detail View Theme & Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState('neon');

  // Notebook transition animation trigger helper
  const [isPageFlipped, setIsPageFlipped] = useState(false);

  // Pomodoro timer states
  const [timerActive, setTimerActive] = useState(false);
  const [timerSecs, setTimerSecs] = useState(25 * 60);
  const [timerMode, setTimerMode] = useState<'work' | 'break'>('work');

  // Notepad Save States
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesMsg, setNotesMsg] = useState<string | null>(null);

  // Calendar toggle states
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [newTodoDueDate, setNewTodoDueDate] = useState('');

  // Add todo inline states
  const [inlineTodoText, setInlineTodoText] = useState('');

  const editorRef = useRef<HTMLDivElement>(null);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  // Pomodoro ticks
  useEffect(() => {
    let interval: any;
    if (timerActive && timerSecs > 0) {
      interval = setInterval(() => setTimerSecs((s) => s - 1), 1000);
    } else if (timerSecs === 0) {
      setTimerActive(false);
      if (timerMode === 'work') {
        setTimerMode('break');
        setTimerSecs(5 * 60);
        alert('Pomodoro completed! Take a short break.');
      } else {
        setTimerMode('work');
        setTimerSecs(25 * 60);
        alert('Break completed! Time to focus.');
      }
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSecs, timerMode]);

  // Global notebook search logic
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.settings?.docs || '').toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/projects', { headers });
      setProjects(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [headers]);

  // Page turning animation trigger
  useEffect(() => {
    if (activeProject) {
      setIsPageFlipped(true);
      const timer = setTimeout(() => setIsPageFlipped(false), 550);
      if (editorRef.current) {
        editorRef.current.innerHTML = activeProject.settings?.docs || `<h1>${activeProject.name} Workspace</h1><p>Start writing project features, links, and meeting notes here...</p>`;
      }
      setActiveThemeId(activeProject.settings?.theme || 'neon');
      return () => clearTimeout(timer);
    }
  }, [selectedProjectId]);

  // Wizard Links/Todos
  const handleWizardAddLink = () => {
    if (!wizardLinkName.trim() || !wizardLinkUrl.trim()) return;
    setWizardLinks([...wizardLinks, { name: wizardLinkName.trim(), url: wizardLinkUrl.trim() }]);
    setWizardLinkName('');
    setWizardLinkUrl('');
  };

  const handleWizardAddTodo = () => {
    if (!wizardTodoText.trim()) return;
    setWizardTodos([...wizardTodos, { text: wizardTodoText.trim(), due_date: wizardTodoDueDate || undefined }]);
    setWizardTodoText('');
    setWizardTodoDueDate('');
  };

  const handleWizardRemoveLink = (index: number) => {
    setWizardLinks(wizardLinks.filter((_, i) => i !== index));
  };

  const handleWizardRemoveTodo = (index: number) => {
    setWizardTodos(wizardTodos.filter((_, i) => i !== index));
  };

  const handleWizardSubmit = async () => {
    if (!wizardName.trim()) return;
    setCreating(true);
    setError(null);

    const payload = {
      name: wizardName.trim(),
      description: wizardDesc.trim(),
      status: wizardStatus,
      settings: {
        tech_stack: wizardStack.split(',').map((s) => s.trim()).filter(Boolean),
        todo_list: wizardTodos.map((t, idx) => ({ id: `todo-${idx}-${Date.now()}`, text: t.text, done: false, due_date: t.due_date })),
        theme: 'neon',
        docs: `<h1>${wizardName} Workspace</h1><p>Start writing project features, links, and meeting notes here...</p>`
      },
      links: wizardLinks,
    };

    try {
      const res = await axios.post('/api/projects', payload, { headers });
      setProjects([res.data, ...projects]);
      setSelectedProjectId(res.data.id);
      
      // Reset wizard
      setWizardName('');
      setWizardDesc('');
      setWizardStatus('Planning');
      setWizardStack('');
      setWizardLinks([]);
      setWizardTodos([]);
      setShowWizard(false);
      setWizardStep(1);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create project.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('Delete this project permanently? This is irreversible.')) {
      return;
    }
    try {
      await axios.delete(`/api/projects/${id}`, { headers });
      setProjects(projects.filter((p) => p.id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete project.');
    }
  };

  // Rich Formatting Options
  const formatText = (cmd: string, val: string = '') => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) editorRef.current.focus();
  };

  // Sticker Stamp tool
  const handleStampSticker = (label: string, color: string) => {
    const html = `<span contenteditable="false" style="background-color: ${color}; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; margin: 0 4px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; cursor: default; user-select: none;">${label}</span>&nbsp;`;
    formatText('insertHTML', html);
  };

  // Basic Syntax highlighted Code blocks
  const handleInsertCodeBlock = () => {
    const code = prompt('Enter code content:');
    if (code) {
      const highlighted = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\b(const|let|var|function|return|import|export|from|def|class|if|for|while|SELECT|FROM|WHERE|INSERT|DELETE|UPDATE)\b/g, '<span style="color: #f43f5e; font-weight: bold;">$1</span>');
      formatText('insertHTML', `<pre style="background: #111827; color: #e5e7eb; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 11px; margin: 8px 0; overflow-x: auto; white-space: pre-wrap; border: 1px solid #1f2937;" contenteditable="true"><code>${highlighted}</code></pre><p><br></p>`);
    }
  };

  const handleInsertLink = () => {
    const url = prompt('Enter URL:');
    if (url) formatText('createLink', url);
  };

  const handleInsertImage = () => {
    const url = prompt('Enter Image URL:');
    if (url) formatText('insertImage', url);
  };

  const handleInsertCheckbox = () => {
    const html = `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;"><input type="checkbox" style="width: 14px; height: 14px; accent-color: var(--accent);" /><span>Task Item</span></div>`;
    formatText('insertHTML', html);
  };

  const handleApplyHighlight = (color: string) => {
    const html = `<span style="background-color: ${color}; color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${window.getSelection()?.toString() || 'Important'}</span>`;
    formatText('insertHTML', html);
  };

  const handleCopyText = () => {
    if (editorRef.current) {
      navigator.clipboard.writeText(editorRef.current.innerText || editorRef.current.textContent || '');
      setNotesMsg('Copied notes text to clipboard.');
      setTimeout(() => setNotesMsg(null), 2000);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!activeProject || !editorRef.current) return;
    const element = document.createElement('a');
    const file = new Blob([editorRef.current.innerText || editorRef.current.textContent || ''], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeProject.name.toLowerCase().replace(/\s+/g, '-')}-notes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSaveNotes = async () => {
    if (!activeProject || !editorRef.current) return;
    setSavingNotes(true);
    setNotesMsg(null);

    const updatedSettings = {
      ...activeProject.settings,
      docs: editorRef.current.innerHTML,
      theme: activeThemeId,
    };

    try {
      const res = await axios.put(
        `/api/projects/${activeProject.id}`,
        {
          name: activeProject.name,
          description: activeProject.description,
          status: activeProject.status,
          settings: updatedSettings,
        },
        { headers }
      );
      setProjects(projects.map((p) => (p.id === activeProject.id ? res.data : p)));
      setNotesMsg('Notebook workspace saved.');
      setTimeout(() => setNotesMsg(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  // Inline Todo additions
  const handleAddTodoInline = async () => {
    if (!activeProject || !inlineTodoText.trim()) return;
    const currentTodos = activeProject.settings?.todo_list || [];
    const newTodo = {
      id: `todo-${Math.random().toString(36).substring(7)}`,
      text: inlineTodoText.trim(),
      done: false,
      due_date: newTodoDueDate || undefined,
    };

    const updatedSettings = {
      ...activeProject.settings,
      todo_list: [...currentTodos, newTodo],
    };

    try {
      const res = await axios.put(
        `/api/projects/${activeProject.id}`,
        {
          name: activeProject.name,
          description: activeProject.description,
          status: activeProject.status,
          settings: updatedSettings,
        },
        { headers }
      );
      setProjects(projects.map((p) => (p.id === activeProject.id ? res.data : p)));
      setInlineTodoText('');
      setNewTodoDueDate('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add task.');
    }
  };

  const handleToggleTodo = async (todoId: string) => {
    if (!activeProject) return;
    const currentTodos = activeProject.settings?.todo_list || [];
    const updatedSettings = {
      ...activeProject.settings,
      todo_list: currentTodos.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)),
    };
    try {
      const res = await axios.put(
        `/api/projects/${activeProject.id}`,
        {
          name: activeProject.name,
          description: activeProject.description,
          status: activeProject.status,
          settings: updatedSettings,
        },
        { headers }
      );
      setProjects(projects.map((p) => (p.id === activeProject.id ? res.data : p)));
    } catch (err) {
      setError('Failed to update task status.');
    }
  };

  const handleRemoveTodo = async (todoId: string) => {
    if (!activeProject) return;
    const currentTodos = activeProject.settings?.todo_list || [];
    const updatedSettings = {
      ...activeProject.settings,
      todo_list: currentTodos.filter((t) => t.id !== todoId),
    };
    try {
      const res = await axios.put(
        `/api/projects/${activeProject.id}`,
        {
          name: activeProject.name,
          description: activeProject.description,
          status: activeProject.status,
          settings: updatedSettings,
        },
        { headers }
      );
      setProjects(projects.map((p) => (p.id === activeProject.id ? res.data : p)));
    } catch (err) {
      setError('Failed to delete task.');
    }
  };

  // Format Timer text
  const formattedTimer = useMemo(() => {
    const mins = Math.floor(timerSecs / 60);
    const secs = timerSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [timerSecs]);

  const themeConfig = useMemo(() => {
    return NOTEBOOK_THEMES.find((t) => t.id === activeThemeId) || NOTEBOOK_THEMES[0];
  }, [activeThemeId]);

  return (
    <div className="space-y-6 text-[var(--text)]">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
        
        {/* Left Side: Projects Navigation Drawer */}
        {!isFullscreen && (
          <div className="lg:col-span-1 space-y-6">
            
            {/* Global Search */}
            <div className="panel p-4 flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
              <Search size={15} className="text-[var(--muted)]" />
              <input
                type="text"
                placeholder="Search notebooks content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-transparent outline-none text-[var(--text)] placeholder-[var(--muted)]"
              />
            </div>

            {/* Create Project Button */}
            <div className="panel p-5 space-y-4">
              <h3 className="text-xs uppercase font-bold text-[var(--muted)] tracking-wider">
                Project Workspace
              </h3>
              
              {!showWizard ? (
                <button
                  onClick={() => setShowWizard(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-bold rounded-lg shadow-sm transition"
                >
                  <Plus size={14} />
                  <span>Start New Project</span>
                </button>
              ) : (
                <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg space-y-4 animate-in slide-in-from-top-2 duration-150">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--accent)]">
                      Creation Wizard ({wizardStep}/2)
                    </span>
                    <button
                      onClick={() => {
                        setShowWizard(false);
                        setWizardStep(1);
                      }}
                      className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      Cancel
                    </button>
                  </div>

                  {wizardStep === 1 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                          Project Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Meta Engine Tool"
                          value={wizardName}
                          onChange={(e) => setWizardName(e.target.value)}
                          className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)] transition"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                          Description
                        </label>
                        <textarea
                          placeholder="Project scope summary..."
                          rows={2}
                          value={wizardDesc}
                          onChange={(e) => setWizardDesc(e.target.value)}
                          className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none"
                        />
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setWizardStep(2)}
                          disabled={!wizardName.trim()}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-semibold rounded"
                        >
                          <span>Next</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                          Initial Status
                        </label>
                        <select
                          value={wizardStatus}
                          onChange={(e) => setWizardStatus(e.target.value)}
                          className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text)]"
                        >
                          <option value="Planning">Planning</option>
                          <option value="Development">Development</option>
                          <option value="Staging">Staging</option>
                          <option value="Live">Live</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider block mb-1">
                          Tech Stack Tags
                        </label>
                        <input
                          type="text"
                          placeholder="React, Postgres, Docker"
                          value={wizardStack}
                          onChange={(e) => setWizardStack(e.target.value)}
                          className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text)]"
                        />
                      </div>

                      <div className="space-y-1 pt-1.5 border-t border-[var(--border)]/50">
                        <label className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider block">
                          Resource Links
                        </label>
                        {wizardLinks.map((l, i) => (
                          <div key={i} className="flex justify-between items-center text-[10px] bg-[var(--surface)] p-1.5 rounded border border-[var(--border)]">
                            <span className="truncate font-semibold">{l.name}</span>
                            <button type="button" onClick={() => handleWizardRemoveLink(i)} className="text-red-500 font-bold">×</button>
                          </div>
                        ))}
                        <div className="flex gap-1">
                          <input
                            type="text"
                            placeholder="Name"
                            value={wizardLinkName}
                            onChange={(e) => setWizardLinkName(e.target.value)}
                            className="w-1/2 text-[10px] bg-[var(--surface)] border px-2 py-1 outline-none text-[var(--text)]"
                          />
                          <input
                            type="url"
                            placeholder="URL"
                            value={wizardLinkUrl}
                            onChange={(e) => setWizardLinkUrl(e.target.value)}
                            className="w-1/2 text-[10px] bg-[var(--surface)] border px-2 py-1 outline-none text-[var(--text)]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleWizardAddLink}
                          className="text-[9px] text-[var(--accent)] font-semibold hover:underline"
                        >
                          + Add Link
                        </button>
                      </div>

                      <div className="space-y-1 pt-1.5 border-t border-[var(--border)]/50">
                        <label className="text-[9px] uppercase font-bold text-[var(--muted)] tracking-wider block">
                          Initial Checklist
                        </label>
                        {wizardTodos.map((t, i) => (
                          <div key={i} className="flex justify-between items-center text-[10px] bg-[var(--surface)] p-1.5 rounded border border-[var(--border)]">
                            <span className="truncate">{t.text}</span>
                            <button type="button" onClick={() => handleWizardRemoveTodo(i)} className="text-red-500 font-bold">×</button>
                          </div>
                        ))}
                        <div className="space-y-1">
                          <input
                            type="text"
                            placeholder="Checklist Item..."
                            value={wizardTodoText}
                            onChange={(e) => setWizardTodoText(e.target.value)}
                            className="w-full text-[10px] bg-[var(--surface)] border px-2 py-1 outline-none text-[var(--text)]"
                          />
                          <input
                            type="date"
                            value={wizardTodoDueDate}
                            onChange={(e) => setWizardTodoDueDate(e.target.value)}
                            className="w-full text-[10px] bg-[var(--surface)] border px-2 py-1 outline-none text-[var(--muted)]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleWizardAddTodo}
                          className="text-[9px] text-[var(--accent)] font-semibold hover:underline"
                        >
                          + Add Todo
                        </button>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]/50">
                        <button
                          type="button"
                          onClick={() => setWizardStep(1)}
                          className="flex items-center gap-0.5 text-xs text-[var(--muted)]"
                        >
                          <ArrowLeft size={12} />
                          <span>Back</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleWizardSubmit}
                          disabled={creating || !wizardName.trim()}
                          className="flex items-center gap-1 px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded shadow transition"
                        >
                          {creating ? <RefreshCw className="animate-spin" size={13} /> : <PlusCircle size={13} />}
                          <span>Launch Project</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Project Selection List */}
            <div className="panel p-5 space-y-4">
              <h3 className="text-xs uppercase font-bold text-[var(--muted)] tracking-wider">
                Select Workspace
              </h3>

              {loading ? (
                <div className="flex justify-center py-6">
                  <RefreshCw className="animate-spin text-[var(--muted)]" size={16} />
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredProjects.map((proj) => {
                    const isSelected = selectedProjectId === proj.id;
                    return (
                      <div
                        key={proj.id}
                        onClick={() => setSelectedProjectId(proj.id)}
                        className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all duration-150 relative group ${
                          isSelected
                            ? 'bg-[var(--surface-2)] border-[var(--accent)] shadow-md'
                            : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-2)]/60'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                            {proj.name}
                          </h4>
                          <span
                            className={`text-[8px] uppercase font-bold px-1 py-0.5 rounded ${
                              proj.status === 'Live' ? 'bg-green-500/10 text-green-500' : 'bg-[var(--muted)]/10 text-[var(--muted)]'
                            }`}
                          >
                            {proj.status}
                          </span>
                        </div>

                        {proj.description && (
                          <p className="text-[10px] text-[var(--muted)] line-clamp-1 mt-1">
                            {proj.description}
                          </p>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(proj.id);
                          }}
                          className="absolute right-2 bottom-2 p-1 text-[var(--muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Right Side: Fullscreen Project Notepad */}
        <div className={`${isFullscreen ? 'lg:col-span-3' : 'lg:col-span-2'} transition-all duration-200`}>
          {!activeProject ? (
            <div className="panel p-8 text-center flex flex-col items-center justify-center space-y-3 py-36 bg-[var(--surface-2)]/30 border border-dashed border-[var(--border)]">
              <Briefcase size={40} className="text-[var(--muted)]" />
              <h3 className="text-sm font-semibold text-[var(--text)]">Select Project Board</h3>
              <p className="text-xs text-[var(--muted)] max-w-sm">
                Select an active project workspace or use the wizard to launch a new notepad board.
              </p>
            </div>
          ) : (
            <div
              className={`panel flex flex-col h-[700px] shadow-2xl transition-all duration-500 ${
                isPageFlipped ? 'scale-[0.98] rotate-y-6 opacity-80' : 'scale-100'
              }`}
              style={{
                background: themeConfig.bg,
                borderColor: themeConfig.border,
                color: themeConfig.color,
                perspective: '1000px',
              }}
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-[var(--border)] p-4 shrink-0 bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                    <Briefcase size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-[var(--text)]">
                      {activeProject.name} Workspace
                    </h3>
                    <p className="text-[10px] text-[var(--muted)]">
                      {activeProject.status} • {activeProject.description || 'No description'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Pomodoro Timer widget */}
                  <div className="flex items-center gap-1.5 bg-black/30 border border-[var(--border)] rounded px-2.5 py-1 text-xs font-mono font-bold">
                    <Timer size={14} className={timerActive ? 'animate-pulse text-red-400' : ''} />
                    <span>{formattedTimer}</span>
                    <button
                      onClick={() => setTimerActive(!timerActive)}
                      className="text-[9px] uppercase px-1.5 py-0.5 bg-[var(--surface-2)] border rounded ml-1 font-sans"
                    >
                      {timerActive ? 'Pause' : 'Start'}
                    </button>
                    <button
                      onClick={() => {
                        setTimerActive(false);
                        setTimerSecs(25 * 60);
                      }}
                      className="text-[9px] text-[var(--muted)] font-sans ml-1 hover:text-[var(--text)]"
                    >
                      Reset
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setShowCalendarView(!showCalendarView);
                    }}
                    className="p-2 rounded hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]"
                    title="Toggle Calendar / Task view"
                  >
                    <Calendar size={14} className={showCalendarView ? 'text-[var(--accent)]' : ''} />
                  </button>

                  {/* Theme Selector */}
                  <div className="relative group shrink-0">
                    <button className="p-2 rounded hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1 text-xs">
                      <Palette size={14} />
                      <span className="hidden sm:inline">Theme</span>
                    </button>
                    <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-md shadow-lg hidden group-hover:block z-50 py-1.5 w-44">
                      {NOTEBOOK_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => {
                            setActiveThemeId(theme.id);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] transition font-medium ${
                            activeThemeId === theme.id ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                          }`}
                        >
                          {theme.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 rounded hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Notes'}
                  >
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>

                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="flex items-center gap-1 bg-[var(--accent)] text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    {savingNotes ? <RefreshCw className="animate-spin" size={13} /> : <Save size={13} />}
                    <span>Save Notes</span>
                  </button>
                </div>
              </div>

              {/* Formatting Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-black/10 border-b border-[var(--border)] select-none shrink-0">
                <button
                  type="button"
                  onClick={() => formatText('bold')}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Bold"
                >
                  <Bold size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => formatText('italic')}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Italic"
                >
                  <Italic size={13} />
                </button>
                
                <div className="h-4 w-px bg-white/20 mx-1" />

                <button
                  type="button"
                  onClick={() => formatText('formatBlock', '<h1>')}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Headline 1"
                >
                  <Heading1 size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => formatText('formatBlock', '<h2>')}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Subheadline 2"
                >
                  <Heading2 size={13} />
                </button>

                <div className="h-4 w-px bg-white/20 mx-1" />

                {/* Highlights */}
                <button
                  type="button"
                  onClick={() => handleApplyHighlight('#fef08a')}
                  className="p-1.5 rounded hover:bg-white/10 text-yellow-400"
                  title="Highlight Yellow"
                >
                  <Highlighter size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyHighlight('#bfdbfe')}
                  className="p-1.5 rounded hover:bg-white/10 text-blue-400"
                  title="Highlight Blue"
                >
                  <Highlighter size={13} />
                </button>

                <div className="h-4 w-px bg-white/20 mx-1" />

                <button
                  type="button"
                  onClick={handleInsertCheckbox}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Insert Checklist Item"
                >
                  <CheckSquare size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleInsertLink}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Insert Link"
                >
                  <Link size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleInsertImage}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Insert Image"
                >
                  <ImageIcon size={13} />
                </button>
                
                {/* Code highlight insert */}
                <button
                  type="button"
                  onClick={handleInsertCodeBlock}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--text)]"
                  title="Insert Code Block"
                >
                  <Code size={13} />
                </button>

                <div className="h-4 w-px bg-white/20 mx-1" />

                {/* Badges stickers stamp */}
                <div className="relative group">
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-white/10 text-[var(--text)] flex items-center gap-1 text-xs"
                    title="Stamp Sticker"
                  >
                    <Smile size={13} />
                    <span className="text-[10px]">Sticker</span>
                  </button>
                  <div className="absolute left-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-md shadow-lg hidden group-hover:block z-50 p-2 w-36 space-y-1">
                    {NOTEBOOK_STICKERS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => handleStampSticker(s.label, s.color)}
                        className="w-full text-left px-2 py-1 text-[10px] rounded hover:bg-[var(--surface-2)] font-bold font-mono"
                        style={{ color: s.color }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyText}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)] ml-auto"
                  title="Copy Text"
                >
                  <Copy size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="p-1.5 rounded hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]"
                  title="Export Notes"
                >
                  <Download size={13} />
                </button>
              </div>

              {notesMsg && (
                <div className="bg-[var(--accent)]/20 text-[var(--accent)] border-b border-[var(--accent)]/30 px-4 py-1 text-[9px] font-semibold flex items-center justify-between shrink-0">
                  <span>{notesMsg}</span>
                  <button onClick={() => setNotesMsg(null)} className="font-bold">×</button>
                </div>
              )}

              {/* Main Body */}
              <div className="flex-1 flex overflow-hidden">
                
                {/* Rule paper contentEditable workspace */}
                <div className="flex-1 p-6 overflow-y-auto select-text font-serif leading-relaxed relative border-r border-[var(--border)]/30">
                  {themeConfig.ruled && (
                    <div className="absolute inset-0 pointer-events-none opacity-[0.06] select-none" style={{
                      background: 'linear-gradient(rgba(0, 0, 0, 0.15) 1px, transparent 1px)',
                      backgroundSize: '100% 28px',
                      lineHeight: '28px',
                      borderLeft: '2px solid rgba(220, 38, 38, 0.4)',
                      marginLeft: '40px'
                    }} />
                  )}

                  <div
                    ref={editorRef}
                    contentEditable
                    className="outline-none min-h-full whitespace-pre-wrap text-sm"
                    style={{
                      color: themeConfig.color,
                      fontFamily: themeConfig.ruled ? '"Courier New", Courier, monospace' : 'inherit',
                    }}
                  />
                </div>

                {/* Sidebar details panel: Todo tasks list & links */}
                <div className="w-64 shrink-0 bg-black/10 overflow-y-auto p-4 space-y-5 select-none">
                  
                  {/* Calendar view toggle overlay */}
                  {showCalendarView ? (
                    <div className="space-y-3">
                      <h4 className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                        Milestones Calendar
                      </h4>
                      {/* Simple 7-day or list view calendar representation */}
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {(activeProject.settings?.todo_list || []).filter(t => t.due_date).length === 0 ? (
                          <p className="text-[10px] text-[var(--muted)] text-center py-4">No tasks with due dates.</p>
                        ) : (
                          (activeProject.settings?.todo_list || [])
                            .filter(t => t.due_date)
                            .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
                            .map((todo) => (
                              <div key={todo.id} className="p-2 bg-[var(--surface-2)] border rounded text-[10px] space-y-1">
                                <div className="flex justify-between font-bold">
                                  <span className="truncate max-w-[120px]">{todo.text}</span>
                                  <span className="text-[8px] bg-[var(--accent)]/15 text-[var(--accent)] px-1.5 py-0.5 rounded font-mono">{todo.due_date}</span>
                                </div>
                                <div className="text-[8px] text-[var(--muted)] uppercase font-bold">
                                  Status: {todo.done ? '✅ Completed' : '⏳ Pending'}
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                      <button
                        onClick={() => setShowCalendarView(false)}
                        className="w-full py-1.5 bg-[var(--surface-2)] border text-[9px] uppercase font-bold rounded"
                      >
                        Back to Checklist
                      </button>
                    </div>
                  ) : (
                    // Regular Checklist View
                    <div className="space-y-3">
                      <h4 className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                        Workspace Checklist
                      </h4>
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {(activeProject.settings?.todo_list || []).length === 0 ? (
                          <p className="text-[10px] text-[var(--muted)]">No tasks created yet.</p>
                        ) : (
                          (activeProject.settings?.todo_list || []).map((todo) => (
                            <div key={todo.id} className="flex justify-between items-center gap-1.5 text-xs">
                              <button
                                onClick={() => handleToggleTodo(todo.id)}
                                className="flex items-center gap-1.5 truncate max-w-[140px] text-left"
                              >
                                {todo.done ? (
                                  <CheckSquare className="text-green-500 shrink-0" size={14} />
                                ) : (
                                  <Square className="text-[var(--muted)] shrink-0" size={14} />
                                )}
                                <span className={`truncate text-[11px] ${todo.done ? 'line-through text-[var(--muted)]' : ''}`}>
                                  {todo.text}
                                </span>
                              </button>
                              <button
                                onClick={() => handleRemoveTodo(todo.id)}
                                className="text-[10px] text-red-500/60 hover:text-red-500"
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add Inline todo form */}
                      <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/30">
                        <input
                          type="text"
                          placeholder="New checklist item..."
                          value={inlineTodoText}
                          onChange={(e) => setInlineTodoText(e.target.value)}
                          className="w-full text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 outline-none text-[var(--text)]"
                        />
                        <input
                          type="date"
                          value={newTodoDueDate}
                          onChange={(e) => setNewTodoDueDate(e.target.value)}
                          className="w-full text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 outline-none text-[var(--muted)]"
                        />
                        <button
                          onClick={handleAddTodoInline}
                          disabled={!inlineTodoText.trim()}
                          className="w-full py-1.5 bg-[var(--surface-2)] border hover:border-[var(--accent)] text-[9px] uppercase font-bold rounded text-[var(--text)] transition"
                        >
                          Add Todo Item
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Resource Links Panel */}
                  <div className="space-y-2 pt-2 border-t border-[var(--border)]/30">
                    <h4 className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
                      Resources Links
                    </h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {activeProject.links.length === 0 ? (
                        <p className="text-[10px] text-[var(--muted)]">No links saved.</p>
                      ) : (
                        activeProject.links.map((link) => (
                          <div key={link.id || link.name} className="flex justify-between items-center text-[10px] gap-2 p-1.5 bg-black/20 rounded">
                            <span className="truncate max-w-[120px] font-mono">{link.name}</span>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--accent)] hover:underline shrink-0"
                            >
                              <ExternalLink size={10} />
                            </a>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
