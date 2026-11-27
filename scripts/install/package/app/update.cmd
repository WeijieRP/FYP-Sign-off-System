@echo off
rem Owner: Role 3, Jun Kai.
rem Downloads the newest kiosk package (from where this copy was installed from, or GitHub) and updates this
rem install with it, keeping all data. Another source: update.cmd -From <web address, zip file or package folder>
rem The update replaces this folder, so the work is done by a copy of this file and the download script in the temp
rem folder. Starting the copy without "call" hands over to it: Windows never reads this file again.
rem <Jun Kai start>
if /i "%~dp0"=="%RPK_TMP%\" goto run
for %%I in ("%~dp0..") do set "KIOSK_ROOT=%%~fI"
set "RPK_TMP=%TEMP%\rpk-update-%RANDOM%%RANDOM%"
mkdir "%RPK_TMP%" >nul 2>&1
copy /y "%~dp0scripts\install\get-kiosk.ps1" "%RPK_TMP%\" >nul
copy /y "%~f0" "%RPK_TMP%\update.cmd" >nul
cd /d "%TEMP%"
"%RPK_TMP%\update.cmd" %*

:run
cd /d "%TEMP%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RPK_TMP%\get-kiosk.ps1" -InstallDir "%KIOSK_ROOT%" -Update %*
set "RPK_CODE=%ERRORLEVEL%"
if "%~1"=="" pause
rem the temp copy deletes itself once this file has ended
(goto) 2>nul & rd /s /q "%RPK_TMP%" & exit /b %RPK_CODE%
rem <Jun Kai end>
