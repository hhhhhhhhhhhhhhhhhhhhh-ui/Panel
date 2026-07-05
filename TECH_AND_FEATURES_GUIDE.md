# Zero-Log Stateless Admin Stack: Tech & Features Reference Guide

Welcome to the comprehensive technology, feature, and installation manual for the Stateless Secure Admin Console. This panel is designed for maximum privacy, modern aesthetics, and fluid user experience.

---

## 🏗️ 1. Technical Stack Architecture

The application is structured as a decoupled microservices stack managed via Docker Compose and secured through a hardened Nginx gateway.

| Component | Technology | Role / Purpose |
| :--- | :--- | :--- |
| **Frontend** | React, Next.js (App Router), TypeScript | Responsive dashboard interface, state management, and real-time state consumption. |
| **Frontend Styling** | Tailwind CSS, Vanilla CSS Variables | Premium aesthetic system supporting dynamic light & dark mode styling tokens. |
| **Charts & Graphics** | Recharts, SVG Sparklines | Fluid visual representations of system telemetry and analytics traffic. |
| **Backend API** | Node.js, Express, TypeScript | RESTful APIs, JWT authentication, and administrative controller routines. |
| **Real-time Gateway** | Socket.io (WebSockets) | Live CPU/RAM charts, chat channels, presence, and diagnostic terminal streams. |
| **Database** | PostgreSQL 15 | Persistent storage for users, notes, chat messages, and web analytics logs. |
| **Cache & Sessions** | Redis 7 | Live session invalidation, temporary state storage, and rate-limiting. |
| **In-Memory Fallback** | Custom Memory Mock (db.ts) | Seamless offline mode using in-memory arrays when PostgreSQL is disconnected. |
| **Reverse Proxy** | Nginx | SSL/TLS termination, request forwarding, IP masking, and security headers. |
| **SSH/RDP Engine** | Apache Guacamole & guacd | In-browser, clientless remote desktop and shell gateway using containerized HTML5 canvas. |

---

## 🔒 2. Core Security & Privacy Principles

### Zero-Log Philosophy
* **Proxy-Level Privacy**: The Nginx configuration disables `access_log` and `error_log` completely. It forces `proxy_set_header X-Real-IP ""` and `proxy_set_header X-Forwarded-For ""` to strip visitors' IP addresses before requests reach the application.
* **Database Isolation**: No personally identifiable logs are stored on disk.
* **Stateless JWT**: Authentication uses cryptographic JSON Web Tokens cached temporarily in Redis with a strict 1-hour time-to-live (TTL).

---

## ⚡ 3. Key Feature Modules

### 💻 Superadmin Console
* **User & Session Audits**: View active users, status flags (active/suspended), roles (superadmin/admin), and last-seen activity timestamps.
* **Live System Metrics**: Real-time graphs showing CPU usage, RAM utilization, disk usage, and network bandwidth via push WebSockets.
* **Account Controls**: Instantly suspend users or trigger emergency password resets.

### 📊 Plausible Web Analytics
* **Date Range Picker**: Query historical traffic data dynamically.
* **Real-time Visitors**: Dynamic count badge showing active page hits.
* **Telemetry Cards**: Curated pastel (light) and neon (dark) KPIs showing Pageviews, Unique Visitors, Average Bounce Rates, and Session Durations.
* **Timeline Sparklines**: SVG-drawn sparklines detailing recent hours' traffic trends directly inside overview cards.
* **Trafficreferrers**: Visual progression bars breaking down referring domains and UTM campaigns.
* **Heatmap Grid**: Dynamic hourly timeline heatmap showcasing peak activity intervals.
* **Zero-Reveal Tracking Snippet**: Lightweight tracking pixel and script that automatically detects domains without revealing the backend server IP.

### 📝 Private Notes (Plaintext Base64)
* **Instant Loading**: Vault password screens bypassed to allow direct, painless workspace entry.
* **Base64 Payload Storage**: Notes are encoded as standard UTF-8 Base64 payloads, ensuring no decryption failures.
* **Interactive Editor**: Full markdown-style editing canvas support for code-blocks, blockquotes, numbered/unordered lists, header tags, and emojis.
* **Category Pill Navigation**: Organize notes by folders with custom creation triggers.
* **Auto-Save**: Automatic draft saving on content modification to prevent data loss.

### 💬 Team Chat Console
* **Multi-Channel**: Swap between channels or initiate private Direct Messages (DMs).
* **Typing Indicators**: Real-time feedback when other team members are typing.
* **Presence Tracking**: Online status indicators showing green activity rings.
* **Message Receipts**: Integrated read checkmarks indicating when messages have been seen.
* **Reactions & Replies**: Direct nested replies and custom emoji reactions on messages.

### 🛠️ Diagnostics Console
* **Terminal Shell**: Interactive command terminal to interface with host servers.
* **Diagnostics Logs**: Live streams from system processes and background tasks.

---

## 🚀 4. Installation & Deployment Guide

Follow these steps to deploy the stack to any local machine or a cloud VPS.

### Prerequisites
Make sure your server has the following packages installed:
* Git
* Docker (v20+)
* Docker Compose (v2.0+)

---

### Step 1: Clone and Configure
1. Clone the project to your directory:
   ```bash
   git clone <your-repository-url> admin
   cd admin
   ```
2. Create and configure your `.env` file based on [.env.example](file:///c:/Users/tanmay/Desktop/admin/.env.example):
   ```env
   DB_PASSWORD=your_secure_postgres_password
   REDIS_PASSWORD=your_secure_redis_password
   ENCRYPTION_KEY=dGhpcyBpcyBhIHNlY3VyZSAzMi1ieXRlIGtleWJhc2U2NA== # 32-byte Base64 key
   JWT_SECRET=your_jwt_signature_secret
   NEXT_PUBLIC_API_URL=https://localhost/api
   CLAUDE_API_KEY=your_optional_anthropic_api_key
   TELEGRAM_API_ID=your_optional_telegram_api_id
   TELEGRAM_API_HASH=your_optional_telegram_api_hash
   ```

---

### Step 2: Set Up SSL Certificates
Nginx requires valid TLS certificates inside the `/certs` directory.
For local testing or development, generate self-signed certificates:
```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

---

### Step 3: Run the Stack
Run Docker Compose to pull dependencies, build images, and launch the service stack:
```bash
# Start all containers in the background
docker-compose up --build -d
```

Confirm that all services are healthy:
```bash
docker ps
```
You should see:
* `admin_nginx` on port `80` & `443`
* `admin_frontend` on port `3000`
* `admin_backend` on port `3001`
* `admin_db` on port `5432`
* `admin_redis` on port `6379`
* `admin_guacamole` on port `8082`
* `admin_guacd` (internal daemon)

---

## 🛠️ 5. Local Development Mode

If you wish to make code modifications locally without running Docker containers:

### 🟢 Running Backend Node Server
Navigate to the `backend` folder, install dependencies, and run in dev mode:
```bash
cd backend
npm install
npm run dev
```

### 🔵 Running Frontend Next.js Client
Navigate to the `frontend` folder, install dependencies, and run in dev mode:
```bash
cd ../frontend
npm install
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

---

## 📂 6. Database DDL Schema reference

The database tables are automatically initialized during startup. For your reference, here is the SQL schema:

```sql
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash BYTEA NOT NULL UNIQUE,
  password_hash BYTEA NOT NULL,
  username VARCHAR(255),
  totp_secret_enc BYTEA,
  avatar_url TEXT,
  last_seen_at TIMESTAMP DEFAULT NOW(),
  is_online BOOLEAN DEFAULT FALSE,
  role VARCHAR(50) DEFAULT 'admin',
  status VARCHAR(50) DEFAULT 'active',
  master_key TEXT,
  custom_status VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Encrypted Notes Table
CREATE TABLE IF NOT EXISTS encrypted_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_enc BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  public_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Team Chat Messages Table
CREATE TABLE IF NOT EXISTS team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(100),
  text TEXT,
  file_payload JSONB,
  reply_to_id UUID REFERENCES team_messages(id) ON DELETE SET NULL,
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  reactions JSONB DEFAULT '{}',
  link_preview JSONB,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Analytics Events Table
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  path VARCHAR(255),
  session_id VARCHAR(100),
  referrer TEXT,
  device_type VARCHAR(50),
  country VARCHAR(10),
  domain VARCHAR(255),
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```
