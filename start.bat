@echo off
echo Starting EasyClick...
echo.

:: Start Python backend in a new window
start "EasyClick Backend (Port 8000)" cmd /k "cd /d E:\EasyClick && npm run dev:backend"

:: Wait 2 seconds for backend to init
timeout /t 2 /nobreak >nul

:: Start Next.js frontend in a new window
start "EasyClick Frontend (Port 3000)" cmd /k "cd /d E:\EasyClick && npm run dev:frontend"

echo.
echo Both servers launched!
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo.
pause
