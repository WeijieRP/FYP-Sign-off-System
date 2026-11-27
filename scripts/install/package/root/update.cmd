@echo off
rem Owner: Role 3, Jun Kai.
rem RP Xperience Centre Kiosk: updates the installed copy to this package, keeping all data. Refuses when nothing
rem is installed yet (use install.cmd for that). Same options as install.cmd, e.g. update.cmd -InstallDir D:\Kiosk
rem <Jun Kai start>
setlocal
if not exist "%~dp0payload\app.zip" (
  echo This folder is not a complete kiosk package. Unzip the whole zip file first.
  if "%~1"=="" pause
  exit /b 3
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\Install-Kiosk.ps1" -Update %*
set "CODE=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %CODE%
rem <Jun Kai end>
