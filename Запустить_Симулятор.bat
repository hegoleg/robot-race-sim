@echo off
chcp 65001 >nul
title Robot Race Simulator
echo ========================================================
echo   Запуск Robot Race Simulator
echo ========================================================

cd /d "%~dp0"

if exist "release\win-unpacked\Line Robot Simulator.exe" (
    echo Запуск установленного симулятора...
    start "" "release\win-unpacked\Line Robot Simulator.exe"
    exit /b 0
)

if exist "release\Line Robot Simulator Setup 1.1.0.exe" (
    echo Запуск установщика...
    start "" "release\Line Robot Simulator Setup 1.1.0.exe"
    exit /b 0
)

echo Запуск в веб-режиме разработки...
start http://localhost:5173
call npm run dev
pause
