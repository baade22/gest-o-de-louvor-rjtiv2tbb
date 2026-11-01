// Leitura das respostas das APIs de saldo e extrato da Cora e do Bradesco.
// Tudo aqui é função pura (sem rede) para poder testar com os exemplos das documentações.
// Cada movimento vira { id, date: 'YYYY-MM-DD', amount_cents (positivo = entrou), description }.

/** 'YYYY-MM-DD' → 'DDMMAAAA' (formato do Bradesco) */
export function ddmmyyyy(ymd) {
  const [y, m, d] = ymd.split('-')
  return `${d}${m}${y}`
}

/** '17/01/2025' → '2025-01-17' */
export function brDate(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** '6.759,00' → 675900 (um número, 6759 → 675900) */
export function brlToCents(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? Math.round(Math.abs(s) * 100) : null
  const t = String(s || '').trim()
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$/.test(t)) return null
  const [int, dec = ''] = t.replace(/\./g, '').split(',')
  return Number(int) * 100 + Number((dec + '00').slice(0, 2))
}

/** Data (dia) de Brasília de um instante ISO, aceitando o '+00' que a Cora manda. */
export function brtDate(iso) {
  const s = String(iso || '').replace(/([+-]\d{2})$/, '$1:00')
  const t = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z')
  if (Number.isNaN(t)) return ''
  return new Date(t - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// ---------------- Cora ----------------

/**
 * Movimentos do extrato da Cora (GET /bank-statement/statement).
 * BLOCK e UNBLOCK são bloqueios de saldo, não entram nem saem da conta: ficam de fora.
 */
export function coraLines(entries) {
  const out = []
  for (const en of entries || []) {
    if (en.type !== 'CREDIT' && en.type !== 'DEBIT') continue
    const amount = Number(en.amount)
    if (!en.id || !Number.isInteger(amount) || amount === 0) continue
    const date = brtDate(en.createdAt)
    if (!date) continue
    const tr = en.transaction || {}
    const who = tr.counterParty?.name || ''
    const what = tr.description || TRANSACTION_TYPES[tr.type] || tr.type || 'Movimento'
    const description = [what, who && !what.toUpperCase().includes(who.toUpperCase()) ? who : '']
      .filter(Boolean)
      .join(' · ')
    out.push({
      id: String(en.id),
      date,
      amount_cents: en.type === 'CREDIT' ? Math.abs(amount) : -Math.abs(amount),
      description,
    })
  }
  return out
}

const TRANSACTION_TYPES = {
  TRANSFER: 'Transferência',
  PAYMENT: 'Pagamento',
  PIX: 'Pix',
  FEE: 'Tarifa',
  BANK_DOMICILE: 'Domicílio bancário',
  CARD: 'Cartão',
}

// ---------------- Bradesco ----------------

const lastLine = (s) => String(s || '').trim()

/**
 * Movimentos do extrato do Bradesco (GET /v1/fornecimento-extratos-contas/extratos).
 * Junta "Últimos Lançamentos" (D-1), "Lançamentos Dia" (D0) e o extrato por período;
 * pula "Saldo Anterior" e os lançamentos futuros (ainda não aconteceram).
 * O Bradesco não manda um id do movimento: montamos um com data, documento, código e valor,
 * numerando os iguais. O mesmo movimento pode vir em mais de uma lista, então cada id conta
 * no máximo tantas vezes quanto aparece na lista em que mais aparece.
 */
export function bradescoLines(json) {
  const lists = []
  const recent = json?.extratoUltimosLancamentos?.listaLancamentos || {}
  for (const key of Object.keys(recent)) {
    if (/saldo anterior/i.test(key) || /futur/i.test(key)) continue
    if (Array.isArray(recent[key])) lists.push(recent[key])
  }
  const period = json?.extratoPorPeriodo?.lstLancamentoMensal
  if (Array.isArray(period)) lists.push(period)

  const out = []
  const emitted = new Map()
  for (const list of lists) {
    const inList = new Map()
    for (const r of list) {
      const desc = lastLine(r.descritivoLancamentoCompleto || r.descritivoLancamentoAbreviado)
      if (/^saldo anterior$/i.test(desc) || /^0+$/.test(lastLine(r.codigoLancamento))) continue
      const cents = brlToCents(r.valorLancamento)
      const date = brDate(r.dataLancamento)
      if (!cents || !date) continue
      const amount = r.sinalLancamento === '-' ? -cents : cents
      const key = [date, lastLine(r.numeroDocumento), lastLine(r.codigoLancamento), amount].join(
        '|',
      )
      const n = (inList.get(key) || 0) + 1
      inList.set(key, n)
      if ((emitted.get(key) || 0) >= n) continue
      emitted.set(key, n)
      const second = lastLine(r.segundaLinhalLancamento)
      out.push({
        id: `${key}|${n}`,
        date,
        amount_cents: amount,
        description: [desc.replace(/\*$/, ''), second].filter(Boolean).join(' · ') || 'Movimento',
      })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Saldo do Bradesco (GET /v1/fornecimento-saldos-contas/saldos), em centavos e com sinal.
 * O SALDO TOTAL (984) soma a conta-corrente e as aplicações. O Invest Fácil é remuneração do
 * caixa, não investimento: conta como saldo da conta-corrente ("+ CTA CORRENTE", 998). As
 * outras aplicações de saldoAplicacaoCC ficam à parte (invested_cents). invest_cash_cents diz
 * quanto do saldo está no Invest Fácil, para quando ele tem uma conta própria no LouvorFlow.
 */
export function bradescoBalance(json) {
  const block = json?.saldoCC || json?.saldoCP
  const value = (it) => {
    const cents = it ? brlToCents(it.valorLancamento) : null
    return cents === null ? null : it.sinalSaldo === '-' ? -cents : cents
  }
  const pick = (code) =>
    value((block?.lstLancamentosSaldos || []).find((x) => Number(x.codigoProduto) === code))
  const total = pick(984)
  const checking = pick(998)

  const apps = json?.saldoAplicacaoCC || json?.saldoAplicacaoCP
  let cash = null
  let invested = null
  for (const it of apps?.lstLancamentosSaldos || []) {
    if (Number(it.codigoProduto) === 977) continue // linha em branco
    const cents = value(it)
    if (cents === null) continue
    if (/INVEST\s*FACIL/i.test(`${it.nomeProduto} ${it.nomeProdutoResumido}`)) {
      cash = (cash || 0) + cents
    } else invested = (invested || 0) + cents
  }

  // Sem a lista das aplicações não dá para separar: vale o total
  const balance = apps
    ? (checking ?? pick(999) ?? 0) + (cash || 0)
    : (total ?? checking ?? pick(999))
  return {
    balance_cents: balance,
    available_cents: balance,
    invested_cents: invested,
    // Parte do saldo que está no Invest Fácil (o LouvorFlow pode tratá-la como outra conta)
    invest_cash_cents: apps ? cash || 0 : null,
  }
}

/**
 * Erro do Bradesco no corpo (codigoRetorno diferente de 00/01), ou null. Em produção o código
 * chega como número (0) e no sandbox como texto ("00"): compara pelo valor.
 */
export function bradescoError(json) {
  for (const key of Object.keys(json || {})) {
    const b = json[key]
    if (b && typeof b === 'object' && 'codigoRetorno' in b) {
      const code = Number(b.codigoRetorno)
      if (code !== 0 && code !== 1) {
        return `${b.codigoRetorno} ${lastLine(b.mensagem)}`.trim()
      }
    }
  }
  return null
}

// Histórico: do dia anterior a history.before para trás, em partes de até 3 meses, até
// history.from ou, sem data (o máximo), até o banco parar de devolver movimentos. Cada parte
// é entregue na hora (push); o que faltar continua na próxima rodada do conector.
const HISTORY_WINDOW_DAYS = 92
const HISTORY_WINDOWS_PER_RUN = 24
const HISTORY_EMPTY_TO_STOP = 4 // um ano sem nenhum movimento: acabou o histórico
const HISTORY_FLOOR = '2010-01-01'
const shiftDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Busca o histórico de uma conexão. bank.statement(from, to) devolve as linhas ou lança um erro
 * com status (o código HTTP do banco); push(body) entrega uma parte ao LouvorFlow.
 */
export async function backfill(conn, bank, push, { log = console.log, wait = sleep } = {}) {
  const floor = conn.history.from || HISTORY_FLOOR
  let end = shiftDays(conn.history.before, -1)
  let empty = 0
  let total = 0
  for (let i = 0; i < HISTORY_WINDOWS_PER_RUN && end >= floor; i++) {
    let start = shiftDays(end, -(HISTORY_WINDOW_DAYS - 1))
    if (start < floor) start = floor
    // A Cora pede o fim depois do início
    if (start === end) start = shiftDays(end, -1)
    let lines
    try {
      lines = await bank.statement(start, end)
    } catch (err) {
      if (err.status && err.status < 500 && err.status !== 429 && err.status !== 401) {
        // O banco recusou o período (antigo demais, por exemplo): o histórico termina aqui
        log(`o banco não devolve extrato antes de ${shiftDays(end, 1)} (${err.message}).`)
        await push({
          connection_id: conn.id,
          ok: true,
          history: true,
          history_done: true,
          lines: [],
        })
        return { total, done: true }
      }
      // Instabilidade do banco: tenta mais uma vez; se falhar de novo, continua na próxima rodada
      await wait(5000)
      try {
        lines = await bank.statement(start, end)
      } catch (err2) {
        log(`histórico parou em ${shiftDays(end, 1)}: ${err2.message}`)
        return { total, done: false }
      }
    }
    empty = lines.length ? 0 : empty + 1
    total += lines.length
    const done = start <= floor || (!conn.history.from && empty >= HISTORY_EMPTY_TO_STOP)
    await push({
      connection_id: conn.id,
      ok: true,
      history: true,
      history_done: done,
      start_date: start,
      end_date: end,
      lines,
    })
    if (done) {
      log(`histórico completo (${total} movimento(s) nesta rodada).`)
      return { total, done: true }
    }
    end = shiftDays(start, -1)
  }
  log(`histórico buscado até ${shiftDays(end, 1)}; continua na próxima rodada.`)
  return { total, done: false }
}

/**
 * Divide o período (YYYY-MM-DD, os dois dias incluídos) em partes de até `days` dias, sem
 * sobrar parte de um dia só: a Cora pede o fim depois do início.
 */
export function splitPeriod(from, to, days) {
  const parts = []
  let start = from
  while (start <= to) {
    let end = shiftDays(start, days - 1)
    if (end >= to || shiftDays(end, 1) === to) end = to
    parts.push([start, end === start ? shiftDays(end, 1) : end])
    start = shiftDays(end, 1)
  }
  return parts
}
