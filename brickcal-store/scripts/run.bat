@echo off
REM run.bat - layer 2: start local holiday cache server
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

if not exist "%ROOT%\.venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found. Run scripts\dev.bat first.
    exit /b 1
)

call "%~dp0stop.bat" quiet
if errorlevel 1 exit /b 1

if not exist "%ROOT%\web\data\meta.json" (
    echo [WARN] Cache is empty. Run scripts\ingest.bat or scripts\build.bat first.
)

echo [INFO] Starting holiday cache server...
echo [INFO] Admin: http://127.0.0.1:18029/admin
echo [INFO] Preview: http://127.0.0.1:18029/
echo [INFO] Press Ctrl+C to stop.
set "ALLWORDHAPPY_ROOT=%ROOT%"
"%ROOT%\.venv\Scripts\python.exe" -u "%ROOT%\main.py"
exit /b %ERRORLEVEL%
