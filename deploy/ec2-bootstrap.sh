#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 EC2 instance.
# Run from the cloned repo:   sudo bash deploy/ec2-bootstrap.sh
# Safe to run again: it never overwrites files that already exist.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo:  sudo bash deploy/ec2-bootstrap.sh"; exit 1
fi

APP_USER="${SUDO_USER:-ubuntu}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/opt/prakati

set_kv() {  # set_kv FILE KEY VALUE
  if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >> "$1"; fi
}

echo "[1/6] Installing Docker and Git..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io docker-compose-v2 git curl ca-certificates openssl
systemctl enable --now docker
usermod -aG docker "$APP_USER"

echo "[2/6] Adding 2 GB swap (small servers run out of memory while building)..."
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "swap already present"
fi

echo "[3/6] Creating $APP_DIR/.env for the app secrets..."
mkdir -p "$APP_DIR/backups"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$APP_DIR/.env"
  set_kv "$APP_DIR/.env" POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "created (database password generated)"
else
  echo "already exists, left untouched"
fi

echo "[4/6] Creating jenkins/.env..."
J_ENV="$REPO_DIR/jenkins/.env"
if [ ! -f "$J_ENV" ]; then
  cp "$REPO_DIR/jenkins/.env.example" "$J_ENV"
  JPASS="$(openssl rand -hex 12)"
  set_kv "$J_ENV" JENKINS_ADMIN_PASSWORD "$JPASS"
  set_kv "$J_ENV" DOCKER_GID "$(getent group docker | cut -d: -f3)"
  ORIGIN="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
  ORIGIN="$(echo "$ORIGIN" | sed -E 's#^git@([^:]+):#https://\1/#')"
  set_kv "$J_ENV" REPO_URL "$ORIGIN"
  chown "$APP_USER":"$APP_USER" "$J_ENV"
  chmod 600 "$J_ENV"
  echo "Jenkins login ->  user: admin   password: $JPASS   (also saved in jenkins/.env)"
else
  echo "already exists, left untouched"
fi

echo "[5/6] Starting Jenkins..."
docker compose -f "$REPO_DIR/jenkins/docker-compose.yml" --env-file "$J_ENV" up -d --build

echo "[6/6] Done."
cat <<MSG

NEXT STEPS
  1. Log out and back in once (so your user can run docker without sudo).
  2. Edit your app secrets:   nano $APP_DIR/.env
     (set DOMAIN, VAPI_API_KEY, VITE_VAPI_PUBLIC_KEY, GROQ_API_KEY, ...)
  3. First deploy:            bash deploy/deploy.sh
     After that, every git push to your main branch deploys through Jenkins.
  4. Open Jenkins from your laptop through an SSH tunnel (see DEPLOYMENT.md).
MSG
