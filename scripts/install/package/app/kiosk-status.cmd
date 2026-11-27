@echo off
rem Owner: Role 3, Jun Kai.
rem Shows what is installed, whether the database and the servers run, and what install.cmd added to Windows.
rem <Jun Kai start>
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install\package\Show-KioskStatus.ps1"
if "%~1"=="" pause
rem <Jun Kai end>
