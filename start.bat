@echo off
title YouTube Music Remote Server
color 0A
cls

echo ======================================================
echo    YOUTUBE MUSIC REMOTE CONTROL SERVER
echo ======================================================
echo.

cd /d "%~dp0\server"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on your system!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Installing required dependencies...
    call npm install
    echo.
)

echo [INFO] Starting server...
echo.
node server.js

pause
