#!/usr/bin/env bash
# Põe no servidor os dados de um backup .zip do PocketBase (o que se baixa no Skip, em
# /_/ → Settings → Backups). O pb_data que estava aqui fica guardado ao lado.
#
#   louvorflow-restaurar-skip /root/pb_backup.zip --ensaio   cópia de teste: não manda e-mail
#                                                            nem faz backup no R2 do Skip
#   louvorflow-restaurar-skip /root/pb_backup.zip            o dia da troca (produção)
#
# Precisa que o primeiro deploy do GitHub Actions já tenha publicado as migrações.
set -euo pipefail
# shellcheck disable=SC1091
. /usr/local/lib/louvorflow/comum.sh

ZIP="${1:?informe o arquivo .zip do backup}"
MODO="${2:-producao}"
# Todas as migrações até esta já estavam aplicadas no Skip quando o backup foi feito.
MIGRADO_ATE="${LOUVORFLOW_MIGRADO_ATE:-0104}"

[ "$(id -u)" -eq 0 ] || { echo "Rode como root." >&2; exit 1; }
[ -f "$ZIP" ] || { echo "Não achei $ZIP" >&2; exit 1; }
unzip -l "$ZIP" | grep -qE ' data\.db$' || { echo "O zip não tem data.db: não parece backup do PocketBase." >&2; exit 1; }
ls "$APP"/pb_migrations/*.js >/dev/null 2>&1 \
  || { echo "Ainda não há migrações em $APP/pb_migrations: rode o deploy do GitHub primeiro." >&2; exit 1; }

NOVO="$(mktemp -d "$APP/pb_data.novo-XXXX")"
trap 'rm -rf "$NOVO"' EXIT
unzip -q "$ZIP" -d "$NOVO"
DB="$NOVO/data.db"

echo "==> Conferindo as migrações"
# O Skip aplicava as migrações do seu jeito; se os nomes dos arquivos não estiverem na tabela
# _migrations, o PocketBase daqui tentaria rodar tudo de novo por cima do banco pronto.
aplicadas="$(sqlite3 "$DB" 'select file from _migrations')"
faltam=()
for f in "$APP"/pb_migrations/*.js; do
  nome="$(basename "$f")"
  grep -qxF "$nome" <<<"$aplicadas" || faltam+=("$nome")
done
marcar=()
rodar=()
for nome in "${faltam[@]}"; do
  if [ "$((10#${nome%%_*}))" -le "$((10#$MIGRADO_ATE))" ] 2>/dev/null; then marcar+=("$nome"); else rodar+=("$nome"); fi
done
if [ "${#marcar[@]}" -gt 0 ]; then
  # Prova de que o banco está mesmo na 0104: site_pages tem o campo blocks.
  tem_0104="$(sqlite3 "$DB" "select count(*) from _collections where name='site_pages' and fields like '%\"name\":\"blocks\"%'")"
  if [ "$tem_0104" != "1" ] && [ "$MIGRADO_ATE" = "0104" ]; then
    echo "O backup não está na migração 0104 (falta site_pages.blocks). Aplique as migrações no Skip e baixe outro backup." >&2
    exit 1
  fi
  echo "   ${#marcar[@]} migrações já estavam no banco do Skip com outro registro; marcando como aplicadas."
  agora="$(date +%s)000000"
  for nome in "${marcar[@]}"; do
    sqlite3 "$DB" "insert or ignore into _migrations(file, applied) values('$nome', $agora)"
  done
fi
if [ "${#rodar[@]}" -gt 0 ]; then
  echo "   Vão rodar ao ligar: ${rodar[*]}"
fi

echo "==> Tirando o que é só do Skip"
# O PocketBase do Skip é modificado: tem o tipo de campo "vector" (memória da IA do Skip,
# coleção _agent_memory_chunks, guardada em tabelas virtuais _vec_*). O PocketBase oficial
# não abre um banco com esse tipo de campo. O LouvorFlow não usa nada disso.
vcols="$(sqlite3 "$DB" "select distinct c.name from _collections c, json_each(c.fields) f where json_extract(f.value,'\$.type') = 'vector'")"
vtabs="$(sqlite3 "$DB" "select name from sqlite_master where type = 'table' and rootpage = 0 and name like '\_vec\_%' escape '\'")"
vshadow="$(sqlite3 "$DB" "select name from sqlite_master where type = 'table' and rootpage > 0 and name like '\_vec\_%' escape '\'")"
for t in $vtabs; do
  # Tabela virtual sem o módulo sqlite-vec: só dá para tirar do esquema (não ocupa páginas).
  sqlite3 -cmd ".dbconfig defensive off" "$DB" \
    "PRAGMA writable_schema=ON; DELETE FROM sqlite_master WHERE type='table' AND rootpage=0 AND name='$t'; PRAGMA writable_schema=OFF;" >/dev/null
done
for t in $vshadow; do sqlite3 "$DB" "DROP TABLE IF EXISTS \"$t\""; done
for c in $vcols; do
  echo "   coleção do Skip removida: $c"
  sqlite3 "$DB" "DELETE FROM _collections WHERE name='$c'; DROP TABLE IF EXISTS \"$c\";"
done
estranhos="$(sqlite3 "$DB" "select c.name || '.' || json_extract(f.value,'\$.name') || ' (' || json_extract(f.value,'\$.type') || ')' from _collections c, json_each(c.fields) f where json_extract(f.value,'\$.type') not in ('text','number','bool','email','url','editor','date','autodate','select','file','relation','json','password','geoPoint')")"
if [ -n "$estranhos" ]; then
  echo "Ainda há campos que o PocketBase oficial não conhece: $estranhos" >&2
  exit 1
fi
[ "$(sqlite3 "$DB" 'PRAGMA integrity_check')" = "ok" ] || { echo "O banco não passou na conferência (integrity_check)." >&2; exit 1; }

if [ "$MODO" = "--ensaio" ]; then
  echo "==> Ensaio: desligando e-mail e backup automático do PocketBase nesta cópia"
  sqlite3 "$DB" "update _params set value = json_set(cast(value as text),
      '\$.smtp.enabled', json('false'),
      '\$.backups.cron', '',
      '\$.backups.s3.enabled', json('false'))
    where id = 'settings' and json_valid(cast(value as text))"
  [ "$(sqlite3 "$DB" "select json_extract(cast(value as text), '\$.smtp.enabled') from _params where id='settings'")" = "0" ] \
    || { echo "Não consegui desligar o e-mail desta cópia; parei para não mandar nada a ninguém." >&2; exit 1; }
fi

echo "==> Trocando os dados"
compose stop pocketbase 2>/dev/null || true
if [ -d "$PB_DATA" ] && [ -n "$(ls -A "$PB_DATA" 2>/dev/null)" ]; then
  ANTES="$PB_DATA.antes-$(date +%Y%m%d-%H%M%S)"
  mv "$PB_DATA" "$ANTES"
  echo "   O pb_data anterior ficou em $ANTES"
else
  rm -rf "$PB_DATA"
fi
mv "$NOVO" "$PB_DATA"
chmod 750 "$PB_DATA"
trap - EXIT

compose up -d --no-deps pocketbase
if ! esperar_no_ar; then
  echo "O PocketBase não subiu com estes dados. Log:" >&2
  compose logs --tail 60 pocketbase >&2
  exit 1
fi

echo "==> Conferência (quantidade de registros)"
for t in users people church_members events songs media_assets fin_transactions fin_accounts whatsapp_messages site_pages; do
  printf '   %-20s %s\n' "$t" "$(sqlite3 "$PB_DATA/data.db" "select count(*) from $t" 2>/dev/null || echo '-')"
done
echo "   arquivos enviados: $(du -sh "$PB_DATA/storage" 2>/dev/null | cut -f1)"
echo
echo "Pronto. Confira no navegador e depois apague o zip: shred -u $ZIP"
