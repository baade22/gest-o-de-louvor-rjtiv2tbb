@echo off
title LouvorFlow Agent v0.0.37
echo ====================================================
echo       LouvorFlow Agent v0.0.37 - Holyrics Bridge
echo ====================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema!
    echo Por favor, instale o Node.js v18 ou superior em https://nodejs.org
    pause
    exit /b 1
)

echo Iniciando o LouvorFlow Agent...
echo Painel de controle local estara disponivel em: http://localhost:8765
echo.

if exist "dist\index.js" (
    node dist\index.js
) else (
    echo Compilando codigo TypeScript...
    call npm run build
    node dist\index.js
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo O Agent foi encerrado com erro.
    pause
)
