#!/usr/bin/env node
// Conector bancário do LouvorFlow: busca saldo e extrato na Cora e no Bradesco e entrega ao
// servidor (hook finance_bank_sync.js). Roda no GitHub Actions (.github/workflows/bank-sync.yml)
// ou em qualquer computador com Node 20+: `node bank-sync/sync.mjs`.
// Sem dependências: as chamadas aos bancos usam certificado do cliente (mTLS) via node:https.
//
// Variáveis de ambiente (veja bank-sync/README.md):
//   LOUVORFLOW_URL, BANK_SYNC_TOKEN
//   CORA_CLIENT_ID, CORA_CERT, CORA_KEY
//   BRADESCO_CLIENT_ID, BRADESCO_CLIENT_SECRET, BRADESCO_CERT, BRADESCO_KEY
//   (CERT e KEY com o conteúdo PEM, ou *_CERT_FILE / *_KEY_FILE com o caminho do arquivo).
//   Com "Credencial" preenchida na conexão (ex.: DIAMANTE), os nomes ganham o sufixo:
//   CORA_DIAMANTE_CLIENT_ID, CORA_DIAMANTE_CERT...

import https from 'node:https'
import { readFileSync } from 'node:fs'
import { bradescoBalance, bradescoError, bradescoLines, coraLines, ddmmyyyy } from './banks.mjs'

const HOSTS = {
  CORA: {
    PRODUCAO: 'https://matls-clients.api.cora.com.br',
    TESTE: 'https://matls-clients.api.stage.cora.com.br',
  },
  BRADESCO: {
    PRODUCAO: 'https://openapi.bradesco.com.br',
    TESTE: 'https://openapisandbox.prebanco.com.br',
  },
}
const BRADESCO_TOKEN_PATH = {
  PRODUCAO: '/auth/server-mtls/v1/token',
  TESTE: '/auth/server-mtls/v2/token',
}

// No GitHub Actions os segredos chegam todos juntos em BANK_SYNC_SECRETS (JSON); aproveita só
// os do conector, assim dá para ter credenciais com sufixo sem mexer no workflow
try {
  const all = JSON.parse(process.env.BANK_SYNC_SECRETS || '{}')
  for (const [k, v] of Object.entries(all)) {
    if (/^(CORA_|BRADESCO_|LOUVORFLOW_URL$|BANK_SYNC_TOKEN$)/.test(k) && !process.env[k]) {
      process.env[k] = String(v)
    }
  }
} catch {
  console.error('BANK_SYNC_SECRETS não é um JSON válido.')
}

const env = (name) => (process.env[name] || '').trim()

function credentials(provider, key) {
  const p = key ? `${provider}_${key.toUpperCase()}` : provider
  const pem = (name) => {
    const inline = env(`${p}_${name}`)
    if (inline) return inline.replace(/\\n/g, '\n')
    const file = env(`${p}_${name}_FILE`)
    return file ? readFileSync(file, 'utf8') : ''
  }
  const c = {
    clientId: env(`${p}_CLIENT_ID`),
    clientSecret: env(`${p}_CLIENT_SECRET`),
    cert: pem('CERT'),
    key: pem('KEY'),
  }
  const missing = []
  if (!c.clientId) missing.push(`${p}_CLIENT_ID`)
  if (provider === 'BRADESCO' && !c.clientSecret) missing.push(`${p}_CLIENT_SECRET`)
  if (!c.cert) missing.push(`${p}_CERT`)
  if (!c.key) missing.push(`${p}_KEY`)
  if (missing.length) throw new Error(`Credenciais faltando no conector: ${missing.join(', ')}`)
  return c
}

/** Requisição HTTPS com certificado do cliente; devolve { status, json, text }. */
function request(url, { method = 'GET', headers = {}, body, cert, key } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, cert, key, timeout: 60_000 }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (d) => (text += d))
      res.on('end', () => {
        let json = null
        try {
          json = text ? JSON.parse(text) : null
        } catch {}
        resolve({ status: res.statusCode, json, text })
      })
    })
    req.on('timeout', () => req.destroy(new Error('O banco demorou demais para responder')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const short = (r) => `${r.status} ${(r.text || '').slice(0, 200)}`.trim()

async function syncCora(conn, cred) {
  const base = HOSTS.CORA[conn.environment]
  const tls = { cert: cred.cert, key: cred.key }
  const tok = await request(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cred.clientId,
    }).toString(),
    ...tls,
  })
  if (tok.status !== 200 || !tok.json?.access_token)
    throw new Error(`Cora recusou o acesso: ${short(tok)}`)
  const auth = { Authorization: `Bearer ${tok.json.access_token}`, Accept: 'application/json' }

  const bal = await request(`${base}/third-party/account/balance`, { headers: auth, ...tls })
  if (bal.status !== 200) throw new Error(`Saldo da Cora: ${short(bal)}`)

  const entries = []
  let endBalance = null
  for (let page = 1; page <= 40; page++) {
    const qs = new URLSearchParams({
      start: conn.from,
      end: conn.to,
      page: String(page),
      perPage: '500',
    })
    const st = await request(`${base}/bank-statement/statement?${qs}`, { headers: auth, ...tls })
    if (st.status !== 200) throw new Error(`Extrato da Cora: ${short(st)}`)
    const list = st.json?.entries || []
    entries.push(...list)
    if (st.json?.end && Number.isInteger(st.json.end.balance)) endBalance = st.json.end.balance
    if (list.length < 500) break
  }
  const balance = Number.isInteger(Number(bal.json?.balance))
    ? Number(bal.json.balance)
    : endBalance
  return {
    balance_cents: balance,
    available_cents: balance,
    lines: coraLines(entries),
  }
}

async function syncBradesco(conn, cred) {
  const base = HOSTS.BRADESCO[conn.environment]
  const tls = { cert: cred.cert, key: cred.key }
  const tok = await request(`${base}${BRADESCO_TOKEN_PATH[conn.environment]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
    }).toString(),
    ...tls,
  })
  if (tok.status !== 200 || !tok.json?.access_token) {
    throw new Error(`Bradesco recusou o acesso: ${short(tok)}`)
  }
  const auth = { Authorization: `Bearer ${tok.json.access_token}`, Accept: 'application/json' }
  const account = { agencia: conn.branch, conta: conn.account_number }

  const bal = await request(
    `${base}/v1/fornecimento-saldos-contas/saldos?${new URLSearchParams({ ...account, tipoOperacao: '1' })}`,
    { headers: auth, ...tls },
  )
  if (bal.status !== 200) throw new Error(`Saldo do Bradesco: ${short(bal)}`)
  const balErr = bradescoError(bal.json)
  if (balErr) throw new Error(`Saldo do Bradesco: ${balErr}`)

  // O Bradesco consulta no máximo 1 ano por vez
  const st = await request(
    `${base}/v1/fornecimento-extratos-contas/extratos?${new URLSearchParams({
      ...account,
      dataInicio: ddmmyyyy(conn.from),
      dataFim: ddmmyyyy(conn.to),
      tipo: (conn.account_type || 'CC').toLowerCase(),
      tipoOperacao: '1',
    })}`,
    { headers: auth, ...tls },
  )
  if (st.status !== 200) throw new Error(`Extrato do Bradesco: ${short(st)}`)
  const stErr = bradescoError(st.json)
  if (stErr) throw new Error(`Extrato do Bradesco: ${stErr}`)
  return { ...bradescoBalance(bal.json), lines: bradescoLines(st.json) }
}

async function louvorflow(path, body) {
  const base = env('LOUVORFLOW_URL').replace(/\/$/, '')
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-bank-sync-token': env('BANK_SYNC_TOKEN'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`LouvorFlow ${res.status}: ${json.message || ''}`)
  return json
}

async function main() {
  if (!env('LOUVORFLOW_URL') || !env('BANK_SYNC_TOKEN')) {
    console.log(
      'Conector bancário não configurado (LOUVORFLOW_URL e BANK_SYNC_TOKEN). Nada a fazer.',
    )
    return
  }
  const { connections } = await louvorflow('/backend/v1/finance/bank-sync/connections')
  console.log(`${connections.length} conta(s) conectada(s).`)
  let failures = 0
  for (const conn of connections) {
    const name = `${conn.account_name} (${conn.provider}, ${conn.from} a ${conn.to})`
    try {
      if (!HOSTS[conn.provider]?.[conn.environment])
        throw new Error('Banco ou ambiente desconhecido')
      const cred = credentials(conn.provider, conn.credential_key)
      const data =
        conn.provider === 'CORA' ? await syncCora(conn, cred) : await syncBradesco(conn, cred)
      const res = await louvorflow('/backend/v1/finance/bank-sync/push', {
        connection_id: conn.id,
        ok: true,
        balance_cents: data.balance_cents,
        available_cents: data.available_cents,
        balance_at: new Date().toISOString().replace('T', ' '),
        start_date: conn.from,
        end_date: conn.to,
        lines: data.lines,
      })
      console.log(
        `${name}: ${data.lines.length} movimento(s), ${res.created} novo(s), ${res.auto_reconciled} conciliado(s) sozinho(s).`,
      )
    } catch (err) {
      failures++
      console.error(`${name}: ${err.message}`)
      await louvorflow('/backend/v1/finance/bank-sync/push', {
        connection_id: conn.id,
        ok: false,
        error: err.message,
      }).catch((e) => console.error(`Não foi possível avisar o LouvorFlow: ${e.message}`))
    }
  }
  if (failures) process.exitCode = 1
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
