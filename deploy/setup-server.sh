#!/usr/bin/env bash
# Instala o LouvorFlow num servidor Ubuntu 22.04 ou 24.04 limpo.
#
# Uso (como root, uma vez só):
#   bash setup-server.sh louvor.suaigreja.com.br "ssh-ed25519 AAAA... github-actions"
#
# O segundo argumento é a chave PÚBLICA que o GitHub Actions usa para publicar.
# Pode rodar de novo sem estragar nada: só cria o que falta.
set -euo pipefail

DOMAIN="${1:?informe o domínio, ex.: louvor.suaigreja.com.br}"
DEPLOY_PUBKEY="${2:-}"
PB_VERSION="0.28.4"
APP=/opt/louvorflow
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (sudo bash setup-server.sh ...)" >&2
  exit 1
fi

echo "==> Pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl unzip sqlite3 restic rsync ufw unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https gnupg
timedatectl set-timezone America/Sao_Paulo

echo "==> Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

echo "==> Usuários"
id louvorflow >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin louvorflow
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
if [ -n "$DEPLOY_PUBKEY" ]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null \
    || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys
fi

echo "==> Pastas"
install -d -m 755 "$APP" "$APP/bin"
install -d -m 750 -o louvorflow -g louvorflow "$APP/pb_data"
# Código publicado pelo GitHub Actions: o usuário deploy escreve, o PocketBase só lê.
install -d -m 755 -o deploy -g deploy "$APP/site" "$APP/pb_hooks" "$APP/pb_migrations"
install -d -m 750 /etc/louvorflow
chgrp louvorflow /etc/louvorflow

echo "==> PocketBase $PB_VERSION"
case "$(uname -m)" in
  x86_64) PB_ARCH=amd64 ;;
  aarch64) PB_ARCH=arm64 ;;
  *) echo "Arquitetura não suportada: $(uname -m)" >&2; exit 1 ;;
esac
if ! "$APP/bin/pocketbase" --version 2>/dev/null | grep -q "$PB_VERSION"; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/pb.zip" \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip"
  unzip -o -q "$tmp/pb.zip" pocketbase -d "$APP/bin"
  rm -rf "$tmp"
fi

echo "==> Segredos (só cria o modelo; preencha à mão)"
if [ ! -f /etc/louvorflow/louvorflow.env ]; then
  install -m 640 -g louvorflow "$HERE/louvorflow.env.example" /etc/louvorflow/louvorflow.env
fi
if [ ! -f /etc/louvorflow/backup.env ]; then
  install -m 600 "$HERE/backup.env.example" /etc/louvorflow/backup.env
fi

echo "==> Serviços"
install -m 755 "$HERE/backup.sh" /usr/local/sbin/louvorflow-backup
install -m 755 "$HERE/restore-pocketbase-zip.sh" /usr/local/sbin/louvorflow-restore-zip
install -m 644 "$HERE/louvorflow.service" /etc/systemd/system/louvorflow.service
install -m 644 "$HERE/louvorflow-backup.service" /etc/systemd/system/louvorflow-backup.service
install -m 644 "$HERE/louvorflow-backup.timer" /etc/systemd/system/louvorflow-backup.timer
sed "s/__DOMAIN__/$DOMAIN/g" "$HERE/Caddyfile" > /etc/caddy/Caddyfile

# O deploy só pode reiniciar o LouvorFlow e disparar o backup, nada além disso.
cat > /etc/sudoers.d/louvorflow-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart louvorflow, /usr/bin/systemctl start louvorflow-backup.service
EOF
chmod 440 /etc/sudoers.d/louvorflow-deploy
visudo -cf /etc/sudoers.d/louvorflow-deploy

systemctl daemon-reload
systemctl enable --now louvorflow
systemctl enable --now louvorflow-backup.timer
systemctl reload caddy || systemctl restart caddy

echo "==> Firewall: só SSH, HTTP e HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Atualizações de segurança automáticas"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> SSH só por chave"
# Só desliga a senha se já existe alguma chave cadastrada, para ninguém ficar trancado fora.
if [ -s /root/.ssh/authorized_keys ] || ls /home/*/.ssh/authorized_keys >/dev/null 2>&1; then
  cat > /etc/ssh/sshd_config.d/10-louvorflow.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh || systemctl reload sshd
else
  echo "   Nenhuma chave SSH encontrada: login por senha continua ligado."
fi

cat <<EOF

Pronto. Próximos passos:
  1. Preencha /etc/louvorflow/louvorflow.env e /etc/louvorflow/backup.env
  2. Aponte o DNS de $DOMAIN para este servidor (registro A, sem o proxy laranja da Cloudflare)
  3. Crie o superusuário: sudo -u louvorflow $APP/bin/pocketbase superuser upsert EMAIL SENHA --dir=$APP/pb_data
  4. systemctl restart louvorflow
EOF
