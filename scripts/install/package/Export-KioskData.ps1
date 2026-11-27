# Owner: Role 3, Jun Kai.
# export-data.cmd: packs the kiosk's data into one file locked with a passphrase, for install.cmd -ImportData on a
# new PC. Works on an install made by install.cmd, and on an older copy of the project folder (started with
# node startAll.js and a MySQL of the PC): give that folder with -Source.
#   export-data.cmd                                   the install this script belongs to
#   export-data.cmd -Source C:\path\to\old\project    an older project folder (run from a package)
#   -OutFile <file>, -NonInteractive (passphrase from KIOSK_DATA_PASSPHRASE)
# Inside: the database (mysqldump), backend\.env (the encryption key that stored emails and archives need),
# backend\data (settings and archive zips), uploads (visitor photos), pictures uploaded on the admin page.
# <Jun Kai start>
[CmdletBinding()]
param(
    [string]$InstallDir,
    [string]$Source,
    [string]$OutFile,
    [switch]$NonInteractive
)
. (Join-Path $PSScriptRoot 'KioskCommon.ps1')
. (Join-Path $PSScriptRoot 'KioskData.ps1')
$script:NonInteractive = $NonInteractive
$null = Start-KioskLog 'export'

function Find-MySqlDump {
    $cmd = Get-Command mysqldump.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($svc in @(Get-CimInstance Win32_Service -Filter "Name like 'MySQL%'" -ErrorAction SilentlyContinue)) {
        $exe = $svc.PathName -replace '^"([^"]+)".*$', '$1'
        $dump = Join-Path (Split-Path $exe -Parent) 'mysqldump.exe'
        if (Test-Path -LiteralPath $dump) { return $dump }
    }
    foreach ($dir in @(Get-ChildItem -Path (Join-Path $env:ProgramFiles 'MySQL') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)) {
        $dump = Join-Path $dir.FullName 'bin\mysqldump.exe'
        if (Test-Path -LiteralPath $dump) { return $dump }
    }
    return $null
}

function Invoke-Export {
    Write-Host ''
    Write-Host 'RP Xperience Centre Kiosk: export the data for another PC' -ForegroundColor White
    $build = $null
    if ($Source) {
        $app = [IO.Path]::GetFullPath($Source).TrimEnd('\')
        if (-not (Test-Path -LiteralPath (Join-Path $app 'backend\.env'))) { Write-Bad "$app has no backend\.env: give the kiosk's project folder"; return $ExitRefused }
        $dump = Find-MySqlDump
        if (-not $dump) { Write-Bad 'mysqldump.exe was not found (it comes with MySQL Server); add its folder to PATH and try again'; return $ExitRefused }
        $kind = 'project'
        $list = Join-Path $PSScriptRoot 'shipped-assets.txt'
    } else {
        $root = $InstallDir
        if (-not $root) { $root = "$env:KIOSK_ROOT" }
        if (-not $root) { $root = $DefaultRoot }
        $root = [IO.Path]::GetFullPath($root).TrimEnd('\')
        $info = Get-InstallInfo $root
        if (-not $info -or $info.kept) { Write-Bad "no installed kiosk in $root (give -InstallDir, or -Source for an older project folder)"; return $ExitRefused }
        $app = Join-Path $root 'app'
        $dump = (Get-MySqlPaths $root).Dump
        $kind = 'install'
        $build = $info.build
        $list = $null
        if (-not (Start-KioskMySql $root ([int]$info.mysqlPort) $info.mode)) { Write-Bad "the kiosk's MySQL does not answer on port $($info.mysqlPort)"; return $ExitFailed }
    }
    Write-Info "From: $app"

    $pass = "$env:KIOSK_DATA_PASSPHRASE"
    if (-not $pass) {
        if ($NonInteractive) { Write-Bad 'no passphrase: set KIOSK_DATA_PASSPHRASE'; return $ExitRefused }
        Write-Info 'Choose a passphrase. It is needed on the new PC; without it the file cannot be opened.'
        for ($i = 0; $i -lt 3 -and -not $pass; $i++) {
            $a = Read-Secret 'Passphrase (at least 10 characters, typing is hidden)'
            $b = Read-Secret 'Type it again'
            if ($a -ne $b) { Write-Note 'the two did not match, try again' } elseif ($a.Length -lt 10) { Write-Note 'at least 10 characters, try again' } else { $pass = $a }
        }
        if (-not $pass) { Write-Bad 'no passphrase was set'; return $ExitRefused }
    }
    if (-not $OutFile) { $OutFile = Join-Path ([Environment]::GetFolderPath('Desktop')) ("kiosk-data-$env:COMPUTERNAME-" + (Get-Date -Format 'yyyyMMdd-HHmm') + '.rpxkdata') }
    $OutFile = [IO.Path]::GetFullPath($OutFile)

    $work = Join-Path $env:TEMP ('rpk-export-' + [guid]::NewGuid().ToString('N'))
    $content = Join-Path $work 'content'
    New-Item -ItemType Directory -Path $content -Force | Out-Null
    try {
        Write-Step 'Database'
        $envValues = Read-EnvLines (Join-Path $app 'backend\.env')
        $dbHost = Get-EnvValue $envValues 'DB_HOST' 'localhost'
        if ($dbHost -eq 'localhost') { $dbHost = '127.0.0.1' }
        $cnf = New-ClientCnf (Get-EnvValue $envValues 'DB_USER' $DbUser) (Get-EnvValue $envValues 'DB_PASSWORD' 'kiosk123') ([int](Get-EnvValue $envValues 'DB_PORT' '3306')) $dbHost
        $db = Get-EnvValue $envValues 'DB_NAME' $DbName
        try {
            $code = Invoke-Native $dump @("--defaults-extra-file=$cnf", '--single-transaction', '--routines', '--events', '--triggers', '--no-tablespaces', '--set-gtid-purged=OFF', '--default-character-set=utf8mb4', "--result-file=$(Join-Path $content 'database.sql')", $db) -Quiet
        } finally { Remove-Item -LiteralPath $cnf -Force -ErrorAction SilentlyContinue }
        if ($code -ne 0) { Write-Bad "mysqldump could not copy the database $db (exit code $code); see the log"; return $ExitFailed }
        Write-Ok "database $db copied"

        Write-Step 'Files'
        Copy-Item -LiteralPath (Join-Path $app 'backend\.env') -Destination (Join-Path $content 'env.txt')
        foreach ($pair in @(@('backend\data', 'backend-data'), @('uploads', 'uploads'))) {
            $src = Join-Path $app $pair[0]
            if (Test-Path -LiteralPath $src) {
                $code = Invoke-Native 'robocopy.exe' @($src, (Join-Path $content $pair[1]), '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2') -Quiet
                if ($code -ge 8) { Write-Bad "$($pair[0]) could not be copied (robocopy exit code $code)"; return $ExitFailed }
            }
        }
        $assets = @(Get-UserAssets $app $list)
        foreach ($rel in $assets) {
            $dst = Join-Path (Join-Path $content 'assets') $rel
            New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path (Join-Path $app 'assets') $rel) -Destination $dst
        }
        $photos = @(Get-ChildItem -LiteralPath (Join-Path $content 'uploads') -Recurse -File -ErrorAction SilentlyContinue).Count
        Write-Ok "settings, archives, $photos photo file(s) and $($assets.Count) uploaded picture(s)"
        Write-JsonFile (Join-Path $content 'manifest.json') ([pscustomobject]@{ format = 1; computer = $env:COMPUTERNAME; exported = (Get-Date).ToString('yyyy-MM-dd HH:mm'); from = $kind; build = $build; database = $db; photos = $photos })

        Write-Step 'Lock with the passphrase'
        $tarFile = Join-Path $work 'data.tar'
        $code = Invoke-Native $Tar @('-cf', $tarFile, '-C', $content, '.') -Quiet
        if ($code -ne 0) { Write-Bad "tar could not pack the files (exit code $code)"; return $ExitFailed }
        Protect-KioskFile $tarFile $OutFile $pass
        $mb = [Math]::Round((Get-Item -LiteralPath $OutFile).Length / 1MB, 1)
        Write-Ok "$OutFile ($mb MB)"
    } finally { [void](Remove-Tree $work) }
    Write-Host ''
    Write-Info 'Copy this file to the new PC (USB stick or a private share), then run there:'
    Write-Info "  install.cmd -ImportData `"$(Split-Path $OutFile -Leaf)`""
    Write-Info 'Keep the file private: it holds the visitor data. Delete it once the new PC works.'
    Write-Info "Log file: $script:LogFile"
    return $ExitOk
}

$exitCode = $ExitFailed
try { $exitCode = Invoke-Export } catch { Write-Bad "$($_.Exception.Message)" }
exit $exitCode
# <Jun Kai end>
