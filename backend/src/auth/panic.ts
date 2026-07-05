import redis from '../redis.js';
import pool from '../db.js';

// Track failed logins per IP or Email Hash
export async function trackFailedAttempt(emailHash: Buffer): Promise<boolean> {
  const key = `failed_logins:${emailHash.toString('hex')}`;
  const attempts = await redis.incr(key);
  
  if (attempts === 1) {
    await redis.expire(key, 900); // 15-minute window lockout
  }

  if (attempts >= 3) {
    await triggerEmergencySelfDestruct(emailHash);
    return true; // Self-destruct activated
  }
  
  return false;
}

export async function triggerEmergencySelfDestruct(emailHash: Buffer) {
  try {
    // 1. Retrieve user associated with email hash
    const userRes = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHash]);
    if (userRes.rows.length === 0) return;
    const userId = userRes.rows[0].id;

    // 2. Terminate all active Redis sessions
    const sessionKeys = await redis.keys(`session:*:${userId}`);
    if (sessionKeys.length > 0) {
      await redis.del(sessionKeys);
    }

    // 3. Clear failed login attempts
    await redis.del(`failed_logins:${emailHash.toString('hex')}`);
    console.error(`[PANIC WARNING] Emergency self-destruct activated for User ${userId}. Redis sessions purged.`);
  } catch (err) {
    console.error('Self-destruct trigger failure:', err);
  }
}
export async function resetFailedAttempts(emailHash: Buffer) {
  const key = `failed_logins:${emailHash.toString('hex')}`;
  await redis.del(key);
}
