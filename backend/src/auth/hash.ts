import crypto from 'crypto';

let argon2: any = null;
import('argon2')
  .then((m) => {
    argon2 = m.default || m;
    console.log('Argon2 native library loaded successfully.');
  })
  .catch((e) => {
    console.warn('⚠️ Argon2 native library failed to load. Falling back to native PBKDF2 hashing.');
  });

/**
 * Hash password securely, using Argon2 if available, otherwise PBKDF2.
 */
export async function hashPassword(password: string): Promise<string> {
  if (argon2) {
    try {
      return await argon2.hash(password, {
        type: argon2.argon2i,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });
    } catch (e) {
      console.warn('Argon2 hashing failed, falling back to PBKDF2:', e);
    }
  }

  // Secure Fallback: PBKDF2 using SHA-512 with 100,000 iterations
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const keylen = 64;
  const digest = 'sha512';
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
  return `$pbkdf2$${digest}$${iterations}$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verify password against a stored hash. Supports both Argon2 and PBKDF2 hashes.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (hash.startsWith('$argon2')) {
    if (!argon2) {
      throw new Error('Cannot verify Argon2 hash: Argon2 native module is not loaded on this platform.');
    }
    return await argon2.verify(hash, password);
  }

  if (hash.startsWith('$pbkdf2$')) {
    const parts = hash.split('$');
    // Format: $pbkdf2$digest$iterations$salt$hashVal
    const [, , digest, iterationsStr, salt, hashVal] = parts;
    const iterations = parseInt(iterationsStr, 10);
    const keylen = hashVal.length / 2; // hex is 2 chars per byte
    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
    
    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(derivedKey.toString('hex'), 'hex'),
      Buffer.from(hashVal, 'hex')
    );
  }

  return false;
}
