#!/usr/bin/env bash
# Pull latest from GitHub and rebuild the production container.
# Usage (on VPS): bash /opt/eventually/deploy/update-from-github.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/eventually}"
BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE_FILE="${APP_DIR}/deploy/docker-compose.prod.yml"

cd "$APP_DIR"

if [[ ! -d .git ]]; then
  echo "Not a git repository: $APP_DIR" >&2
  exit 1
fi

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

docker compose -p eventually -f "$COMPOSE_FILE" up -d --build

echo "Deploy complete: $(git rev-parse --short HEAD)"
