# Owner: Role 3, Jun Kai.
# Tests the command line installer's checks without installing anything: a small fake package in the temp folder,
# then -Check, -DryRun and the refusals (damaged or incomplete package, -Update with nothing installed, a folder
# that holds other files). Nothing outside the temp folder is touched. Run: powershell -File tests\install\installer-checks.test.ps1
# Ports 3120 and 3121 are used for the checks; when port 3003 is busy on this PC the checks report it (exit 3).
# <Jun Kai start>
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$src = Join-Path $repo 'scripts\install\package'
$work = Join-Path $env:TEMP ('rpk-checks-' + [guid]::NewGuid().ToString('N'))
$pkg = Join-Path $work 'rp-xperience-kiosk'
$fails = 0
function Test-That([string]$Name, [bool]$Ok, [string]$Detail) {
    if ($Ok) { Write-Host "ok   $Name" } else { Write-Host "FAIL $Name  -> $Detail"; $script:fails++ }
}
function Invoke-Installer([string[]]$InstallerArgs) {
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'installer\Install-Kiosk.ps1') @InstallerArgs 2>&1 | Out-String
    return [pscustomobject]@{ Code = $LASTEXITCODE; Text = $out }
}
function Write-Checksums {
    $lines = @()
    # the long form of the folder: on a runner TEMP is a short name (RUNNER~1) but file listings give the long one
    $base = (Get-Item -LiteralPath $pkg).FullName
    foreach ($f in @(Get-ChildItem -LiteralPath $base -Recurse -File | Where-Object { $_.Name -ne 'checksums.sha256' })) {
        $rel = $f.FullName.Substring($base.Length + 1).Replace('\', '/')
        $sha = [Security.Cryptography.SHA256]::Create()
        $s = [IO.File]::OpenRead($f.FullName)
        try { $hash = (($sha.ComputeHash($s) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $s.Dispose(); $sha.Dispose() }
        $lines += "$hash  $rel"
    }
    [IO.File]::WriteAllText((Join-Path $pkg 'checksums.sha256'), ($lines -join "`r`n") + "`r`n")
}

try {
    # every command the package scripts call is a function of theirs or a real cmdlet (a missing helper only shows up
    # when its line runs, often in a failure path)
    $scripts = @(Get-ChildItem $src -Filter '*.ps1') + @(Get-Item (Join-Path $repo 'scripts\install\get-kiosk.ps1'))
    $defined = @{}
    $calls = @()
    foreach ($s in $scripts) {
        $ast = [Management.Automation.Language.Parser]::ParseFile($s.FullName, [ref]$null, [ref]$null)
        foreach ($f in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) { $defined[$f.Name] = $true }
        foreach ($c in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
            $name = $c.GetCommandName()
            if ($name -and $name -match '^[A-Za-z]+-[A-Za-z0-9]+$') { $calls += [pscustomobject]@{ Name = $name; File = $s.Name; Line = $c.Extent.StartLineNumber } }
        }
    }
    $unknown = @($calls | Where-Object { -not $defined.ContainsKey($_.Name) -and -not (Get-Command $_.Name -CommandType Cmdlet, Function -ErrorAction SilentlyContinue) } | ForEach-Object { "$($_.Name) ($($_.File):$($_.Line))" } | Sort-Object -Unique)
    Test-That 'every command the install scripts call exists' ($unknown.Count -eq 0) ($unknown -join ', ')

    New-Item -ItemType Directory -Path (Join-Path $pkg 'installer'), (Join-Path $pkg 'payload'), (Join-Path $work 'content') -Force | Out-Null
    Copy-Item (Join-Path $src '*.ps1') (Join-Path $pkg 'installer')
    Copy-Item (Join-Path $src 'root\*') $pkg
    Set-Content -LiteralPath (Join-Path $work 'content\a.txt') -Value 'fake'
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    & $tar -a -cf (Join-Path $pkg 'payload\app.zip') -C (Join-Path $work 'content') .
    & $tar -a -cf (Join-Path $pkg 'payload\mysql.zip') -C (Join-Path $work 'content') .
    $migrations = @(Get-ChildItem (Join-Path $repo 'database\migrations') -Filter '*.sql' | ForEach-Object { $_.Name })
    $version = [pscustomobject]@{ name = 'rp-xperience-kiosk'; build = 5; commit = ('0' * 40); date = '2026-11-26'; node = '22.23.5'; mysql = '8.4.11'; aiModel = $false; migrations = $migrations; longestPath = 150; unpackedMB = 50 }
    [IO.File]::WriteAllText((Join-Path $pkg 'version.json'), ($version | ConvertTo-Json -Depth 4))
    Write-Checksums
    $root = Join-Path $work 'KioskRoot'
    $common = @('-InstallDir', $root, '-Role', 'Laptop', '-NoService', '-NonInteractive', '-Port', '3120', '-MySqlPort', '3121')

    $r = Invoke-Installer (@('-Check') + $common)
    $busy = $r.Text -match 'port 3003 .* is already used'
    Test-That 'the check reads the package and its checksums' ($r.Text -match 'checksums correct') $r.Text
    Test-That 'the check passes, or names the busy port 3003' (($r.Code -eq 0 -and $r.Text -match 'every check passed') -or ($busy -and $r.Code -eq 3)) $r.Text
    Test-That 'the check made no folder' (-not (Test-Path $root)) 'folder made'

    if (-not $busy) {
        $r = Invoke-Installer (@('-DryRun') + $common)
        Test-That 'the dry run lists the steps and changes nothing' ($r.Code -eq 0 -and $r.Text -match 'would make' -and $r.Text -match 'Dry run finished' -and -not (Test-Path $root)) $r.Text
    }

    $r = Invoke-Installer (@('-Update') + $common)
    Test-That '-Update with nothing installed is refused (exit 3)' ($r.Code -eq 3 -and $r.Text -match 'nothing is installed') $r.Text

    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $root 'someone-else.txt') -Value 'x'
    $r = Invoke-Installer (@('-Check') + $common)
    Test-That 'a folder that holds other files is refused' ($r.Code -eq 3 -and $r.Text -match 'holds other files') $r.Text
    Remove-Item $root -Recurse -Force

    $r = Invoke-Installer (@('-Check', '-InstallDir', 'C:\', '-Role', 'Laptop', '-NoService', '-NonInteractive', '-Port', '3120', '-MySqlPort', '3121'))
    Test-That 'the root of a drive is refused' ($r.Code -eq 3 -and $r.Text -match 'root of a drive') $r.Text

    $r = Invoke-Installer (@('-Check', '-InstallDir', ('C:\' + ('x' * 120)), '-Role', 'Laptop', '-NoService', '-NonInteractive', '-Port', '3120', '-MySqlPort', '3121'))
    Test-That 'a folder name too long for the deepest file is refused' ($r.Code -eq 3 -and $r.Text -match 'too long') $r.Text

    Add-Content -LiteralPath (Join-Path $pkg 'payload\app.zip') -Value 'changed'
    $r = Invoke-Installer (@('-Check') + $common)
    Test-That 'a damaged package is refused before anything changes' ($r.Code -eq 3 -and $r.Text -match 'damaged') $r.Text

    Remove-Item (Join-Path $pkg 'payload\mysql.zip')
    $r = Invoke-Installer (@('-Check') + $common)
    Test-That 'an incomplete package is refused' ($r.Code -eq 3 -and $r.Text -match 'incomplete') $r.Text

    # the log of every run, without the admin password even when one is given
    $env:KIOSK_ADMIN_PASSWORD = 'NotInAnyLog-12345'
    $r = Invoke-Installer (@('-DryRun') + $common)
    Remove-Item Env:\KIOSK_ADMIN_PASSWORD
    $logs = Join-Path $env:TEMP 'rp-xperience-kiosk'
    $leak = @(Get-ChildItem $logs -Filter 'install-*.log' | Where-Object { (Get-Content $_.FullName -Raw) -match 'NotInAnyLog' })
    Test-That 'no log file holds the admin password' ($leak.Count -eq 0) ($leak | ForEach-Object { $_.Name })
} finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "$fails failure(s)"
exit $fails
# <Jun Kai end>
