# Owner: Role 3, Jun Kai.
# Run by start-kiosk.cmd before the servers: makes sure this install's own MySQL answers (the service, or mysqld as
# a hidden program of this user). Exit code 0 when it answers.
# <Jun Kai start>
. (Join-Path $PSScriptRoot 'KioskCommon.ps1')
$app = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$root = Split-Path $app -Parent
$info = Get-InstallInfo $root
if (-not $info) { Write-Host "No install record in $root\data: start the kiosk from a folder made by install.cmd."; exit 1 }
$port = [int]$info.mysqlPort
if (Test-TcpOpen $port) { exit 0 }
Write-Host "Starting the kiosk's MySQL (port $port)..."
if (Start-KioskMySql $root $port $info.mode) { exit 0 }
if ($info.mode -eq 'service') { Write-Host "The service $ServiceName did not start. See $root\mysql-data\mysqld.err (administrators), or Services (services.msc)." }
else { Write-Host "MySQL did not start. See $root\mysql-data\mysqld.err." }
exit 1
# <Jun Kai end>
