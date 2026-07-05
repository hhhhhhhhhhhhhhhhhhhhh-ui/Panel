'use client';

import React, { useState } from 'react';

export default function PanicButton() {
  const [destructed, setDestructed] = useState(false);

  const triggerDestruct = async () => {
    if (!confirm('🚨 CRITICAL WARNING: Triggering Panic Self-Destruct will wipe all locally cached encryption keys, active MTProto sessions, and user settings permanently. Proceed?')) return;

    try {
      // 1. Delete all browser IndexedDB databases
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          window.indexedDB.deleteDatabase(db.name);
        }
      }

      // 2. Wipe browser Storage APIs
      localStorage.clear();
      sessionStorage.clear();

      // 3. Purge all operational cookies
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      setDestructed(true);
      alert("[PANIC COMPLETE] Browser vault successfully purged. Session severed.");
      window.location.href = '/auth/login';
    } catch (err) {
      alert('Self-destruct sequence encountered a local storage error.');
    }
  };

  return (
    <button
      onClick={triggerDestruct}
      disabled={destructed}
      title="Panic Wipe — clears all local keys & sessions"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
        color: '#ef4444',
      }}
    >
      {destructed ? '✓ Purged' : '⚠ Panic'}
    </button>
  );
}

