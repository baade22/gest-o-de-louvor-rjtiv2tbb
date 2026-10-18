// Migração 0041: ativa o rate limiting do PocketBase (auditoria 2026-10-18).
//
// O PocketBase já vinha com regras padrão sensatas (ex.: "*:auth" = 2 req / 3s,
// que cobre login e demais rotas de autenticação nativas), mas com
// rateLimits.enabled = false — ou seja, sem proteção contra força bruta.
//
// Esta migração liga o rate limiting mantendo as regras padrão e acrescenta
// regras específicas para os endpoints customizados sensíveis (aceite de
// convite, validação de convite e pareamento do agente), que não são cobertos
// pela tag nativa "*:auth" por serem rotas próprias em /backend/v1/*.
//
// As regras mais específicas vêm antes das genéricas (a primeira que casa vence).

migrate(
  (app) => {
    const settings = app.settings()

    const customRules = [
      // Aceite de convite: define senha do usuário — alvo clássico de brute force.
      { label: '/backend/v1/invitations/accept', audience: '', duration: 60, maxRequests: 5 },
      // Validação de convite (enumeração de tokens).
      { label: '/backend/v1/invitations/validate', audience: '', duration: 60, maxRequests: 20 },
      // Pareamento do agente Holyrics (código de 6 dígitos).
      { label: '/backend/v1/agent/pair', audience: '', duration: 60, maxRequests: 10 },
    ]

    const existing = Array.isArray(settings.rateLimits.rules) ? settings.rateLimits.rules : []
    // Evita duplicar regras customizadas em reaplicações.
    const existingLabels = existing.map((r) => r.label)
    const merged = customRules
      .filter((r) => existingLabels.indexOf(r.label) === -1)
      .concat(existing)

    settings.rateLimits.rules = merged
    settings.rateLimits.enabled = true
    app.save(settings)
  },
  (app) => {
    const settings = app.settings()
    settings.rateLimits.enabled = false
    app.save(settings)
  },
)
