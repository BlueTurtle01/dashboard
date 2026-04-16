@echo off
cd /d "%~dp0"

start powershell.exe -NoExit -Command "npm run dev"

timeout /t 3 >nul

start firefox "http://localhost:3000"
start firefox "https://supabase.com/dashboard/project/lcwvxpdqscuumpgniaqh"

start code .