@echo off
setlocal
cd /d "%~dp0"
set "LOCAL_NODE=%~dp0..\.tools\node-v24.14.0-win-x64"
if exist "%LOCAL_NODE%\node.exe" set "PATH=%LOCAL_NODE%;%PATH%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Setup-Gmail.ps1"
pause
