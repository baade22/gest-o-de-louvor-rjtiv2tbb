# Conector bancário (Cora e Bradesco)

Busca o saldo e o extrato das contas da igreja direto nas APIs da Cora e do Bradesco e entrega
ao LouvorFlow, que grava os movimentos na conciliação e mostra tudo na aba **Saldos e extratos**.

## Por que um conector separado

Os dois bancos exigem **certificado digital do cliente (mTLS)** em cada chamada. O servidor do
LouvorFlow (PocketBase) não consegue enviar certificado nas chamadas que faz. Então:

- as credenciais são cadastradas pelo MASTER na tela de Integrações (cifradas no servidor) e
  seguem para o conector junto com cada conta; quem preferir pode deixá-las só nos segredos do
  GitHub Actions;
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

1. No LouvorFlow, em **Configurações > Integrações > Bancos**, o MASTER cadastra as credenciais
   de cada banco: ambiente (Teste ou Produção), client ID, client secret (Bradesco), certificado
   e chave privada (pode escolher os arquivos `.pem`/`.crt`/`.key`). Tudo fica cifrado no
   servidor com `LOUVORFLOW_CREDENTIALS_KEY` e a tela não mostra de novo.
2. Na mesma tela, em **Conector bancário**, clique em **Gerar chave do conector**. A chave
   aparece uma única vez junto com o endereço do servidor.
3. No GitHub, em *Settings > Secrets and variables > Actions*, crie dois segredos:

   | Segredo | Conteúdo |
   | --- | --- |
   | `LOUVORFLOW_URL` | endereço do servidor mostrado na tela |
   | `BANK_SYNC_TOKEN` | a chave do conector do passo 2 |

4. Em **Financeiro > Saldos e extratos**, conecte cada conta: escolha o banco, o ambiente e,
   no Bradesco, a agência e a conta sem o dígito. Se duas contas do mesmo banco tiverem
   credenciais diferentes, dê um nome ao conjunto na tela de Integrações (ex.: `DIAMANTE`) e
   use o mesmo nome no campo **Credencial** da conta.
5. O workflow `.github/workflows/bank-sync.yml` roda de 2 em 2 horas, das 7h15 às 21h15
   (Brasília). Para testar, abra *Actions > Conector bancário > Run workflow*.
6. Opcional, para o botão **Atualizar agora** disparar o conector na hora: em Integrações,
   **Botão "Atualizar agora"**, informe o repositório e um token do GitHub com permissão
   *Actions: read and write* só neste repositório. Sem ele o botão marca o pedido e a busca
   acontece na próxima rodada.

### Sem cadastrar no LouvorFlow

Quem preferir deixar as credenciais só no GitHub ainda pode: no servidor, crie a variável
`BANK_SYNC_TOKEN` (32+ caracteres aleatórios, vale para todas as igrejas) e use o mesmo valor no
segredo do GitHub; depois crie os segredos `CORA_CLIENT_ID`, `CORA_CERT`, `CORA_KEY`,
`BRADESCO_CLIENT_ID`, `BRADESCO_CLIENT_SECRET`, `BRADESCO_CERT`, `BRADESCO_KEY` (com sufixo,
ex.: `CORA_DIAMANTE_CERT`, para conjuntos com nome). O conector usa as credenciais do
LouvorFlow quando existem e, se não, as dos segredos. `BANK_SYNC_GITHUB_REPO` e
`BANK_SYNC_GITHUB_TOKEN` no servidor também continuam valendo para o "Atualizar agora".

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
