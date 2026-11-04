@echo off
chcp 65001 >nul
title Sistema de Controle de Retorno - Dra. Marina
cd /d "%~dp0"

echo ==========================================================
echo   Clínica Dra. Marina - Controle de Retorno de Pacientes
echo ==========================================================
echo.

netstat -ano | findstr ":3456 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo Servidor ja esta em execucao! Abrindo navegador...
    start "" "http://localhost:3456"
    exit /b 0
)

echo Iniciando servidor local em http://localhost:3456 ...
echo (Mantenha esta janela aberta enquanto estiver usando o sistema)
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:3456"
node server/index.js
pause
