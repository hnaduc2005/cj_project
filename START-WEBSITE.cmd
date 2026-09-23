@echo off
setlocal
cd /d "%~dp0"
set "LOCAL_NODE=%~dp0..\.tools\node-v24.14.0-win-x64"
if exist "%LOCAL_NODE%\node.exe" set "PATH=%LOCAL_NODE%;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Hay mo README.md va lam theo Buoc 1.
  pause
  exit /b 1
)
if not exist "node_modules\nodemailer" (
  echo Dang cai thu vien. Can Internet trong lan dau.
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 (
    echo Cai thu vien that bai. Xem README.md.
    pause
    exit /b 1
  )
)
echo.
echo PROCUREMENT SMILE - CJ Logistics Vina
echo Mo trinh duyet va truy cap: http://127.0.0.1:3000
echo Giu cua so nay mo khi su dung. Nhan Ctrl+C de dung.
echo.
node --env-file-if-exists=.env server.js
pause
