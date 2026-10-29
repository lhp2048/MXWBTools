@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

call "%~dp0pack_extension.bat"
if errorlevel 1 exit /b 1

if not exist "%ROOT%\extension\manifest.json" (
  echo [ERR] extension\manifest.json missing
  exit /b 1
)
if not exist "%ROOT%\extension\icons\icon128.png" (
  echo [ERR] icons missing, run: python scripts\gen_icons.py
  exit /b 1
)

set "RELEASE_DIR=%ROOT%\release"
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set "STAMP=%%I"
set "ZIP=%RELEASE_DIR%\brickcal-store-%STAMP%.zip"
if exist "%ZIP%" del /f /q "%ZIP%"

set "SEVEN=C:\Program Files\7-Zip\7z.exe"
if not exist "%SEVEN%" goto :pszip

pushd "%ROOT%\extension"
"%SEVEN%" a -tzip "%ZIP%" * -x!.git -x!.DS_Store
set "PACK_ERR=%ERRORLEVEL%"
popd
if %PACK_ERR% GTR 1 (
  echo [ERR] 7z pack failed
  exit /b 1
)
goto :ok

:pszip
powershell -NoProfile -Command ^
  "Compress-Archive -Path '%ROOT%\extension\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (
  echo [ERR] zip pack failed
  exit /b 1
)

:ok
echo [OK] %ZIP%
exit /b 0
