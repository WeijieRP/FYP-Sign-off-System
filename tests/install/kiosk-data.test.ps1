# Owner: Role 3, Jun Kai.
# Tests the passphrase lock of the data file that moves the kiosk to another PC (scripts/install/package/KioskData.ps1):
# files of awkward sizes come back the same, a wrong passphrase and a changed file are refused before anything is
# written. Works on temp files only. Run: powershell -File tests\install\kiosk-data.test.ps1
# <Jun Kai start>
. (Join-Path $PSScriptRoot '..\..\scripts\install\package\KioskCommon.ps1')
. (Join-Path $PSScriptRoot '..\..\scripts\install\package\KioskData.ps1')
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:TEMP ('rpk-datatest-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
$fails = 0
try {
    foreach ($size in @(0, 1, 15, 16, 17, 1048576, 1048577, 3145733)) {
        $plain = Join-Path $dir "plain-$size.bin"
        $bytes = New-Object byte[] $size
        (New-Object Random 42).NextBytes($bytes)
        [IO.File]::WriteAllBytes($plain, $bytes)
        $locked = Join-Path $dir "locked-$size.rpxkdata"
        $back = Join-Path $dir "back-$size.bin"
        Protect-KioskFile $plain $locked 'correct horse battery'
        Unprotect-KioskFile $locked $back 'correct horse battery'
        $same = (Get-Sha256 $plain) -eq (Get-Sha256 $back)
        if ($same) { "ok   $size bytes come back the same" } else { "FAIL $size bytes changed"; $fails++ }
    }
    $locked = Join-Path $dir 'locked-1048577.rpxkdata'
    try { Unprotect-KioskFile $locked (Join-Path $dir 'x.bin') 'wrong passphrase'; 'FAIL a wrong passphrase was accepted'; $fails++ }
    catch { "ok   a wrong passphrase is refused ($($_.Exception.Message))" }
    if (Test-Path (Join-Path $dir 'x.bin')) { 'FAIL a file was written with the wrong passphrase'; $fails++ }
    $b = [IO.File]::ReadAllBytes($locked)
    $b[100] = $b[100] -bxor 1
    [IO.File]::WriteAllBytes($locked, $b)
    try { Unprotect-KioskFile $locked (Join-Path $dir 'y.bin') 'correct horse battery'; 'FAIL a changed file was accepted'; $fails++ }
    catch { "ok   a changed file is refused ($($_.Exception.Message))" }
    if (Test-Path (Join-Path $dir 'y.bin')) { 'FAIL a file was written from a changed file'; $fails++ }
} finally { Remove-Item $dir -Recurse -Force }
"$fails failure(s)"
exit $fails
# <Jun Kai end>
