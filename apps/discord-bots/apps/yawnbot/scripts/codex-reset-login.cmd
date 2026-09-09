@echo off
cd /d "%~dp0.."
call npm run codex:login
set "CODEX_LOGIN_EXIT=%ERRORLEVEL%"
if not "%CODEX_LOGIN_EXIT%"=="0" pause
exit /b %CODEX_LOGIN_EXIT%
