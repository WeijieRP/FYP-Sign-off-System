# Owner: Role 3, Jun Kai.
# The administrator part of the installer and uninstaller, started by them with the normal Windows prompt. It only
# does what needs administrator rights: the install folder's rights, the kiosk's own MySQL service and the firewall
# rule. Every path comes in as an argument (the account that answers the prompt may not be the user who installs),
# no password is ever an argument, and what it made is written to -ResultFile for the install record.
#   -Action Prepare   folder rights, MySQL program files, data folder, service, firewall rule
#   -Action Remove    the service, the firewall rules named in -RuleNames, the MySQL program files, and with
#                     -RemoveData the whole folder (database and visitor data too)
# <Jun Kai start>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Prepare', 'Remove')][string]$Action,
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$ResultFile,
    [string]$LogFile,
    [string]$UserSid,
    [string]$MySqlZip,
    [string]$MySqlVersion,
    [string]$AppPasswordFile,
    [int]$MySqlPort = 3307,
    [int]$ServerPort = 3000,
    [switch]$Service,
    [switch]$Firewall,
    [string]$RuleNames = '',
    [switch]$RemoveData
)
. (Join-Path $PSScriptRoot 'KioskCommon.ps1')
if ($LogFile) { Use-KioskLog $LogFile }
$result = [ordered]@{ ok = $false; error = $null; items = @(); mysql = $null; mysqlVersion = $null }
$undo = New-Object Collections.ArrayList

# Undo steps are kept as data, not script blocks: a closure would not see the functions of this script
function Add-Made([string]$Type, [string]$Id, [string]$Text, [string]$UndoKind, [string]$UndoValue) {
    $result.items = @($result.items) + @(New-Item-Record $Type $Id $Text)
    if ($UndoKind) { [void]$undo.Insert(0, [pscustomobject]@{ kind = $UndoKind; value = $UndoValue }) }
    Write-Ok $Text
}
function Save-Result { Write-JsonFile $ResultFile ([pscustomobject]$result) }
function Invoke-Undo($Step) {
    switch ($Step.kind) {
        'tree' { [void](Remove-Tree $Step.value) }
        'service' { & sc.exe stop $Step.value 2>&1 | Out-Null; Start-Sleep -Seconds 3; & sc.exe delete $Step.value 2>&1 | Out-Null }
        'rule' { Remove-NetFirewallRule -Name $Step.value -ErrorAction SilentlyContinue }
    }
}

# The folder must be one the installer could have made: never a drive root, Windows, Program Files or a profile
function Test-SafeRoot([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full.Length -le 3) { return $false }
    # nothing inside Windows, Program Files or ProgramData; not the Users folder or a profile itself
    foreach ($bad in @($env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData)) {
        if ($bad -and (Test-InsideRoot $bad $full)) { return $false }
    }
    foreach ($bad in @((Split-Path $env:USERPROFILE -Parent), $env:USERPROFILE)) {
        if ($bad -and $full -ieq $bad.TrimEnd('\')) { return $false }
    }
    return $true
}
function Get-ServicePath($Svc) { return ($Svc.PathName -replace '^"([^"]+)".*$', '$1') }
# Why MySQL did not start: the end of its own error log (only administrators can read it) and what Windows says
function Show-MySqlError($m) {
    $err = Join-Path $m.Data 'mysqld.err'
    if (Test-Path -LiteralPath $err) {
        Write-Info 'the last lines of mysqld.err:'
        foreach ($line in @(Get-Content -LiteralPath $err -Tail 25 -ErrorAction SilentlyContinue)) { Write-Info "  $line" }
    }
    Write-Info "service state: $(Get-ServiceState)"
    $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager'; StartTime = (Get-Date).AddMinutes(-10) } -MaxEvents 20 -ErrorAction SilentlyContinue | Where-Object { $_.Message -match [regex]::Escape($ServiceDisplay) -or $_.Message -match $ServiceName })
    foreach ($e in @($events | Select-Object -First 3)) { Write-Info "  Windows: $($e.Message)" }
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = (Get-Date).AddMinutes(-10) } -MaxEvents 30 -ErrorAction SilentlyContinue | Where-Object { $_.ProviderName -match 'MySQL' } | Select-Object -First 5)) {
        Write-Info "  MySQL in the event log: $($e.Message)"
    }
    foreach ($p in @($m.Ini, $m.Data, $err, (Join-Path $m.Data 'ibdata1'))) {
        if (Test-Path -LiteralPath $p) { Write-Info "  rights of ${p}: $((& icacls.exe $p 2>&1 | Select-Object -First 6) -join ' ; ')" }
    }
}

function Install-MySqlFiles {
    $m = Get-MySqlPaths $Root
    if (Test-Path -LiteralPath $m.Mysqld) {
        # the program files are there: kept when the package brings the same version
        $have = Get-MySqlVersion $Root
        if (-not $MySqlVersion -or $have -eq $MySqlVersion) { Write-Ok "MySQL $have program files are already there"; return }
        if ((Compare-MySqlVersion $MySqlVersion $have) -lt 0) { throw "the package brings MySQL $MySqlVersion, older than the MySQL $have already installed; a database is never opened by an older MySQL" }
        Write-Info "MySQL $have is replaced by $MySqlVersion (the data folder is kept and upgraded when the service starts)"
        if ((Get-ServiceState) -eq 'Running') {
            & sc.exe stop $ServiceName 2>&1 | Out-Null
            for ($i = 0; $i -lt 60 -and (Get-ServiceState) -ne 'Stopped'; $i++) { Start-Sleep -Seconds 1 }
        }
        $old = Join-Path $Root 'mysql.old'
        if (Test-Path -LiteralPath $old) { [void](Remove-Tree $old) }
        Move-Folder $m.Base $old
        try {
            New-Item -ItemType Directory -Path $m.Base -Force | Out-Null
            $code = Invoke-Native $Tar @('-xf', $MySqlZip, '-C', $m.Base) -Quiet
            if ($code -ne 0 -or -not (Test-Path -LiteralPath $m.Mysqld)) { throw "tar could not unpack the MySQL program files (exit code $code)" }
        } catch {
            [void](Remove-Tree $m.Base)
            Move-Folder $old $m.Base
            throw
        }
        # the old program files (with the old my.ini) stay until the new MySQL answers, so they can come back
        $script:MySqlOld = $old
        Write-Ok "MySQL program files updated to $MySqlVersion (the old ones stay until it answers)"
        return
    }
    $made = -not (Test-Path -LiteralPath $m.Base)
    New-Item -ItemType Directory -Path $m.Base -Force | Out-Null
    $code = Invoke-Native $Tar @('-xf', $MySqlZip, '-C', $m.Base) -Quiet
    if ($code -ne 0 -or -not (Test-Path -LiteralPath $m.Mysqld)) { throw "tar could not unpack the MySQL program files (exit code $code)" }
    $undoKind = ''
    if ($made) { $undoKind = 'tree' }
    Add-Made 'folder' 'mysql' "MySQL $(Get-MySqlVersion $Root) program files in $($m.Base)" $undoKind $m.Base
}

function Install-MySqlService {
    $m = Get-MySqlPaths $Root
    $svc = Get-CimInstance Win32_Service -Filter "Name = '$ServiceName'" -ErrorAction SilentlyContinue
    if ($svc -and -not (Test-InsideRoot $Root (Get-ServicePath $svc))) {
        throw "a service named $ServiceName already exists and runs $($svc.PathName), not this install's MySQL; it was left alone"
    }
    $binary = "`"$($m.Mysqld)`" --defaults-file=`"$($m.Ini)`" $ServiceName"
    if (-not $svc) {
        New-Service -Name $ServiceName -BinaryPathName $binary -DisplayName $ServiceDisplay -StartupType Automatic -Description 'MySQL of the RP Xperience Centre Kiosk (added by install.cmd, removed by uninstall.cmd).' -ErrorAction Stop | Out-Null
        Add-Made 'service' $ServiceName "Windows service $ServiceName ($ServiceDisplay), starts with Windows" 'service' $ServiceName
    } else {
        # the service of an earlier install: its program path is set again (through WMI, so the quotes survive)
        [void](Invoke-CimMethod -InputObject $svc -MethodName Change -Arguments @{ PathName = $binary; StartMode = 'Automatic' })
        Write-Ok "Windows service $ServiceName is already there"
    }
    # its own low rights account (a virtual account): even a changed program file could not act as SYSTEM.
    # sc.exe is the documented way to set one (WMI refuses it); LocalService is the fallback if Windows refuses too.
    $script:SvcAccount = $ServiceAccount
    $svc = Get-CimInstance Win32_Service -Filter "Name = '$ServiceName'"
    if ($svc.StartName -ne $ServiceAccount) {
        [void](Invoke-Native 'sc.exe' @('config', $ServiceName, 'obj=', $ServiceAccount) -Quiet)
        $svc = Get-CimInstance Win32_Service -Filter "Name = '$ServiceName'"
    }
    if ($svc.StartName -ne $ServiceAccount) {
        # an empty password as its own argument, which PowerShell 5.1 would drop on the way to sc.exe
        & cmd.exe /d /c "sc.exe config $ServiceName obj= `"$ServiceAccount`" password= `"`"" 2>&1 | ForEach-Object { Write-Log 'OUT' "$_" }
        $svc = Get-CimInstance Win32_Service -Filter "Name = '$ServiceName'"
    }
    if ($svc.StartName -ne $ServiceAccount) {
        $change = Invoke-CimMethod -InputObject $svc -MethodName Change -Arguments @{ StartName = 'NT AUTHORITY\LocalService'; StartPassword = '' }
        if ($change.ReturnValue -ne 0) { throw "the service could not be given a low rights account (WMI result $($change.ReturnValue))" }
        $script:SvcAccount = 'NT AUTHORITY\LocalService'
        Write-Note "Windows did not take the account $ServiceAccount; the service runs as NT AUTHORITY\LocalService (also low rights)"
    }
    [void](Invoke-Native 'sc.exe' @('failure', $ServiceName, 'reset=', '86400', 'actions=', 'restart/5000/restart/10000/restart/60000') -Quiet)
    # the installing user may start, stop and look at this one service (updates and the start script need that)
    if ($UserSid) {
        $sd = (@(& sc.exe sdshow $ServiceName) | Where-Object { $_ -match '^D:' } | Select-Object -First 1)
        $ace = "(A;;RPWPLCLORC;;;$UserSid)"
        if ($sd -and -not $sd.Contains($ace)) {
            $at = $sd.IndexOf('S:')
            if ($at -gt 0) { $sd = $sd.Substring(0, $at) + $ace + $sd.Substring($at) } else { $sd = $sd + $ace }
            $code = Invoke-Native 'sc.exe' @('sdset', $ServiceName, $sd) -Quiet
            if ($code -ne 0) { Write-Note "the user could not be given the right to start and stop the service (exit code $code)" }
        }
    }
}

function Set-MySqlRights {
    $m = Get-MySqlPaths $Root
    if (-not (Test-Path -LiteralPath $m.Data)) { New-Item -ItemType Directory -Path $m.Data -Force | Out-Null }
    $codes = @()
    # program files: administrators change them, the service and the user only read and run them
    $codes += Invoke-Native 'icacls.exe' @($m.Base, '/setowner', "*$SidAdmins", '/T', '/Q') -Quiet
    $codes += Invoke-Native 'icacls.exe' @($m.Base, '/reset', '/T', '/Q') -Quiet
    $grant = @($m.Base, '/grant', "$($script:SvcAccount):(OI)(CI)RX")
    if ($UserSid) { $grant += "*${UserSid}:(OI)(CI)RX" }
    $codes += Invoke-Native 'icacls.exe' ($grant + '/Q') -Quiet
    # the data files: only the service, SYSTEM and administrators. The folder gets the rights once and everything in
    # it takes them from the folder (a kept data folder, or one taken over from a laptop install, is reset to that).
    $codes += Invoke-Native 'icacls.exe' @($m.Data, '/setowner', "*$SidAdmins", '/T', '/Q') -Quiet
    $codes += Invoke-Native 'icacls.exe' @($m.Data, '/inheritance:r', '/grant:r', "*${SidSystem}:(OI)(CI)F", "*${SidAdmins}:(OI)(CI)F", "$($script:SvcAccount):(OI)(CI)F", '/Q') -Quiet
    if (@(Get-ChildItem -LiteralPath $m.Data -Force -ErrorAction SilentlyContinue).Count) {
        $codes += Invoke-Native 'icacls.exe' @((Join-Path $m.Data '*'), '/reset', '/T', '/Q') -Quiet
    }
    if (@($codes | Where-Object { $_ -ne 0 }).Count) { throw 'icacls could not set the rights on the MySQL folders' }
    Write-Ok "rights set: only administrators change the MySQL files, the service runs as $($script:SvcAccount)"
}

function Install-FirewallRule {
    $port = "$ServerPort"
    $rules = @(Get-OwnFirewallRules)
    $right = @($rules | Where-Object { $_.DisplayName -eq $FirewallName -and (@(Get-RulePorts $_) -join ',') -eq $port })
    if ($right.Count -eq 1 -and $rules.Count -eq 1) {
        Add-Made 'firewall' $right[0].Name "firewall rule `"$FirewallName`" (TCP $port) is already there" '' ''
        return
    }
    foreach ($r in $rules) {
        Write-Info "the older firewall rule `"$($r.DisplayName)`" (TCP $(@(Get-RulePorts $r) -join ' ')) is replaced"
        Remove-NetFirewallRule -Name $r.Name -ErrorAction SilentlyContinue
    }
    $rule = New-NetFirewallRule -DisplayName $FirewallName -Group $FirewallGroup -Direction Inbound -Protocol TCP -LocalPort $ServerPort -Action Allow -Profile Private, Domain -Description 'Lets tablets on this network reach the kiosk server (added by install.cmd, removed by uninstall.cmd).' -ErrorAction Stop
    Add-Made 'firewall' $rule.Name "firewall rule `"$FirewallName`": tablets on Private and Domain networks reach TCP $port" 'rule' $rule.Name
}

try {
    if (-not (Test-Admin)) { throw 'this part needs administrator rights' }
    if (-not (Test-SafeRoot $Root)) { throw "$Root cannot be the kiosk's folder" }

    if ($Action -eq 'Prepare') {
        if (-not (Test-Path -LiteralPath $Root)) {
            New-Item -ItemType Directory -Path $Root -Force | Out-Null
            Add-Made 'folder' 'root' "folder $Root" 'tree' $Root
        }
        if ($Service) {
            if (-not $UserSid) { throw 'no user to give the folder to' }
            Set-ServiceRootAcl $Root $UserSid
            Write-Ok 'folder rights: the user owns app and data, only administrators change the MySQL folders'
            Install-MySqlFiles
            Write-MySqlIni $Root $MySqlPort
            Install-MySqlService
            Set-MySqlRights
            $m = Get-MySqlPaths $Root
            $pw = ''
            if ($AppPasswordFile -and (Test-Path -LiteralPath $AppPasswordFile)) { $pw = [IO.File]::ReadAllText($AppPasswordFile).Trim() }
            if (-not (Test-Path -LiteralPath (Join-Path $m.Data 'mysql.ibd')) -and -not $pw) { throw 'no password for the database user was handed over' }
            $state = Initialize-MySqlData $Root $pw
            if ($state -eq 'new') {
                Add-Made 'folder' 'mysql-data' "MySQL data folder $($m.Data) with the database $DbName and its user" 'tree' $m.Data
                # the files mysqld --initialize made get the service's rights; the root password file stays administrators only
                [void](Invoke-Native 'icacls.exe' @($m.Data, '/grant', "$($script:SvcAccount):(OI)(CI)F", '/T', '/Q') -Quiet)
            } else { Write-Ok "the MySQL data folder $($m.Data) is kept" }
            $result.mysql = $state
            if ((Get-ServiceState) -ne 'Running') { & sc.exe start $ServiceName 2>&1 | ForEach-Object { Write-Log 'OUT' "$_" } }
            if (-not (Wait-TcpOpen $MySqlPort 120)) {
                Show-MySqlError $m
                if ($script:MySqlOld -and (Test-Path -LiteralPath $script:MySqlOld)) {
                    # an update to a newer MySQL that does not start: the previous program files and my.ini come back
                    & sc.exe stop $ServiceName 2>&1 | Out-Null
                    for ($i = 0; $i -lt 30 -and (Get-ServiceState) -ne 'Stopped'; $i++) { Start-Sleep -Seconds 1 }
                    [void](Remove-Tree $m.Base)
                    Move-Folder $script:MySqlOld $m.Base
                    & sc.exe start $ServiceName 2>&1 | Out-Null
                    Write-Info 'the previous MySQL program files are back'
                }
                throw "the MySQL service did not answer on port $MySqlPort; see $($m.Data)\mysqld.err"
            }
            if ($script:MySqlOld) { [void](Remove-Tree $script:MySqlOld) }
            Write-Ok "the MySQL service answers on 127.0.0.1:$MySqlPort (this PC only)"
            $result.mysqlVersion = Get-MySqlVersion $Root
        }
        if ($Firewall) { Install-FirewallRule }
    }

    if ($Action -eq 'Remove') {
        $svc = Get-CimInstance Win32_Service -Filter "Name = '$ServiceName'" -ErrorAction SilentlyContinue
        if ($svc) {
            if (Test-InsideRoot $Root (Get-ServicePath $svc)) {
                & sc.exe stop $ServiceName 2>&1 | Out-Null
                for ($i = 0; $i -lt 60 -and (Get-ServiceState) -ne 'Stopped'; $i++) { Start-Sleep -Seconds 1 }
                $code = Invoke-Native 'sc.exe' @('delete', $ServiceName) -Quiet
                if ($code -ne 0) { throw "the service $ServiceName could not be removed (exit code $code)" }
                Write-Ok "Windows service $ServiceName removed"
            } else { Write-Note "a service named $ServiceName runs something outside $Root, so it was left alone" }
        }
        foreach ($name in @($RuleNames -split ',' | Where-Object { $_ })) {
            $rule = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
            if ($rule -and $rule.Group -eq $FirewallGroup) {
                Remove-NetFirewallRule -Name $name -ErrorAction Stop
                Write-Ok "firewall rule `"$($rule.DisplayName)`" removed"
            }
        }
        $m = Get-MySqlPaths $Root
        if ($RemoveData) {
            # the whole folder, only when it is an install's folder (its record says so)
            if (Test-Path -LiteralPath $Root) {
                if (-not (Test-Path -LiteralPath (Get-InstallFile $Root))) { throw "$Root has no install record, so it was not deleted" }
                if (-not (Remove-Tree $Root)) { throw "$Root could not be deleted (is a file in it open?)" }
                Write-Ok "folder $Root removed, with the database and the visitor data"
            }
        } else {
            if (Test-Path -LiteralPath $m.Base) {
                if (-not (Remove-Tree $m.Base)) { throw "$($m.Base) could not be deleted" }
                Write-Ok "MySQL program files removed ($($m.Base))"
            }
            if (Test-Path -LiteralPath $m.Data) { Write-Ok "MySQL data folder kept ($($m.Data)), administrators only" }
        }
    }
    $result.ok = $true
} catch {
    $result.error = $_.Exception.Message
    Write-Bad $result.error
    if ($Action -eq 'Prepare' -and $undo.Count) {
        Write-Info 'undoing what this step made'
        foreach ($u in $undo) { try { Invoke-Undo $u } catch { Write-Bad "undo: $($_.Exception.Message)" } }
        $result.items = @()
    }
}
Save-Result
if ($result.ok) { exit 0 }
exit 1
# <Jun Kai end>
