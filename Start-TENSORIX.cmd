@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Install Node.js 24 or newer first. & pause & exit /b 1)
if not exist node_modules\pdfkit\package.json (call npm ci || (pause & exit /b 1))
node app\server.cjs
pause
