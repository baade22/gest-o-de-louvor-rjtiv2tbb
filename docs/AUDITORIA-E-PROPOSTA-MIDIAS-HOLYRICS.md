# Relatório de Auditoria e Proposta Técnica: Integração Mídias LouvorFlow ↔ Holyrics

**Data da Auditoria:** Fevereiro de 2025  
**Ambiente:** LouvorFlow (Skip Cloud / PocketBase v0.36) + Holyrics Agent Windows (v0.0.31) + Holyrics v2.30.0  
**Objetivo:** Mapear o estado atual do módulo de mídias, avaliar a segurança de transferência para o PC local da igreja, analisar a API oficial do Holyrics e estruturar a proposta de implementação para a Etapa 2 sem quebrar o fluxo de músicas já validado.

---

## 1. (a) Estado Atual Real do Módulo Mídias no SaaS

### 1.1 Modelo de Dados (`media_assets`)

Criado na migração `pocketbase/migrations/0023_teams_tasks_medias_notifications.js` e espelhado em `src/lib/pocketbase/schema.json`:

- **Coleção:** `media_assets` (tipo: `base`)
- **Regras de Acesso:** `@request.auth.id != ''` para list, view, create, update, delete.
- **Campos existentes:**
  - `church_id`: relation → `churches` (obrigatório, cascadeDelete: true)
  - `event_id`: relation → `events` (obrigatório, cascadeDelete: true)
  - `name`: text (obrigatório) — nome amigável ou título do arquivo
  - `file`: file (armazenamento de arquivos nativo do PocketBase, limite de 100MB configurado: `104857600 bytes`)
  - `media_type`: select (`VIDEO`, `IMAGEM`, `AUDIO`, `DOCUMENTO`)
  - `category`: select (`AGENDA`, `ANIVERSARIANTES`, `AVISOS`, `CULTOS`, `EVENTOS`, `VIDEO_ESPECIAL`, `OUTROS`)
  - `size`: number (tamanho em bytes)
  - `duration`: number (duração em segundos para áudio/vídeo, opcional)
  - `uploaded_by`: relation → `church_members` (quem fez o upload)
  - `assigned_operator`: relation → `church_members` (operador de multimídia/projeção escalado)
  - `status`: select (`ENVIADA`, `RECEBIDA`, `BAIXADA`, `IMPORTADA_HOLYRICS`, `CONCLUIDA`)
  - `holyrics_status`: text (texto livre de rastreamento, ex.: `"IMPORTADO_MANUALMENTE"`)
  - `downloaded_at`: date (data/hora do download)
  - `downloaded_by`: relation → `church_members`
  - `imported_at`: date (data/hora da confirmação no Holyrics)
  - `imported_by`: relation → `church_members`
  - `created` / `updated`: autodate

### 1.2 Status e Transições Existentes vs. Fluxo Alvo

1. **Status no Banco:** Os 5 status citados pelo usuário (`ENVIADA`, `RECEBIDA`, `BAIXADA`, `IMPORTADA_HOLYRICS`, `CONCLUIDA`) **já existem** exatamente no schema do banco e são validados no hook `pocketbase/hooks/media_status.js`.
2. **Como funciona hoje (Manual):**
   - No upload (`uploadMediaAsset` em `src/services/media.ts`), o status é salvo como `ENVIADA` e o hook `/backend/v1/media/notify` cria notificação para o `assigned_operator`.
   - Na interface do SaaS (`src/pages/MediaModule.tsx` e `src/pages/EventScaleDetail.tsx`), o operador clica em "Baixar Mídia" (download pelo navegador) e manualmente clica em:
     - `Marcar como Baixada` → altera para `BAIXADA` (registra `downloaded_at` e `downloaded_by`).
     - `Importado no Holyrics` → altera para `IMPORTADA_HOLYRICS` (registra `imported_at` e `holyrics_status = "IMPORTADO_MANUALMENTE"`).
3. **Divergências em relação ao fluxo automático desejado:**
   - **Sem automação pelo Agent:** O Agent Windows não possui nenhum listener ou comando para arquivos de mídia. Os status `RECEBIDA` e `CONCLUIDA` nunca são definidos automaticamente pelo Agent.
   - **Sem fila de transferência:** Não há comando registrado na tabela `holyrics_commands` para acionar o download pelo computador local.
   - **Sem rastreamento de caminho local:** O SaaS não sabe em qual diretório o arquivo foi gravado no PC da igreja.

---

## 2. (b) Mecanismo Seguro de Download para o Agent

### 2.1 Autenticação Existente do Agent

- O Agent opera de forma **100% outbound** (sem portas abertas na rede da igreja para a internet).
- Comunicação feita via polling (`POST /backend/v1/agent/commands/poll`) e heartbeat (`POST /backend/v1/agent/heartbeat`).
- Autenticação via header `x-agent-token` contendo o token gerado no pareamento (armazenado com hash SHA-256 em `holyrics_agents.agent_token`).
- O Agent **não possui sessão de usuário** (não faz login com email/senha nem possui JWT de usuário).

### 2.2 O que falta para o download seguro de mídias pelo Agent

- Os arquivos do PocketBase (`/api/files/media_assets/...`) são protegidos pelas regras de `viewRule: "@request.auth.id != ''"`. Uma requisição direta do Agent sem token de usuário autenticado retornaria 403 Forbidden.
- **Mecanismo Recomendado e Seguro:**
  Criar o endpoint no backend:
  `GET /backend/v1/agent/media/{media_id}/download`
  - Autenticado por `x-agent-token` (ou token de autorização de transferência temporário emitido no payload do comando).
  - Valida rigorosamente se o `church_id` da mídia corresponde exatamente ao `church_id` do agente solicitante.
  - O hook faz streaming do arquivo diretamente do storage do PocketBase para a resposta HTTP, definindo `Content-Type`, `Content-Disposition` e `Content-Length`.
  - Nenhuma credencial ou URL sensível de terceiros é exposta em logs ou enviada em texto claro.

---

## 3. (c) Arquitetura do Agent e Componentes Existentes

### 3.1 Versão Real no Repositório

- `agent/package.json`: `"version": "0.0.31"`
- `agent/src/index.ts`: `"LouvorFlow Agent v0.0.31 — Holyrics Bridge"`
- `agent/src/server.ts`: `<span class="logo-badge">v0.0.31</span>`
- `src/buildZipScript.mjs`: gera `LouvorFlow-Agent-0.0.31.zip`
- `package.json` raiz: `"version": "0.0.33"`

### 3.2 Fila e Dispatcher de Comandos

- Fila no banco: `holyrics_commands` (ações atuais: `TEST_CONNECTION`, `SEARCH_SONG`, `ADD_TO_PLAYLIST`, `CREATE_SONG`, `GET_SONGS`, `GET_SONG_PLAYLIST`, `GET_LYRICS_PLAYLIST`, `ADD_LYRICS_TO_PLAYLIST`).
- Polling: a cada 2500ms (`config.pollIntervalMs`), o Agent consulta `/backend/v1/agent/commands/poll`.
- Execução: o método `executeCommand(cmd)` no `agent/src/agent.ts` despacha pelo `cmd.action` e reporta o resultado em `POST /backend/v1/agent/commands/{id}/result`.

### 3.3 Painel Local (`http://localhost:8765`)

- Implementado em `agent/src/server.ts` com Node.js nativo (`http`).
- Endpoints existentes:
  - `GET /api/status`
  - `POST /api/pair`
  - `POST /api/holyrics/test`
  - `POST /api/holyrics/diagnose-search`
  - `POST /api/config`
  - `GET /` (dashboard HTML com CSS responsivo)
- Onde adicionar a biblioteca de mídias:
  - Adicionar no arquivo `agent/src/config.ts` o campo `holyricsMediaPath` com valor padrão:
    `C:\Holyrics\Holyrics\files\media`
  - No painel HTML, adicionar seção "Biblioteca Local do Holyrics (Mídias)" com validação de pasta.

---

## 4. (d) Documentação Oficial do Holyrics (v2.30.0) e Reconhecimento de Arquivos

### 4.1 Consulta Real à Documentação Oficial

Consultamos a documentação oficial da API do Holyrics (`https://github.com/holyrics/API-Server/blob/main/README.md` e `README-en.md`):

- **Ações disponíveis para mídias na API Server:**
  - `GetFiles`: lista arquivos de uma aba (`video`, `image`, `audio`, `file`), aceita filtro e subpasta (`folder`).
  - `GetFile`: consulta metadados de um arquivo específico pelo nome/caminho relativo.
  - `PlayVideo`, `ShowImage`, `PlayAudio`, `ExecuteFile`: exibição e execução de mídias.
  - `GetMediaPlaylist`, `SetMediaPlaylistItem`, `AddToPlaylist`: manipulação de listas de reprodução.
- **Mecanismo de "Recarregar Biblioteca" / "Refresh":**
  - **NÃO EXISTE** nenhum endpoint como `ReloadFiles`, `RefreshMedia` ou `ImportMedia` na API Server do Holyrics.
  - A API do Holyrics não possui comando de recarregar diretórios do disco via HTTP.
- **Constatação Fundamental (Arquivo Gravado vs. Reconhecido):**
  1. O Holyrics desktop lê diretamente os diretórios físicos no disco:
     - Imagens: `files\media\image`
     - Vídeos: `files\media\video`
     - Áudios: `files\media\audio`
     - Apresentações automáticas: `files\media\automaticPresentations`
  2. Podemos usar a ação oficial **`GetFile`** ou **`GetFiles`** da API local do Holyrics (porta 8091) para **verificar se o arquivo gravado pelo Agent já está visível na API do Holyrics**!
     - Se `GetFile` responder com `status: "ok"`, o arquivo foi formalmente reconhecido pelo Holyrics.
     - Se não retornar de imediato, o status no SaaS deve ser `BAIXADA` (com nota "Arquivo gravado na pasta da biblioteca, aguardando indexação do Holyrics").

---

## 5. (e) Proposta Objetiva de Implementação

### 5.1 Novos Comandos na Fila (`holyrics_commands`)

- **Novo action:** `TRANSFER_MEDIA`
- **Payload:**
  ```json
  {
    "media_id": "abc123xyz",
    "church_id": "church_xyz",
    "event_id": "event_123",
    "name": "Avisos Domingo.mp4",
    "file_name": "avisos_domingo_20250220.mp4",
    "media_type": "VIDEO",
    "category": "AVISOS",
    "file_size": 15420000,
    "download_url": "/backend/v1/agent/media/abc123xyz/download",
    "target_subfolder": "video"
  }
  ```
- **Result do Agent:**
  ```json
  {
    "media_id": "abc123xyz",
    "status": "DONE",
    "file_name": "avisos_domingo_20250220.mp4",
    "target_path": "C:\\Holyrics\\Holyrics\\files\\media\\video\\avisos_domingo_20250220.mp4",
    "bytes_written": 15420000,
    "category": "AVISOS",
    "holyrics_detected": true,
    "holyrics_file_info": { "name": "avisos_domingo_20250220.mp4" }
  }
  ```

### 5.2 Fluxo de Execução no Agent (Segurança e Idempotência)

1. **Validação do Caminho:** Usa exclusivamente `config.holyricsMediaPath` definido localmente pelo operador. O SaaS **nunca** define caminhos absolutos do SO.
2. **Download Seguro em Arquivo Temporário:**
   - Cria pasta `agent/temp/`.
   - Baixa com streaming em arquivo temporário `.tmp_UUID`.
   - Valida tamanho real contra `file_size` e tipos MIME permitidos.
3. **Mapeamento de Subpastas:**
   - `IMAGEM` → `config.holyricsMediaPath\image\`
   - `VIDEO` → `config.holyricsMediaPath\video\`
   - `AUDIO` → `config.holyricsMediaPath\audio\`
4. **Política de Nomes e Anti-Sobrescrita:**
   - Se o arquivo de mesmo nome e mesmo tamanho já existir no destino: considera já transferido (idempotente).
   - Se o arquivo já existir com tamanho diferente: salva como `nome (1).ext` para evitar perda acidental.
5. **Renomeação Atômica:** Move de `temp/` para o destino definitivo. Remove o temporário imediatamente.
6. **Checagem no Holyrics:** Executa `GetFile` na API local (8091). Se confirmado, marca `holyrics_detected: true`.

---

## 6. (f) Riscos e O que Só Pode Ser Validado no PC Real da Igreja

1. **Permissões de Escrita do Windows:** Se o Holyrics estiver em pasta protegida (ex.: `C:\Program Files\Holyrics`), o Node.js pode receber `EACCES`. O painel do Agent deve validar permissão de escrita antes de aceitar o caminho.
2. **Caminho Customizado do Holyrics:** Usuários que instalaram em `D:\Holyrics` ou `%APPDATA%` necessitarão ajustar no painel `http://localhost:8765`.
3. **Tempo de Indexação da UI do Holyrics:** Como a API Server do Holyrics não possui endpoint de "reload", a interface gráfica do Holyrics pode necessitar de alternar de aba ou reabrir a pasta para listar o novo arquivo.
4. **Arquivos Grandes e Conexão Lenta:** Downloads de vídeos de 100MB podem sofrer timeout se a conexão da igreja oscilar. O Agent precisa de timeout adequado (ex.: 300s para 100MB) e limpeza de `.tmp` em caso de aborto.

---

## 7. (g) Ordem de Implementação para a Etapa 2 (1 Turno Atômico)

1. **Backend (PocketBase):**
   - Migração `0029`: adicionar action `TRANSFER_MEDIA` aos valores do select de `holyrics_commands`.
   - Hook `agent_media_download.js`: rota segura autenticada para o Agent baixar mídias da sua igreja.
   - Atualizar `agent_commands_result.js`: processar retorno de `TRANSFER_MEDIA` atualizando status da mídia para `BAIXADA` / `IMPORTADA_HOLYRICS`.
2. **Agent Local (TypeScript):**
   - Atualizar `types.ts`, `config.ts` e `server.ts` com configuração de caminho de mídia.
   - Implementar método `handleTransferMedia` no `agent.ts` com download atômico e validação.
   - Adicionar métodos `getFile` no `holyricsClient.ts`.
   - Bump versão do Agent para `0.0.32`.
   - Regenerar o ZIP distribuível via `src/buildZipScript.mjs`.
3. **Frontend (React):**
   - Em `MediaModule.tsx` e `EventScaleDetail.tsx`: botão "Sincronizar com Holyrics Local" e badges de status.
   - Atualizar card do Agent em `HolyricsAgentCard.tsx`.
