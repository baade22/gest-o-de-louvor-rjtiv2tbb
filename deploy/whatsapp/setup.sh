#!/usr/bin/env bash
# Instala o servidor do WhatsApp num VPS Ubuntu novo. Rodar como root, dentro desta pasta:
#   bash setup.sh zap.ibmaldeia.com.br
set -euo pipefail
DOMAIN="${1:?Informe o domínio, ex.: bash setup.sh zap.ibmaldeia.com.br}"

if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Firewall: só SSH e HTTPS
if command -v ufw >/dev/null; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

if [ ! -f .env ]; then
  cat > .env <<ENV
WHATSAPP_DOMAIN=${DOMAIN}
WHATSAPP_API_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ENV
  chmod 600 .env
fi

docker compose pull
docker compose up -d

echo
echo "Pronto. Cadastre estes dois segredos no Skip:"
echo "  WHATSAPP_API_URL=https://${DOMAIN}"
grep '^WHATSAPP_API_KEY=' .env
