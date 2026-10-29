@echo off
REM dev.bat - setup environment and run cache server
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

call "%~dp0stop.bat" quiet
if errorlevel 1 exit /b 1

call "%~dp0_tools.bat" install_deps
if errorlevel 1 exit /b 1

if not exist "%ROOT%\web\data\meta.json" (
    echo [WARN] Cache is empty. Run scripts\ingest.bat to fetch holiday data.
)

call "%~dp0pack_extension.bat"
if errorlevel 1 (
    echo [WARN] pack_extension failed; preview will continue.
)

echo [INFO] Starting holiday cache server (dev)...
echo [INFO] Admin: http://127.0.0.1:18029/admin
echo [INFO] Preview: http://127.0.0.1:18029/
echo [INFO] Press Ctrl+C to stop.
set "ALLWORDHAPPY_ROOT=%ROOT%"
"%ROOT%\.venv\Scripts\python.exe" -u "%ROOT%\main.py"
exit /b %ERRORLEVEL%
