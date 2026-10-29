@echo off
REM build_and_pack.bat - ingest cache JSON and zip for publishing
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

call "%~dp0ingest.bat" %*
if errorlevel 1 exit /b 1

set "RELEASE_DIR=%ROOT%\release"
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

powershell -NoProfile -Command ^
  "Compress-Archive -Path '%ROOT%\web\*' -DestinationPath '%RELEASE_DIR%\holiday-cache.zip' -Force"

if errorlevel 1 (
    echo [ERROR] Failed to pack cache zip
    exit /b 1
)
echo [OK] Packed %RELEASE_DIR%\holiday-cache.zip
exit /b 0
