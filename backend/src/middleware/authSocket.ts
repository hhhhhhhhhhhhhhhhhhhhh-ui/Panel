import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import redis from '../redis.js';

export async function authMiddlewareSocket(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token || socket.handshake.headers['authorization']?.split(' ')[1];

  if (!token) {
    return next(new Error('Socket authentication failed. No token provided.'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    if (!decoded || !decoded.userId || !decoded.sessionId) {
      return next(new Error('Socket authentication failed. Invalid token properties.'));
    }

    const sessionActive = await redis.get(`session:${decoded.sessionId}:${decoded.userId}`);
    if (!sessionActive) {
      return next(new Error('Socket authentication failed. Ephemeral session expired.'));
    }

    // Attach decoded session parameters to socket state
    (socket as any).userId = decoded.userId;
    (socket as any).sessionId = decoded.sessionId;

    next();
  } catch (err) {
    next(new Error('Socket authentication failed. Handshake verification rejected.'));
  }
}
