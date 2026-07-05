import express, { Request, Response } from 'express';
import { hashPassword, verifyPassword } from './hash.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db.js';
import redis from '../redis.js';
import { trackFailedAttempt, resetFailedAttempts } from './panic.js';
import speakeasy from 'speakeasy';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || 'dGhpcyBpcyBhIHNlY3VyZSAzMi1ieXRlIGtleWJhc2U2NA==', 'base64');

function encryptSecret(text: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as iv (12b) + tag (16b) + encrypted data
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptSecret(buffer: Buffer): string {
  const iv = buffer.slice(0, 12);
  const tag = buffer.slice(12, 28);
  const encrypted = buffer.slice(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

const router = express.Router();

// 0. Setup Status Check
router.get('/setup-status', async (req: Request, res: Response) => {
  try {
    const countResult = await pool.query('SELECT count(id) FROM users');
    const userCount = parseInt(countResult.rows[0].count, 10);
    res.json({ needsSetup: userCount === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch setup status' });
  }
});

// 1. User Registration
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, masterKey } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Hash email (never store email in plaintext)
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest();

    // Hash password securely (Argon2 or PBKDF2 fallback)
    const passwordHash = await hashPassword(password);

    // Check if user already exists
    const userCheck = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHash]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User registration failed.' });
    }

    // Extract username from email
    const username = email.split('@')[0];

    // Check if any users exist (First user becomes superadmin, otherwise signup disabled)
    const countResult = await pool.query('SELECT count(id) FROM users');
    const userCount = parseInt(countResult.rows[0].count, 10);
    
    if (userCount > 0) {
      return res.status(403).json({ error: 'Direct signup is disabled. Contact a Super Admin to create an account.' });
    }

    const role = 'superadmin';

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email_hash, password_hash, username, role, status, master_key) 
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
      [emailHash, passwordHash, username, role, masterKey || null]
    );

    const userId = result.rows[0].id;

    // Issue ephemeral token and cache session in Redis
    const sessionId = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign({ userId, sessionId, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    // Store in Redis with 1h TTL
    await redis.set(`session:${sessionId}:${userId}`, 'active', { EX: 3600 });

    res.json({ token, userId, role });
  } catch (err) {
    console.error('[REGISTRATION ERROR]', err);
    res.status(400).json({ error: 'Registration failed' });
  }
});

// 2. User Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest();

    // Verify if user is currently locked out or self-destruct is triggered
    const failedAttemptsKey = `failed_logins:${emailHash.toString('hex')}`;
    const currentAttempts = Number(await redis.get(failedAttemptsKey) || 0);
    if (currentAttempts >= 3) {
      return res.status(401).json({ error: 'Account locked. Emergency self-destruct activated.' });
    }

    const result = await pool.query(
      'SELECT id, password_hash, role, status, master_key, totp_secret_enc FROM users WHERE email_hash = $1',
      [emailHash]
    );

    if (result.rows.length === 0) {
      // Simulate verification latency to prevent timing attacks
      await hashPassword('dummy_password');
      await trackFailedAttempt(emailHash);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await verifyPassword(user.password_hash.toString(), password);

    if (!validPassword) {
      const locked = await trackFailedAttempt(emailHash);
      if (locked) {
        return res.status(401).json({ error: 'Account locked. Emergency self-destruct activated.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended by a Super Admin.' });
    }

    // Password is valid -> Check if 2FA/TOTP is enabled
    if (user.totp_secret_enc) {
      if (!code) {
        // Return indicator that 2FA code is required to complete authentication
        return res.json({ requires2FA: true, userId: user.id });
      }

      // Decrypt TOTP secret key
      const totpSecret = decryptSecret(Buffer.from(user.totp_secret_enc));

      // Verify the 2FA token
      const validTOTP = speakeasy.totp.verify({
        secret: totpSecret,
        encoding: 'base32',
        token: code,
        window: 1, // 30s clock drift tolerance
      });

      if (!validTOTP) {
        const locked = await trackFailedAttempt(emailHash);
        if (locked) {
          return res.status(401).json({ error: 'Account locked. Emergency self-destruct activated.' });
        }
        return res.status(401).json({ error: 'Invalid verification code' });
      }
    }

    // Success -> Reset failed login counter
    await resetFailedAttempts(emailHash);

    // 4. Update online status
    await pool.query('UPDATE users SET is_online = true, last_seen_at = NOW() WHERE id = $1', [user.id]);

    // Issue ephemeral token
    const sessionId = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign(
      { userId: user.id, sessionId, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    // Cache in Redis
    await redis.set(`session:${sessionId}:${user.id}`, 'active', { EX: 3600 });

    res.json({ token, userId: user.id, role: user.role, masterKey: user.master_key });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Login failed due to an internal error.' });
  }
});

// 3. User Logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.sendStatus(200);

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    if (decoded && decoded.userId && decoded.sessionId) {
      // Delete Redis session key
      await redis.del(`session:${decoded.sessionId}:${decoded.userId}`);
    }

    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(200); // Fail-safe: always return 200
  }
});

// 4. Setup 2FA (Generates TOTP Secret & Provisioning URL)
router.post('/2fa/setup', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `SecureConsole:${req.userId}`,
      issuer: 'ZeroKnowledgeOps'
    });

    res.json({
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to initiate 2FA setup' });
  }
});

// 5. Verify & Enable 2FA (Validates TOTP Code and saves encrypted key)
router.post('/2fa/verify', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, secret } = req.body;

    if (!code || !secret) {
      return res.status(400).json({ error: 'TOTP code and temporary secret are required' });
    }

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: 1 // Allow 1 step (30s) clock skew
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    // Symmetrically encrypt secret key
    const encryptedSecret = encryptSecret(secret);

    // Save encrypted TOTP key to Postgres
    await pool.query('UPDATE users SET totp_secret_enc = $1 WHERE id = $2', [encryptedSecret, req.userId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete 2FA verification' });
  }
});

export default router;
