@echo off
rem Owner: Role 3, Jun Kai.
rem <Jun Kai start>
rem Removes the RP Xperience Centre Kiosk from this PC: double-click it, or run it with options, e.g. uninstall.cmd -DryRun
rem (every option is listed at the top of scripts\install\uninstall.ps1)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install\uninstall.ps1" %*
set "CODE=%ERRORLEVEL%"
rem a double-click passes no options: keep the window open to read the result
if "%~1"=="" pause
exit /b %CODE%
rem <Jun Kai end>
