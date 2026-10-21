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
python3 <<'PY'
import json, os, urllib.request

email = os.environ["NPM_EMAIL"]
password = os.environ["NPM_PASS"]
domain = os.environ["DOMAIN"]
upstream_host = os.environ["UPSTREAM_HOST"]
upstream_port = int(os.environ["UPSTREAM_PORT"])
base = "http://127.0.0.1:81/api"

def api(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())

token = api("POST", "/tokens", {"identity": email, "secret": password})["token"]
hosts = api("GET", "/nginx/proxy-hosts", token=token)
host_id = next((h["id"] for h in hosts if domain in h.get("domain_names", [])), None)

host_body = {
    "domain_names": [domain],
    "forward_scheme": "http",
    "forward_host": upstream_host,
    "forward_port": upstream_port,
    "access_list_id": 0,
    "block_exploits": True,
    "allow_websocket_upgrade": True,
    "http2_support": True,
    "advanced_config": "",
    "enabled": True,
    "caching_enabled": False,
    "hsts_enabled": False,
    "hsts_subdomains": False,
    "locations": [],
}

if host_id is None:
    create = {**host_body, "certificate_id": 0, "ssl_forced": False}
    host_id = api("POST", "/nginx/proxy-hosts", create, token=token)["id"]
    print(f"Created NPM proxy host {host_id} for {domain}")

certs = api("GET", "/nginx/certificates", token=token)
cert_id = next((c["id"] for c in certs if domain in c.get("domain_names", [])), None)
if cert_id is None:
    cert_id = api(
        "POST",
        "/nginx/certificates",
        {"provider": "letsencrypt", "domain_names": [domain], "meta": {"dns_challenge": False}},
        token=token,
    )["id"]
    print(f"Issued certificate {cert_id} for {domain}")

final = {**host_body, "certificate_id": cert_id, "ssl_forced": True}
api("PUT", f"/nginx/proxy-hosts/{host_id}", final, token=token)
print(f"Updated NPM proxy host {host_id} (TLS on, cert {cert_id})")
PY
REMOTE

ssh root@85.17.145.58 "HOSTINGER_API_TOKEN='${HOSTINGER_API_TOKEN}' python3" <<'PY'
import json, os, urllib.error, urllib.request

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
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("Hostinger DNS:", r.read().decode()[:200])
except urllib.error.HTTPError as e:
    if e.code == 422:
        print("Hostinger DNS: A record already present (422), continuing.")
    else:
        raise
PY

echo "Done. Check https://${DOMAIN}"
