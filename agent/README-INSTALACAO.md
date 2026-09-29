# 🚀 Guia de Instalação e Uso do LouvorFlow Agent v0.0.15

Este guia passo a passo foi preparado para permitir que qualquer operador de multimídia, som ou projeção instale e execute o **LouvorFlow Agent** no computador da igreja (onde está instalado o Holyrics).

---

## 📋 Pré-requisitos

1. **Computador com Windows, macOS ou Linux** onde o software **Holyrics v2+** está instalado.
2. **Node.js 18 ou superior**:
   - Para verificar se já está instalado, abra o Prompt de Comando (cmd) ou PowerShell e digite:
     ```bash
     node -v
     ```
   - Se não estiver instalado ou for menor que 18, baixe e instale a versão **LTS** em: [https://nodejs.org](https://nodejs.org) (basta avançar com "Next" até concluir).
3. **Holyrics aberto e configurado**:
   - Abra o Holyrics no computador da igreja.
   - Acesse: **Menu Arquivo → Configurações → API Server**.
   - Marque a opção para **Ativar API Server**.
   - Certifique-se de que a porta está configurada para **8091** (padrão).
   - Em **Gerenciar Tokens**, crie um token de acesso com permissão para:
     - `SearchSong` (ou `SearchLyrics`)
     - `AddLyricsToPlaylist` (ou `AddToPlaylist`)
     - `GetTokenInfo`
   - Copie esse token gerado.

---

## 📥 Como Descompactar e Iniciar o Agent

1. Descompacte o arquivo `LouvorFlow-Agent-0.0.15.zip` em uma pasta de sua preferência (por exemplo: `C:\LouvorFlow-Agent` ou na Área de Trabalho).
2. Abra o terminal na pasta descompactada:
   - **No Windows:** Abra a pasta, segure `Shift`, clique com o botão direito do mouse em um espaço vazio e escolha **"Abrir na janela do PowerShell"** (ou **"Abrir no Terminal"**).
3. Como os arquivos compilados já estão na pasta `dist/`, você pode iniciar diretamente com:

   ```bash
   npm start
   ```

   _(Caso queira compilar a partir do código-fonte TypeScript em `src/`, basta rodar `npm install`, depois `npm run build` e em seguida `npm start`)._

4. Ao iniciar, o terminal mostrará:
   ```text
   ====================================================
         LouvorFlow Agent v0.0.15 — Holyrics Bridge
   ====================================================
   [Agent Web] Painel local disponível em http://localhost:8765
   [Agent] Serviço iniciado.
   ```

---

## 🌐 Configuração pelo Painel Web Local

Abra o seu navegador de internet (Chrome, Edge, Firefox) e acesse:
👉 **`http://localhost:8765`**

### 1. Configurar o Holyrics Local

1. No painel aberto em `http://localhost:8765`, role até **"Configurações Locais do Holyrics"**.
2. Verifique se o **Host** é `127.0.0.1` e a **Porta** é `8091`.
3. No campo **"Token de Acesso do Holyrics"**, cole o token que você copiou das configurações do Holyrics.
4. Clique em **[Salvar Configurações]**.
5. Clique em **[Testar Conexão Holyrics]**. A caixa de status mudará para **🟢 Conectada (OK)**.

### 2. Diagnóstico de Busca (SearchSong)

No painel local, utilize a seção **"Diagnóstico de Busca (SearchSong)"**:

- Digite o título de uma música (ex.: `Oceanos` ou `Jesus em tua presença`) e clique em **[Diagnosticar SearchSong]**.
- O Agent fará uma chamada HTTP real à porta 8091 do Holyrics e mostrará em tempo real:
  - **Endpoint utilizado** (sem expor o token de acesso).
  - **Método HTTP** (POST) e payload enviado.
  - **Status HTTP** retornado (ex: 200).
  - **Tempo de resposta** (em milissegundos).
  - **Quantidade de resultados** encontrados no banco de dados do Holyrics.
  - **JSON bruto** retornado pelo Holyrics.
- **Segurança:** O token de acesso NUNCA aparece na interface do diagnóstico nem nos registros de log no console.

### 3. Parear com o LouvorFlow

1. No navegador, acesse o LouvorFlow SaaS da sua igreja:
   - Vá em **Configurações → Integrações → Holyrics**.
   - No bloco do **Holyrics Local Agent**, clique em **[Conectar computador]**.
   - Um código de **6 dígitos** será gerado (ex: `847 291`), válido por 10 minutos.
2. Volte ao painel local do Agent (`http://localhost:8765`).
3. No bloco **"Conectar ao LouvorFlow (Pareamento)"**, digite o código de 6 dígitos.
4. Clique em **[Conectar]**.
5. O painel mostrará a mensagem de sucesso e o status passará para **🟢 Conectado ao LouvorFlow**.
6. No sistema LouvorFlow, a tela de integrações passará a mostrar o computador como **🟢 Computador Conectado**.

---

## 🎵 Pronto para Usar!

Agora você pode enviar músicas diretamente do LouvorFlow para a playlist do Holyrics:

- Abra qualquer música no LouvorFlow.
- Clique no botão **[Enviar para Holyrics]**.
- O LouvorFlow se comunica com o Agent local da igreja e a música é colocada na playlist do Holyrics em segundos!

---

## 🔒 Segurança e Privacidade

- O LouvorFlow **nunca** acessa o IP da igreja e **não** exige portas abertas no roteador. Toda a comunicação é feita com requisições seguras de saída (HTTPS) originadas do próprio computador da igreja.
- O Token do Holyrics é armazenado exclusivamente no arquivo local `agent.config.json` e **nunca** é enviado aos servidores do LouvorFlow.
