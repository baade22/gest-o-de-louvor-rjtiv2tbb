# Conector bancário (Cora e Bradesco)

Busca o saldo e o extrato das contas da igreja direto nas APIs da Cora e do Bradesco e entrega
ao LouvorFlow, que grava os movimentos na conciliação e mostra tudo na aba **Saldos e extratos**.

## Por que um conector separado

Os dois bancos exigem **certificado digital do cliente (mTLS)** em cada chamada. O servidor do
LouvorFlow (PocketBase) não consegue enviar certificado nas chamadas que faz, e também não é
lugar para guardar chave privada de banco. Então:

- as credenciais ficam só aqui, nos segredos do GitHub Actions (ou no computador que rodar o
  conector);
- o conector pergunta ao LouvorFlow quais contas buscar, chama o banco e devolve o resultado;
- o LouvorFlow grava os movimentos novos (o mesmo movimento nunca entra duas vezes, nem se ele
  já tiver vindo por um arquivo OFX) e concilia sozinho quando há um único lançamento com o
  mesmo valor e sentido em até 3 dias.

## O que cada banco pede

| | Cora | Bradesco |
| --- | --- | --- |
| Modalidade | Integração Direta | API Saldos e Extratos (Portal do Desenvolvedor) |
| Quem pode | Conta PJ Cora | Correntista PJ, conta corrente ou poupança |
| Como pedir | No app ou no Cora Web (a Cora gera o client ID, o certificado e a chave) | Pelo Portal do Desenvolvedor Bradesco ou com o gerente PJ (o banco libera o client ID e o segredo para o certificado da igreja) |
| Credenciais | client ID, certificado e chave privada | client ID, client secret, certificado e chave privada |
| Token | `POST /token` (client_credentials), vale 24 h | `POST /auth/server-mtls/v1/token` (client_credentials) |
| Saldo | `GET /third-party/account/balance` | `GET /v1/fornecimento-saldos-contas/saldos` |
| Extrato | `GET /bank-statement/statement` (até 500 por página) | `GET /v1/fornecimento-extratos-contas/extratos` (até 1 ano e 5.000 movimentos por vez) |

## Passo a passo

1. No LouvorFlow, em **Financeiro > Saldos e extratos**, conecte cada conta: escolha o banco,
   o ambiente (Teste ou Produção) e, no Bradesco, a agência e a conta sem o dígito.
2. No servidor do LouvorFlow, crie a variável de ambiente `BANK_SYNC_TOKEN` com um valor
   aleatório de pelo menos 24 caracteres (é a senha entre o conector e o servidor).
3. No GitHub, em *Settings > Secrets and variables > Actions*, crie os segredos:

   | Segredo | Conteúdo |
   | --- | --- |
   | `LOUVORFLOW_URL` | endereço do servidor (ex.: `https://gestao-de-louvor-xxxx.goskip.dev`) |
   | `BANK_SYNC_TOKEN` | o mesmo valor do passo 2 |
   | `CORA_CLIENT_ID`, `CORA_CERT`, `CORA_KEY` | client ID, conteúdo do `certificate.pem` e do `private-key.key` |
   | `BRADESCO_CLIENT_ID`, `BRADESCO_CLIENT_SECRET`, `BRADESCO_CERT`, `BRADESCO_KEY` | credenciais do Bradesco |

   Só precisa dos segredos do banco que for usar. Se duas contas do mesmo banco tiverem
   credenciais diferentes, preencha **Credencial** na conexão (ex.: `DIAMANTE`) e use o sufixo
   nos segredos: `CORA_DIAMANTE_CLIENT_ID`, `CORA_DIAMANTE_CERT`, `CORA_DIAMANTE_KEY`.
4. O workflow `.github/workflows/bank-sync.yml` roda de 2 em 2 horas, das 7h15 às 21h15
   (Brasília). Para testar, abra *Actions > Conector bancário > Run workflow*.
5. Opcional, para o botão **Atualizar agora** disparar o conector na hora: no servidor, crie
   `BANK_SYNC_GITHUB_REPO` (`baade22/gest-o-de-louvor-rjtiv2tbb`) e `BANK_SYNC_GITHUB_TOKEN`
   (token do GitHub com permissão *Actions: read and write* só neste repositório). Sem elas o
   botão marca o pedido e a busca acontece na próxima rodada.

## Rodar em outro computador

Com Node 20 ou mais novo, sem instalar nada:

```sh
export LOUVORFLOW_URL=https://... BANK_SYNC_TOKEN=...
export CORA_CLIENT_ID=... CORA_CERT_FILE=/caminho/certificate.pem CORA_KEY_FILE=/caminho/private-key.key
node bank-sync/sync.mjs
```

Para agendar, use o Agendador de Tarefas do Windows ou o `cron`.

## Testes

`banks.test.mjs` confere a leitura das respostas com os exemplos das documentações e roda com
`npm test`.
