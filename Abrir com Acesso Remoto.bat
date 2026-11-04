@echo off
chcp 65001 >nul
title Servidor Central + Acesso Remoto - Dra. Marina Carbonera
cd /d "%~dp0"
node server/remoteRunner.js
pause
