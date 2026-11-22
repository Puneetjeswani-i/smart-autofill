@echo off
setlocal
cd /d "%~dp0backend"
title Smart Autofill (keep this window open)

if not exist "..\frontend\build\index.html" (
  echo The dashboard is not built yet. Run setup.bat first.
  pause
  exit /b 1
)

set PORT=3001
if exist .env (
  for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"PORT=" .env') do set PORT=%%b
)

echo Starting Smart Autofill on http://localhost:%PORT% ...
echo Keep this window open while you work. Close it to stop the app.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"
node server.js
echo.
echo Smart Autofill has stopped.
pause
