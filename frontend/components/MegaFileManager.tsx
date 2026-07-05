'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import { addActivityLog } from '../lib/storage';
import { decrypt } from '../lib/crypto';
import { 
  Folder, File, FolderPlus, ArrowLeft, Search, Trash2, Eye, Share2, 
  UploadCloud, HardDrive, Filter, History, Video, Activity, Info, X, 
  ChevronRight, Play, CheckCircle, RefreshCw, Image as ImageIcon
} from 'lucide-react';
import axiosStatic from 'axios';
import JSZip from 'jszip';

interface MegaFile {
  id: string;
  name: string;
  size: number;
  directory: boolean;
  path: string; // Directory location (e.g. "root" or "root/campaigns")
  tags?: string[];
  version?: number;
  lastModified?: string;
  versions?: { version: number; size: number; date: string }[];
}

interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number;
  speed: string;
  eta: string;
  status: 'queued' | 'uploading' | 'completed' | 'failed';
}

export default function MegaFileManager() {
  const { token, masterKey } = useAuth();
  const [isSharedView, setIsSharedView] = useState(false);

  // Helper to dynamically get headers containing decrypted MEGA credentials
  const getMegaHeaders = () => {
    const baseHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (isSharedView) {
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
      } catch (e) {
        console.error('Failed to decrypt credentials for Mega headers', e);
      }
    }
    return baseHeaders;
  };

  // Helper to dynamically get authenticated download/stream URL for tags
  const getDownloadUrl = (filename: string) => {
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
      } catch (e) {
        console.error(e);
      }
    }
    return `/api/files/download?name=${encodeURIComponent(filename)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&token=${encodeURIComponent(token || '')}${isSharedView ? '&shared=true' : ''}`;
  };
  
  // File Listing State
  const [files, setFiles] = useState<MegaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Navigation State
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(['root']);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderModal, setShowFolderModal] = useState(false);

  // Upload Queue State
  const [uploadQueue, setUploadQueue] = useState<UploadTask[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals & Panels
  const [previewFile, setPreviewFile] = useState<MegaFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [shareFile, setShareFile] = useState<MegaFile | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [linkExpiry, setLinkExpiry] = useState('24h');
  const [linkPassword, setLinkPassword] = useState('');

  // Version Control History
  const [historyFile, setHistoryFile] = useState<MegaFile | null>(null);

  // Multi-Select and Inline Editor States
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isEditingMarkdown, setIsEditingMarkdown] = useState(false);
  const [markdownEditorContent, setMarkdownEditorContent] = useState('');
  const [saveMarkdownLoading, setSaveMarkdownLoading] = useState(false);

  const toggleSelectFile = (id: string) => {
    setSelectedFileIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllToggle = () => {
    const allFilteredSelected = filteredFiles.every(f => selectedFileIds.includes(f.id));
    if (allFilteredSelected) {
      const fileIdsToRemove = filteredFiles.map(f => f.id);
      setSelectedFileIds(prev => prev.filter(id => !fileIdsToRemove.includes(id)));
    } else {
      const fileIdsToAdd = filteredFiles.map(f => f.id);
      setSelectedFileIds(prev => Array.from(new Set([...prev, ...fileIdsToAdd])));
    }
  };

  // Stats / Limits
  const storageLimit = 50 * 1024 * 1024 * 1024; // 50 GB
  const [usedStorage, setUsedStorage] = useState(0); // Start with 0

  // Fetch Inventory from MEGA / Mock Database
  const fetchFiles = async () => {
    if (!token) return;
    setLoading(true);
    setConnectionError(null);
    try {
      const res = await axiosStatic.get('/api/files/list', {
        headers: getMegaHeaders()
      });
      
      // Load paths dictionary
      let pathsMap: Record<string, string> = {};
      try {
        const stored = localStorage.getItem('mega_file_paths');
        if (stored) pathsMap = JSON.parse(stored);
      } catch (e) {
        console.error(e);
      }

      // Map API result and overlay folders/directory structure
      const parsedFiles: MegaFile[] = res.data.map((f: any) => {
        // Classify tags and structural paths based on mock filenames
        let tags: string[] = ['Vault'];
        let path = 'root';
        const nameLower = f.name.toLowerCase();
        
        if (
          nameLower.endsWith('.png') || 
          nameLower.endsWith('.jpg') || 
          nameLower.endsWith('.jpeg') || 
          nameLower.endsWith('.webp') || 
          nameLower.endsWith('.gif')
        ) {
          tags.push('Image');
        }
        if (nameLower.endsWith('.json')) tags.push('Config');
        if (nameLower.endsWith('.zip') || nameLower.endsWith('.rar') || nameLower.endsWith('.7z') || nameLower.endsWith('.tar.gz')) {
          tags.push('Zip');
        }

        // Check dynamic path mapping
        if (pathsMap[f.name]) {
          path = pathsMap[f.name];
        }

        return {
          id: f.id,
          name: f.name,
          size: f.size || 0,
          directory: f.directory || false,
          path: f.path || path,
          tags,
          version: 1,
          lastModified: new Date().toLocaleDateString(),
          versions: [
            { version: 1, size: f.size || 0, date: new Date().toLocaleDateString() }
          ]
        };
      });

      // Initialize folders array empty without demo folders
      const folders: MegaFile[] = [];

      // Extract custom directories dynamically from pathsMap
      const customFoldersSet = new Set<string>();
      Object.values(pathsMap).forEach(p => {
        const parts = p.split('/');
        let currentChain = 'root';
        for (let i = 1; i < parts.length; i++) {
          const folderName = parts[i];
          const parentPath = currentChain;
          customFoldersSet.add(JSON.stringify({ name: folderName, path: parentPath }));
          currentChain = `${currentChain}/${folderName}`;
        }
      });

      customFoldersSet.forEach(jsonStr => {
        const item = JSON.parse(jsonStr);
        if (!folders.some(f => f.name === item.name && f.path === item.path)) {
          folders.push({
            id: 'folder-' + Math.random().toString(36).substring(7),
            name: item.name,
            size: 0,
            directory: true,
            path: item.path,
            tags: ['Custom']
          });
        }
      });

      setFiles([...folders, ...parsedFiles]);

      // Calculate total storage
      const totalSize = parsedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
      setUsedStorage(totalSize);
    } catch (err: any) {
      console.error('Failed to load files:', err);
      const msg = err.response?.data?.error || err.message || 'Unknown network error';
      setConnectionError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [token, isSharedView]);

  // Handle Folder Creation
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const folderPath = `${currentFolder}/${newFolderName.toLowerCase()}`;
    
    // Save to mega_file_paths in localStorage to survive restarts/refreshes
    try {
      const stored = localStorage.getItem('mega_file_paths') || '{}';
      const pathsMap = JSON.parse(stored);
      pathsMap[`__folder_placeholder_${Math.random().toString(36).substring(7)}`] = folderPath;
      localStorage.setItem('mega_file_paths', JSON.stringify(pathsMap));
    } catch (e) {
      console.error(e);
    }

    fetchFiles();
    setNewFolderName('');
    setShowFolderModal(false);
  };

  // Navigating nested directory tree
  const handleItemClick = (item: MegaFile) => {
    if (item.directory) {
      const targetPath = `${item.path}/${item.name}`.replace('root/', '');
      setCurrentFolder(targetPath);
      setBreadcrumbs([...breadcrumbs, item.name]);
    } else {
      // Toggle file preview
      handlePreview(item);
    }
  };

  const navigateBreadcrumb = (index: number) => {
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    if (index === 0) {
      setCurrentFolder('root');
    } else {
      const targetPath = nextBreadcrumbs.slice(1).join('/');
      setCurrentFolder(targetPath);
    }
  };

  // Previews Modal Manager
  const handlePreview = async (file: MegaFile) => {
    setPreviewFile(file);
    setPreviewContent(null);
    setIsEditingMarkdown(false);

    const nameLower = file.name.toLowerCase();
    if (
      nameLower.endsWith('.png') || 
      nameLower.endsWith('.jpg') || 
      nameLower.endsWith('.jpeg') || 
      nameLower.endsWith('.webp') || 
      nameLower.endsWith('.gif')
    ) {
      setPreviewContent('IMAGE_ASSET');
    } else if (nameLower.endsWith('.mp4') || nameLower.endsWith('.webm') || nameLower.endsWith('.mov') || nameLower.endsWith('.ogg')) {
      setPreviewContent('VIDEO_STREAM');
    } else if (nameLower.endsWith('.md') || nameLower.endsWith('.txt') || nameLower.endsWith('.json')) {
      try {
        const res = await axiosStatic.get(getDownloadUrl(file.name));
        const text = typeof res.data === 'object' ? JSON.stringify(res.data, null, 2) : res.data;
        setPreviewContent(text);
        setMarkdownEditorContent(text);
      } catch (err) {
        setPreviewContent(`[Failed to load file contents: ${err}]`);
      }
    } else {
      setPreviewContent(`## File Asset\n\n- File Name: ${file.name}\n- Identity Token: ${file.id}\n- Status: Available`);
    }
  };

  // Inline markdown editor save
  const handleSaveMarkdown = async () => {
    if (!previewFile) return;
    setSaveMarkdownLoading(true);
    try {
      const base64Content = btoa(unescape(encodeURIComponent(markdownEditorContent)));
      await axiosStatic.post('/api/files/upload', {
        name: previewFile.name,
        contentBase64: base64Content
      }, {
        headers: getMegaHeaders()
      });

      // Maintain path mapping
      try {
        const stored = localStorage.getItem('mega_file_paths') || '{}';
        const pathsMap = JSON.parse(stored);
        const currentPath = previewFile.path || currentFolder;
        pathsMap[previewFile.name] = currentPath;
        localStorage.setItem('mega_file_paths', JSON.stringify(pathsMap));
      } catch (e) {
        console.error(e);
      }

      if (masterKey) {
        await addActivityLog(
          'Modify File Content',
          'Mega Sync',
          `Modified file: ${previewFile.name} contents directly inline.`,
          masterKey
        );
      }

      setPreviewContent(markdownEditorContent);
      setIsEditingMarkdown(false);
      alert('File saved successfully!');
      fetchFiles();
    } catch (err) {
      alert('Failed to save file: ' + err);
    } finally {
      setSaveMarkdownLoading(false);
    }
  };

  // Share link generator
  const handleGenerateShareLink = (file: MegaFile) => {
    setShareFile(file);
    const mockHash = Math.random().toString(36).substring(2, 15);
    setShareLink(`${window.location.origin}/vault/share/${mockHash}`);
  };

  // Drag and Drop files upload queue
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const filesToQueue: { file: globalThis.File; targetPath: string }[] = [];
      
      const traverseEntry = async (entry: any, relativePath: string) => {
        if (entry.isFile) {
          const file = await new Promise<globalThis.File>((resolve, reject) => entry.file(resolve, reject));
          filesToQueue.push({ file, targetPath: relativePath });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const readEntries = async () => {
            const entries = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
            if (entries.length > 0) {
              for (const child of entries) {
                await traverseEntry(child, `${relativePath}/${entry.name}`);
              }
              await readEntries();
            }
          };
          await readEntries();
        }
      };

      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) {
          await traverseEntry(entry, currentFolder);
        }
      }

      if (filesToQueue.length > 0) {
        processUploadQueue(filesToQueue);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadQueue(
        Array.from(e.dataTransfer.files).map(file => ({ file, targetPath: currentFolder }))
      );
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadQueue(
        Array.from(e.target.files).map(file => ({ file, targetPath: currentFolder }))
      );
    }
  };

  // Process and check for ZIP extraction
  const processUploadQueue = async (items: { file: globalThis.File; targetPath: string }[]) => {
    const finalItems: { file: globalThis.File; targetPath: string }[] = [];

    for (const item of items) {
      if (item.file.name.toLowerCase().endsWith('.zip')) {
        const confirmExtract = confirm(`You uploaded a ZIP file "${item.file.name}". Extract files client-side and upload them recursively?`);
        if (confirmExtract) {
          try {
            const zip = new JSZip();
            const loadedZip = await zip.loadAsync(item.file);
            for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
              if (!zipEntry.dir) {
                const blob = await zipEntry.async('blob');
                const extractedFile = new globalThis.File([blob], zipEntry.name.split('/').pop() || zipEntry.name, {
                  type: blob.type
                });
                
                const parts = relativePath.split('/');
                parts.pop();
                const subPath = parts.length > 0 ? '/' + parts.join('/') : '';
                
                finalItems.push({ file: extractedFile, targetPath: `${item.targetPath}${subPath}` });
              }
            }
          } catch (err) {
            console.error('ZIP extraction failed', err);
            alert(`Failed to extract ZIP "${item.file.name}": ${err}`);
          }
          continue;
        }
      }
      finalItems.push(item);
    }

    if (finalItems.length === 0) return;

    const tasks: UploadTask[] = finalItems.map(item => ({
      id: Math.random().toString(36).substring(7),
      name: item.file.name,
      size: item.file.size,
      progress: 0,
      speed: '0 KB/s',
      eta: 'Calculating...',
      status: 'queued'
    }));

    setUploadQueue(prev => [...tasks, ...prev]);

    finalItems.forEach((item, index) => {
      setTimeout(() => {
        simulateTaskUpload(tasks[index].id, item.file, item.targetPath);
      }, index * 1500);
    });
  };

  const simulateTaskUpload = async (taskId: string, rawFile: globalThis.File, targetPath: string) => {
    let progress = 0;
    
    setUploadQueue(prev => 
      prev.map(t => t.id === taskId ? { ...t, status: 'uploading' } : t)
    );

    const interval = setInterval(async () => {
      progress += 20;
      const speedRandom = (Math.random() * 3 + 2).toFixed(1); // 2-5 MB/s
      const remainingBytes = rawFile.size * (1 - progress / 100);
      const speedBytes = parseFloat(speedRandom) * 1024 * 1024;
      const etaSeconds = Math.ceil(remainingBytes / speedBytes);

      setUploadQueue(prev =>
        prev.map(t => t.id === taskId ? {
          ...t,
          progress,
          speed: `${speedRandom} MB/s`,
          eta: etaSeconds > 0 ? `${etaSeconds}s` : 'Done'
        } : t)
      );

      if (progress >= 100) {
        clearInterval(interval);
        
        // Finalize task status in queue
        setUploadQueue(prev =>
          prev.map(t => t.id === taskId ? { ...t, status: 'completed', progress: 100 } : t)
        );

        // Upload to simulated / real storage
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            const rawResult = reader.result as string;
            const base64Content = rawResult.split(',')[1] || rawResult;

            if (token) {
              await axiosStatic.post('/api/files/upload', {
                name: rawFile.name,
                contentBase64: base64Content
              }, {
                headers: getMegaHeaders()
              });

              // Save target path in local storage map
              try {
                const stored = localStorage.getItem('mega_file_paths') || '{}';
                const pathsMap = JSON.parse(stored);
                pathsMap[rawFile.name] = targetPath;
                localStorage.setItem('mega_file_paths', JSON.stringify(pathsMap));
              } catch (e) {
                console.error(e);
              }

              if (masterKey) {
                await addActivityLog(
                  'Upload Synchronized',
                  'Mega Sync',
                  `Uploaded file: ${rawFile.name} inside folder: ${targetPath}`,
                  masterKey
                );
              }
              fetchFiles();
            }
          };
          reader.readAsDataURL(rawFile);
        } catch (err) {
          console.error('Failed to sync to Mega API:', err);
        }
      }
    }, 400);
  };

  // Rollback file version simulation
  const handleRollback = (file: MegaFile, version: number) => {
    alert(`Rolling back ${file.name} to Version ${version} successfully!`);
    setHistoryFile(null);
  };

  // Delete item
  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;
    try {
      if (token) {
        await axiosStatic.post('/api/files/delete', { name: filename }, { headers: getMegaHeaders() });
        if (masterKey) {
          await addActivityLog('Delete Asset', 'Mega Sync', `Deleted: ${filename}`, masterKey);
        }
      }
      setFiles(prev => prev.filter(f => f.name !== filename));
    } catch {
      alert('Delete request failed.');
    }
  };

  // Download selected files packaged together in a ZIP client-side
  const handleDownloadSelectedAsZip = async () => {
    if (selectedFileIds.length === 0) return;
    setLoading(true);
    try {
      const zip = new JSZip();
      for (const fileId of selectedFileIds) {
        const file = files.find(f => f.id === fileId);
        if (file && !file.directory) {
          try {
            const res = await axiosStatic.get(getDownloadUrl(file.name), {
              responseType: 'blob'
            });
            zip.file(file.name, res.data);
          } catch (e) {
            console.error('Failed to add file to ZIP:', file.name, e);
          }
        }
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `bulk_download_${Date.now()}.zip`;
      link.click();
      setSelectedFileIds([]);
    } catch (err) {
      alert('Failed to pack zip download: ' + err);
    } finally {
      setLoading(false);
    }
  };

  // Bulk deletion
  const handleBulkDelete = async () => {
    if (selectedFileIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedFileIds.length} selected items?`)) return;
    setLoading(true);
    try {
      for (const fileId of selectedFileIds) {
        const file = files.find(f => f.id === fileId);
        if (file && !file.directory) {
          try {
            await axiosStatic.post('/api/files/delete', { name: file.name }, { headers: getMegaHeaders() });
          } catch (e) {
            console.error('Failed to delete file in bulk:', file.name, e);
          }
        }
      }
      alert('Bulk delete completed.');
      setSelectedFileIds([]);
      fetchFiles();
    } catch (err) {
      alert('Bulk delete failed: ' + err);
    } finally {
      setLoading(false);
    }
  };

  // Bulk move/migration into directories
  const handleBulkMove = (destinationFolder: string) => {
    if (selectedFileIds.length === 0) return;
    try {
      const stored = localStorage.getItem('mega_file_paths') || '{}';
      const pathsMap = JSON.parse(stored);
      
      for (const fileId of selectedFileIds) {
        const file = files.find(f => f.id === fileId);
        if (file && !file.directory) {
          pathsMap[file.name] = destinationFolder;
        }
      }
      localStorage.setItem('mega_file_paths', JSON.stringify(pathsMap));
      alert(`Moved selected files to "${destinationFolder}"`);
      setSelectedFileIds([]);
      fetchFiles();
    } catch (e) {
      console.error('Failed to move files in bulk', e);
    }
  };

  // Format Helpers
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Filters calculation
  const filteredFiles = files.filter(f => {
    const isInCurrentFolder = f.path === currentFolder || (currentFolder === 'root' && f.path === 'root');
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag === 'All' || f.tags?.includes(selectedTag);
    return isInCurrentFolder && matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 select-none">
      
      {/* Dynamic Header & Storage Progress */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
        <div className="md:col-span-2">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <HardDrive className="text-indigo-400" /> Mega Cloud Sync Vault
          </h2>
          <p className="text-xs text-slate-400 mt-1.5">
            Admin files directory. Connects directly to MEGA storage.
          </p>
        </div>

        {/* Storage Gauge */}
        <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl space-y-2">
          <div className="flex justify-between text-[10px] text-slate-400 uppercase font-mono">
            <span>Storage Allocation</span>
            <span>{Math.round((usedStorage / storageLimit) * 100)}% Used</span>
          </div>
          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(usedStorage / storageLimit) * 100}%` }} />
          </div>
          <p className="text-[9px] text-slate-555 text-right font-mono">
            {formatBytes(usedStorage)} of {formatBytes(storageLimit)}
          </p>
        </div>
      </div>

      {connectionError && (
        <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-2xl text-xs text-red-400 font-semibold font-mono flex justify-between items-center shadow-sm">
          <span>&gt; {connectionError}</span>
          <button onClick={() => setConnectionError(null)} className="text-red-400 hover:text-red-300 font-bold font-sans">✕</button>
        </div>
      )}

      {/* Shared Asset Manager View Toggle */}
      <div className="flex border-b border-slate-800/80 mb-2 gap-4">
        <button
          onClick={() => setIsSharedView(false)}
          className={`pb-3 text-xs font-bold border-b-2 transition ${
            !isSharedView ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          My Personal Files
        </button>
        <button
          onClick={() => setIsSharedView(true)}
          className={`pb-3 text-xs font-bold border-b-2 transition ${
            isSharedView ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Shared Brand Assets (Logos, Banners, Guidelines)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Upload Queue, Tags, Heatmap */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* File Upload Zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition ${
              dragActive ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-800 hover:border-slate-700 bg-slate-950/20'
            }`}
          >
            <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" multiple />
            <UploadCloud className="text-indigo-400 mb-2 animate-bounce" size={26} />
            <p className="text-xs font-semibold text-slate-200">Drag & Drop Campaign Media</p>
            <p className="text-[10px] text-slate-500 mt-1">supports bulk select and folder drops</p>
          </div>

          {/* Active Upload Tasks list */}
          {uploadQueue.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Upload Progress queue</span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {uploadQueue.map(task => (
                  <div key={task.id} className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 text-[10px]">
                    <div className="flex justify-between items-center text-slate-350">
                      <span className="truncate max-w-[150px] font-semibold">{task.name}</span>
                      <span className="font-mono text-indigo-400">{task.progress}%</span>
                    </div>
                    {task.status === 'uploading' && (
                      <div className="mt-2 space-y-1">
                        <div className="w-full bg-slate-900 h-1 rounded overflow-hidden">
                          <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${task.progress}%` }} />
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                          <span>Speed: {task.speed}</span>
                          <span>ETA: {task.eta}</span>
                        </div>
                      </div>
                    )}
                    {task.status === 'completed' && (
                      <span className="text-[8px] text-emerald-400 flex items-center gap-1 mt-1 font-bold">
                        <CheckCircle size={10} /> Upload Completed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Directory Filter Tags */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono flex items-center gap-1"><Filter size={12} /> Tags Categories</span>
            <div className="flex flex-wrap gap-1">
              {['All', 'Image', 'Config', 'System', 'Backup', 'Zip'].map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition ${
                    selectedTag === tag ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-850'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side: Explorer view */}
        <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-[450px]">
          
          {/* Path Header / Breadcrumbs */}
          <div className="p-4 border-b border-slate-850 flex flex-wrap justify-between items-center bg-slate-900/30 gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              {breadcrumbs.map((crumb, idx) => (
                <div key={idx} className="flex items-center text-slate-400 font-semibold font-mono">
                  {idx > 0 && <ChevronRight size={12} className="mx-1 text-slate-600" />}
                  <span onClick={() => navigateBreadcrumb(idx)} className="hover:text-white cursor-pointer transition">
                    {crumb}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setShowFolderModal(true)} 
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <FolderPlus size={13} /> New Folder
              </button>
              <button onClick={fetchFiles} disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg text-xs font-semibold">
                {loading ? 'Refreshing...' : 'Sync Now'}
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-slate-850 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 flex-1">
              <Search className="text-slate-550 shrink-0" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search current directory..."
                className="bg-transparent text-xs text-white outline-none w-full font-mono"
              />
            </div>
            {filteredFiles.length > 0 && (
              <label className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filteredFiles.every(f => selectedFileIds.includes(f.id))}
                  onChange={handleSelectAllToggle}
                  className="w-3 h-3 rounded border-slate-800 bg-slate-950 accent-indigo-500 cursor-pointer"
                />
                <span>Select All</span>
              </label>
            )}
          </div>

          {/* Directory listings */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900">
            {filteredFiles.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-20">No matching assets found in directory.</p>
            ) : (
              filteredFiles.map(file => (
                <div key={file.id} className="p-3.5 hover:bg-slate-900/20 flex justify-between items-center transition">
                  
                  {/* Left Meta info */}
                  <div onClick={() => handleItemClick(file)} className="flex items-center space-x-3 min-w-0 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(file.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelectFile(file.id)}
                      className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-950 accent-indigo-500 cursor-pointer mr-1"
                    />
                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center border border-slate-850 group-hover:scale-105 transition-transform">
                      {file.directory ? (
                        <Folder className="text-yellow-500 fill-yellow-500/20" size={16} />
                      ) : (
                        <File className="text-indigo-400" size={16} />
                      )}
                    </div>
                    
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors truncate pr-2 select-text">{file.name}</p>
                      <div className="flex gap-2 text-[9px] text-slate-550 mt-1 font-mono items-center">
                        <span>{file.directory ? 'Folder' : formatBytes(file.size)}</span>
                        <span>•</span>
                        <span>v{file.version}</span>
                        <span>•</span>
                        <span>{file.lastModified}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  {!file.directory && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button 
                        onClick={() => handlePreview(file)}
                        className="p-1.5 hover:bg-slate-900 border border-transparent hover:border-slate-850 rounded text-slate-400 hover:text-slate-250 transition" 
                        title="Preview Asset"
                      >
                        <Eye size={12} />
                      </button>
                      <button 
                        onClick={() => handleGenerateShareLink(file)}
                        className="p-1.5 hover:bg-slate-900 border border-transparent hover:border-slate-850 rounded text-slate-400 hover:text-slate-250 transition" 
                        title="Generate Share Link"
                      >
                        <Share2 size={12} />
                      </button>
                      <button 
                        onClick={() => setHistoryFile(file)}
                        className="p-1.5 hover:bg-slate-900 border border-transparent hover:border-slate-850 rounded text-slate-400 hover:text-slate-250 transition" 
                        title="Version History"
                      >
                        <History size={12} />
                      </button>
                      <button 
                        onClick={() => handleDelete(file.name)}
                        className="p-1.5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded text-slate-500 hover:text-red-400 transition" 
                        title="Wipe Asset"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}

                </div>
              ))
            )}
          </div>

          {/* Floating Action Bar */}
          {selectedFileIds.length > 0 && (
            <div className="p-3.5 bg-slate-900 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3.5 transition-all">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono">
                  {selectedFileIds.length} item{selectedFileIds.length > 1 ? 's' : ''} selected
                </span>
                <button 
                  onClick={() => setSelectedFileIds([])}
                  className="text-[9px] hover:text-white text-slate-500 font-semibold uppercase tracking-wider transition"
                >
                  Clear Selection
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadSelectedAsZip}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition"
                >
                  Download ZIP
                </button>
                <div className="relative group">
                  <button
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    Move To...
                  </button>
                  <div className="absolute right-0 bottom-full mb-1 w-40 bg-slate-950 border border-slate-800 rounded-lg shadow-xl hidden group-hover:block z-20 max-h-48 overflow-y-auto">
                    <div className="p-1">
                      <button
                        onClick={() => handleBulkMove('root')}
                        className="w-full text-left px-2 py-1.5 hover:bg-indigo-600 hover:text-white rounded text-[10px] font-mono text-slate-355 truncate transition"
                      >
                        root
                      </button>
                      {files
                        .filter(f => f.directory)
                        .map(f => {
                          const folderPath = `${f.path}/${f.name}`.replace('root/', '');
                          return (
                            <button
                              key={f.id}
                              onClick={() => handleBulkMove(folderPath)}
                              className="w-full text-left px-2 py-1.5 hover:bg-indigo-600 hover:text-white rounded text-[10px] font-mono text-slate-355 truncate transition"
                            >
                              {f.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleBulkDelete}
                  className="bg-red-950/40 hover:bg-red-900/40 border border-red-900/30 hover:border-red-900/60 text-red-400 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition"
                >
                  Delete Selected
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Folder creation */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-350">Create New Folder</h3>
              <button onClick={() => setShowFolderModal(false)} className="text-slate-500 hover:text-white"><X size={15} /></button>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="e.g. ad-visuals"
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
            />
            <button onClick={handleCreateFolder} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl text-xs uppercase tracking-wide">
              Create Folder
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Share Generator */}
      {shareFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-350 flex items-center gap-1.5"><Share2 size={13} /> Share Link</h3>
              <button onClick={() => setShareFile(null)} className="text-slate-500 hover:text-white"><X size={15} /></button>
            </div>
            <p className="text-[10px] text-slate-400">Generate a share link for: <span className="text-white font-semibold">{shareFile.name}</span></p>
            
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-mono">Link Expiration</label>
                <select value={linkExpiry} onChange={e => setLinkExpiry(e.target.value)} className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-[10px] text-white">
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                </select>
              </div>

              {shareLink && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 font-mono text-[9px] text-indigo-400 select-all break-all leading-normal">
                  {shareLink}
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-slate-800 pt-4">
              <button onClick={() => handleGenerateShareLink(shareFile)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl text-xs uppercase">
                Generate Link
              </button>
              <button onClick={() => setShareFile(null)} className="px-4 bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 rounded-xl text-xs uppercase font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Version History */}
      {historyFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-350 flex items-center gap-1.5"><History size={13} /> Version History</h3>
              <button onClick={() => setHistoryFile(null)} className="text-slate-500 hover:text-white"><X size={15} /></button>
            </div>
            <p className="text-[10px] text-slate-400">View and rollback edits for asset file: <span className="text-white font-semibold">{historyFile.name}</span></p>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {(historyFile.versions || []).map(ver => (
                <div key={ver.version} className="bg-slate-950 p-3 rounded-xl border border-slate-850 flex justify-between items-center text-xs">
                  <div className="font-mono">
                    <p className="text-[10px] font-bold text-slate-200">Version {ver.version} {ver.version === historyFile.version && <span className="text-[8px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-1 py-0.5 rounded ml-1 font-sans">Active</span>}</p>
                    <p className="text-[9px] text-slate-500 mt-1">{ver.date} • {formatBytes(ver.size)}</p>
                  </div>
                  {ver.version !== historyFile.version && (
                    <button 
                      onClick={() => handleRollback(historyFile, ver.version)}
                      className="px-2 py-1 bg-slate-900 hover:bg-indigo-600/10 border border-slate-800 hover:border-indigo-500/30 text-indigo-400 text-[9px] font-bold uppercase rounded transition"
                    >
                      Rollback
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => setHistoryFile(null)} className="w-full bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 font-bold py-2 rounded-xl text-xs uppercase">
              Close History
            </button>
          </div>
        </div>
      )}

      {/* MODAL: File Previewer */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-350">{previewFile.name}</span>
                <span className="text-[9px] bg-slate-950 border border-slate-850 px-2 py-0.5 rounded text-slate-500 font-mono">{formatBytes(previewFile.size)}</span>
              </div>
              <button onClick={() => setPreviewFile(null)} className="text-slate-500 hover:text-white"><X size={15} /></button>
            </div>

            {/* Content selector */}
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 min-h-60 max-h-96 overflow-y-auto">
              {!previewContent ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-650 italic text-xs py-20 gap-2">
                  <RefreshCw className="animate-spin text-indigo-400" size={16} />
                  <span>Loading asset...</span>
                </div>
              ) : previewContent === 'IMAGE_ASSET' ? (
                <div className="flex items-center justify-center p-2">
                  <div className="max-h-[350px] flex items-center justify-center border border-slate-900 rounded bg-slate-900/20 p-2 w-full">
                    <img src={getDownloadUrl(previewFile.name)} alt="Preview" className="object-contain max-h-80 rounded" />
                  </div>
                </div>
              ) : previewContent === 'VIDEO_STREAM' ? (
                <div className="space-y-3">
                  <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative flex items-center justify-center border border-slate-850">
                    <video src={getDownloadUrl(previewFile.name)} controls className="w-full h-full object-contain" />
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                    <span>Streaming live video from MEGA</span>
                    <span>1080p Streamed</span>
                  </div>
                </div>
              ) : isEditingMarkdown ? (
                <textarea
                  value={markdownEditorContent}
                  onChange={e => setMarkdownEditorContent(e.target.value)}
                  className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-indigo-500 resize-y"
                  placeholder="Enter markdown content..."
                />
              ) : (
                <pre className="text-[10px] font-mono text-slate-350 select-text leading-relaxed whitespace-pre-wrap">
                  {previewContent}
                </pre>
              )}
            </div>

            <div className="flex justify-between items-center border-t border-slate-800 pt-3">
              <div>
                {(previewFile.name.endsWith('.md') || previewFile.name.endsWith('.txt') || previewFile.name.endsWith('.json')) && (
                  !isEditingMarkdown ? (
                    <button
                      onClick={() => {
                        setIsEditingMarkdown(true);
                        setMarkdownEditorContent(previewContent || '');
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs uppercase transition"
                    >
                      Edit Inline
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveMarkdown}
                        disabled={saveMarkdownLoading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs uppercase flex items-center gap-1.5 transition"
                      >
                        {saveMarkdownLoading ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => setIsEditingMarkdown(false)}
                        className="px-4 py-2 bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 font-bold rounded-xl text-xs uppercase transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )
                )}
              </div>
              <button onClick={() => setPreviewFile(null)} className="px-5 bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 font-bold py-2 rounded-xl text-xs uppercase transition">
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
