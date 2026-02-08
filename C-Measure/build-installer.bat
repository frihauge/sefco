@echo off
setlocal

cd /d "%~dp0"

echo [build] Closing running processes...
taskkill /IM server.exe /F >nul 2>nul
taskkill /IM "C-Measure*.exe" /F >nul 2>nul
taskkill /IM electron.exe /F >nul 2>nul

echo [build] Cleaning build outputs...
if exist dist rmdir /s /q dist
if exist server.spec del /f /q server.spec

REM Preserve installer.nsh before cleaning build folder
if exist build\installer.nsh (
    copy build\installer.nsh installer.nsh.bak >nul
)
if exist build rmdir /s /q build
if not exist build mkdir build
if exist installer.nsh.bak (
    move installer.nsh.bak build\installer.nsh >nul
)

REM Copy Phidget driver to build folder
echo [build] Copying Phidget driver...
for %%f in (drivers\Phidget22*.exe) do (
    copy "%%f" build\Phidget22Drivers.exe >nul
    echo [build] Copied %%f
    goto :driver_done
)
echo [build] WARNING: No Phidget driver found in drivers\ folder!
:driver_done

echo [build] Building installer...
call npm run build:installer

echo [build] Zip step disabled.

endlocal
