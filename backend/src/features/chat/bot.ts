import pool from '../../db.js';

export async function broadcastSystemMessage(io: any, channel: string, text: string) {
  try {
    // We use a dummy UUID for the system bot
    const botId = '00000000-0000-0000-0000-000000000000';
    
    // Ensure bot user exists
    const botCheck = await pool.query('SELECT id FROM users WHERE id = $1', [botId]);
    if (botCheck.rows.length === 0) {
      // Create system bot user
      await pool.query(
        "INSERT INTO users (id, email_hash, password_hash, username) VALUES ($1, '\\x00', '\\x00', 'System Bot')",
        [botId]
      );
    }

    const result = await pool.query(
      'INSERT INTO team_messages (sender_id, channel, text) VALUES ($1, $2, $3) RETURNING id, created_at',
      [botId, channel, text]
    );

    const row = result.rows[0];

    const msg = {
      id: row.id,
      sender: 'System Bot',
      sender_id: botId,
      text,
      is_edited: false,
      is_deleted: false,
      reactions: {},
      timestamp: row.created_at,
      channel
    };

    io.emit('chat-message', msg);
  } catch (err) {
    console.error('Failed to broadcast system message:', err);
  }
}
