@echo off
cd /d "%~dp0"
set NODE_ENV=production
if not exist logs mkdir logs
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  node node_modules\tsx\dist\cli.mjs server.ts >> logs\gateway-console.log 2>&1
) else (
  "C:\Program Files\nodejs\node.exe" node_modules\tsx\dist\cli.mjs server.ts >> logs\gateway-console.log 2>&1
)
