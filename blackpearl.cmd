@echo off
setlocal

set "DIR=%~dp0"

rem Check Node.js is available
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    exit /b 1
)

rem Run compiled JS if available, otherwise use tsx to run TS source directly
if exist "%DIR%dist\cli.js" (
    node "%DIR%dist\cli.js" %*
) else if exist "%DIR%src\cli.ts" (
    npx tsx "%DIR%src\cli.ts" %*
) else (
    echo Project not built and tsx not available. Run: corepack pnpm build
    exit /b 1
)
