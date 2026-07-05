import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import pool from '../../db.js';

const router = express.Router();

export interface ChatMessage {
  id: string;
  sender: string;
  text?: string;
  file?: {
    name: string;
    size: string;
    type: string;
    url: string;
  };
  timestamp: string;
}

// 1. Get List of Users for Direct Messaging
router.get('/users', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, username, avatar_url, is_online, last_seen_at, custom_status FROM users');
    const users = result.rows.map(u => ({ 
      id: u.id, 
      username: u.username,
      avatar_url: u.avatar_url,
      is_online: u.is_online,
      last_seen_at: u.last_seen_at,
      custom_status: u.custom_status || null
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 2. Get chat history
router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channel, receiverId } = req.query;
    let result;

    if (channel) {
      result = await pool.query('SELECT * FROM team_messages WHERE channel = $1 ORDER BY created_at ASC LIMIT 100', [channel]);
    } else if (receiverId) {
      result = await pool.query(
        'SELECT * FROM team_messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) ORDER BY created_at ASC LIMIT 100',
        [req.userId, receiverId]
      );
    } else {
      return res.status(400).json({ error: 'channel or receiverId required' });
    }

    // Format for frontend
    const messages = await Promise.all(result.rows.map(async (row) => {
      // Find sender name dynamically, fallback to anon
      let senderName = 'Unknown';
      try {
        const uRes = await pool.query('SELECT username FROM users WHERE id = $1', [row.sender_id]);
        if (uRes.rows.length > 0) senderName = uRes.rows[0].username || `User_${row.sender_id.substring(0, 4)}`;
      } catch(e) {}
      
      return {
        id: row.id,
        sender: senderName,
        sender_id: row.sender_id,
        text: row.text,
        file: row.file_payload,
        reply_to_id: row.reply_to_id,
        is_edited: row.is_edited,
        is_deleted: row.is_deleted,
        reactions: row.reactions || {},
        link_preview: row.link_preview,
        is_pinned: row.is_pinned || false,
        timestamp: row.created_at
      };
    }));

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// 3. Post message via API
router.post('/send', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { text, file, channel, receiverId, reply_to_id } = req.body;
    
    // Minimal link preview (Regex to find URL)
    let link_preview = null;
    if (text) {
      const urlMatch = text.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        link_preview = { url: urlMatch[0], title: 'Link Preview', description: 'Click to open link.' };
      }
    }

    const result = await pool.query(
      'INSERT INTO team_messages (sender_id, receiver_id, channel, text, file_payload, reply_to_id, link_preview) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at',
      [req.userId, receiverId || null, channel || null, text, typeof file === 'string' ? JSON.parse(file) : file, reply_to_id || null, link_preview]
    );

    const row = result.rows[0];

    // Fetch sender username
    let senderName = 'Unknown';
    const uRes = await pool.query('SELECT username, avatar_url FROM users WHERE id = $1', [req.userId]);
    let avatar_url = null;
    if (uRes.rows.length > 0) {
      senderName = uRes.rows[0].username || `User_${req.userId?.substring(0, 4)}`;
      avatar_url = uRes.rows[0].avatar_url;
    }

    const newMsg = {
      id: row.id,
      sender: senderName,
      sender_id: req.userId,
      avatar_url,
      text,
      file,
      reply_to_id: reply_to_id || null,
      is_edited: false,
      is_deleted: false,
      reactions: {},
      link_preview,
      is_pinned: false,
      timestamp: row.created_at,
      channel,
      receiverId
    };

    res.json(newMsg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// 4. Edit Message
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { text } = req.body;
    const { id } = req.params;
    
    await pool.query(
      'UPDATE team_messages SET text = $1, is_edited = true WHERE id = $2 AND sender_id = $3',
      [text, id, req.userId]
    );
    res.json({ success: true, text });
  } catch (err) {
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// 5. Delete Message
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE team_messages SET text = null, file_payload = null, link_preview = null, is_deleted = true WHERE id = $1 AND sender_id = $2',
      [id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// 6. React to Message
router.post('/:id/react', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { emoji } = req.body;
    const { id } = req.params;
    
    // Fetch current reactions
    const result = await pool.query('SELECT reactions FROM team_messages WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    const reactions = result.rows[0].reactions || {};
    
    if (!reactions[emoji]) reactions[emoji] = [];
    
    const userIndex = reactions[emoji].indexOf(req.userId);
    if (userIndex > -1) {
      reactions[emoji].splice(userIndex, 1); // remove reaction
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(req.userId); // add reaction
    }
    
    await pool.query('UPDATE team_messages SET reactions = $1 WHERE id = $2', [reactions, id]);
    res.json({ success: true, reactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to react' });
  }
});

// 7. Update Avatar
router.post('/avatar', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { avatar_url } = req.body;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatar_url, req.userId]);
    res.json({ success: true, avatar_url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// 8. Search Messages
router.get('/search', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q, channel, receiverId } = req.query;
    if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Query required' });
    
    let result;
    if (channel) {
      result = await pool.query(
        "SELECT * FROM team_messages WHERE channel = $1 AND text ILIKE $2 AND is_deleted = false ORDER BY created_at DESC LIMIT 50",
        [channel, `%${q}%`]
      );
    } else if (receiverId) {
      result = await pool.query(
        "SELECT * FROM team_messages WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)) AND text ILIKE $3 AND is_deleted = false ORDER BY created_at DESC LIMIT 50",
        [req.userId, receiverId, `%${q}%`]
      );
    } else {
      result = await pool.query(
        "SELECT * FROM team_messages WHERE text ILIKE $1 AND is_deleted = false ORDER BY created_at DESC LIMIT 50",
        [`%${q}%`]
      );
    }

    const messages = await Promise.all(result.rows.map(async (row) => {
      let senderName = 'Unknown';
      let avatar_url = null;
      try {
        const uRes = await pool.query('SELECT username, avatar_url FROM users WHERE id = $1', [row.sender_id]);
        if (uRes.rows.length > 0) {
          senderName = uRes.rows[0].username || `User_${row.sender_id.substring(0, 4)}`;
          avatar_url = uRes.rows[0].avatar_url;
        }
      } catch(e) {}
      
      return {
        id: row.id,
        sender: senderName,
        sender_id: row.sender_id,
        avatar_url,
        text: row.text,
        file: row.file_payload,
        reply_to_id: row.reply_to_id,
        is_edited: row.is_edited,
        is_deleted: row.is_deleted,
        reactions: row.reactions || {},
        link_preview: row.link_preview,
        is_pinned: row.is_pinned || false,
        timestamp: row.created_at,
        channel: row.channel,
        receiverId: row.receiver_id
      };
    }));

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search' });
  }
});

// 9. Get Pinned Messages
router.get('/pins', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channel, receiverId } = req.query;
    let result;
    if (channel) {
      result = await pool.query('SELECT * FROM team_messages WHERE channel = $1 AND is_pinned = true AND is_deleted = false ORDER BY created_at DESC', [channel]);
    } else if (receiverId) {
      result = await pool.query(
        'SELECT * FROM team_messages WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)) AND is_pinned = true AND is_deleted = false ORDER BY created_at DESC',
        [req.userId, receiverId]
      );
    } else {
      return res.status(400).json({ error: 'channel or receiverId required' });
    }

    const messages = await Promise.all(result.rows.map(async (row) => {
      let senderName = 'Unknown';
      let avatar_url = null;
      try {
        const uRes = await pool.query('SELECT username, avatar_url FROM users WHERE id = $1', [row.sender_id]);
        if (uRes.rows.length > 0) {
          senderName = uRes.rows[0].username || `User_${row.sender_id.substring(0, 4)}`;
          avatar_url = uRes.rows[0].avatar_url;
        }
      } catch(e) {}
      
      return {
        id: row.id,
        sender: senderName,
        sender_id: row.sender_id,
        avatar_url,
        text: row.text,
        file: row.file_payload,
        reply_to_id: row.reply_to_id,
        is_edited: row.is_edited,
        is_deleted: row.is_deleted,
        reactions: row.reactions || {},
        link_preview: row.link_preview,
        is_pinned: true,
        timestamp: row.created_at,
        channel: row.channel,
        receiverId: row.receiver_id
      };
    }));

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
});

// 10. Toggle Pin Message
router.post('/:id/pin', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const msgResult = await pool.query('SELECT is_pinned FROM team_messages WHERE id = $1', [id]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    
    const nextPinState = !msgResult.rows[0].is_pinned;
    await pool.query('UPDATE team_messages SET is_pinned = $1 WHERE id = $2', [nextPinState, id]);
    res.json({ success: true, is_pinned: nextPinState });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// 11. Update Custom Status
router.post('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { custom_status } = req.body;
    await pool.query('UPDATE users SET custom_status = $1 WHERE id = $2', [custom_status || null, req.userId]);
    res.json({ success: true, custom_status: custom_status || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
