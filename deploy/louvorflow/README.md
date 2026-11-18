# LouvorFlow na VPS da igreja (saída do Skip)

O LouvorFlow roda na mesma VPS do WhatsApp (Hostinger, `187.41.100.15`), em Docker, ao lado da
Evolution API. A cada merge na `main`, o GitHub Actions testa, publica e reinicia sozinho:
ninguém precisa clicar em nada.

```
Navegador ──https──> Caddy (já existia, agora com 2 endereços)
                       ├─ zap.ibmaldeia.com.br     → Evolution API + baixador do YouTube
                       └─ gestao.ibmaldeia.com.br  → site (arquivos) e /api, /_, /backend → PocketBase 0.40.4
GitHub (merge na main) ──ssh──> envia site, hooks e migrações → reinicia o PocketBase
```

| Onde | O que fica lá |
|---|---|
| `/opt/louvorflow/pb_data` | Banco e arquivos enviados (dados reais) |
| `/opt/louvorflow/site`, `pb_hooks`, `pb_migrations` | Código publicado pelo GitHub |
| `/etc/louvorflow/louvorflow.env` | Segredos do app (os mesmos do Skip) |
| `/etc/louvorflow/backup.env` | Destino do backup fora do servidor (R2) |
| `/var/backups/louvorflow/` | Cópias locais: 7 diárias e as 10 de antes de cada deploy |
| `deploy/whatsapp/louvorflow.env` e `sites/louvorflow.caddy` | Endereço do LouvorFlow para o Caddy |

A versão do PocketBase (0.40.4) é a que o Skip usava: o banco que vem de lá não abre numa
versão mais velha. Para subir de versão, mude `PB_VERSION` em `deploy/whatsapp/pocketbase/Dockerfile`.

## Fase 1: ensaio (nada muda para quem usa o sistema)

### 1. Endereço de teste na Cloudflare
DNS → **Add record**: tipo `A`, nome `novo`, IPv4 `187.41.100.15`, nuvem **cinza** (DNS only).

### 2. Instalar na VPS
Entre na VPS (`ssh root@187.41.100.15`) e rode:

```bash
free -h                      # precisa sobrar uns 500 MB de memória
cd ~/louvorflow && git pull
ssh-keygen -t ed25519 -f /root/louvorflow-deploy -N "" -C github-actions
cd deploy/louvorflow
bash instalar.sh novo.ibmaldeia.com.br "$(cat /root/louvorflow-deploy.pub)"
```

O WhatsApp não desconecta: só o Caddy reinicia (alguns segundos).

### 3. Segredos do app
`nano /etc/louvorflow/louvorflow.env` e copie da tela de segredos do Skip:
`LOUVORFLOW_CREDENTIALS_KEY` (idêntica), `YOUTUBE_API_KEY`, `BANK_SYNC_TOKEN` e os demais que existirem lá.
**No ensaio deixe as linhas do WhatsApp comentadas** (com `#`). Salve (Ctrl+O, Enter, Ctrl+X).

### 4. GitHub
No repositório, **Settings → Secrets and variables → Actions**:

| Aba | Nome | Valor |
|---|---|---|
| Variables | `DEPLOY_HOST` | `187.41.100.15` |
| Variables | `SITE_URL` | `https://novo.ibmaldeia.com.br` |
| Secrets | `DEPLOY_SSH_KEY` | saída de `cat /root/louvorflow-deploy` na VPS (a chave inteira, com as linhas BEGIN/END) |
| Secrets | `DEPLOY_KNOWN_HOSTS` | saída de `ssh-keyscan -t ed25519 localhost \| sed 's/^localhost/187.41.100.15/'` na VPS |

Depois apague a chave privada da VPS: `shred -u /root/louvorflow-deploy`.
Em **Actions → Deploy → Run workflow**, rode o primeiro deploy. Tem que terminar verde.

### 5. Cópia dos dados do Skip
1. No painel do PocketBase do Skip (`/_/`), **Settings → Backups → Initialize new backup**, depois o botão de baixar.
   (Se o login no painel travar por causa do MFA, veja o gotcha do MFA nas notas.)
2. Envie o zip para a VPS. No PowerShell do computador:
   `scp "$HOME\Downloads\NOME-DO-BACKUP.zip" root@187.41.100.15:/root/pb_backup.zip`
   O zip tem dados de membros e do financeiro: não passe por e-mail, WhatsApp, GitHub nem pasta compartilhada.
3. Na VPS: `louvorflow-restaurar-skip /root/pb_backup.zip --ensaio`

O `--ensaio` desliga o e-mail e o backup automático **desta cópia**, e sem as chaves do WhatsApp ela
não manda mensagem a ninguém. O script confere as migrações (o banco tem que estar na 0104) e mostra
quantos membros, lançamentos e arquivos vieram.

### 6. Conferir
Em `https://novo.ibmaldeia.com.br`: login, Membros, Financeiro (saldos), Mídia (fotos e áudios
abrem), Escalas, site `/igreja`. **Não use esta cópia para trabalho de verdade**: tudo que for feito
nela some na troca.

## Fase 2: o dia da troca (escolher um horário sem uso, ex.: segunda à noite)

Avise a equipe: o sistema fica uns 20 minutos parado e todos entram de novo depois.

1. **Cloudflare**: no registro `gestao`, mude o TTL para o menor possível (pode ser na véspera).
2. **GitHub → Actions → Conector bancário → ⋯ → Disable workflow** (para não gravar no Skip durante a troca).
3. **Skip**: confira que todas as migrações estão aplicadas. Gere e baixe um backup novo (passo 5.1) e
   **a partir daqui ninguém mexe mais no sistema velho**.
4. **VPS**:
   ```bash
   cd ~/louvorflow && git pull && cd deploy/louvorflow
   bash instalar.sh gestao.ibmaldeia.com.br
   nano /etc/louvorflow/louvorflow.env   # tire o # das linhas WHATSAPP_API_URL/KEY;
                                          # WHATSAPP_MEDIA_BASE_URL=https://gestao.ibmaldeia.com.br
   louvorflow-restaurar-skip /root/pb_backup.zip      # sem --ensaio
   ```
5. **Cloudflare**: apague o CNAME `gestao` (que aponta para o goskip.app) e crie `A` `gestao` →
   `187.41.100.15`, nuvem **cinza**. A cinza é obrigatória: com a laranja, todos chegariam com o IP
   da Cloudflare e a trava de login contaria todo mundo junto.
6. **GitHub**: variável `SITE_URL` = `https://gestao.ibmaldeia.com.br`; segredo `LOUVORFLOW_URL` =
   `https://gestao.ibmaldeia.com.br`; rode **Actions → Deploy**; reative o **Conector bancário**.
7. Abra `https://gestao.ibmaldeia.com.br`, entre e confira como no ensaio. No LouvorFlow, abra
   Configurações → Integrações → WhatsApp (o webhook dos comprovantes passa a apontar para cá).
8. **Holyrics (PC da igreja)**: no `agent.config.json` do LouvorFlow Agent, troque `saasUrl` para
   `https://gestao.ibmaldeia.com.br` e reinicie o Agent.
9. Pode apagar o registro `novo` na Cloudflare. Mantenha o Skip pago até ter certeza (1 a 2 semanas);
   não apague nada lá.

Se algo der errado antes do passo 5, nada mudou para os usuários. Depois do passo 5, para voltar ao
Skip basta recriar o CNAME `gestao` → `gestao-de-louvor-f51d5.goskip.app` (o que foi feito na VPS
nesse meio-tempo fica só na VPS).

## Backup fora do servidor
Preencha `/etc/louvorflow/backup.env` (bucket R2 `louvorflow-backups`, chaves e uma senha guardada
no gerenciador de senhas) e teste com `systemctl start louvorflow-backup; journalctl -u louvorflow-backup -n 20`.
Sem isso só existem as cópias locais, que se perdem junto se a VPS se perder.

## Dia a dia

| Para | Comando (na VPS, como root) |
|---|---|
| Ver se está no ar | `cd ~/louvorflow/deploy/whatsapp && docker compose ps` |
| Ver os logs | `cd ~/louvorflow/deploy/whatsapp && docker compose logs -f --tail 100 pocketbase` |
| Reiniciar (com cópia antes) | `louvorflow-reiniciar` |
| Backup agora | `systemctl start louvorflow-backup` |
| Cópias locais | `ls /var/backups/louvorflow/*` |

Para voltar uma cópia local (ex.: um deploy estragou dados):
```bash
cd ~/louvorflow/deploy/whatsapp && docker compose stop pocketbase
rm -f /opt/louvorflow/pb_data/*.db-wal /opt/louvorflow/pb_data/*.db-shm
cp /var/backups/louvorflow/antes-do-deploy/AAAAMMDD-HHMMSS/*.db /opt/louvorflow/pb_data/
docker compose up -d --no-deps pocketbase
```
