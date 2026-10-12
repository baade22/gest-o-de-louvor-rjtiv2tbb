#!/usr/bin/env bash
echo "===================================================="
echo "      LouvorFlow Agent v0.0.37 — Holyrics Bridge    "
echo "===================================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "[ERRO] Node.js não foi encontrado no sistema!"
    echo "Por favor, instale o Node.js v18 ou superior em https://nodejs.org"
    exit 1
fi

echo "Iniciando o LouvorFlow Agent..."
echo "Painel de controle local estará disponível em: http://localhost:8765"
echo ""

if [ -f "dist/index.js" ]; then
    node dist/index.js
else
    echo "Compilando código TypeScript..."
    npm run build
    node dist/index.js
fi
