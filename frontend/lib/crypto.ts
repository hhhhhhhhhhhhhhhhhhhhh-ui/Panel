import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64, decodeUTF8, encodeUTF8 } from 'tweetnacl-util';

export { decodeBase64, encodeBase64, decodeUTF8, encodeUTF8 };

// 1. Generate a secure random 32-byte key
export const generateKey = (): Uint8Array => {
  return nacl.randomBytes(32);
};

// 2. Derive key from a passphrase (local master key verification)
export const deriveKey = (passphrase: string, salt: string = 'salt_param_zero_knowledge'): Uint8Array => {
  // Simple SHA-256 derivation wrapper for local key generation
  const hash = nacl.hash(decodeUTF8(passphrase + salt));
  return hash.slice(0, 32); // Use first 32 bytes as AES/secretbox key
};

// 3. Encrypt payload symmetrically
export const encrypt = (message: string, key: Uint8Array) => {
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.secretbox(
    decodeUTF8(message),
    nonce,
    key
  );
  
  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
};

// 4. Decrypt payload symmetrically
export const decrypt = (ciphertext: string, nonce: string, key: Uint8Array): string => {
  const decrypted = nacl.secretbox.open(
    decodeBase64(ciphertext),
    decodeBase64(nonce),
    key
  );

  if (!decrypted) throw new Error('Decryption failure. Invalid key parameters.');
  return encodeUTF8(decrypted);
};
