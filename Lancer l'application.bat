@echo off
title Coach Guitare IA
cd /d "%~dp0"
start /min cmd /c "timeout /t 2 >nul && start http://localhost:8765"
node server.js
pause
