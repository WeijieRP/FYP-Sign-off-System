@echo off
rem Owner: Role 3, Jun Kai.
rem RP Xperience Centre Kiosk: removes the installed kiosk (C:\RPXperienceKiosk, or -InstallDir). Visitor data is
rem kept unless -RemoveData is added. The installed copy has the same uninstall.cmd in its app folder.
rem <Jun Kai start>
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\Uninstall-Kiosk.ps1" %*
set "CODE=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %CODE%
rem <Jun Kai end>
