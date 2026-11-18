#!/usr/bin/env bash
# Backup diário do LouvorFlow (louvorflow-backup.timer, 3h30 de Brasília):
#  1. cópia local dos bancos, 7 dias (/var/backups/louvorflow/diario);
#  2. se /etc/louvorflow/backup.env estiver preenchido, bancos + arquivos enviados vão
#     criptografados pelo restic para fora do servidor (30 diários e 12 mensais).
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/louvorflow/comum.sh

hoje="$LOCAL_BACKUPS/diario/$(date +%Y%m%d-%H%M%S)"
copiar_bancos "$hoje"
manter_ultimas "$LOCAL_BACKUPS/diario" 7
echo "Cópia local: $hoje"

if [ -z "${RESTIC_REPOSITORY:-}" ] || [ -z "${RESTIC_PASSWORD:-}" ]; then
  echo "Backup fora do servidor não configurado (/etc/louvorflow/backup.env)." >&2
  exit 0
fi

restic cat config >/dev/null 2>&1 || restic init
paths=("$hoje")
[ -d "$PB_DATA/storage" ] && paths+=("$PB_DATA/storage")
restic backup --tag louvorflow "${paths[@]}"
restic forget --tag louvorflow --keep-daily 30 --keep-monthly 12 --prune
