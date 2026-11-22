@echo off
setlocal
cd /d "%~dp0"
title Smart Autofill - setup
echo ==================================================
echo   Smart Autofill v6 - one-time setup
echo ==================================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org and run setup.bat again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo.
  echo Node.js 22.13 or newer is required. You have:
  node -v
  echo Install the current LTS from https://nodejs.org and run setup.bat again.
  pause
  exit /b 1
)

echo.
echo [1/4] Installing backend packages...
cd backend
call npm install --omit=dev
if errorlevel 1 goto fail
if not exist .env (
  copy .env.example .env >nul
  echo Created backend\.env  - add a Groq key there later if you want cloud AI.
)

echo.
echo [2/4] Downloading OCR language data (English + Hindi, needs internet once)...
call npm run ocr:download
if errorlevel 1 echo   Could not download now - it will download automatically on the first scan.

echo.
echo [3/4] Installing dashboard packages...
cd ..\frontend
call npm install
if errorlevel 1 goto fail

echo.
echo [4/4] Building the dashboard...
call npm run build
if errorlevel 1 goto fail
cd ..

echo.
echo ==================================================
echo   Setup complete. Start the app with start-shop.bat
echo ==================================================
pause
exit /b 0

:fail
echo.
echo Setup failed. Check the internet connection and run setup.bat again.
pause
exit /b 1
