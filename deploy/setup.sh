#!/usr/bin/env bash
# One-time (and repeatable) server setup for INKUBIO on Ubuntu 22.04/24.04, run as root.
#   bash setup.sh <domain>
# <domain> — your domain, or <ip>.sslip.io when there is none yet (HTTPS works with both).
set -euo pipefail
DOMAIN="${1:?usage: setup.sh <domain>}"
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -y -q
apt-get install -y -q curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw >/dev/null

echo "== Node.js 22 LTS"
if ! command -v node >/dev/null || [ "$(node -v | sed 's/^v//; s/\..*//')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -q nodejs >/dev/null
fi
node -v

echo "== Caddy (web server with automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -q && apt-get install -y -q caddy >/dev/null
fi
caddy version

echo "== user and folders"
id inkubio >/dev/null 2>&1 || useradd --system --home /opt/inkubio --shell /usr/sbin/nologin inkubio
mkdir -p /opt/inkubio/app /var/lib/inkubio
chown -R inkubio:inkubio /var/lib/inkubio
[ -f /opt/inkubio/.env ] || install -m 600 /dev/null /opt/inkubio/.env

echo "== service"
install -m 644 /tmp/inkubio/inkubio.service /etc/systemd/system/inkubio.service
sed "s/__DOMAIN__/${DOMAIN}/g" /tmp/inkubio/Caddyfile > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable inkubio caddy >/dev/null 2>&1

echo "== firewall: only SSH, HTTP, HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | head -n 8

echo "== setup done for ${DOMAIN}"
