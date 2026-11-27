# Owner: Role 3, Jun Kai.
# Shared by install.ps1 and uninstall.ps1: the names of what they add to Windows, the dry-run wrapper and small
# helpers. Hibernate and wake timers belong to Role 4 (Ryan: "server hibernation scheduling at the system level"), so
# nothing here touches the power plan. Windows PowerShell 5.1 is enough (the Wall PC may have nothing newer), so: ASCII
# only, no && or ?? here.
# <Jun Kai start>
# A caller's 'Stop' (GitHub Actions sets it) would end the script at the first native stderr line under 5.1
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SetupJs = Join-Path $PSScriptRoot 'setup.js'
$FirewallGroup = 'RP Xperience Centre Kiosk'
$FirewallName = 'RP Xperience Centre Kiosk - tablets to the kiosk server'
$StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'RP Xperience Centre Kiosk.lnk'
$DesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'RP Xperience Centre Kiosk Admin.url'
# <Jun Kai start>
# The names from before the centre was renamed (until 18 Nov 2026). A PC installed under them is updated in place:
# install.ps1 replaces them with the names above, uninstall.ps1 removes whichever it finds.
$OldFirewallGroup = 'ESG ' + 'Kiosk'
$OldStartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) ('ESG ' + 'Kiosk.lnk')
$OldDesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) ('ESG ' + 'Kiosk Admin.url')

# A Startup shortcut belongs to this copy when it starts the kiosk from this folder
function Test-OwnLink([string]$LinkPath) {
    if (-not (Test-Path $LinkPath)) { return $false }
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($LinkPath)
    return ($link.WorkingDirectory.TrimEnd('\') -ieq $Root.TrimEnd('\'))
}
# <Jun Kai end>

function Write-Step([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "   ok    $Text" -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host "         $Text" }
function Write-Note([string]$Text) { Write-Host "   note  $Text" -ForegroundColor Yellow }
function Write-Bad([string]$Text) { Write-Host "   error $Text" -ForegroundColor Red }

# Makes one change, or on a dry run only says what it would do
function Invoke-Change([string]$What, [scriptblock]$Action) {
    if ($script:DryRun) { Write-Host "   would $What" -ForegroundColor DarkGray; return }
    & $Action
    Write-Ok $What
}

# A yes/no question; with -NonInteractive the default answers it, so a risky question must default to no
function Confirm-Choice([string]$Question, [bool]$Default) {
    if ($script:NonInteractive) { return $Default }
    $hint = '[y/N]'
    if ($Default) { $hint = '[Y/n]' }
    $answer = Read-Host "         $Question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim().ToLower().StartsWith('y')
}

function Test-Admin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# node.exe processes started from this folder: their command line names a file inside it (startAll.js, server.js,
# kioskServer.js). Never "every node.exe" and never "whatever listens on port 3000".
function Get-KioskProcesses {
    $needle = ($Root.TrimEnd('\') + '\').ToLowerInvariant()
    $all = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
    $mine = @($all | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) })
    $ids = @($mine | ForEach-Object { $_.ProcessId })
    $parents = @($all | Where-Object { ($ids -contains $_.ProcessId) -eq $false -and $_.CommandLine -match 'startAll\.js' -and (@($mine | Where-Object ParentProcessId -eq $_.ProcessId).Count -gt 0) })
    return @($mine + $parents)
}

function Get-FirewallRules {
    # <Jun Kai/> a rule made under the old name counts too, so it is found, checked and replaced like the new one
    return @(Get-NetFirewallRule -Group $FirewallGroup -ErrorAction SilentlyContinue) + @(Get-NetFirewallRule -Group $OldFirewallGroup -ErrorAction SilentlyContinue)
}

# The ports the kiosk's firewall rule opens now, as text; nothing when there is no rule. Reading needs no administrator.
function Get-FirewallPorts {
    $ports = @()
    foreach ($rule in @(Get-FirewallRules)) {
        $filter = $rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
        if ($filter) { $ports += @($filter.LocalPort | ForEach-Object { "$_" }) }
    }
    return @($ports | Sort-Object -Unique)
}

# True when the rule is there and opens exactly this port
function Test-FirewallRule([string]$Port) {
    $ports = @(Get-FirewallPorts)
    return ($ports.Count -eq 1 -and $ports[0] -eq $Port)
}

# The rule applies on Private and Domain networks only: say so when Windows counts this PC's network as Public
function Show-NetworkNote {
    $public = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { "$($_.NetworkCategory)" -eq 'Public' })
    if ($public.Count -eq 0) { return }
    Write-Note "Windows treats the network `"$($public[0].Name)`" as Public, and the firewall rule does not apply on Public networks."
    Write-Info 'Tablets cannot reach the kiosk until that network is set to Private in Windows (Settings, Network and internet,'
    Write-Info 'the connection, Network profile type). The installer does not change that setting.'
}
# <Jun Kai end>
