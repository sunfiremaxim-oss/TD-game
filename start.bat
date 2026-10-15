@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   GEOMETRIC NEON CYBERPUNK - TOWER DEFENSE
echo ===================================================
echo Starting local web server on port 8080...
echo.

rem Check for Node.js
where node >nul 2>nul
if %errorlevel% equ 0 goto use_node

rem Check for Python
where python >nul 2>nul
if %errorlevel% equ 0 goto use_python

echo ERROR: Neither Python nor Node.js found in PATH!
echo Please install Python or Node.js to run the game.
pause
exit /b 1

:use_python
echo [OK] Using Python http.server...
start http://localhost:8080/
python -m http.server 8080
goto end

:use_node
echo [OK] Using Node.js server...
start http://localhost:8080/
node server.js
goto end

:end
