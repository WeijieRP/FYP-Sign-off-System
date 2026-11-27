# Owner: Role 3, Jun Kai.
# One command install of the RP Xperience Centre Kiosk: gets the offline package, checks it, unpacks it and runs
# its install.cmd, so the result is the same as unzipping the package by hand. Needs only what Windows 10 and 11
# have: PowerShell, curl.exe and tar.exe. Paste this line into PowerShell:
#   curl.exe -fsSLo "$env:TEMP\get-kiosk.ps1" https://github.com/Casualty97/FYP-Sign-off-System/releases/latest/download/get-kiosk.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\get-kiosk.ps1"
# Options:
#   -From <web address | zip file | unzipped package folder>   another source, e.g. a copy on SharePoint or a USB stick
#   -Sha256 <hash>      the zip's checksum, when no .sha256 file sits next to it
#   -WithAiModel        no longer needed: the package always has the offline AI model (kept so old commands work)
#   anything else (-Role WallPC, -InstallDir, -NonInteractive, -AdminPasswordFile ...) goes to install.cmd
# <Jun Kai start>
[CmdletBinding()]
param(
    [string]$From,
    [string]$Sha256,
    [switch]$WithAiModel,
    [string]$InstallDir,
    [switch]$Update,
    [switch]$KeepDownload,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$InstallArgs
)
$ErrorActionPreference = 'Continue'
# Windows PowerShell started from a PowerShell 7 window inherits PowerShell 7's module folders and then misses its
# own cmdlets: it uses only its own folders (the installer it starts inherits this too)
if ($PSVersionTable.PSEdition -ne 'Core') {
    $env:PSModulePath = (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules') + ';' + (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules')
}
function Get-Sha256([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return (($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $stream.Dispose(); $sha.Dispose() }
}
# Windows' own tools: a PATH with Git's folders would find its GNU tar (cannot open zip files) and its curl first
$Tar = Join-Path $env:SystemRoot 'System32\tar.exe'
$Curl = Join-Path $env:SystemRoot 'System32\curl.exe'
$Repo = 'https://github.com/Casualty97/FYP-Sign-off-System/releases/latest/download'
$ZipName = 'rp-xperience-kiosk-windows-x64.zip'

function Write-Ok([string]$t) { Write-Host "   ok    $t" -ForegroundColor Green }
function Write-Bad([string]$t) { Write-Host "   error $t" -ForegroundColor Red }
function Write-Info([string]$t) { Write-Host "         $t" }

Write-Host ''
Write-Host 'RP Xperience Centre Kiosk: get the package and install' -ForegroundColor White

# update.cmd of an installed copy: the source it was installed from, unless another one is given
if (-not $From -and $InstallDir) {
    $record = Join-Path $InstallDir 'data\install.json'
    if (Test-Path -LiteralPath $record) {
        try { $saved = ([IO.File]::ReadAllText($record) | ConvertFrom-Json).source } catch { $saved = $null }
        if ($saved) { $From = $saved; Write-Info "Source of the earlier install: $From" }
    }
}
if (-not $From) { $From = "$Repo/$ZipName" }

$work = Join-Path $env:TEMP ('rp-xperience-kiosk-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$package = $null
$code = 1
try {
    if ($From -match '^https?://') {
        if (-not (Test-Path -LiteralPath $Curl)) { Write-Bad 'curl.exe is missing (Windows 10 version 1803 or newer has it)'; exit 1 }
        # anything on the way can change a plain http download, and a .sha256 from the same place proves nothing then
        if ($From -match '^http://' -and -not $Sha256) { Write-Bad 'a plain http:// download needs its checksum: add -Sha256 <hash> (the .sha256 file next to the zip), or use an https:// address'; exit 1 }
        $zip = Join-Path $work $ZipName
        if ($From -notmatch '\.zip(\?|$)') { $zip = Join-Path $work 'package.zip' }
        Write-Info "Downloading $From"
        & $Curl -fL --retry 3 --retry-delay 5 -o $zip $From
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zip)) { Write-Bad "the download failed (curl exit code $LASTEXITCODE). Check the address, or copy the zip by hand and use -From <file>."; exit 1 }
        if (-not $Sha256) {
            $sumFile = "$zip.sha256"
            & $Curl -fsL -o $sumFile "$($From -replace '\?.*$', '').sha256" 2>$null
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $sumFile)) { $Sha256 = ((Get-Content -LiteralPath $sumFile -Raw) -split '\s+')[0] }
            # a GitHub release always has the .sha256 next to the zip: without it nothing is installed
            if (-not $Sha256 -and $From.StartsWith("$Repo/")) { Write-Bad 'the checksum file of the GitHub release could not be read: try again later'; exit 1 }
        }
    } elseif (Test-Path -LiteralPath $From -PathType Container) {
        $package = (Resolve-Path -LiteralPath $From).Path
        if (-not (Test-Path -LiteralPath (Join-Path $package 'install.cmd'))) {
            $inner = Join-Path $package 'rp-xperience-kiosk'
            if (Test-Path -LiteralPath (Join-Path $inner 'install.cmd')) { $package = $inner } else { Write-Bad "$From is not an unzipped kiosk package (no install.cmd)"; exit 1 }
        }
        Write-Ok "unzipped package folder $package"
    } elseif (Test-Path -LiteralPath $From) {
        $zip = (Resolve-Path -LiteralPath $From).Path
        if (-not $Sha256 -and (Test-Path -LiteralPath "$zip.sha256")) { $Sha256 = ((Get-Content -LiteralPath "$zip.sha256" -Raw) -split '\s+')[0] }
    } else {
        Write-Bad "$From is neither a web address nor a file or folder on this PC"
        exit 1
    }

    if (-not $package) {
        if ($Sha256) {
            $have = Get-Sha256 $zip
            if ($have -ne $Sha256.Trim().ToLower()) { Write-Bad "the zip does not match its checksum (got $have): download or copy it again"; exit 1 }
            Write-Ok 'the zip matches its checksum'
        } else {
            Write-Info 'No checksum was found next to the zip; install.cmd still checks every file inside it.'
        }
        Write-Info 'Unpacking...'
        & $Tar -xf $zip -C $work
        if ($LASTEXITCODE -ne 0) { Write-Bad "tar could not unpack the zip (exit code $LASTEXITCODE)"; exit 1 }
        $package = Join-Path $work 'rp-xperience-kiosk'
        if (-not (Test-Path -LiteralPath (Join-Path $package 'install.cmd'))) { $package = $work }
        if (-not (Test-Path -LiteralPath (Join-Path $package 'install.cmd'))) { Write-Bad 'the zip holds no kiosk package (no install.cmd)'; exit 1 }
        Write-Ok "package unpacked in $package"
    }

    # the installer records where the package came from, so update.cmd can fetch the next one from there
    if ($From -match '^https?://') { $env:KIOSK_PACKAGE_SOURCE = $From } else { $env:KIOSK_PACKAGE_SOURCE = '' }
    $passOn = @()
    if ($InstallDir) { $passOn += @('-InstallDir', $InstallDir) }
    if ($Update) { $passOn += '-Update' }
    if ($InstallArgs) { $passOn += $InstallArgs }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $package 'installer\Install-Kiosk.ps1') @passOn
    $code = $LASTEXITCODE
} finally {
    if (-not $KeepDownload) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $code
# <Jun Kai end>
