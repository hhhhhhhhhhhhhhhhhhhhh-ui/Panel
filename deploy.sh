#!/bin/bash

# ==============================================================================
# Admin Panel - Automated Linux Deployment & SSL Provisioning Script
# ==============================================================================

set -e

# Styling colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}           Automated Linux Production Deployment Script               ${NC}"
echo -e "${BLUE}======================================================================${NC}"

# 1. Dependency Checks
echo -e "\n${BLUE}[1/5] Verifying System Dependencies...${NC}"

if ! [ -x "$(command -v docker)" ]; then
    echo -e "${YELLOW}⚠️ Docker is not installed. Attempting installation...${NC}"
    sudo apt update
    sudo apt install -y docker.io
    sudo systemctl enable --now docker
else
    echo -e "${GREEN}✓ Docker is installed.${NC}"
fi

if ! [ -x "$(command -v docker-compose)" ]; then
    echo -e "${YELLOW}⚠️ Docker Compose is not installed. Attempting installation...${NC}"
    sudo apt install -y docker-compose
else
    echo -e "${GREEN}✓ Docker Compose is installed.${NC}"
fi

if ! [ -x "$(command -v openssl)" ]; then
    echo -e "${YELLOW}⚠️ OpenSSL is not installed. Installing...${NC}"
    sudo apt install -y openssl
else
    echo -e "${GREEN}✓ OpenSSL is installed.${NC}"
fi

# 2. SSL Provisioning
echo -e "\n${BLUE}[2/5] Setting up HTTPS SSL Certificates...${NC}"
mkdir -p certs

if [ ! -f certs/cert.pem ] || [ ! -f certs/key.pem ]; then
    echo -e "${YELLOW}🔑 Generating Self-Signed SSL Certificates...${NC}"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout certs/key.pem \
        -out certs/cert.pem \
        -subj "/C=US/ST=State/L=City/O=SecureConsole/CN=localhost"
    echo -e "${GREEN}✓ SSL Certificates provisioned successfully inside ./certs/${NC}"
else
    echo -e "${GREEN}✓ SSL Certificates already present.${NC}"
fi

# 3. Environment Config Setup
echo -e "\n${BLUE}[3/5] Setting up Environment Variables (.env)...${NC}"

if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Creating production .env configuration...${NC}"
    
    # Auto-generate secure secrets
    DB_PASS=$(openssl rand -hex 16)
    REDIS_PASS=$(openssl rand -hex 16)
    JWT_SEC=$(openssl rand -hex 32)
    ENC_KEY=$(openssl rand -base64 32)
    
    read -p "Enter your Claude API Key (optional): " CLAUDE_KEY
    read -p "Enter your Telegram API ID (optional): " TG_ID
    read -p "Enter your Telegram API Hash (optional): " TG_HASH
    read -p "Enter your Domain / public IP (default: localhost): " PUBLIC_DOMAIN
    
    if [ -z "$PUBLIC_DOMAIN" ]; then
        PUBLIC_DOMAIN="localhost"
    fi
    
    cat <<EOT > .env
# --- Core Services Cryptography ---
DB_PASSWORD=$DB_PASS
REDIS_PASSWORD=$REDIS_PASS
ENCRYPTION_KEY=$ENC_KEY
JWT_SECRET=$JWT_SEC

# --- AI & Automation Interfaces ---
CLAUDE_API_KEY=$CLAUDE_KEY
FB_ADS_MCP_URL=http://fb-ads-mcp:8080

# --- Telegram MTProto GramJS Setup ---
TELEGRAM_API_ID=$TG_ID
TELEGRAM_API_HASH=$TG_HASH

# --- External Network Proxies ---
TOR_PROXY_URL=socks5://tor-proxy:9050

# --- Ports and Environment ---
PORT=3001
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://$PUBLIC_DOMAIN/api
EOT
    echo -e "${GREEN}✓ .env file created successfully with secure credentials!${NC}"
else
    echo -e "${GREEN}✓ .env file already exists.${NC}"
fi

# 4. Building the Containers
echo -e "\n${BLUE}[4/5] Building and starting Docker Compose services...${NC}"
sudo docker-compose down --remove-orphans || true
sudo docker-compose up --build -d

# 5. Summary
echo -e "\n${BLUE}[5/5] Verification Summary...${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}🚀 Application is fully hosted and running on localhost/Linux!${NC}"
echo -e "${GREEN}   - Secure Frontend:  https://localhost (Mapped to Nginx Port 443)${NC}"
echo -e "${GREEN}   - Secure Backend:   https://localhost/api${NC}"
echo -e "${GREEN}   - Guacamole RDP:    http://127.0.0.1:8082/guacamole/${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${YELLOW}Note: Access the frontend over HTTPS. Bypassed self-signed certificate warnings in browser.${NC}"
