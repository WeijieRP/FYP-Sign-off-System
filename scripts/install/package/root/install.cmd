@echo off
rem Owner: Role 3, Jun Kai.
rem RP Xperience Centre Kiosk: installs the kiosk, or updates the copy that is already installed (all data kept).
rem Double click it, or run it with options, e.g.  install.cmd -Role WallPC   or   install.cmd -Check
rem README.txt lists every option.
rem <Jun Kai start>
setlocal
if not exist "%~dp0payload\app.zip" (
  echo This folder is not a complete kiosk package. Unzip the whole zip file first,
  echo then run install.cmd from the unzipped folder.
  if "%~1"=="" pause
  exit /b 3
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\Install-Kiosk.ps1" %*
set "CODE=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %CODE%
rem <Jun Kai end>
