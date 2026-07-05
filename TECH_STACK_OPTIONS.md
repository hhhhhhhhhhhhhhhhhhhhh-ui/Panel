# Tech Stack Options & Recommendations

## Frontend Comparison

### Option 1: Next.js 14 (RECOMMENDED) ⭐
**Best for**: Full-stack privacy app, server-side rendering of secure components

**Pros**:
- Built-in API routes (no separate backend needed, but we'll use Express anyway)
- Image optimization
- Middleware for request interception
- File-based routing
- Excellent TypeScript support
- Can run as static site (SPA mode)
- Edge functions for security headers

**Cons**:
- Slightly heavier than vanilla React
- Learning curve (App Router vs Pages Router)

**Cost**: Free (open source)

**Code Example**:
```typescript
// app/api/[...route]/route.ts - secure API proxy
export async function POST(req: Request) {
  const encrypted = await req.json();
  // Decrypt on server? No - forward to backend
  const res = await fetch(process.env.BACKEND_URL, {
    method: 'POST',
    body: JSON.stringify(encrypted),
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  return res;
}
```

---

### Option 2: React + Vite
**Best for**: Lightweight SPA, pure client-side encryption

**Pros**:
- Lightning fast dev server
- Minimal overhead
- Perfect for client-side encryption focus
- Smaller bundle size
- Easier to go fully offline

**Cons**:
- No built-in server features
- Need separate backend for APIs
- Manual routing setup

**Cost**: Free (open source)

**Setup**:
```bash
npm create vite@latest admin-panel -- --template react-ts
npm install react-router-dom zustand axios tweetnacl
```

---

### Option 3: Svelte + SvelteKit
**Best for**: Ultra-minimal bundle, fastest performance

**Pros**:
- Smallest compiled output
- Reactive by default (no hooks)
- Great TypeScript support
- Built-in routing and API routes

**Cons**:
- Smaller ecosystem
- Less community packages for integrations

**Cost**: Free (open source)

---

## Backend Comparison

### Option 1: Node.js + Express (RECOMMENDED) ⭐
**Best for**: Zero-log, lightweight server

**Pros**:
- Same language as frontend (code sharing)
- Minimal abstraction
- Easy to control logging (turn it off completely)
- Lightweight (starts instantly)
- Great middleware ecosystem
- Perfect for running on small VPS

**Cons**:
- Single-threaded (but fine for single-user)
- More boilerplate than some frameworks

**Cost**: Free (open source)

**Core Stack**:
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "postgres": "^13.0",
    "redis": "^4.6.0",
    "jsonwebtoken": "^9.0.0",
    "argon2": "^0.31.0",
    "tweetnacl": "^1.0.3",
    "bull": "^4.11.0",
    "axios": "^1.4.0"
  }
}
```

**Zero-Log Config**:
```javascript
// Don't use Morgan or any logger
// Don't set up request/access logs
// Only log critical errors to STDERR (not disk)

app.use((req, res, next) => {
  // No console.log, no file logs
  // This is intentional - zero-log design
  next();
});
```

---

### Option 2: Node.js + Fastify
**Best for**: Ultra-fast, minimal overhead

**Pros**:
- Faster than Express
- Built-in JSON schema validation
- Better error handling
- Lower memory footprint
- Perfect for high throughput (even at 1 user)

**Cons**:
- Smaller ecosystem than Express
- Plugin system less familiar

**Cost**: Free (open source)

**Example**:
```javascript
const fastify = require('fastify')({ logger: false }); // Zero-log mode
```

---

### Option 3: Python + FastAPI
**Best for**: If you prefer Python, scientific computing

**Pros**:
- Clean syntax
- Great async support
- Easy to understand
- Good type hints
- Rich data validation

**Cons**:
- Slower than Node
- Different language (can't share code with frontend)
- Requires Python environment management

**Cost**: Free (open source)

**Setup**:
```bash
pip install fastapi uvicorn sqlalchemy psycopg2-binary pydantic-crypto
```

---

## Database Comparison

### Option 1: PostgreSQL (RECOMMENDED) ⭐
**Best for**: Encrypted at rest, powerful queries, open source

**Pros**:
- Excellent BYTEA type for encrypted data
- Full-text search (for notes/content)
- JSON/JSONB for flexible schema
- Triggers for automatic encryption
- Free and open source
- Can run locally for testing

**Cons**:
- Requires maintenance

**Cost**: Free (self-hosted) or ~$15/month (managed)

**Schema Example**:
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash BYTEA NOT NULL UNIQUE,
  password_hash BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE encrypted_notes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  content_enc BYTEA NOT NULL, -- AES-256-GCM encrypted
  nonce BYTEA NOT NULL, -- 24-byte Chacha20Poly1305 nonce
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### Option 2: SQLite (Local Only)
**Best for**: Single-user, offline-first, zero dependencies

**Pros**:
- No server to manage
- File-based (easy to backup)
- Perfect for local testing
- Can encrypt entire DB (sqlcipher)

**Cons**:
- Single writer (no concurrent access)
- Not ideal for remote access
- Less powerful than PostgreSQL

**Cost**: Free

**Setup with Encryption**:
```bash
npm install better-sqlite3 sqlcipher
# Use sqlcipher fork for encrypted DB
```

---

### Option 3: MongoDB
**Not Recommended** - Complex for encrypted-by-default design

---

## Encryption Libraries

### TweetNaCl.js (RECOMMENDED) ⭐
**For**: Client-side encryption (browser)

**Pros**:
- Audited, secure crypto library
- Pure JavaScript (no native dependencies)
- Works in browser and Node
- Secret box (symmetric) and public box (asymmetric)
- Stream ciphers

**Cons**:
- Slightly slower than native libs
- Larger bundle (~50KB)

**NPM**: `npm install tweetnacl`

**Example**:
```javascript
import nacl from 'tweetnacl';

const key = nacl.randomBytes(32); // 256-bit key
const nonce = nacl.randomBytes(24);
const plaintext = 'Secret message';

const encrypted = nacl.secretbox(
  nacl.util.decodeUTF8(plaintext),
  nonce,
  key
);

const ciphertext = nacl.util.encodeBase64(encrypted);
```

---

### libsodium.js
**For**: Advanced crypto operations

**Pros**:
- More features than TweetNaCl
- Password hashing (Argon2)
- Older and more battle-tested

**Cons**:
- Larger library
- Steeper learning curve

**NPM**: `npm install libsodium.js`

---

### Node crypto (built-in)
**For**: Server-side only

**Pros**:
- No dependencies
- Fast (native C++)
- Built into Node

**Cons**:
- Can't use in browser
- API less intuitive than nacl

**Example**:
```javascript
const crypto = require('crypto');

const algorithm = 'aes-256-gcm';
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

const cipher = crypto.createCipheriv(algorithm, key, iv);
const encrypted = cipher.update('secret', 'utf8', 'hex') + cipher.final('hex');
const authTag = cipher.getAuthTag();
```

---

## Message Queue / Job Processing

### Bull + Redis (RECOMMENDED) ⭐
**Best for**: Backups, webhooks, async tasks

**Pros**:
- Simple API
- No additional infrastructure
- Runs on top of Redis
- Perfect for single-server setup
- Built-in scheduling (cron)

**Cons**:
- Not ideal for millions of jobs
- Redis single point of failure (but easy to backup)

**NPM**: `npm install bull redis`

**Example**:
```javascript
import Queue from 'bull';

const backupQueue = new Queue('backups', {
  redis: { host: 'localhost', port: 6379 }
});

// Schedule daily at 2am
backupQueue.add({}, { repeat: { cron: '0 2 * * *' } });

backupQueue.process(async (job) => {
  console.log('Running backup...');
  // Backup logic
  return { success: true };
});
```

---

### Option 2: Node-Cron (Simple Alternative)
**Best for**: Single server, simple schedules

**Pros**:
- No dependencies (except cron parser)
- Lightweight
- Good for simple tasks

**Cons**:
- Only works while server running
- No persistence

**NPM**: `npm install node-cron`

---

## AI Orchestration & Model Context Protocol (MCP)

### Claude 3.5 Sonnet (RECOMMENDED) ⭐
**Best for**: Complex strategy execution, generating creative ad copy, and orchestrating multi-step MCP tool flows.

**Pros**:
- State-of-the-art tool-calling accuracy.
- Exceptional ability to formulate precise ad structures and target demographics.
- Generates natural, high-converting copy in multiple styles.
- Strict system prompt compliance for privacy guarantees.

**Cons**:
- Requires active network connection to Anthropic API.
- Pay-per-token model (offset by high efficiency for single-user admin tasks).

**Implementation (Express Proxy)**:
```typescript
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
// Bind tools from local MCP schemas in prompt lifecycle
```

---

### Model Context Protocol (MCP)
**Best for**: Safe, isolated API integrations without local key exposure (e.g., Facebook Ads, dynamic external automations).

**Pros**:
- **Zero Local Key Exposure**: The main server doesn't host credentials or standard SDKs. Instead, Claude requests action via standard MCP tool calls.
- **Strict Boundaries**: Model behavior is limited exactly to tools declared by the MCP server schemas.
- **Transport Flexibility**: Integrates via simple STDIO pipes (local process) or Server-Sent Events (SSE) (separated container/service).

**NPM**: `@modelcontextprotocol/sdk`

**MCP Tool Schema Sample**:
```json
{
  "name": "create_ad",
  "description": "Deploys a new ad copy and creative inside an existing ad set.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ad_set_id": { "type": "string" },
      "headline": { "type": "string" },
      "body_text": { "type": "string" },
      "image_url": { "type": "string" }
    },
    "required": ["ad_set_id", "headline", "body_text", "image_url"]
  }
}
```

---

### Telegram Client: GramJS vs. Bot API
**Best for**: Personal feed console, active filtering, group/channel/bot management.

| Feature | Telegram Bot API | GramJS (MTProto Client) ⭐ |
| :--- | :--- | :--- |
| **Authentication** | Bot token (created via BotFather) | Direct phone number + OTP login |
| **Data Scope** | Only sees messages sent to the bot | Accesses user's actual chats, channels, bots, and groups |
| **Capabilities** | Simple automated replies | Pin/unpin messages, read channels, aggregate chats, archive feeds |
| **AI Integration** | Limited to incoming webhooks | Full-stream processing of all incoming feeds via Claude summarizer |
| **Privacy Mode** | Server-side webhooks | Ephemeral client-side session stored in local IndexedDB (encrypted) |

**NPM**: `npm install telegram` (GramJS)

---

## Operational Security & Client Operations

### 1. Network Proxy Agents
**Best for**: Routing outbound requests securely through SOCKS5 / Tor to mask panel hosting IP.

**Options**:
- **SOCKS Proxy Agent (`socks-proxy-agent`)**: Standard library enabling seamless connection of active Axios or Node HTTPS instances to a Tor daemon (`127.0.0.1:9050`) or standard proxy servers.
- **HTTPS Proxy Agent (`https-proxy-agent`)**: For traditional HTTP/HTTPS proxy pools.

**NPM**: `npm install socks-proxy-agent https-proxy-agent`

---

### 2. Client-Side Image Optimizer
**Best for**: Fast, memory-only image resizing and WebP conversion before sending data to Claude Vision or third-party ad networks.

**Options**:
- **Browser Image Compression (`browser-image-compression`)**: Fast, pure JS client-side image compression that runs entirely in browser memory. Extremely easy to resize images dynamically without native server-side image dependencies (like sharp).
- **Canvas API (Native)**: Lower footprint but requires verbose code to handle image files, aspect ratios, and format conversions manually.

**NPM**: `npm install browser-image-compression`

---

### 3. Local Analytics Charting
**Best for**: Privacy-first visualization of channel metrics and backtester outcomes without third-party analytics scripts.

**Options**:
- **Recharts**: Declarative React charting library built on SVG. Perfect for smooth responsive dashboards and minimal memory footprints.
- **Chart.js**: Canvas-based charting. Powerful but requires manual DOM element binding in React.

**NPM**: `npm install recharts`

---

## Infrastructure & Deployment

### VPS (RECOMMENDED) ⭐

**Best Options**:

| Provider | Price | Privacy | Performance |
|----------|-------|---------|-------------|
| **Vultr** | $2.50/mo | Good | Excellent |
| **DigitalOcean** | $4/mo | Good | Excellent |
| **OVH** | €3/mo | Excellent | Good |
| **Hetzner** | €3/mo | Excellent | Excellent |
| **Linode** | $5/mo | Good | Excellent |

**Recommended Spec**:
- 1 vCPU
- 1-2 GB RAM
- 25-50 GB SSD
- Ubuntu 22.04 LTS

**Cost**: ~$3-10/month

**Setup Time**: ~30 minutes

---

### Docker (STRONGLY RECOMMENDED) ⭐

**Why**:
- Container isolation
- Easy deployment
- Version control
- Fast rollbacks
- Runs identically everywhere

**Single Compose File Handles**:
- PostgreSQL
- Redis
- Express backend
- Next.js frontend
- Nginx reverse proxy

**Cost**: Free (open source)

---

### Backup Storage

| Provider | Price | Speed | Privacy |
|----------|-------|-------|---------|
| **Backblaze B2** | $6/100GB/mo | Excellent | Good |
| **Wasabi** | $7/TB/mo | Excellent | Excellent |
| **AWS S3** | $23/TB/mo | Excellent | Poor (logging) |
| **Onedrive (self-hosted)** | Variable | Good | Excellent |
| **Local HDD** | $50 (one-time) | Good | Excellent |

---

## SSL/TLS Certificate

**Option 1: Let's Encrypt (FREE + AUTO-RENEWAL)** ⭐

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d admin.example.com
# Certs: /etc/letsencrypt/live/admin.example.com/
```

**Cost**: Free forever

**Renewal**: Automatic via `systemd.timer`

---

## Complete Minimal Tech Stack

```
Frontend:
├── Next.js 14 (React App Router)
├── TailwindCSS
├── browser-image-compression (In-browser image optimization)
├── Recharts (Local SVG-based responsive charting)
├── TweetNaCl.js (Client-side encryption wrapper)
├── Zustand (Ephemeral UI states)
└── TanStack Query (Data querying & caching)

Backend & AI:
├── Node.js + Express (Stateless API relay)
├── socks-proxy-agent & https-proxy-agent (Outbound Tor/Proxy agents)
├── Claude API SDK (3.5 Sonnet agent engine)
├── @modelcontextprotocol/sdk (FB Ads MCP connection)
├── GramJS (MTProto Telegram user connection)
├── PostgreSQL (Zero-knowledge encrypted storage)
├── Redis + Bull (Auth states & Auto-scaling queues)
└── Argon2 (Robust credential hashing)

Deployment:
├── Docker + Docker Compose
├── Nginx (Reverse proxy with strict log omission)
├── Let's Encrypt (SSL)
└── VPS (Vultr / DigitalOcean / Hetzner)

Storage:
└── Backblaze B2 (Encrypted auto-backups)

External APIs & Systems:
├── Facebook Ads MCP Server (Bound through Claude Tools)
├── Telegram Client API (GramJS MTProto)
├── Disposable Mail Client (mail.tm via Proxy Swapper)
├── Mega SDK (Encrypted Sync proxy)
└── Guacamole REST API (Terminal/SSH access gateway)
```

**Total Monthly Cost**:
- VPS: $5
- Backblaze B2: $1 (initial data)
- Domain: $10 (yearly)
- **Total: ~$6/month**

---

## Alternate "Maximum Privacy" Stack

If you want to be extra paranoid:

```
Frontend:
├── React + Vite (no Next.js server)
├── SvelteKit (if you want ultralight)
└── Everything else same

Backend:
├── Fastify (lighter than Express)
├── SQLite + sqlcipher (encrypted local DB)
├── No Redis (use file-based sessions)
└── No cloud backups (local encrypted backups)

Deployment:
├── Bare metal Linux VM
├── Nginx only (no Docker)
└── Manual updates

Storage:
└── Self-hosted NAS (no cloud)
```

**Cost**: ~$5/month for bare VPS (no extras)

---

## Final Recommendation

**For 80% of users**:
- Frontend: **Next.js 14**
- Backend: **Express + Node.js**
- Database: **PostgreSQL**
- Storage: **Backblaze B2**
- Encryption: **TweetNaCl.js**
- Deployment: **Docker on VPS**

**Why**:
✅ Easy to set up
✅ Well-documented
✅ Runs on $5/month VPS
✅ Zero-log capable
✅ Excellent security
✅ No vendor lock-in

---

## Migration Path

If you start with one stack and want to switch:

1. **Start with Vite + Express** (simplest)
2. **Add Next.js frontend** when you need SSR
3. **Migrate to PostgreSQL** when SQLite limits you
4. **Add Bull** when you need background jobs

Each step is independent—you don't have to commit everything upfront.

---

Done! Use the **ADMIN_PANEL_BLUEPRINT.md** for full implementation details. 🚀
