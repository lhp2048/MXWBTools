@echo off
REM ingest.bat - layer 1: fetch worldwide holidays into cache/
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

call "%~dp0_tools.bat" install_deps
if errorlevel 1 exit /b 1

echo [INFO] Ingesting holiday data (rate-limited)...
set "ALLWORDHAPPY_ROOT=%ROOT%"
"%ROOT%\.venv\Scripts\python.exe" -u -m src.ingest %*
exit /b %ERRORLEVEL%
