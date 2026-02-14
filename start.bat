@echo off
setlocal enabledelayedexpansion
title ResidentPulse

set "PATH=C:\Program Files\nodejs;%PATH%"

:: Read API key from server\.env if it exists
set "ENV_FILE=%~dp0server\.env"
set "HAS_KEY=0"

if exist "%ENV_FILE%" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
        if "%%A"=="ANTHROPIC_API_KEY" (
            if not "%%B"=="" set "HAS_KEY=1"
        )
    )
)

:: If key is missing, prompt and save to .env
if "!HAS_KEY!"=="0" (
    set /p NEW_KEY="Enter your Anthropic API key: "
    (echo ANTHROPIC_API_KEY=!NEW_KEY!)> "%ENV_FILE%"
)

:: Start the backend server (reads key from .env via dotenv)
echo Starting server...
start "ResidentPulse Server" cmd /k "set PATH=C:\Program Files\nodejs;%%PATH%% && cd /d C:\Users\mikeh\residentpulse\server && node index.js"

:: Wait for server to be ready
timeout /t 4 /nobreak >nul

:: Start the frontend
echo Starting client...
start "ResidentPulse Client" cmd /k "set PATH=C:\Program Files\nodejs;%%PATH%% && cd /d C:\Users\mikeh\residentpulse\client && npx vite --host"

:: Wait for client to be ready
timeout /t 4 /nobreak >nul

:: Open in browser
echo Opening browser...
start http://localhost:5173

echo.
echo ResidentPulse is running!
echo   App:   http://localhost:5173
echo   Admin: http://localhost:5173/admin
echo   API:   http://localhost:3001
echo.
echo Close the server and client windows to stop.
