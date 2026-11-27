#!/usr/bin/env bash
# Puts the uploaded site live: unpack, install dependencies, switch, restart. Run as root after setup.sh.
set -euo pipefail
NEW=/opt/inkubio/app.new
rm -rf "$NEW" && mkdir -p "$NEW"
tar -xzf /tmp/inkubio/site.tgz -C "$NEW"
cd "$NEW"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
chown -R root:root "$NEW"
# readable by the site service user, whatever permissions the archive carried
chmod -R u=rwX,go=rX "$NEW"
# a new .env from the laptop, when one was uploaded (passwords stay out of the archive)
if [ -f /tmp/inkubio/env ]; then install -m 600 /tmp/inkubio/env /opt/inkubio/.env; rm -f /tmp/inkubio/env; fi
rm -rf /opt/inkubio/app.old
[ -d /opt/inkubio/app ] && mv /opt/inkubio/app /opt/inkubio/app.old
mv "$NEW" /opt/inkubio/app
systemctl restart inkubio
systemctl reload caddy || systemctl restart caddy
sleep 2
systemctl is-active --quiet inkubio && echo "== site is running" || { journalctl -u inkubio -n 30 --no-pager; exit 1; }
journalctl -u inkubio -n 6 --no-pager -o cat
