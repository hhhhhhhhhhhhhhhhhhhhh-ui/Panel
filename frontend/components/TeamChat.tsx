'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../lib/hooks/useAuth';
import { decrypt } from '../lib/crypto';
import { 
  MessageSquare, Send, Paperclip, Image as ImageIcon, Video, FolderArchive, 
  FileText, Shield, User, Hash, Globe, Terminal, RefreshCw, X, File, Menu,
  Check, CheckCheck, Smile, CornerUpLeft, Edit2, Trash2, Camera, Pin,
  Lock, Code, Quote, Bold, Italic, Heading2, Cloud, HelpCircle, UserCheck, AlertCircle, Maximize2
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  sender_id: string;
  avatar_url?: string;
  text?: string;
  file?: { name: string; size: string; type: string; url?: string; mega?: boolean; isShared?: boolean };
  reply_to_id?: string;
  is_edited?: boolean;
  is_deleted?: boolean;
  reactions?: Record<string, string[]>;
  link_preview?: { url: string; title: string; description: string; image?: string };
  is_pinned?: boolean;
  timestamp: string;
}

interface Colleague {
  id: string;
  username: string;
  avatar_url: string;
  is_online: boolean;
  last_seen_at: string;
  custom_status?: string | null;
}

const EMOJI_PICKER_LIST = [
  '👍', '❤️', '😂', '🎉', '🚀', '😢', '🔥', '👏', '👀', '😮', '💯', '💡', '📌', '💻', '🤝'
];

const CODE_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'plaintext', label: 'Plain Text' }
];

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return 'image';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) return 'video';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) return 'zip';
  return 'text';
}

function highlightCode(code: string, lang: string) {
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  const keywords = /\b(const|let|var|function|return|import|export|from|class|extends|if|else|for|while|do|switch|case|break|continue|try|catch|finally|async|await|def|elif|print|import|as|from|in|is|not|and|or|true|false|null|undefined|void|public|private|protected|interface|type|default)\b/g;
  html = html.replace(keywords, '<span class="text-indigo-400 font-semibold">$1</span>');
  
  html = html.replace(/(["'`])(.*?)\1/g, '<span class="text-emerald-400">$&</span>');
  html = html.replace(/(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g, '<span class="text-slate-500 italic">$1</span>');
  html = html.replace(/\b(\d+)\b/g, '<span class="text-amber-400">$1</span>');

  return html;
}

export default function TeamChat() {
  const { token, userId, masterKey } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [username, setUsername] = useState('Operator');
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  
  // Chat Targets
  const channels = ['general', 'devops', 'marketing', 'design-vault'];
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [activeChat, setActiveChat] = useState<{ type: 'channel' | 'dm'; id: string; name: string }>({ type: 'channel', id: 'general', name: 'general' });
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // Advanced States
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [lightboxData, setLightboxData] = useState<{ type: string; url: string } | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // Pinned Messages Board
  const [pins, setPins] = useState<ChatMessage[]>([]);
  const [showPinsPanel, setShowPinsPanel] = useState(false);

  // Thread Drawer Sidepanel
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadInputText, setThreadInputText] = useState('');

  // Code Snippet Canvas Modal
  const [showSnippetModal, setShowSnippetModal] = useState(false);
  const [snippetLanguage, setSnippetLanguage] = useState('javascript');
  const [snippetCode, setSnippetCode] = useState('');

  // Mega Storage modal
  const [showMegaModal, setShowMegaModal] = useState(false);
  const [megaFiles, setMegaFiles] = useState<any[]>([]);
  const [isSharedMega, setIsSharedMega] = useState(false);
  const [megaLoading, setMegaLoading] = useState(false);

  // Custom Presence Status Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [customStatusText, setCustomStatusText] = useState('');

  // Interactive reactions picker trigger state
  const [reactionMsgId, setReactionMsgId] = useState<string | null>(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string; type: string; base64: string; mega?: boolean; isShared?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // Fetch Users & Current Status
  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/chat/users', { headers });
      const others = res.data.filter((u: any) => u.id !== userId);
      setColleagues(others);
      const me = res.data.find((u: any) => u.id === userId);
      if (me) {
        setUsername(me.username);
        setMyAvatar(me.avatar_url);
        setMyStatus(me.custom_status || null);
      }
    } catch (err) {
      console.error('Failed to load users', err);
    }
  };

  useEffect(() => {
    if (token) fetchUsers();
  }, [headers, userId]);

  // Fetch History for active chat
  const fetchHistory = async () => {
    try {
      const params = activeChat.type === 'channel' ? { channel: activeChat.id } : { receiverId: activeChat.id };
      const res = await axios.get('/api/chat/history', { headers, params });
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to load chat history', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchHistory();
      setReplyTo(null);
      setThreadParent(null);
    }
  }, [activeChat, headers]);

  // Fetch Pinned messages
  const fetchPins = async () => {
    try {
      const params = activeChat.type === 'channel' ? { channel: activeChat.id } : { receiverId: activeChat.id };
      const res = await axios.get('/api/chat/pins', { headers, params });
      setPins(res.data);
    } catch (err) {
      console.error('Failed to load pins', err);
    }
  };

  useEffect(() => {
    if (token && showPinsPanel) {
      fetchPins();
    }
  }, [activeChat, showPinsPanel, headers]);

  // Setup Live Sockets
  useEffect(() => {
    const socket = io(window.location.origin.replace('3000', '3001'));
    socketRef.current = socket;

    socket.on('connect', () => {
      if (userId) socket.emit('join-user', userId);
    });

    socket.on('chat-message', (msg: ChatMessage & { channel?: string; receiverId?: string }) => {
      const belongsToCurrentChannel = activeChat.type === 'channel' && msg.channel === activeChat.id;
      const belongsToCurrentDM = activeChat.type === 'dm' && (msg.sender_id === activeChat.id || msg.receiverId === activeChat.id);
      
      if (belongsToCurrentChannel || belongsToCurrentDM) {
        setMessages(prev => [...prev, msg]);
        if (msg.sender_id !== userId) {
           socket.emit('chat-read', { messageId: msg.id, channel: msg.channel, receiverId: msg.receiverId });
        }
      }
    });

    socket.on('chat-typing', (data: { sender_id: string, senderName: string, channel?: string, receiverId?: string }) => {
      const belongsToCurrentChannel = activeChat.type === 'channel' && data.channel === activeChat.id;
      const belongsToCurrentDM = activeChat.type === 'dm' && (data.sender_id === activeChat.id || data.receiverId === activeChat.id);
      if ((belongsToCurrentChannel || belongsToCurrentDM) && data.sender_id !== userId) {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          newSet.add(data.senderName);
          return newSet;
        });
        setTimeout(() => {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(data.senderName);
            return newSet;
          });
        }, 3000);
      }
    });

    socket.on('chat-pin-changed', () => {
      fetchHistory();
      if (showPinsPanel) fetchPins();
    });

    socket.on('user-status-changed', () => {
      fetchUsers();
    });

    socket.on('user-presence', () => {
      fetchUsers();
    });

    return () => {
      socket.disconnect();
    };
  }, [activeChat, userId, showPinsPanel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch Mega Files
  const fetchMegaFiles = async () => {
    if (!token) return;
    setMegaLoading(true);
    try {
      const baseHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (isSharedMega) {
        baseHeaders['x-shared-assets'] = 'true';
      }
      if (masterKey) {
        try {
          const encrypted = localStorage.getItem('operator_credentials_vault');
          const nonce = localStorage.getItem('operator_credentials_nonce');
          if (encrypted && nonce) {
            const decryptedJson = decrypt(encrypted, nonce, masterKey);
            const creds = JSON.parse(decryptedJson);
            if (creds.megaEmail && creds.megaPassword) {
              baseHeaders['x-mega-email'] = creds.megaEmail;
              baseHeaders['x-mega-password'] = creds.megaPassword;
            }
          }
        } catch (e) {}
      }
      const res = await axios.get('/api/files/list', { headers: baseHeaders });
      setMegaFiles(res.data || []);
    } catch (err) {
      console.error('Failed to list Mega files', err);
    } finally {
      setMegaLoading(false);
    }
  };

  useEffect(() => {
    if (showMegaModal) fetchMegaFiles();
  }, [showMegaModal, isSharedMega]);

  // Mega file selection handler
  const handleSelectMegaFile = (file: any) => {
    setSelectedFile({
      name: file.name,
      size: file.size ? formatBytes(file.size) : 'Unknown',
      type: getFileType(file.name),
      base64: '',
      mega: true,
      isShared: isSharedMega
    });
    setShowMegaModal(false);
  };

  // Generate dynamic Mega URL inside the message renderer safely
  const getFileUrl = (msgFile: { name: string; url?: string; mega?: boolean; isShared?: boolean }) => {
    if (!msgFile) return '';
    if (!msgFile.mega) return msgFile.url || '';
    
    let email = '';
    let password = '';
    if (masterKey) {
      try {
        const encrypted = localStorage.getItem('operator_credentials_vault');
        const nonce = localStorage.getItem('operator_credentials_nonce');
        if (encrypted && nonce) {
          const decryptedJson = decrypt(encrypted, nonce, masterKey);
          const creds = JSON.parse(decryptedJson);
          email = creds.megaEmail || '';
          password = creds.megaPassword || '';
        }
      } catch (e) {}
    }
    return `/api/files/download?name=${encodeURIComponent(msgFile.name)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&token=${encodeURIComponent(token || '')}${msgFile.isShared ? '&shared=true' : ''}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const sizeKB = Math.round(file.size / 1024);
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      setSelectedFile({ name: file.name, size: sizeStr, type: getFileType(file.name), base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (e: React.FormEvent, isThreadReply = false) => {
    e.preventDefault();
    const textToSend = isThreadReply ? threadInputText : inputText;
    if (!textToSend.trim() && !selectedFile) return;

    if (textToSend.trim() === '/clear') {
      if (isThreadReply) setThreadInputText(''); else setInputText('');
      return;
    }

    if (!isThreadReply && editingMsg) {
      try {
        await axios.put(`/api/chat/${editingMsg.id}`, { text: textToSend }, { headers });
        setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, text: textToSend, is_edited: true } : m));
        setEditingMsg(null);
        setInputText('');
      } catch (e) {}
      return;
    }

    let filePayload = undefined;
    if (selectedFile) {
      if (selectedFile.mega) {
        filePayload = {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
          mega: true,
          isShared: selectedFile.isShared
        };
      } else {
        filePayload = {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
          url: selectedFile.base64
        };
      }
    }

    const payload = {
      text: textToSend.trim() || undefined,
      file: filePayload,
      channel: activeChat.type === 'channel' ? activeChat.id : undefined,
      receiverId: activeChat.type === 'dm' ? activeChat.id : undefined,
      reply_to_id: isThreadReply ? threadParent?.id : (replyTo?.id || undefined)
    };

    try {
      const res = await axios.post('/api/chat/send', payload, { headers });
      const newMsg = res.data;

      setMessages(prev => [...prev, newMsg]);
      if (socketRef.current) socketRef.current.emit('chat-message', newMsg);

      if (isThreadReply) {
        setThreadInputText('');
      } else {
        setInputText('');
        setSelectedFile(null);
        setReplyTo(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (socketRef.current) {
      socketRef.current.emit('chat-typing', {
        sender_id: userId,
        senderName: username,
        channel: activeChat.type === 'channel' ? activeChat.id : undefined,
        receiverId: activeChat.type === 'dm' ? activeChat.id : undefined
      });
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    try {
      const res = await axios.post(`/api/chat/${msgId}/react`, { emoji }, { headers });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: res.data.reactions } : m));
      if (socketRef.current) {
        socketRef.current.emit('chat-react-update', { messageId: msgId });
      }
    } catch (e) {}
    setReactionMsgId(null);
  };

  const handleDelete = async (msgId: string) => {
    try {
      await axios.delete(`/api/chat/${msgId}`, { headers });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, text: undefined, file: undefined, link_preview: undefined } : m));
    } catch (e) {}
  };

  const handlePinToggle = async (msgId: string) => {
    try {
      const res = await axios.post(`/api/chat/${msgId}/pin`, {}, { headers });
      const isPinned = res.data.is_pinned;
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_pinned: isPinned } : m));
      if (socketRef.current) {
        socketRef.current.emit('chat-pin-changed', { messageId: msgId, is_pinned: isPinned });
      }
      fetchPins();
    } catch (e) {}
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/chat/status', { custom_status: customStatusText }, { headers });
      setMyStatus(customStatusText || null);
      setShowStatusModal(false);
      fetchUsers();
      if (socketRef.current) {
        socketRef.current.emit('user-status-changed', { userId, status: customStatusText });
      }
    } catch (err) {}
  };

  const handleSendSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snippetCode.trim()) return;

    const formattedCodeText = `\`\`\`${snippetLanguage}\n${snippetCode}\n\`\`\``;
    const payload = {
      text: formattedCodeText,
      channel: activeChat.type === 'channel' ? activeChat.id : undefined,
      receiverId: activeChat.type === 'dm' ? activeChat.id : undefined
    };

    try {
      const res = await axios.post('/api/chat/send', payload, { headers });
      const newMsg = res.data;
      setMessages(prev => [...prev, newMsg]);
      if (socketRef.current) socketRef.current.emit('chat-message', newMsg);
      setShowSnippetModal(false);
      setSnippetCode('');
    } catch (err) {
      console.error(err);
    }
  };

  const insertMarkdown = (start: string, end = '') => {
    if (!chatInputRef.current) return;
    const s = chatInputRef.current.selectionStart || 0;
    const e = chatInputRef.current.selectionEnd || 0;
    const value = inputText;
    const selection = value.substring(s, e);
    const replacement = start + selection + end;
    const newValue = value.substring(0, s) + replacement + value.substring(e);
    setInputText(newValue);
    setTimeout(() => {
      chatInputRef.current?.focus();
      const newCursorPos = s + start.length + selection.length + end.length;
      chatInputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 20);
  };

  const formatText = (txt?: string) => {
    if (!txt) return null;
    
    // Check if code snippet
    const codeMatch = txt.match(/^```([a-zA-Z0-9+-]+)\n([\s\S]*?)```$/);
    if (codeMatch) {
      const lang = codeMatch[1];
      const code = codeMatch[2];
      return (
        <div className="my-2 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/80 font-mono text-xs w-full max-w-full">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 font-sans">
            <span className="uppercase font-semibold tracking-wider text-indigo-400">{lang}</span>
            <button 
              onClick={() => navigator.clipboard.writeText(code)} 
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 hover:text-white transition flex items-center gap-1"
            >
              <FileText size={10} /> Copy
            </button>
          </div>
          <pre className="p-3 overflow-x-auto whitespace-pre leading-relaxed select-text" dangerouslySetInnerHTML={{ __html: highlightCode(code, lang) }} />
        </div>
      );
    }

    let formatted = txt.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/`(.*?)`/g, '<code class="bg-indigo-500/10 border border-indigo-500/10 px-1 rounded text-indigo-300">$1</code>');
    formatted = formatted.replace(/^&gt;\s(.*)$/gm, '<blockquote class="border-l-2 border-indigo-500 pl-2 text-slate-400 italic">$1</blockquote>');
    
    return <span className="markdown-chat" dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  const threadReplies = useMemo(() => {
    if (!threadParent) return [];
    return messages.filter(m => m.reply_to_id === threadParent.id);
  }, [threadParent, messages]);

  return (
    <div className="flex h-[calc(100vh-120px)] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative text-slate-200">
      
      {/* Lightbox Modal */}
      {lightboxData && (
        <div className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setLightboxData(null)}>
          {lightboxData.type === 'image' && <img src={lightboxData.url} className="max-w-full max-h-full rounded-xl shadow-2xl" />}
          {lightboxData.type === 'video' && <video src={lightboxData.url} controls autoPlay className="max-w-full max-h-full rounded-xl" />}
          <button className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-700 p-2.5 rounded-full"><X size={18}/></button>
        </div>
      )}

      {/* Mobile Sidebar overlay */}
      {showMobileSidebar && (
        <div className="absolute inset-0 bg-black/70 z-20 md:hidden" onClick={() => setShowMobileSidebar(false)} />
      )}

      {/* Sidebar */}
      <div className={`absolute md:static z-30 inset-y-0 left-0 w-60 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out ${
        showMobileSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Globe className="text-white" size={14} />
            </div>
            <span className="font-bold text-xs tracking-wider text-white font-mono">TEAM DESK</span>
          </div>
        </div>

        {/* Sidebar Nav */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">Channels</p>
          {channels.map((chan) => (
            <button
              key={chan}
              onClick={() => { setActiveChat({ type: 'channel', id: chan, name: chan }); setShowMobileSidebar(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeChat.type === 'channel' && activeChat.id === chan 
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <Hash size={14} className="text-slate-500" />
                <span>#{chan}</span>
              </div>
            </button>
          ))}

          <div className="pt-4 pb-2 px-3 flex items-center justify-between">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Colleagues</p>
          </div>
          {colleagues.map((user) => (
            <button
              key={user.id}
              onClick={() => { setActiveChat({ type: 'dm', id: user.id, name: user.username }); setShowMobileSidebar(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeChat.type === 'dm' && activeChat.id === user.id 
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="relative shrink-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} className="w-6.5 h-6.5 rounded-lg object-cover" />
                ) : (
                  <div className="w-6.5 h-6.5 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-400 border border-slate-700">
                    {user.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${user.is_online ? 'bg-emerald-500' : 'bg-slate-600'}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="truncate text-slate-200">{user.username}</p>
                {user.custom_status && (
                  <p className="text-[10px] text-slate-500 truncate font-normal">{user.custom_status}</p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* User Card */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between group">
          <div className="flex items-center gap-3 flex-1 overflow-hidden">
            <button onClick={() => setShowAvatarModal(true)} className="relative shrink-0 rounded-lg overflow-hidden group">
              {myAvatar ? (
                 <img src={myAvatar} className="w-8 h-8 object-cover" />
              ) : (
                <div className="w-8 h-8 bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700 hover:bg-slate-700">
                  <Camera size={14} />
                </div>
              )}
            </button>
            <div className="flex-1 overflow-hidden cursor-pointer" onClick={() => { setCustomStatusText(myStatus || ''); setShowStatusModal(true); }}>
              <p className="text-xs font-bold text-slate-200 truncate">{username}</p>
              <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {myStatus || 'Set status'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main View: Chat + Sidepanels wrapper */}
      <div className="flex-1 flex min-w-0 bg-slate-950">
        
        {/* Main Chat Feed */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 border-r border-slate-900">
          
          {/* Header */}
          <div className="h-14 border-b border-slate-900 bg-slate-900/60 backdrop-blur-md px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowMobileSidebar(true)} className="p-1 md:hidden text-slate-400 hover:text-white">
                <Menu size={18} />
              </button>
              <span className="font-bold text-sm text-slate-100">
                {activeChat.type === 'channel' ? `#${activeChat.name}` : `@${activeChat.name}`}
              </span>
              {activeChat.type === 'dm' && (
                <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full font-semibold border border-slate-800">Direct Message</span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowPinsPanel(!showPinsPanel)}
                className={`p-1.5 rounded-lg border transition ${showPinsPanel ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400' : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'}`}
                title="Pins Board"
              >
                <Pin size={15} />
              </button>
            </div>
          </div>

          {/* Messages feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3">
                {activeChat.type === 'channel' ? <Hash className="text-indigo-400" /> : <User className="text-indigo-400" />}
              </div>
              <h3 className="text-sm font-bold text-slate-200">This is the start of #{activeChat.name}</h3>
              <p className="text-xs text-slate-500 mt-1">Send messages and collaborate with your team.</p>
            </div>

            {messages.map((msg) => {
              const isMe = msg.sender_id === userId;
              const isSystem = msg.sender === 'System Bot';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <span className="bg-slate-900 text-[10px] text-slate-500 px-3 py-1 rounded-full border border-slate-800 flex items-center gap-1.5 font-mono">
                      <Terminal size={10} /> {msg.text}
                    </span>
                  </div>
                );
              }

              const parentMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {!isMe && <span className="text-xs font-bold text-slate-300">{msg.sender}</span>}
                    <span className="text-[9px] text-slate-600">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.is_pinned && <Pin className="w-2.5 h-2.5 text-indigo-400 fill-indigo-400" />}
                  </div>

                  <div className="flex gap-2 max-w-[85%] relative">
                    {!isMe && (
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 mt-0.5 border border-slate-800">
                        {msg.avatar_url ? <img src={msg.avatar_url} className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full bg-slate-900 flex items-center justify-center text-xs font-bold text-slate-400">
                            {msg.sender?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                    )}

                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} w-full`}>
                      {parentMsg && (
                        <button 
                          onClick={() => setThreadParent(parentMsg)}
                          className="mb-1 text-[9px] text-slate-500 hover:text-slate-300 flex items-center gap-1.5 bg-slate-900/60 border border-slate-850 px-2 py-1 rounded-lg truncate max-w-full"
                        >
                          <CornerUpLeft size={10}/> <span className="font-bold">{parentMsg.sender}:</span> {parentMsg.text || 'File attachment'}
                        </button>
                      )}
                      
                      <div className={`p-3 rounded-xl text-sm ${
                        msg.is_deleted ? 'bg-slate-900 border border-dashed border-slate-850 text-slate-600 italic' :
                        isMe 
                          ? 'bg-indigo-500 text-white rounded-tr-none' 
                          : 'bg-slate-900 text-slate-200 border border-slate-850 rounded-tl-none'
                      }`}>
                        {msg.is_deleted ? (
                           <span>Message deleted</span>
                        ) : (
                          <>
                            {msg.text && formatText(msg.text)}
                            {msg.file && (
                              <div 
                                className={`mt-2 flex items-center gap-3 p-2 rounded-xl cursor-pointer ${isMe ? 'bg-black/15' : 'bg-slate-950 border border-slate-800'}`}
                                onClick={() => {
                                  const url = getFileUrl(msg.file!);
                                  if (msg.file?.type === 'image' || msg.file?.type === 'video') {
                                    setLightboxData({ type: msg.file.type, url });
                                  } else {
                                    window.open(url, '_blank');
                                  }
                                }}
                              >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isMe ? 'bg-white/10 text-white' : 'bg-slate-900 text-indigo-400 border border-slate-800'}`}>
                                  {msg.file.mega ? <Cloud size={16} /> : (
                                    <>
                                      {msg.file.type === 'image' && <ImageIcon size={16} />}
                                      {msg.file.type === 'video' && <Video size={16} />}
                                      {msg.file.type === 'zip' && <FolderArchive size={16} />}
                                      {msg.file.type === 'text' && <FileText size={16} />}
                                    </>
                                  )}
                                </div>
                                <div className="overflow-hidden min-w-[120px] max-w-[200px]">
                                  <p className="text-[11px] font-bold truncate">{msg.file.name}</p>
                                  <p className={`text-[9px] ${isMe ? 'text-white/60' : 'text-slate-500'} flex items-center gap-1`}>
                                    <span>{msg.file.size}</span>
                                    <span>·</span>
                                    <span className="uppercase text-[8px]">{msg.file.type}</span>
                                    {msg.file.mega && <span className="text-[8px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1 rounded">Mega</span>}
                                  </p>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => (
                            <button 
                              key={emoji} 
                              onClick={() => handleReact(msg.id, emoji)} 
                              className="bg-slate-900 border border-slate-850 hover:border-slate-700 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                            >
                              <span>{emoji}</span>
                              <span className="text-[9px] text-slate-500 font-bold">{users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hover actions menu */}
                    {!msg.is_deleted && (
                      <div className={`absolute top-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-800 shadow-xl rounded-lg p-1 z-10 ${isMe ? '-left-36' : '-right-36'}`}>
                        <button onClick={() => handlePinToggle(msg.id)} className={`p-1 hover:bg-slate-800 rounded transition ${msg.is_pinned ? 'text-indigo-400' : 'text-slate-500'}`} title="Pin Message"><Pin size={12}/></button>
                        <button onClick={() => setReplyTo(msg)} className="p-1 hover:bg-slate-800 rounded text-slate-550" title="Reply"><CornerUpLeft size={12}/></button>
                        <button onClick={() => setThreadParent(msg)} className="p-1 hover:bg-slate-800 rounded text-slate-550" title="Thread"><MessageSquare size={12}/></button>
                        <button onClick={() => setReactionMsgId(msg.id)} className="p-1 hover:bg-slate-800 rounded text-slate-550" title="React"><Smile size={12}/></button>
                        {isMe && <button onClick={() => { setEditingMsg(msg); setInputText(msg.text || ''); }} className="p-1 hover:bg-slate-800 rounded text-slate-550" title="Edit"><Edit2 size={12}/></button>}
                        {isMe && <button onClick={() => handleDelete(msg.id)} className="p-1 hover:bg-red-500/10 rounded text-red-400" title="Delete"><Trash2 size={12}/></button>}
                      </div>
                    )}

                    {/* Reaction Picker Overlay */}
                    {reactionMsgId === msg.id && (
                      <div className={`absolute -top-12 z-20 bg-slate-900 border border-slate-800 shadow-2xl p-1.5 rounded-xl flex gap-1 ${isMe ? 'right-0' : 'left-0'}`}>
                        {EMOJI_PICKER_LIST.map(em => (
                          <button key={em} onClick={() => handleReact(msg.id, em)} className="hover:scale-125 transition-transform text-sm p-0.5">{em}</button>
                        ))}
                        <button onClick={() => setReactionMsgId(null)} className="p-1 text-slate-500 hover:text-white"><X size={10} /></button>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}

            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
               <div className="text-[10px] text-slate-500 italic flex items-center gap-1.5 animate-pulse pl-10">
                 <Terminal size={11} />
                 <span>{Array.from(typingUsers).join(', ')} is typing…</span>
               </div>
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Form / Input area */}
          <div className="p-4 bg-slate-900/60 border-t border-slate-900">
            {/* Active states templates (Reply / Edit) */}
            {replyTo && (
              <div className="mb-2 flex items-center justify-between bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                  <CornerUpLeft size={12} className="text-indigo-400" />
                  <span className="font-bold text-slate-200">{replyTo.sender}:</span>
                  <span className="truncate">{replyTo.text || 'File attachment'}</span>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-slate-500 hover:text-slate-350"><X size={14}/></button>
              </div>
            )}
            {editingMsg && (
               <div className="mb-2 flex items-center justify-between bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-xl border border-indigo-550/20">
                 <span className="text-xs font-semibold flex items-center gap-2"><Edit2 size={12}/> Editing Message</span>
                 <button onClick={() => { setEditingMsg(null); setInputText(''); }} className="text-slate-500 hover:text-white"><X size={14}/></button>
               </div>
            )}

            {/* Formatting Toolbar */}
            <div className="flex items-center gap-1 mb-2 px-1 text-slate-500 text-[10px]">
              <button type="button" onClick={() => insertMarkdown('**', '**')} className="p-1 hover:text-slate-300" title="Bold"><Bold size={13} /></button>
              <button type="button" onClick={() => insertMarkdown('*', '*')} className="p-1 hover:text-slate-300" title="Italic"><Italic size={13} /></button>
              <button type="button" onClick={() => insertMarkdown('`', '`')} className="p-1 hover:text-slate-300" title="Code"><Code size={13} /></button>
              <button type="button" onClick={() => insertMarkdown('> ')} className="p-1 hover:text-slate-300" title="Quote"><Quote size={13} /></button>
              <button type="button" onClick={() => insertMarkdown('## ')} className="p-1 hover:text-slate-300" title="Heading"><Heading2 size={13} /></button>
              <span className="w-px h-3 bg-slate-800 mx-1" />
              <button type="button" onClick={() => setShowSnippetModal(true)} className="p-1 hover:text-indigo-400 flex items-center gap-0.5 text-[9px] font-semibold" title="Code Snippet">
                <Code size={13} /> Snippet
              </button>
              <button type="button" onClick={() => setShowMegaModal(true)} className="p-1 hover:text-sky-400 flex items-center gap-0.5 text-[9px] font-semibold" title="Attach from Mega">
                <Cloud size={13} /> Mega File
              </button>
            </div>

            <form onSubmit={(e) => handleSendMessage(e, false)} className="flex items-end gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 rounded-xl transition shrink-0 border border-slate-800"
              >
                <Paperclip size={16} />
              </button>

              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden focus-within:border-indigo-500/50 focus-within:ring-1 ring-indigo-500/20 transition-all">
                {/* Draft file preview */}
                {selectedFile && (
                  <div className="flex items-center justify-between p-2 mx-2 mt-2 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {selectedFile.mega ? <Cloud size={14} className="text-sky-400 shrink-0" /> : <File size={14} className="text-indigo-400 shrink-0" />}
                      <span className="text-xs font-semibold text-slate-300 truncate">{selectedFile.name}</span>
                      <span className="text-[9px] text-slate-555 shrink-0">{selectedFile.size}</span>
                    </div>
                    <button type="button" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="p-1 hover:bg-slate-900 rounded text-slate-400">
                      <X size={14} />
                    </button>
                  </div>
                )}
                
                <input
                  ref={chatInputRef}
                  type="text"
                  placeholder={editingMsg ? "Edit message…" : `Write to ${activeChat.type === 'channel' ? '#' : '@'}${activeChat.name}… (/clear)`}
                  value={inputText}
                  onChange={handleTyping}
                  className="w-full bg-transparent text-xs outline-none text-slate-200 placeholder-slate-600 p-3"
                />
              </div>

              <button 
                type="submit"
                disabled={!inputText.trim() && !selectedFile}
                className="p-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl transition shrink-0 shadow-lg shadow-indigo-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* Thread Sidepanel Drawer */}
        {threadParent && (
          <div className="w-80 shrink-0 border-r border-slate-900 bg-slate-900/90 flex flex-col relative animate-in slide-in-from-right duration-250">
            {/* Header */}
            <div className="h-14 border-b border-slate-850 px-4 flex items-center justify-between bg-slate-900 shrink-0">
              <span className="font-bold text-xs text-white tracking-wide flex items-center gap-1.5">
                <MessageSquare size={14} className="text-indigo-400" /> Thread Reply
              </span>
              <button onClick={() => setThreadParent(null)} className="p-1 text-slate-500 hover:text-white rounded-lg">
                <X size={16} />
              </button>
            </div>

            {/* Thread Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Parent Message Card */}
              <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                <p className="text-[10px] font-bold text-indigo-400 mb-1">{threadParent.sender}</p>
                <div className="text-xs text-slate-300">{threadParent.text && formatText(threadParent.text)}</div>
                <p className="text-[8px] text-slate-600 mt-2 font-mono">{new Date(threadParent.timestamp).toLocaleString()}</p>
              </div>

              <div className="text-center py-2 text-[10px] text-slate-600 border-b border-slate-850">
                Replies ({threadReplies.length})
              </div>

              {/* Thread Replies List */}
              <div className="space-y-3.5">
                {threadReplies.map(reply => (
                  <div key={reply.id} className="text-xs">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-bold text-slate-400">{reply.sender}</span>
                      <span className="text-[8px] text-slate-600">{timeAgo(reply.timestamp)}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/80 border border-slate-850 rounded-xl text-slate-300">
                      {reply.text && formatText(reply.text)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Thread Input Form */}
            <div className="p-3 border-t border-slate-850 bg-slate-900 shrink-0">
              <form onSubmit={(e) => handleSendMessage(e, true)} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Reply in thread…"
                  value={threadInputText}
                  onChange={e => setThreadInputText(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs outline-none text-slate-200 placeholder-slate-600 focus:border-indigo-500/50"
                />
                <button type="submit" disabled={!threadInputText.trim()} className="px-3 bg-indigo-500 hover:bg-indigo-400 rounded-lg text-white font-bold transition disabled:opacity-40">
                  <Send size={12} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Pinned Messages Board Sidebar */}
        {showPinsPanel && (
          <div className="w-80 shrink-0 border-r border-slate-900 bg-slate-900/90 flex flex-col relative animate-in slide-in-from-right duration-250">
            <div className="h-14 border-b border-slate-850 px-4 flex items-center justify-between bg-slate-900 shrink-0">
              <span className="font-bold text-xs text-white tracking-wide flex items-center gap-1.5">
                <Pin size={14} className="text-indigo-400 fill-indigo-400" /> Pinned Messages
              </span>
              <button onClick={() => setShowPinsPanel(false)} className="p-1 text-slate-500 hover:text-white rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center text-slate-600">
                  <Pin size={24} className="opacity-30" />
                  <p className="text-xs">No pinned messages yet</p>
                  <p className="text-[10px] text-slate-500">Pin important directives from the hover menu.</p>
                </div>
              ) : (
                pins.map(pin => (
                  <div key={pin.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl relative group text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-300">{pin.sender}</span>
                      <span className="text-[8px] text-slate-600">{timeAgo(pin.timestamp)}</span>
                    </div>
                    <div className="text-slate-400 line-clamp-4 leading-relaxed mb-2">
                      {pin.text && formatText(pin.text)}
                    </div>
                    <button 
                      onClick={() => handlePinToggle(pin.id)} 
                      className="text-[9px] text-red-400 hover:underline flex items-center gap-1"
                    >
                      <X size={10} /> Unpin
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* Code Snippet Canvas Modal */}
      {showSnippetModal && (
        <div className="absolute inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={() => setShowSnippetModal(false)}>
          <form 
            onSubmit={handleSendSnippet}
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-lg shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Code size={16} className="text-indigo-400" /> Share Code Snippet</h3>
              <button type="button" onClick={() => setShowSnippetModal(false)} className="text-slate-500 hover:text-white"><X size={16}/></button>
            </div>
            
            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-bold">Language</label>
                <select
                  value={snippetLanguage}
                  onChange={e => setSnippetLanguage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs outline-none text-slate-300"
                >
                  {CODE_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-bold">Snippet Code</label>
              <textarea
                rows={8}
                value={snippetCode}
                onChange={e => setSnippetCode(e.target.value)}
                placeholder="Paste your block of code here…"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs outline-none text-slate-200 font-mono placeholder-slate-700"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" onClick={() => setShowSnippetModal(false)} className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-xs font-semibold rounded-xl text-slate-400 hover:text-white">Cancel</button>
              <button type="submit" disabled={!snippetCode.trim()} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-xl disabled:opacity-40">Send Snippet</button>
            </div>
          </form>
        </div>
      )}

      {/* Mega Files Modal */}
      {showMegaModal && (
        <div className="absolute inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={() => setShowMegaModal(false)}>
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-md shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Cloud size={16} className="text-sky-400" /> Select Mega File</h3>
              <button type="button" onClick={() => setShowMegaModal(false)} className="text-slate-500 hover:text-white"><X size={16}/></button>
            </div>

            {/* Toggle isShared */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-1 rounded-lg">
              <button 
                type="button" 
                onClick={() => setIsSharedMega(false)}
                className={`flex-1 py-1.5 text-[10px] font-semibold rounded-md transition ${!isSharedMega ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
              >
                Personal Cloud
              </button>
              <button 
                type="button" 
                onClick={() => setIsSharedMega(true)}
                className={`flex-1 py-1.5 text-[10px] font-semibold rounded-md transition ${isSharedMega ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
              >
                Shared Assets
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {megaLoading ? (
                <div className="flex justify-center items-center py-10 gap-2">
                  <RefreshCw className="animate-spin text-sky-400 w-4 h-4" />
                  <span className="text-xs text-slate-500">Loading files…</span>
                </div>
              ) : megaFiles.length === 0 ? (
                <p className="text-xs text-slate-655 italic text-center py-10">No files found inside directory.</p>
              ) : (
                megaFiles.map(file => (
                  <button
                    type="button"
                    key={file.id || file.name}
                    onClick={() => handleSelectMegaFile(file)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs hover:bg-slate-850 text-left text-slate-300 hover:text-white border border-slate-850"
                  >
                    <File size={14} className="text-slate-500" />
                    <span className="flex-1 truncate">{file.name}</span>
                    {file.size && <span className="text-[9px] text-slate-555 font-mono">{formatBytes(file.size)}</span>}
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button type="button" onClick={() => setShowMegaModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-350">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Avatar Modal */}
      {showAvatarModal && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAvatarModal(false)}>
          <div className="bg-slate-900 p-6 rounded-2xl w-full max-w-sm border border-slate-800 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-4 right-4 text-slate-550 hover:text-white" onClick={() => setShowAvatarModal(false)}><X size={18}/></button>
            <h3 className="text-sm font-bold text-white mb-2">Update Profile Avatar</h3>
            <p className="text-xs text-slate-500 mb-6">Select an image to personalize your account across team workspaces.</p>
            
            <input type="file" id="avatarUpload" className="hidden" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                const base64 = reader.result as string;
                try {
                  await axios.post('/api/chat/avatar', { avatar_url: base64 }, { headers });
                  setMyAvatar(base64);
                  setShowAvatarModal(false);
                  fetchUsers(); 
                } catch(err) {}
              };
              reader.readAsDataURL(file);
            }} />
            
            <button onClick={() => document.getElementById('avatarUpload')?.click()} className="w-full py-3 bg-slate-950 border border-slate-800 rounded-xl font-bold hover:bg-indigo-500/10 hover:border-indigo-500/50 hover:text-indigo-400 transition-all flex items-center justify-center gap-2 text-xs">
              <Camera size={16} /> Select Avatar Image
            </button>
          </div>
        </div>
      )}

      {/* User Custom Presence Status Modal */}
      {showStatusModal && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowStatusModal(false)}>
          <form 
            onSubmit={handleUpdateStatus}
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 p-5 rounded-2xl w-full max-w-sm border border-slate-800 shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><UserCheck size={16} className="text-indigo-400" /> Custom Presence Status</h3>
              <button type="button" onClick={() => setShowStatusModal(false)} className="text-slate-550 hover:text-white"><X size={16}/></button>
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-bold">Status Message</label>
              <input
                type="text"
                placeholder="What is your current status? (e.g. ☕ AFK)"
                value={customStatusText}
                onChange={e => setCustomStatusText(e.target.value)}
                maxLength={50}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs outline-none text-slate-200 placeholder-slate-700 focus:border-indigo-500/50"
              />
            </div>

            {/* Presets Grid */}
            <div className="space-y-1">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-bold">Presets</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { icon: '☕', label: 'AFK' },
                  { icon: '🔴', label: 'In a meeting' },
                  { icon: '🚀', label: 'Coding' },
                  { icon: '🏡', label: 'WFH' },
                  { icon: '💻', label: 'Focus Mode' },
                  { icon: '🏖️', label: 'Vacation' }
                ].map(p => (
                  <button
                    type="button"
                    key={p.label}
                    onClick={() => setCustomStatusText(`${p.icon} ${p.label}`)}
                    className="px-2.5 py-1.5 bg-slate-950 border border-slate-850 hover:border-slate-700 rounded-xl text-left text-[11px] text-slate-400 hover:text-white truncate"
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" onClick={() => setShowStatusModal(false)} className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-xs font-semibold rounded-xl text-slate-400">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-xl">Save Status</button>
            </div>
          </form>
        </div>
      )}

      {/* Markdown styling inline override */}
      <style>{`
        .markdown-chat strong { font-weight: 700; color: #ffffff; }
        .markdown-chat em { font-style: italic; color: #a5b4fc; }
        .markdown-chat code { font-family: monospace; font-size: 0.85em; }
        .markdown-chat blockquote {
          margin: 0.25rem 0;
          padding-left: 0.5rem;
        }
      `}</style>

    </div>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
