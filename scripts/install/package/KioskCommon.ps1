# Owner: Role 3, Jun Kai.
# Shared by the command line installer (Install-Kiosk.ps1), the uninstaller, the administrator helper and the
# start script. Windows PowerShell 5.1 is all a fresh PC has, so: ASCII only, no && or ?? or ternaries here.
# Hibernate and wake timers belong to Role 4 (Ryan), so nothing here touches the power plan.
# <Jun Kai start>
$ErrorActionPreference = 'Continue'
# Windows PowerShell started from a PowerShell 7 window inherits PowerShell 7's module folders and then misses its
# own cmdlets (Get-FileHash, Get-NetTCPConnection...): it uses only its own folders here
if ($PSVersionTable.PSEdition -ne 'Core') {
    $env:PSModulePath = (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules') + ';' + (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules')
}

# Windows' own tar (bsdtar, opens zip files). A PATH with Git's usr\bin would find GNU tar first, which cannot.
$Tar = Join-Path $env:SystemRoot 'System32\tar.exe'
$KioskTitle = 'RP Xperience Centre Kiosk'
$DefaultRoot = 'C:\RPXperienceKiosk'
$ServiceName = 'RPXKioskMySQL'
$ServiceDisplay = 'RP Xperience Centre Kiosk database'
$ServiceAccount = "NT SERVICE\$ServiceName"
$FirewallGroup = 'RP Xperience Centre Kiosk'
$FirewallName = 'RP Xperience Centre Kiosk - tablets to the kiosk server'
$KioskServerPort = 3003
$DbName = 'dp_kiosk_db'
$DbUser = 'kiosk_user'
$StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'RP Xperience Centre Kiosk.lnk'
$DesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'RP Xperience Centre Kiosk Admin.url'
# What the app writes inside its own folder. An update moves these into the new version, uninstall keeps them.
$DataItems = @('backend\.env', 'backend\data', 'backend\certs', 'backend\cache', 'uploads', 'logs')
# The AI model the app downloads on first use: carried over too, unless the new version already brings one
$ModelCache = 'node_modules\@xenova\transformers\.cache'
$ExitOk = 0
$ExitFailed = 1
$ExitNeedsAdmin = 2
$ExitRefused = 3
$SidSystem = 'S-1-5-18'
$SidAdmins = 'S-1-5-32-544'
$SidCreatorOwner = 'S-1-3-0'

# ---- output and the log file ----
$script:LogFile = $null
function Start-KioskLog([string]$Name) {
    $dir = Join-Path $env:TEMP 'rp-xperience-kiosk'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $script:LogFile = Join-Path $dir ($Name + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + "-$PID.log")
    Write-Log 'START' "$Name, PowerShell $($PSVersionTable.PSVersion), Windows $([Environment]::OSVersion.Version), user $env:USERNAME"
    return $script:LogFile
}
function Use-KioskLog([string]$Path) { $script:LogFile = $Path }
# Copies the log into the install's own logs folder once that folder exists, and keeps writing there
function Move-KioskLog([string]$Root) {
    if (-not $script:LogFile -or -not (Test-Path -LiteralPath $script:LogFile)) { return }
    $dir = Join-Path $Root 'data\logs'
    try {
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $target = Join-Path $dir (Split-Path $script:LogFile -Leaf)
        if ($target -ne $script:LogFile) {
            Copy-Item -LiteralPath $script:LogFile -Destination $target -Force
            $script:LogFile = $target
        }
    } catch { }
}
function Write-Log([string]$Level, [string]$Text) {
    if (-not $script:LogFile) { return }
    $line = '{0} {1,-5} {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Text
    try { [IO.File]::AppendAllText($script:LogFile, $line + "`r`n") } catch { }
}
function Write-Step([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan; Write-Log 'STEP' $Text }
function Write-Ok([string]$Text) { Write-Host "   ok    $Text" -ForegroundColor Green; Write-Log 'OK' $Text }
function Write-Info([string]$Text) { Write-Host "         $Text"; Write-Log 'INFO' $Text }
function Write-Note([string]$Text) { Write-Host "   note  $Text" -ForegroundColor Yellow; Write-Log 'NOTE' $Text }
function Write-Bad([string]$Text) { Write-Host "   error $Text" -ForegroundColor Red; Write-Log 'ERROR' $Text }
function Write-Would([string]$Text) { Write-Host "   would $Text" -ForegroundColor DarkGray; Write-Log 'WOULD' $Text }

# Runs a program, shows and logs every line it prints, returns its exit code
function Invoke-Native([string]$Exe, [string[]]$Arguments, [switch]$Quiet) {
    Write-Log 'RUN' ((Split-Path $Exe -Leaf) + ' ' + ($Arguments -join ' '))
    & $Exe @Arguments 2>&1 | ForEach-Object {
        $text = "$_"
        if ($text.Trim()) {
            if ($Quiet) { Write-Log 'OUT' $text } else { Write-Info $text }
        }
    }
    return $LASTEXITCODE
}

# One argument for Start-Process, which joins its list with spaces and quotes nothing itself
function ConvertTo-Arg([string]$Value) {
    if ($Value -eq '') { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + ($Value -replace '"', '\"') + '"'
}

function Test-Admin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Get-UserSid { return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }

# A yes/no question; without anyone to answer (-NonInteractive) the default is taken, so a risky one defaults to no
function Confirm-Choice([string]$Question, [bool]$Default) {
    if ($script:NonInteractive) { return $Default }
    $hint = '[y/N]'
    if ($Default) { $hint = '[Y/n]' }
    $answer = Read-Host "         $Question $hint"
    Write-Log 'ASK' "$Question -> $answer"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim().ToLower().StartsWith('y')
}
function Read-Answer([string]$Question, [string]$Default) {
    if ($script:NonInteractive) { return $Default }
    $answer = Read-Host "         $Question [$Default]"
    Write-Log 'ASK' "$Question -> $answer"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim()
}
# Typed hidden, never written to the log
function Read-Secret([string]$Question) {
    $secure = Read-Host "         $Question" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-Sha256([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return (($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $stream.Dispose(); $sha.Dispose() }
}

function New-Secret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($buffer)
    $rng.Dispose()
    return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
}

# Text files without the byte order mark PowerShell 5.1 adds (dotenv and MySQL would read it as part of the text)
function Write-TextFile([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}
function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return ([IO.File]::ReadAllText($Path) | ConvertFrom-Json) } catch { return $null }
}
function Write-JsonFile([string]$Path, $Value) {
    Write-TextFile $Path ($Value | ConvertTo-Json -Depth 8)
}

# KEY=value lines of a .env file, the raw text after the = (quotes and all)
function Read-EnvLines([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
    }
    return $values
}
function Get-EnvValue($Values, [string]$Key, [string]$Default) {
    if ($Values.ContainsKey($Key)) {
        $raw = $Values[$Key]
        if ($raw -match '^([''"])(.*)\1') { $raw = $Matches[2] } else { $raw = ($raw -split '#')[0].Trim() }
        if ($raw) { return $raw }
    }
    return $Default
}

# ---- the install record (data\install.json): settings and the list of everything the installer made ----
function Get-InstallFile([string]$Root) { return (Join-Path $Root 'data\install.json') }
function Get-InstallInfo([string]$Root) { return (Read-JsonFile (Get-InstallFile $Root)) }
function Save-InstallInfo([string]$Root, $Info) {
    $dir = Join-Path $Root 'data'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Write-JsonFile (Get-InstallFile $Root) $Info
}
# One entry per thing made: type folder | service | firewall | shortcut, with what identifies it
function New-Item-Record([string]$Type, [string]$Id, [string]$Text) {
    return [pscustomobject]@{ type = $Type; id = $Id; text = $Text; created = (Get-Date).ToString('s') }
}
function Add-Record($Info, [string]$Type, [string]$Id, [string]$Text) {
    $items = @($Info.items | Where-Object { -not ($_.type -eq $Type -and $_.id -eq $Id) })
    $Info.items = @($items) + @(New-Item-Record $Type $Id $Text)
}
function Remove-Record($Info, [string]$Type, [string]$Id) {
    $Info.items = @($Info.items | Where-Object { -not ($_.type -eq $Type -and $_.id -eq $Id) })
}

# A path counts as the kiosk's only when it is the root itself or inside it
function Test-InsideRoot([string]$Root, [string]$Path) {
    if (-not $Root -or -not $Path) { return $false }
    $r = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $p = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
    return $p.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)
}

# ---- folders ----
function Get-LongPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.StartsWith('\\?\')) { return $full }
    return '\\?\' + $full
}
# Deletes a folder tree. rd removes a link without following it, and \\?\ copes with paths over 260 characters.
function Remove-Tree([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $true }
    for ($try = 1; $try -le 5; $try++) {
        if ((Get-Item -LiteralPath $Path -Force).PSIsContainer) {
            & cmd.exe /d /c "rd /s /q `"$(Get-LongPath $Path)`"" 2>&1 | Out-Null
        } else {
            Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        }
        if (-not (Test-Path -LiteralPath $Path)) { return $true }
        Start-Sleep -Seconds 2
    }
    return (-not (Test-Path -LiteralPath $Path))
}
# A rename on the same drive: instant for any size. Antivirus or an open Explorer window can hold it for a moment.
function Move-Folder([string]$From, [string]$To) {
    for ($try = 1; $try -le 6; $try++) {
        try { [IO.Directory]::Move($From, $To); return } catch { $last = $_.Exception.Message }
        Start-Sleep -Seconds 2
    }
    throw "could not move $From to ${To}: $last"
}
function Move-PathItem([string]$From, [string]$To) {
    $parent = Split-Path $To -Parent
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    if ((Get-Item -LiteralPath $From -Force).PSIsContainer) { Move-Folder $From $To }
    else { Move-Item -LiteralPath $From -Destination $To -Force -ErrorAction Stop }
}
function Test-EmptyFolder([string]$Path) {
    return ((Test-Path -LiteralPath $Path) -and @(Get-ChildItem -LiteralPath $Path -Force -Recurse -File -ErrorAction SilentlyContinue).Count -eq 0)
}

# Moves the app's own data (DataItems, the AI model cache) from one app folder to another, e.g. into a new version
function Move-AppData([string]$FromApp, [string]$ToApp) {
    foreach ($rel in @($DataItems) + @($ModelCache)) {
        $src = Join-Path $FromApp $rel
        $dst = Join-Path $ToApp $rel
        if (-not (Test-Path -LiteralPath $src)) { continue }
        if (Test-Path -LiteralPath $dst) {
            if ($rel -eq $ModelCache) { continue }
            if (Test-EmptyFolder $dst) { [void](Remove-Tree $dst) }
            else { throw "$rel is in both $FromApp and $ToApp, so nothing was moved over it" }
        }
        Move-PathItem $src $dst
    }
}
# Files an admin uploaded into assets\ (overlays, backgrounds, tree leaves): every file the package did not ship
function Get-UserAssets([string]$App, [string]$ListFile) {
    $assets = Join-Path $App 'assets'
    if (-not (Test-Path -LiteralPath $assets)) { return @() }
    $shipped = @{}
    $list = Join-Path $App '.shipped-assets.txt'
    if ($ListFile) { $list = $ListFile }
    if (Test-Path -LiteralPath $list) { foreach ($l in [IO.File]::ReadAllLines($list)) { if ($l) { $shipped[$l.ToLowerInvariant()] = $true } } }
    $out = @()
    # the long form of the folder: a short name (RUNNER~1) in the path would make the cut below land wrong
    $assets = (Get-Item -LiteralPath $assets).FullName
    foreach ($f in @(Get-ChildItem -LiteralPath $assets -Recurse -File -Force -ErrorAction SilentlyContinue)) {
        $rel = $f.FullName.Substring($assets.Length).TrimStart('\').Replace('\', '/')
        if (-not $shipped.ContainsKey($rel.ToLowerInvariant())) { $out += $rel }
    }
    return $out
}
function Copy-UserAssets([string]$FromApp, [string]$ToApp) {
    $count = 0
    foreach ($rel in @(Get-UserAssets $FromApp)) {
        $dst = Join-Path (Join-Path $ToApp 'assets') $rel
        if (Test-Path -LiteralPath $dst) { continue }
        $parent = Split-Path $dst -Parent
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Copy-Item -LiteralPath (Join-Path (Join-Path $FromApp 'assets') $rel) -Destination $dst -Force -ErrorAction Stop
        $count++
    }
    return $count
}

# ---- folder rights ----
# Laptop mode: the folder is the installing user's own (plus SYSTEM and administrators); other users get nothing
function Set-PrivateAcl([string]$Path, [string]$UserSid) {
    $code = Invoke-Native 'icacls.exe' @($Path, '/inheritance:r', '/grant:r', "*${SidSystem}:(OI)(CI)F", "*${SidAdmins}:(OI)(CI)F", "*${UserSid}:(OI)(CI)F", '/Q') -Quiet
    if ($code -ne 0) { throw "icacls could not set the rights on $Path (exit code $code)" }
}
# Service mode: administrators own the root. The user may make folders in it and owns what they make (app, data),
# but cannot rename or delete mysql and mysql-data, which the MySQL service runs from. Same idea as C:\ itself.
function Set-ServiceRootAcl([string]$Root, [string]$UserSid) {
    $codes = @()
    $codes += Invoke-Native 'icacls.exe' @($Root, '/setowner', "*$SidAdmins", '/Q') -Quiet
    $codes += Invoke-Native 'icacls.exe' @($Root, '/inheritance:r', '/grant:r', "*${SidSystem}:(OI)(CI)F", "*${SidAdmins}:(OI)(CI)F", "*${SidCreatorOwner}:(OI)(CI)(IO)F", "*${UserSid}:(RD,RA,REA,X,RC,S,AD)", '/Q') -Quiet
    foreach ($sub in @('app', 'data', 'app.new', 'app.old')) {
        $p = Join-Path $Root $sub
        if (Test-Path -LiteralPath $p) { $codes += Invoke-Native 'icacls.exe' @($p, '/grant', "*${UserSid}:(OI)(CI)F", '/Q') -Quiet }
    }
    if (@($codes | Where-Object { $_ -ne 0 }).Count) { throw "icacls could not set the rights on $Root" }
}

# ---- processes and ports ----
# node.exe and mysqld.exe that run from this folder (their program or command line is inside it). Never every node.exe.
function Get-KioskProcesses([string]$Root, [string[]]$Names = @('node.exe', 'mysqld.exe')) {
    $needle = ([IO.Path]::GetFullPath($Root).TrimEnd('\') + '\').ToLowerInvariant()
    $found = @()
    foreach ($name in $Names) {
        foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name = '$name'" -ErrorAction SilentlyContinue)) {
            $text = ("$($p.ExecutablePath) $($p.CommandLine)").ToLowerInvariant()
            if ($text.Contains($needle)) { $found += $p }
        }
    }
    return $found
}
function Stop-KioskServers([string]$Root) {
    $nodes = @(Get-KioskProcesses $Root @('node.exe'))
    if ($nodes.Count -eq 0) { return 0 }
    # the console windows they run in (start-kiosk.cmd, or the "cmd /k" window that restart-app.bat opens) have the
    # app folder as their current folder and would block moving or deleting it: only a cmd.exe that is the direct
    # parent of one of these node processes is closed, never any other window
    $parents = @($nodes | ForEach-Object { $_.ParentProcessId })
    $windows = @(Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" -ErrorAction SilentlyContinue | Where-Object { $parents -contains $_.ProcessId })
    foreach ($p in $nodes) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    foreach ($w in $windows) { Stop-Process -Id $w.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    return $nodes.Count
}
# Who listens on a TCP port: $null when nobody, else the process id and its program
function Get-PortOwner([int]$Port) {
    $listen = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($listen.Count -eq 0) { return $null }
    $procId = $listen[0].OwningProcess
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
    $path = ''
    if ($proc) { $path = "$($proc.ExecutablePath) $($proc.CommandLine)" }
    return [pscustomobject]@{ Port = $Port; ProcessId = $procId; Name = $(if ($proc) { $proc.Name } else { 'process ' + $procId }); Text = $path }
}
function Test-TcpOpen([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $wait = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $wait.AsyncWaitHandle.WaitOne(1500)) { return $false }
        $client.EndConnect($wait)
        return $true
    } catch { return $false } finally { $client.Close() }
}
function Wait-TcpOpen([int]$Port, [int]$Seconds) {
    $until = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $until) {
        if (Test-TcpOpen $Port) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

# ---- the kiosk's own MySQL ----
function Get-MySqlPaths([string]$Root) {
    $bin = Join-Path $Root 'mysql\bin'
    return [pscustomobject]@{
        Base = Join-Path $Root 'mysql'
        Bin = $bin
        Mysqld = Join-Path $bin 'mysqld.exe'
        Client = Join-Path $bin 'mysql.exe'
        Dump = Join-Path $bin 'mysqldump.exe'
        Admin = Join-Path $bin 'mysqladmin.exe'
        Ini = Join-Path $Root 'mysql\my.ini'
        Data = Join-Path $Root 'mysql-data'
        RootPassword = Join-Path $Root 'mysql-data\kiosk-root-password.txt'
    }
}
function Get-MySqlVersion([string]$Root) {
    $m = Get-MySqlPaths $Root
    if (-not (Test-Path -LiteralPath $m.Mysqld)) { return $null }
    $text = (& $m.Mysqld --version 2>&1 | Out-String)
    if ($text -match 'Ver\s+(\d+\.\d+\.\d+)') { return $Matches[1] }
    return $null
}
function Write-MySqlIni([string]$Root, [int]$Port) {
    $m = Get-MySqlPaths $Root
    $base = $m.Base.Replace('\', '/')
    $data = $m.Data.Replace('\', '/')
    $text = @(
        '# Written by the RP Xperience Centre Kiosk installer. Running install.cmd again writes it again.',
        '[mysqld]',
        "basedir=`"$base`"",
        "datadir=`"$data`"",
        "port=$Port",
        'bind-address=127.0.0.1',
        '# the X protocol port (33060) would clash with a MySQL that is already on the PC',
        'mysqlx=OFF',
        'event_scheduler=ON',
        'character-set-server=utf8mb4',
        'collation-server=utf8mb4_unicode_ci',
        'max_connections=60',
        "log-error=`"$data/mysqld.err`"",
        '',
        '[client]',
        'host=127.0.0.1',
        "port=$Port"
    ) -join "`r`n"
    [IO.File]::WriteAllText($m.Ini, $text + "`r`n", [Text.Encoding]::ASCII)
}
# A new, empty data folder: the database, its app user and the root password are made in one go (--init-file),
# so no password is ever typed, shown or put on a command line
function Initialize-MySqlData([string]$Root, [string]$AppPassword) {
    $m = Get-MySqlPaths $Root
    if (Test-Path -LiteralPath (Join-Path $m.Data 'mysql.ibd')) { return 'kept' }
    if ((Test-Path -LiteralPath $m.Data) -and @(Get-ChildItem -LiteralPath $m.Data -Force).Count -gt 0) {
        throw "$($m.Data) is not empty but holds no MySQL data, so it was left alone"
    }
    if (-not (Test-Path -LiteralPath $m.Data)) { New-Item -ItemType Directory -Path $m.Data -Force | Out-Null }
    $rootPassword = New-Secret 24
    $init = Join-Path $m.Base ('init-' + [guid]::NewGuid().ToString('N') + '.sql')
    $sql = @(
        "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';",
        "CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    )
    foreach ($h in @('localhost', '127.0.0.1', '::1')) {
        $sql += "CREATE USER IF NOT EXISTS '$DbUser'@'$h' IDENTIFIED BY '$AppPassword';"
        $sql += "GRANT ALL PRIVILEGES ON ``$DbName``.* TO '$DbUser'@'$h';"
    }
    [IO.File]::WriteAllText($init, (($sql -join "`n") + "`n"), [Text.Encoding]::ASCII)
    try {
        $code = Invoke-Native $m.Mysqld @("--defaults-file=$($m.Ini)", '--initialize-insecure', "--init-file=$init", '--console') -Quiet
    } finally {
        Remove-Item -LiteralPath $init -Force -ErrorAction SilentlyContinue
    }
    if ($code -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $m.Data 'mysql.ibd'))) {
        throw "MySQL could not set up its data folder (exit code $code); see $($m.Data)\mysqld.err"
    }
    [IO.File]::WriteAllText($m.RootPassword, $rootPassword, [Text.Encoding]::ASCII)
    return 'new'
}
function Get-ModeText([string]$Mode) {
    if ($Mode -eq 'service') { return "the Windows service $ServiceName" }
    return 'a program of this user'
}
function Get-ServiceState {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) { return $null }
    return "$($svc.Status)"
}
# Starts the database: the service when there is one (the user was given the right to start it), else mysqld as a
# hidden program of this user that keeps running when the window closes
function Start-KioskMySql([string]$Root, [int]$Port, [string]$Mode) {
    if (Test-TcpOpen $Port) { return $true }
    $m = Get-MySqlPaths $Root
    if ($Mode -eq 'service') {
        & sc.exe start $ServiceName 2>&1 | Out-Null
    } else {
        Start-Process -FilePath $m.Mysqld -ArgumentList @((ConvertTo-Arg "--defaults-file=$($m.Ini)")) -WindowStyle Hidden | Out-Null
    }
    return (Wait-TcpOpen $Port 90)
}
function Stop-KioskMySql([string]$Root, [int]$Port, [string]$Mode) {
    $m = Get-MySqlPaths $Root
    if ($Mode -eq 'service') {
        if ((Get-ServiceState) -eq 'Running') { & sc.exe stop $ServiceName 2>&1 | Out-Null }
        for ($i = 0; $i -lt 60; $i++) { if ((Get-ServiceState) -ne 'Running' -and -not (Test-TcpOpen $Port)) { break }; Start-Sleep -Seconds 1 }
    } elseif (Test-TcpOpen $Port) {
        $cnf = $null
        if (Test-Path -LiteralPath $m.RootPassword) {
            $cnf = New-ClientCnf 'root' ([IO.File]::ReadAllText($m.RootPassword).Trim()) $Port
            try { Invoke-Native $m.Admin @("--defaults-extra-file=$cnf", 'shutdown') -Quiet | Out-Null } finally { Remove-Item -LiteralPath $cnf -Force -ErrorAction SilentlyContinue }
        }
        for ($i = 0; $i -lt 60; $i++) { if (@(Get-KioskProcesses $Root @('mysqld.exe')).Count -eq 0) { break }; Start-Sleep -Seconds 1 }
    }
    # a mysqld of this folder still running (it ignored the shutdown) is ended, so its files can be moved or deleted
    foreach ($p in @(Get-KioskProcesses $Root @('mysqld.exe'))) { if ($Mode -ne 'service') { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } }
}
# Login details for the MySQL client tools in a file only this user can read, so the password is never an argument
function New-ClientCnf([string]$User, [string]$Password, [int]$Port, [string]$HostName = '127.0.0.1') {
    $path = Join-Path $env:TEMP ('rpk-' + [guid]::NewGuid().ToString('N') + '.cnf')
    $text = "[client]`r`nuser=$User`r`npassword=`"$Password`"`r`nhost=$HostName`r`nport=$Port`r`n"
    [IO.File]::WriteAllText($path, $text, [Text.Encoding]::ASCII)
    return $path
}
function Get-AppDbLogin([string]$App) {
    $envValues = Read-EnvLines (Join-Path $App 'backend\.env')
    return [pscustomobject]@{
        User = Get-EnvValue $envValues 'DB_USER' $DbUser
        Password = Get-EnvValue $envValues 'DB_PASSWORD' ''
        Database = Get-EnvValue $envValues 'DB_NAME' $DbName
        Port = [int](Get-EnvValue $envValues 'DB_PORT' '3307')
    }
}
# A full copy of the database as SQL, made with the app's own login (it may read and recreate its own database)
function Backup-KioskDatabase([string]$Root, [string]$App, [string]$OutFile) {
    $m = Get-MySqlPaths $Root
    $login = Get-AppDbLogin $App
    $cnf = New-ClientCnf $login.User $login.Password $login.Port
    try {
        $code = Invoke-Native $m.Dump @("--defaults-extra-file=$cnf", '--single-transaction', '--routines', '--events', '--triggers', '--no-tablespaces', '--set-gtid-purged=OFF', '--default-character-set=utf8mb4', "--result-file=$OutFile", $login.Database) -Quiet
    } finally { Remove-Item -LiteralPath $cnf -Force -ErrorAction SilentlyContinue }
    if ($code -ne 0 -or -not (Test-Path -LiteralPath $OutFile)) { throw "mysqldump could not copy the database (exit code $code)" }
}
# Puts a copy made by Backup-KioskDatabase (or an export from an old PC) back: the database is emptied first
function Restore-KioskDatabase([string]$Root, [string]$App, [string]$SqlFile) {
    $m = Get-MySqlPaths $Root
    $login = Get-AppDbLogin $App
    $cnf = New-ClientCnf $login.User $login.Password $login.Port
    $db = $login.Database
    try {
        $code = Invoke-Native $m.Client @("--defaults-extra-file=$cnf", '-e', "DROP DATABASE IF EXISTS ``$db``; CREATE DATABASE ``$db`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;") -Quiet
        if ($code -eq 0) {
            $code = Invoke-Native $m.Client @("--defaults-extra-file=$cnf", '--default-character-set=utf8mb4', $db, '-e', ('source ' + $SqlFile.Replace('\', '/'))) -Quiet
        }
    } finally { Remove-Item -LiteralPath $cnf -Force -ErrorAction SilentlyContinue }
    if ($code -ne 0) { throw "the database copy could not be loaded back (exit code $code)" }
}
function Get-AppliedMigrations([string]$Root, [string]$App) {
    $m = Get-MySqlPaths $Root
    $login = Get-AppDbLogin $App
    $cnf = New-ClientCnf $login.User $login.Password $login.Port
    try {
        $out = & $m.Client "--defaults-extra-file=$cnf" '-N' '-B' '-e' "SELECT name FROM ``$($login.Database)``.schema_migrations ORDER BY name" 2>$null
    } finally { Remove-Item -LiteralPath $cnf -Force -ErrorAction SilentlyContinue }
    return @($out | Where-Object { $_ } | ForEach-Object { "$_".Trim() })
}

# ---- Windows items: firewall rule, shortcuts, service ----
function Get-OwnFirewallRules {
    return @(Get-NetFirewallRule -Group $FirewallGroup -ErrorAction SilentlyContinue)
}
function Get-RulePorts($Rule) {
    $filter = $Rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    if ($filter) { return @($filter.LocalPort | ForEach-Object { "$_" }) }
    return @()
}
# A shortcut belongs to this install when it starts something inside the install folder
function Test-OwnShortcut([string]$LinkPath, [string]$Root) {
    if (-not (Test-Path -LiteralPath $LinkPath)) { return $false }
    if ($LinkPath -like '*.url') {
        return ((Get-Content -LiteralPath $LinkPath -ErrorAction SilentlyContinue | Out-String) -match 'localhost')
    }
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($LinkPath)
    return ((Test-InsideRoot $Root $link.TargetPath) -or (Test-InsideRoot $Root $link.WorkingDirectory))
}

# ---- versions ----
function Get-PackageInfo([string]$PackageDir) { return (Read-JsonFile (Join-Path $PackageDir 'version.json')) }
# Same build: repair. Higher: update. Lower: refused unless asked, and never past a database change the package
# does not know.
function Compare-Build($Package, $Installed) {
    if (-not $Installed) { return 'fresh' }
    $a = [int]$Package.build
    $b = [int]$Installed.build
    if ($a -gt $b) { return 'update' }
    if ($a -eq $b) { return 'repair' }
    return 'older'
}
function Compare-MySqlVersion([string]$A, [string]$B) {
    if (-not $A -or -not $B) { return 0 }
    return ([version]$A).CompareTo([version]$B)
}

# ---- one install at a time ----
$script:InstallMutex = $null
function Enter-InstallLock {
    $script:InstallMutex = New-Object Threading.Mutex($false, 'Global\RPXperienceCentreKioskInstaller')
    try { return $script:InstallMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { return $true }
}
function Exit-InstallLock {
    if ($script:InstallMutex) { try { $script:InstallMutex.ReleaseMutex() } catch { }; $script:InstallMutex.Dispose(); $script:InstallMutex = $null }
}

# The PC's IPv4 addresses, for the line that tells where tablets connect
function Get-LanAddresses {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { $_.IPAddress })
}
# <Jun Kai end>
