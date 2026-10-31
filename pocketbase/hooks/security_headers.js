// Cabeçalhos de segurança em todas as respostas (pentest 2026-10-31).
//
// O backend fica exposto direto na internet, então estes cabeçalhos são a
// defesa que não depende de Cloudflare:
//   - X-Frame-Options: DENY            → impede embutir o backend em iframe (clickjacking)
//   - X-Content-Type-Options: nosniff  → navegador não "adivinha" o tipo do conteúdo
//   - Referrer-Policy                  → vaza menos a URL de origem para fora
//   - Permissions-Policy               → bloqueia APIs do navegador que o app não usa
//
// CORS não entra aqui de propósito: o PocketBase tem o próprio middleware de CORS,
// que sobrepõe qualquer Access-Control-Allow-Origin definido por hook (testado:
// continua "*" mesmo com prioridade máxima). Restringir o CORS para só o domínio
// do app é feito no comando de inicialização do PocketBase (flag --origins) ou no
// Cloudflare quando o backend estiver atrás dele.

routerUse(
  new Middleware((e) => {
    try {
      const h = e.response.header()
      h.set('X-Frame-Options', 'DENY')
      h.set('X-Content-Type-Options', 'nosniff')
      h.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()')
    } catch (_) {
      // nunca deixar os cabeçalhos quebrarem a requisição
    }
    e.next()
  }, -1),
)
