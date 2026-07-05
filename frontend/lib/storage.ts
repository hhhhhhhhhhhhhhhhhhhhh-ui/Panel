import localforage from 'localforage';
import { encrypt, decrypt } from './crypto';

localforage.config({
  name: 'secure_admin_cache',
  storeName: 'encrypted_vault'
});

export interface ActivityLog {
  id?: string;
  action: string;
  moduleName?: string;
  category?: string;
  details: string;
  timestamp: number;
}

export async function setItem(key: string, value: string, masterKey?: Uint8Array): Promise<void> {
  let finalValue = value;
  if (masterKey) {
    const { ciphertext: encrypted, nonce } = encrypt(value, masterKey);
    finalValue = JSON.stringify({ encrypted, nonce });
  }
  await localforage.setItem(key, finalValue);
}

export async function getItem(key: string, masterKey?: Uint8Array): Promise<string | null> {
  const value = await localforage.getItem<string>(key);
  if (!value) return null;
  if (masterKey) {
    try {
      const { encrypted, nonce } = JSON.parse(value);
      return await decrypt(encrypted, nonce, masterKey);
    } catch (err) {
      console.error('Failed to decrypt storage item', key);
      return null;
    }
  }
  return value;
}

export async function removeItem(key: string): Promise<void> {
  await localforage.removeItem(key);
}
export async function clearVault(): Promise<void> { await localforage.clear(); }

export async function addActivityLog(actionOrLog: any, category?: string, details?: string, masterKey?: Uint8Array) {
  let log: any;
  if (category !== undefined) {
    log = { 
      id: Math.random().toString(36).substring(7),
      action: actionOrLog, 
      moduleName: category, 
      details 
    };
  } else {
    log = actionOrLog;
    if (!log.id) log.id = Math.random().toString(36).substring(7);
    if (!log.moduleName && log.category) log.moduleName = log.category;
  }
  const logs = await getActivityLogs();
  logs.unshift({ ...log, timestamp: Date.now() });
  await localforage.setItem('activity_logs', JSON.stringify(logs.slice(0, 100)));
}

export async function getActivityLogs(masterKey?: Uint8Array): Promise<any[]> {
  const data = await localforage.getItem<string>('activity_logs');
  return data ? JSON.parse(data) : [];
}
