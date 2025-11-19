#!/bin/bash
# SkyFi MCP Server - EC2 Deployment Script
#
# Usage: ./deploy.sh
#
# Prerequisites:
# - SSH key at ./SkyFyMCP-MF.pem (chmod 400)
# - EC2 security group allows inbound on port 3000 (or 80/443 for production)

set -e

# Configuration
EC2_HOST="ec2-3-19-66-55.us-east-2.compute.amazonaws.com"
EC2_USER="ec2-user"
SSH_KEY="./SkyFyMCP-MF.pem"
REPO_URL="https://github.com/mfuechec/SkyFiMCP.git"
APP_DIR="/opt/skyfi-mcp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== SkyFi MCP Server Deployment ===${NC}"

# Check SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}Error: SSH key not found at $SSH_KEY${NC}"
    exit 1
fi

# Ensure correct permissions on SSH key
chmod 400 "$SSH_KEY"

# Function to run commands on EC2
run_remote() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "$1"
}

# Function to copy files to EC2
copy_to_remote() {
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$1" "$EC2_USER@$EC2_HOST:$2"
}

echo -e "${YELLOW}Step 1: Installing dependencies on EC2...${NC}"
run_remote "sudo yum update -y && sudo yum install -y git"

# Install Node.js 20
echo -e "${YELLOW}Step 2: Installing Node.js 20...${NC}"
run_remote "curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo yum install -y nodejs"

# Install pnpm
echo -e "${YELLOW}Step 3: Installing pnpm...${NC}"
run_remote "sudo npm install -g pnpm"

# Clone or update repository
echo -e "${YELLOW}Step 4: Deploying application...${NC}"
run_remote "sudo rm -rf $APP_DIR && sudo git clone $REPO_URL $APP_DIR && sudo chown -R $EC2_USER:$EC2_USER $APP_DIR"

# Install dependencies and build
echo -e "${YELLOW}Step 5: Installing dependencies and building...${NC}"
run_remote "cd $APP_DIR && pnpm install && pnpm build"

# Create environment file
echo -e "${YELLOW}Step 6: Creating environment file...${NC}"

# Read API key from local .env file
if [ -f ".env" ]; then
    SKYFI_KEY=$(grep "^SKYFI_API_KEY=" .env | cut -d '=' -f2)
fi

if [ -z "$SKYFI_KEY" ]; then
    echo -e "${YELLOW}Enter your SkyFi API key:${NC}"
    read -r SKYFI_KEY
    if [ -z "$SKYFI_KEY" ]; then
        echo -e "${RED}Error: SkyFi API key is required${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Using API key from local .env file${NC}"
fi

run_remote "cat > $APP_DIR/.env << 'EOF'
NODE_ENV=production
MCP_TRANSPORT=http
PORT=3000
SKYFI_API_KEY=$SKYFI_KEY
EOF"

# Create systemd service
echo -e "${YELLOW}Step 7: Creating systemd service...${NC}"
run_remote "sudo tee /etc/systemd/system/skyfi-mcp.service > /dev/null << 'EOF'
[Unit]
Description=SkyFi MCP Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/skyfi-mcp
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=MCP_TRANSPORT=http
Environment=PORT=3000
EnvironmentFile=/opt/skyfi-mcp/.env

[Install]
WantedBy=multi-user.target
EOF"

# Start the service
echo -e "${YELLOW}Step 8: Starting service...${NC}"
run_remote "sudo systemctl daemon-reload && sudo systemctl enable skyfi-mcp && sudo systemctl restart skyfi-mcp"

# Check service status
echo -e "${YELLOW}Step 9: Checking service status...${NC}"
sleep 3
run_remote "sudo systemctl status skyfi-mcp --no-pager"

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo -e "Server is running at: ${GREEN}http://$EC2_HOST:3000${NC}"
echo -e "Health check: ${GREEN}http://$EC2_HOST:3000/health${NC}"
echo -e "SSE endpoint: ${GREEN}http://$EC2_HOST:3000/sse${NC}"
echo ""
echo -e "${YELLOW}Important: Make sure your EC2 security group allows inbound traffic on port 3000${NC}"
echo ""
echo -e "To view logs: ${YELLOW}ssh -i $SSH_KEY $EC2_USER@$EC2_HOST 'sudo journalctl -u skyfi-mcp -f'${NC}"
echo -e "To restart: ${YELLOW}ssh -i $SSH_KEY $EC2_USER@$EC2_HOST 'sudo systemctl restart skyfi-mcp'${NC}"
