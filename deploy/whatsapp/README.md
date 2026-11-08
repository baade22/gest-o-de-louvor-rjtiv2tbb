# Servidor do WhatsApp

O LouvorFlow manda os avisos pelo WhatsApp da igreja do mesmo jeito que o Eklesia: o celular
da igreja lê um QR Code e fica "conectado", como no WhatsApp Web. Quem mantém essa conexão
ligada é a [Evolution API](https://github.com/EvolutionAPI/evolution-api) (gratuita), que roda
neste servidor pequeno. O Skip continua com o resto do sistema.

```
LouvorFlow (Skip)  --  fila de mensagens  -->  Evolution API (este servidor)  -->  WhatsApp da igreja
```

## 1. Contratar o servidor

Um VPS com Ubuntu 24.04, 1 ou 2 GB de memória e IP fixo, de preferência no Brasil
(Hostinger, Magalu Cloud, Contabo, Locaweb...). Fica na faixa de R$ 30 a 50 por mês.
Esse mesmo servidor pode receber o LouvorFlow inteiro quando a igreja sair do Skip.

## 2. Apontar um endereço

No painel do domínio (Umbler, `ibmaldeia.com.br`), crie um registro **A**:

| Nome | Tipo | Valor |
|---|---|---|
| `zap` | A | IP do servidor |

Fica `zap.ibmaldeia.com.br`. Espere alguns minutos até o endereço responder.

## 3. Instalar

Entre no servidor por SSH como root e rode:

```bash
git clone https://github.com/baade22/gest-o-de-louvor-rjtiv2tbb.git louvorflow
cd louvorflow/deploy/whatsapp
bash setup.sh zap.ibmaldeia.com.br
```

O script instala o Docker, fecha o firewall (só SSH e HTTPS), cria o arquivo `.env` com uma
chave nova e sobe tudo. O HTTPS sai sozinho (Caddy). No fim ele mostra os dois segredos.

## 4. Ligar no LouvorFlow

1. No Skip, em segredos do backend, cadastre:
   - `WHATSAPP_API_URL` = `https://zap.ibmaldeia.com.br`
   - `WHATSAPP_API_KEY` = a chave que o script mostrou (está no `.env` do servidor)
2. Sincronize o Skip e peça para aplicar as migrações pendentes (a nova é a **0074**).
   Depois, todo mundo sai e entra de novo.
3. No LouvorFlow, como MASTER: **Configurações > Integrações > WhatsApp > Configurar WhatsApp >
   Conectar WhatsApp**. No celular da igreja: WhatsApp > **Aparelhos conectados** >
   **Conectar um aparelho** > ler o QR Code.
4. Mande uma mensagem de teste e ligue os envios automáticos que quiser.
5. Confira em PocketBase > Settings que o **Application URL** é o endereço do site: é ele que
   vai no link "confirme sua escala".

## Cuidados para o WhatsApp não bloquear o número

Esta forma de conexão não é a oficial do WhatsApp. Em 2026-10-31 o número da igreja foi
marcado como spam e depois suspenso: muitas reconexões seguidas, conexão saindo do IP de um
datacenter e uma rajada de mensagens logo depois de conectar. Para não repetir:

**O que o LouvorFlow já faz sozinho**
- Nada sai nos primeiros 30 minutos depois de conectar; até 24 horas, uma mensagem a cada 3
  minutos. Depois, 1 por minuto na primeira semana e 2 por minuto em seguida.
- Limite por dia, contado desde que o número conectou pela primeira vez (chip novo recomeça):
  20 no 1º dia, 30, 45, 60, 80, 100, 120 e 150 por dia na 2ª semana; depois 250. Avisos em massa
  e parabéns param em 70% do limite, para sobrar espaço para escalas e lembretes. O que passa do
  limite sai no dia seguinte, a partir das 08:00.
- Mensagem com mais de 12 horas de atraso não é enviada.
- Depois de 5 falhas seguidas do servidor, a fila pausa 15 minutos.
- "Digitando..." antes de cada mensagem; avisos em massa só na janela de horário.

**O que fazer do lado da igreja**
- De preferência, um **chip só para o sistema**, e não o número principal da igreja. Use esse
  chip no celular por uma semana antes (conversas nos dois sentidos, foto e nome no perfil,
  entrar em grupos da igreja) e só então conecte.
- Use **proxy residencial com IP fixo do Brasil** (veja abaixo).
- Conecte **uma vez** e deixe. Cada desconectar e conectar de novo aumenta a desconfiança.
  Se cair, espere algumas horas antes de ler o QR de novo.
- Deixe o celular ligado e com internet; ele precisa abrir o WhatsApp de vez em quando.
- Peça para as pessoas salvarem o contato da igreja. Mensagens para quem não tem o número
  salvo e nunca conversou são o que mais gera denúncia.
- Para avisos gerais, prefira **grupos do WhatsApp** (1 mensagem por grupo) em vez de mandar
  para 120 pessoas uma a uma.

### Proxy residencial

O servidor fica num datacenter, e o WhatsApp desconfia de conexões vindas de datacenter. Com
um proxy residencial, a conexão do WhatsApp sai por um IP de internet de casa, no Brasil.

1. Contrate um proxy **residencial (ou ISP) com IP fixo, dedicado, do Brasil**, protocolo HTTP.
   Não use proxy rotativo (trocar de IP derruba a sessão) nem IP de fora do Brasil. Custa em
   torno de R$ 15 a 25 por mês.
2. No servidor, edite o `.env` (`nano ~/louvorflow/deploy/whatsapp/.env`) e acrescente no fim
   (servidores instalados antes de 2026-11 não têm essas linhas):
   ```
   PROXY_HOST=endereço-do-proxy
   PROXY_PORT=porta
   PROXY_PROTOCOL=http
   PROXY_USERNAME=usuário
   PROXY_PASSWORD=senha
   ```
3. Rode `docker compose up -d evolution`.
4. Confira se o proxy funciona (deve mostrar o IP do proxy, e não 187.41.100.15):
   `curl -x http://USUARIO:SENHA@HOST:PORTA https://icanhazip.com`
5. Só então leia o QR Code no LouvorFlow.

## Manutenção

- **Ver se está no ar:** `docker compose ps`
- **Atualizar a Evolution:** troque a versão da imagem em `docker-compose.yml`, depois
  `docker compose pull && docker compose up -d`.
- **Celular diz "não é possível conectar novos dispositivos":** atualize o WhatsApp do celular,
  apague a conexão antiga (`curl -X DELETE https://zap.ibmaldeia.com.br/instance/delete/lf-... -H "apikey: $WHATSAPP_API_KEY"`)
  e gere um QR novo. Se continuar, ponha a versão atual do WhatsApp Web em
  `CONFIG_SESSION_PHONE_VERSION` no `.env` e rode `docker compose up -d evolution`.
- **Se a conexão cair:** a tela do LouvorFlow mostra "Desconectado". Espere algumas horas e
  leia o QR Code de novo uma vez só. As mensagens esperam na fila por até 12 horas.
- **Servidor perdido:** basta instalar de novo e ler o QR Code. Nenhum dado da igreja fica aqui:
  o servidor guarda só a sessão do WhatsApp, não as conversas.

## Baixar do YouTube (Mídia)

Este mesmo servidor também baixa vídeo ou áudio do YouTube para a Mídia do LouvorFlow
(botão **Baixar do YouTube**). Ele roda junto com o WhatsApp (serviço `youtube` no
`docker-compose.yml`) e responde em `https://zap.ibmaldeia.com.br/youtube/...`.

```
LouvorFlow (Skip) -> pede o download -> este servidor (yt-dlp + ffmpeg)
LouvorFlow (Skip) <- busca o arquivo pronto (a cada minuto) e guarda na mídia do culto
Se este servidor falhar -> o computador do Holyrics (Agent 0.0.50+) baixa quando estiver conectado
```

**Instalar ou atualizar** (no servidor, por SSH):

```bash
cd ~/louvorflow && git pull
cd deploy/whatsapp
docker compose up -d --build youtube caddy
curl https://zap.ibmaldeia.com.br/youtube/health   # deve mostrar {"ok": true}
```

Não precisa de segredo novo no Skip: o LouvorFlow usa `WHATSAPP_API_URL` + `/youtube` e a
mesma `WHATSAPP_API_KEY`. Para usar outro servidor ou outra chave, cadastre no Skip
`YOUTUBE_API_URL` (ex.: `https://outro.servidor/youtube`) e `YOUTUBE_API_KEY`, e ponha a mesma
chave como `YOUTUBE_API_KEY` no `.env` daqui.

**Limites e cuidados**
- Vídeo até 720p e arquivo até 100 MB (limite da mídia no LouvorFlow). Maior que isso, o
  computador do Holyrics baixa (até 1080p, sem esse limite).
- O YouTube às vezes bloqueia servidores de datacenter ("confirme que não é um robô"). Nesse
  caso o pedido passa sozinho para o computador do Holyrics. Se acontecer sempre, dá para
  usar o proxy residencial: acrescente `YOUTUBE_PROXY=http://usuario:senha@host:porta` no
  `.env` e rode `docker compose up -d youtube`.
- O yt-dlp se atualiza sozinho uma vez por dia. Os arquivos ficam aqui no máximo 24 horas.
- Baixe só vídeos que a igreja tem direito de exibir.
