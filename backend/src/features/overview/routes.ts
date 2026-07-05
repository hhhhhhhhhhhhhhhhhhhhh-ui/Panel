import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import pool, { isMockMode } from '../../db.js';

const router = express.Router();

router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let stats = {
      webhookLogs: 0,
      notes: 0,
      trackedAds: 0,
      databaseLatency: 0,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed,
    };

    const start = Date.now();
    if (!isMockMode) {
      const [notes, ads] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM encrypted_notes WHERE user_id = $1', [req.userId]),
        pool.query('SELECT COUNT(*) FROM tracked_ads WHERE user_id = $1', [req.userId]),
      ]);
      stats.webhookLogs = 0;
      stats.notes = parseInt(notes.rows[0].count, 10);
      stats.trackedAds = parseInt(ads.rows[0].count, 10);
      stats.databaseLatency = Date.now() - start;
    } else {
      stats.webhookLogs = 0;
      stats.notes = 0;
      stats.trackedAds = 0; 
      stats.databaseLatency = Date.now() - start;
    }

    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch overview stats', details: err.message });
  }
});

export default router;
