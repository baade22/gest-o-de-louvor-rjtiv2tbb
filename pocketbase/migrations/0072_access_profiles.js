// Migração 0072: perfis de acesso no estilo do Eklesia (pedido do Pedro, 2026-10-28).
//
// Até aqui o acesso vinha de um papel (MASTER/ADMIN/LIDER/MUSICO) + funções fixas
// (operational_roles). Agora o MASTER monta PERFIS com nome (Pastor, Financeiro, EBD...),
// cada um com chaves `modulo.tela.acao` (Consultar, Novo, Alterar, Excluir e ações
// especiais) e as congregações em que vale. A pessoa recebe um ou mais perfis e os
// acessos somam. Catálogo das chaves: src/lib/accessCatalog.ts.
//
// Esta migração:
//   1. cria a coleção access_profiles (só o MASTER cria/altera; quem gere pessoas lê);
//   2. acrescenta em church_members: access_profiles (ids), permissions (chaves somadas)
//      e cong_membresia / cong_eventos / cong_financeiro (congregações por módulo, '*' =
//      todas). Quem grava esses campos é o hook church_members_access.js, sempre;
//   3. acrescenta access_profiles em invitations (o convite já leva os perfis);
//   4. cria os perfis prontos em cada igreja (um para cada função de hoje + Pastor e
//      Contador como exemplo);
//   5. converte cada pessoa: papel + funções de hoje viram os perfis equivalentes, então
//      ninguém ganha nem perde acesso na troca.
// As regras das coleções passam a conferir as chaves na migração 0073.

// BEGIN SYSTEM_PROFILES (conferido em src/lib/accessCatalog.test.ts)
const SYSTEM_PROFILES = [
  {
    system_key: 'ADMIN',
    name: 'Administrador do louvor',
    description:
      'Gere a equipe do louvor, músicas, cultos, escalas, integrações e configurações. Não vê financeiro nem membresia.',
    is_system: true,
    permissions: [
      'louvor.musicas.ver',
      'louvor.musicas.novo',
      'louvor.musicas.alterar',
      'louvor.musicas.excluir',
      'louvor.cultos.ver',
      'louvor.cultos.novo',
      'louvor.cultos.alterar',
      'louvor.cultos.excluir',
      'louvor.escalas.ver',
      'louvor.escalas.novo',
      'louvor.escalas.alterar',
      'louvor.escalas.excluir',
      'louvor.repertorio.ver',
      'louvor.repertorio.novo',
      'louvor.repertorio.alterar',
      'louvor.repertorio.excluir',
      'louvor.minhas_escalas.ver',
      'louvor.minhas_escalas.confirmar',
      'louvor.tarefas.ver',
      'louvor.tarefas.novo',
      'louvor.tarefas.alterar',
      'louvor.tarefas.excluir',
      'culto.som.ver',
      'culto.som.alterar',
      'culto.projecao.ver',
      'culto.projecao.alterar',
      'culto.midias.ver',
      'culto.midias.novo',
      'culto.midias.alterar',
      'culto.midias.excluir',
      'culto.midias.enviar',
      'culto.iluminacao.ver',
      'culto.iluminacao.alterar',
      'culto.computadores.ver',
      'culto.computadores.excluir',
      'culto.computadores.enviar',
      'culto.computadores.parear',
      'admin.pessoas.ver',
      'admin.pessoas.novo',
      'admin.pessoas.alterar',
      'admin.pessoas.excluir',
      'admin.funcoes.ver',
      'admin.funcoes.novo',
      'admin.funcoes.alterar',
      'admin.funcoes.excluir',
      'admin.integracoes.ver',
      'admin.integracoes.alterar',
      'admin.configuracoes.ver',
      'admin.configuracoes.alterar',
    ],
  },
  {
    system_key: 'LIDER',
    name: 'Líder de louvor',
    description: 'Cria cultos, repertórios e escalas. Não gere usuários nem configurações.',
    is_system: true,
    permissions: [
      'louvor.musicas.ver',
      'louvor.musicas.novo',
      'louvor.musicas.alterar',
      'louvor.musicas.excluir',
      'louvor.cultos.ver',
      'louvor.cultos.novo',
      'louvor.cultos.alterar',
      'louvor.cultos.excluir',
      'louvor.escalas.ver',
      'louvor.escalas.novo',
      'louvor.escalas.alterar',
      'louvor.escalas.excluir',
      'louvor.repertorio.ver',
      'louvor.repertorio.novo',
      'louvor.repertorio.alterar',
      'louvor.repertorio.excluir',
      'louvor.minhas_escalas.ver',
      'louvor.minhas_escalas.confirmar',
      'louvor.tarefas.ver',
      'louvor.tarefas.novo',
      'louvor.tarefas.alterar',
      'louvor.tarefas.excluir',
      'culto.som.ver',
      'culto.projecao.ver',
      'culto.midias.ver',
      'culto.midias.novo',
      'culto.midias.alterar',
      'culto.midias.excluir',
      'culto.midias.enviar',
      'culto.iluminacao.ver',
      'culto.computadores.ver',
      'culto.computadores.enviar',
      'culto.computadores.parear',
      'admin.pessoas.ver',
      'admin.funcoes.ver',
    ],
  },
  {
    system_key: 'MUSICO',
    name: 'Músico',
    description: 'Vê as músicas e confirma as próprias escalas.',
    is_system: true,
    permissions: [
      'louvor.musicas.ver',
      'louvor.repertorio.ver',
      'louvor.minhas_escalas.ver',
      'louvor.minhas_escalas.confirmar',
    ],
  },
  {
    system_key: 'SOM',
    name: 'Som',
    description: 'Vê músicas e o culto; cuida do som.',
    is_system: true,
    permissions: [
      'louvor.musicas.ver',
      'louvor.cultos.ver',
      'louvor.repertorio.ver',
      'louvor.minhas_escalas.ver',
      'louvor.minhas_escalas.confirmar',
      'culto.som.ver',
      'culto.som.alterar',
    ],
  },
  {
    system_key: 'PROJECAO',
    name: 'Projeção',
    description: 'Vê músicas, letras, mídias e o culto; cuida da projeção.',
    is_system: true,
    permissions: [
      'louvor.musicas.ver',
      'louvor.cultos.ver',
      'louvor.repertorio.ver',
      'louvor.minhas_escalas.ver',
      'louvor.minhas_escalas.confirmar',
      'culto.projecao.ver',
      'culto.projecao.alterar',
      'culto.midias.ver',
      'culto.midias.enviar',
    ],
  },
  {
    system_key: 'MIDIA',
    name: 'Mídia',
    description: 'Vê músicas e o painel do culto; só inclui e exclui mídias.',
    is_system: true,
    permissions: [
      'louvor.musicas.ver',
      'louvor.cultos.ver',
      'louvor.repertorio.ver',
      'louvor.minhas_escalas.ver',
      'louvor.minhas_escalas.confirmar',
      'louvor.tarefas.ver',
      'louvor.tarefas.novo',
      'culto.midias.ver',
      'culto.midias.novo',
      'culto.midias.alterar',
      'culto.midias.excluir',
      'culto.midias.enviar',
    ],
  },
  {
    system_key: 'ILUMINACAO',
    name: 'Iluminação',
    description: 'Vê o culto; cuida da iluminação.',
    is_system: true,
    permissions: [
      'louvor.cultos.ver',
      'louvor.repertorio.ver',
      'louvor.minhas_escalas.ver',
      'louvor.minhas_escalas.confirmar',
      'culto.iluminacao.ver',
      'culto.iluminacao.alterar',
    ],
  },
  {
    system_key: 'FINANCEIRO',
    name: 'Financeiro',
    description: 'Tesouraria: lança, concilia, fecha o mês e responde ao conselho fiscal.',
    is_system: true,
    permissions: [
      'financeiro.painel.ver',
      'financeiro.lancamentos.ver',
      'financeiro.lancamentos.novo',
      'financeiro.lancamentos.alterar',
      'financeiro.contagem.ver',
      'financeiro.contagem.novo',
      'financeiro.contagem.alterar',
      'financeiro.contagem.aprovar',
      'financeiro.contas_pagar.ver',
      'financeiro.contas_pagar.novo',
      'financeiro.contas_pagar.alterar',
      'financeiro.contas_pagar.baixa',
      'financeiro.conciliacao.ver',
      'financeiro.conciliacao.alterar',
      'financeiro.fluxo.ver',
      'financeiro.campanhas.ver',
      'financeiro.campanhas.novo',
      'financeiro.campanhas.alterar',
      'financeiro.orcamento.ver',
      'financeiro.orcamento.alterar',
      'financeiro.fechamento.ver',
      'financeiro.fechamento.fechar',
      'financeiro.auditoria.ver',
      'financeiro.auditoria.responder',
      'financeiro.relatorios.ver',
      'financeiro.relatorios.exportar',
      'financeiro.contribuintes.ver',
      'financeiro.contribuintes.novo',
      'financeiro.contribuintes.alterar',
      'financeiro.cadastros.ver',
      'financeiro.cadastros.novo',
      'financeiro.cadastros.alterar',
      'financeiro.cadastros.excluir',
    ],
  },
  {
    system_key: 'AUDITOR',
    name: 'Auditoria (conselho fiscal)',
    description: 'Vê todo o financeiro e audita, sem lançar.',
    is_system: true,
    permissions: [
      'financeiro.painel.ver',
      'financeiro.lancamentos.ver',
      'financeiro.contagem.ver',
      'financeiro.contas_pagar.ver',
      'financeiro.conciliacao.ver',
      'financeiro.fluxo.ver',
      'financeiro.campanhas.ver',
      'financeiro.orcamento.ver',
      'financeiro.fechamento.ver',
      'financeiro.auditoria.ver',
      'financeiro.auditoria.auditar',
      'financeiro.relatorios.ver',
      'financeiro.relatorios.exportar',
      'financeiro.contribuintes.ver',
      'financeiro.cadastros.ver',
    ],
  },
  {
    system_key: 'MEMBRESIA',
    name: 'Secretaria (membresia)',
    description: 'Cadastra e acompanha os membros; cuida dos eventos da igreja.',
    is_system: true,
    permissions: [
      'membresia.pessoas.ver',
      'membresia.pessoas.novo',
      'membresia.pessoas.alterar',
      'membresia.pessoas.excluir',
      'membresia.pessoas.situacao',
      'membresia.familias.ver',
      'membresia.familias.novo',
      'membresia.familias.alterar',
      'membresia.familias.excluir',
      'membresia.painel.ver',
      'membresia.painel.parabens',
      'membresia.cadastros.ver',
      'membresia.cadastros.novo',
      'membresia.cadastros.excluir',
      'membresia.cadastros.aprovar',
      'membresia.acompanhamento.ver',
      'membresia.acompanhamento.alterar',
      'membresia.grupos.ver',
      'membresia.grupos.novo',
      'membresia.grupos.alterar',
      'membresia.grupos.excluir',
      'membresia.documentos.ver',
      'membresia.documentos.emitir',
      'membresia.relatorios.ver',
      'membresia.relatorios.exportar',
      'eventos.eventos.ver',
      'eventos.eventos.novo',
      'eventos.eventos.alterar',
      'eventos.eventos.excluir',
      'eventos.inscricoes.ver',
      'eventos.inscricoes.novo',
      'eventos.inscricoes.alterar',
      'eventos.inscricoes.excluir',
      'eventos.pagamentos.ver',
      'eventos.pagamentos.baixa',
      'eventos.checkin.ver',
      'eventos.checkin.fazer',
    ],
  },
  {
    system_key: 'EVENTOS',
    name: 'Eventos',
    description: 'Eventos da igreja: inscrições, pagamentos e check-in, sem ver a membresia.',
    is_system: true,
    permissions: [
      'eventos.eventos.ver',
      'eventos.eventos.novo',
      'eventos.eventos.alterar',
      'eventos.eventos.excluir',
      'eventos.inscricoes.ver',
      'eventos.inscricoes.novo',
      'eventos.inscricoes.alterar',
      'eventos.inscricoes.excluir',
      'eventos.pagamentos.ver',
      'eventos.pagamentos.baixa',
      'eventos.checkin.ver',
      'eventos.checkin.fazer',
    ],
  },
  {
    system_key: 'PASTOR',
    name: 'Pastor',
    description: 'Vê tudo e cuida da membresia e dos eventos, sem mexer no financeiro.',
    is_system: false,
    permissions: [
      'louvor.musicas.ver',
      'louvor.cultos.ver',
      'louvor.escalas.ver',
      'louvor.repertorio.ver',
      'louvor.minhas_escalas.ver',
      'louvor.tarefas.ver',
      'culto.som.ver',
      'culto.projecao.ver',
      'culto.midias.ver',
      'culto.iluminacao.ver',
      'culto.computadores.ver',
      'membresia.pessoas.ver',
      'membresia.pessoas.novo',
      'membresia.pessoas.alterar',
      'membresia.pessoas.excluir',
      'membresia.pessoas.situacao',
      'membresia.familias.ver',
      'membresia.familias.novo',
      'membresia.familias.alterar',
      'membresia.familias.excluir',
      'membresia.painel.ver',
      'membresia.painel.parabens',
      'membresia.cadastros.ver',
      'membresia.cadastros.novo',
      'membresia.cadastros.excluir',
      'membresia.cadastros.aprovar',
      'membresia.acompanhamento.ver',
      'membresia.acompanhamento.alterar',
      'membresia.grupos.ver',
      'membresia.grupos.novo',
      'membresia.grupos.alterar',
      'membresia.grupos.excluir',
      'membresia.documentos.ver',
      'membresia.documentos.emitir',
      'membresia.relatorios.ver',
      'membresia.relatorios.exportar',
      'eventos.eventos.ver',
      'eventos.eventos.novo',
      'eventos.eventos.alterar',
      'eventos.eventos.excluir',
      'eventos.inscricoes.ver',
      'eventos.inscricoes.novo',
      'eventos.inscricoes.alterar',
      'eventos.inscricoes.excluir',
      'eventos.pagamentos.ver',
      'eventos.pagamentos.baixa',
      'eventos.checkin.ver',
      'eventos.checkin.fazer',
      'financeiro.painel.ver',
      'financeiro.lancamentos.ver',
      'financeiro.contagem.ver',
      'financeiro.contas_pagar.ver',
      'financeiro.conciliacao.ver',
      'financeiro.fluxo.ver',
      'financeiro.campanhas.ver',
      'financeiro.orcamento.ver',
      'financeiro.fechamento.ver',
      'financeiro.auditoria.ver',
      'financeiro.relatorios.ver',
      'financeiro.contribuintes.ver',
      'financeiro.cadastros.ver',
      'admin.pessoas.ver',
    ],
  },
  {
    system_key: 'CONTADOR',
    name: 'Contador',
    description: 'Escritório de contabilidade: vê lançamentos e relatórios e exporta.',
    is_system: false,
    permissions: [
      'financeiro.painel.ver',
      'financeiro.lancamentos.ver',
      'financeiro.fluxo.ver',
      'financeiro.relatorios.ver',
      'financeiro.relatorios.exportar',
    ],
  },
]
// END SYSTEM_PROFILES

migrate(
  (app) => {
    // Soma os perfis de acesso de um vínculo (church_members) e grava o resultado nele:
    // permissions (chaves modulo.tela.acao), cong_* (congregações por módulo, '*' = todas) e,
    // por compatibilidade com o código antigo, role e operational_roles derivados das chaves.
    // forceLegacy: converte papel + funções antigas nos perfis prontos (usado na migração 0072
    // e quando alguma rotina antiga grava só role/operational_roles).
    // MESMA CONTA em pocketbase/migrations/0072_access_profiles.js, pocketbase/hooks/
    // church_members_access.js e src/lib/accessCatalog.ts (computeEffectiveAccess).
    function applyAccessProfiles(app, rec, forceLegacy) {
      const SCOPED = ['membresia', 'eventos', 'financeiro']
      const OPS = [
        'MUSICO',
        'SOM',
        'PROJECAO',
        'MIDIA',
        'ILUMINACAO',
        'FINANCEIRO',
        'AUDITOR',
        'MEMBRESIA',
        'EVENTOS',
      ]
      const parseList = (s) => {
        try {
          const v = JSON.parse(s || '[]')
          return Array.isArray(v) ? v.map((x) => String(x)) : []
        } catch (_) {
          return []
        }
      }
      const same = (a, b) => a.slice().sort().join('|') === b.slice().sort().join('|')

      const role = rec.getString('role')
      if (role === 'MASTER') {
        // MASTER tem tudo; as regras conferem o papel direto, isto é só por garantia
        rec.set('permissions', ['*'])
        for (const m of SCOPED) rec.set('cong_' + m, ['*'])
        return
      }

      const profiles = app.findRecordsByFilter('access_profiles', 'church_id = {:c}', '', 0, 0, {
        c: rec.getString('church_id'),
      })
      const byId = {}
      const bySystemKey = {}
      for (const p of profiles) {
        byId[p.id] = p
        if (p.getBool('is_system') && p.getString('system_key'))
          bySystemKey[p.getString('system_key')] = p
      }

      const rawIds = parseList(rec.getString('access_profiles'))
      const ops = parseList(rec.getString('operational_roles'))
      const orig = rec.isNew() ? null : rec.original()
      let legacy = !!forceLegacy
      if (!legacy) {
        if (!orig) {
          legacy = rawIds.length === 0
        } else {
          const profilesChanged = !same(parseList(orig.getString('access_profiles')), rawIds)
          const legacyChanged =
            orig.getString('role') !== role ||
            !same(parseList(orig.getString('operational_roles')), ops)
          // Quem deixa de ser MASTER fica com os perfis que tiver (não volta às funções antigas)
          legacy = !profilesChanged && legacyChanged && orig.getString('role') !== 'MASTER'
        }
      }

      let ids = []
      if (legacy) {
        const keys = []
        if (role === 'ADMIN') keys.push('ADMIN')
        if (role === 'LIDER') keys.push('LIDER')
        for (const op of ops) if (OPS.indexOf(op) !== -1 && keys.indexOf(op) === -1) keys.push(op)
        if (keys.length === 0) keys.push('MUSICO')
        for (const k of keys) {
          if (bySystemKey[k] && ids.indexOf(bySystemKey[k].id) === -1) ids.push(bySystemKey[k].id)
        }
      } else {
        for (const id of rawIds) if (byId[id] && ids.indexOf(id) === -1) ids.push(id)
      }

      const perms = {}
      const cong = {}
      const sysKeys = {}
      for (const m of SCOPED) cong[m] = {}
      for (const id of ids) {
        const p = byId[id]
        if (!p.getBool('is_active')) continue
        const congs = parseList(p.getString('congregations'))
        const touched = {}
        for (const k of parseList(p.getString('permissions'))) {
          if (!/^[a-z_]+\.[a-z_]+\.[a-z_]+$/.test(k)) continue
          perms[k] = true
          touched[k.split('.')[0]] = true
        }
        for (const m of SCOPED) {
          if (!touched[m]) continue
          if (congs.length === 0) cong[m]['*'] = true
          else for (const c of congs) cong[m][c] = true
        }
        if (p.getBool('is_system')) sysKeys[p.getString('system_key')] = true
      }
      const has = (k) => perms[k] === true

      rec.set('access_profiles', ids)
      rec.set('permissions', Object.keys(perms).sort())
      for (const m of SCOPED) {
        const c = Object.keys(cong[m])
        rec.set('cong_' + m, c.indexOf('*') !== -1 ? ['*'] : c.sort())
      }

      // Compatibilidade: papel e funções antigos derivados das chaves
      let newRole = 'MUSICO'
      if (
        has('admin.pessoas.alterar') ||
        has('admin.configuracoes.alterar') ||
        has('admin.integracoes.alterar')
      ) {
        newRole = 'ADMIN'
      } else if (
        has('louvor.cultos.alterar') ||
        has('louvor.escalas.alterar') ||
        has('louvor.musicas.alterar')
      ) {
        newRole = 'LIDER'
      }
      rec.set('role', newRole)
      const newOps = []
      if (sysKeys.MUSICO) newOps.push('MUSICO')
      if (has('culto.som.ver')) newOps.push('SOM')
      if (has('culto.projecao.ver')) newOps.push('PROJECAO')
      if (has('culto.midias.novo')) newOps.push('MIDIA')
      if (has('culto.iluminacao.ver')) newOps.push('ILUMINACAO')
      if (has('financeiro.lancamentos.novo')) newOps.push('FINANCEIRO')
      if (has('financeiro.auditoria.auditar')) newOps.push('AUDITOR')
      if (has('membresia.pessoas.ver')) newOps.push('MEMBRESIA')
      if (has('eventos.eventos.ver')) newOps.push('EVENTOS')
      rec.set('operational_roles', newOps)
    }

    const MEMBER_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true'
    const IS_MASTER = "@collection.church_members.role ?= 'MASTER'"

    // 2. Campos novos em church_members (antes das regras que os citam)
    const members = app.findCollectionByNameOrId('church_members')
    for (const name of [
      'access_profiles',
      'permissions',
      'cong_membresia',
      'cong_eventos',
      'cong_financeiro',
    ]) {
      if (!members.fields.getByName(name)) {
        members.fields.add(new JSONField({ name: name, maxSize: 20000 }))
      }
    }
    app.save(members)

    // 3. Convite leva os perfis
    const invitations = app.findCollectionByNameOrId('invitations')
    if (!invitations.fields.getByName('access_profiles')) {
      invitations.fields.add(new JSONField({ name: 'access_profiles', maxSize: 20000 }))
    }
    app.save(invitations)

    // 1. Coleção dos perfis
    const churches = app.findCollectionByNameOrId('churches')
    let profilesCol
    try {
      profilesCol = app.findCollectionByNameOrId('access_profiles')
    } catch (_) {
      profilesCol = new Collection({
        name: 'access_profiles',
        type: 'base',
        listRule:
          MEMBER_OF_CHURCH +
          ' && (' +
          IS_MASTER +
          ' || @collection.church_members.permissions ?~ \'"admin.pessoas.ver"\')',
        viewRule:
          MEMBER_OF_CHURCH +
          ' && (' +
          IS_MASTER +
          ' || @collection.church_members.permissions ?~ \'"admin.pessoas.ver"\')',
        createRule: MEMBER_OF_CHURCH + ' && ' + IS_MASTER,
        updateRule:
          MEMBER_OF_CHURCH +
          ' && ' +
          IS_MASTER +
          ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)',
        deleteRule: MEMBER_OF_CHURCH + ' && ' + IS_MASTER,
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'name', type: 'text', required: true, max: 80 },
          { name: 'description', type: 'text', max: 300 },
          { name: 'permissions', type: 'json', maxSize: 20000 },
          { name: 'congregations', type: 'json', maxSize: 2000 },
          { name: 'is_active', type: 'bool' },
          { name: 'is_system', type: 'bool' },
          { name: 'system_key', type: 'text', max: 30 },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_access_profiles_church ON access_profiles (church_id)'],
      })
      app.save(profilesCol)
    }

    // 4. Perfis prontos em cada igreja
    const allChurches = app.findRecordsByFilter('churches', "id != ''", '', 0, 0)
    for (const church of allChurches) {
      for (const def of SYSTEM_PROFILES) {
        let exists = null
        try {
          exists = app.findFirstRecordByFilter(
            'access_profiles',
            'church_id = {:c} && system_key = {:k}',
            { c: church.id, k: def.system_key },
          )
        } catch (_) {}
        if (exists) continue
        const rec = new Record(profilesCol)
        rec.set('church_id', church.id)
        rec.set('name', def.name)
        rec.set('description', def.description)
        rec.set('permissions', def.permissions)
        rec.set('congregations', [])
        rec.set('is_active', true)
        rec.set('is_system', def.is_system)
        rec.set('system_key', def.system_key)
        app.save(rec)
      }
    }

    // 5. Converte cada pessoa (papel + funções de hoje -> perfis equivalentes)
    const all = app.findRecordsByFilter('church_members', "id != ''", '', 0, 0)
    for (const m of all) {
      applyAccessProfiles(app, m, true)
      app.save(m)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('access_profiles'))
    } catch (_) {}
    const members = app.findCollectionByNameOrId('church_members')
    for (const name of [
      'access_profiles',
      'permissions',
      'cong_membresia',
      'cong_eventos',
      'cong_financeiro',
    ]) {
      if (members.fields.getByName(name)) members.fields.removeByName(name)
    }
    app.save(members)
    const invitations = app.findCollectionByNameOrId('invitations')
    if (invitations.fields.getByName('access_profiles')) {
      invitations.fields.removeByName('access_profiles')
    }
    app.save(invitations)
  },
)
