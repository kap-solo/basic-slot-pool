@echo off
cd /d "%~dp0"
echo Installing dependencies...
call npm install
if errorlevel 1 exit /b 1
echo.
echo Starting Reflecting Pool...
echo URL: http://127.0.0.1:5176/?dev=true^&sessionID=local-demo^&rgs_url=http://127.0.0.1:5176
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5176/?dev=true&sessionID=local-demo&rgs_url=http://127.0.0.1:5176"
set PORT=5176
node server.mjs
if errorlevel 1 (
  echo.
  echo ERROR: Server stopped. Port 5176 may already be in use.
  pause
)
