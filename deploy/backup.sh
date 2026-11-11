#!/usr/bin/env bash
# Backup do LouvorFlow: cópia consistente dos bancos SQLite + arquivos enviados,
# criptografada pelo restic e enviada para fora do servidor.
# Guarda 30 diários e 12 mensais. Roda pelo louvorflow-backup.timer e antes de cada deploy.
set -euo pipefail

PB_DATA=/opt/louvorflow/pb_data
SNAP=/var/backups/louvorflow/snapshot

if [ -z "${RESTIC_REPOSITORY:-}" ] || [ -z "${RESTIC_PASSWORD:-}" ]; then
  echo "Backup não configurado: preencha /etc/louvorflow/backup.env" >&2
  exit 1
fi

rm -rf "$SNAP"
install -d -m 700 "$SNAP"
for db in data.db auxiliary.db; do
  if [ -f "$PB_DATA/$db" ]; then
    # .backup do sqlite copia o banco aberto sem pegar escrita pela metade.
    sqlite3 "$PB_DATA/$db" ".backup '$SNAP/$db'"
  fi
done

restic cat config >/dev/null 2>&1 || restic init
paths=("$SNAP")
[ -d "$PB_DATA/storage" ] && paths+=("$PB_DATA/storage")
restic backup --tag louvorflow "${paths[@]}"
restic forget --tag louvorflow --keep-daily 30 --keep-monthly 12 --prune
rm -rf "$SNAP"
