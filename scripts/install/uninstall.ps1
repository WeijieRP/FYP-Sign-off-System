# Owner: Role 3, Jun Kai.
# RP Xperience Centre Kiosk uninstaller for Windows (task-sheet point 5). Double-click uninstall.cmd in the project folder; it runs this.
#   uninstall.cmd                stops the kiosk and removes what install.cmd added to Windows: the logon start, the
#                                desktop link and the firewall rule (Windows asks for administrator rights for the rule)
#   uninstall.cmd -RemoveData    also drops the database (you type its name to confirm) and deletes backend\data (but
#                                not the archive zips in backend\data\archives), backend\cache and logs. backend\.env
#                                stays: its key is the only one that opens those archives.
#   uninstall.cmd -DryRun        prints every step it would take, changes nothing
# Also: -NonInteractive (no questions; with -RemoveData the name must come from -ConfirmDatabase).
# Hibernate and wake timers belong to Role 4 (Ryan) and are not touched here.
# The program folder stays; delete it by hand afterwards if it should go too.
# <Jun Kai start>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$NonInteractive,
    [switch]$RemoveData,
    [string]$ConfirmDatabase,
    [switch]$AdminSteps
)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location $Root

# The database this copy uses, read the way the servers read it (a DB_NAME in the environment wins)
function Get-DatabaseName {
    if ($env:DB_NAME) { return $env:DB_NAME }
    $name = ''
    $envFile = Join-Path $Root 'backend\.env'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) { if ($line -match '^\s*DB_NAME\s*=\s*([^#\s]*)') { $name = $Matches[1].Trim('"', "'") } }
    }
    if ($name) { return $name }
    return 'dp_kiosk_db'
}

# The Startup shortcut belongs to this copy when it starts the kiosk from this folder
function Test-OwnStartupLink { return (Test-OwnLink $StartupLink) }

# The administrator part: the firewall rule
function Remove-AdminSteps {
    if (@(Get-FirewallRules).Count -gt 0) {
        Invoke-Change "remove the firewall rule `"$FirewallName`"" { Get-FirewallRules | Remove-NetFirewallRule -ErrorAction Stop }
    } else { Write-Info 'no firewall rule to remove' }
}

if ($AdminSteps) {
    Write-Step 'Firewall rule (administrator)'
    if (-not (Test-Admin)) { Write-Bad 'this part needs administrator rights'; exit 1 }
    Remove-AdminSteps
    Start-Sleep -Seconds 3
    exit 0
}

Write-Host ''
Write-Host 'RP Xperience Centre Kiosk uninstaller' -ForegroundColor White
Write-Host "Folder: $Root"
if ($DryRun) { Write-Host 'Dry run: nothing is changed.' -ForegroundColor DarkGray }
$failed = $false

Write-Step 'Stop the kiosk'
$running = @(Get-KioskProcesses)
if ($running.Count -eq 0) { Write-Ok 'the kiosk is not running from this folder' }
else {
    $ids = ($running | ForEach-Object { $_.ProcessId }) -join ', '
    if ($DryRun) { Write-Host "   would stop $($running.Count) node process(es) started from this folder (ids $ids)" -ForegroundColor DarkGray }
    elseif (Confirm-Choice "Stop the kiosk ($($running.Count) node process(es) started from this folder)?" $true) {
        $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Write-Ok "stopped the kiosk (ids $ids)"
    } else {
        Write-Bad 'the kiosk has to stop first; nothing was removed'
        exit 1
    }
}

Write-Step 'Logon start and desktop link'
if (Test-OwnStartupLink) { Invoke-Change 'remove the logon start (Startup folder shortcut)' { Remove-Item -LiteralPath $StartupLink -Force } }
elseif (Test-Path $StartupLink) { Write-Note 'the Startup shortcut "RP Xperience Centre Kiosk" starts a copy in another folder: left alone' }
else { Write-Info 'no logon start to remove' }
if (Test-Path $DesktopLink) { Invoke-Change 'remove the desktop link to the admin page' { Remove-Item -LiteralPath $DesktopLink -Force } }
# <Jun Kai start> what an install under the old name left behind
if (Test-OwnLink $OldStartupLink) { Invoke-Change 'remove the logon start made under the old name' { Remove-Item -LiteralPath $OldStartupLink -Force } }
if (Test-Path $OldDesktopLink) { Invoke-Change 'remove the desktop link made under the old name' { Remove-Item -LiteralPath $OldDesktopLink -Force } }
# <Jun Kai end>
else { Write-Info 'no desktop link to remove' }

Write-Step 'Firewall rule'
if (@(Get-FirewallRules).Count -eq 0) { Write-Info 'no firewall rule to remove' }
elseif ($DryRun -or (Test-Admin)) { Remove-AdminSteps }
elseif ($NonInteractive) { Write-Note 'not running as administrator: the firewall rule is left (run uninstall.cmd as administrator)' }
else {
    Write-Info 'Windows now asks for administrator rights for this step.'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-AdminSteps', '-NonInteractive')
    try {
        $elevated = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait -PassThru -ErrorAction Stop
        if ($elevated.ExitCode -ne 0) { Write-Bad "the administrator step failed (exit code $($elevated.ExitCode))"; $failed = $true }
        elseif (@(Get-FirewallRules).Count -eq 0) { Write-Ok 'firewall rule removed' }
    } catch {
        Write-Note 'administrator rights were not given: the firewall rule is left (run uninstall.cmd again to retry)'
    }
}

if ($RemoveData) {
    Write-Step 'Data: the database and the runtime folders'
    $database = Get-DatabaseName
    Write-Note "this drops the database $database (every visitor, feedback, pledge and setting in it) and deletes"
    Write-Info 'backend\data (keeping the archive zips in backend\data\archives), backend\cache and logs. It cannot be'
    Write-Info 'undone: save an archive first (admin page, Visitor Data Archive) if the records may be needed again.'
    $typed = $ConfirmDatabase
    if (-not $typed -and $DryRun) { $typed = $database }
    if (-not $typed -and -not $NonInteractive) { $typed = Read-Host "         Type the database name ($database) to drop it, or press Enter to keep it" }
    if ($typed -cne $database) { Write-Info 'the database and the data folders are kept (the name was not typed)' }
    else {
        $setupArgs = @('remove-data', '--database', $typed)
        if ($DryRun) { $setupArgs += '--dry-run' }
        if ($NonInteractive) { $setupArgs += '--non-interactive' }
        & node $SetupJs @setupArgs
        if ($LASTEXITCODE -ne 0) { Write-Bad 'removing the data did not finish (see above)'; $failed = $true }
    }
}

Write-Step 'Done'
if ($DryRun) { Write-Host '   Dry run finished: nothing was changed.' }
elseif ($failed) { Write-Bad 'some steps did not finish (see above)' }
else { Write-Ok 'uninstalled' }
Write-Info 'Still here, on purpose:'
Write-Info "- this folder $Root (program files, uploads\photos, the archive zips in backend\data\archives, and backend\.env"
Write-Info '  with the key that opens them)'
if (-not $RemoveData) { Write-Info '- the database and backend\data (uninstall.cmd -RemoveData removes them)' }
Write-Info '- the MySQL user of the kiosk, and Node.js, MySQL and Ollama themselves (Settings > Apps, if nothing else uses them)'
Write-Info 'To remove the program as well: close this window and delete the folder.'
Write-Host ''
if ($failed) { exit 1 }
exit 0
# <Jun Kai end>
