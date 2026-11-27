#!/usr/bin/env bash
# One command on the server installs or updates the site straight from GitHub (no laptop folder needed):
#   curl -fsSL https://raw.githubusercontent.com/Diyorbek307/inkubio/main/deploy/install.sh | bash -s -- inkubio.com
# The first run asks for the admin panel password (and, optionally, Telegram); later runs just update.
# Run as root on Ubuntu 22.04/24.04. Safe to run again at any time.
set -euo pipefail
DOMAIN="${1:?usage: install.sh <domain>   (e.g. inkubio.com)}"
REPO="${INKUBIO_REPO:-Diyorbek307/inkubio}"
BRANCH="${INKUBIO_BRANCH:-main}"
[ "$(id -u)" = 0 ] || { echo "Run as root (ssh root@server)"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== downloading ${REPO}@${BRANCH}"
command -v curl >/dev/null || { apt-get update -y -q && apt-get install -y -q curl ca-certificates >/dev/null; }
SRC=$(mktemp -d)
chmod 755 "$SRC" # mktemp makes it root-only; the archive root becomes the app folder
trap 'rm -rf "$SRC"' EXIT
curl -fsSL "https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}" | tar -xz -C "$SRC" --strip-components=1
[ -f "$SRC/server.js" ] || { echo "download failed"; exit 1; }

# the same layout deploy.ps1 uploads: /tmp/inkubio/{site.tgz, setup.sh, release.sh, inkubio.service, Caddyfile}
rm -rf /tmp/inkubio && mkdir -p /tmp/inkubio
tar -czf /tmp/inkubio/site.tgz -C "$SRC" --exclude=./deploy --exclude=./tools --exclude=./promo --exclude='./*.cmd' .
cp "$SRC"/deploy/{setup.sh,release.sh,inkubio.service,Caddyfile} /tmp/inkubio/

bash /tmp/inkubio/setup.sh "$DOMAIN"

# settings that stay on the server (not in the site files): admin password, Telegram
ENV=/opt/inkubio/.env
touch "$ENV" && chmod 600 "$ENV"
ask() { # ask <VAR> <question> [secret]
  local v=""
  if [ -r /dev/tty ]; then
    if [ "${3:-}" = secret ]; then read -rsp "$2" v </dev/tty; echo; else read -rp "$2" v </dev/tty; fi
  fi
  [ -n "$v" ] && { sed -i "/^$1=/d" "$ENV"; printf '%s=%s\n' "$1" "$v" >> "$ENV"; }
  return 0
}
if ! grep -q '^ADMIN_PASSWORD=.\{12,\}' "$ENV"; then
  echo "== admin panel (https://${DOMAIN}/admin)"
  while :; do
    ask ADMIN_PASSWORD "Admin password (12+ characters): " secret
    grep -q '^ADMIN_PASSWORD=.\{12,\}' "$ENV" && break
    [ -r /dev/tty ] || { echo "   no terminal: set ADMIN_PASSWORD in $ENV later"; break; }
    echo "   too short, try again"
  done
fi
if ! grep -q '^TELEGRAM_BOT_TOKEN=' "$ENV"; then
  echo "== orders to Telegram (press Enter to skip)"
  ask TELEGRAM_BOT_TOKEN "Bot token from @BotFather: " secret
  grep -q '^TELEGRAM_BOT_TOKEN=' "$ENV" && ask TELEGRAM_CHAT_ID "Chat id: "
fi

bash /tmp/inkubio/release.sh

echo "== checking https://${DOMAIN}"
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null --max-time 10 "https://${DOMAIN}/"; then echo "OK: https://${DOMAIN}  (admin: https://${DOMAIN}/admin)"; exit 0; fi
  sleep 6
done
echo "The site is installed, but https://${DOMAIN} does not answer yet: check that the domain points to this server"
echo "and that ports 80 and 443 are open in the hosting firewall / security group. Then run this command again."
