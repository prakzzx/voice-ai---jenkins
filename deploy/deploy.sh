#!/usr/bin/env bash
# Manual deploy. Does the same thing as the Jenkins pipeline's deploy step.
# Server:   bash deploy/deploy.sh
# Laptop:   ENV_FILE=.env bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_FILE="${ENV_FILE:-/opt/prakati/.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE"; exit 1
fi

COMPOSE="docker compose -p prakati --env-file $ENV_FILE"
$COMPOSE config -q
$COMPOSE up -d --build --remove-orphans
$COMPOSE ps
echo
echo "Check health with:  docker logs -f prakati-backend"
