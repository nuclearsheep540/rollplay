#!/usr/bin/env bash
set -euo pipefail

# Create plugin directory for all users
sudo mkdir -p /usr/local/lib/docker/cli-plugins

# Download current version of docker compose plugin
sudo curl -fSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose

# Make plugin executable
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Restart docker service
sudo systemctl restart docker

# Verify docker compose works
docker compose version