#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# 1. Update and install the repo prerequisites
apt-get update -y
apt-get install -y curl nginx ca-certificates gnupg

# 2. Register the Node.js 20 LTS package and install it (npm is automatically included)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2

# 3. Create application folder and grant access permission to user 'ubuntu' for FileZilla
mkdir -p /home/ubuntu/cloudvault-app/public
chown -R ubuntu:ubuntu /home/ubuntu/cloudvault-app

# 4. Configure Nginx Reverse Proxy (Port 80 -> Port 3000)
cat << 'EOF' > /etc/nginx/sites-available/cloudvault
server {
    listen 80;
    server_name _;

    client_max_body_size 25M;
    proxy_connect_timeout 120s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/cloudvault /etc/nginx/sites-enabled/cloudvault
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx