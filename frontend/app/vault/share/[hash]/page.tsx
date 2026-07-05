'use client';

import React, { useState } from 'react';
import { HardDrive, Download, ShieldCheck, Lock, FileText, CheckCircle } from 'lucide-react';

export default function SharedFilePage({ params }: { params: { hash: string } }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadCompleted, setDownloadCompleted] = useState(false);
  const [fileDetails] = useState({
    name: 'Shared_Campaign_Asset_Creative_Mockup.png',
    size: '1.2 MB',
    type: 'Image Asset (E2EE Shared)',
    expires: 'Expires in 24 hours'
  });

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      setDownloadCompleted(true);
      
      // Simulate dummy file download
      const element = document.createElement('a');
      const file = new Blob(['decrypted-secure-shared-file-data'], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = fileDetails.name;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-[#e2e8f0] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-[#111827] border border-[#1e293b] rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
        
        {/* Glow accent */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between border-b border-[#1f2937] pb-4">
          <div className="flex items-center gap-2">
            <HardDrive className="text-blue-500" size={20} />
            <span className="font-bold text-sm tracking-wide text-white font-mono">MEGA E2EE SHARE</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
            <ShieldCheck size={10} />
            <span>Zero Knowledge Verified</span>
          </div>
        </div>

        <div className="space-y-4 text-center py-4">
          <div className="w-16 h-16 bg-[#1f2937] rounded-xl flex items-center justify-center mx-auto border border-[#374151]">
            <FileText className="text-blue-400" size={32} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white truncate max-w-full" title={fileDetails.name}>
              {fileDetails.name}
            </h2>
            <p className="text-xs text-[#9ca3af] mt-1">Size: {fileDetails.size} • {fileDetails.type}</p>
          </div>
        </div>

        <div className="bg-[#0b0f19] border border-[#1f2937] rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between text-[#9ca3af]">
            <span>Share Token Hash</span>
            <span className="font-mono text-white text-[11px]">{params.hash.slice(0, 12)}...</span>
          </div>
          <div className="flex justify-between text-[#9ca3af]">
            <span>Access Guarantee</span>
            <span className="text-white">Encrypted Handshake</span>
          </div>
          <div className="flex justify-between text-[#9ca3af]">
            <span>Validity</span>
            <span className="text-rose-400 font-semibold">{fileDetails.expires}</span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {downloadCompleted ? (
            <div className="flex items-center justify-center gap-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 py-3 rounded-xl text-xs font-semibold">
              <CheckCircle size={15} />
              <span>Decrypted & Downloaded Successfully!</span>
            </div>
          ) : (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-3 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15 transition-all disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Decrypting Zero-Knowledge Payload...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Secure Decrypt & Download</span>
                </>
              )}
            </button>
          )}

          <div className="flex items-center justify-center gap-1 text-[9px] text-[#9ca3af]">
            <Lock size={9} />
            <span>Files are encrypted end-to-end on MEGA storage nodes.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
