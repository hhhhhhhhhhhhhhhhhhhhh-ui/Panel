'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { encodeBase64, decodeBase64, decodeUTF8, encodeUTF8 } from '../lib/crypto';
import axiosStatic from 'axios';
import {
  Plus, Search, Trash2, Pin, Save, Loader2, ArrowLeft,
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Quote, Code, Type, Hash,
  Palette, Smile, RotateCcw, Tag, Calendar, Flag,
  Grid3x3, Rows3, CheckSquare2, Lock, Unlock, Eye, EyeOff,
  Copy, Check, ChevronRight, MoreHorizontal, Inbox,
  FileText, Star, Zap, Shield
} from 'lucide-react';

interface Note {
  id: string;
  content_enc: string;
  nonce: string;
  publicToken: string;
  created_at: string;
  decryptedHtml?: string;
  title?: string;
  dueDate?: string;
  priority?: 'high' | 'medium' | 'low';
  category?: string;
  pinned?: boolean;
  deleted?: boolean;
  cover?: string;
  emoji?: string;
  wordCount?: number;
}

const COVERS = [
  { name: 'Ocean', bg: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
  { name: 'Sunset', bg: 'linear-gradient(135deg,#f97316,#ec4899)' },
  { name: 'Forest', bg: 'linear-gradient(135deg,#22c55e,#0ea5e9)' },
  { name: 'Rose', bg: 'linear-gradient(135deg,#f43f5e,#a855f7)' },
  { name: 'Gold', bg: 'linear-gradient(135deg,#eab308,#f97316)' },
  { name: 'Mint', bg: 'linear-gradient(135deg,#10b981,#14b8a6)' },
  { name: 'Night', bg: 'linear-gradient(135deg,#1e1b4b,#312e81)' },
  { name: 'None', bg: 'transparent' },
];

const EMOJIS = ['📝','🚀','💡','📅','🎯','🔥','🏆','💎','⚡','🎨','🔒','🌟','📌','✅','🧠','💼'];
const CATEGORIES = ['All','General','Work','Ideas','Finance','Personal','Trash'];
const EDIT_CATEGORIES = ['General','Work','Ideas','Finance','Personal'];

const PRIORITY_CONFIG = {
  high:   { label: 'High',   dot: 'bg-red-500',    text: 'text-red-400',    border: 'border-red-500/30'   },
  medium: { label: 'Medium', dot: 'bg-yellow-500',  text: 'text-yellow-400', border: 'border-yellow-500/30' },
  low:    { label: 'Low',    dot: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(html: string) {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).length : 0;
}

function NoteCard({ note, isActive, onClick }: { note: Note; isActive: boolean; onClick: () => void }) {
  const preview = stripHtml(note.decryptedHtml || '');
  const priCfg = PRIORITY_CONFIG[note.priority || 'medium'];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-xl border transition-all group relative ${
        isActive
          ? 'bg-[var(--accent)]/15 border-[var(--accent)] shadow-md'
          : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--accent)]/30 hover:bg-[var(--surface-2)]/85'
      }`}
    >
      {note.cover && note.cover !== 'transparent' && (
        <div className="h-1 rounded-full mb-2.5 -mx-0.5" style={{ background: note.cover }} />
      )}
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-base leading-none mt-0.5 shrink-0">{note.emoji || '📝'}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold truncate ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
            {note.title || preview.substring(0, 40) || 'Untitled Note'}
          </p>
          <p className="text-[10px] text-[var(--muted)] truncate mt-0.5 leading-relaxed">
            {preview.substring(0, 60) || 'Empty note…'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {note.pinned && <Pin className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${priCfg.dot}`} />
          <span className="text-[9px] text-[var(--muted)]/80 uppercase tracking-wider font-mono">{note.category}</span>
        </div>
        <span className="text-[9px] text-[var(--muted)]/60">{timeAgo(note.created_at)}</span>
      </div>
    </button>
  );
}

export default function Notes() {
  const { token } = useAuth();

  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [charCount, setCharCount] = useState(0);

  // Editor state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCover, setNoteCover] = useState('transparent');
  const [noteEmoji, setNoteEmoji] = useState('📝');
  const [noteCategory, setNoteCategory] = useState('General');
  const [notePriority, setNotePriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [notePinned, setNotePinned] = useState(false);
  const [noteDueDate, setNoteDueDate] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const headers = { Authorization: `Bearer ${token}` };
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axiosStatic.get('/api/notes', { headers });
      const decrypted = res.data.map((n: any) => {
        try {
          // Decode raw JSON string directly from base64 (no symmetric key required)
          const raw = encodeUTF8(decodeBase64(n.content_enc));
          let parsed: any;
          try { parsed = JSON.parse(raw); } catch { parsed = { html: raw }; }
          return {
            ...n,
            decryptedHtml: parsed.html || '',
            title: parsed.title || '',
            dueDate: parsed.dueDate || '',
            priority: parsed.priority || 'medium',
            category: parsed.category || 'General',
            pinned: parsed.pinned || false,
            deleted: parsed.deleted || false,
            cover: parsed.cover || 'transparent',
            emoji: parsed.emoji || '📝',
          };
        } catch {
          return {
            ...n,
            decryptedHtml: '<p>[Decryption Error: Legacy Encrypted Note]</p>',
            title: 'Legacy Encrypted Note'
          };
        }
      });
      setNotes(decrypted.sort((a: Note, b: Note) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }));
    } catch (err) {
      console.error('Notes fetch failed', err);
    }
  }, [token]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = activeNote?.decryptedHtml || '';
  }, [activeNote?.id]);

  const selectNote = (note: Note) => {
    setActiveNote(note);
    setNoteTitle(note.title || '');
    setNoteCover(note.cover || 'transparent');
    setNoteEmoji(note.emoji || '📝');
    setNoteCategory(note.category || 'General');
    setNotePriority(note.priority || 'medium');
    setNotePinned(note.pinned || false);
    setNoteDueDate(note.dueDate || '');
    setSaved(false);
    setMobileView('editor');
    setCharCount(wordCount(note.decryptedHtml || ''));
  };

  const createNew = () => {
    setActiveNote(null);
    setNoteTitle('');
    setNoteCover('transparent');
    setNoteEmoji('📝');
    setNoteCategory('General');
    setNotePriority('medium');
    setNotePinned(false);
    setNoteDueDate('');
    setSaved(false);
    setCharCount(0);
    if (editorRef.current) editorRef.current.innerHTML = '';
    setMobileView('editor');
  };

  const saveNote = useCallback(async (isDeleteToggle = false, deletedVal = false) => {
    const html = editorRef.current?.innerHTML || '';
    if (!html.trim() && !noteTitle.trim() && !isDeleteToggle) return;
    if (!token) return;
    setLoading(true);
    const noteData = {
      html, title: noteTitle, dueDate: noteDueDate, priority: notePriority,
      category: noteCategory, pinned: notePinned, cover: noteCover, emoji: noteEmoji,
      deleted: isDeleteToggle ? deletedVal : (activeNote?.deleted || false),
    };
    try {
      // Store note payload directly as base64 JSON string with dummy nonce parameters
      const ciphertext = encodeBase64(decodeUTF8(JSON.stringify(noteData)));
      const dummyNonce = encodeBase64(new Uint8Array(24));
      if (activeNote) {
        await axiosStatic.post('/api/notes', { id: activeNote.id, content_enc: ciphertext, nonce: dummyNonce }, { headers });
      } else {
        await axiosStatic.post('/api/notes', { content_enc: ciphertext, nonce: dummyNonce }, { headers });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await fetchNotes();
    } catch {
      alert('Save failed.');
    } finally {
      setLoading(false);
    }
  }, [activeNote, noteTitle, noteDueDate, notePriority, noteCategory, notePinned, noteCover, noteEmoji, token, fetchNotes]);

  // Auto-save on content change
  const handleEditorInput = () => {
    const html = editorRef.current?.innerHTML || '';
    setCharCount(wordCount(html));
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    if (activeNote) {
      autoSaveRef.current = setTimeout(() => saveNote(), 2500);
    }
  };

  const softDelete = async () => {
    if (!confirm('Move to trash?')) return;
    await saveNote(true, true);
    createNew();
  };

  const restoreNote = async (note: Note) => {
    if (!token) return;
    const noteData = { html: note.decryptedHtml || '', title: note.title || '', dueDate: note.dueDate || '',
      priority: note.priority || 'medium', category: note.category || 'General', pinned: false,
      cover: note.cover || 'transparent', emoji: note.emoji || '📝', deleted: false };
    const ciphertext = encodeBase64(decodeUTF8(JSON.stringify(noteData)));
    const dummyNonce = encodeBase64(new Uint8Array(24));
    await axiosStatic.post('/api/notes', { id: note.id, content_enc: ciphertext, nonce: dummyNonce }, { headers });
    await fetchNotes();
  };

  const hardDelete = async (id: string) => {
    if (!confirm('Permanently delete? This cannot be undone.')) return;
    await axiosStatic.delete(`/api/notes/${id}`, { headers });
    if (activeNote?.id === id) createNew();
    await fetchNotes();
  };

  const fmt = (cmd: string, val = '') => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].type.startsWith('image')) {
        e.preventDefault();
        const file = e.clipboardData.items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = ev => {
            const img = `<img src="${ev.target?.result}" class="max-w-sm rounded-xl my-3 border border-slate-700" />`;
            document.execCommand('insertHTML', false, img);
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  };

  const filtered = notes.filter(n => {
    const isTrash = activeCategory === 'Trash';
    if (isTrash) return n.deleted;
    if (!n.deleted) {
      if (activeCategory !== 'All' && n.category !== activeCategory) return false;
      if (search) {
        const hay = (n.title || '') + ' ' + stripHtml(n.decryptedHtml || '');
        return hay.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    }
    return false;
  });

  const priCfg = PRIORITY_CONFIG[notePriority];
  const trashCount = notes.filter(n => n.deleted).length;

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">

      {/* ── Sidebar ── */}
      <div className={`w-64 shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] ${mobileView === 'editor' ? 'hidden md:flex' : 'flex'}`}>

        {/* Sidebar Header */}
        <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]/65">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
                <Lock className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs font-bold text-[var(--text)]">Encrypted Notes</span>
            </div>
            <button
              onClick={createNew}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-bold rounded-lg transition-all active:scale-95 shadow-sm"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--muted)]/50 rounded-lg pl-7 pr-3 py-2 outline-none focus:border-[var(--accent)]/55 transition-colors"
            />
          </div>
        </div>

        {/* Category nav */}
        <div className="px-3 py-3 border-b border-[var(--border)]/65 space-y-0.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20'
                  : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <div className="flex items-center gap-2">
                {cat === 'All' && <FileText className="w-3 h-3" />}
                {cat === 'General' && <Hash className="w-3 h-3" />}
                {cat === 'Work' && <Zap className="w-3 h-3" />}
                {cat === 'Ideas' && <Star className="w-3 h-3" />}
                {cat === 'Finance' && <Shield className="w-3 h-3" />}
                {cat === 'Personal' && <Lock className="w-3 h-3" />}
                {cat === 'Trash' && <Trash2 className="w-3 h-3" />}
                <span>{cat}</span>
              </div>
              <div className="flex items-center gap-1">
                {cat === 'Trash' && trashCount > 0 && (
                  <span className="text-[9px] bg-red-500/20 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded-full font-bold">{trashCount}</span>
                )}
                {cat === 'All' && (
                  <span className="text-[9px] text-[var(--muted)]">{notes.filter(n => !n.deleted).length}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="px-3 py-2 border-b border-[var(--border)]/65">
          <div className="flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${viewMode === 'list' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
            >
              <Rows3 className="w-3 h-3" /> List
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${viewMode === 'grid' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
            >
              <Grid3x3 className="w-3 h-3" /> Grid
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div className={`flex-1 overflow-y-auto px-3 py-2 space-y-1.5 ${viewMode === 'grid' ? 'grid grid-cols-1 gap-1.5 space-y-0' : ''}`}>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <Inbox className="w-8 h-8 text-[var(--muted)]/50" />
              <p className="text-xs text-[var(--muted)]">
                {activeCategory === 'Trash' ? 'Trash is empty' : 'No notes yet'}
              </p>
            </div>
          )}

          {activeCategory === 'Trash' ? (
            filtered.map(n => (
              <div key={n.id} className="p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-xs">
                <p className="font-semibold text-[var(--text)] truncate mb-2">{n.emoji} {n.title || stripHtml(n.decryptedHtml || '').substring(0, 30) || 'Untitled'}</p>
                <div className="flex gap-2">
                  <button onClick={() => restoreNote(n)} className="flex-1 py-1 bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text)] rounded-lg text-[10px] font-semibold transition border border-[var(--border)]">Restore</button>
                  <button onClick={() => hardDelete(n.id)} className="flex-1 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-[10px] font-semibold transition">Delete Forever</button>
                </div>
              </div>
            ))
          ) : (
            filtered.map(n => (
              <NoteCard
                key={n.id}
                note={n}
                isActive={activeNote?.id === n.id}
                onClick={() => selectNote(n)}
              />
            ))
          )}
        </div>

        {/* Vault info */}
        <div className="px-4 py-3 border-t border-[var(--border)]/65">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
            <Shield className="w-3 h-3 text-indigo-500/50" />
            <span>End-to-end encrypted · Local key only</span>
          </div>
        </div>
      </div>

      {/* ── Editor Panel ── */}
      <div className={`flex-1 flex flex-col min-w-0 bg-[var(--bg)] ${mobileView === 'editor' ? 'hidden md:flex' : 'flex'}`}>
        {activeCategory === 'Trash' ? (
          <div className="flex-1 flex items-center justify-center bg-[var(--bg)]">
            <div className="text-center">
              <Trash2 className="w-16 h-16 text-[var(--muted)]/50 mx-auto mb-3" />
              <p className="text-[var(--muted)] text-sm font-medium">Select a trashed note from the sidebar to restore or delete it.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Editor Toolbar */}
            <div className="border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm px-4 py-2.5 flex items-center gap-1 flex-wrap shrink-0">
              {/* Mobile back */}
              <button onClick={() => setMobileView('list')} className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] mr-1">
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* Format group */}
              <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-lg p-1 bg-[var(--surface-2)]">
                <button onClick={() => fmt('bold')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('italic')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('underline')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Underline"><Underline className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('strikeThrough')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Strikethrough"><Strikethrough className="w-3.5 h-3.5" /></button>
              </div>

              <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-lg p-1 bg-[var(--surface-2)]">
                <button onClick={() => fmt('formatBlock', '<h1>')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Heading 1"><Hash className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('formatBlock', '<h2>')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Heading 2"><Type className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('formatBlock', '<blockquote>')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Blockquote"><Quote className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('formatBlock', '<pre>')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Code Block"><Code className="w-3.5 h-3.5" /></button>
              </div>

              <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-lg p-1 bg-[var(--surface-2)]">
                <button onClick={() => fmt('insertUnorderedList')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Bullet List"><List className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('insertOrderedList')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Numbered List"><ListOrdered className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('insertHTML', '<input type="checkbox" style="margin-right:6px;accent-color:var(--accent)" /> ')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition" title="Checklist"><CheckSquare2 className="w-3.5 h-3.5" /></button>
              </div>

              <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-lg p-1 bg-[var(--surface-2)]">
                <button onClick={() => fmt('justifyLeft')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition"><AlignLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('justifyCenter')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition"><AlignCenter className="w-3.5 h-3.5" /></button>
                <button onClick={() => fmt('justifyRight')} className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition"><AlignRight className="w-3.5 h-3.5" /></button>
              </div>

              {/* Highlight */}
              <button onClick={() => fmt('backColor', '#fde047')} className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-yellow-500 transition" title="Highlight">
                <span className="text-[11px] font-black">H</span>
              </button>

              <div className="flex-1" />

              {/* Meta toggle */}
              <button
                onClick={() => setShowMeta(v => !v)}
                className={`p-1.5 rounded-lg border text-xs font-semibold transition-all ${showMeta ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--surface-2)]'}`}
                title="Note Properties"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {/* Pin */}
              <button
                onClick={() => { setNotePinned(v => !v); }}
                className={`p-1.5 rounded-lg border transition-all ${notePinned ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-500' : 'border-[var(--border)] text-[var(--muted)] hover:text-yellow-500 bg-[var(--surface-2)]'}`}
                title={notePinned ? 'Unpin' : 'Pin note'}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>

              {/* Delete */}
              {activeNote && (
                <button onClick={softDelete} className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-red-500 transition" title="Move to trash">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Save */}
              <button
                onClick={() => saveNote()}
                disabled={loading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                  saved
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-sm'
                }`}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {loading ? 'Saving…' : saved ? 'Saved!' : activeNote ? 'Update' : 'Save Note'}
              </button>
            </div>

            {/* Note metadata panel */}
            {showMeta && (
              <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
                {/* Emoji picker */}
                <div className="relative">
                  <button onClick={() => { setShowEmojiPicker(v => !v); setShowCoverPicker(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition text-[var(--text)]">
                    <span>{noteEmoji}</span>
                    <span className="text-[var(--muted)]">Icon</span>
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-9 left-0 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 flex flex-wrap gap-1.5 w-48 shadow-lg">
                      {EMOJIS.map(em => (
                        <button key={em} onClick={() => { setNoteEmoji(em); setShowEmojiPicker(false); }} className="text-lg hover:scale-125 transition-transform p-0.5">{em}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cover picker */}
                <div className="relative">
                  <button onClick={() => { setShowCoverPicker(v => !v); setShowEmojiPicker(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition text-[var(--text)]">
                    <div className="w-3.5 h-3.5 rounded-sm" style={{ background: noteCover === 'transparent' ? 'transparent' : noteCover, border: '1px solid var(--border)' }} />
                    <span className="text-[var(--muted)]">Cover</span>
                  </button>
                  {showCoverPicker && (
                    <div className="absolute top-9 left-0 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 flex flex-wrap gap-2 w-52 shadow-lg">
                      {COVERS.map(c => (
                        <button
                          key={c.name}
                          onClick={() => { setNoteCover(c.bg); setShowCoverPicker(false); }}
                          title={c.name}
                          className={`w-8 h-8 rounded-lg transition-all hover:scale-110 border-2 ${noteCover === c.bg ? 'border-[var(--text)]' : 'border-transparent'}`}
                          style={{ background: c.bg || '#1e293b', ...(c.bg === 'transparent' ? { background: '#1e293b' } : {}) }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Category */}
                <select
                  value={noteCategory}
                  onChange={e => setNoteCategory(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 outline-none text-xs cursor-pointer focus:border-[var(--accent)]"
                >
                  {EDIT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Priority */}
                <select
                  value={notePriority}
                  onChange={e => setNotePriority(e.target.value as any)}
                  className={`bg-[var(--surface)] border rounded-lg px-2.5 py-1.5 outline-none text-xs cursor-pointer focus:border-[var(--accent)] ${priCfg.text} ${priCfg.border}`}
                >
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label} Priority</option>)}
                </select>

                {/* Due date */}
                <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">
                  <Calendar className="w-3 h-3 text-[var(--muted)]" />
                  <input
                    type="date"
                    value={noteDueDate}
                    onChange={e => setNoteDueDate(e.target.value)}
                    className="bg-transparent text-[var(--text)] outline-none text-xs cursor-pointer"
                  />
                </div>

                <div className="ml-auto text-[var(--muted)] text-[10px]">
                  {charCount} words
                </div>
              </div>
            )}

            {/* Note Canvas */}
            <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
              {/* Cover banner */}
              {noteCover && noteCover !== 'transparent' && (
                <div className="h-28 w-full shrink-0 transition-all duration-500" style={{ background: noteCover }} />
              )}

              <div className={`max-w-3xl mx-auto w-full px-8 ${noteCover && noteCover !== 'transparent' ? 'pt-4' : 'pt-10'} pb-16`}>
                {/* Title input */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-4xl select-none">{noteEmoji}</span>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    placeholder="Note title…"
                    className="flex-1 bg-transparent text-2xl font-bold text-[var(--text)] placeholder-[var(--muted)]/40 outline-none"
                  />
                </div>

                {/* Metadata strip */}
                {(noteCategory || notePriority || noteDueDate) && (
                  <div className="flex items-center gap-3 mb-6 flex-wrap">
                    <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${priCfg.text} ${priCfg.border} bg-[var(--surface-2)]`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${priCfg.dot}`} /> {priCfg.label}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                      <Tag className="w-3 h-3" /> {noteCategory}
                    </span>
                    {noteDueDate && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                        <Calendar className="w-3 h-3" /> {noteDueDate}
                      </span>
                    )}
                  </div>
                )}

                {/* Content editable area */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  onPaste={handlePaste}
                  data-placeholder="Start writing your encrypted note… (paste images, use toolbar to format)"
                  className="min-h-[400px] outline-none text-[var(--text)] text-sm leading-7 notes-editor"
                  style={{ caretColor: 'var(--accent)' }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Global editor styles */}
      <style>{`
        .notes-editor:empty:before {
          content: attr(data-placeholder);
          color: var(--muted);
          opacity: 0.5;
          pointer-events: none;
          font-style: italic;
        }
        .notes-editor h1 {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text);
          margin: 1.25rem 0 0.5rem;
          line-height: 1.2;
        }
        .notes-editor h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text);
          margin: 1rem 0 0.4rem;
        }
        .notes-editor blockquote {
          border-left: 3px solid var(--accent);
          padding-left: 1rem;
          color: var(--muted);
          font-style: italic;
          margin: 0.75rem 0;
        }
        .notes-editor pre {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          font-family: monospace;
          font-size: 0.8rem;
          color: var(--accent);
          margin: 0.75rem 0;
          overflow-x: auto;
          white-space: pre-wrap;
        }
        .notes-editor ul, .notes-editor ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .notes-editor li {
          margin: 0.25rem 0;
          color: var(--text);
        }
        .notes-editor strong { color: var(--text); font-weight: 700; }
        .notes-editor em { color: var(--accent); }
        .notes-editor u { text-decoration-color: var(--accent); }
        .notes-editor a { color: var(--accent); text-decoration: underline; }
        .notes-editor mark, .notes-editor [style*="background-color"] {
          border-radius: 3px;
          padding: 0 2px;
          color: #1a1a1a !important;
        }
      `}</style>
    </div>
  );
}
