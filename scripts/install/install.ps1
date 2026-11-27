# Owner: Role 3, Jun Kai.
# RP Xperience Centre Kiosk installer for Windows (task-sheet point 5). Double-click install.cmd in the project folder; it runs this.
#   install.cmd                  asks Laptop or Wall PC, then sets everything up
#   install.cmd -Role Laptop     a developer laptop: kiosk automation off, nothing changed in Windows
#   install.cmd -Role WallPC     the kiosk PC: also starts the kiosk at logon, puts an admin page link on the desktop and
#                                adds the firewall rule the tablets need (Windows asks for administrator rights for it)
#   install.cmd -Check           only reports what is set up, changes nothing
#   install.cmd -DryRun          prints every step it would take, changes nothing
# Also: -NonInteractive (no questions, the safe answer is taken), -SkipNpm.
# Hibernate and wake timers are not set up here: they belong to Role 4 (Ryan, system-level hibernation scheduling).
# Safe to run again: it never overwrites a filled-in setting and never drops a database table.
# <Jun Kai start>
[CmdletBinding()]
param(
    [ValidateSet('Laptop', 'WallPC')][string]$Role,
    [switch]$Check,
    [switch]$DryRun,
    [switch]$NonInteractive,
    [switch]$SkipNpm,
    [switch]$AdminSteps
)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location $Root

function Stop-Install([string]$Message) {
    Write-Bad $Message
    Write-Host ''
    exit 1
}

function Get-Port {
    $port = '3000'
    $envFile = Join-Path $Root 'backend\.env'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) { if ($line -match '^\s*PORT\s*=\s*(\d+)') { $port = $Matches[1] } }
    }
    return $port
}

function Test-Programs {
    $script:ProgramsOk = $true
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Bad 'Node.js is not installed. Install Node.js 22 (winget install OpenJS.NodeJS.22, or https://nodejs.org),'
        Write-Info 'then open a new window and run install.cmd again.'
        $script:ProgramsOk = $false
    } else {
        $version = ((& node --version) | Out-String).Trim()
        $parts = $version.TrimStart('v').Split('.')
        $major = 0
        $minor = 0
        [void][int]::TryParse($parts[0], [ref]$major)
        if ($parts.Count -gt 1) { [void][int]::TryParse($parts[1], [ref]$minor) }
        # package.json asks for 22.12 or newer
        if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 12)) { Write-Bad "Node.js $version is too old: install Node.js 22 LTS (22.12 or newer)"; $script:ProgramsOk = $false }
        else {
            Write-Ok "Node.js $version"
            # winget's "LTS" package moved on to newer versions; the project and its CI run on 22 (.nvmrc)
            if ($major -gt 22) { Write-Note "Node.js $major is newer than the version this project is tested with (22). If npm ci or the start fails, install Node.js 22 (winget install OpenJS.NodeJS.22)." }
        }
        if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Bad 'npm is missing (it comes with Node.js: reinstall Node.js)'; $script:ProgramsOk = $false }
    }
    $services = @(Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue)
    $running = @($services | Where-Object { $_.Status -eq 'Running' })
    if ($services.Count -eq 0) {
        Write-Note 'no MySQL service on this PC. Install MySQL Server 8.4 (https://dev.mysql.com/downloads/installer/),'
        Write-Info 'unless DB_HOST in backend\.env points to MySQL on another PC.'
    } elseif ($running.Count -eq 0) {
        Write-Bad "the MySQL service ($($services[0].Name)) is stopped: start it in Services (services.msc), then run this again"
        $script:ProgramsOk = $false
    } else {
        Write-Ok "MySQL service $($running[0].Name) is running"
    }
    if (Get-Command git -ErrorAction SilentlyContinue) { Write-Ok 'Git (for updates with git pull)' }
    else { Write-Info 'Git is not installed (optional: only needed to get updates with git pull)' }
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Info 'Ollama is not installed (optional: the AI parts of the admin page use it, https://ollama.com)'
    } else {
        $models = (& ollama list 2>$null | Out-String)
        if ($models -match 'qwen2\.5:3b') { Write-Ok 'Ollama with the qwen2.5:3b model' }
        else { Write-Note 'Ollama is installed but not the qwen2.5:3b model: ollama pull qwen2.5:3b (about 2 GB)' }
    }
}

function Install-Packages {
    $modules = Join-Path $Root 'node_modules'
    if ($SkipNpm) { Write-Info 'skipped (-SkipNpm)'; return }
    if ((Test-Path $modules) -and (Get-Item -Force $modules).LinkType) {
        Write-Note 'node_modules is a link to another folder: npm ci skipped, so that folder is not emptied'
        return
    }
    $running = @(Get-KioskProcesses)
    if ($running.Count -gt 0 -and -not $DryRun) {
        Write-Note "the kiosk is running from this folder ($($running.Count) node process(es)); npm ci cannot replace files it uses."
        if (Confirm-Choice 'Stop the kiosk now?' $false) {
            $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            Write-Ok 'kiosk stopped'
        } else {
            Stop-Install 'close the kiosk window (or Ctrl+C in it) and run install.cmd again, or add -SkipNpm'
        }
    }
    Invoke-Change 'install the packages with npm ci (takes a few minutes)' {
        & npm.cmd ci --no-audit --no-fund | Out-Host
        if ($LASTEXITCODE -ne 0) { Stop-Install "npm ci failed (exit code $LASTEXITCODE)" }
    }
}

function Install-StartupLink {
    $node = (Get-Command node).Source
    $start = Join-Path $Root 'startAll.js'
    Invoke-Change 'start the kiosk at logon (a shortcut in the Startup folder)' {
        # <Jun Kai/> a shortcut of this copy under the old name would start the servers a second time
        if (Test-OwnLink $OldStartupLink) { Remove-Item -LiteralPath $OldStartupLink -Force }
        $link = (New-Object -ComObject WScript.Shell).CreateShortcut($StartupLink)
        $link.TargetPath = Join-Path $env:SystemRoot 'System32\cmd.exe'
        # --logon: the History list then says "started at Windows sign-in" (startAll.js passes it on)
        $link.Arguments = "/k title RP Xperience Centre Kiosk server & `"$node`" `"$start`" --logon"
        $link.WorkingDirectory = $Root
        $link.WindowStyle = 7
        $link.Description = 'Starts the RP Xperience Centre Kiosk servers (added by install.cmd, removed by uninstall.cmd)'
        $link.Save()
    }
}

function Install-DesktopLink([string]$Port) {
    Invoke-Change "put an `"RP Xperience Centre Kiosk Admin`" link on the desktop (https://localhost:$Port/admin)" {
        if (Test-Path $OldDesktopLink) { Remove-Item -LiteralPath $OldDesktopLink -Force } # <Jun Kai/> the link under the old name
        Set-Content -LiteralPath $DesktopLink -Encoding ASCII -Value @('[InternetShortcut]', "URL=https://localhost:$Port/admin")
    }
}

# The administrator part of the Wall PC: the firewall rule the tablets need. They only talk to the main server (PORT in
# backend\.env, 3000 unless changed). The kiosk server on 3003 listens on this PC only, so it gets no rule. A rule of
# an earlier install that opened other ports is replaced.
function Install-AdminSteps([string]$Port) {
    if (Test-FirewallRule $Port) { Write-Ok "the firewall rule `"$FirewallName`" is already there (TCP $Port)"; return }
    if (@(Get-FirewallRules).Count -gt 0) {
        $old = @(Get-FirewallPorts) -join ' and '
        Invoke-Change "remove the firewall rule of an earlier install (it opened TCP $old)" { Get-FirewallRules | Remove-NetFirewallRule -ErrorAction Stop }
    }
    Invoke-Change "let tablets on this network reach the kiosk (firewall rule, TCP $Port, Private and Domain networks only)" {
        New-NetFirewallRule -DisplayName $FirewallName -Group $FirewallGroup -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private, Domain -ErrorAction Stop | Out-Null
    }
}

function Show-WindowsStatus {
    $serverPort = Get-Port
    $open = @(Get-FirewallPorts)
    if ($open.Count -eq 0) { Write-Info 'no firewall rule for the kiosk (only the Wall PC needs it)' }
    elseif (Test-FirewallRule $serverPort) {
        Write-Ok "firewall rule `"$FirewallName`": tablets can reach TCP $serverPort"
        Show-NetworkNote
    } else { Write-Note "the firewall rule opens TCP $($open -join ' and '), but the server uses TCP $serverPort (install.cmd -Role WallPC replaces the rule)" }
    if (Test-Path $StartupLink) { Write-Ok 'starts at logon (Startup folder shortcut)' }
    else { Write-Info 'does not start at logon (only the Wall PC does)' }
    if (Test-Path $DesktopLink) { Write-Ok 'desktop link to the admin page' }
}

# The elevated second run started below: only the administrator part
if ($AdminSteps) {
    Write-Step 'Wall PC: firewall rule (administrator)'
    if (-not (Test-Admin)) { Stop-Install 'this part needs administrator rights' }
    # this window closes by itself, so an error stays on screen long enough to read
    try { Install-AdminSteps (Get-Port) } catch { Write-Bad $_.Exception.Message; Start-Sleep -Seconds 10; exit 1 }
    Start-Sleep -Seconds 3
    exit 0
}

Write-Host ''
Write-Host 'RP Xperience Centre Kiosk installer' -ForegroundColor White
Write-Host "Folder: $Root"
if ($DryRun) { Write-Host 'Dry run: nothing is changed.' -ForegroundColor DarkGray }

if ($Check) {
    Write-Step 'Programs'
    Test-Programs
    $code = 1
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-Step 'Settings and database'
        & node $SetupJs check
        $code = $LASTEXITCODE
    }
    Write-Step 'Windows'
    Show-WindowsStatus
    Write-Host ''
    exit $code
}

if (-not $Role) {
    if ($NonInteractive) { $Role = 'Laptop' }
    else {
        Write-Host ''
        Write-Host 'Where will this copy run?'
        Write-Host '  1  Laptop   for development and testing (kiosk automation off, Windows left alone)'
        Write-Host '  2  Wall PC  the kiosk server at the RP Xperience Centre (starts at logon, desktop link, firewall rule)'
        $answer = Read-Host 'Type 1 or 2'
        if ($answer.Trim() -eq '2') { $Role = 'WallPC' } else { $Role = 'Laptop' }
    }
}
Write-Host "Role: $Role"

Write-Step 'Programs this needs'
Test-Programs
if (-not $script:ProgramsOk) { Stop-Install 'install what is missing above, then run install.cmd again' }

Write-Step 'Packages'
Install-Packages

Write-Step 'Settings (backend\.env) and the database'
$setupArgs = @('install', '--role', $Role.ToLower())
if ($DryRun) { $setupArgs += '--dry-run' }
if ($NonInteractive) { $setupArgs += '--non-interactive' }
& node $SetupJs @setupArgs
if ($LASTEXITCODE -ne 0) { Stop-Install 'the settings or database step did not finish (see above); fix it and run install.cmd again' }

$port = Get-Port
$firewallFailed = $false
if ($Role -eq 'WallPC') {
    Write-Step 'Wall PC: start at logon and a desktop link'
    Install-StartupLink
    Install-DesktopLink $port

    Write-Step 'Wall PC: firewall rule (administrator)'
    # a rule that is already right needs no administrator, so running the installer again does not ask for one
    if (Test-FirewallRule $port) { Write-Ok "the firewall rule `"$FirewallName`" is already there (TCP $port)" }
    elseif ($DryRun -or (Test-Admin)) {
        try { Install-AdminSteps $port } catch { Write-Bad "the firewall rule could not be made: $($_.Exception.Message)"; $firewallFailed = $true }
    }
    elseif ($NonInteractive) { Write-Note 'not running as administrator: the firewall rule is skipped (run install.cmd -Role WallPC as administrator)' }
    else {
        Write-Info 'Windows now asks for administrator rights for this step.'
        $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Role', 'WallPC', '-AdminSteps', '-NonInteractive')
        try {
            $elevated = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait -PassThru -ErrorAction Stop
            if ($elevated.ExitCode -ne 0) { Write-Bad "the administrator step failed (exit code $($elevated.ExitCode))"; $firewallFailed = $true }
            elseif (Test-FirewallRule $port) { Write-Ok "firewall rule added: tablets can reach TCP $port" }
            else { Write-Bad 'the firewall rule is still missing (run install.cmd -Role WallPC again)'; $firewallFailed = $true }
        } catch {
            Write-Note 'administrator rights were not given: the firewall rule is skipped (run install.cmd again to retry)'
        }
    }
    Show-NetworkNote
    Write-Info 'Hibernate and wake timers are not set up by this installer; they belong to the system-level setup of the PC.'
}

Write-Step 'Done'
if ($DryRun) { Write-Host '   Dry run finished: nothing was changed.' }
else {
    if ($firewallFailed) { Write-Bad 'installed, but the firewall rule is missing: tablets cannot reach the kiosk until install.cmd -Role WallPC has made it' }
    else { Write-Ok 'installed' }
    if ($Role -eq 'WallPC') { Write-Info 'The kiosk starts by itself at the next logon. To start it now: node startAll.js (in this folder).' }
    else { Write-Info 'Start it with: node startAll.js   (Ctrl+C stops it)' }
    Write-Info "Admin page: https://localhost:$port/admin (the browser warns once about the self-signed certificate)"
    Write-Info 'Check it any time with install.cmd -Check; remove it with uninstall.cmd.'
    if ((Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $Root '.git'))) {
        & git -C $Root ls-files --error-unmatch backend/.env 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Note 'backend\.env is still tracked by git (from the previous team): never commit it, it now holds this PC''s keys' }
    }
}
Write-Host ''
if ($firewallFailed) { exit 1 }
exit 0
# <Jun Kai end>
