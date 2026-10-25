# Servidor próprio do LouvorFlow

Tudo o que é preciso para rodar o LouvorFlow fora do Skip, num servidor VPS com Ubuntu 22.04 ou 24.04.

| Peça | O que faz |
|---|---|
| PocketBase 0.28.4 | Banco, arquivos enviados, hooks e regras. Escuta só em `127.0.0.1:8090`. |
| Caddy | HTTPS automático no domínio da igreja. Entrega o site e repassa `/api`, `/_` e `/backend` ao PocketBase. |
| restic | Backup diário às 3h30, criptografado, num bucket S3 fora do servidor (Cloudflare R2 ou Backblaze B2). Guarda 30 diários e 12 mensais. |
| GitHub Actions | A cada merge na `main`: testa, gera o site, faz backup, envia hooks e migrações e reinicia o PocketBase. |

Arquivos desta pasta:

| Arquivo | Vai para |
|---|---|
| `setup-server.sh` | Roda uma vez no servidor e instala tudo |
| `louvorflow.service` | `/etc/systemd/system/` |
| `Caddyfile` | `/etc/caddy/Caddyfile` (com o domínio no lugar de `__DOMAIN__`) |
| `louvorflow.env.example` | `/etc/louvorflow/louvorflow.env` (segredos do app) |
| `backup.env.example` | `/etc/louvorflow/backup.env` (destino e senha do backup) |
| `backup.sh`, `louvorflow-backup.*` | `/usr/local/sbin/louvorflow-backup` e o timer diário |
| `restore-pocketbase-zip.sh` | `/usr/local/sbin/louvorflow-restore-zip` |

## Instalar

1. Contrate o VPS (2 GB de RAM bastam) e entre como root.
2. Gere no seu computador a chave que o GitHub vai usar para publicar:
   `ssh-keygen -t ed25519 -f louvorflow-deploy -N "" -C github-actions`
3. Copie esta pasta para o servidor e rode, trocando o domínio e colando a chave **pública**:
   `bash setup-server.sh louvor.suaigreja.com.br "$(cat louvorflow-deploy.pub)"`
4. Preencha `/etc/louvorflow/louvorflow.env` e `/etc/louvorflow/backup.env` (instruções dentro de cada um).
5. No DNS, crie o registro A do domínio apontando para o IP do servidor. Na Cloudflare, deixe a nuvem **cinza** (só DNS): com o proxy laranja, todos chegariam com o IP da Cloudflare e a trava de login voltaria a contar todo mundo junto.
6. No GitHub, em Settings → Secrets and variables → Actions:
   - variável `DEPLOY_HOST`: IP ou domínio do servidor
   - variável `SITE_URL`: `https://louvor.suaigreja.com.br`
   - segredo `DEPLOY_SSH_KEY`: conteúdo do arquivo `louvorflow-deploy` (a chave privada)
   - segredo `DEPLOY_KNOWN_HOSTS`: saída de `ssh-keyscan <servidor>`
7. Rode o workflow **Deploy** à mão (Actions → Deploy → Run workflow). Sem `DEPLOY_HOST`, ele fica desligado.

## Trazer os dados do Skip

1. No painel do PocketBase do Skip (`/_/`), em Settings → Backups, gere um backup e baixe o `.zip`.
2. Envie o zip direto para o servidor (`scp pb_backup.zip root@servidor:/root/`). Ele tem dados de membros e do financeiro: não passe por e-mail, GitHub ou pasta compartilhada.
3. No servidor: `louvorflow-restore-zip /root/pb_backup.zip`. O `pb_data` anterior fica guardado ao lado.
4. Confira login, membros, lançamentos e mídias. Depois apague o zip: `shred -u /root/pb_backup.zip`.

A `LOUVORFLOW_CREDENTIALS_KEY` tem que ser a mesma do Skip, senão as credenciais criptografadas não abrem.

## Dia a dia

| Para | Comando (no servidor) |
|---|---|
| Ver se está no ar | `systemctl status louvorflow` |
| Ver os logs | `journalctl -u louvorflow -f` |
| Reiniciar | `systemctl restart louvorflow` |
| Fazer backup agora | `systemctl start louvorflow-backup` |
| Listar backups | `set -a; . /etc/louvorflow/backup.env; restic snapshots` |

## Restaurar de um backup do restic

```bash
set -a; . /etc/louvorflow/backup.env
restic restore latest --tag louvorflow --target /root/restaurar
systemctl stop louvorflow
mv /opt/louvorflow/pb_data /opt/louvorflow/pb_data.antes-$(date +%F)
install -d -o louvorflow -g louvorflow /opt/louvorflow/pb_data
cp -a /root/restaurar/var/backups/louvorflow/snapshot/. /opt/louvorflow/pb_data/
cp -a /root/restaurar/opt/louvorflow/pb_data/storage /opt/louvorflow/pb_data/
chown -R louvorflow:louvorflow /opt/louvorflow/pb_data
systemctl start louvorflow
```

Teste uma restauração assim uma vez por mês, num diretório separado, para ter certeza de que o backup abre.
