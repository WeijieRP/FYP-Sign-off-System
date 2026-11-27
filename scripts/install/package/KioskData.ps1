# Owner: Role 3, Jun Kai.
# The passphrase lock of the file that moves the kiosk's data to another PC (export-data.cmd makes it, install.cmd
# -ImportData reads it). Plain .NET Framework, so it works on any Windows 10 or 11 without Node.js:
# PBKDF2-SHA256 makes two keys from the passphrase, AES-256-CBC locks the file and an HMAC-SHA256 over everything
# proves that the passphrase is right and that nothing was changed, before anything is unlocked.
# File layout: "RPXKDATA1" | salt (16) | iv (16) | rounds (4) | locked data | HMAC (32)
# <Jun Kai start>
$KioskDataMagic = [Text.Encoding]::ASCII.GetBytes('RPXKDATA1')
$KioskDataRounds = 310000

function Get-KioskDataKeys([string]$Passphrase, [byte[]]$Salt, [int]$Rounds) {
    $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($Passphrase, $Salt, $Rounds, [Security.Cryptography.HashAlgorithmName]::SHA256)
    try { $bytes = $kdf.GetBytes(64) } finally { $kdf.Dispose() }
    return @(, $bytes)
}

function Protect-KioskFile([string]$InFile, [string]$OutFile, [string]$Passphrase) {
    $salt = New-Object byte[] 16
    $iv = New-Object byte[] 16
    $rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($salt); $rng.GetBytes($iv); $rng.Dispose()
    $keys = Get-KioskDataKeys $Passphrase $salt $KioskDataRounds
    $encKey = $keys[0..31]
    $macKey = $keys[32..63]
    $header = New-Object IO.MemoryStream
    $header.Write($KioskDataMagic, 0, $KioskDataMagic.Length)
    $header.Write($salt, 0, 16)
    $header.Write($iv, 0, 16)
    $header.Write([BitConverter]::GetBytes([int]$KioskDataRounds), 0, 4)
    $headBytes = $header.ToArray()
    $hmac = New-Object Security.Cryptography.HMACSHA256(, [byte[]]$macKey)
    $aes = [Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256; $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'
    $aes.Key = [byte[]]$encKey; $aes.IV = $iv
    $out = [IO.File]::Create($OutFile)
    $in = [IO.File]::OpenRead($InFile)
    try {
        $out.Write($headBytes, 0, $headBytes.Length)
        [void]$hmac.TransformBlock($headBytes, 0, $headBytes.Length, $null, 0)
        $enc = $aes.CreateEncryptor()
        $buffer = New-Object byte[] 1048576
        $outBuf = New-Object byte[] (1048576 + 32)
        while (($n = $in.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $whole = $n - ($n % 16)
            if ($whole -gt 0) {
                $m = $enc.TransformBlock($buffer, 0, $whole, $outBuf, 0)
                if ($m -gt 0) { $out.Write($outBuf, 0, $m); [void]$hmac.TransformBlock($outBuf, 0, $m, $null, 0) }
            }
            $rest = $n % 16
            if ($rest -gt 0) {
                # a short read happens only at the end of the file: the padding goes on there
                $last = $enc.TransformFinalBlock($buffer, $n - $rest, $rest)
                $out.Write($last, 0, $last.Length); [void]$hmac.TransformBlock($last, 0, $last.Length, $null, 0)
                $enc = $null
                break
            }
        }
        if ($enc) {
            $last = $enc.TransformFinalBlock($buffer, 0, 0)
            $out.Write($last, 0, $last.Length); [void]$hmac.TransformBlock($last, 0, $last.Length, $null, 0)
        }
        [void]$hmac.TransformFinalBlock((New-Object byte[] 0), 0, 0)
        $out.Write($hmac.Hash, 0, 32)
    } finally { $in.Dispose(); $out.Dispose(); $aes.Dispose(); $hmac.Dispose() }
}

function Unprotect-KioskFile([string]$InFile, [string]$OutFile, [string]$Passphrase) {
    $in = [IO.File]::OpenRead($InFile)
    try {
        if ($in.Length -lt 9 + 16 + 16 + 4 + 16 + 32) { throw 'this is not a kiosk data file (too short)' }
        $head = New-Object byte[] 45
        [void]$in.Read($head, 0, 45)
        if ([Text.Encoding]::ASCII.GetString($head, 0, 9) -ne 'RPXKDATA1') { throw 'this is not a kiosk data file (made by export-data.cmd)' }
        $salt = $head[9..24]
        $iv = $head[25..40]
        $rounds = [BitConverter]::ToInt32($head, 41)
        $keys = Get-KioskDataKeys $Passphrase ([byte[]]$salt) $rounds
        $hmac = New-Object Security.Cryptography.HMACSHA256(, [byte[]]$keys[32..63])
        $bodyLength = $in.Length - 45 - 32
        # pass 1: the HMAC over header and locked data must match before anything is unlocked
        [void]$hmac.TransformBlock($head, 0, 45, $null, 0)
        $buffer = New-Object byte[] 1048576
        $left = $bodyLength
        while ($left -gt 0) {
            $n = $in.Read($buffer, 0, [int][Math]::Min($buffer.Length, $left))
            if ($n -le 0) { throw 'the kiosk data file is cut short' }
            [void]$hmac.TransformBlock($buffer, 0, $n, $null, 0)
            $left -= $n
        }
        [void]$hmac.TransformFinalBlock((New-Object byte[] 0), 0, 0)
        $stored = New-Object byte[] 32
        [void]$in.Read($stored, 0, 32)
        $diff = 0
        for ($i = 0; $i -lt 32; $i++) { $diff = $diff -bor ($stored[$i] -bxor $hmac.Hash[$i]) }
        $hmac.Dispose()
        if ($diff -ne 0) { throw 'wrong passphrase, or the file was changed or damaged' }
        # pass 2: unlock
        [void]$in.Seek(45, 'Begin')
        $aes = [Security.Cryptography.Aes]::Create()
        $aes.KeySize = 256; $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'
        $aes.Key = [byte[]]$keys[0..31]; $aes.IV = [byte[]]$iv
        $out = [IO.File]::Create($OutFile)
        try {
            $dec = $aes.CreateDecryptor()
            $outBuf = New-Object byte[] (1048576 + 32)
            $left = $bodyLength
            while ($left -gt 0) {
                $n = $in.Read($buffer, 0, [int][Math]::Min($buffer.Length, $left))
                $left -= $n
                if ($left -gt 0) {
                    $m = $dec.TransformBlock($buffer, 0, $n, $outBuf, 0)
                    $out.Write($outBuf, 0, $m)
                } else {
                    $last = $dec.TransformFinalBlock($buffer, 0, $n)
                    $out.Write($last, 0, $last.Length)
                }
            }
        } finally { $out.Dispose(); $aes.Dispose() }
    } finally { $in.Dispose() }
}
# <Jun Kai end>
