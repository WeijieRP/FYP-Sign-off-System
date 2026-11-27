@echo off
rem Owner: Role 3, Jun Kai.
rem Starts the kiosk of this install: its own MySQL first (when it is not running yet), then both servers with the
rem Node.js inside this folder. The Startup shortcut of a Wall PC runs it with --logon. Ctrl+C stops the servers.
rem <Jun Kai start>
setlocal
title RP Xperience Centre Kiosk server
cd /d "%~dp0"
rem restart-app.bat and the other helpers the servers start run "node" too: this folder's Node.js comes first
set "PATH=%~dp0runtime\node;%PATH%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install\package\Start-KioskDatabase.ps1"
if errorlevel 1 (
  echo The kiosk's database did not start. kiosk-status.cmd shows what is wrong.
  pause
  exit /b 1
)
node startAll.js %*
rem <Jun Kai end>
