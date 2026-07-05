'use client';

import React, { useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAuth } from '../lib/hooks/useAuth';

export default function Diagnostics() {
  const [terminalOutput, setTerminalOutput] = useState('');
  const [socket, setSocket] = useState<any>(null);
  const [running, setRunning] = useState(false);
  
  const { token } = useAuth();

  // 1. Establish secure, logless diagnostics Socket connection
  useEffect(() => {
    if (!token) return;

    const socketUrl = window.location.origin.replace('3000', '3001');
    const socketClient = io(`${socketUrl}/diagnostics`, {
      auth: { token }
    });

    socketClient.on('connect', () => {
      setTerminalOutput('System tunnel established. Ready for diagnostic audits...\n');
    });

    socketClient.on('diagnostic_output', (data: string) => {
      setTerminalOutput((prev) => prev + data + '\n');
      setRunning(false);
    });

    socketClient.on('connect_error', (err) => {
      setTerminalOutput(`Tunnel Handshake Rejected: ${err.message}\n`);
      setRunning(false);
    });

    setSocket(socketClient);

    return () => {
      socketClient.disconnect();
    };
  }, [token]);

  // 2. Trigger diagnostic scan
  const triggerScan = () => {
    if (!socket || running) return;
    setRunning(true);
    setTerminalOutput((prev) => prev + 'Initiating in-memory diagnostic scan over Sockets...\n');
    socket.emit('run_diagnostics');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-lg shadow-sm select-none">
      
      {/* Title */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">VPS Diagnostics</h2>
          <p className="text-xs text-slate-400">Logless in-memory host stability audits executed directly in RAM.</p>
        </div>
        
        <button
          onClick={triggerScan}
          disabled={running || !socket}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-sm font-semibold rounded-lg transition"
        >
          {running ? 'Scanning...' : 'Run Diagnostics'}
        </button>
      </div>

      {/* Terminal Viewport */}
      <div className="p-4 bg-slate-950 border border-slate-850 rounded-lg h-80 overflow-y-auto">
        <pre className="text-xs text-emerald-500 font-mono whitespace-pre-wrap select-text selection:bg-slate-800 leading-relaxed">
          {terminalOutput}
        </pre>
      </div>

    </div>
  );
}
