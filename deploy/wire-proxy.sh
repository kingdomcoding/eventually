#!/usr/bin/env bash
# Run locally: configures NPM + Hostinger DNS for Event Model Blueprint.
set -euo pipefail
DOMAIN="${1:-eventually.josboxoffice.com}"
UPSTREAM_HOST="${2:-172.17.0.1}"
UPSTREAM_PORT="${3:-4822}"
SECRETS="${HOME}/.cursor/secrets/infrastructure.env"
[[ -f "$SECRETS" ]] || { echo "Missing $SECRETS"; exit 1; }
# shellcheck disable=SC1090
source "$SECRETS"

ssh root@85.17.145.58 "NPM_EMAIL='${NPM_ADMIN_EMAIL}' NPM_PASS='${NPM_ADMIN_PASSWORD}' DOMAIN='${DOMAIN}' UPSTREAM_HOST='${UPSTREAM_HOST}' UPSTREAM_PORT='${UPSTREAM_PORT}' bash -s" <<'REMOTE'
set -euo pipefail
TOKEN=$(curl -sf http://127.0.0.1:81/api/tokens \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${NPM_EMAIL}\",\"secret\":\"${NPM_PASS}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

HOSTS=$(curl -sf http://127.0.0.1:81/api/nginx/proxy-hosts -H "Authorization: Bearer ${TOKEN}")
EXISTING=$(echo "$HOSTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((h['id'] for h in d if '${DOMAIN}' in h.get('domain_names',[])), ''))")

PAYLOAD=$(python3 - <<PY
import json
print(json.dumps({
  "domain_names": ["${DOMAIN}"],
  "forward_scheme": "http",
  "forward_host": "${UPSTREAM_HOST}",
  "forward_port": int("${UPSTREAM_PORT}"),
  "access_list": [],
  "certificate_id": "new",
  "ssl_forced": True,
  "http2_support": True,
  "block_exploits": True,
  "allow_websocket_upgrade": True,
  "advanced_config": "",
  "meta": {"letsencrypt_agree": True, "dns_challenge": False},
  "locations": [],
}))
PY
)

if [[ -n "$EXISTING" ]]; then
  curl -sf -X PUT "http://127.0.0.1:81/api/nginx/proxy-hosts/${EXISTING}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" >/dev/null
  echo "Updated NPM proxy host $EXISTING for ${DOMAIN}"
else
  curl -sf -X POST "http://127.0.0.1:81/api/nginx/proxy-hosts" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" >/dev/null
  echo "Created NPM proxy host for ${DOMAIN}"
fi
REMOTE

ssh root@85.17.145.58 "HOSTINGER_API_TOKEN='${HOSTINGER_API_TOKEN}' python3" <<'PY'
import json, os, urllib.request
token = os.environ["HOSTINGER_API_TOKEN"]
body = json.dumps({
  "overwrite": False,
  "zone": [{
    "name": "eventually",
    "type": "A",
    "ttl": 14400,
    "records": [{"content": "85.17.145.58"}],
  }],
}).encode()
req = urllib.request.Request(
    "https://developers.hostinger.com/api/dns/v1/zones/josboxoffice.com",
    data=body,
    method="PUT",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "eventually-deploy/1.0",
    },
)
with urllib.request.urlopen(req, timeout=30) as r:
    print("Hostinger DNS:", r.read().decode()[:200])
PY

echo "Done. Check https://${DOMAIN} (TLS may take a minute)."
