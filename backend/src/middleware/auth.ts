import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import redis from '../redis.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
  role?: string;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token = req.headers.authorization?.split(' ')[1];

  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No session token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    if (!decoded || !decoded.userId || !decoded.sessionId) {
      return res.status(401).json({ error: 'Access denied. Invalid session.' });
    }

    // Verify session is active in Redis (RAM-only check)
    const sessionActive = await redis.get(`session:${decoded.sessionId}:${decoded.userId}`);
    if (!sessionActive) {
      return res.status(401).json({ error: 'Access denied. Ephemeral session expired.' });
    }

    req.userId = decoded.userId;
    req.sessionId = decoded.sessionId;
    req.role = decoded.role || 'admin';
    
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Access denied. Invalid session.' });
  }
}

export async function superAdminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden. Super Admin access required.' });
  }
  next();
}
