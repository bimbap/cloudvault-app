#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# 1. Update and install the repo prerequisites
apt-get update -y
apt-get install -y curl ca-certificates gnupg awscli

# 2. Register the Node.js 20 LTS package and install it (npm is automatically included)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Install PM2 globally
npm install -g pm2
