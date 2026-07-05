'use client';

import { create } from 'zustand';
import axios from 'axios';
import { deriveKey, generateKey, encodeBase64, decodeBase64, encrypt, decrypt } from '../crypto';
import { setItem, getItem, removeItem, clearVault } from '../storage';

// Register axios response interceptor to handle session expiration (401 errors)
if (typeof window !== 'undefined') {
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('role');
        localStorage.removeItem('user_email');
        sessionStorage.removeItem('session_master_key');
        await clearVault();
        useAuth.setState({ token: null, userId: null, role: null, masterKey: null });
        window.location.href = '/auth/login';
      }
      return Promise.reject(error);
    }
  );
}

interface AuthState {
  token: string | null;
  userId: string | null;
  role: string | null;
  masterKey: Uint8Array | null;
  initializing: boolean;
  login: (email: string, pass: string, code?: string) => Promise<{ requires2FA?: boolean } | void>;
  register: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  loadSession: () => Promise<void>;
  unlockVault: (email: string, pass: string) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  userId: null,
  role: null,
  masterKey: null,
  initializing: true,

  login: async (email, pass, code) => {
    // 1. Send authentication request to Express backend
    const res = await axios.post('/api/auth/login', { email, password: pass, code });
    if (res.data.requires2FA) {
      return { requires2FA: true };
    }
    const { token, userId, role, masterKey } = res.data;

    // 2. Derive master key client-side using user passphrase OR use backend-provided master key (for reset recovery)
    let derivedKey;
    if (masterKey) {
      derivedKey = decodeBase64(masterKey);
    } else {
      derivedKey = deriveKey(pass, email);
    }

    // 3. Cache session data
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
    localStorage.setItem('role', role || 'admin');
    localStorage.setItem('user_email', email);
    sessionStorage.setItem('session_master_key', encodeBase64(derivedKey));
    
    // Wrap masterKey with password-derived key for persistence across sessionStorage loss
    const localKey = deriveKey(pass, email);
    const { ciphertext: wrappedVault, nonce: wrappedNonce } = encrypt(encodeBase64(derivedKey), localKey);
    localStorage.setItem('master_key_vault', wrappedVault);
    localStorage.setItem('master_key_nonce', wrappedNonce);

    // Save key parameters client-encrypted in IndexedDB vault
    // To allow session persistence, we can protect a master key backup
    await setItem('derived_check', 'verified');

    set({ token, userId, role: role || 'admin', masterKey: derivedKey });
  },

  register: async (email, pass) => {
    // Generate a secure random master key once during registration
    const newMasterKey = generateKey();
    const masterKeyBase64 = encodeBase64(newMasterKey);

    const res = await axios.post('/api/auth/register', { 
      email, 
      password: pass, 
      masterKey: masterKeyBase64 
    });
    const { token, userId, role } = res.data;

    const derivedKey = newMasterKey;

    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
    localStorage.setItem('role', role || 'superadmin');
    localStorage.setItem('user_email', email);
    sessionStorage.setItem('session_master_key', encodeBase64(derivedKey));

    // Wrap masterKey with password-derived key for persistence across sessionStorage loss
    const localKey = deriveKey(pass, email);
    const { ciphertext: wrappedVault, nonce: wrappedNonce } = encrypt(encodeBase64(derivedKey), localKey);
    localStorage.setItem('master_key_vault', wrappedVault);
    localStorage.setItem('master_key_nonce', wrappedNonce);

    await setItem('derived_check', 'verified');

    set({ token, userId, role: role || 'superadmin', masterKey: derivedKey });
  },

  logout: async () => {
    try {
      const token = get().token;
      await axios.post('/api/auth/logout', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}

    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('role');
    localStorage.removeItem('user_email');
    localStorage.removeItem('master_key_vault');
    localStorage.removeItem('master_key_nonce');
    sessionStorage.removeItem('session_master_key');
    await clearVault();

    set({ token: null, userId: null, role: null, masterKey: null });
  },

  loadSession: async () => {
    set({ initializing: true });
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');
      const role = localStorage.getItem('role') || 'admin';
      const derivedCheck = await getItem('derived_check');
      const sessionMasterKey = sessionStorage.getItem('session_master_key');

      if (token && userId && derivedCheck === 'verified') {
        let masterKey: Uint8Array | null = null;
        if (sessionMasterKey) {
          try {
            masterKey = decodeBase64(sessionMasterKey);
          } catch (e) {
            console.error('Failed to decode session master key:', e);
          }
        }
        set({ token, userId, role, masterKey });
      }
    } catch {
      localStorage.clear();
      sessionStorage.clear();
      await clearVault();
    } finally {
      set({ initializing: false });
    }
  },

  unlockVault: (email, pass) => {
    const localKey = deriveKey(pass, email);
    const wrappedVault = localStorage.getItem('master_key_vault');
    const wrappedNonce = localStorage.getItem('master_key_nonce');
    let finalKey = localKey;
    if (wrappedVault && wrappedNonce) {
      try {
        const decryptedB64 = decrypt(wrappedVault, wrappedNonce, localKey);
        finalKey = decodeBase64(decryptedB64);
      } catch (err) {
        console.error('Failed to decrypt wrapped master key', err);
      }
    }
    sessionStorage.setItem('session_master_key', encodeBase64(finalKey));
    localStorage.setItem('user_email', email);
    set({ masterKey: finalKey });
  }
}));

