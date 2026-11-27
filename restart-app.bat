@echo off
setlocal
set ROOT=%~dp0
set LOG=%ROOT%logs\restart-app.log
if not exist "%ROOT%logs" mkdir "%ROOT%logs"
(
  echo [%DATE% %TIME%] Restart request received
  echo Waiting briefly for the admin restart response to return...
) >> "%LOG%"

cd /d "%ROOT%"
timeout /t 2 /nobreak >nul

rem <Jun Kai start> the main server's port from backend\.env too (install.cmd -Port can move it off 3000)
set "APP_PORT=3000"
if exist "%ROOT%backend\.env" for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ROOT%backend\.env") do if /i "%%A"=="PORT" if not "%%B"=="" set "APP_PORT=%%B"
rem <Jun Kai end>
for %%P in (3000 3001 3002 3003 %APP_PORT%) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%%P " ^| findstr /C:"LISTENING"') do (
    if not "%%A"=="0" (
      echo [%DATE% %TIME%] Stopping Node process %%A on port %%P >> "%LOG%"
      taskkill /PID %%A /F >> "%LOG%" 2>&1
    )
  )
)

timeout /t 2 /nobreak >nul
start "Kiosk App" cmd /k "node startAll.js"

(
  echo [%DATE% %TIME%] Restart command launched
) >> "%LOG%"

exit /b 0
