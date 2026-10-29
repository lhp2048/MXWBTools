@echo off
REM stop.bat - stop holiday cache server
REM Usage: stop.bat [quiet]
setlocal EnableExtensions

set "QUIET=0"
if /i "%~1"=="quiet" set "QUIET=1"
if /i "%~1"=="/q" set "QUIET=1"

if "%QUIET%"=="0" echo [INFO] Stopping all-word-happy cache server...

powershell -NoProfile -Command ^
  "$quiet = '%QUIET%' -eq '1'; $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*all-word-happy*main.py*' -or $_.CommandLine -like '*all-word-happy*src.cache*') -and $_.CommandLine -notlike '*stop.bat*' }; if (-not $procs) { if (-not $quiet) { Write-Host 'No running instance found.' }; exit 0 }; $procs | ForEach-Object { if (-not $quiet) { Write-Host ('Stopping PID ' + $_.ProcessId) }; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

ping 127.0.0.1 -n 2 >nul

if "%QUIET%"=="0" echo [OK] Done.
exit /b 0
