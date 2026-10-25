# Кладёт публичный SSH-ключ компьютера на телевизор с Homebrew Channel.
# Спросит пароль root (стандартный у Homebrew Channel — alpine). Нужно один раз.
# Запуск: & .\scripts\tv-add-key.ps1 192.168.0.11
param([Parameter(Mandatory = $true)][string]$Ip)

$pub = Join-Path $env:USERPROFILE '.ssh\webos_tv.pub'
if (-not (Test-Path $pub)) { Write-Error "Key not found: $pub"; exit 1 }

Get-Content $pub | ssh -o StrictHostKeyChecking=accept-new "root@$Ip" "mkdir -p /home/root/.ssh && cat >> /home/root/.ssh/authorized_keys && chmod 600 /home/root/.ssh/authorized_keys && echo KEY_ADDED"
