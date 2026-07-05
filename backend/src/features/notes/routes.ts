import express, { Response } from 'express';
import crypto from 'crypto';
import pool from '../../db.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const router = express.Router();

// 1. Create or Update an encrypted note
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id, content_enc, nonce } = req.body;
  const userId = req.userId;

  if (!content_enc || !nonce) {
    return res.status(400).json({ error: 'Content and encryption parameters are required.' });
  }

  try {
    if (id) {
      // Update existing note
      const updateResult = await pool.query(
        `UPDATE encrypted_notes 
         SET content_enc = $1, nonce = $2, updated_at = NOW() 
         WHERE id = $3 AND user_id = $4 RETURNING id`,
        [Buffer.from(content_enc, 'base64'), Buffer.from(nonce, 'base64'), id, userId]
      );
      if (updateResult.rows.length === 0) {
        return res.status(404).json({ error: 'Note not found or unauthorized.' });
      }
      return res.json({ id });
    }

    // Insert new note
    const publicToken = crypto.randomBytes(32).toString('hex');
    const result = await pool.query(
      `INSERT INTO encrypted_notes (user_id, content_enc, nonce, public_token)
       VALUES ($1, $2, $3, $4) RETURNING id, public_token`,
      [userId, Buffer.from(content_enc, 'base64'), Buffer.from(nonce, 'base64'), publicToken]
    );

    res.json({
      id: result.rows[0].id,
      publicToken: result.rows[0].public_token,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save encrypted note.' });
  }
});

// 2. Get all encrypted notes for authenticated user
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId;

  try {
    const poolRes = await pool.query(
      `SELECT id, content_enc, nonce, public_token, created_at, updated_at
       FROM encrypted_notes WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const notes = poolRes.rows.map((row) => ({
      id: row.id,
      content_enc: row.content_enc.toString('base64'),
      nonce: row.nonce.toString('base64'),
      publicToken: row.public_token,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notes.' });
  }
});

// 3. Delete an encrypted note
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const deleteResult = await pool.query(
      `DELETE FROM encrypted_notes WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found or unauthorized.' });
    }

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note.' });
  }
});

// 4. Get specific note by Public Token (Public Endpoint - Zero-Knowledge share)
router.get('/share/:publicToken', async (req, res) => {
  const { publicToken } = req.params;

  try {
    const result = await pool.query(
      `SELECT content_enc, nonce FROM encrypted_notes WHERE public_token = $1`,
      [publicToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shared note not found.' });
    }

    const row = result.rows[0];
    res.json({
      content_enc: row.content_enc.toString('base64'),
      nonce: row.nonce.toString('base64'),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve shared note.' });
  }
});

export default router;
