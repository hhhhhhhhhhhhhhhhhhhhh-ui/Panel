import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
// @ts-ignore
import { Storage } from 'megajs';
import jwt from 'jsonwebtoken';

const router = express.Router();

let megaStorage: any = null;
let currentCachedEmail = '';
let connectionPromise: Promise<any> | null = null;

export async function getMegaStorage(email?: string, password?: string): Promise<any> {
  const megaEmail = email || process.env.MEGA_EMAIL;
  const megaPassword = password || process.env.MEGA_PASSWORD;

  if (!megaEmail || !megaPassword) {
    throw new Error('Mega credentials are not configured.');
  }

  // Cache verification based on email
  if (megaStorage && currentCachedEmail === megaEmail) {
    return megaStorage;
  }

  // If a connection is already in progress for the same email, await it.
  if (connectionPromise && currentCachedEmail === megaEmail) {
    return connectionPromise;
  }

  megaStorage = null;
  currentCachedEmail = megaEmail;

  connectionPromise = new Promise(async (resolve, reject) => {
    try {
      const storage = new Storage({
        email: megaEmail,
        password: megaPassword,
        userAgent: 'ZeroKnowledgeAdminPanel/1.0'
      });

      // @ts-ignore
      storage.on('error', (err: any) => {
        console.error('MegaJS background error:', err);
      });

      await storage.ready;
      megaStorage = storage;
      resolve(storage);
    } catch (err) {
      reject(err);
    } finally {
      connectionPromise = null;
    }
  });

  return connectionPromise;
}

// Helper to determine the file prefix
const getFilePrefix = (req: any, decodedUserId?: string): string => {
  const isShared = req.headers['x-shared-assets'] === 'true' || req.query.shared === 'true';
  if (isShared) {
    return 'shared__';
  }
  const userId = decodedUserId || req.userId;
  return `${userId}__`;
};

// 1. List Files
router.get('/list', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const email = req.headers['x-mega-email'] as string;
    const password = req.headers['x-mega-password'] as string;
    const storage = await getMegaStorage(email, password);

    const files: any[] = [];
    const prefix = getFilePrefix(req);
    if (storage.root && storage.root.children) {
      storage.root.children.forEach((c: any) => {
        if (c.name.startsWith(prefix)) {
          files.push({
            name: c.name.substring(prefix.length),
            size: c.size || 0,
            id: c.downloadId || c.nodeId || Math.random().toString(36).substring(7),
            directory: c.directory || false
          });
        }
      });
    }
    res.json(files);
  } catch (err: any) {
    res.status(400).json({ error: `MEGA connection failed: ${err.message || err}` });
  }
});

// 2. Upload File
router.post('/upload', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, contentBase64 } = req.body;
    const email = req.headers['x-mega-email'] as string;
    const password = req.headers['x-mega-password'] as string;

    if (!name || !contentBase64) {
      return res.status(400).json({ error: 'Filename and base64 content are required' });
    }

    const storage = await getMegaStorage(email, password);
    const buffer = Buffer.from(contentBase64, 'base64');
    const prefix = getFilePrefix(req);
    const prefixedName = `${prefix}${name}`;

    await storage.upload({ name: prefixedName, size: buffer.length }, buffer).complete;
    res.json({ success: true, name });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Mega upload failed' });
  }
});

// 3. Delete File
router.post('/delete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = req.body;
    const email = req.headers['x-mega-email'] as string;
    const password = req.headers['x-mega-password'] as string;

    if (!name) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const storage = await getMegaStorage(email, password);
    const prefix = getFilePrefix(req);
    const prefixedName = `${prefix}${name}`;
    let fileToDelete: any = null;

    if (storage.root && storage.root.children) {
      fileToDelete = storage.root.children.find((c: any) => c.name === prefixedName);
    }

    if (!fileToDelete) {
      return res.status(404).json({ error: 'File not found inside Mega' });
    }

    await fileToDelete.delete();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Mega delete failed' });
  }
});

// 4. Download / Stream File
router.get('/download', async (req: express.Request, res: Response) => {
  try {
    const { name, email, password, token } = req.query;

    if (!name) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    // Verify token
    if (!token) {
      return res.status(401).json({ error: 'Session token required' });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(token as string, process.env.JWT_SECRET!);
    } catch {
      return res.status(401).json({ error: 'Invalid session token' });
    }

    const storage = await getMegaStorage(email as string, password as string);
    let fileToDownload: any = null;
    const prefix = getFilePrefix(req, decoded.userId);
    const prefixedName = `${prefix}${name}`;

    if (storage.root && storage.root.children) {
      fileToDownload = storage.root.children.find((c: any) => c.name === prefixedName);
    }

    if (!fileToDownload) {
      return res.status(404).json({ error: 'File not found inside Mega' });
    }

    // Set appropriate content type
    const filename = name as string;
    if (filename.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
    else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
    else if (filename.endsWith('.gif')) res.setHeader('Content-Type', 'image/gif');
    else if (filename.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
    else if (filename.endsWith('.webm')) res.setHeader('Content-Type', 'video/webm');
    else res.setHeader('Content-Type', 'application/octet-stream');

    const stream = fileToDownload.download();
    stream.pipe(res);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Download failed' });
  }
});

export default router;
