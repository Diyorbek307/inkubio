# Publishes the site to the VPS. Run from PowerShell on this laptop:
#   .\deploy\deploy.ps1 -Server 1.2.3.4                      # first time and every update
#   .\deploy\deploy.ps1 -Server 1.2.3.4 -Domain inkubio.uz   # once a domain points to the server
# Uses the key ~/.ssh/inkubio_deploy (its .pub part is added to the server in the hosting panel).
param(
  [Parameter(Mandatory = $true)] [string]$Server,
  [string]$Domain = '',
  [string]$User = 'root',
  [switch]$SkipSetup
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$key = Join-Path $env:USERPROFILE '.ssh\inkubio_deploy'
if (-not (Test-Path $key)) { throw "Нет ключа $key" }
# no domain yet: <ip>.sslip.io points to the server and gets a real HTTPS certificate
if (-not $Domain) { $Domain = "$Server.sslip.io" }
$target = "$User@$Server"
$opts = @('-i', $key, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=20', '-o', 'BatchMode=yes')
$sudo = if ($User -eq 'root') { '' } else { 'sudo ' }

Write-Host "== packing the site"
$tmp = Join-Path $env:TEMP 'inkubio-deploy'
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory $tmp | Out-Null
# promo videos, local passwords, orders and tools stay on the laptop
tar -czf "$tmp\site.tgz" -C $root --exclude=./node_modules --exclude=./promo --exclude=./.env --exclude=./orders.csv --exclude=./.claude --exclude=./deploy --exclude=./tools --exclude='./Запустить сайт.cmd' --exclude='./ссылка на сайт.txt' --exclude='*.log' .
if ($LASTEXITCODE) { throw 'tar failed' }
foreach ($f in 'setup.sh', 'release.sh', 'inkubio.service', 'Caddyfile') { Copy-Item (Join-Path $PSScriptRoot $f) $tmp }
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) { Copy-Item $envFile (Join-Path $tmp 'env'); Write-Host '   .env will be uploaded (mail / Telegram / admin password)' }
Write-Host ("   {0:N1} MB" -f ((Get-Item "$tmp\site.tgz").Length / 1MB))

Write-Host "== uploading to $Server"
ssh @opts $target "${sudo}rm -rf /tmp/inkubio && mkdir -p /tmp/inkubio && ${sudo}chown `$(id -u) /tmp/inkubio"
if ($LASTEXITCODE) { throw "Нет доступа к серверу $Server (ключ добавлен? пользователь $User?)" }
scp @opts (Get-ChildItem $tmp).FullName "${target}:/tmp/inkubio/"
if ($LASTEXITCODE) { throw 'upload failed' }
Remove-Item -Recurse -Force $tmp

$cmd = "sed -i 's/\r$//' /tmp/inkubio/*.sh /tmp/inkubio/inkubio.service /tmp/inkubio/Caddyfile && "
if (-not $SkipSetup) { $cmd += "${sudo}bash /tmp/inkubio/setup.sh $Domain && " }
$cmd += "${sudo}bash /tmp/inkubio/release.sh"
Write-Host "== installing"
ssh @opts $target $cmd
if ($LASTEXITCODE) { throw 'install failed' }

Write-Host "== checking https://$Domain"
for ($i = 0; $i -lt 20; $i++) {
  try {
    $r = Invoke-WebRequest "https://$Domain/" -UseBasicParsing -TimeoutSec 15
    if ($r.StatusCode -eq 200) { Write-Host "OK: https://$Domain" -ForegroundColor Green; exit 0 }
  } catch { Start-Sleep -Seconds 6 }
}
Write-Host "Сайт установлен, но https://$Domain пока не отвечает (сертификат может выпускаться ещё минуту)." -ForegroundColor Yellow
