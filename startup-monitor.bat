@echo off
setlocal
set ROOT=%~dp0
set LOG=%ROOT%logs\startup-monitor.log
if not exist "%ROOT%logs" mkdir "%ROOT%logs"

:loop
call :runcheck
ping 127.0.0.1 -n 6 >nul
goto loop

:runcheck
call :count
if not "%COUNT%"=="0" exit /b 0
rem <Jun Kai start> restart-app.bat stops the programs and starts them again a few seconds later. Starting them
rem here in that gap gave two copies, so this looks again after 10 seconds and starts only when there is still no
rem node.exe. The programs are started from the project folder, wherever this file was run from.
ping 127.0.0.1 -n 11 >nul
call :count
if not "%COUNT%"=="0" exit /b 0
echo [%DATE% %TIME%] Node process not found. Restarting application... >> "%LOG%"
cd /d "%ROOT%"
start "Kiosk App" cmd /k "node startAll.js"
exit /b 0

:count
set COUNT=0
for /f %%i in ('tasklist /FI "IMAGENAME eq node.exe" /NH ^| find /C /I "node.exe"') do set COUNT=%%i
exit /b 0
rem <Jun Kai end>
