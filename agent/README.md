# LouvorFlow Agent v0.0.24 — Holyrics Bridge

O **LouvorFlow Agent** é um serviço leve em Node.js/TypeScript que roda no computador da igreja onde o Holyrics está instalado. Ele faz a ponte segura entre o **LouvorFlow SaaS** e a **Holyrics API Server Local** (`http://127.0.0.1:8091`).

---

## 🔒 Segurança e Arquitetura

1. **Comunicação 100% de Saída (Outbound):**
   - O SaaS **NUNCA** acessa o IP da igreja nem exige portas abertas ou firewall modificado.
   - O Agent faz long-polling/polling e envia heartbeats para o servidor do LouvorFlow.
2. **Segredo Local:**
   - O **Token da API do Holyrics** fica gravado **SOMENTE** no computador local (`agent.config.json` com permissões restritas 0600).
   - O token **NUNCA** é enviado para o LouvorFlow, nunca vai para o banco e nunca aparece em logs.
3. **Pareamento Seguro de Uso Único:**
   - O administrador gera um código de 6 dígitos no LouvorFlow SaaS (válido por 10 minutos).
   - O Agent envia o código uma única vez e recebe um `agent_token` criptografado (hash SHA-256 no backend).

---

## 🚀 Requisitos

- **Node.js 18+** instalado no computador da projeção (Windows, macOS ou Linux).
- **Holyrics v2+** com o recurso **API Server** ativado.

---

## 📦 Como Instalar e Executar

1. Baixe ou copie a pasta `agent/` para o computador da igreja.
2. No terminal (Prompt de Comando ou PowerShell no Windows, Terminal no macOS/Linux), entre na pasta descompactada do Agent.
3. Como a pasta `dist/` já vem pré-compilada no pacote, você pode rodar diretamente:
   ```bash
   npm start
   ```
   *(Ou caso queira recompilar a partir do código-fonte TypeScript: rode `npm install`, depois `npm run build` e `npm start`).*
4. O Agent iniciará o painel web local na porta **8765**:
   👉 Abra o navegador em: **`http://localhost:8765`**

---

## 🔗 Como Parear com o LouvorFlow

1. Acesse o **LouvorFlow SaaS** com uma conta de Administrador ou Líder.
2. Vá em **Configurações → Integrações → Holyrics**.
3. Clique em **[Conectar computador]** para gerar o código de pareamento de 6 dígitos (ex.: `847 291`).
4. Abra o painel do Agent em `http://localhost:8765`.
5. No bloco **"Conectar ao LouvorFlow (Pareamento)"**, digite o código de 6 dígitos e clique em **[Conectar]**.
6. O LouvorFlow passará a exibir o computador como **🟢 Conectado**!

---

## ⚙️ Configurar Holyrics no Agent

1. No computador da igreja, abra o **Holyrics**.
2. Vá em **Menu Arquivo → Configurações → API Server**.
3. Ative o servidor local na porta padrão `8091`.
4. Em **Gerenciar Tokens**, crie um token com permissão para:
   - `SearchSong` (ou `SearchLyrics`)
   - `AddLyricsToPlaylist` (ou `AddToPlaylist`)
   - `GetLyricsPlaylist` (ou `GetPlaylist`)
   - `CreateSong` (ou `AddSong`)
   - `GetTokenInfo`5. No painel do Agent (`http://localhost:8765`), cole o token no campo correspondente e clique em **[Salvar Configurações]**.
6. Clique em **[Testar Conexão Holyrics]** para verificar se o status fica **🟢 Conectado (OK)**.

---

## 🔍 Diagnóstico de SearchSong (Novo)

O painel local (`http://localhost:8765`) possui uma ferramenta dedicada para testar a busca de músicas no Holyrics em tempo real:

- **O que é:** Executa uma chamada HTTP **real** (sem mock, sem simulação) do Agent contra o Holyrics local (`http://127.0.0.1:8091/api/SearchSong`) usando o token configurado e o payload oficial mínimo `{ text: "nome da música" }`.
- **Quando usar:**
  - Sempre que ao clicar em "Enviar para playlist do Holyrics" no SaaS a música demorar a responder ou o SaaS relatar tempo esgotado.
  - Para verificar se o Holyrics está ativo, se a permissão `SearchSong` está habilitada no token do Holyrics e se o acervo local contém a canção.
- **Como interpretar os resultados na tela:**
  - **Checklist por etapa:** Exibe o status individual de cada etapa essencial:
    - `Agent → OK`
    - `Holyrics API → OK`
    - `GetVersion → OK`
    - `Autenticação → OK`
    - `SearchSong → OK / TIMEOUT / ERROR`
  - **Tempo por etapa:** Milissegundos despendidos em cada checagem individual.
  - **Causa técnica identificada:** Caso alguma etapa falhe ou retorne timeout, explica com exatidão a causa técnica (ex.: `Tempo limite excedido na chamada SearchSong ao Holyrics (>= 3000ms)`, `Token inválido`, ou `CONNECTION_REFUSED`). Se a resposta retornar 0 resultados com status ok, informa para verificar se a música está arquivada ou em categoria não pesquisada.
  - **Endpoint utilizado:** Exibe `http://127.0.0.1:8091/api/SearchSong` (o token de autenticação **nunca** é exibido na tela nem aparece nos logs locais, preservando a segurança).
  - **Método HTTP:** `POST`.
  - **Status HTTP:** Deve ser `200 (OK)`. Se retornar 401 ou erro de token, revise as permissões em Menu Arquivo > Configurações > API Server no Holyrics.
  - **Tempo total:** Tempo em milissegundos da chamada local.
  - **Músicas encontradas:** Quantidade de itens correspondentes encontrados no acervo do Holyrics.
  - **Primeiro resultado:** Exibe identificador, título, artista e autor quando disponível.
  - **Resposta Retornada:** Trecho do JSON bruto recebido do Holyrics para conferência imediata.

---

## 🎵 Enviar Músicas para a Playlist

1. No LouvorFlow, abra qualquer música cadastrada.
2. No topo, clique em **[Enviar para Holyrics]**.
3. O LouvorFlow enviará o comando ao Agent:
   - Se a música for encontrada exatamente uma vez: será **adicionada automaticamente** à playlist do Holyrics!
   - Se houver mais de uma versão correspondente: o LouvorFlow abrirá um diálogo para você **escolher a versão correta**.
   - Se não for encontrada: avisará com mensagem clara para cadastrá-la no Holyrics.

---

## 🎛️ Novos Comandos v0.0.24 (Sincronização de Repertório de Culto)

Na versão 0.0.24, o Agent suporta os seguintes comandos adicionais executados em background via polling com idempotência:

1. **`CREATE_SONG`**: Criação automática de música no acervo local do Holyrics (com slides formatados, estrofes, coro, tom, artista) quando ela não existe no acervo local durante a sincronização de culto, retornando o ID gerado pelo Holyrics e salvando a vinculação no LouvorFlow.
2. **`GET_LYRICS_PLAYLIST`**: Consulta os itens atuais da playlist de letras do Holyrics para evitar duplicações desnecessárias.
3. **`ADD_LYRICS_TO_PLAYLIST` / `ADD_TO_PLAYLIST`**: Adiciona música à playlist ativa do Holyrics na ordem exata definida no repertório do evento do LouvorFlow.
4. **Idempotência por `command_id`**: Comandos repetidos ou reprocessados não causam duplicidade na playlist ou no banco de dados.
