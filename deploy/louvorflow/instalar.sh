#!/usr/bin/env bash
# Liga o LouvorFlow no servidor que já roda o WhatsApp (pasta deploy/whatsapp).
# Rodar como root, dentro desta pasta do clone do repositório (uma vez; pode repetir):
#
#   bash instalar.sh novo.ibmaldeia.com.br "ssh-ed25519 AAAA... github-actions"
#
# O 1º argumento é o endereço do LouvorFlow neste servidor (no ensaio, novo.ibmaldeia.com.br;
# no dia da troca roda de novo com gestao.ibmaldeia.com.br). O 2º é a chave PÚBLICA que o
# GitHub Actions usa para publicar.
set -euo pipefail

DOMINIO="${1:?informe o endereço, ex.: novo.ibmaldeia.com.br}"
CHAVE_DEPLOY="${2:-}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="$(cd "$AQUI/../whatsapp" && pwd)"
APP=/opt/louvorflow

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo bash instalar.sh ...)" >&2; exit 1; }
[ -f "$COMPOSE_DIR/.env" ] || { echo "Não achei $COMPOSE_DIR/.env: o servidor do WhatsApp precisa estar instalado." >&2; exit 1; }

echo "==> Pacotes"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q sqlite3 restic rsync unzip

echo "==> Usuário que o GitHub usa para publicar (só escreve o site e o código)"
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
if [ -n "$CHAVE_DEPLOY" ]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  touch /home/deploy/.ssh/authorized_keys
  grep -qxF "$CHAVE_DEPLOY" /home/deploy/.ssh/authorized_keys || echo "$CHAVE_DEPLOY" >> /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys
fi

echo "==> Pastas em $APP"
install -d -m 755 "$APP"
install -d -m 750 "$APP/pb_data"
install -d -m 755 -o deploy -g deploy "$APP/site" "$APP/pb_hooks" "$APP/pb_migrations"
install -d -m 700 /etc/louvorflow /var/backups/louvorflow
echo "COMPOSE_DIR=$COMPOSE_DIR" > /etc/louvorflow/servidor.conf

echo "==> Segredos (só cria o modelo na 1ª vez; preencha à mão)"
if [ ! -f /etc/louvorflow/louvorflow.env ]; then
  install -m 600 "$AQUI/louvorflow.env.example" /etc/louvorflow/louvorflow.env
  # Deixa os valores do WhatsApp à mão, comentados (ligar só no dia da troca).
  url="https://$(grep '^WHATSAPP_DOMAIN=' "$COMPOSE_DIR/.env" | cut -d= -f2-)"
  key="$(grep '^WHATSAPP_API_KEY=' "$COMPOSE_DIR/.env" | cut -d= -f2-)"
  sed -i "s#^\#WHATSAPP_API_URL=.*#\#WHATSAPP_API_URL=$url#; s#^\#WHATSAPP_API_KEY=.*#\#WHATSAPP_API_KEY=$key#" \
    /etc/louvorflow/louvorflow.env
fi
[ -f /etc/louvorflow/backup.env ] || install -m 600 "$AQUI/backup.env.example" /etc/louvorflow/backup.env

echo "==> Scripts e backup diário"
install -d -m 755 /usr/local/lib/louvorflow
install -m 644 "$AQUI/comum.sh" /usr/local/lib/louvorflow/comum.sh
install -m 755 "$AQUI/reiniciar.sh" /usr/local/sbin/louvorflow-reiniciar
install -m 755 "$AQUI/backup.sh" /usr/local/sbin/louvorflow-backup
install -m 755 "$AQUI/restaurar-do-skip.sh" /usr/local/sbin/louvorflow-restaurar-skip
install -m 644 "$AQUI/louvorflow-backup.service" /etc/systemd/system/
install -m 644 "$AQUI/louvorflow-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now louvorflow-backup.timer

# O GitHub só pode reiniciar o LouvorFlow (que faz uma cópia do banco antes), nada além disso.
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/louvorflow-reiniciar' > /etc/sudoers.d/louvorflow-deploy
chmod 440 /etc/sudoers.d/louvorflow-deploy
visudo -cf /etc/sudoers.d/louvorflow-deploy

echo "==> Ligando o LouvorFlow no Docker do servidor"
# Endereço do LouvorFlow para o Caddy. Fica fora do .env para não reiniciar a Evolution.
echo "LOUVORFLOW_DOMAIN=$DOMINIO" > "$COMPOSE_DIR/louvorflow.env"
install -m 644 "$AQUI/louvorflow.caddy" "$COMPOSE_DIR/sites/louvorflow.caddy"

cd "$COMPOSE_DIR"
docker compose build -q pocketbase
# --no-deps: sobe só o LouvorFlow e o Caddy. A Evolution (conexão do WhatsApp) não é tocada;
# o HTTPS do zap pisca alguns segundos enquanto o Caddy volta.
docker compose up -d --no-deps pocketbase
docker compose up -d --no-deps --force-recreate caddy

cat <<FIM

Pronto. Próximos passos (detalhes em deploy/louvorflow/README.md):
  1. Preencha /etc/louvorflow/louvorflow.env  (nano /etc/louvorflow/louvorflow.env) e rode: louvorflow-reiniciar
  2. No GitHub, cadastre DEPLOY_HOST, SITE_URL=https://$DOMINIO e as chaves, e rode o Deploy
  3. Traga os dados do Skip: louvorflow-restaurar-skip /root/pb_backup.zip --ensaio
FIM
