# LouvorFlow

Gestão do ministério de louvor para várias igrejas: cultos e roteiro, escalas, repertório com cifras e tom, tarefas e mídias das equipes técnicas, convites de membros e envio direto para o **Holyrics** no computador da projeção.

## Como o projeto está dividido

| Parte | Pasta | Tecnologia | Papel |
|---|---|---|---|
| Site | `src/` | React 19, Vite, TypeScript, Tailwind, shadcn/ui | As telas que líderes, músicos e equipes usam |
| Servidor | `pocketbase/` | PocketBase (migrações e hooks em JavaScript) | Dados, regras de acesso e rotas próprias em `/backend/v1/...` |
| Agent | `agent/` | Node.js + TypeScript | Roda no PC da igreja e leva músicas e mídias até o Holyrics |

Todos os dados levam `church_id`, que separa uma igreja da outra.

### Site (`src/`)

- `pages/`: uma tela por rota. A Central do Culto fica em `pages/EventScaleDetail.tsx` e nas partes em `pages/event-center/` (visão geral, roteiro, repertório, equipe, mídias e tarefas).
- `components/`: layout, diálogos compartilhados (`ConfirmDialog` e `useConfirm`) e componentes de `ui/` (shadcn).
- `lib/`: regras puras e testadas, como transposição (`transposition.ts`), prontidão do culto (`eventReadiness.ts`), roteiro (`runSheet.ts`) e nomes de mídia (`mediaNaming.ts`).
- `services/`: chamadas ao PocketBase e às rotas `/backend/v1`.

### Servidor (`pocketbase/`)

- `migrations/`: o esquema do banco, em ordem numérica. Toda mudança de coleção entra como uma migração nova, com o caminho de volta (down).
- `hooks/`: as rotas próprias, como permissões, convites, tarefas, mídias e toda a ponte com o Holyrics. Elas validam se quem chama é membro ativo da igreja.

Ao rodar o PocketBase localmente, os hooks precisam ter a extensão `.pb.js`. Copie a pasta renomeando os arquivos e passe-a em `--hooksDir`.

### Agent (`agent/`)

O Holyrics fica atrás do roteador da igreja, então o Agent só faz conexões de saída:

1. Em **Integrações → Computadores conectados**, um administrador gera um código de 6 dígitos.
2. No PC do Holyrics, o Agent (painel em `http://localhost:8765`) recebe o código e faz o pareamento.
3. Daí em diante, o Agent consulta a fila de comandos (`holyrics_commands`), executa cada um na API local do Holyrics (`127.0.0.1:8091`) e devolve o resultado.

A senha do Holyrics fica só no PC da igreja. O pacote para download (`public/LouvorFlow-Agent-<versão>.zip` e `public/LouvorFlow-Agent.zip`) é gerado por `src/buildZipScript.mjs` antes de cada build, usando a versão de `agent/package.json`. Detalhes de instalação estão em [`agent/README-INSTALACAO.md`](agent/README-INSTALACAO.md).

## Desenvolvimento

Requisitos: Node.js 18+ e pnpm.

```bash
pnpm install --frozen-lockfile
# o .env do repositório já aponta VITE_POCKETBASE_URL para o servidor
pnpm dev                # site em http://localhost:5173
```

| Comando | O que faz |
|---|---|
| `pnpm test` | Roda os testes (Vitest) |
| `pnpm lint` | Lint com oxlint |
| `pnpm format` | Formata com oxfmt |
| `pnpm exec tsc -p tsconfig.app.json --noEmit` | Checa os tipos do site |
| `pnpm build` | Gera o pacote do Agent e o build do site em `dist/` |
| `pnpm build:agent` | Compila o Agent em `agent/dist/` |

Os testes também regeram os zips do Agent em `public/`. Se não houve mudança no Agent, desfaça com `git checkout public/`.

## Fluxo de trabalho

Toda mudança vai num branch próprio, com pull request para revisão antes de entrar no `main`.
