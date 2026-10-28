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

Esta forma de conexão não é a oficial do WhatsApp. O risco é pequeno com poucas mensagens para
pessoas que conhecem a igreja, e o LouvorFlow já ajuda:

- manda no máximo 6 mensagens por minuto por igreja, com "digitando..." antes de cada uma;
- só manda para quem tem celular com DDD na ficha;
- não faz disparo em massa (avisos individuais de escala, eventos e parabéns).

Do lado da igreja: use um número que já é usado normalmente (conversa nos dois sentidos ajuda),
não use para propaganda e peça para as pessoas salvarem o contato da igreja.

## Manutenção

- **Ver se está no ar:** `docker compose ps`
- **Atualizar a Evolution:** troque a versão da imagem em `docker-compose.yml`, depois
  `docker compose pull && docker compose up -d`.
- **Celular diz "não é possível conectar novos dispositivos":** atualize o WhatsApp do celular,
  apague a conexão antiga (`curl -X DELETE https://zap.ibmaldeia.com.br/instance/delete/lf-... -H "apikey: $WHATSAPP_API_KEY"`)
  e gere um QR novo. Se continuar, ponha a versão atual do WhatsApp Web em
  `CONFIG_SESSION_PHONE_VERSION` no `.env` e rode `docker compose up -d evolution`.
- **Se a conexão cair:** a tela do LouvorFlow mostra "Desconectado"; é só ler o QR Code de novo.
  As mensagens esperam na fila por até 2 dias.
- **Servidor perdido:** basta instalar de novo e ler o QR Code. Nenhum dado da igreja fica aqui:
  o servidor guarda só a sessão do WhatsApp, não as conversas.
