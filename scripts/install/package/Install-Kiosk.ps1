# Owner: Role 3, Jun Kai.
# Command line installer of the RP Xperience Centre Kiosk (task sheet point 5). It runs from the unzipped offline
# package (install.cmd there starts it) and needs nothing on the PC: Node.js and MySQL come inside the package and
# go into the install folder, MySQL on its own port, so a Node.js or MySQL already on the PC is never used or touched.
#   install.cmd                         asks the questions, then installs (or updates an installed copy)
#   install.cmd -Role WallPC -NonInteractive -AdminPasswordFile pw.txt     unattended
#   install.cmd -Check                  only the checks before installing, changes nothing
#   install.cmd -DryRun                 prints every step it would take, changes nothing
# Options: -Role Laptop|WallPC, -InstallDir, -Port (kiosk server, 3000), -MySqlPort (3307), -AdminUser,
# -AdminPasswordFile (or KIOSK_ADMIN_PASSWORD), -ImportData <file from export-data.cmd> (passphrase typed, or
# KIOSK_DATA_PASSPHRASE), -NoService, -NoFirewall, -NoStart, -Update, -AllowDowngrade, -NonInteractive.
# Exit codes: 0 done, 1 failed (what it made is undone), 2 done but an administrator step is missing, 3 refused or a
# check failed (nothing changed).
# <Jun Kai start>
[CmdletBinding()]
param(
    [ValidateSet('Laptop', 'WallPC')][string]$Role,
    [string]$InstallDir,
    [int]$Port = 0,
    [int]$MySqlPort = 0,
    [string]$AdminUser,
    [string]$AdminPasswordFile,
    [string]$ImportData,
    [switch]$NoService,
    [switch]$NoFirewall,
    [switch]$NoStart,
    [switch]$Update,
    [switch]$AllowDowngrade,
    [switch]$Check,
    [switch]$DryRun,
    [switch]$NonInteractive
)
$PackageDir = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'KioskCommon.ps1')
. (Join-Path $PSScriptRoot 'KioskData.ps1')
$script:NonInteractive = $NonInteractive
$script:DryRun = $DryRun
$OutputEncoding = New-Object Text.UTF8Encoding $false
$TestFail = "$env:KIOSK_INSTALL_TEST_FAIL"

function Stop-Here([string]$Message, [int]$Code) {
    Write-Bad $Message
    throw [Management.Automation.RuntimeException]::new("STOP:$Code")
}
function Test-Fail([string]$Point) {
    if ($TestFail -eq $Point) { throw "test failure at $Point (KIOSK_INSTALL_TEST_FAIL)" }
}
# What a new install has done so far, for a run after a power cut: the database login it made and whether data kept
# by an earlier uninstall was moved into the new version. The data folder is private to the user, like backend\.env.
function Write-InstallState([string]$Root, [string]$Password, [bool]$KeptMoved) {
    $dir = Join-Path $Root 'data'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Write-JsonFile (Join-Path $dir 'install-state.json') ([pscustomobject]@{ action = 'fresh'; started = (Get-Date).ToString('s'); dbPassword = $Password; keptMoved = $KeptMoved })
}

# ---------------------------------------------------------------- the package
function Test-Package {
    $pkg = Get-PackageInfo $PackageDir
    if (-not $pkg) { Stop-Here "no version.json next to install.cmd: unzip the whole package first, then run install.cmd from its folder" $ExitRefused }
    foreach ($f in @('payload\app.zip', 'payload\mysql.zip', 'checksums.sha256')) {
        if (-not (Test-Path -LiteralPath (Join-Path $PackageDir $f))) { Stop-Here "the package is incomplete: $f is missing (unzip the whole package again)" $ExitRefused }
    }
    $bad = @()
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $PackageDir 'checksums.sha256'))) {
        if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+)$') { continue }
        $file = Join-Path $PackageDir ($Matches[2].Trim().Replace('/', '\'))
        if (-not (Test-Path -LiteralPath $file)) { $bad += "$($Matches[2]) is missing"; continue }
        if ((Get-Sha256 $file) -ne $Matches[1].ToLower()) { $bad += "$($Matches[2]) is damaged (checksum)" }
    }
    if ($bad.Count) { Stop-Here ("the package is damaged: " + ($bad -join ', ') + '. Copy or download it again.') $ExitRefused }
    $model = ''
    if ($pkg.aiModel) { $model = ', with the offline AI model' }
    Write-Ok "package build $($pkg.build) (commit $($pkg.commit.Substring(0, 7)), $($pkg.date)), Node.js $($pkg.node), MySQL $($pkg.mysql)$model, checksums correct"
    return $pkg
}

# ---------------------------------------------------------------- leftovers of a run that did not finish
function Repair-Leftovers([string]$Root) {
    $app = Join-Path $Root 'app'
    $new = Join-Path $Root 'app.new'
    $old = Join-Path $Root 'app.old'
    $fixed = $false
    $stateFile = Join-Path $Root 'data\install-state.json'
    $state = Read-JsonFile $stateFile
    # a new install that stopped half way (the PC was turned off): data kept by an earlier uninstall goes back to
    # data\kept, and this run finishes the install with the same database login (the state file keeps it)
    if ($state -and $state.action -eq 'fresh' -and -not (Test-Path -LiteralPath $app)) {
        Write-Note 'an install stopped half way (was the PC turned off?): it is finished now'
        Stop-KioskServers $Root | Out-Null
        if (Test-Path -LiteralPath $new) {
            if ($state.keptMoved) {
                Move-AppData $new (Join-Path $Root 'data\kept\app')
                Write-Ok 'the data kept by the earlier uninstall is back in data\kept'
            }
            [void](Remove-Tree $new)
        }
        $script:Resume = $state
        return
    }
    if (-not (Test-Path -LiteralPath $app) -and (Test-Path -LiteralPath $old)) {
        Write-Note 'an update stopped half way: the previous version is put back first'
        Stop-KioskServers $Root | Out-Null
        if (Test-Path -LiteralPath $new) { Move-AppData $new $old }
        Move-Folder $old $app
        $fixed = $true
    }
    if (Test-Path -LiteralPath $new) {
        Write-Note 'an unfinished new version was found: its data goes back and the folder is removed'
        Stop-KioskServers $Root | Out-Null
        if (Test-Path -LiteralPath $app) { Move-AppData $new $app }
        [void](Remove-Tree $new)
        $fixed = $true
    }
    if ((Test-Path -LiteralPath $old) -and (Test-Path -LiteralPath $app)) {
        [void](Remove-Tree $old)
        $fixed = $true
    }
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force; $fixed = $true }
    if ($fixed) { Write-Ok 'the leftovers of the unfinished run are cleared' }
}

# ---------------------------------------------------------------- checks before installing
function Test-Before($Plan, $Pkg) {
    $problems = 0
    $os = [Environment]::OSVersion.Version
    if (-not [Environment]::Is64BitOperatingSystem) { Write-Bad 'this Windows is 32 bit; the kiosk needs 64 bit Windows 10 or 11'; $problems++ }
    elseif ($os.Major -lt 10 -or $os.Build -lt 17763) { Write-Bad "Windows $os is too old; Windows 10 version 1809 or newer, or Windows 11, is needed"; $problems++ }
    else { Write-Ok "Windows $($os.Major) build $($os.Build), 64 bit" }
    if ($PSVersionTable.PSVersion.Major -lt 5) { Write-Bad "PowerShell $($PSVersionTable.PSVersion) is too old (5.1 is part of Windows 10)"; $problems++ }
    if (-not (Test-Path -LiteralPath $Tar)) { Write-Bad "$Tar (part of Windows 10 1803 and newer) is missing"; $problems++ }

    $root = $Plan.Root
    $drive = [IO.Path]::GetPathRoot($root)
    if (-not (Test-Path -LiteralPath $drive)) { Write-Bad "the drive $drive does not exist"; $problems++ }
    else {
        $free = [Math]::Floor((New-Object IO.DriveInfo($drive)).AvailableFreeSpace / 1MB)
        $need = [int]$Pkg.unpackedMB + 1024
        if ($Plan.Action -ne 'fresh') { $need += [int]$Pkg.unpackedMB }
        if ($free -lt $need) { Write-Bad "drive $drive has $free MB free; about $need MB are needed"; $problems++ }
        else { Write-Ok "drive $drive has $free MB free ($need MB needed)" }
    }
    $longest = $root.TrimEnd('\').Length + '\app.new\'.Length + [int]$Pkg.longestPath
    if ($longest -gt 259) { Write-Bad "the folder name is too long: the deepest file would have a $longest character path (Windows allows 259). Choose a shorter -InstallDir, like $DefaultRoot."; $problems++ }
    $full = $root.TrimEnd('\')
    if ($full.Length -le 3) { Write-Bad 'the kiosk cannot be installed in the root of a drive'; $problems++ }
    foreach ($bad in @($env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($bad -and (Test-InsideRoot $bad $full)) { Write-Bad "$full is inside $bad; the kiosk writes in its own folder, so it goes in a folder like $DefaultRoot"; $problems++ }
    }
    if (Test-InsideRoot $PackageDir $full) { Write-Bad 'the install folder cannot be inside the package folder'; $problems++ }
    if ($Plan.Action -eq 'fresh' -and (Test-Path -LiteralPath $full)) {
        # an install that stopped half way also left its MySQL program files: they are used again
        $allowed = @('data', 'mysql-data')
        if ($script:Resume) { $allowed += 'mysql' }
        $other = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue | Where-Object { $allowed -notcontains $_.Name })
        if ($other.Count) { Write-Bad "$full already exists and holds other files; choose an empty or new folder"; $problems++ }
        elseif ($script:Resume) { Write-Ok "$full holds the install that stopped half way: it is finished now" }
        elseif (Test-Path -LiteralPath (Join-Path $full 'data\kept')) { Write-Ok "$full holds the data kept by an earlier uninstall: it is used again" }
    }

    $ports = @(@{ p = $Plan.Port; what = 'kiosk server (tablets)' }, @{ p = $KioskServerPort; what = 'kiosk screen server (fixed)' }, @{ p = $Plan.MySqlPort; what = "the kiosk's MySQL" })
    if (@($ports | ForEach-Object { $_.p } | Sort-Object -Unique).Count -ne 3) { Write-Bad "the ports must differ: $($Plan.Port), $KioskServerPort, $($Plan.MySqlPort)"; $problems++ }
    foreach ($entry in $ports) {
        $owner = Get-PortOwner $entry.p
        if (-not $owner) { Write-Ok "port $($entry.p) is free ($($entry.what))"; continue }
        $ours = ($owner.Text -and $owner.Text.ToLowerInvariant().Contains($root.ToLowerInvariant() + '\'))
        # the MySQL service runs under its own account, so a normal user cannot read its program path: ask the service
        if (-not $ours -and $entry.p -eq $Plan.MySqlPort -and (Get-ServiceState) -eq 'Running') {
            $svc = Get-CimInstance Win32_Service -Filter "Name = '$ServiceName'" -ErrorAction SilentlyContinue
            $ours = ($svc -and (Test-InsideRoot $root ($svc.PathName -replace '^"([^"]+)".*$', '$1')))
        }
        if ($ours -and ($Plan.Action -ne 'fresh' -or $script:Resume)) { Write-Ok "port $($entry.p) is used by this install ($($owner.Name))"; continue }
        if ($entry.p -eq $KioskServerPort) { Write-Bad "port $KioskServerPort ($($entry.what)) is already used by $($owner.Name) (process $($owner.ProcessId)). The kiosk screen server always uses it: close that program first (another copy of the kiosk?)." }
        else { Write-Bad "port $($entry.p) ($($entry.what)) is already used by $($owner.Name) (process $($owner.ProcessId)). Close it, or choose another port with -Port or -MySqlPort." }
        $problems++
    }
    foreach ($svc in @(Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue)) { Write-Info "MySQL service `"$($svc.Name)`" found on this PC: left alone (the kiosk has its own MySQL)" }
    if (Get-Command node -ErrorAction SilentlyContinue) { Write-Info 'Node.js found on this PC: left alone (the kiosk has its own Node.js)' }
    if ((Test-Path -LiteralPath $StartupLink) -and -not (Test-OwnShortcut $StartupLink $root)) {
        Write-Note 'another copy of the kiosk starts at Windows sign-in (an older install). A Wall PC install replaces that shortcut.'
    }
    if ($Plan.NeedsAdmin -and -not (Test-Admin)) { Write-Info 'Windows will ask once for administrator rights (MySQL service and firewall rule).' }
    return $problems
}

# ---------------------------------------------------------------- the administrator helper
function Invoke-Machine([string[]]$HelperArgs) {
    $resultFile = Join-Path $env:TEMP ('rpk-result-' + [guid]::NewGuid().ToString('N') + '.json')
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (ConvertTo-Arg (Join-Path $PSScriptRoot 'KioskMachine.ps1')))
    foreach ($a in $HelperArgs) { $argList += (ConvertTo-Arg $a) }
    $argList += @('-ResultFile', (ConvertTo-Arg $resultFile), '-LogFile', (ConvertTo-Arg $script:LogFile))
    $before = 0
    if ($script:LogFile -and (Test-Path -LiteralPath $script:LogFile)) { $before = (Get-Item -LiteralPath $script:LogFile).Length }
    try {
        if (Test-Admin) {
            $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Wait -PassThru -NoNewWindow
        } else {
            Write-Info 'Windows now asks for administrator rights for this step.'
            $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait -PassThru -WindowStyle Minimized
            # the helper wrote into the same log; show its lines here too
            $fs = [IO.File]::Open($script:LogFile, 'Open', 'Read', 'ReadWrite')
            try {
                [void]$fs.Seek($before, 'Begin')
                $reader = New-Object IO.StreamReader($fs)
                while ($null -ne ($line = $reader.ReadLine())) { if ($line -match '^\S+ \S+ (OK|NOTE|ERROR|INFO)\s+(.*)$') { Write-Host "         [admin] $($Matches[2])" } }
            } finally { $fs.Dispose() }
        }
    } catch {
        return [pscustomobject]@{ ok = $false; refused = $true; error = 'administrator rights were not given'; items = @(); mysql = $null; mysqlVersion = $null }
    }
    $r = Read-JsonFile $resultFile
    Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue
    if (-not $r) { return [pscustomobject]@{ ok = $false; refused = $false; error = "the administrator step ended (exit code $($p.ExitCode)) without a result"; items = @(); mysql = $null; mysqlVersion = $null } }
    $r | Add-Member -NotePropertyName refused -NotePropertyValue $false -Force
    return $r
}

# ---------------------------------------------------------------- Node.js helpers of the new version
function Invoke-Setup([string]$App, [string[]]$SetupArgs, [string]$StdIn) {
    $node = Join-Path $App 'runtime\node\node.exe'
    $setup = Join-Path $App 'scripts\install\setup.js'
    Push-Location $App
    try {
        if ($StdIn) { $out = $StdIn | & $node $setup @SetupArgs 2>&1 }
        else { $out = & $node $setup @SetupArgs 2>&1 }
        $code = $LASTEXITCODE
    } finally { Pop-Location }
    foreach ($line in @($out)) {
        $t = "$line"
        if (-not $t.Trim()) { continue }
        if ($t -match '^\s*(ok|note|error|would)\s+(.*)$') {
            switch ($Matches[1]) { 'ok' { Write-Ok $Matches[2] } 'note' { Write-Note $Matches[2] } 'error' { Write-Bad $Matches[2] } default { Write-Would $Matches[2] } }
        } else { Write-Info $t.Trim() }
    }
    return $code
}
function Wait-KioskReady([string]$App, [int]$ServerPort) {
    $node = Join-Path $App 'runtime\node\node.exe'
    $code = Invoke-Native $node @((Join-Path $App 'scripts\install\wait-ready.js'), "$ServerPort", '180')
    return ($code -eq 0)
}
function Start-Kiosk([string]$App) {
    Start-Process -FilePath (Join-Path $App 'start-kiosk.cmd') -WorkingDirectory $App -WindowStyle Minimized | Out-Null
}

# ---------------------------------------------------------------- questions
function Read-AdminAccount {
    $user = $AdminUser
    if (-not $user) { $user = Read-Answer 'First admin account, user name' 'systemadmin' }
    $pw = "$env:KIOSK_ADMIN_PASSWORD"
    if (-not $pw -and $AdminPasswordFile) {
        if (-not (Test-Path -LiteralPath $AdminPasswordFile)) { Stop-Here "the file $AdminPasswordFile (-AdminPasswordFile) does not exist" $ExitRefused }
        $pw = ([IO.File]::ReadAllText($AdminPasswordFile)).Trim()
    }
    if (-not $pw) {
        if ($NonInteractive) { Stop-Here 'no admin password: give -AdminPasswordFile or KIOSK_ADMIN_PASSWORD (the default password is never used)' $ExitRefused }
        for ($i = 0; $i -lt 3 -and -not $pw; $i++) {
            $a = Read-Secret "Password for $user (at least 8 characters, typing is hidden)"
            $b = Read-Secret 'Type it again'
            if ($a -ne $b) { Write-Note 'the two did not match, try again' }
            elseif ($a.Length -lt 8) { Write-Note 'at least 8 characters, try again' }
            elseif ($a -eq 'SystemAdmin123!') { Write-Note 'that is the public default password, choose another' }
            else { $pw = $a }
        }
        if (-not $pw) { Stop-Here 'no admin password was set' $ExitRefused }
    }
    return [pscustomobject]@{ User = $user; Password = $pw }
}

# ---------------------------------------------------------------- moving data from an old PC
function Open-ImportFile([string]$File) {
    if (-not (Test-Path -LiteralPath $File)) { Stop-Here "the data file $File does not exist" $ExitRefused }
    $pass = "$env:KIOSK_DATA_PASSPHRASE"
    if (-not $pass) {
        if ($NonInteractive) { Stop-Here 'the data file needs its passphrase: set KIOSK_DATA_PASSPHRASE' $ExitRefused }
        $pass = Read-Secret 'Passphrase of the data file (typed when it was exported)'
    }
    $work = Join-Path $env:TEMP ('rpk-import-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $tarFile = Join-Path $work 'data.tar'
    try { Unprotect-KioskFile $File $tarFile $pass } catch { [void](Remove-Tree $work); Stop-Here "the data file could not be opened: $($_.Exception.Message)" $ExitRefused }
    $content = Join-Path $work 'content'
    New-Item -ItemType Directory -Path $content -Force | Out-Null
    $code = Invoke-Native $Tar @('-xf', $tarFile, '-C', $content) -Quiet
    Remove-Item -LiteralPath $tarFile -Force
    $manifest = Read-JsonFile (Join-Path $content 'manifest.json')
    if ($code -ne 0 -or -not $manifest -or -not (Test-Path -LiteralPath (Join-Path $content 'database.sql'))) { [void](Remove-Tree $work); Stop-Here 'the data file is not a complete kiosk export' $ExitRefused }
    Write-Ok "data file from $($manifest.computer), exported $($manifest.exported) ($($manifest.photos) photo file(s))"
    return [pscustomobject]@{ Work = $work; Content = $content; Manifest = $manifest }
}
function Import-DataFiles($Import, [string]$App) {
    $c = $Import.Content
    foreach ($pair in @(@('uploads', 'uploads'), @('backend-data', 'backend\data'))) {
        $src = Join-Path $c $pair[0]
        if (-not (Test-Path -LiteralPath $src)) { continue }
        $dst = Join-Path $App $pair[1]
        if (-not (Test-Path -LiteralPath $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
        $code = Invoke-Native 'robocopy.exe' @($src, $dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2') -Quiet
        if ($code -ge 8) { throw "the $($pair[0]) files could not be copied (robocopy exit code $code)" }
    }
    $assets = Join-Path $c 'assets'
    if (Test-Path -LiteralPath $assets) {
        $code = Invoke-Native 'robocopy.exe' @($assets, (Join-Path $App 'assets'), '/E', '/XC', '/XN', '/XO', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2') -Quiet
        if ($code -ge 8) { throw "the uploaded pictures could not be copied (robocopy exit code $code)" }
    }
    Write-Ok 'visitor photos, settings, archives and uploaded pictures copied from the data file'
}

# ---------------------------------------------------------------- the steps
function New-EnvText([string]$AppPassword, $Plan, $Import) {
    $lines = @('DB_HOST=127.0.0.1', "DB_PORT=$($Plan.MySqlPort)", "DB_USER=$DbUser", "DB_PASSWORD=$AppPassword", "DB_NAME=$DbName", "PORT=$($Plan.Port)")
    if ($Import) {
        $envFile = Join-Path $Import.Content 'env.txt'
        $skip = @('DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'PORT', 'SESSION_SECRET', 'KIOSK_AUTOMATION')
        $old = Read-EnvLines $envFile
        foreach ($key in $old.Keys) { if ($skip -notcontains $key) { $lines += "$key=$($old[$key])" } }
    }
    return ($lines -join "`n")
}

function Install-Fresh($Plan, $Pkg, $Admin, $Import) {
    $root = $Plan.Root
    $app = Join-Path $root 'app'
    $new = Join-Path $root 'app.new'
    $kept = Join-Path $root 'data\kept\app'
    $userSid = Get-UserSid
    $info = [pscustomobject]@{ build = $Pkg.build; commit = $Pkg.commit; role = $Plan.Role; mode = $Plan.Mode; port = $Plan.Port; mysqlPort = $Plan.MySqlPort; mysqlVersion = $Pkg.mysql; root = $root; installedAt = (Get-Date).ToString('s'); updatedAt = (Get-Date).ToString('s'); source = "$env:KIOSK_PACKAGE_SOURCE"; items = @() }
    $rootExisted = Test-Path -LiteralPath $root
    $pwFile = $null
    if ($script:Resume) {
        # what the install that stopped half way had already made stays on its list
        $earlier = Get-InstallInfo $root
        if ($earlier) { $info.items = @($earlier.items) }
    }
    try {
        # the database user's password: the one of an install that stopped half way, the one of the data kept by an
        # earlier uninstall, or a new one
        $appPassword = New-Secret 24
        $keptEnv = Join-Path $kept 'backend\.env'
        if ($script:Resume -and $script:Resume.dbPassword) { $appPassword = $script:Resume.dbPassword }
        elseif (Test-Path -LiteralPath $keptEnv) {
            $keptPw = Get-EnvValue (Read-EnvLines $keptEnv) 'DB_PASSWORD' ''
            if ($keptPw) { $appPassword = $keptPw }
        }
        $pwFile = Join-Path $env:TEMP ('rpk-' + [guid]::NewGuid().ToString('N') + '.txt')
        [IO.File]::WriteAllText($pwFile, $appPassword, [Text.Encoding]::ASCII)

        Write-Step "Folder, MySQL and Windows parts (MySQL as $(Get-ModeText $Plan.Mode))"
        $firewallWanted = ($Plan.Role -eq 'WallPC' -and -not $NoFirewall)
        if ($Plan.Mode -eq 'service') {
            $helper = @('-Action', 'Prepare', '-Root', $root, '-UserSid', $userSid, '-MySqlZip', (Join-Path $PackageDir 'payload\mysql.zip'), '-MySqlVersion', $Pkg.mysql, '-AppPasswordFile', $pwFile, '-MySqlPort', "$($Plan.MySqlPort)", '-ServerPort', "$($Plan.Port)", '-Service')
            if ($firewallWanted) { $helper += '-Firewall' }
            $r = Invoke-Machine $helper
            if ($r.refused) {
                Write-Note 'administrator rights were not given: MySQL runs as a normal program of this user instead of a service'
                if ($firewallWanted) { Write-Note 'the firewall rule is skipped too, so tablets cannot reach this PC until install.cmd runs again with administrator rights' }
                $Plan.Mode = 'process'
                $info.mode = 'process'
                $script:AdminMissing = $firewallWanted
            } elseif (-not $r.ok) {
                Stop-Here "the administrator step failed: $($r.error)" $ExitFailed
            } else {
                foreach ($it in @($r.items)) { Add-Record $info $it.type $it.id $it.text }
                if ($r.mysqlVersion) { $info.mysqlVersion = $r.mysqlVersion }
                Save-InstallInfo $root $info
                Write-InstallState $root $appPassword $false
            }
        }
        if ($Plan.Mode -eq 'process') {
            if (-not (Test-Path -LiteralPath $root)) {
                New-Item -ItemType Directory -Path $root -Force | Out-Null
                Add-Record $info 'folder' 'root' "folder $root"
            }
            Set-PrivateAcl $root $userSid
            Write-Ok "folder $root, readable only by $env:USERNAME, SYSTEM and administrators"
            Save-InstallInfo $root $info
            Write-InstallState $root $appPassword $false
            $m = Get-MySqlPaths $root
            if (-not (Test-Path -LiteralPath $m.Mysqld)) {
                New-Item -ItemType Directory -Path $m.Base -Force | Out-Null
                $code = Invoke-Native $Tar @('-xf', (Join-Path $PackageDir 'payload\mysql.zip'), '-C', $m.Base) -Quiet
                if ($code -ne 0 -or -not (Test-Path -LiteralPath $m.Mysqld)) { throw "tar could not unpack MySQL (exit code $code)" }
            }
            Add-Record $info 'folder' 'mysql' "MySQL $($Pkg.mysql) program files in $($m.Base)"
            Write-Ok "MySQL $($Pkg.mysql) program files in $($m.Base)"
            Write-MySqlIni $root $Plan.MySqlPort
            $state = Initialize-MySqlData $root $appPassword
            if ($state -eq 'new') { Add-Record $info 'folder' 'mysql-data' "MySQL data folder $($m.Data)"; Write-Ok "MySQL data folder $($m.Data) with the database $DbName and its user" }
            else { Write-Ok "the MySQL data folder $($m.Data) is kept" }
            Save-InstallInfo $root $info
            if (-not (Start-KioskMySql $root $Plan.MySqlPort 'process')) { throw "MySQL did not start on port $($Plan.MySqlPort); see $($m.Data)\mysqld.err" }
            Write-Ok "MySQL answers on 127.0.0.1:$($Plan.MySqlPort) (this PC only), as a program of $env:USERNAME"
            if ($firewallWanted -and (Test-Admin)) {
                $r = Invoke-Machine @('-Action', 'Prepare', '-Root', $root, '-ServerPort', "$($Plan.Port)", '-Firewall')
                if ($r.ok) { foreach ($it in @($r.items)) { Add-Record $info $it.type $it.id $it.text } } else { $script:AdminMissing = $true; Write-Bad "firewall rule: $($r.error)" }
            } elseif ($firewallWanted -and -not $script:AdminMissing) {
                $r = Invoke-Machine @('-Action', 'Prepare', '-Root', $root, '-ServerPort', "$($Plan.Port)", '-Firewall')
                if ($r.ok) { foreach ($it in @($r.items)) { Add-Record $info $it.type $it.id $it.text } } else { $script:AdminMissing = $true; Write-Note 'the firewall rule is skipped (no administrator rights)' }
            }
        }
        if (-not (Test-Path -LiteralPath (Join-Path $root 'data\install-state.json'))) { Write-InstallState $root $appPassword $false }
        Move-KioskLog $root
        Save-InstallInfo $root $info

        Write-Step 'Kiosk program files'
        if (Test-Path -LiteralPath $new) { [void](Remove-Tree $new) }
        New-Item -ItemType Directory -Path $new -Force | Out-Null
        $code = Invoke-Native $Tar @('-xf', (Join-Path $PackageDir 'payload\app.zip'), '-C', $new) -Quiet
        if ($code -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $new 'runtime\node\node.exe'))) { throw "tar could not unpack the kiosk files (exit code $code)" }
        Add-Record $info 'folder' 'app' "kiosk program files in $app (with Node.js $($Pkg.node))"
        Write-Ok "kiosk build $($Pkg.build) unpacked, with its own Node.js $($Pkg.node)"
        if (Test-Path -LiteralPath $kept) {
            # moved, not copied; an undo moves it back to data\kept, which is only deleted once the install worked.
            # The state file says so first, so a run after a power cut can move it back too.
            $script:KeptIn = $new
            Write-InstallState $root $appPassword $true
            Move-AppData $kept $new
            if ($TestFail -eq 'kill-after-kept') { [Environment]::Exit(9) }
            $n = Copy-UserAssets $kept $new
            Write-Ok "the data kept by the earlier uninstall is back (settings, keys, visitor photos, $n uploaded picture(s))"
        }

        Write-Step 'Settings (backend\.env) and the database'
        if (-not (Test-Path -LiteralPath (Join-Path $new 'backend\.env'))) {
            if ((Invoke-Setup $new @('set-env') (New-EnvText $appPassword $Plan $Import)) -ne 0) { throw 'backend\.env could not be written' }
        } else {
            if ((Invoke-Setup $new @('set-env') "DB_HOST=127.0.0.1`nDB_PORT=$($Plan.MySqlPort)`nPORT=$($Plan.Port)") -ne 0) { throw 'backend\.env could not be updated' }
        }
        if ($Import) {
            Restore-KioskDatabase $root $new (Join-Path $Import.Content 'database.sql')
            Write-Ok 'the database of the old PC is loaded'
            Import-DataFiles $Import $new
        }
        $setupArgs = @('install', '--role', $Plan.Role.ToLower(), '--non-interactive', '--admin-later')
        if ((Invoke-Setup $new $setupArgs) -ne 0) { throw 'the database setup did not finish (see above)' }
        if ($Admin) {
            $env:KIOSK_ADMIN_USER = $Admin.User
            $env:KIOSK_ADMIN_PASSWORD = $Admin.Password
            try { $code = Invoke-Setup $new @('set-admin') } finally { Remove-Item Env:\KIOSK_ADMIN_PASSWORD -ErrorAction SilentlyContinue; Remove-Item Env:\KIOSK_ADMIN_USER -ErrorAction SilentlyContinue }
            if ($code -ne 0) { throw 'the admin account could not be set' }
        }
        Test-Fail 'after-files'
        Move-Folder $new $app
        if ($script:KeptIn) { $script:KeptIn = $app }

        if ($Plan.Role -eq 'WallPC') {
            Write-Step 'Wall PC: start at sign-in and a desktop link'
            Install-Shortcuts $info $app
        }
        if (Test-Path -LiteralPath (Join-Path $root 'data\kept')) { [void](Remove-Tree (Join-Path $root 'data\kept')) }
        $script:KeptIn = $null
        Remove-Item -LiteralPath (Join-Path $root 'data\install-state.json') -Force -ErrorAction SilentlyContinue
        Save-InstallInfo $root $info
        return $info
    } catch {
        $err = $_
        if ("$($err.Exception.Message)" -notmatch '^STOP:') { Write-Bad $err.Exception.Message }
        Write-Step 'The install failed: undoing what it made'
        Undo-Fresh $Plan $info $rootExisted
        if ("$($err.Exception.Message)" -match '^STOP:') { throw $err }; throw [Management.Automation.RuntimeException]::new("STOP:$ExitFailed")
    } finally {
        if ($pwFile) { Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue }
    }
}

function Install-Shortcuts($Info, [string]$App) {
    $root = $Info.root
    $shell = New-Object -ComObject WScript.Shell
    if ((Test-Path -LiteralPath $StartupLink) -and -not (Test-OwnShortcut $StartupLink $root)) { Write-Info "the shortcut of the older copy is replaced: $StartupLink" }
    $link = $shell.CreateShortcut($StartupLink)
    $link.TargetPath = Join-Path $App 'start-kiosk.cmd'
    $link.Arguments = '--logon'
    $link.WorkingDirectory = $App
    $link.WindowStyle = 7
    $link.Description = 'Starts the RP Xperience Centre Kiosk (added by install.cmd, removed by uninstall.cmd)'
    $link.Save()
    Add-Record $Info 'shortcut' $StartupLink 'starts at Windows sign-in (Startup folder shortcut)'
    Write-Ok "starts at Windows sign-in ($StartupLink)"
    Write-TextFile $DesktopLink ("[InternetShortcut]`r`nURL=https://localhost:$($Info.port)/admin`r`n")
    Add-Record $Info 'shortcut' $DesktopLink "desktop link to the admin page (https://localhost:$($Info.port)/admin)"
    Write-Ok "desktop link `"RP Xperience Centre Kiosk Admin`""
}

function Undo-Fresh($Plan, $Info, [bool]$RootExisted) {
    $root = $Plan.Root
    # the log moves back to the temp folder first: the undo may delete the install folder it was copied into
    if ($script:LogFile -and (Test-InsideRoot $root $script:LogFile)) {
        $tmpLog = Join-Path (Join-Path $env:TEMP 'rp-xperience-kiosk') (Split-Path $script:LogFile -Leaf)
        Copy-Item -LiteralPath $script:LogFile -Destination $tmpLog -Force -ErrorAction SilentlyContinue
        $script:LogFile = $tmpLog
    }
    try {
        Stop-KioskServers $root | Out-Null
        foreach ($it in @($Info.items | Where-Object { $_.type -eq 'shortcut' })) {
            if (Test-OwnShortcut $it.id $root) { Remove-Item -LiteralPath $it.id -Force -ErrorAction SilentlyContinue }
        }
        if ($Plan.Mode -eq 'process' -and (Test-Path -LiteralPath $root)) { Stop-KioskMySql $root $Plan.MySqlPort 'process' }
        # data kept by an earlier uninstall goes back where it was before anything is deleted
        if ($script:KeptIn -and (Test-Path -LiteralPath $script:KeptIn)) {
            Move-AppData $script:KeptIn (Join-Path $root 'data\kept\app')
            Write-Ok 'the data kept by the earlier uninstall is back in data\kept'
        }
        $script:KeptIn = $null
        $machine = @($Info.items | Where-Object { $_.type -eq 'service' -or $_.type -eq 'firewall' })
        $kept = Test-Path -LiteralPath (Join-Path $root 'data\kept')
        if ($kept) { $RootExisted = $true }
        if ($machine.Count -gt 0) {
            $rules = (@($Info.items | Where-Object { $_.type -eq 'firewall' } | ForEach-Object { $_.id }) -join ',')
            $args2 = @('-Action', 'Remove', '-Root', $root, '-RuleNames', $rules)
            if (-not $RootExisted) { $args2 += '-RemoveData' }
            $r = Invoke-Machine $args2
            if (-not $r.ok) { Write-Bad "the service and firewall rule could not be removed: $($r.error). Run uninstall.cmd -InstallDir `"$root`" as administrator." }
        }
        foreach ($sub in @('app.new', 'app')) { $p = Join-Path $root $sub; if (Test-Path -LiteralPath $p) { [void](Remove-Tree $p) } }
        if (-not $RootExisted -and (Test-Path -LiteralPath $root)) { [void](Remove-Tree $root) }
        elseif ($RootExisted -and -not $kept) {
            foreach ($sub in @('mysql', 'mysql-data')) {
                $p = Join-Path $root $sub
                if ((Test-Path -LiteralPath $p) -and @($Info.items | Where-Object { $_.id -eq $sub }).Count) { [void](Remove-Tree $p) }
            }
            Remove-Item -LiteralPath (Join-Path $root 'data\install-state.json') -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath (Get-InstallFile $root) -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $root) { Write-Note "kept in $root : the data of the earlier install (data\kept and mysql-data)" }
        else { Write-Ok "nothing of the install is left ($root is gone)" }
    } catch { Write-Bad "undo: $($_.Exception.Message)" }
}

function Install-Update($Plan, $Pkg, $Info) {
    $root = $Plan.Root
    $app = Join-Path $root 'app'
    $new = Join-Path $root 'app.new'
    $old = Join-Path $root 'app.old'
    $mode = $Info.mode
    $swapped = $false
    $migrated = $false
    $backupSql = $null
    $before = @()
    Write-JsonFile (Join-Path $root 'data\install-state.json') ([pscustomobject]@{ action = 'update'; from = $Info.build; to = $Pkg.build; started = (Get-Date).ToString('s') })
    try {
        Write-Step 'Stop the kiosk and back up'
        $n = Stop-KioskServers $root
        if ($n) { Write-Ok "kiosk servers stopped ($n node process(es) of this folder)" } else { Write-Ok 'the kiosk servers were not running' }
        if (-not (Start-KioskMySql $root ([int]$Info.mysqlPort) $mode)) { throw "the kiosk's MySQL does not answer on port $($Info.mysqlPort)" }
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backup = Join-Path $root "data\backups\$stamp-build$($Info.build)"
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        $backupSql = Join-Path $backup 'database.sql'
        Backup-KioskDatabase $root $app $backupSql
        Copy-Item -LiteralPath (Join-Path $app 'backend\.env') -Destination (Join-Path $backup 'env.txt') -Force
        $settings = Join-Path $app 'backend\data'
        if (Test-Path -LiteralPath $settings) { [void](Invoke-Native 'robocopy.exe' @($settings, (Join-Path $backup 'backend-data'), '/E', '/XD', 'archives', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -Quiet) }
        $before = @(Get-AppliedMigrations $root $app)
        Write-Ok "backup of the database and settings in $backup"
        $all = @(Get-ChildItem -LiteralPath (Join-Path $root 'data\backups') -Directory | Sort-Object Name -Descending)
        foreach ($d in @($all | Select-Object -Skip 5)) { [void](Remove-Tree $d.FullName) }

        if ((Compare-MySqlVersion $Pkg.mysql $Info.mysqlVersion) -ne 0 -or [int]$Plan.MySqlPort -ne [int]$Info.mysqlPort) {
            Write-Step "MySQL $($Info.mysqlVersion) to $($Pkg.mysql)"
            Update-MySql $Plan $Pkg $Info
        }

        Write-Step "Kiosk build $($Info.build) to $($Pkg.build)"
        if (Test-Path -LiteralPath $new) { [void](Remove-Tree $new) }
        New-Item -ItemType Directory -Path $new -Force | Out-Null
        $code = Invoke-Native $Tar @('-xf', (Join-Path $PackageDir 'payload\app.zip'), '-C', $new) -Quiet
        if ($code -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $new 'runtime\node\node.exe'))) { throw "tar could not unpack the kiosk files (exit code $code)" }
        Write-Ok "build $($Pkg.build) unpacked next to the running one"
        Move-AppData $app $new
        $count = Copy-UserAssets $app $new
        Write-Ok "settings, keys, visitor photos and logs moved into the new version ($count uploaded picture(s) copied)"
        if ((Invoke-Setup $new @('set-env') "DB_PORT=$($Plan.MySqlPort)`nPORT=$($Plan.Port)") -ne 0) { throw 'backend\.env could not be updated' }

        Write-Step 'Database changes of the new version'
        $migrated = $true
        if ((Invoke-Setup $new @('install', '--role', $Plan.Role.ToLower(), '--non-interactive', '--admin-later')) -ne 0) { throw 'the database update did not finish (see above)' }
        Test-Fail 'after-migrations'

        Write-Step 'Switch to the new version'
        Move-Folder $app $old
        Move-Folder $new $app
        $swapped = $true
        Write-Ok "build $($Pkg.build) is now in $app"
        if ($Plan.Role -eq 'WallPC') { Install-Shortcuts $Info $app }
        if (-not $NoStart) {
            Start-Kiosk $app
            if (-not (Wait-KioskReady $app $Plan.Port)) { throw 'the new version did not answer on the admin page' }
            Test-Fail 'after-start'
        }
        [void](Remove-Tree $old)
        $Info.build = $Pkg.build
        $Info.commit = $Pkg.commit
        $Info.role = $Plan.Role
        $Info.port = $Plan.Port
        $Info.mysqlPort = $Plan.MySqlPort
        $Info.mysqlVersion = $Pkg.mysql
        $Info.updatedAt = (Get-Date).ToString('s')
        if ("$env:KIOSK_PACKAGE_SOURCE") { $Info.source = "$env:KIOSK_PACKAGE_SOURCE" }
        if (@($Info.items | Where-Object { $_.id -eq 'app' }).Count -eq 0) { Add-Record $Info 'folder' 'app' "kiosk program files in $app" }
        Remove-Item -LiteralPath (Join-Path $root 'data\install-state.json') -Force -ErrorAction SilentlyContinue
        Save-InstallInfo $root $Info
        $script:Started = -not $NoStart
        return $Info
    } catch {
        $err = $_
        if ("$($err.Exception.Message)" -notmatch '^STOP:') { Write-Bad $err.Exception.Message }
        Write-Step 'The update failed: putting the previous version back'
        try {
            Stop-KioskServers $root | Out-Null
            if ($swapped) { Move-Folder $app $new; Move-Folder $old $app }
            if (Test-Path -LiteralPath $new) { Move-AppData $new $app; [void](Remove-Tree $new) }
            Write-Ok "build $($Info.build) is back in $app, with its data"
            if ($migrated -and $backupSql -and (Test-Path -LiteralPath $backupSql)) {
                $after = @(Get-AppliedMigrations $root $app)
                if (($after -join ',') -ne ($before -join ',')) {
                    Restore-KioskDatabase $root $app $backupSql
                    Write-Ok 'the database is back as it was before the update (from the backup)'
                } else { Write-Ok 'the database was not changed' }
            }
            Remove-Item -LiteralPath (Join-Path $root 'data\install-state.json') -Force -ErrorAction SilentlyContinue
            if (-not $NoStart) {
                Start-Kiosk $app
                if (Wait-KioskReady $app ([int]$Info.port)) { Write-Ok 'the previous version runs again' } else { Write-Note 'the previous version did not answer yet; run kiosk-status.cmd' }
            }
        } catch { Write-Bad "putting the previous version back failed: $($_.Exception.Message). Run install.cmd again: it finishes this first." }
        if ("$($err.Exception.Message)" -match '^STOP:') { throw $err }; throw [Management.Automation.RuntimeException]::new("STOP:$ExitFailed")
    }
}

function Update-MySql($Plan, $Pkg, $Info) {
    $root = $Plan.Root
    if ((Compare-MySqlVersion $Pkg.mysql $Info.mysqlVersion) -lt 0) { Stop-Here "the package brings MySQL $($Pkg.mysql), older than the installed $($Info.mysqlVersion); a database is never opened by an older MySQL" $ExitRefused }
    if ($Info.mode -eq 'service') {
        $r = Invoke-Machine @('-Action', 'Prepare', '-Root', $root, '-UserSid', (Get-UserSid), '-MySqlZip', (Join-Path $PackageDir 'payload\mysql.zip'), '-MySqlVersion', $Pkg.mysql, '-MySqlPort', "$($Plan.MySqlPort)", '-ServerPort', "$($Plan.Port)", '-Service')
        if (-not $r.ok) { throw "the MySQL update needs administrator rights: $($r.error)" }
    } else {
        $m = Get-MySqlPaths $root
        Stop-KioskMySql $root ([int]$Info.mysqlPort) 'process'
        if ((Compare-MySqlVersion $Pkg.mysql $Info.mysqlVersion) -ne 0) {
            $next = Join-Path $root 'mysql.new'
            if (Test-Path -LiteralPath $next) { [void](Remove-Tree $next) }
            New-Item -ItemType Directory -Path $next -Force | Out-Null
            $code = Invoke-Native $Tar @('-xf', (Join-Path $PackageDir 'payload\mysql.zip'), '-C', $next) -Quiet
            if ($code -ne 0) { throw "tar could not unpack MySQL (exit code $code)" }
            $oldDir = Join-Path $root 'mysql.old'
            Move-Folder $m.Base $oldDir
            Move-Folder $next $m.Base
        }
        Write-MySqlIni $root $Plan.MySqlPort
        if (-not (Start-KioskMySql $root $Plan.MySqlPort 'process')) {
            # the previous program files and my.ini (old version, old port) come back, and that MySQL runs again
            Stop-KioskMySql $root $Plan.MySqlPort 'process'
            $oldDir = Join-Path $root 'mysql.old'
            if (Test-Path -LiteralPath $oldDir) { [void](Remove-Tree $m.Base); Move-Folder $oldDir $m.Base }
            else { Write-MySqlIni $root ([int]$Info.mysqlPort) }
            [void](Start-KioskMySql $root ([int]$Info.mysqlPort) 'process')
            throw "MySQL $($Pkg.mysql) did not start (see $($m.Data)\mysqld.err); the previous MySQL is back"
        }
        $oldDir = Join-Path $root 'mysql.old'
        if (Test-Path -LiteralPath $oldDir) { [void](Remove-Tree $oldDir) }
    }
    # from here the record and the running app use the new MySQL, whatever happens to the rest of the update
    if ([int]$Plan.MySqlPort -ne [int]$Info.mysqlPort) {
        if ((Invoke-Setup (Join-Path $root 'app') @('set-env') "DB_PORT=$($Plan.MySqlPort)") -ne 0) { throw 'backend\.env could not be given the new MySQL port' }
    }
    $Info.mysqlVersion = $Pkg.mysql
    $Info.mysqlPort = $Plan.MySqlPort
    Save-InstallInfo $root $Info
    Write-Ok "MySQL $($Pkg.mysql) runs on port $($Plan.MySqlPort) (the data is kept)"
}

function Show-Done($Info, [bool]$Started) {
    $root = $Info.root
    $app = Join-Path $root 'app'
    Write-Step 'Done'
    Write-Ok "RP Xperience Centre Kiosk build $($Info.build) is installed in $root ($($Info.role), MySQL as $(Get-ModeText $Info.mode))"
    Write-Info "Admin page    https://localhost:$($Info.port)/admin  (the browser warns once about the kiosk's own certificate)"
    foreach ($ip in @(Get-LanAddresses)) { Write-Info "Tablets       https://${ip}:$($Info.port)" }
    if ($Started) { Write-Info 'Running now   the kiosk window is minimised on the taskbar' }
    if ($Info.role -eq 'WallPC') { Write-Info 'Starts        by itself at Windows sign-in' } else { Write-Info "Start         $app\start-kiosk.cmd" }
    Write-Info "Status        $app\kiosk-status.cmd"
    Write-Info "Update        $app\update.cmd (downloads the newest package), or install.cmd of a newer package"
    Write-Info "Uninstall     $app\uninstall.cmd  (visitor data is kept unless -RemoveData is added)"
    Write-Info "Move to a PC  $app\export-data.cmd, then install.cmd -ImportData <file> on the new PC"
    Write-Info "Log file      $script:LogFile"
}

# ---------------------------------------------------------------- main
function Invoke-Install {
    Write-Host ''
    Write-Host 'RP Xperience Centre Kiosk installer' -ForegroundColor White
    if ($DryRun) { Write-Host 'Dry run: nothing is changed.' -ForegroundColor DarkGray }
    if ($Check) { Write-Host 'Check only: nothing is changed.' -ForegroundColor DarkGray }

    Write-Step 'Package'
    $pkg = Test-Package

    $root = $InstallDir
    if (-not $root) { $root = $DefaultRoot }
    $root = [IO.Path]::GetFullPath($root).TrimEnd('\')
    Write-Info "Install folder: $root"

    if (-not $Check -and -not $DryRun -and (Test-Path -LiteralPath $root)) { Repair-Leftovers $root }
    $info = Get-InstallInfo $root
    if ($info -and -not (Test-Path -LiteralPath (Join-Path $root 'app'))) {
        Write-Note "an install record is in $root, but its program files are not: it is installed again (the data is kept)"
        $info = $null
    }
    $action = Compare-Build $pkg $info
    if ($Update -and $action -eq 'fresh') { Stop-Here "nothing is installed in $root yet: run install.cmd (without -Update)" $ExitRefused }
    if ($ImportData -and $action -ne 'fresh') { Stop-Here "the kiosk is already installed in $root. Data from an old PC is only loaded into a new install: uninstall with -RemoveData first, or choose another -InstallDir." $ExitRefused }
    if ($action -eq 'older') {
        if (-not $AllowDowngrade) { Stop-Here "build $($info.build) is installed and this package is the older build $($pkg.build): nothing changed. Add -AllowDowngrade to go back anyway." $ExitRefused }
        $action = 'update'
        Write-Note "going back from build $($info.build) to $($pkg.build) (-AllowDowngrade)"
    }
    if ($info) {
        $have = @()
        # the database is asked which changes it has, so MySQL is started for that (not on a check or a dry run)
        if (-not $Check -and -not $DryRun) { [void](Start-KioskMySql $root ([int]$info.mysqlPort) $info.mode) }
        if (Test-TcpOpen ([int]$info.mysqlPort)) { $have = @(Get-AppliedMigrations $root (Join-Path $root 'app')) }
        $unknown = @($have | Where-Object { @($pkg.migrations) -notcontains $_ })
        if ($unknown.Count) { Stop-Here "the database already has changes this package does not know ($($unknown -join ', ')): it is older than the data, so nothing changed" $ExitRefused }
    }
    switch ($action) {
        'fresh' { Write-Ok 'nothing installed yet: a new install' }
        'update' { Write-Ok "build $($info.build) is installed: it is updated to build $($pkg.build), keeping all data" }
        'repair' { Write-Ok "build $($pkg.build) is already installed: it is repaired (files put back, settings and data kept)" }
    }

    # what to do: options, the earlier install's settings, or the answers
    $plan = [pscustomobject]@{ Root = $root; Action = $action; Role = $Role; Port = $Port; MySqlPort = $MySqlPort; Mode = 'process'; NeedsAdmin = $false }
    $admin = $null
    if ($info) {
        if (-not $plan.Role) { $plan.Role = $info.role }
        if (-not $plan.Port) { $plan.Port = [int]$info.port }
        if (-not $plan.MySqlPort) { $plan.MySqlPort = [int]$info.mysqlPort }
        $plan.Mode = $info.mode
        $plan.NeedsAdmin = ($plan.Mode -eq 'service' -and ((Compare-MySqlVersion $pkg.mysql $info.mysqlVersion) -ne 0 -or $plan.MySqlPort -ne [int]$info.mysqlPort))
    } else {
        if (-not $plan.Role) {
            if ($NonInteractive) { $plan.Role = 'Laptop' }
            else {
                Write-Host ''
                Write-Host '         Where will this copy run?'
                Write-Host '           1  Laptop   for testing and development (nothing starts by itself)'
                Write-Host '           2  Wall PC  the kiosk server at the centre (starts at sign-in, desktop link, firewall rule for tablets)'
                if ((Read-Answer 'Type 1 or 2' '1') -eq '2') { $plan.Role = 'WallPC' } else { $plan.Role = 'Laptop' }
            }
        }
        if (-not $plan.Port) { $plan.Port = [int](Read-Answer 'Port of the kiosk server (tablets connect to it)' '3000') }
        if (-not $plan.MySqlPort) { $plan.MySqlPort = [int](Read-Answer "Port of the kiosk's own MySQL (this PC only)" '3307') }
        if (-not $ImportData -and -not $NonInteractive -and -not (Test-Path -LiteralPath (Join-Path $root 'data\kept\app'))) {
            $ImportData = Read-Answer 'Moving from an old PC? Path of its data file from export-data.cmd (Enter to skip)' ''
        }
        $wantService = -not $NoService
        if ($wantService -and $plan.Role -eq 'Laptop' -and -not (Test-Admin) -and -not $NonInteractive) {
            $wantService = Confirm-Choice 'Run MySQL as a Windows service? It starts with Windows and needs administrator rights once' $true
        }
        if ($wantService -and $plan.Role -eq 'Laptop' -and -not (Test-Admin) -and $NonInteractive) { $wantService = $false }
        if ($wantService) { $plan.Mode = 'service' }
        $plan.NeedsAdmin = ($plan.Mode -eq 'service' -or ($plan.Role -eq 'WallPC' -and -not $NoFirewall))
    }
    Write-Info "Role: $($plan.Role), kiosk server port $($plan.Port), MySQL port $($plan.MySqlPort), MySQL as $(Get-ModeText $plan.Mode)"

    Write-Step 'Checks before installing'
    $problems = Test-Before $plan $pkg
    if ($Check) {
        Write-Host ''
        if ($problems) { Write-Bad "$problems check(s) failed"; return $ExitRefused }
        Write-Ok 'every check passed: install.cmd can install here'
        return $ExitOk
    }
    if ($problems) { Stop-Here "$problems check(s) failed (see above): nothing was changed" $ExitRefused }

    if ($DryRun) {
        Write-Step 'What the install would do'
        if ($action -eq 'fresh') {
            if ($plan.Mode -eq 'service') { Write-Would "ask for administrator rights once, then: make $root (administrators own it; $env:USERNAME owns app and data), unpack MySQL $($pkg.mysql), set up its data folder and the service $ServiceName (own account $ServiceAccount, port $($plan.MySqlPort), this PC only)" }
            else { Write-Would "make $root (only $env:USERNAME, SYSTEM and administrators), unpack MySQL $($pkg.mysql), set up its data folder and run it as a program of $env:USERNAME on port $($plan.MySqlPort)" }
            if ($plan.Role -eq 'WallPC' -and -not $NoFirewall) { Write-Would "add the firewall rule `"$FirewallName`" (TCP $($plan.Port), Private and Domain networks)" }
            Write-Would "unpack kiosk build $($pkg.build) with Node.js $($pkg.node) into $root\app"
            Write-Would 'write backend\.env with new random keys and passwords, load the database tables, apply every database change'
            if ($ImportData) { Write-Would "load the database, keys, photos and settings from $ImportData" } else { Write-Would 'set the first admin account (asked, never the default password)' }
            if ($plan.Role -eq 'WallPC') { Write-Would 'add the Startup shortcut and the desktop link' }
        } else {
            Write-Would 'stop the kiosk servers of this folder and back up the database and settings into data\backups'
            if ((Compare-MySqlVersion $pkg.mysql $info.mysqlVersion) -ne 0) { Write-Would "replace MySQL $($info.mysqlVersion) with $($pkg.mysql), keeping its data" }
            Write-Would "unpack build $($pkg.build) next to the running one, move settings, keys, photos and logs into it, apply the new database changes"
            Write-Would 'switch to it; if anything fails, put the previous version and the database back'
        }
        if (-not $NoStart) { Write-Would 'start the kiosk and wait until the admin page answers' }
        Write-Host ''
        Write-Host '   Dry run finished: nothing was changed.'
        return $ExitOk
    }

    if ($action -eq 'fresh') {
        $import = $null
        if ($ImportData) {
            if (Test-Path -LiteralPath (Join-Path $root 'data\kept\app')) { Stop-Here "$root holds data kept by an earlier uninstall; load an old PC's data into a new folder instead (-InstallDir)" $ExitRefused }
            $import = Open-ImportFile $ImportData
        } elseif (-not (Test-Path -LiteralPath (Join-Path $root 'data\kept\app'))) {
            $admin = Read-AdminAccount
        }
        try { $info = Install-Fresh $plan $pkg $admin $import } finally { if ($import) { [void](Remove-Tree $import.Work) } }
        $started = $false
        if (-not $NoStart) {
            Write-Step 'Start and check'
            Start-Kiosk (Join-Path $root 'app')
            if (Wait-KioskReady (Join-Path $root 'app') $plan.Port) { $started = $true; Write-Ok 'the kiosk runs and the admin page answers' }
            else { Write-Bad "the kiosk was installed but did not answer on https://localhost:$($plan.Port)/admin; run kiosk-status.cmd"; Show-Done $info $false; return $ExitFailed }
        }
        Show-Done $info $started
    } else {
        $info = Install-Update $plan $pkg $info
        Show-Done $info (-not $NoStart)
    }
    if ($script:AdminMissing) { Write-Note 'an administrator step is missing (see above): run install.cmd again and allow it'; return $ExitNeedsAdmin }
    return $ExitOk
}

$null = Start-KioskLog 'install'
if (-not (Enter-InstallLock)) { Write-Bad 'another install or uninstall of the kiosk is running; wait for it to finish'; exit $ExitRefused }
$exitCode = $ExitFailed
try {
    $exitCode = Invoke-Install
} catch {
    $msg = "$($_.Exception.Message)"
    if ($msg -match '^STOP:(\d+)$') { $exitCode = [int]$Matches[1] }
    else { Write-Bad $msg; $exitCode = $ExitFailed }
    Write-Host ''
    Write-Info "Log file: $script:LogFile"
} finally {
    Exit-InstallLock
}
Write-Log 'END' "exit code $exitCode"
exit $exitCode
# <Jun Kai end>
