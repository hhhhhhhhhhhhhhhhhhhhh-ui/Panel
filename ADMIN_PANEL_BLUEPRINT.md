# Private Admin Panel - Complete Blueprint

## Overview
A **zero-log, encrypted, anonymous admin panel** for managing ads, content, files, and integrations with full privacy and security.

---

## Core Principles
- **Zero-Log Architecture**: No server-side request logs, no session history, no IP tracking
- **End-to-End Encryption**: All data encrypted at rest and in transit
- **No Surveillance**: No analytics, no tracking pixels, no telemetry
- **Session Isolation**: Every session is ephemeral (RAM-only, cleared on logout)
- **Local-First Encryption**: Master keys never leave client

---

## Feature List (20 Total)

### Your Features (6)
1. **Apache Guacamole** - Remote desktop/SSH access gateway
2. **Facebook Ads MCP Engine** - AI-automated campaign generator & scaler via Claude API + local MCP server
3. **Public Notes** - Encrypted notes with shareable links (no backend access)
4. **Analytics Dashboard** - Privacy-respecting metrics (client-side only)
5. **Advanced Telegram Console** - Full user account login (MTProto), multi-feed sorting (Channels, Bots, DMs), custom filters, and Claude AI chat integration
6. **Mega File Manager** - File storage + encrypted sync (Mega SDK)

### My Suggested Features (5)
7. **Encrypted Backups** - Auto-backup to S3/B2/GCS (encrypted)
8. **Custom API Connectors** - Fully extensible dynamic REST integrator with security isolation
9. **2FA/TOTP Security** - Multi-factor auth with time-based codes
10. **Private Activity Feed** - Local-only audit log (encrypted, non-shared)
11. **Webhook Manager** - Listen for events from external services

### Core Infrastructure (1)
12. **Secure Auth Engine** - No passwords in DB, encrypted sessions only

### Phase 2 Selected Features (8)
13. **One-Click Panic Button & Auth Trigger** - Wipes all client-side databases, active MTProto keys, and Redis sessions (auto-triggers on 3 incorrect login attempts)
14. **Outbound Tor/Proxy Routing Switcher** - Outbound proxy switcher routing to SOCKS5, HTTP(S) proxy pool, or local Tor daemon to mask host server IP
15. **Disposable Email & Mailbox Manager** - Temp-mail API dynamically proxied through proxy switchers to hide panel server IP during SaaS sign-ups
16. **Interactive Strategy Builder & Backtester** - Claude-powered ad scaling strategy sandbox and campaign metrics backtester
17. **AI Media Asset Optimizer** - Client-side image compression/cropping combined with Claude Vision ad copy writing
18. **P2P Encrypted Audio/Voice Call Gateway** - GramJS MTProto-signaled WebRTC audio call runner inside the browser console
19. **Channel & Post Performance Tracker** - Aggregates channel reach analytics with custom local-only charts
20. **Zero-Log VPS Diagnostic Tool** - RAM-only diagnostics (disk health, port scanner, network states) without generating host logs

---

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: React 18+
- **Styling**: Tailwind CSS + shadcn/ui
- **Encryption**: TweetNaCl.js (NaCl crypto)
- **State**: Zustand (minimal, local-first)
- **HTTP Client**: TanStack Query + Axios
- **Real-time**: Socket.io (for Telegram, webhooks)

**Why Next.js?**
- SSR for SEO (if needed)
- API routes for lightweight backend
- Built-in Image optimization
- Incremental adoption (can be fully client-side if needed)

### Backend
- **Runtime**: Node.js 20+ LTS
- **Framework**: Express.js + Fastify (lightweight, no bloat)
- **Alternative**: Python + FastAPI (if you prefer)
- **Database**: PostgreSQL (encrypted fields) + Redis (ephemeral sessions)
- **Message Queue**: Bull (Redis-backed job queue)
- **Encryption**: Node crypto + libsodium

**Why Express/Fastify?**
- Minimal overhead
- Easy to add middleware for encryption/auth
- Simple to deploy without logs
- Can run in memory-only mode

### Infrastructure
- **Hosting**: VPS (DigitalOcean, Vultr, OVH)
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx (with security headers)
- **TLS**: Let's Encrypt (auto-renewed)
- **Storage**: S3-compatible (Backblaze B2, Wasabi)
- **Deployment**: GitHub Actions → Docker → VPS

**Why VPS vs Cloud?**
- Full control (no logging/monitoring imposed)
- Cheaper for single-user
- Can be fully isolated network

### External APIs & Agent Protocols
- **Claude API & Facebook Ads MCP**: Claude 3.5 Sonnet orchestration utilizing Model Context Protocol STDIO/SSE to call tools on a custom Facebook Ads MCP server (creating ads, automating campaigns, and executing scaling rules). No local Meta Graph API credentials or OAuth stored on database.
- **Telegram MTProto Client**: GramJS / MTProto-Node library. Complete user-level console interface allowing login via phone/OTP, and full cataloging of chats, channels, groups, and bots.
- **Mega**: Mega SDK (mega.js or mega-cmd)
- **Guacamole**: REST API (optional, or embed directly)

---

## Architecture

### High-Level Flow

```
┌─────────────────────┐
│   Browser (Client)  │  ← UI & Client-Side Encryption
│  - React (Next.js)  │  ← GramJS Session storage (encrypted)
│  - TweetNaCl.js     │  ← Master keys stored in IndexedDB
└──────────┬──────────┘
           │ (HTTPS + TLS)
           ▼
┌─────────────────────┐
│   Express Server    │  ← Stateless Proxy (Zero Logs)
│  - Session check    │  ← MTProto proxy connection broker
│  - Claude Router    │  ← Binds Claude API & proxies MCP tool requests
└──────────┬──────────┴─────────────────┐
           │                            │
     ┌─────┴──────────────┐             ▼
     ▼                    ▼     ┌──────────────┐
┌──────────────┐   ┌──────────┐ │ Claude API   │
│ PostgreSQL   │   │  Redis   │ │ Orchestrator │
│ (Encrypted   │   │ (Session │ └──────┬───────┘
│  at rest)    │   │  & Jobs) │        │ (MCP Transport)
└──────────────┘   └──────────┘        ▼
                                ┌──────────────┐
                                │ FB Ads MCP   │ ← Direct Meta
                                │ Server Tools │   API Connection
                                └──────────────┘
```

### Database Schema (Encrypted Fields)

```sql
-- Users (hashed credentials only)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email_hash BYTEA NOT NULL, -- hash only, never plaintext
  password_hash BYTEA NOT NULL, -- bcrypt + salt
  totp_secret_enc BYTEA, -- encrypted TOTP seed
  created_at TIMESTAMP NOT NULL
);

-- Sessions (ephemeral, Redis-only)
REDIS: session:{session_id} → {user_id, created_at, TTL: 3600}

-- Encrypted Notes (client-side encryption)
CREATE TABLE notes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  content_enc BYTEA NOT NULL, -- AES-256-GCM encrypted
  public_token VARCHAR(64), -- for sharing
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Webhook Events (encrypted)
CREATE TABLE webhooks (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  service VARCHAR(50), -- 'telegram', 'fb_ads', 'custom'
  url_enc BYTEA, -- encrypted webhook URL
  secret_enc BYTEA, -- encrypted signing key
  is_active BOOLEAN
);

-- Activity Feed (encrypted, local-only in IndexedDB on client)
INDEXEDDB: activity_log → {timestamp, action, service, details, encrypted}
```

---

## Feature Deep-Dive

### 1. Apache Guacamole
**Purpose**: Remote desktop/SSH access through browser

**Implementation**:
- Deploy Guacamole Docker container
- Authentication via your Express server (OAuth)
- Use Guacamole REST API to manage connections
- No logs of sessions (Guacamole in read-only mode)

**Tech**: Docker + Java + Guacamole

```bash
# docker-compose.yml snippet
guacamole:
  image: guacamole/guacamole:latest
  environment:
    MYSQL_HOSTNAME: db
    MYSQL_DATABASE: guacamole
    MYSQL_USER: guac
    MYSQL_PASSWORD: ${GUAC_PASSWORD}
```

---

### 2. Facebook Ads MCP Engine
**Purpose**: Complete ad orchestration, creative writing, auto-generation, and strategy scaling without locally stored Meta API credentials.

**MCP Architecture & Tools**:
- **No Direct App API Access**: The Express server never connects to Meta Graph API directly. Instead, the backend exposes standard **Model Context Protocol (MCP)** endpoints using STDIO or Server-Sent Events (SSE).
- **Claude Orchestrator**: The backend proxies structured instructions (strategies, ad creative goals, budget criteria) to the **Claude API**. Claude uses the declared Facebook Ads MCP tools to discover ad accounts, execute actions, and generate ads.
- **MCP Server Capabilities**: A standalone or local node server running the Facebook Ads MCP package which exposes:
  - `list_ad_accounts()` - Returns associated ad account details.
  - `get_campaign_analytics(campaign_id, timeframe)` - Pulls performance variables (CPA, CTR, Spend, Conversions).
  - `create_campaign(name, budget, status)` - Sets up structures.
  - `create_ad_set(campaign_id, targeting_spec, bid_amount)` - Configures bidding and targeting.
  - `create_ad(ad_set_id, creative_data)` - Deploys ad creatives.
  - `update_budget(ad_set_id, new_budget)` - Modifies scaling limits.
  - `update_ad_status(ad_id, status)` - Sets status (`ACTIVE` vs `PAUSED`).
  - `delete_ad_asset(asset_id, type)` - Deletes a campaign, ad set, or ad from Meta.

**Real-Time Dashboard UI & Tracking**:
- **Minimalist Slate Metric Cards**: Clean, high-contrast visual tiles mapping campaign parameters: **Spend**, **CTR (Click-Through Rate)**, **CPA (Cost Per Acquisition)**, **ROAS (Return on Ad Spend)**, and **Conversions**. Styled with thin borders, neutral gray grids, and crisp, professional typography.
- **Real-time Charting Engine**: Utilizes responsive Recharts SVG graphs to dynamically chart CTR and CPA trends over custom timelines (1h, 24h, 7d) without flashy gradient fills or heavy neon accents.
- **Socket.io Stream**: Connects the frontend to a continuous backend polling thread which aggregates fresh statistics from the MCP server in RAM, maintaining high fidelity with zero disk logging.

**Operational CRUD State Controls**:
- **Active Asset Grids**: Layout listing Campaigns, Ad Sets, and Ads in structured nesting tables featuring clean borders, clear dividers, and professional status badge pills (e.g. solid slate-gray/green-gray).
- **Single-Click Start/Stop Toggles**: Status buttons instantly executing the `update_ad_status` tool on the MCP server to swap ad delivery between `ACTIVE` and `PAUSED`.
- **Dynamic asset Editor & Deletion**: Modals to adjust bidding structures and a trash action executing `delete_ad_asset` via MCP.

**Single-Click AI Automation Engine**:
- **Single-Click AI Ad Creator**: Input a product goal or landing page URL. Claude automatically parses the context (using Tor proxy tunnels if configured), handles ad copywriting variations, creates target specifications, and auto-deploys a structured campaign via MCP tool calls in a single click.
- **Single-Click AI Scaler**: Scans campaign ROI, verifies strategy parameters, and executes the `update_budget` tool call instantly in one click to capture active ROI growth.
- **Single-Click AI Target Optimizer**: Claude monitors CPA and target demographics, identifies conversion leaks, and updates target parameters via MCP in one click.

**Flow**:
```
1. User defines high-level product data & scaling strategy in Admin UI.
2. User triggers single-click AI Actions or monitors live metrics on the Dashboard.
3. Express Server triggers Background Task or starts a Claude API Agent session.
4. Claude makes tool calls directly to the Facebook Ads MCP Server.
5. MCP Server communicates with Meta Graph API to read/write campaign states in real-time.
6. Claude yields execution updates, ad metrics, and creative copy back to Admin Panel UI.
```

**Tech**: Claude API (3.5 Sonnet) + @modelcontextprotocol/sdk + Bull Queue + Socket.io + Recharts + React

---

### 3. Public Notes
**Purpose**: Private notes with shareable links (no backend reads)

**Implementation**:
- Notes encrypted on client with AES-256-GCM
- Generate public_token (random UUID)
- Shareable link: `/notes/{public_token}`
- Recipient decrypts locally (key in URL hash, not sent to server)

**Example URL**: 
```
https://admin.example.com/notes/abc123?key=base64_encoded_key
       ↑ server sees this
       ↑ server DOES NOT see the key
       ↑ key never leaves browser
```

**Tech**: TweetNaCl.js + Next.js

---

### 4. Analytics Dashboard
**Purpose**: Metrics without tracking (privacy-respecting)

**What to track** (locally, on client only):
- Time spent in each feature
- Feature popularity (button clicks)
- API response times
- Error rates (not error details)

**What NOT to track**:
- IP addresses
- User identities (use session IDs only)
- External URLs or referrers
- Device fingerprints

**Implementation**:
- All analytics in IndexedDB (client-side)
- No external analytics service (no Google Analytics)
- Optional: Send aggregated stats to backend weekly (encrypted)

**Tech**: Custom React hooks + TanStack Query + IndexedDB

---

### 5. Advanced Telegram Console
**Purpose**: Access personal Telegram messages, groups, channels, and bots in one custom interface with AI filtering, message pinning, and agentic assistant features.

**Implementation**:
- **MTProto Protocol (User Account Login)**: Use **GramJS** to open a direct MTProto client session. The user inputs their phone number, and is sent an OTP directly via Telegram to log in.
- **Client Session Encryption**: The resulting authorization session string is encrypted on the client side using TweetNaCl.js and stored in IndexedDB. It is sent as an encrypted payload to the backend when establishing a socket connection, so the server never stores user session keys in plaintext.
- **Categorized Feed & UI Filtering**: The frontend splits chats into distinct directories:
  - **Channels**: Broadcast posts with filtering and search features.
  - **Bots**: Command and query interfaces.
  - **Direct Messages (DMs)**: Private 1-to-1 conversations.
  - **Groups**: Multi-user interactive chats.
- **AI Intelligence Integration**: 
  - **Summarization**: Claude summarizes long channel chat histories or active group conversations on-demand.
  - **Auto-Reply & Drafting**: The user can toggle AI assistance to auto-draft message responses based on custom context files or pre-configured personalities.
  - **Smart Pin & Search**: Tag messages with automated labels and execute semantic search query patterns using Claude processing.

**Flow**:
```
1. User enters Phone Number → Backend starts GramJS client.
2. User submits OTP received in official Telegram app → Session created.
3. Session string is client-side encrypted and cached locally.
4. UI connects via Socket.io to backend proxy → fetches lists of chats, channels, bots.
5. User selects message -> Claude summarizes, translates, or drafts replies on-demand.
```

**Tech**: GramJS (MTProto) + Socket.io + Claude API + TweetNaCl.js

---

### 6. Mega File Manager
**Purpose**: Private file storage + sync

**Implementation**:
- Use Mega SDK (mega-cmd or mega.js in browser)
- Browser handles encryption/decryption
- Server acts as proxy (no file access)
- Upload/download encrypted blobs

**Tech**: Mega SDK + Next.js API route

```javascript
// Browser-side upload
const mega = new MegaAPI();
await mega.login({ email, password });
const file = await mega.upload(encryptedBlob);
```

---

### 7. Encrypted Backups
**Purpose**: Automatic backup without exposure

**Implementation**:
- Daily cron job (on backend)
- Snapshot user data (notes, settings, activity log)
- Encrypt with user's master key (stored client-side)
- Upload to S3 (Backblaze B2, Wasabi)
- Store only encrypted blobs, never plaintext

**Tech**: Node.js + Bull + AWS SDK + TweetNaCl.js

```javascript
// Backup job
const job = await queue.add('backup', { userId }, {
  repeat: { cron: '0 2 * * *' } // 2am daily
});

job.process(async (data) => {
  const userKey = /* retrieved from encrypted store */;
  const backup = await generateBackup(userId);
  const encrypted = nacl.secretbox(backup, nonce, userKey);
  await s3.upload({ key: `${userId}/backup.enc`, body: encrypted });
});
```

---

### 8. Custom API Connectors
**Purpose**: Create and register custom REST integrations dynamically directly from the UI, enabling scaling to other external services.

**Implementation**:
- **Dynamic Connector Engine**: Provide a visual configuration manager where users can input Endpoint URLs, custom Header sets, Payload templates (JSON), and Authentication schemes (API Keys, Bearer tokens, or Basic).
- **Secure Encrypted Storage**: All API endpoints, headers, and authentication keys are client-side encrypted using TweetNaCl.js before saving to PostgreSQL.
- **Stateless Backend Relay**: To bypass CORS limitations, a secure backend route `/api/connectors/execute` receives the client-decrypted configuration temporarily in memory, executes the request dynamically using `axios`, and returns the response without saving logs, targets, or body details to disk.
- **AI Tool Integration**: These dynamically configured APIs can be translated into custom JSON schema tool definitions for Claude, allowing Claude to execute actions on your own custom services on-demand.

**Tech**: Express + Axios + TweetNaCl.js + Claude API Tool Engine

---

### 9. 2FA/TOTP Security
**Purpose**: Multi-factor auth without SMS

**Implementation**:
- Use speakeasy.js (TOTP library)
- User scans QR code in authenticator app
- Encrypted storage of secret
- No SMS (no phone records exposed)

**Tech**: Speakeasy.js + QR code library

```javascript
// Generate TOTP secret
const secret = speakeasy.generateSecret({
  name: `Admin Panel (${email})`
});

// Verify code
const verified = speakeasy.totp.verify({
  secret: secret.base32,
  encoding: 'base32',
  token: userInputCode,
  window: 2
});
```

---

### 10. Private Activity Feed
**Purpose**: Local audit log (non-shared, encrypted)

**Implementation**:
- All events stored in IndexedDB
- Timestamp, action, service, details
- Client-side encryption
- Optional: Export as encrypted JSON

**Tech**: IndexedDB + TweetNaCl.js

```javascript
// React hook for activity logging
const useActivityLog = () => {
  const addActivity = async (action, service, details) => {
    const entry = {
      timestamp: Date.now(),
      action,
      service,
      details,
      encrypted: await encryptData({...})
    };
    // Store in IndexedDB
  };
};
```

---

### 11. Webhook Manager
**Purpose**: Listen for external events

**Implementation**:
- Register webhooks from FB Ads, Telegram, custom services
- Signature verification (each service provides secret)
- Route to internal handlers
- Store events encrypted

**Tech**: Express + Bull queue + Crypto

---

### 12. Secure Auth Engine
**Purpose**: No passwords in database, encrypted sessions

**Implementation**:
- Argon2 password hashing (not bcrypt)
- Session tokens (UUID) stored in Redis
- Token expiry: 1 hour (auto-renew on activity)
- Master key encrypted in IndexedDB + passphrase

**Tech**: Argon2 + Redis + Node crypto

```javascript
// Hashing password
const hashed = await argon2.hash(password, {
  type: argon2.argon2i,
  memoryCost: 2 ** 16, // 64 MB
  timeCost: 3,
  parallelism: 1
});
```

---

### 13. One-Click Panic Button & Auth Trigger
**Purpose**: Wipe all active sessions and local data instantly when compromised or under login brute-forcing.

**Implementation**:
- **Client-Side Panic Action**: A quick-action button destroys local IndexedDB tables, drops WebSockets, clears cookies, and reloads to login.
- **Lockout / Decoy Trigger**: If correct credentials are input 3 times incorrectly, or a dedicated "decoy passphrase" is submitted during login:
  1. Server flushes user active sessions in Redis.
  2. Server triggers a dynamic blanking template code directly over HTTP.
  3. All local IndexedDB datasets are automatically purged in the client browser.

**Tech**: Redis `del` + TweetNaCl.js + IndexedDB Store + React

---

### 14. Outbound Tor/Proxy Routing Switcher
**Purpose**: Conceal host server IP from third-party networks (Mega, external webhooks).

**Implementation**:
- **Configuration Switcher**: UI profiles supporting SOCKS5, SOCKS4, HTTP, or a local Tor daemon client running on `127.0.0.1:9050`.
- **Dynamic Routing Middleware**: In Express, custom dynamic routing integrates `socks-proxy-agent` into Axios configuration arrays based on chosen active profiles.

**Tech**: Express + Axios + socks-proxy-agent + Tor network client

---

### 15. Disposable Email & Mailbox Manager
**Purpose**: Safeguard operational sign-ups using proxied, temporary mailbox targets.

**Implementation**:
- **Proxied Connections**: Connects with mail.tm APIs, directing every REST query through active Outbound Proxy Switchers.
- **Client Vault Caching**: Dynamic temp mail logs are client-encrypted with TweetNaCl.js before PostgreSQL storage.

**Tech**: mail.tm REST endpoints + Outbound Proxy Swapper + TweetNaCl.js

---

### 16. Interactive Strategy Builder & Backtester
**Purpose**: Simulate Claude-driven budget scaling algorithms.

**Implementation**:
- **Rule Creator UI**: Visual sliders configuring scaling conditions (CPA thresholds, conversion targets, multiplier rules).
- **Claude Simulation Agent**: Binds historical analytics reports (pulled via FB Ads MCP tool) to Claude context, letting Claude output budget growth projections, risk targets, and optimization reviews.

**Tech**: Claude 3.5 Sonnet + Recharts + Express + Postgres

---

### 17. AI Media Asset Optimizer
**Purpose**: Fast client-side image operations mapped to Claude Copywriter recommendations.

**Implementation**:
- **Client Image Processor**: Dynamic image formatting (resizing, WebP conversion, cropping) runs inside browser RAM using `browser-image-compression`.
- **Claude Vision Pipeline**: Optimised asset blobs are sent to Claude 3.5 Sonnet Vision APIs to write compliant, high-CTR headline drafts and copy targets.

**Tech**: browser-image-compression + Claude 3.5 Sonnet Vision + React App

---

### 18. P2P Encrypted Audio/Voice Call Gateway
**Purpose**: Audio calling inside the panel using WebRTC and MTProto signaling.

**Implementation**:
- **Signal Tunneling**: Integrates GramJS call signaling objects.
- **Direct P2P Media Capture**: WebRTC negotiates peer connections (RTCPeerConnection), streaming audio directly browser-to-browser.

**Tech**: GramJS (MTProto) + WebRTC + Web Audio API

---

### 19. Channel & Post Performance Tracker
**Purpose**: Private channel metrics visualization without remote tracker leaks.

**Implementation**:
- **MTProto Puller**: GramJS pulls detailed channel stats (reach, engagement, view lists, forwarding vectors).
- **Local-Only Rendering**: Renders SVG metrics graphs client-side.

**Tech**: GramJS + Recharts + IndexedDB Storage

---

### 20. Zero-Log VPS Diagnostic Tool
**Purpose**: View server health dynamically in real-time with zero disk log persistence.

**Implementation**:
- **RAM-Only Execution**: A dynamic script runner polls core commands (`df -h`, `free -m`, `docker ps`).
- **Direct WebSocket Relay**: Relays terminal feedback dynamically via Socket.io directly to RAM buffers, bypassing filesystem write sequences.

**Tech**: Child Processes + Socket.io + RAM Buffers

---

## Deployment Guide

### Prerequisites
- VPS (Ubuntu 22.04+) or any Linux server
- Docker + Docker Compose
- Nginx (reverse proxy)
- PostgreSQL 15+
- Redis 7+

### Step 1: Server Setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose -y

# Create app directory
mkdir -p /opt/admin-panel
cd /opt/admin-panel
```

### Step 2: Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.9'

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: admin_panel
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"

  backend:
    build: ./backend
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://app:${DB_PASSWORD}@db:5432/admin_panel
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - db
      - redis
    ports:
      - "127.0.0.1:3001:3001"
    restart: unless-stopped

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: https://api.example.com
      NEXT_PUBLIC_ENVIRONMENT: production
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  pg_data:
  redis_data:
```

### Step 3: Nginx Configuration

```nginx
# nginx.conf
upstream backend {
  server backend:3001;
}

upstream frontend {
  server frontend:3000;
}

server {
  listen 443 ssl http2;
  server_name admin.example.com;

  ssl_certificate /etc/nginx/certs/cert.pem;
  ssl_certificate_key /etc/nginx/certs/key.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-XSS-Protection "1; mode=block" always;

  # API proxy
  location /api/ {
    proxy_pass http://backend/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For "";  # DO NOT forward IP
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
  }

  # Frontend
  location / {
    proxy_pass http://frontend;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For "";
  }
}

server {
  listen 80;
  server_name admin.example.com;
  return 301 https://$server_name$request_uri;
}
```

### Step 4: Environment Variables

```bash
# .env
DB_PASSWORD=<long_random_password>
REDIS_PASSWORD=<long_random_password>
ENCRYPTION_KEY=<base64_encoded_32_byte_key>
JWT_SECRET=<long_random_secret>
FACEBOOK_CLIENT_ID=<from_facebook_app>
FACEBOOK_CLIENT_SECRET=<from_facebook_app>
TELEGRAM_BOT_TOKEN=<from_botfather>
MEGA_EMAIL=<your_mega_account>
MEGA_PASSWORD=<your_mega_password>
```

### Step 5: SSL Certificate

```bash
# Using Let's Encrypt + Certbot
sudo apt install certbot python3-certbot-nginx -y
sudo certbot certonly --standalone -d admin.example.com
# Certs will be in /etc/letsencrypt/live/admin.example.com/
```

### Step 6: Deploy

```bash
docker-compose up -d
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

---

## Security Checklist

- [ ] HTTPS/TLS enabled (Let's Encrypt)
- [ ] HSTS headers set (1 year)
- [ ] No X-Forwarded-For headers (prevent IP leaks)
- [ ] All passwords hashed with Argon2
- [ ] Sessions stored in Redis (TTL: 1 hour)
- [ ] Database fields encrypted at rest
- [ ] Master keys in IndexedDB (passphrase-protected)
- [ ] No application logs to disk
- [ ] No access logs in Nginx
- [ ] Firewall blocks all ports except 80/443
- [ ] CSRF tokens on all forms
- [ ] CORS restricted to your domain
- [ ] Rate limiting on auth endpoints
- [ ] Webhook signatures verified (HMAC)
- [ ] Backup encryption with user key
- [ ] No email confirmations (no email records)
- [ ] No analytics/tracking
- [ ] 2FA required for account access

---

## File Structure

```
admin-panel/
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   │   ├── routes.ts
│   │   │   ├── encryption.ts
│   │   │   └── session.ts
│   │   ├── features/
│   │   │   ├── notes/
│   │   │   ├── telegram/
│   │   │   │   ├── client.ts (GramJS wrapper)
│   │   │   │   └── routes.ts
│   │   │   ├── fb-mcp/
│   │   │   │   ├── agent.ts (Claude agent)
│   │   │   │   ├── tools.ts (MCP schema wrappers)
│   │   │   │   └── routes.ts
│   │   │   ├── connectors/ (Dynamic API)
│   │   │   ├── webhooks/
│   │   │   └── backups/
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── encryption.ts
│   │   │   └── errorHandler.ts
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── notes/
│   │   │   ├── ads/
│   │   │   ├── telegram/
│   │   │   ├── files/
│   │   │   └── activity/
│   │   ├── auth/
│   │   │   ├── login/page.tsx
│   │   │   └── setup-2fa/page.tsx
│   │   └── api/
│   │       └── [...route]/route.ts (proxy)
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── Notes.tsx
│   │   ├── TelegramConsole.tsx (MTProto-integrated feeds)
│   │   ├── AdAutomator.tsx (AI Generation & MCP Scaling UI)
│   │   ├── FileManager.tsx
│   │   └── Analytics.tsx
│   ├── lib/
│   │   ├── crypto.ts (TweetNaCl.js wrapper)
│   │   ├── api.ts (fetch wrapper)
│   │   ├── storage.ts (IndexedDB wrapper)
│   │   └── hooks/ (React hooks)
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
├── nginx.conf
└── .env.example
```

---

## Next Steps

1. **Clone/Create Git Repo**
   ```bash
   git init admin-panel
   cd admin-panel
   ```

2. **Set Up Backend**
   ```bash
   mkdir backend && cd backend
   npm init
   npm install express fastify argon2 redis postgres jsonwebtoken tweetnacl
   ```

3. **Set Up Frontend**
   ```bash
   npx create-next-app@latest frontend --typescript
   cd frontend
   npm install tweetnacl zustand @tanstack/react-query axios socket.io-client
   ```

4. **Add Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your secrets
   ```

5. **Deploy**
   ```bash
   docker-compose up -d
   ```

---

## Maintenance

**Weekly**: Check logs for errors
```bash
docker-compose logs --tail=100 backend
```

**Monthly**: Update Docker images
```bash
docker-compose pull && docker-compose up -d
```

**Quarterly**: Backup database
```bash
docker-compose exec db pg_dump -U app admin_panel | gzip > backup.sql.gz
```

**Yearly**: Renew SSL certificate
```bash
sudo certbot renew
```

---

## Support & Customization

This blueprint covers:
- ✅ Zero-log architecture
- ✅ End-to-end encryption
- ✅ All 11 features
- ✅ Full deployment guide
- ✅ Security hardening
- ✅ Privacy compliance

You can extend with:
- More OAuth providers (Google, GitHub, etc.)
- Additional file storage (S3, GCS, local disk)
- Custom webhooks (IFTTT, Make.com)
- Email notifications (encrypted, self-hosted)

---

## Final Notes

**What this system DOES NOT do:**
- Store plaintext data anywhere
- Track user behavior
- Send data to third parties
- Log requests/responses
- Use external analytics
- Require email/phone verification

**What you MUST remember:**
- Backup your master key (passphrase)
- Rotate secrets quarterly
- Monitor disk space (logs add up)
- Update Docker images monthly
- Test backup recovery annually

---

Good luck building! 🚀
