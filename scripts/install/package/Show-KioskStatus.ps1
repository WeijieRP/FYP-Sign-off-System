# Owner: Role 3, Jun Kai.
# kiosk-status.cmd: what is installed, whether MySQL and the servers run, and what install.cmd added to Windows.
# Changes nothing.
# <Jun Kai start>
. (Join-Path $PSScriptRoot 'KioskCommon.ps1')
$app = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$root = Split-Path $app -Parent
$info = Get-InstallInfo $root
Write-Host ''
Write-Host 'RP Xperience Centre Kiosk status' -ForegroundColor White
if (-not $info) { Write-Bad "no install record in $root\data"; exit 1 }
$version = Read-JsonFile (Join-Path $app 'version.json')
Write-Ok "build $($info.build) in $root ($($info.role)), installed $($info.installedAt), updated $($info.updatedAt)"
if ($version) { Write-Info "Node.js $($version.node), MySQL $($info.mysqlVersion), commit $($version.commit)" }
if ($info.mode -eq 'service') {
    $state = Get-ServiceState
    if ($state -eq 'Running') { Write-Ok "MySQL service $ServiceName is running (port $($info.mysqlPort))" }
    elseif ($state) { Write-Bad "MySQL service $ServiceName is $state; start-kiosk.cmd starts it" }
    else { Write-Bad "MySQL service $ServiceName is missing: run install.cmd again to repair" }
} elseif (Test-TcpOpen ([int]$info.mysqlPort)) { Write-Ok "MySQL answers on port $($info.mysqlPort) (a program of this user)" }
else { Write-Note "MySQL is not running; start-kiosk.cmd starts it" }
$nodes = @(Get-KioskProcesses $root @('node.exe'))
if ($nodes.Count -and (Test-TcpOpen ([int]$info.port))) { Write-Ok "the kiosk servers run ($($nodes.Count) node process(es)); admin page https://localhost:$($info.port)/admin" }
else { Write-Note "the kiosk servers are not running; start them with $app\start-kiosk.cmd" }
foreach ($it in @($info.items)) {
    $there = $true
    switch ($it.type) {
        'firewall' { $there = [bool](Get-NetFirewallRule -Name $it.id -ErrorAction SilentlyContinue) }
        'shortcut' { $there = Test-Path -LiteralPath $it.id }
        'service' { $there = [bool](Get-Service -Name $it.id -ErrorAction SilentlyContinue) }
    }
    if ($there) { Write-Ok $it.text } else { Write-Bad "missing: $($it.text) (install.cmd repairs it)" }
}
$public = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { "$($_.NetworkCategory)" -eq 'Public' })
if ($public.Count -and $info.role -eq 'WallPC') { Write-Note "Windows treats the network `"$($public[0].Name)`" as Public: the firewall rule does not apply there, so tablets cannot connect until it is set to Private" }
$logs = Join-Path $root 'data\logs'
if (Test-Path -LiteralPath $logs) {
    $last = Get-ChildItem -LiteralPath $logs -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($last) { Write-Info "Last install log: $($last.FullName)" }
}
exit 0
# <Jun Kai end>
