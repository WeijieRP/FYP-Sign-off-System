# Owner: Role 3, Jun Kai.
# Removes an install made by install.cmd: exactly the items in its record (data\install.json) and nothing else.
# Visitor data (database, photos, settings, keys) is kept in the install folder unless -RemoveData is given and
# confirmed, so a later install.cmd in the same folder picks it up again.
#   uninstall.cmd                                        asks, then removes the kiosk and keeps the visitor data
#   uninstall.cmd -RemoveData                            also deletes all visitor data (asks you to type DELETE)
#   uninstall.cmd -RemoveData -ConfirmDelete DELETE -NonInteractive     the same, unattended
#   uninstall.cmd -DryRun                                prints what it would remove
# Exit codes: 0 removed, 1 something could not be removed (listed), 2 administrator rights refused, 3 nothing to do.
# <Jun Kai start>
[CmdletBinding()]
param(
    [string]$InstallDir,
    [switch]$RemoveData,
    [string]$ConfirmDelete,
    [switch]$DryRun,
    [switch]$NonInteractive
)
. (Join-Path $PSScriptRoot 'KioskCommon.ps1')
$script:NonInteractive = $NonInteractive

function Invoke-MachineRemove([string]$Root, [string]$Rules, [bool]$AlsoData) {
    $resultFile = Join-Path $env:TEMP ('rpk-result-' + [guid]::NewGuid().ToString('N') + '.json')
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (ConvertTo-Arg (Join-Path $PSScriptRoot 'KioskMachine.ps1')), '-Action', 'Remove', '-Root', (ConvertTo-Arg $Root), '-UserSid', (Get-UserSid), '-RuleNames', (ConvertTo-Arg $Rules), '-ResultFile', (ConvertTo-Arg $resultFile), '-LogFile', (ConvertTo-Arg $script:LogFile))
    if ($AlsoData) { $argList += '-RemoveData' }
    try {
        if (Test-Admin) { $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Wait -PassThru -NoNewWindow }
        else {
            Write-Info 'Windows now asks for administrator rights (to remove the MySQL service and the firewall rule).'
            $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait -PassThru -WindowStyle Minimized
        }
    } catch { return [pscustomobject]@{ ok = $false; refused = $true; error = 'administrator rights were not given' } }
    $r = Read-JsonFile $resultFile
    Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue
    if (-not $r) { return [pscustomobject]@{ ok = $false; refused = $false; error = "the administrator step ended (exit code $($p.ExitCode)) without a result" } }
    $r | Add-Member -NotePropertyName refused -NotePropertyValue $false -Force
    return $r
}

function Write-KeptReadme([string]$Root) {
    $text = @(
        'RP Xperience Centre Kiosk: data kept by uninstall.cmd',
        '',
        'The kiosk was removed, but its visitor data was kept here on purpose:',
        '  data\kept\app   settings and keys (backend\.env, backend\data), visitor photos (uploads), logs, uploaded pictures',
        '  mysql-data      the database (only administrators can open this folder)',
        '  data\backups    the database copies made before each update',
        '',
        'To use the data again, run install.cmd of any package with this folder (the default folder, or -InstallDir).',
        'To delete it for good, run uninstall.cmd -RemoveData -InstallDir "' + $Root + '" from a package.',
        'The encryption key in data\kept\app\backend\.env is needed to read stored emails and archive zips.'
    ) -join "`r`n"
    Write-TextFile (Join-Path $Root 'data\README.txt') ($text + "`r`n")
}

# What is still there afterwards: the record's items, plus the usual places a kiosk install could leave something
function Get-Leftovers([string]$Root, $Info, [bool]$DataKept) {
    $left = @()
    if (Test-Path -LiteralPath $Root) {
        $allowed = @()
        if ($DataKept) { $allowed = @('data', 'mysql-data') }
        foreach ($c in @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue)) {
            if ($allowed -notcontains $c.Name) { $left += "folder $($c.FullName)" }
        }
    }
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) { $left += "Windows service $ServiceName" }
    foreach ($it in @($Info.items | Where-Object { $_.type -eq 'firewall' })) {
        if (Get-NetFirewallRule -Name $it.id -ErrorAction SilentlyContinue) { $left += "firewall rule $($it.text)" }
    }
    foreach ($it in @($Info.items | Where-Object { $_.type -eq 'shortcut' })) {
        if (Test-Path -LiteralPath $it.id) { $left += "shortcut $($it.id)" }
    }
    foreach ($link in @($StartupLink, $DesktopLink)) {
        if ((Test-Path -LiteralPath $link) -and (Test-OwnShortcut $link $Root) -and $link -like '*.lnk') { $left += "shortcut $link" }
    }
    foreach ($task in @(Get-ScheduledTask -ErrorAction SilentlyContinue)) {
        foreach ($a in @($task.Actions)) {
            if ($a.Execute -and (Test-InsideRoot $Root ($a.Execute.Trim('"')))) { $left += "scheduled task $($task.TaskPath)$($task.TaskName)" }
        }
    }
    foreach ($p in @(Get-KioskProcesses $Root)) { $left += "running program $($p.Name) (process $($p.ProcessId))" }
    return $left
}

function Invoke-Uninstall {
    Write-Host ''
    Write-Host 'RP Xperience Centre Kiosk uninstaller' -ForegroundColor White
    if ($DryRun) { Write-Host 'Dry run: nothing is changed.' -ForegroundColor DarkGray }
    $root = $InstallDir
    if (-not $root) { $root = "$env:KIOSK_ROOT" }
    if (-not $root) { $root = $DefaultRoot }
    $root = [IO.Path]::GetFullPath($root).TrimEnd('\')
    $info = Get-InstallInfo $root
    if (-not $info) {
        Write-Bad "no install record in $root (data\install.json): nothing was removed. Give the folder with -InstallDir."
        return $ExitRefused
    }
    $app = Join-Path $root 'app'
    $keptOnly = [bool]$info.kept
    if ($keptOnly -and -not $RemoveData) {
        Write-Ok "the kiosk is already removed from $root; only its kept data is there. Add -RemoveData to delete it."
        return $ExitOk
    }

    Write-Step "What is removed from $root"
    foreach ($it in @($info.items)) { Write-Info "- $($it.text)" }
    if ($RemoveData) {
        Write-Note 'ALSO DELETED: the database, visitor photos, settings, encryption keys, logs and backups. This cannot be undone.'
    } else {
        Write-Info "Kept: the database ($root\mysql-data) and the visitor photos, settings and keys (moved to $root\data\kept)."
        Write-Info 'Delete them too with -RemoveData.'
    }
    if ($DryRun) {
        Write-Would 'stop the kiosk servers and the MySQL of this folder'
        if (-not $RemoveData -and -not $keptOnly) { Write-Would "move settings, keys, photos and logs to $root\data\kept" }
        Write-Would 'remove each item listed above'
        Write-Host ''
        Write-Host '   Dry run finished: nothing was changed.'
        return $ExitOk
    }
    if ($RemoveData) {
        if ($ConfirmDelete -ne 'DELETE') {
            if ($NonInteractive) { Write-Bad 'deleting the visitor data needs -ConfirmDelete DELETE: nothing was removed'; return $ExitRefused }
            $typed = Read-Host '         Type DELETE to delete the kiosk and ALL its visitor data'
            Write-Log 'ASK' "type DELETE -> $typed"
            if ($typed -cne 'DELETE') { Write-Info 'not typed: nothing was removed'; return $ExitRefused }
        }
    } elseif (-not (Confirm-Choice 'Remove the kiosk (the visitor data is kept)?' $true)) {
        Write-Info 'nothing was removed'
        return $ExitRefused
    }
    # the log stays in the temp folder when the whole install folder is deleted
    if (-not $RemoveData) { Move-KioskLog $root }

    Write-Step 'Stop the kiosk'
    $n = Stop-KioskServers $root
    Write-Ok "kiosk servers stopped ($n node process(es) of this folder)"
    $mode = "$($info.mode)"
    if ($mode -ne 'service' -and (Test-Path -LiteralPath (Get-MySqlPaths $root).Mysqld)) {
        Stop-KioskMySql $root ([int]$info.mysqlPort) 'process'
        Write-Ok 'MySQL of this folder stopped'
    }

    if (-not $RemoveData -and (Test-Path -LiteralPath $app)) {
        Write-Step 'Keep the visitor data'
        $kept = Join-Path $root 'data\kept\app'
        if (-not (Test-Path -LiteralPath $kept)) { New-Item -ItemType Directory -Path $kept -Force | Out-Null }
        $count = Copy-UserAssets $app $kept
        Move-AppData $app $kept
        Write-KeptReadme $root
        Write-Ok "settings, keys, visitor photos, logs and $count uploaded picture(s) moved to $kept"
    }

    Write-Step 'Remove'
    foreach ($it in @($info.items | Where-Object { $_.type -eq 'shortcut' })) {
        if (Test-OwnShortcut $it.id $root) { Remove-Item -LiteralPath $it.id -Force -ErrorAction SilentlyContinue; Write-Ok "removed $($it.text)" }
        elseif (Test-Path -LiteralPath $it.id) { Write-Note "$($it.id) now starts something else, so it was left alone" }
    }
    $rules = (@($info.items | Where-Object { $_.type -eq 'firewall' } | ForEach-Object { $_.id }) -join ',')
    $needsMachine = ($mode -eq 'service' -or $rules -or @($info.items | Where-Object { $_.type -eq 'service' }).Count -gt 0)
    if ($needsMachine) {
        # the helper first: it stops the service before the folders go
        $r = Invoke-MachineRemove $root $rules ([bool]$RemoveData)
        if ($r.refused) {
            Write-Bad 'administrator rights were not given: the MySQL service, the firewall rule and the MySQL folders are still there. Run uninstall.cmd again and allow it.'
            return $ExitNeedsAdmin
        }
        if (-not $r.ok) { Write-Bad "the administrator step failed: $($r.error)" }
    }
    foreach ($sub in @('app', 'app.new', 'app.old', 'mysql.new', 'mysql.old')) {
        $p = Join-Path $root $sub
        if (Test-Path -LiteralPath $p) { if (Remove-Tree $p) { Write-Ok "removed $p" } else { Write-Bad "$p could not be deleted (is a file in it open?)" } }
    }
    if ($mode -ne 'service') {
        $m = Get-MySqlPaths $root
        if (Test-Path -LiteralPath $m.Base) { if (Remove-Tree $m.Base) { Write-Ok "removed $($m.Base)" } }
        if ($RemoveData -and (Test-Path -LiteralPath $root)) {
            if (Remove-Tree $root) { Write-Ok "removed $root, with the database and the visitor data" } else { Write-Bad "$root could not be deleted (is a file in it open?)" }
        }
    }

    $dataKept = -not $RemoveData
    if ($dataKept -and (Test-Path -LiteralPath $root)) {
        $record = [pscustomobject]@{ kept = $true; keptAt = (Get-Date).ToString('s'); build = $info.build; mode = $info.mode; port = $info.port; mysqlPort = $info.mysqlPort; mysqlVersion = $info.mysqlVersion; root = $root; items = @(@($info.items | Where-Object { $_.id -eq 'root' -or $_.id -eq 'mysql-data' })) }
        Save-InstallInfo $root $record
    }

    Write-Step 'Check that nothing is left'
    $left = @(Get-Leftovers $root $info $dataKept)
    if ($left.Count) {
        foreach ($l in $left) { Write-Bad "still there: $l" }
        Write-Info "Log file: $script:LogFile"
        return $ExitFailed
    }
    if ($dataKept) { Write-Ok "the kiosk is removed; only its visitor data is kept in $root (see $root\data\README.txt)" }
    else { Write-Ok 'nothing of the kiosk is left: no folder, service, shortcut, firewall rule or scheduled task' }
    Write-Info "Log file: $script:LogFile"
    return $ExitOk
}

$null = Start-KioskLog 'uninstall'
if (-not (Enter-InstallLock)) { Write-Bad 'an install or uninstall of the kiosk is running; wait for it to finish'; exit $ExitRefused }
$exitCode = $ExitFailed
try { $exitCode = Invoke-Uninstall } catch { Write-Bad "$($_.Exception.Message)"; $exitCode = $ExitFailed } finally { Exit-InstallLock }
Write-Log 'END' "exit code $exitCode"
exit $exitCode
# <Jun Kai end>
