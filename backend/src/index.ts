import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import pool, { initDB } from './db.js';
import authRoutes from './auth/routes.js';
import notesRoutes from './features/notes/routes.js';
import connectorRoutes from './features/connectors/routes.js';
import fbMcpRoutes, { registerFbRealtimeStream } from './features/fb-mcp/routes.js';
import superadminRoutes, { setSuperAdminSocket } from './features/superadmin/routes.js';
import mailRoutes from './features/mail/routes.js';
import filesRoutes from './features/files/routes.js';
import backupRoutes from './features/backup/routes.js';
import strategyRoutes from './features/strategy/routes.js';
import adsTrackerRoutes from './features/ads-tracker/routes.js';
import { registerDiagnosticHandlers } from './features/diagnostics/sockets.js';
import overviewRoutes from './features/overview/routes.js';
import analyticsRoutes from './features/analytics/routes.js';
import projectsRoutes from './features/projects/routes.js';
import chatRoutes from './features/chat/routes.js';


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(cors());

// Set up socket injection
setSuperAdminSocket(io);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Zero-log: request loggers are omitted intentionally

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/connectors', connectorRoutes);
app.use('/api/fb-mcp', fbMcpRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/strategy', strategyRoutes);
app.use('/api/ads-tracker', adsTrackerRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/chat', chatRoutes);

// Register Live WebSockets streams
registerFbRealtimeStream(io);
registerDiagnosticHandlers(io);

io.on('connection', (socket) => {
  let connectedUserId: string | null = null;

  // Join personal room for DMs and set presence
  socket.on('join-user', async (userId) => {
    connectedUserId = userId;
    socket.join(`user:${userId}`);
    try {
      await pool.query('UPDATE users SET is_online = true WHERE id = $1', [userId]);
      io.emit('user-presence', { userId, is_online: true });
    } catch(e) {}
  });

  socket.on('chat-message', (msg) => {
    // If it's a DM, send to receiver and sender's other devices
    if (msg.receiverId) {
      io.to(`user:${msg.receiverId}`).emit('chat-message', msg);
      socket.broadcast.to(`user:${msg.sender_id}`).emit('chat-message', msg);
    } else if (msg.channel) {
      // Broadcast to everyone else
      socket.broadcast.emit('chat-message', msg);
    }
  });

  socket.on('chat-typing', (data) => {
    if (data.receiverId) {
      io.to(`user:${data.receiverId}`).emit('chat-typing', data);
    } else if (data.channel) {
      socket.broadcast.emit('chat-typing', data);
    }
  });

  socket.on('chat-read', async (data) => {
    // Update read receipts
    try {
      if (data.channel) {
        await pool.query(`INSERT INTO chat_reads (user_id, channel, last_read_message_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, channel, dm_user_id) DO UPDATE SET last_read_message_id = $3`, [connectedUserId, data.channel, data.messageId]);
      } else if (data.receiverId) {
        await pool.query(`INSERT INTO chat_reads (user_id, dm_user_id, last_read_message_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, channel, dm_user_id) DO UPDATE SET last_read_message_id = $3`, [connectedUserId, data.receiverId, data.messageId]);
        io.to(`user:${data.receiverId}`).emit('chat-read', { readerId: connectedUserId, messageId: data.messageId });
      }
    } catch(e) {}
  });

  socket.on('disconnect', async () => {
    if (connectedUserId) {
      try {
        await pool.query('UPDATE users SET is_online = false, last_seen_at = NOW() WHERE id = $1', [connectedUserId]);
        io.emit('user-presence', { userId: connectedUserId, is_online: false, last_seen_at: new Date().toISOString() });
      } catch(e) {}
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'admin-backend' });
});

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await initDB();
    console.log('PostgreSQL schemas verified successfully.');
    httpServer.listen(PORT, () => {
      console.log(`Stateless secure HTTP & WebSocket admin backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Core service initiation failed:', err);
    process.exit(1);
  }
})();
