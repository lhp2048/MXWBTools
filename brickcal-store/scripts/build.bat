@echo off
REM build.bat - layer 1: fetch and write cache JSON
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

call "%~dp0ingest.bat" %*
if errorlevel 1 exit /b 1
call "%~dp0pack_extension.bat"
if errorlevel 1 exit /b 1
echo [OK] Cache built under %ROOT%\web\data
exit /b 0
