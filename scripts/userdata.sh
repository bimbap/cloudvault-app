#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# 1. Update and install the repo prerequisites
apt-get update -y
apt-get install -y curl ca-certificates gnupg

# 2. Register the Node.js 20 LTS package and install it (npm is automatically included)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Install PM2 globally
npm install -g pm2

# 4. Create application folder and grant access permission to user 'ubuntu' for FileZilla
mkdir -p /home/ubuntu/cloudvault-app/public
chown -R ubuntu:ubuntu /home/ubuntu/cloudvault-app