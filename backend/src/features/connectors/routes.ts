import express, { Response } from 'express';
import axios from 'axios';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const router = express.Router();

// Execute stateless Dynamic API request
router.post('/execute', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { endpoint, method, headers, payload } = req.body;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint destination is required.' });
  }

  try {
    // Fire stateless dynamic REST request directly
    const response = await axios({
      url: endpoint,
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      data: payload,
      timeout: 15000
    });

    // Return results immediately without disk logs
    res.json({
      status: response.status,
      data: response.data
    });
  } catch (err: any) {
    res.status(err.response?.status || 500).json({
      error: err.message,
      data: err.response?.data
    });
  }
});

export default router;
