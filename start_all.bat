@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo    AIRI Tamagotchi + Chatterbox TTS Launcher
echo ============================================================
echo.

REM Start Chatterbox TTS Server in a new window
echo [1/3] Starting Chatterbox TTS Server...
start "Chatterbox TTS Server" cmd /k "cd /d C:\AI_WORKSPACE\chatterbox && call start.bat"
echo       Chatterbox launching in new window...
echo.

REM Wait for Chatterbox to be ready on port 8090
echo [2/3] Waiting for Chatterbox TTS to be ready (port 8090)...
set MAX_RETRIES=60
set RETRY_COUNT=0

:wait_loop
timeout /t 2 /nobreak >nul
set /a RETRY_COUNT+=1

REM Check if port 8090 is listening
netstat -an | findstr ":8090" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo       Chatterbox TTS is ready!
    echo.
    goto start_airi
)

if !RETRY_COUNT! geq !MAX_RETRIES! (
    echo       Timeout after !MAX_RETRIES! attempts. Starting AIRI anyway...
    echo.
    goto start_airi
)

echo       Still waiting... ^(!RETRY_COUNT! / !MAX_RETRIES!^)
goto wait_loop

:start_airi
REM Start AIRI Tamagotchi
echo [3/3] Starting AIRI Tamagotchi...
cd /d C:\AI_WORKSPACE\airi
call start_airi.bat

endlocal
