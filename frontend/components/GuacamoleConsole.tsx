'use client';

import React, { useState } from 'react';

export default function GuacamoleConsole() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-lg shadow-sm select-none">
      
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Apache Guacamole Gateway</h2>
          <p className="text-xs text-slate-400">Zero-log in-browser remote desktop, RDP, and SSH console gateway proxy.</p>
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center space-x-3 text-[10px] font-bold">
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-850 px-2.5 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-400">guacd daemon: ONLINE</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-850 px-2.5 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-400">guacamole client: ONLINE</span>
          </div>
        </div>
      </div>

      {/* Guacamole Remote Viewer IFrame Container */}
      <div className="bg-slate-950 border border-slate-855 rounded-lg overflow-hidden flex flex-col h-[600px] relative">
        {loading && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center space-y-3 z-10">
            <span className="text-3xl animate-spin">⚙️</span>
            <p className="text-xs font-semibold text-slate-350">Establishing Secure Container Tunnel...</p>
            <p className="text-[10px] text-slate-500">Connecting loopback proxy to Apache Guacamole server at port 8082...</p>
          </div>
        )}
        
        <iframe
          src="/guacamole/"
          onLoad={() => setLoading(false)}
          className="w-full h-full border-none flex-1"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>

    </div>
  );
}
