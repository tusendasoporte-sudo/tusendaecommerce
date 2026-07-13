@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Start-PocketBaseLocal.ps1" -RestartExisting %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo Start-PocketBaseLocal fallo con codigo %EXITCODE%.
  pause
)

exit /b %EXITCODE%
