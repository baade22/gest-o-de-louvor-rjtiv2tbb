#!/usr/bin/env bash
# Reinicia o PocketBase do LouvorFlow para carregar hooks e migrações novos.
# Antes, guarda uma cópia dos bancos (as 10 últimas ficam em /var/backups/louvorflow/antes-do-deploy).
# O GitHub Actions chama isto depois de cada merge na main (sudo liberado só para este script).
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/louvorflow/comum.sh

if compose ps --status running --services 2>/dev/null | grep -qx pocketbase; then
  copiar_bancos "$LOCAL_BACKUPS/antes-do-deploy/$(date +%Y%m%d-%H%M%S)"
  manter_ultimas "$LOCAL_BACKUPS/antes-do-deploy" 10
fi

# Reconstrói só se o Dockerfile mudou (versão nova do PocketBase); senão, só reinicia.
compose build -q pocketbase
compose up -d --no-deps pocketbase
compose restart pocketbase

if esperar_no_ar; then
  echo "LouvorFlow no ar."
else
  echo "O PocketBase não subiu. Últimas linhas do log:" >&2
  compose logs --tail 40 pocketbase >&2
  exit 1
fi
