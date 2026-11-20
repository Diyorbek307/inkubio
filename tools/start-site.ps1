# Публикует сайт INKUBIO с этого компьютера: запускает сайт и выдаёт публичную ссылку https://….trycloudflare.com.
# Запускается двойным щелчком по «Запустить сайт.cmd». Сайт работает, пока открыто это окно.
# Раз в минуту окно проверяет ссылку; если Cloudflare её закрыл — берёт новую и присылает её в Telegram (если он подключён).
param(
  [switch]$Check,     # только запустить, проверить ссылку и выключить (без браузера и буфера обмена)
  [switch]$SelfTest,  # проверка сторожа: оборвать туннель, дождаться новой ссылки и выключить (в Telegram ничего не уходит)
  [int]$Port = 5180
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = 'INKUBIO — сайт в интернете'
$root = Split-Path $PSScriptRoot -Parent
$cf = Join-Path $env:LOCALAPPDATA 'inkubio\cloudflared.exe'
$logDir = Join-Path $env:LOCALAPPDATA 'inkubio'
$siteLog = Join-Path $logDir 'site.log'
$linkFile = Join-Path $root 'ссылка на сайт.txt'
$quiet = $Check -or $SelfTest
New-Item -ItemType Directory -Force $logDir | Out-Null

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Say "`n$text" Red; if (-not $quiet) { Read-Host "`nНажмите Enter, чтобы закрыть" }; exit 1 }
function Now { Get-Date -Format 'HH:mm' }

function Read-EnvValue($key) {
  $f = Join-Path $root '.env'
  if (-not (Test-Path $f)) { return '' }
  foreach ($l in [IO.File]::ReadAllLines($f)) { if ($l -match "^\s*$key\s*=\s*(.*?)\s*$") { return $matches[1].Trim('"', "'") } }
  return ''
}
# $true = sent (or Telegram isn't set up, so there is nothing to retry); $false = try again later
function Send-Telegram($text) {
  $token = Read-EnvValue 'TELEGRAM_BOT_TOKEN'
  $chat = Read-EnvValue 'TELEGRAM_CHAT_ID'
  if (-not $token -or -not $chat) { return $true }
  if ($SelfTest) { Say "  (проверка) в Telegram ушло бы: $($text -replace "`n", ' ')"; return $true }
  if ($Check) { return $true }
  try {
    $body = [Text.Encoding]::UTF8.GetBytes((@{ chat_id = $chat; text = $text } | ConvertTo-Json -Compress))
    Invoke-WebRequest "https://api.telegram.org/bot$token/sendMessage" -Method Post -Body $body -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 15 | Out-Null
    Say '  Ссылка отправлена в Telegram.' Green
    return $true
  } catch { return $false }
}

function Start-Site {
  $env:PORT = "$Port"
  $env:TRUST_PROXY = 'cloudflare'  # защита от спама видит настоящий адрес каждого посетителя
  $p = Start-Process node -ArgumentList '--env-file-if-exists=.env', 'server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $siteLog -RedirectStandardError "$siteLog.err"
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if ($p.HasExited) { throw ("Сайт не запустился:`n" + (Get-Content "$siteLog.err" -Raw)) }
    try { if ((Invoke-WebRequest "http://127.0.0.1:$Port/robots.txt" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { return $p } } catch { }
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  throw 'Сайт не ответил за 20 секунд.'
}

# Starts cloudflared and waits until the new link really works on the internet. Returns $null if it couldn't.
function Start-Tunnel {
  $log = Join-Path $logDir ('tunnel-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
  $p = Start-Process $cf -ArgumentList 'tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port", '--logfile', $log -WindowStyle Hidden -PassThru
  $url = $null
  for ($i = 0; $i -lt 90 -and -not $url -and -not $p.HasExited; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  $t = [pscustomobject]@{ Proc = $p; Log = $log; Url = $url; Host = $null; Ip = $null }
  if (-not $url) { Stop-Tunnel $t; return $null }
  # A new link takes ~10–30 s to appear on the internet. Asking Windows too early makes it remember
  # "no such address" for minutes, so: wait for the tunnel to connect, then ask a public DNS (1.1.1.1) directly.
  $t.Host = ([Uri]$url).Host
  for ($i = 0; $i -lt 60; $i++) {
    if (Select-String -Path $log -Pattern 'Registered tunnel connection' -Quiet -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Milliseconds 500
  }
  for ($i = 0; $i -lt 30; $i++) {
    if (Test-Link $t) { return $t }
    Start-Sleep -Seconds 2
  }
  Stop-Tunnel $t
  return $null
}
function Stop-Tunnel($t) {
  if (-not $t) { return }
  if (-not $t.Proc.HasExited) { Stop-Process -Id $t.Proc.Id -Force -ErrorAction SilentlyContinue; $t.Proc.WaitForExit(5000) | Out-Null }
  Remove-Item $t.Log -Force -ErrorAction SilentlyContinue
}
# the same check a visitor makes, pinned to the public DNS answer
function Test-Link($t) {
  if (-not $t.Ip) {
    try { $t.Ip = (Resolve-DnsName $t.Host -Server 1.1.1.1 -Type A -DnsOnly -ErrorAction Stop | Where-Object IPAddress | Select-Object -First 1).IPAddress } catch { return $false }
    if (-not $t.Ip) { return $false }
  }
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 20 --resolve "$($t.Host):443:$($t.Ip)" "$($t.Url)/"
  return $code -eq '200'
}
function Save-Link($url) {
  if ($quiet) { return }
  Set-Content -Path $linkFile -Encoding UTF8 -Value ("$url`r`n`r`nСсылка работает, пока на ноутбуке открыто окно «INKUBIO — сайт в интернете».`r`n" +
    "Если Cloudflare её закроет, окно само возьмёт новую, запишет сюда и пришлёт в Telegram.`r`nОбновлено: " + (Get-Date -Format 'dd.MM.yyyy HH:mm'))
}

Say "`n  INKUBIO — запуск сайта`n" Yellow

# 1. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Не найден Node.js. Установите его с https://nodejs.org (версия LTS) и запустите снова.' }
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Say '  Устанавливаю зависимости (один раз)...'
  Push-Location $root; npm install --omit=dev --no-audit --no-fund --loglevel=error; Pop-Location
}

# 2. cloudflared — программа Cloudflare, которая даёт публичную ссылку
if (-not (Test-Path $cf)) {
  Say '  Скачиваю cloudflared с официальной страницы Cloudflare (~55 МБ, один раз)...'
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cf -UseBasicParsing
  if ((Get-AuthenticodeSignature $cf).Status -ne 'Valid') { Remove-Item $cf; Fail 'Подпись cloudflared не прошла проверку — файл удалён.' }
}
# old tunnel logs from earlier runs
Get-ChildItem $logDir -Filter 'tunnel-*.log' -ErrorAction SilentlyContinue | Where-Object LastWriteTime -lt (Get-Date).AddDays(-2) | Remove-Item -Force -ErrorAction SilentlyContinue

# Leftovers of an earlier run whose window was closed with ✕ (then nothing stops them): they hold the port and the log files.
$owners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object OwningProcess)
$stale = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='cloudflared.exe'" | Where-Object {
  ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine -like "*--url http://127.0.0.1:$Port *") -or
  ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*' -and $owners -contains $_.ProcessId)
})
if ($stale.Count) {
  Say '  Выключаю сайт, оставшийся от прошлого запуска...'
  $stale | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { Fail "Порт $Port занят другой программой. Перезагрузите компьютер и запустите снова." }

$site = $null
$t = $null
try {
  # 3. сайт
  Say "  Запускаю сайт на порту $Port..."
  try { $site = Start-Site } catch { Fail $_.Exception.Message }

  # 4. ссылка
  Say '  Получаю публичную ссылку (обычно 20–40 секунд)...'
  $t = Start-Tunnel
  if (-not $t) { Fail 'Не удалось получить рабочую ссылку. Проверьте интернет и запустите снова.' }
  if ($Check) { Say "  CHECK url=$($t.Url) ip=$($t.Ip) http=200"; return }

  Save-Link $t.Url
  $pending = "✅ Сайт INKUBIO в интернете:`n$($t.Url)"
  if (-not $quiet) {
    Set-Clipboard -Value $t.Url
    Start-Process $t.Url
  }
  Say "`n  ================================================================" Green
  Say "   Сайт в интернете:  $($t.Url)" Green
  Say "  ================================================================" Green
  Say "`n   Ссылка уже скопирована — можно вставить в Telegram или WhatsApp."
  Say "   Она же записана в файл «ссылка на сайт.txt» в папке сайта."
  Say "`n   Сайт работает, пока открыто ЭТО окно и ноутбук не спит." Yellow
  Say "   Если ссылка оборвётся, окно само возьмёт новую и пришлёт её в Telegram." Yellow
  Say "   Выключить сайт: нажмите Enter в этом окне.`n" Yellow
  Say "   Свернуть окно можно, закрывать крестиком не нужно.`n" Yellow
  if ($pending -and (Send-Telegram $pending)) { $pending = $null }

  # 5. сторож: раз в минуту проверить сайт и ссылку
  $interval = if ($SelfTest) { 5 } else { 60 }
  $fails = 0
  $broke = $false
  while ($true) {
    for ($s = 0; $s -lt $interval; $s++) {
      Start-Sleep -Seconds 1
      try { while ([Console]::KeyAvailable) { if ([Console]::ReadKey($true).Key -eq 'Enter') { return } } } catch { }
    }
    if ($SelfTest -and -not $broke) { Stop-Process -Id $t.Proc.Id -Force; $broke = $true; Say '  (проверка) туннель оборван вручную' }
    if ($pending -and (Send-Telegram $pending)) { $pending = $null }

    if ($site.HasExited) {
      Say "  $(Now) Сайт остановился — запускаю снова..." Yellow
      try { $site = Start-Site; Say "  $(Now) Сайт снова работает." Green } catch { Say "  $($_.Exception.Message)" Red }
    }

    $dead = $t.Proc.HasExited -or (Select-String -Path $t.Log -Pattern 'Tunnel not found' -Quiet -ErrorAction SilentlyContinue)
    if (-not $dead) {
      if (Test-Link $t) { $fails = 0 } else { $fails++ }
      $dead = $fails -ge 3
    }
    if (-not $dead) { continue }

    Say "  $(Now) Ссылка перестала работать — получаю новую..." Yellow
    Stop-Tunnel $t
    $n = Start-Tunnel
    if (-not $n) { Say "  $(Now) Не получилось (нет интернета?). Попробую снова через минуту." Red; continue }
    $t = $n
    $fails = 0
    Save-Link $t.Url
    Say "  $(Now) Новая ссылка:  $($t.Url)" Green
    $pending = "🔗 Ссылка на сайт INKUBIO сменилась — старая больше не работает. Новая:`n$($t.Url)"
    if (Send-Telegram $pending) { $pending = $null }
    if ($SelfTest) { Say "  CHECK restarted url=$($t.Url) ip=$($t.Ip) http=200"; return }
  }
}
finally {
  if ($t) { Stop-Tunnel $t }
  if ($site -and -not $site.HasExited) { Stop-Process -Id $site.Id -Force -ErrorAction SilentlyContinue }
  Say '  Сайт выключен.'
}
