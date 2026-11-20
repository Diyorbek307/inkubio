# Подключает уведомления о заявках в Telegram: спрашивает токен бота, находит ваш чат,
# присылает проверочное сообщение и записывает настройки в .env.
# Запускается двойным щелчком по «Подключить Telegram.cmd». Токен при вводе скрыт звёздочками.
param(
  [string]$TestToken,                           # только для проверки скрипта: токен без ввода с клавиатуры
  [string]$ApiBase = 'https://api.telegram.org',
  [string]$EnvFile
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = 'INKUBIO — заявки в Telegram'
$root = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $root '.env' }
$testing = [bool]$TestToken

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Done($code) { if (-not $testing) { Read-Host "`nНажмите Enter, чтобы закрыть" | Out-Null }; exit $code }
function Fail($text) { Say "`n  $text" Red; Done 1 }

# Telegram Bot API call. Returns Telegram's answer, or @{ ok = $false; code = <HTTP status, 0 = no connection>; why = <text> }.
function Tg($token, $method, $body) {
  try {
    $p = @{ Uri = "$ApiBase/bot$token/$method"; UseBasicParsing = $true; TimeoutSec = 40 }
    if ($body) {
      $p.Method = 'Post'
      $p.ContentType = 'application/json; charset=utf-8'
      $p.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
    }
    $r = Invoke-WebRequest @p
    return [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { return @{ ok = $false; code = [int]$resp.StatusCode; why = $_.Exception.Message } }
    return @{ ok = $false; code = 0; why = $_.Exception.Message }
  }
}

function Get-EnvValue($lines, $key) {
  foreach ($l in $lines) { if ($l -match "^\s*$key\s*=\s*(.*?)\s*$") { return $matches[1].Trim('"', "'") } }
  return ''
}
# Sets KEY=value in place of the first KEY line (commented or not) and drops any other KEY lines.
function Set-EnvValue([Collections.Generic.List[string]]$lines, $key, $value) {
  $hits = @(for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match "^\s*#?\s*$key\s*=") { $i } })
  if (-not $hits.Count) { $lines.Add("$key=$value"); return }
  $lines[$hits[0]] = "$key=$value"
  for ($j = $hits.Count - 1; $j -ge 1; $j--) { $lines.RemoveAt($hits[$j]) }
}

Say "`n  INKUBIO — заявки в Telegram`n" Yellow
$lines = New-Object 'Collections.Generic.List[string]'
if (Test-Path $EnvFile) { $lines.AddRange([IO.File]::ReadAllLines($EnvFile)) }

# 1. Бот
$token = ''
$me = $null
$old = Get-EnvValue $lines 'TELEGRAM_BOT_TOKEN'
if ($old -and -not $testing) {
  $r = Tg $old 'getMe'
  if ($r.ok) {
    Say "  В настройках уже есть бот @$($r.result.username)."
    $a = Read-Host '  Оставить его? Enter — да, «н» — подключить другого бота'
    if ($a -notmatch '^\s*[нНnN]') { $token = $old; $me = $r }
  }
}
if (-not $token) {
  Say '  1. Откройте в Telegram @BotFather и отправьте ему /newbot.'
  Say '     Придумайте имя бота и адрес, который кончается на bot (например inkubio_zayavki_bot).'
  Say '  2. BotFather пришлёт токен — строку вида 1234567890:AAH... Скопируйте её.'
  Say ''
  while (-not $token) {
    if ($testing) { $t = $TestToken } else {
      $sec = Read-Host '  Вставьте токен (Ctrl+V или правый щелчок мыши) и нажмите Enter' -AsSecureString
      $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
      try { $t = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }
    $t = $t -replace '\s', ''
    if ($t -notmatch '^\d{5,}:[A-Za-z0-9_-]{30,}$') {
      Say '  Это не похоже на токен: он выглядит как 1234567890:AAH... (цифры, двоеточие, буквы). Попробуйте ещё раз.' Red
      if ($testing) { Done 1 }
      continue
    }
    $r = Tg $t 'getMe'
    if ($r.ok) { $token = $t; $me = $r }
    elseif ($r.code -in 401, 404) {
      Say '  Telegram не принял этот токен. Скопируйте его из @BotFather заново (/mybots → ваш бот → API Token).' Red
      if ($testing) { Done 1 }
    }
    else { Fail "Нет связи с Telegram: $($r.why)`n  Проверьте интернет и запустите снова." }
  }
}

# 2. Чат, куда слать заявки: тот, где боту последним написали
$bot = $me.result.username
Say "`n  Бот @$bot найден." Green
Say "  3. Откройте бота в Telegram: https://t.me/$bot — нажмите «Запустить» (Start) или напишите ему что угодно."
Say '     Хотите, чтобы заявки видела вся команда? Добавьте бота в общую группу и напишите что-нибудь там.'
if (-not $testing) { try { Start-Process "https://t.me/$bot" } catch {} }
Say "`n  Жду сообщения боту (до 5 минут)..."
$chat = $null
$offset = 0
$until = (Get-Date).AddMinutes(5)
while (-not $chat -and (Get-Date) -lt $until) {
  $r = Tg $token "getUpdates?timeout=20&offset=$offset"
  if (-not $r.ok) {
    if ($r.code -eq 409) { Fail 'Этого бота уже использует другая программа (вебхук). Создайте для сайта отдельного бота в @BotFather.' }
    if ($r.code) { Fail "Telegram ответил ошибкой: $($r.why)" }
    Start-Sleep -Seconds 3
    continue
  }
  foreach ($u in $r.result) {
    $offset = $u.update_id + 1
    foreach ($k in 'message', 'edited_message', 'channel_post', 'my_chat_member') { if ($u.$k) { $chat = $u.$k.chat } }
  }
}
if (-not $chat) { Fail "За 5 минут боту никто не написал. Напишите @$bot что-нибудь и запустите этот файл снова." }
Tg $token "getUpdates?timeout=0&offset=$offset" | Out-Null  # отметить сообщения прочитанными

switch ($chat.type) {
  'private' { $where = 'личный чат с ботом (' + ((@($chat.first_name, $chat.last_name) | Where-Object { $_ }) -join ' ') + ')'; $whereTo = $where }
  'channel' { $where = "канал «$($chat.title)»"; $whereTo = $where }
  default { $where = "группа «$($chat.title)»"; $whereTo = "группу «$($chat.title)»" }
}
Say "  Чат найден: $where." Green

# 3. Проверочное сообщение
$r = Tg $token 'sendMessage' @{ chat_id = $chat.id; text = '✅ Готово! Сюда будут приходить заявки с сайта INKUBIO.' }
if (-not $r.ok) {
  if ($chat.type -eq 'channel') { Fail 'Бот не может писать в этот канал. Сделайте бота администратором канала и запустите снова.' }
  Fail "Не получилось отправить проверочное сообщение: $($r.why)"
}

# 4. Сохранить в .env
if (-not (Test-Path $EnvFile)) {
  $lines.Add('# Настройки сайта INKUBIO. Секретный файл: никому не пересылайте и не выкладывайте в интернет.')
  $lines.Add('')
}
Set-EnvValue $lines 'TELEGRAM_BOT_TOKEN' $token
Set-EnvValue $lines 'TELEGRAM_CHAT_ID' "$($chat.id)"
[IO.File]::WriteAllText($EnvFile, (($lines -join "`n").TrimEnd() + "`n"), (New-Object Text.UTF8Encoding $false))

Say "`n  Готово! Заявки будут приходить в $whereTo." Green
Say '  Проверочное сообщение уже в Telegram. Настройки сохранены в файле .env в папке сайта.'
Say "`n  Если сайт сейчас запущен — перезапустите его, чтобы он подхватил настройки:" Yellow
Say '  закройте окно «INKUBIO — сайт в интернете» и снова откройте «Запустить сайт.cmd».'
Done 0
