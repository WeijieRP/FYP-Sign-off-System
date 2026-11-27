@echo off
rem Owner: Role 3, Jun Kai.
rem RP Xperience Centre Kiosk: packs the kiosk's data into one passphrase locked file for a new PC.
rem   export-data.cmd                                  the kiosk installed by install.cmd (C:\RPXperienceKiosk)
rem   export-data.cmd -Source C:\path\to\old\project   an older copy of the project folder (node startAll.js)
rem <Jun Kai start>
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\Export-KioskData.ps1" %*
set "CODE=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %CODE%
rem <Jun Kai end>
