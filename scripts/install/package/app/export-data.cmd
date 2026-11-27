@echo off
rem Owner: Role 3, Jun Kai.
rem Packs this kiosk's data (database, keys, settings, visitor photos, uploaded pictures) into one passphrase locked
rem file, for install.cmd -ImportData on a new PC.
rem <Jun Kai start>
setlocal
for %%I in ("%~dp0..") do set "KIOSK_ROOT=%%~fI"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install\package\Export-KioskData.ps1" %*
set "CODE=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %CODE%
rem <Jun Kai end>
