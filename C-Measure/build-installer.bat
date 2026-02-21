@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "ENABLE_SIGN=0"
set "APP_VERSION="
set "PORTABLE_EXE="
set "SETUP_EXE="
set "PHIDGET_DRIVER_INSTALLER="
set "SIGN_ROOT_OUTPUT=%~dp0sign"
set "SIGN_TOOL_DIR=%~dp0..\Signing\CodeSignTool"
set "SIGN_CREDENTIAL_ID=8234129f-80e7-4b15-b493-46037351f6bd"
set "SIGN_USERNAME=esjfri"
set "SIGN_PASSWORD=EsjFri,2026"
set "EB_CMD=%~dp0node_modules\.bin\electron-builder.cmd"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="-sign" set "ENABLE_SIGN=1"
if /I "%~1"=="--sign" set "ENABLE_SIGN=1"
shift
goto parse_args
:args_done

echo [build] Closing running processes...
taskkill /IM server.exe /F >nul 2>nul
taskkill /IM "C-Measure*.exe" /F >nul 2>nul
taskkill /IM electron.exe /F >nul 2>nul

echo [build] Cleaning build outputs...
if exist dist rmdir /s /q dist
if !ENABLE_SIGN! EQU 1 if exist sign rmdir /s /q sign
if exist server.spec del /f /q server.spec >nul 2>nul

REM Preserve installer.nsh before cleaning build folder
if exist build\installer.nsh (
    copy build\installer.nsh installer.nsh.bak >nul
)
if exist build rmdir /s /q build
if not exist build mkdir build
if exist installer.nsh.bak (
    move installer.nsh.bak build\installer.nsh >nul
)

REM Copy Phidget driver to build folder for NSIS custom script and copy-driver fallback
echo [build] Copying Phidget driver...
for %%f in (drivers\Phidget22*.exe) do (
    copy "%%f" build\Phidget22Drivers.exe >nul
    set "PHIDGET_DRIVER_INSTALLER=%CD%\build\Phidget22Drivers.exe"
    echo [build] Copied %%f
    goto :driver_done
)
echo [build] WARNING: No Phidget driver found in drivers\ folder!
:driver_done
if defined PHIDGET_DRIVER_INSTALLER (
    echo [build] Using driver for copy step: !PHIDGET_DRIVER_INSTALLER!
)

echo [build] Building backend...
cd /d "%~dp0"
call npm run build:backend
if errorlevel 1 goto build_failed

cd /d "%~dp0"
call node scripts\check-backend.js
if errorlevel 1 goto build_failed

echo [build] Building unpacked app...
cd /d "%~dp0"
if exist "%EB_CMD%" (
    call "%EB_CMD%" --dir --win
) else (
    call npx electron-builder --dir --win
)
if errorlevel 1 goto build_failed

if !ENABLE_SIGN! EQU 1 (
    echo [sign] Signing all exe files in dist\win-unpacked...
    call :sign_tree "dist\win-unpacked"
    if errorlevel 1 goto build_failed
)

echo [build] Building portable exe from prepackaged app...
cd /d "%~dp0"
if exist "%EB_CMD%" (
    call "%EB_CMD%" --prepackaged "dist\win-unpacked" --win portable
) else (
    call npx electron-builder --prepackaged "dist\win-unpacked" --win portable
)
if errorlevel 1 goto build_failed

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"`) do set "APP_VERSION=%%v"
if defined APP_VERSION (
    set "PORTABLE_EXE=dist\C-Measure !APP_VERSION!.exe"
    set "SETUP_EXE=dist\C-Measure Setup !APP_VERSION!.exe"
)

if not exist "!PORTABLE_EXE!" (
    for /f "delims=" %%f in ('dir /b /a:-d /o-d "dist\C-Measure *.exe" ^| findstr /i /v "Setup"') do if not defined PORTABLE_EXE set "PORTABLE_EXE=dist\%%f"
)

if !ENABLE_SIGN! EQU 1 (
    call :sign_file "!PORTABLE_EXE!"
    if errorlevel 1 goto build_failed
)

echo [build] Building NSIS installer from prepackaged app...
cd /d "%~dp0"
if exist "%EB_CMD%" (
    call "%EB_CMD%" --prepackaged "dist\win-unpacked" --win nsis
) else (
    call npx electron-builder --prepackaged "dist\win-unpacked" --win nsis
)
if errorlevel 1 goto build_failed

if not exist "!SETUP_EXE!" (
    for /f "delims=" %%f in ('dir /b /a:-d /o-d "dist\C-Measure Setup *.exe"') do if not defined SETUP_EXE set "SETUP_EXE=dist\%%f"
)

if !ENABLE_SIGN! EQU 1 (
    call :sign_file "!SETUP_EXE!"
    if errorlevel 1 goto build_failed
)

if defined PHIDGET_DRIVER_INSTALLER (
    cd /d "%~dp0"
    call node scripts\copy-driver.js
    if errorlevel 1 echo [build] WARNING: Failed to copy driver installer to dist.
)

echo [build] Done.
goto end

:sign_tree
set "SIGN_DIR=%~1"
if not exist "%SIGN_DIR%" (
    echo [sign] ERROR: Folder not found: %SIGN_DIR%
    exit /b 1
)
for /r "%SIGN_DIR%" %%F in (*.exe) do (
    call :sign_file "%%~fF"
    if errorlevel 1 exit /b 1
)
exit /b 0

:sign_file
set "INPUT_FILE=%~1"
set "INPUT_FILE_ABS="
set "INPUT_FILE_NAME="
set "SIGN_INPUT_LOCAL="
set "SIGN_ATTEMPT=0"
for %%I in ("%INPUT_FILE%") do (
    set "INPUT_FILE_ABS=%%~fI"
    set "INPUT_FILE_NAME=%%~nxI"
)
if not defined INPUT_FILE (
    echo [sign] ERROR: Missing file path to sign.
    exit /b 1
)
if not exist "!INPUT_FILE_ABS!" (
    echo [sign] ERROR: File not found: !INPUT_FILE_ABS!
    exit /b 1
)
if not exist "%SIGN_TOOL_DIR%" (
    echo [sign] ERROR: CodeSignTool folder not found: %SIGN_TOOL_DIR%
    exit /b 1
)
if not exist "%SIGN_ROOT_OUTPUT%" mkdir "%SIGN_ROOT_OUTPUT%"

echo [sign] Signing !INPUT_FILE_ABS!
pushd "%SIGN_TOOL_DIR%" >nul
set "SIGN_INPUT_LOCAL=%CD%\!INPUT_FILE_NAME!"
copy /y "!INPUT_FILE_ABS!" "!SIGN_INPUT_LOCAL!" >nul
if not exist signed mkdir signed

:sign_retry
set /a SIGN_ATTEMPT+=1
if exist "signed\!INPUT_FILE_NAME!" del /f /q "signed\!INPUT_FILE_NAME!" >nul 2>nul

if exist "CodeSignTool.exe" (
    CodeSignTool.exe sign -credential_id=%SIGN_CREDENTIAL_ID% -username=%SIGN_USERNAME% -password="%SIGN_PASSWORD%" -output_dir_path=signed -input_file_path="!INPUT_FILE_NAME!"
) else (
    call CodeSignTool sign -credential_id=%SIGN_CREDENTIAL_ID% -username=%SIGN_USERNAME% -password="%SIGN_PASSWORD%" -output_dir_path=signed -input_file_path="!INPUT_FILE_NAME!"
)

if exist "signed\!INPUT_FILE_NAME!" goto sign_success
if !SIGN_ATTEMPT! LSS 3 (
    echo [sign] WARNING: Signing did not produce output on attempt !SIGN_ATTEMPT!/3. Try OTP again.
    goto sign_retry
)
if exist "!SIGN_INPUT_LOCAL!" del /f /q "!SIGN_INPUT_LOCAL!" >nul 2>nul
popd >nul
echo [sign] ERROR: Signed output was not created after 3 attempts: signed\!INPUT_FILE_NAME!
exit /b 1

:sign_success
if exist "!SIGN_INPUT_LOCAL!" del /f /q "!SIGN_INPUT_LOCAL!" >nul 2>nul
copy /y "signed\!INPUT_FILE_NAME!" "!INPUT_FILE_ABS!" >nul
copy /y "signed\!INPUT_FILE_NAME!" "%SIGN_ROOT_OUTPUT%\!INPUT_FILE_NAME!" >nul
popd >nul
echo [sign] Signed and replaced: !INPUT_FILE_ABS!
echo [sign] Copied signed artifact to: %SIGN_ROOT_OUTPUT%\!INPUT_FILE_NAME!
exit /b 0

:build_failed
echo [build] ERROR: Build pipeline failed.
exit /b 1

:end

endlocal
