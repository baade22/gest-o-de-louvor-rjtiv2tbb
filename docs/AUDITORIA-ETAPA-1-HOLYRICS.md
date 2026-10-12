# RELATÓRIO DE AUDITORIA — ETAPA 1 (LouvorFlow x Holyrics 2.30.0)

**Versões auditadas:** SaaS LouvorFlow 0.0.45 | Holyrics Agent 0.0.37  
**Data:** Março / 2025  
**Objetivo:** Mapeamento completo dos fluxos de cultos, playlist de músicas e mídias, fila de comandos do Agent, permissões, verificações de resultado e testes antes da migração para `POST /api/AddToPlaylist?token=...` como endpoint único oficial de playlist.

---

## SEÇÃO A: MAPA DOS FLUXOS EXISTENTES

### 1. Cultos e Eventos (SaaS ↔ Holyrics)

- **Criação/Edição no Frontend:**
  - `src/pages/EventForm.tsx` (linhas 96–135): cria ou edita registro na coleção `events` do PocketBase via SDK cliente (`pb.collection('events').create(...)` ou `update(...)`).
  - Campos manipulados pelo formulário: `church_id`, `title`, `date`, `start_time`, `end_time`, `description`, `status`. O formulário **não toca em `holyrics_event_id`** e não chama nenhum endpoint de sincronização no ato do save do culto.
- **Integração no Backend / Agent:**
  - **Não há chamadas a `CreateEvent` ou `EditEvent`** em nenhum arquivo do Agent (`agent/src/`) nem nos hooks (`pocketbase/hooks/`). A busca por `CreateEvent`, `EditEvent` e `GetSchedules` no código confirma que esses endpoints do Holyrics ainda não estão integrados nem no Agent nem no SaaS.
- **Persistência do ID do Evento no Holyrics:**
  - **Schema do PocketBase:** A coleção `events` **já possui o campo `holyrics_event_id: text`** (criado na migration `pocketbase/migrations/0023_teams_tasks_medias_notifications.js` e confirmado via `db_describe_object('events')`).
  - **Uso atual:** `saas_holyrics_sync_media_playlist.js` (linhas 137–139) lê `event.get('holyrics_event_id')` ou fallback para `eventId` do SaaS:
    ```javascript
    const holyricsEventId = (event.get('holyrics_event_id') || '').trim() || eventId
    ```
    Isso evidencia a raiz do erro conhecido: quando `holyrics_event_id` está vazio, o sistema envia o ID do SaaS para o Holyrics, gerando `Event not found`.

---

### 2. Inclusão na Playlist (Músicas e Mídias)

- **Chamadas Atuais à API do Holyrics:**
  - `agent/src/holyricsClient.ts`:
    - Linha 677: `addLyricsToPlaylist(item: { song_id: string; event_id?: string })` → chama `POST /api/AddLyricsToPlaylist` com payload:
      ```json
      { "item": { "type": "song", "id": "<song_id>" }, "event_id": "<event_id>" }
      ```
    - Linha 710: `addToPlaylist(data: { items: Array<{ type: string; id?: string; name?: string }>; event_id?: string; index?: number; ignore_duplicates?: boolean })` → chama `POST /api/AddToPlaylist` com payload montado:
      ```json
      { "items": data.items, "event_id": data.event_id, "index": data.index, "ignore_duplicates": data.ignore_duplicates }
      ```
- **Quem obtém o ID da música:**
  - O hook `pocketbase/hooks/saas_holyrics_sync_event.js` (linhas 770–825): busca o registro da música em `songs` (`song.get('holyrics_song_id')`). Se não existir, faz busca local/criação via `SEARCH_SONG` / `CREATE_SONG` e salva o ID retornado em `songs.holyrics_song_id`.
- **Quem enfileira o comando de playlist:**
  - `saas_holyrics_sync_event.js` (linhas 815–845): cria comando com `action: 'ADD_TO_PLAYLIST'`, payload:
    ```javascript
    {
      action: 'ADD_TO_PLAYLIST',
      payload: {
        song_id: holyricsSongId,
        event_id: holyricsEventId, // lê event.get('holyrics_event_id') ou fallback para eventId do SaaS!
        church_id: churchId,
        song_title: song.get('title')
      }
    }
    ```
  - `agent/src/agent.ts` (linhas 620–648): ao receber `action === 'ADD_TO_PLAYLIST'`, ele chamava historicamente `client.addLyricsToPlaylist({ song_id: payload.song_id, event_id: payload.event_id })` (embora `client.addToPlaylist` já exista implementado em `holyricsClient.ts`).
  - Para mídias: `saas_holyrics_sync_media_playlist.js` enfileira `action: 'SYNC_MEDIA_PLAYLIST'`. O Agent em `agent/src/agent.ts` (linhas 652–695) chama `client.addToPlaylist(...)` enviando os itens de mídia com `name`, `type` e `event_id`.

---

### 3. Mídias

- **Coleção:** `media_assets` (PocketBase).
- **Campos:** `church_id`, `event_id`, `title`, `file_name`, `file`, `category`, `presentation_order`, `sync_status` (`PENDING | TRANSFERRING | TRANSFERRED | FAILED`), `transferred_at`, `holyrics_file_path`, `error_message`.
- **Estados Operacionais:**
  - No SaaS: `PENDING` (cadastrada) → `TRANSFERRING` (enviando ao Agent) → `TRANSFERRED` (transferida para a máquina do Agent via stream chunk) → `FAILED`.
  - **Falta de estado intermediário no banco:** O banco hoje não tem o estado `RECOGNIZED` ou `IN_PLAYLIST` explícito em `sync_status`. O hook `saas_holyrics_sync_media_playlist.js` valida se `sync_status === 'TRANSFERRED'` antes de incluir na playlist, mas não há transição de estado após o sucesso do `AddToPlaylist`.
- **Ordem de Apresentação:**
  - Representada pelo campo `presentation_order: number` em `media_assets`.
  - No hook `saas_holyrics_sync_media_playlist.js` (linha 115), os itens são ordenados via `pb.collection('media_assets').getFullList({ filter: ..., sort: '+presentation_order' })`.
  - No payload enviado ao Holyrics pelo Agent: `index: -1` é enviado para anexar ao fim, ou montado respeitando a ordem do array `items`.

---

### 4. Fila de Comandos do Agent

- **Coleção:** `holyrics_commands`.
- **Campos:** `command_id` (UUID único), `church_id`, `agent_id`, `action`, `payload` (JSON), `status` (`PENDING | SENT | DONE | FAILED | EXPIRED`), `result` (JSON), `error`, `created_at`, `executed_at`.
- **Fluxo:**
  1. Hooks do PocketBase criam o registro com `status: 'PENDING'`.
  2. Agent faz long-polling a cada 2s (`GET /api/holyrics-agent/commands/pending?agent_id=...&token=...`) implementado em `pocketbase/hooks/agent_commands_poll.js`.
  3. Ao ler o comando, o status muda para `SENT`.
  4. Agent processa e envia resultado para `POST /api/holyrics-agent/commands/result` (`pocketbase/hooks/agent_commands_result.js`), que atualiza para `DONE` ou `FAILED`.
- **Idempotência:**
  - Garantida por `command_id` único no PocketBase e verificação prévia no hook antes de reprocessar.

---

### 5. Permissões, Isolamento e Token do Holyrics

- **Permissões Backend:**
  - `saas_holyrics_sync_event.js` e `saas_holyrics_sync_media_playlist.js` validam o usuário autenticado via `@request.auth.id`, garantindo papel `MASTER`, `ADMIN` ou permissão `PROJECAO` na respectiva igreja (`church_members`).
  - Cada comando é estritamente isolado por `church_id` e `agent_id`.
- **Segurança do Token do Holyrics:**
  - O token da API do Holyrics (`holyrics_token` / `api_token`) **reside exclusivamente no arquivo local `agent.config.json` da máquina onde o Agent roda**.
  - **Auditoria de vazamento:** Nenhum token do Holyrics é armazenado no PocketBase, enviado nos payloads do SaaS, nem retornado em respostas HTTP. O Agent usa o token localmente ao despachar requisições para `http://127.0.0.1:8091`.

---

### 6. Verificação de Resultado (HTTP 200 ≠ Sucesso)

- **Status atual:**
  - O `holyricsClient.ts` (linhas 130–165) verifica se a resposta contém `status === 'error'` mesmo quando o HTTP é 200.
  - **Ponto fraco:** Não há confirmação ativa pós-operação (não se consulta `GetPlaylist` para checar se a música/mídia realmente entrou, nem `GetSchedules` para verificar se o evento existe antes de enviar). O sistema confia na ausência do erro na resposta do `AddToPlaylist`.

---

### 7. Cobertura de Testes

- Existem testes unitários para nomes de mídias (`mediaPlaylistNaming.test.ts`), parser de músicas, geração de slides e reconexão.
- **Lacunas sem cobertura:**
  - Não há teste de integração com chamadas reais ou mockadas de `GetSchedules`.
  - Não há teste unitário validando a resposta `{"status":"error", "message":"Event not found"}` quando o `event_id` está incorreto.
  - Não há teste cobrindo a transição de estado da mídia de `TRANSFERRED` para `IN_PLAYLIST`.

---

## SEÇÃO B: PROBLEMAS ENCONTRADOS E DIAGNÓSTICO

| ID     | Problema                                                     | Causa Raiz                                                                                                             | Evidência (Arquivo:Linha)                                                                                                                | Alteração Estritamente Necessária                                                                                                  |
| ------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | --- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | Erro `Event not found` no Holyrics ao incluir músicas/mídias | O SaaS envia o ID do culto do LouvorFlow como `event_id` para o Holyrics quando `events.holyrics_event_id` está vazio. | `saas_holyrics_sync_media_playlist.js:138` e `saas_holyrics_sync_event.js:817`: `const holyricsEventId = (event.get('holyrics_event_id') |                                                                                                                                    | '').trim() |     | eventId;` | Nunca enviar o ID do SaaS como `event_id`. Criar rotina de resolução do ID real do Holyrics via `GetSchedules` ou vincular o culto ao evento real do Holyrics persistindo em `events.holyrics_event_id`. |
| **P2** | Divergência de endpoints para inclusão na playlist           | Músicas usavam `AddLyricsToPlaylist` (legado) no Agent, enquanto mídias usavam `AddToPlaylist`.                        | `agent/src/agent.ts:622`: `await client.addLyricsToPlaylist(...)` vs `holyricsClient.ts:710`.                                            | Unificar a inclusão de músicas no Agent para chamar `client.addToPlaylist({ items: [{ type: 'song', id: ... }], event_id: ... })`. |
| **P3** | Ausência de integração com `GetSchedules`                    | O Agent não consulta a agenda do Holyrics para saber quais `event_id` existem no mês/ano do culto.                     | `agent/src/holyricsClient.ts`: método `getSchedules` não existe ou não está mapeado.                                                     | Adicionar `getSchedules({ month, year })` ao `holyricsClient.ts` com payload estritamente mínimo.                                  |
| **P4** | Confiança cega em HTTP 200 sem confirmação de playlist       | Se a API do Holyrics retornar 200 com mensagem não mapeada ou se o item não for inserido, o SaaS assume sucesso.       | `agent/src/agent.ts:640` e hooks de resultado.                                                                                           | Implementar checagem defensiva pós-inserção ou validação rigorosa do payload de resposta.                                          |

---

## SEÇÃO C: PLANO DE MUDANÇAS RECOMENDADO

### Ordem de Execução Recomendada (Etapa 2 em diante):

1. **Banco de Dados (PocketBase):**
   - **NENHUMA MIGRAÇÃO NOVA É NECESSÁRIA PARA O EVENTO:** O campo `holyrics_event_id` já existe na coleção `events`.
   - Opcional futuro: caso deseje rastrear status granular da sincronização do evento, os campos de diagnóstico podem ser colocados na coleção `holyrics_sync_logs` (que já possui campo `details: json`), sem alterar o schema da tabela `events`.

2. **Agent Local (`agent/src/`):**
   - No `holyricsClient.ts`:
     - Adicionar `getSchedules(params: { month: number; year: number })` chamando `POST /api/GetSchedules?token=...` com payload `{ month, year }`.
     - Garantir que `addToPlaylist` use o payload padrão homologado:
       - Músicas: `{"items":[{"type":"song","id":"..."}],"event_id":"..."}`
       - Mídias: `{"items":[{"type":"image|video|audio","name":"..."}],"event_id":"...","index":-1,"ignore_duplicates":true}`
   - No `agent.ts`:
     - Tratar `ADD_TO_PLAYLIST` chamando diretamente `client.addToPlaylist`.
     - Suportar ação de consulta de eventos `GET_SCHEDULES` para sincronizar os IDs de eventos do Holyrics.

3. **Backend / Hooks do PocketBase (`pocketbase/hooks/`):**
   - Em `saas_holyrics_sync_event.js` e `saas_holyrics_sync_media_playlist.js`:
     - **Remover o fallback de usar o ID do SaaS como `event_id` do Holyrics.** Se `event.get('holyrics_event_id')` estiver em branco, disparar busca do evento correspondente via agenda ou retornar instrução de mapeamento antes de enviar `event_id` inválido.
     - Montar comando `ADD_TO_PLAYLIST` com o formato único.

4. **Frontend (`src/`):**
   - Em `EventScaleDetail.tsx`:
     - Exibir o status de vinculação do evento com o Holyrics (se `holyrics_event_id` está preenchido ou pendente).
     - Permitir selecionar/vincular um evento do Holyrics caso não esteja associado.

5. **Testes Automatizados:**
   - Adicionar testes unitários no Agent para:
     - Formatação dos payloads de `addToPlaylist` para músicas e mídias.
     - Tratamento de erro quando `event_id` for rejeitado pelo Holyrics (`Event not found`).
     - Chamada a `getSchedules` com payload `{ month, year }`.

6. **Testes Reais no Holyrics:**
   - Validar em ambiente real:
     1. Chamada a `GetSchedules` obtendo a lista de eventos.
     2. Inclusão de música via `AddToPlaylist` usando o `event_id` real.
     3. Inclusão de mídia via `AddToPlaylist` usando o mesmo `event_id`.

---

## SEÇÃO D: RISCOS E O QUE NÃO DEVE SER ALTERADO

1. **Sincronização Musical Homologada (NÃO MEXER NA BASE):**
   - O fluxo de pesquisa e pareamento de músicas (`SearchSong` com payload `{ text }` estritamente mínimo e `CREATE_SONG`) está funcionando perfeitamente e homologado. Nenhuma modificação deve ser feita no método `searchSong` ou na lógica de criação de cifras/slides.
2. **Segurança do Token do Holyrics (ISOLAMENTO TOTAL):**
   - O token da API local do Holyrics não deve ser transferido para o banco de dados nem exposto nas rotas da API do PocketBase. Deve continuar exclusivamente no `agent.config.json` local.
3. **Decodificação de Caracteres no PocketBase (Goja):**
   - Manter rigorosamente a decodificação UTF-8 multibyte em todos os hooks do PocketBase v0.36.
4. **Validação de Igreja e Permissões:**
   - As checagens de autorização em `church_members` (papéis `MASTER`, `ADMIN` e permissão `PROJECAO`) nos hooks não devem ser afrouxadas.
