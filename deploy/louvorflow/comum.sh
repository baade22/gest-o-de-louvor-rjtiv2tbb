# shellcheck shell=bash disable=SC2034
# Caminhos e funções usados pelos scripts do LouvorFlow no servidor.
# instalar.sh copia para /usr/local/lib/louvorflow/comum.sh.
APP=/opt/louvorflow
PB_DATA=$APP/pb_data
LOCAL_BACKUPS=/var/backups/louvorflow

# Pasta do docker-compose (deploy/whatsapp do clone do repositório), gravada pelo instalar.sh.
# shellcheck disable=SC1091
. /etc/louvorflow/servidor.conf

compose() {
  docker compose --project-directory "$COMPOSE_DIR" "$@"
}

# Cópia consistente dos bancos SQLite com o PocketBase ligado (sem pegar escrita pela metade).
copiar_bancos() {
  local destino="$1"
  install -d -m 700 "$destino"
  for db in data.db auxiliary.db; do
    if [ -f "$PB_DATA/$db" ]; then
      sqlite3 "$PB_DATA/$db" ".backup '$destino/$db'"
    fi
  done
}

# Apaga as cópias mais antigas de uma pasta, deixando as N mais novas.
manter_ultimas() {
  local pasta="$1" n="$2"
  [ -d "$pasta" ] || return 0
  find "$pasta" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n +"$((n + 1))" \
    | while read -r velho; do rm -rf "${pasta:?}/$velho"; done
}

esperar_no_ar() {
  for _ in $(seq 1 30); do
    if compose exec -T pocketbase wget -q -O /dev/null http://127.0.0.1:8090/api/health 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}
