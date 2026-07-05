# Quick-Start Guide: Build Your Admin Panel in 24 Hours

## Hour 1-2: Setup & Scaffolding

### Step 1: Create Project Structure
```bash
mkdir admin-panel
cd admin-panel

# Initialize Git
git init
git config user.email "you@example.com"
git config user.name "Admin Panel Dev"

# Create directories
mkdir backend frontend docs
mkdir -p backend/src/{auth,features,middleware}
mkdir -p frontend/{app,components,lib}
```

### Step 2: Backend Setup (Node.js + Express)

```bash
cd backend

# Initialize Node project
npm init -y

# Install core dependencies
npm install \
  express \
  postgres \
  redis \
  jsonwebtoken \
  argon2 \
  tweetnacl \
  axios \
  dotenv \
  cors \
  telegram \
  @anthropic-ai/sdk \
  @modelcontextprotocol/sdk

# Dev dependencies
npm install -D \
  nodemon \
  typescript \
  @types/express \
  @types/node \
  tsx

# Create TypeScript config
npx tsc --init

# Update package.json scripts
```

**package.json**:
```json
{
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### Step 3: Frontend Setup (Next.js)

```bash
cd ../frontend

# Create Next.js app
npx create-next-app@latest . --typescript --tailwind --eslint

# Install additional dependencies
npm install \
  tweetnacl \
  zustand \
  @tanstack/react-query \
  axios \
  socket.io-client \
  qrcode.react \
  speakeasy

cd ..
```

### Step 4: Docker Setup

**docker-compose.yml**:
```yaml
version: '3.9'

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: admin_panel
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: dev_password
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    command: redis-server
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://admin:dev_password@db:5432/admin_panel
      REDIS_URL: redis://redis:6379
    depends_on:
      - db
      - redis
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    volumes:
      - ./frontend:/app

volumes:
  pg_data:
```

---

## Hour 3-4: Core Backend (Auth Engine)

### Step 1: Environment Variables

**backend/.env**:
```
NODE_ENV=development
DATABASE_URL=postgresql://admin:dev_password@localhost:5432/admin_panel
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_change_in_production_long_random_string
PORT=3001
ENCRYPTION_KEY=base64_encoded_32_byte_key_generate_with_node_crypto
```

### Step 2: Database Connection

**backend/src/db.ts**:
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize tables
export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_hash BYTEA NOT NULL UNIQUE,
      password_hash BYTEA NOT NULL,
      totp_secret_enc BYTEA,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id UUID REFERENCES users(id),
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS encrypted_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      content_enc BYTEA NOT NULL,
      public_token VARCHAR(64) UNIQUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export default pool;
```

### Step 3: Authentication Routes

**backend/src/auth/routes.ts**:
```typescript
import express, { Request, Response } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db';

const router = express.Router();

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Hash email (never store plaintext)
    const emailHash = crypto.createHash('sha256').update(email).digest();

    // Hash password with Argon2
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2i,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (email_hash, password_hash) VALUES ($1, $2) RETURNING id',
      [emailHash, passwordHash]
    );

    const userId = result.rows[0].id;

    // Create session (in memory or Redis)
    const sessionId = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign({ userId, sessionId }, process.env.JWT_SECRET!);

    res.json({ token, userId });
  } catch (err) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const emailHash = crypto.createHash('sha256').update(email).digest();
    const result = await pool.query(
      'SELECT id, password_hash FROM users WHERE email_hash = $1',
      [emailHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await argon2.verify(user.password_hash, password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Issue token
    const sessionId = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign(
      { userId: user.id, sessionId },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    res.json({ token, userId: user.id });
  } catch (err) {
    res.status(400).json({ error: 'Login failed' });
  }
});

export default router;
```

### Step 4: Main Server File

**backend/src/index.ts**:
```typescript
import express from 'express';
import cors from 'cors';
import { initDB } from './db';
import authRoutes from './auth/routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// No logging middleware (intentionally)
// This is zero-log design

// Routes
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3001;

(async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
```

---

## Hour 5-6: Frontend (Next.js + React)

### Step 1: Encryption Utility

**frontend/lib/crypto.ts**:
```typescript
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

export const generateKey = () => nacl.randomBytes(32);
export const generateNonce = () => nacl.randomBytes(24);

export const encrypt = (message: string, key: Uint8Array) => {
  const nonce = generateNonce();
  const encrypted = nacl.secretbox(
    nacl.util.decodeUTF8(message),
    nonce,
    key
  );
  
  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
};

export const decrypt = (
  ciphertext: string,
  nonce: string,
  key: Uint8Array
) => {
  const decrypted = nacl.secretbox.open(
    decodeBase64(ciphertext),
    decodeBase64(nonce),
    key
  );

  if (!decrypted) throw new Error('Decryption failed');
  return nacl.util.encodeUTF8(decrypted);
};
```

### Step 2: Auth Context

**frontend/lib/hooks/useAuth.ts**:
```typescript
'use client';

import { create } from 'zustand';
import axios from 'axios';

interface AuthState {
  token: string | null;
  userId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  userId: typeof window !== 'undefined' ? localStorage.getItem('userId') : null,

  login: async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('userId', res.data.userId);
    set({ token: res.data.token, userId: res.data.userId });
  },

  register: async (email, password) => {
    const res = await axios.post('/api/auth/register', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('userId', res.data.userId);
    set({ token: res.data.token, userId: res.data.userId });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    set({ token: null, userId: null });
  },
}));
```

### Step 3: Login Page

**frontend/app/login/page.tsx**:
```typescript
'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      alert('Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-8">Admin Panel</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 text-white rounded border border-gray-700"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 text-white rounded border border-gray-700"
          />
          <button
            type="submit"
            className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Hour 7-8: Feature #1 - Encrypted Notes

### Backend Endpoint

**backend/src/features/notes/routes.ts**:
```typescript
import express from 'express';
import { v4 as uuid } from 'uuid';
import pool from '../../db';
import { authMiddleware } from '../../middleware/auth';

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const { content_enc, nonce } = req.body;
  const userId = (req as any).userId;

  const noteId = uuid();
  const publicToken = require('crypto').randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO encrypted_notes (id, user_id, content_enc, nonce, public_token)
     VALUES ($1, $2, $3, $4, $5)`,
    [noteId, userId, Buffer.from(content_enc), Buffer.from(nonce), publicToken]
  );

  res.json({ id: noteId, publicToken });
});

router.get('/:publicToken', async (req, res) => {
  const { publicToken } = req.params;

  const result = await pool.query(
    `SELECT content_enc, nonce FROM encrypted_notes WHERE public_token = $1`,
    [publicToken]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Note not found' });
  }

  const { content_enc, nonce } = result.rows[0];
  res.json({
    content_enc: content_enc.toString('base64'),
    nonce: nonce.toString('base64'),
  });
});

export default router;
```

### Frontend Component

**frontend/components/Notes.tsx**:
```typescript
'use client';

import { useState } from 'react';
import axios from 'axios';
import { encrypt } from '@/lib/crypto';
import { useAuth } from '@/lib/hooks/useAuth';

export default function Notes() {
  const [content, setContent] = useState('');
  const [shareLink, setShareLink] = useState('');
  const { token } = useAuth();

  const saveNote = async () => {
    const key = /* retrieve from IndexedDB or localStorage */;
    const encrypted = encrypt(content, key);

    const res = await axios.post(
      '/api/notes',
      encrypted,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const link = `${window.location.origin}/notes/${res.data.publicToken}`;
    setShareLink(link);
  };

  return (
    <div className="space-y-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your note..."
        className="w-full h-64 p-4 bg-gray-800 text-white rounded border border-gray-700"
      />
      <button
        onClick={saveNote}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Save & Share
      </button>
      {shareLink && (
        <div className="p-4 bg-gray-800 rounded">
          <p className="text-gray-400">Share link:</p>
          <code className="text-green-400">{shareLink}</code>
        </div>
      )}
    </div>
  );
}
```

---

## Hour 9-10: Feature #2 - Advanced Telegram MTProto Console & Claude AI

### Backend implementation (GramJS MTProto Client)

We establish user session login using GramJS. The user receives their OTP code directly via their personal Telegram app. The server acts as a stateless broker, returning the created session string (which the client immediately encrypts and stores in IndexedDB).

**backend/src/features/telegram/routes.ts**:
```typescript
import express from 'express';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import pool from '../../db';
import { authMiddleware } from '../../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY! });

// Keep active client instances in memory for routing OTP callbacks
const activeSessions: Record<string, { client: TelegramClient; phoneCodeHash: string; phone: string }> = {};

// 1. Request OTP Code
router.post('/request-code', authMiddleware, async (req, res) => {
  const { phone } = req.body;
  const userId = (req as any).userId;

  const client = new TelegramClient(
    new StringSession(""),
    Number(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH!,
    { connectionRetries: 5 }
  );

  await client.connect();

  const { phoneCodeHash } = await client.sendCode(
    { apiId: Number(process.env.TELEGRAM_API_ID), apiHash: process.env.TELEGRAM_API_HASH! },
    phone
  );

  // Cache instance temporarily in memory index
  activeSessions[userId] = { client, phoneCodeHash, phone };
  res.json({ status: 'code_sent' });
});

// 2. Complete Sign-In & Return Session Key
router.post('/sign-in', authMiddleware, async (req, res) => {
  const { code } = req.body;
  const userId = (req as any).userId;
  const sessionData = activeSessions[userId];

  if (!sessionData) {
    return res.status(400).json({ error: 'Session not found. Request code first.' });
  }

  const { client, phoneCodeHash, phone } = sessionData;

  try {
    await client.signIn({
      phoneNumber: phone,
      phoneCodeHash: phoneCodeHash,
      phoneCode: code,
      onError: (err) => { throw err; }
    });

    const sessionString = client.session.save() as unknown as string;
    delete activeSessions[userId];

    res.json({ session: sessionString }); // Client will client-side encrypt and save in IndexedDB
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Verification failed' });
  }
});

// 3. Fetch Divided Chats (Channels, DMs, Groups, Bots)
router.post('/chats', authMiddleware, async (req, res) => {
  const { decryptedSession } = req.body; // Sent decrypted from client memory

  const client = new TelegramClient(
    new StringSession(decryptedSession),
    Number(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH!,
    { connectionRetries: 3 }
  );

  await client.connect();
  const dialogs = await client.getDialogs({});

  const categorized = {
    dms: [] as any[],
    groups: [] as any[],
    channels: [] as any[],
    bots: [] as any[]
  };

  for (const dialog of dialogs) {
    const chat = dialog.entity as any;
    const item = {
      id: chat.id.toString(),
      title: chat.title || `${chat.firstName || ''} ${chat.lastName || ''}`.trim(),
      unreadCount: dialog.unreadCount,
      pinned: dialog.pinned,
      timestamp: dialog.date
    };

    if (chat.bot) {
      categorized.bots.push(item);
    } else if (chat.broadcast) {
      categorized.channels.push(item);
    } else if (chat.megagroup || chat.gigagroup || chat.className === 'Chat') {
      categorized.groups.push(item);
    } else {
      categorized.dms.push(item);
    }
  }

  res.json(categorized);
});

// 4. Claude-Powered Feed Summarizer
router.post('/summarize', authMiddleware, async (req, res) => {
  const { messages } = req.body; // Array of message text strings

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1000,
    system: "You are a secure, privacy-respecting operations manager. Summarize the provided chat transcript into key highlights, bulleted action items, and structural takeaways.",
    messages: [{ role: 'user', content: JSON.stringify(messages) }]
  });

  res.json({ summary: response.content[0] });
});

export default router;
```

---

## Hour 11-12: Feature #3 - Claude Ads MCP & Connectors

### AI-Agentic Facebook Ads MCP Orchestration

We implement a backend coordinator proxying queries to **Claude 3.5 Sonnet**. Claude evaluates metrics and scales campaigns by calling tools on our standalone **Facebook Ads MCP Server**. No Meta credentials reside in our database.

**backend/src/features/fb-mcp/agent.ts**:
```typescript
import express from 'express';
import pool from '../../db';
import { authMiddleware } from '../../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY! });
const MCP_SERVER_URL = process.env.FB_ADS_MCP_URL || 'http://localhost:8080'; // Internal MCP Server

// Define MCP Tool Metadata Schemas for Claude
const FB_ADS_TOOLS = [
  {
    name: "list_ad_accounts",
    description: "Get all ad accounts details associated with the current profile.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_campaign_analytics",
    description: "Fetch analytics details (Spend, Conversions, CTR, CPA) for a given campaign ID.",
    input_schema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"]
    }
  },
  {
    name: "update_budget",
    description: "Scale or adjust the budget of a specific target ad set.",
    input_schema: {
      type: "object",
      properties: {
        ad_set_id: { type: "string" },
        new_budget: { type: "number" }
      },
      required: ["ad_set_id", "new_budget"]
    }
  }
];

// Execute AI Scaling Decisions
router.post('/auto-scale', authMiddleware, async (req, res) => {
  const { campaignId, activeStrategy } = req.body;

  try {
    // 1. Initiate Claude Agent with tools and Strategy Parameters
    let message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      system: `You are an automated Facebook Ads Optimization Agent. You have access to tools via an MCP Server.
Your scaling strategy parameter is: "${activeStrategy}".
Analyze ad analytics using tool calls, decide on scaling adjustments, and deploy budget operations.`,
      messages: [
        { role: 'user', content: `Examine campaign ${campaignId} and scale it dynamically according to strategy.` }
      ],
      tools: FB_ADS_TOOLS
    });

    // 2. Loop to handle dynamic Tool Calls triggered by Claude
    while (message.stop_reason === 'tool_use') {
      const toolCalls = message.content.filter(c => c.type === 'tool_use');
      const toolResults: any[] = [];

      for (const call of toolCalls) {
        const { name, input, id } = call as any;

        // Proxy execution directly to Facebook Ads MCP server
        const mcpResponse = await axios.post(`${MCP_SERVER_URL}/tools/execute`, {
          tool_name: name,
          arguments: input
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: JSON.stringify(mcpResponse.data)
        });
      }

      // Feed results back to Claude conversation loop
      message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        system: `You are an automated Facebook Ads Optimization Agent. Strategy: "${activeStrategy}".`,
        messages: [
          { role: 'user', content: `Examine campaign ${campaignId} and scale it dynamically according to strategy.` },
          { role: 'assistant', content: message.content },
          { role: 'user', content: toolResults as any }
        ],
        tools: FB_ADS_TOOLS
      });
    }

    // Return the final summarization log to panel UI
    res.json({ outcome: message.content[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

### Frontend Implementation (Facebook Ads AI Dashboard)

A beautiful React component illustrating real-time data visualizers, CRUD actions (start, stop, delete campaigns), and single-click AI controllers.

**frontend/components/AdAutomator.tsx**:
```typescript
'use client';

import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface Campaign {
  id: string;
  name: string;
  budget: number;
  status: 'ACTIVE' | 'PAUSED';
  cpa: number;
  ctr: number;
  conversions: number;
  spend: number;
}

export default function AdAutomator() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<{ time: string; cpa: number; ctr: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLog, setAiLog] = useState('');

  // 1. Establish socket streaming for real-time tracking
  useEffect(() => {
    const socket = io('/fb-realtime');

    socket.on('metrics_update', (data: { campaigns: Campaign[]; history: any[] }) => {
      setCampaigns(data.campaigns);
      setMetricsHistory(data.history);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 2. CRUD: Toggle Start/Stop Ads
  const toggleStatus = async (id: string, currentStatus: 'ACTIVE' | 'PAUSED') => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await axios.post('/api/fb-mcp/status', { adId: id, status: nextStatus });
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: nextStatus } : c));
    } catch {
      alert('Failed to update status');
    }
  };

  // 3. CRUD: Delete campaign/ad
  const deleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This action is permanent.')) return;
    try {
      await axios.post('/api/fb-mcp/delete', { assetId: id, type: 'campaign' });
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch {
      alert('Failed to delete asset');
    }
  };

  // 4. Single-Click AI Actions
  const runSingleClickCreator = async () => {
    const desc = prompt("Enter your product description or landing page URL for AI Ad generation:");
    if (!desc) return;
    setLoading(true);
    setAiLog("Claude is analyzing product goals, parsing target audience, writing creative copy, and building campaigns...");
    try {
      const res = await axios.post('/api/fb-mcp/ai-create', { description: desc });
      setAiLog(`AI Campaign Created Successfully!\nOutcome:\n${JSON.stringify(res.data, null, 2)}`);
    } catch (err: any) {
      setAiLog(`AI Ad Creation Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runSingleClickScaler = async () => {
    setLoading(true);
    setAiLog("Claude is auditing campaigns, verifying CPA thresholds, and adjusting budgets...");
    try {
      const res = await axios.post('/api/fb-mcp/auto-scale', { activeStrategy: "CPA < $15 => scale 20%" });
      setAiLog(`AI Budget Scaling Triggered!\nLog:\n${res.data.outcome}`);
    } catch (err: any) {
      setAiLog(`AI Budget Scaling Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runSingleClickOptimizer = async () => {
    setLoading(true);
    setAiLog("Claude is monitoring demographic performance, analyzing audience conversions, and optimizing targeting...");
    try {
      const res = await axios.post('/api/fb-mcp/optimize-targets');
      setAiLog(`AI Targeting Optimized!\nLog:\n${res.data.log}`);
    } catch (err: any) {
      setAiLog(`AI Target Optimization Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Calculate Aggregates
  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
  const avgCpa = campaigns.length ? (campaigns.reduce((sum, c) => sum + c.cpa, 0) / campaigns.length).toFixed(2) : '0';
  const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);

  return (
    <div className="p-6 bg-slate-950 text-slate-100 min-h-screen space-y-6">
      
      {/* 1. Real-Time Minimalist Metrics Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg shadow-sm">
          <p className="text-slate-400 text-sm font-medium">Total Operational Spend</p>
          <p className="text-3xl font-bold mt-2 text-slate-100">${totalSpend.toLocaleString()}</p>
        </div>
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg shadow-sm">
          <p className="text-slate-400 text-sm font-medium">Average CPA (Cost/Acquisition)</p>
          <p className="text-3xl font-bold mt-2 text-slate-100">${avgCpa}</p>
        </div>
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg shadow-sm">
          <p className="text-slate-400 text-sm font-medium">Aggregated Conversions</p>
          <p className="text-3xl font-bold mt-2 text-emerald-500">{totalConversions.toLocaleString()}</p>
        </div>
      </div>

      {/* 2. Real-Time Graph Visualizer (Recharts) */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg">
        <h2 className="text-base font-semibold mb-4 text-slate-200">Real-Time Performance Analytics</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricsHistory}>
              <defs>
                <linearGradient id="colorCpa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#475569" fontSize={12} />
              <YAxis stroke="#475569" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} />
              <Area type="monotone" dataKey="cpa" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorCpa)" name="CPA ($)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Campaign CRUD Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-200">Active Facebook Campaigns</h2>
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-sm border border-slate-700 transition">
            + Manual Campaign
          </button>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <th className="p-4">Campaign Name</th>
              <th className="p-4">Daily Budget</th>
              <th className="p-4">CTR</th>
              <th className="p-4">CPA</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-slate-800/80 hover:bg-slate-950/40 transition">
                <td className="p-4 font-medium text-slate-100">{c.name}</td>
                <td className="p-4 text-slate-200 font-medium">${c.budget}/day</td>
                <td className="p-4 text-slate-200 font-medium">{c.ctr}%</td>
                <td className="p-4 text-slate-200 font-medium">${c.cpa}</td>
                <td className="p-4">
                  {/* Start / Stop Status Toggle Switch */}
                  <button
                    onClick={() => toggleStatus(c.id, c.status)}
                    className={`px-3 py-1 text-xs font-bold rounded border transition ${
                      c.status === 'ACTIVE'
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {c.status}
                  </button>
                </td>
                <td className="p-4 text-right space-x-2">
                  <button onClick={() => deleteCampaign(c.id)} className="px-3 py-1 bg-slate-950 hover:bg-red-950/40 border border-slate-850 hover:border-red-900/50 text-slate-400 hover:text-red-400 rounded-lg text-xs font-medium transition">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Single-Click AI Superpower Controls */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
        <h2 className="text-base font-semibold text-slate-200">Single-Click AI Operations</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={runSingleClickCreator}
            disabled={loading}
            className="p-5 bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-100 rounded-lg transition duration-200 flex flex-col items-center justify-center space-y-2"
          >
            <span className="text-base font-bold text-slate-200">Generate Campaign</span>
            <span className="text-xs text-slate-400">Auto-create campaigns in 1 click</span>
          </button>
          <button
            onClick={runSingleClickScaler}
            disabled={loading}
            className="p-5 bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-100 rounded-lg transition duration-200 flex flex-col items-center justify-center space-y-2"
          >
            <span className="text-base font-bold text-slate-200">Scale Budgets</span>
            <span className="text-xs text-slate-400">Scale budgets based on ROI</span>
          </button>
          <button
            onClick={runSingleClickOptimizer}
            disabled={loading}
            className="p-5 bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-100 rounded-lg transition duration-200 flex flex-col items-center justify-center space-y-2"
          >
            <span className="text-base font-bold text-slate-200">Optimize Targeting</span>
            <span className="text-xs text-slate-400">Audit & patch target audience</span>
          </button>
        </div>

        {/* AI Action Logs */}
        {aiLog && (
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
            <p className="text-slate-400 text-xs font-semibold mb-2">Claude Execution logs:</p>
            <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">{aiLog}</pre>
          </div>
        )}
      </div>

    </div>
  );
}
```

---

### Dynamic Custom API Connector Router


Enables dynamic integration of other services direct from the UI. Endpoints/keys are client-side decrypted in temporary backend memory, proxy-executed, and immediately dropped from memory without disk logs.

**backend/src/features/connectors/routes.ts**:
```typescript
import express from 'express';
import axios from 'axios';
import { authMiddleware } from '../../middleware/auth';

const router = express.Router();

router.post('/execute', authMiddleware, async (req, res) => {
  const { endpoint, method, headers, payload } = req.body; // Decrypted on client, sent over TLS

  try {
    const apiResponse = await axios({
      url: endpoint,
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      data: payload
    });

    res.json({
      status: apiResponse.status,
      data: apiResponse.data
    });
  } catch (err: any) {
    res.status(err.response?.status || 500).json({
      error: err.message,
      data: err.response?.data
    });
  }
});

export default router;
```

---

## Phase 2 Selected Features: Core Code Scaffolding

Here are backend and frontend implementations to support your newly integrated privacy, routing, and testing engines.

### 1. One-Click Panic Button & Lockout (Failed Login Trigger)

We implement incorrect credential tracking on the backend (Redis-backed counter). Once it hits 3 consecutive failed logins, or when the user invokes the front-end panic button, the backend flushes the active sessions, and the client destroys all local IndexedDB stores.

**backend/src/auth/panic.ts**:
```typescript
import { Request, Response } from 'express';
import redis from '../redis'; // Redis client instance
import pool from '../db';

// Track failed logins per IP or Email Hash
export async function trackFailedAttempt(emailHash: Buffer): Promise<boolean> {
  const key = `failed_logins:${emailHash.toString('hex')}`;
  const attempts = await redis.incr(key);
  
  if (attempts === 1) {
    await redis.expire(key, 900); // 15-minute window lockout
  }

  if (attempts >= 3) {
    await triggerEmergencySelfDestruct(emailHash);
    return true; // Self-destruct activated
  }
  
  return false;
}

export async function triggerEmergencySelfDestruct(emailHash: Buffer) {
  // 1. Retrieve user associated with email hash
  const userRes = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHash]);
  if (userRes.rows.length === 0) return;
  const userId = userRes.rows[0].id;

  // 2. Terminate all active Redis sessions
  const sessionKeys = await redis.keys(`session:*:${userId}`);
  if (sessionKeys.length > 0) {
    await redis.del(...sessionKeys);
  }

  // 3. Clear failed login attempts
  await redis.del(`failed_logins:${emailHash.toString('hex')}`);
  console.error(`[PANIC WARNING] Emergency self-destruct activated for User ${userId}. Redis sessions purged.`);
}
```

**frontend/components/PanicButton.tsx**:
```typescript
'use client';

import React, { useState } from 'react';

export default function PanicButton() {
  const [destructed, setDestructed] = useState(false);

  const triggerDestruct = async () => {
    // 1. Delete all IndexedDB databases
    const dbs = await window.indexedDB.databases();
    for (const db of dbs) {
      if (db.name) {
        window.indexedDB.deleteDatabase(db.name);
      }
    }

    // 2. Clear storage memory
    localStorage.clear();
    sessionStorage.clear();

    // 3. Clear auth cookies
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    setDestructed(true);
    alert("[EMERGENCY ACT] Local data wiped successfully. Session severed.");
    window.location.href = '/login';
  };

  return (
    <button
      onClick={triggerDestruct}
      className="px-4 py-2 bg-red-600 hover:bg-red-800 text-white font-bold rounded shadow transition-all"
    >
      ⚠️ Emergency Panic Button
    </button>
  );
}
```

---

### 2. Outbound Tor/Proxy Routing Swapper

We configure Axios requests to dynamically route through SOCKS5 (e.g. your local Tor daemon at `127.0.0.1:9050`) or customized HTTP(S) proxy clusters.

**backend/src/middleware/proxy.ts**:
```typescript
import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface ProxyProfile {
  type: 'tor' | 'socks5' | 'http' | 'direct';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export function createProxiedClient(profile: ProxyProfile): AxiosInstance {
  let agent;

  if (profile.type === 'tor') {
    // Standard local Tor socks port
    agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
  } else if (profile.type === 'socks5') {
    const auth = profile.username ? `${profile.username}:${profile.password}@` : '';
    agent = new SocksProxyAgent(`socks5://${auth}${profile.host}:${profile.port}`);
  } else if (profile.type === 'http') {
    const auth = profile.username ? `${profile.username}:${profile.password}@` : '';
    agent = new HttpsProxyAgent(`http://${auth}${profile.host}:${profile.port}`);
  }

  return axios.create({
    httpAgent: agent,
    httpsAgent: agent,
    timeout: 15000 // Protection against hung proxy connections
  });
}
```

---

### 3. Disposable Proxied Mailbox Manager

Retrieve disposable mail configurations and track operational accounts. Outbound connections are automatically proxied through your selected routing client to preserve your server's IP address.

**backend/src/features/mail/routes.ts**:
```typescript
import express from 'express';
import { authMiddleware } from '../../middleware/auth';
import { createProxiedClient } from '../../middleware/proxy';
import pool from '../../db';

const router = express.Router();

// Helper to get active proxy config (client-decrypted and passed dynamically)
const getProxiedMailClient = (proxyConfig: any) => {
  return createProxiedClient(proxyConfig || { type: 'tor' });
};

// 1. Create a dynamic new disposable email address
router.post('/create-account', authMiddleware, async (req, res) => {
  const { domain, username, password, proxyConfig } = req.body;
  const axiosClient = getProxiedMailClient(proxyConfig);

  try {
    const mailRes = await axiosClient.post('https://api.mail.tm/accounts', {
      address: `${username}@${domain}`,
      password
    });
    res.json(mailRes.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// 2. Fetch inboxes (runs securely via Tor/Proxy)
router.post('/messages', authMiddleware, async (req, res) => {
  const { token, proxyConfig } = req.body;
  const axiosClient = getProxiedMailClient(proxyConfig);

  try {
    const mailRes = await axiosClient.get('https://api.mail.tm/messages', {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json(mailRes.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

---

### 4. Zero-Log In-Memory VPS Diagnostics

Executes diagnostic commands and pipes the output stream directly into RAM memory buffers. Outputs are relayed to your UI via WebSockets and are immediately dropped from RAM without hitting any local server log files.

**backend/src/features/diagnostics/sockets.ts**:
```typescript
import { Socket, Server } from 'socket.io';
import { exec } from 'child_process';
import { authMiddlewareSocket } from '../../middleware/authSocket';

export function registerDiagnosticHandlers(io: Server) {
  io.of('/diagnostics')
    .use(authMiddlewareSocket) // Socket authentication middleware
    .on('connection', (socket: Socket) => {
      
      socket.on('run_diagnostics', () => {
        // Core diagnostic metrics
        const commands = [
          'echo "=== Disk Metrics ===" && df -h /',
          'echo "=== Memory Metrics ===" && free -m',
          'echo "=== Active Host Connections ===" && netstat -tulpn | head -n 10',
          'echo "=== Docker Container Status ===" && docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
        ];

        // Execute in sequence, relaying directly to WebSocket RAM buffers
        exec(commands.join(' && '), (err, stdout, stderr) => {
          if (err) {
            socket.emit('diagnostic_output', `Error executing check: ${err.message}\n`);
            return;
          }
          if (stderr) {
            socket.emit('diagnostic_output', `Stderr:\n${stderr}\n`);
          }
          // Direct output straight to user's screen in real-time
          socket.emit('diagnostic_output', stdout);
        });
      });
    });
}
```

---

## Hour 13-16: Final Integration & Deployment

### Step 1: Build Docker Images

```bash
# Backend Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/dist ./dist
CMD ["node", "dist/index.js"]
```

```bash
# Frontend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./
COPY --from=builder /app/node_modules ./node_modules
CMD ["npm", "start"]
```

### Step 2: Run Locally

```bash
docker-compose up --build

# Access:
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
# Postgres: localhost:5432
# Redis: localhost:6379
```

### Step 3: Test Features

1. Register account
2. Create encrypted note
3. Share note link
4. Connect Telegram bot
5. Connect Facebook

### Step 4: Deploy to VPS

```bash
# SSH to your VPS
ssh root@your-vps-ip

# Clone repo
git clone your-repo
cd admin-panel

# Create .env (production)
nano .env

# Build and run
docker-compose up -d

# Get logs
docker-compose logs -f
```

---

## Hour 17-24: Polish & Additional Features

### Add remaining features:
- Mega file manager
- Apache Guacamole integration
- Webhooks
- Activity feed
- 2FA setup
- Analytics
- Backups

---

## Deployment Checklist

- [ ] Change all default passwords
- [ ] Set up SSL certificate (Let's Encrypt)
- [ ] Configure Nginx reverse proxy
- [ ] Enable firewall (ufw)
- [ ] Set up automated backups
- [ ] Configure monitoring (optional: Uptime Robot)
- [ ] Test zero-log design (no access logs)
- [ ] Document master key backup
- [ ] Set up database backups
- [ ] Configure auto-renewal for SSL cert

---

## Commands Reference

```bash
# Development
docker-compose up --build
docker-compose logs -f backend
docker-compose down

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Database
docker-compose exec db psql -U admin -d admin_panel
docker-compose exec db pg_dump -U admin admin_panel > backup.sql

# Cleanup
docker system prune
docker volume rm admin-panel_pg_data
```

---

## Next Steps After Launch

1. Add monitoring (error tracking)
2. Set up alerts for critical failures
3. Regular security audits
4. User feedback loop
5. Performance optimization
6. Add more integrations (as needed)

---

Good luck! You've got this. 🚀

**Questions?** Check the full ADMIN_PANEL_BLUEPRINT.md for detailed explanations.
