@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"
if not exist "extension\data" mkdir "extension\data"
copy /Y "web\data\holidays.json" "extension\data\holidays.json" >nul
copy /Y "web\holiday.js" "extension\holiday.js" >nul
copy /Y "web\work-copy.js" "extension\work-copy.js" >nul
copy /Y "web\brick-fall.js" "extension\brick-fall.js" >nul
copy /Y "web\zh-names.js" "extension\zh-names.js" >nul
if not exist "extension\popup.js" (
  echo [ERR] extension\popup.js missing
  exit /b 1
)
if not exist "extension\data\holidays.json" (
  echo [ERR] holidays.json missing, run ingest first
  exit /b 1
)
echo [OK] extension packed
exit /b 0
