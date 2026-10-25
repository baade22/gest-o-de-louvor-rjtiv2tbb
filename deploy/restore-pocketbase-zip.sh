#!/usr/bin/env bash
# Restaura um backup .zip gerado pelo painel do PocketBase (Configurações → Backups),
# como o que sai do Skip. Guarda o pb_data atual ao lado antes de trocar.
#
# Uso (root): louvorflow-restore-zip /root/pb_backup.zip
set -euo pipefail

ZIP="${1:?informe o arquivo .zip do backup}"
PB_DATA=/opt/louvorflow/pb_data
OLD="$PB_DATA.antes-$(date +%Y%m%d-%H%M%S)"

unzip -l "$ZIP" | grep -q ' data.db$' || { echo "O zip não tem data.db: não parece backup do PocketBase" >&2; exit 1; }

systemctl stop louvorflow
mv "$PB_DATA" "$OLD"
install -d -m 750 -o louvorflow -g louvorflow "$PB_DATA"
unzip -q "$ZIP" -d "$PB_DATA"
chown -R louvorflow:louvorflow "$PB_DATA"
systemctl start louvorflow

echo "Restaurado. O pb_data anterior ficou em $OLD."
echo "Depois de conferir, apague o zip baixado: shred -u $ZIP"
