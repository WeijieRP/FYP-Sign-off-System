@echo off
rem Owner: Role 3, Jun Kai.
rem Removes this install of the kiosk. Visitor data is kept unless -RemoveData is added.
rem This folder is deleted while the uninstall runs, so the work is done by a copy of this file and the scripts in
rem the temp folder. Starting the copy without "call" hands over to it: Windows never reads this file again.
rem <Jun Kai start>
if /i "%~dp0"=="%RPK_TMP%\" goto run
for %%I in ("%~dp0..") do set "KIOSK_ROOT=%%~fI"
set "RPK_TMP=%TEMP%\rpk-uninstall-%RANDOM%%RANDOM%"
mkdir "%RPK_TMP%" >nul 2>&1
copy /y "%~dp0scripts\install\package\*.ps1" "%RPK_TMP%\" >nul
copy /y "%~f0" "%RPK_TMP%\uninstall.cmd" >nul
cd /d "%TEMP%"
"%RPK_TMP%\uninstall.cmd" %*

:run
cd /d "%TEMP%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RPK_TMP%\Uninstall-Kiosk.ps1" %*
set "RPK_CODE=%ERRORLEVEL%"
if "%~1"=="" pause
rem the temp copy deletes itself once this file has ended
(goto) 2>nul & rd /s /q "%RPK_TMP%" & exit /b %RPK_CODE%
rem <Jun Kai end>
