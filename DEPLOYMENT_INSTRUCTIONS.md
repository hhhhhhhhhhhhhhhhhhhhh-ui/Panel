# Production Linux Deployment Instructions

This guide outlines how to host, run, and manage your private zero-log admin panel stack on a Linux VPS/Server (Ubuntu/Debian recommended).

---

## 🚀 One-Click Automated Deployment (Recommended)

We have created an automated shell script at the root of the project that handles dependencies, SSL certificates, environment variables, and builds the containers automatically.

1. **Upload** this `admin` project folder to your Linux VPS.
2. **SSH** into your server and navigate to the project directory:
   ```bash
   cd /path/to/admin
   ```
3. Make the script **executable**:
   ```bash
   chmod +x deploy.sh
   ```
4. **Run** the installer:
   ```bash
   ./deploy.sh
   ```

The script will ask for your optional API keys (Claude & Telegram) and your domain/IP, auto-generate secure database and JWT passwords, generate SSL certificates, and spin up the complete Docker stack under Nginx.

---

## 🛠️ Accessing the App

Once the deployment completes:
* **Admin Dashboard (HTTPS)**: `https://your-server-ip` (or `https://yourdomain.com`)
  * *Note: Since the script generates self-signed SSL certificates for encryption, click "Advanced" -> "Proceed anyway" when loading the page in your browser for the first time.*
* **Apache Guacamole Gateway**: Access the interactive remote desktop client securely via your dashboard's `SSH/RDP Gateway` tab.

---

## 📁 Managing the Running Stack

The entire stack runs inside Docker containers. Use the following commands inside the `/admin` folder to manage the services:

### 1. View Running Status
Check if all containers are healthy:
```bash
sudo docker ps
```

### 2. View Log Streams
Inspect real-time logs for Nginx, the Node backend, or the Guacamole client:
```bash
# View all logs
sudo docker-compose logs -f

# View only the Node API backend logs
sudo docker-compose logs -f backend

# View Nginx gateway logs
sudo docker-compose logs -f nginx
```

### 3. Stop or Restart the Panel
```bash
# Stop all services (retains database/cache data)
sudo docker-compose down

# Start all services
sudo docker-compose up -d

# Force a rebuild of backend/frontend assets after making edits
sudo docker-compose up --build -d
```

### 4. Wipe Data / Factory Reset
To completely purge the database, cache, and log traces off the VPS:
```bash
sudo docker-compose down --volumes --remove-orphans
```

---

## ⚙️ Manual Configuration (.env)

All credentials are saved inside the `.env` file at the root. You can modify these values anytime:

* `CLAUDE_API_KEY`: Hook up your Anthropic API Key to activate Claude strategy auditing and image analysis.
* `TELEGRAM_API_ID` & `TELEGRAM_API_HASH`: Mandatory for Telegram MTProto user logins (retrieve yours from https://my.telegram.org).
* `NEXT_PUBLIC_API_URL`: Should point to `https://your-domain.com/api` or `https://your-server-ip/api`.
