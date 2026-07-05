import express, { Response } from 'express';
import axios from 'axios';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import pool from '../../db.js';

const router = express.Router();

// Fetch active mail domains from mail.tm
router.get('/domains', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const domainsRes = await axios.get('https://api.mail.tm/domains', { timeout: 15000 });
    res.json(domainsRes.data);
  } catch (err: any) {
    res.json({
      'hydra:member': [
        { domain: 'secmail.pro' },
        { domain: 'mailto.plus' }
      ]
    });
  }
});

// Fetch saved accounts for user
router.get('/accounts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accounts = await pool.query('SELECT id, address, domain, token, created_at FROM temp_mail_accounts WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
    res.json(accounts.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch mail accounts', details: err.message });
  }
});

// Create a new disposable email address
router.post('/create-account', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { domain, username, password } = req.body;

  if (!domain || !username || !password) {
    return res.status(400).json({ error: 'Domain, username, and password parameters are required.' });
  }

  const address = `${username}@${domain}`;

  try {
    // 1. Create account on mail.tm
    await axios.post('https://api.mail.tm/accounts', {
      address,
      password
    }, { timeout: 15000 });

    // 2. Fetch token
    const tokenRes = await axios.post('https://api.mail.tm/token', {
      address,
      password
    }, { timeout: 15000 });

    const token = tokenRes.data.token;
    if (!token) throw new Error('Failed to retrieve token from mail.tm');

    // 3. Save to DB
    const insert = await pool.query(
      'INSERT INTO temp_mail_accounts (user_id, domain, address, password, token) VALUES ($1, $2, $3, $4, $5) RETURNING id, address, domain, token, created_at',
      [req.userId, domain, address, password, token]
    );

    res.json(insert.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// Delete account
router.delete('/accounts/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM temp_mail_accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Fetch mailbox messages
router.post('/messages', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { token: mailToken } = req.body;

  if (!mailToken) {
    return res.status(400).json({ error: 'Mailbox API authorization token is required.' });
  }

  try {
    const mailRes = await axios.get('https://api.mail.tm/messages', {
      headers: { Authorization: `Bearer ${mailToken}` },
      timeout: 15000
    });
    res.json(mailRes.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
