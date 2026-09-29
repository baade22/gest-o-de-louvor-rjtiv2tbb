# LouvorFlow Agent v0.0.15 — Holyrics Bridge

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
2. No terminal (Prompt de Comando ou PowerShell no Windows, Terminal no macOS/Linux), entre na pasta do Agent:
   ```bash
   cd agent
   ```
3. Instale as dependências (se necessário) ou execute diretamente:
   ```bash
   npm run build
   npm start
   ```
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
   - `GetTokenInfo`
5. No painel do Agent (`http://localhost:8765`), cole o token no campo correspondente e clique em **[Salvar Configurações]**.
6. Clique em **[Testar Conexão Holyrics]** para verificar se o status fica **🟢 Conectado (OK)**.

---

## 🎵 Enviar Músicas para a Playlist

1. No LouvorFlow, abra qualquer música cadastrada.
2. No topo, clique em **[Enviar para Holyrics]**.
3. O LouvorFlow enviará o comando ao Agent:
   - Se a música for encontrada exatamente uma vez: será **adicionada automaticamente** à playlist do Holyrics!
   - Se houver mais de uma versão correspondente: o LouvorFlow abrirá um diálogo para você **escolher a versão correta**.
   - Se não for encontrada: avisará com mensagem clara para cadastrá-la no Holyrics.
