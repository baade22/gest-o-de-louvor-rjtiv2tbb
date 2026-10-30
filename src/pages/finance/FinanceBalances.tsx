import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Landmark,
  Loader2,
  PlugZap,
  RefreshCw,
  Settings2,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { accountBalances } from '@/lib/financeSummary'
import { brtDateTime, brtDay, statementCsv, statementSummary, timeAgo } from '@/lib/bankStatement'
import {
  deleteBankConnection,
  listBankConnections,
  listLatestBankBalances,
  listLedger,
  listPendingLines,
  listStatement,
  requestBankSync,
  saveBankConnection,
  type BankConnectionInput,
  type BankSyncRequestResult,
} from '@/services/finance'
import type {
  FinAccount,
  FinBankConnection,
  FinBankImport,
  FinBankLine,
  FinTransaction,
} from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFinanceLookups } from './useFinanceLookups'
import {
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  errorMessage,
  primaryButtonClass,
  shortDate,
  useFinanceAccess,
} from './shared'

const PROVIDER_LABELS = { CORA: 'Cora', BRADESCO: 'Bradesco' } as const
const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'A conciliar',
  CONCILIADO: 'Conciliado',
  IGNORADO: 'Ignorado',
  EXTRATO: 'Só extrato',
}
const README_URL =
  'https://github.com/baade22/gest-o-de-louvor-rjtiv2tbb/blob/main/bank-sync/README.md'

const serverMessage = (err: unknown, fallback: string) =>
  (err as { response?: { message?: string } })?.response?.message || errorMessage(err, fallback)

const today = () => brtDay(new Date().toISOString())
// Datas do PocketBase ("2026-01-01 12:00:00.000Z") <-> dia do campo de data
const dayOf = (s?: string) => (s || '').slice(0, 10)
const pbDay = (ymd: string) => (ymd ? `${ymd} 12:00:00.000Z` : '')

const LATER = ' Até lá, a busca fica para a próxima rodada agendada.'

/** Por que o "Atualizar agora" não chegou ao conector, em palavras de quem vai corrigir. */
function syncFailureText(res: BankSyncRequestResult) {
  if (res.reason === 'GITHUB') {
    const where = ' Corrija em Configurações › Integrações › Conector bancário.'
    if (res.status === 401)
      return 'O GitHub recusou o token (vencido ou apagado). Gere um token novo.' + where + LATER
    if (res.status === 403)
      return (
        'O token do GitHub não tem permissão para rodar o conector. Ao gerar o token, marque "Actions: Read and write" no repositório do LouvorFlow.' +
        where +
        LATER
      )
    if (res.status === 404)
      return (
        'O GitHub não achou o repositório ou o conector com esse token. Confira o nome do repositório e se o token dá acesso a ele.' +
        where +
        LATER
      )
    return (
      `O GitHub respondeu ${res.status ?? '?'}${res.message ? ` (${res.message})` : ''}.` +
      where +
      LATER
    )
  }
  if (res.reason === 'ERRO')
    return 'Não deu para falar com o GitHub agora. Tente de novo em instantes.' + LATER
  return (
    'Ainda não há acesso ao GitHub para buscar na hora: o MASTER cadastra em Configurações › Integrações › Conector bancário.' +
    LATER
  )
}

/** Situação do histórico pedido: buscando (até onde chegou) ou completo (desde quando). */
function historyState(conn?: FinBankConnection) {
  if (!conn) return null
  const target = conn.history_max ? 'MAX' : dayOf(conn.history_from)
  if (!target) return null
  const loaded = dayOf(conn.history_loaded_from)
  const done =
    conn.history_done_for === target || (target !== 'MAX' && !!loaded && loaded <= target)
  return { done, loaded }
}
const shiftDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type Period = 'mes' | 'mes-passado' | '7' | '30' | 'outro'
function periodRange(p: Period, from: string, to: string): [string, string] {
  const t = today()
  if (p === '7') return [shiftDays(t, -6), t]
  if (p === '30') return [shiftDays(t, -29), t]
  if (p === 'mes') return [`${t.slice(0, 7)}-01`, t]
  if (p === 'mes-passado') {
    const first = `${t.slice(0, 7)}-01`
    const end = shiftDays(first, -1)
    return [`${end.slice(0, 7)}-01`, end]
  }
  return [from || t, to || t]
}

/** Saldo informado pelo banco: o mais recente entre a API e o último arquivo OFX com saldo. */
function bankBalance(conn?: FinBankConnection, imp?: FinBankImport) {
  const api =
    conn?.has_balance && conn.balance_at
      ? {
          cents: conn.balance_cents || 0,
          available: conn.available_cents ?? conn.balance_cents ?? 0,
          day: brtDay(conn.balance_at),
          at: conn.balance_at,
          source: 'API' as const,
        }
      : null
  const file = imp
    ? {
        cents: imp.balance_cents || 0,
        available: imp.balance_cents || 0,
        day: (imp.balance_date || imp.end_date || imp.created).slice(0, 10),
        at: '',
        source: 'OFX' as const,
      }
    : null
  if (api && file) return file.day > api.day ? file : api
  return api || file
}

export default function FinanceBalances() {
  const { currentChurch } = useAuth()
  const { canEdit } = useFinanceAccess('conciliacao')
  const { toast } = useToast()
  const churchId = currentChurch?.id
  const { lookups } = useFinanceLookups(churchId)
  const [params, setParams] = useSearchParams()

  const [connections, setConnections] = useState<FinBankConnection[]>([])
  const [imports, setImports] = useState<Record<string, FinBankImport>>({})
  const [ledger, setLedger] = useState<FinTransaction[]>([])
  const [pending, setPending] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [congregation, setCongregation] = useState('')
  const [editing, setEditing] = useState<{ account: FinAccount; conn?: FinBankConnection } | null>(
    null,
  )
  // Relógio para "há 5 min" e para buscar de novo de tempos em tempos
  const [now, setNow] = useState(Date.now())

  const accounts = useMemo(
    () =>
      lookups.accounts
        .filter((a) => a.is_active)
        .filter((a) => !congregation || (a.congregation || '').trim() === congregation)
        .sort((a, b) => Number(a.kind === 'CAIXA') - Number(b.kind === 'CAIXA')),
    [lookups.accounts, congregation],
  )
  const congregations = useMemo(
    () =>
      [
        ...new Set(lookups.accounts.map((a) => (a.congregation || '').trim()).filter(Boolean)),
      ].sort(),
    [lookups.accounts],
  )

  const load = useCallback(
    async (quiet = false) => {
      if (!churchId) return
      if (!quiet) setLoading(true)
      try {
        const [conns, imps, led, pend] = await Promise.all([
          listBankConnections(churchId).catch(() => [] as FinBankConnection[]),
          listLatestBankBalances(churchId).catch(() => ({})),
          listLedger(churchId),
          listPendingLines(churchId).catch(() => [] as FinBankLine[]),
        ])
        const byAccount: Record<string, number> = {}
        for (const l of pend) byAccount[l.account_id] = (byAccount[l.account_id] || 0) + 1
        setConnections(conns)
        setImports(imps)
        setLedger(led)
        setPending(byAccount)
      } catch (err) {
        console.error(err)
        if (!quiet) toast({ title: 'Erro ao carregar os saldos', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    },
    [churchId, toast],
  )

  useEffect(() => {
    load()
  }, [load])

  const waiting = connections.some((c) => c.enabled && c.sync_requested_at)
  // Acompanha on-line: a cada minuto, ou a cada 10 s enquanto espera uma atualização pedida
  useEffect(() => {
    const id = setInterval(
      () => {
        setNow(Date.now())
        load(true)
      },
      waiting ? 10_000 : 60_000,
    )
    return () => clearInterval(id)
  }, [load, waiting])

  const connOf = (accountId: string) => connections.find((c) => c.account_id === accountId)
  const systemBalances = useMemo(
    () => accountBalances(lookups.accounts, ledger),
    [lookups.accounts, ledger],
  )
  const systemBalanceOn = (account: FinAccount, day: string) =>
    accountBalances(
      [account],
      ledger.filter((tx) => tx.date.slice(0, 10) <= day),
    )[account.id] || 0

  const withBank = accounts
    .map((a) => ({ a, b: bankBalance(connOf(a.id), imports[a.id]) }))
    .filter((x) => x.b)
  const totalBank = withBank.reduce((s, x) => s + (x.b?.cents || 0), 0)
  const totalSystem = withBank.reduce((s, x) => s + systemBalanceOn(x.a, x.b!.day), 0)
  const activeConnections = connections.filter(
    (c) => c.enabled && accounts.some((a) => a.id === c.account_id),
  )
  const lastSync = activeConnections
    .map((c) => c.last_sync_at || '')
    .sort()
    .pop()

  const syncNow = async () => {
    if (!churchId) return
    setSyncing(true)
    try {
      const res = await requestBankSync(churchId)
      toast({
        title: res.dispatched ? 'Buscando nos bancos' : 'Não deu para buscar na hora',
        description: res.dispatched
          ? 'Os saldos e movimentos novos aparecem aqui em instantes.'
          : syncFailureText(res),
        variant: res.dispatched || res.reason === 'SEM_ACESSO' ? undefined : 'destructive',
      })
      load(true)
    } catch (err) {
      toast({
        title: 'Não deu certo',
        description: serverMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  // ---- Extrato ----
  const [stAccount, setStAccount] = useState(params.get('conta') || '')
  const [period, setPeriod] = useState<Period>('mes')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [lines, setLines] = useState<FinBankLine[]>([])
  const [stLoading, setStLoading] = useState(false)
  const [rangeFrom, rangeTo] = periodRange(period, from, to)
  const bankAccounts = useMemo(() => accounts.filter((a) => a.kind !== 'CAIXA'), [accounts])
  useEffect(() => {
    if (!stAccount && bankAccounts.length) setStAccount(bankAccounts[0].id)
  }, [stAccount, bankAccounts])

  const lastLineSync = connOf(stAccount)?.last_sync_at
  useEffect(() => {
    if (!churchId || !stAccount) return
    let alive = true
    setStLoading(true)
    listStatement(churchId, stAccount, rangeFrom, rangeTo)
      .then((ls) => alive && setLines(ls))
      .catch((err) => {
        console.error(err)
        if (alive) setLines([])
      })
      .finally(() => alive && setStLoading(false))
    return () => {
      alive = false
    }
    // lastLineSync: recarrega quando chega uma busca nova do banco
  }, [churchId, stAccount, rangeFrom, rangeTo, lastLineSync])

  const summary = useMemo(() => statementSummary(lines), [lines])
  const stAccountName = lookups.accounts.find((a) => a.id === stAccount)?.name || 'conta'

  const exportCsv = () => {
    const blob = new Blob([statementCsv(lines, (s) => STATUS_LABELS[s || ''] || '')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extrato-${stAccountName.toLowerCase().replace(/\s+/g, '-')}-${rangeFrom}-a-${rangeTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Saldos e extratos"
        subtitle={
          activeConnections.length
            ? `Saldos buscados direto nos bancos${lastSync ? `, última busca ${timeAgo(lastSync, now)}` : ''}`
            : 'Acompanhe o saldo de cada conta e os movimentos do banco'
        }
      >
        {congregations.length > 0 && (
          <Select
            value={congregation || '__all__'}
            onValueChange={(v) => setCongregation(v === '__all__' ? '' : v)}
          >
            <SelectTrigger
              className="h-10 w-full rounded-lg bg-white sm:w-56"
              aria-label="Congregação"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as congregações</SelectItem>
              {congregations.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {canEdit && activeConnections.length > 0 && (
          <Button onClick={syncNow} disabled={syncing || waiting} className={primaryButtonClass}>
            {syncing || waiting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {waiting ? 'Busca pedida…' : 'Atualizar agora'}
          </Button>
        )}
      </PageHeader>

      {!canEdit && <ReadOnlyNotice />}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={cn(cardClass, 'p-4')}>
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
              <Landmark className="h-4 w-4 text-slate-400" />
              Saldo nos bancos
            </div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-slate-900">
              {withBank.length ? formatCents(totalBank) : '—'}
            </div>
            <div className="text-xs text-slate-500">
              {withBank.length
                ? `${withBank.length} ${withBank.length === 1 ? 'conta' : 'contas'} com saldo do banco`
                : 'Conecte uma conta ou importe um OFX'}
            </div>
          </div>
          <div className={cn(cardClass, 'p-4')}>
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
              <Wallet className="h-4 w-4 text-slate-400" />
              Saldo no LouvorFlow
            </div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-slate-900">
              {formatCents(
                withBank.length
                  ? totalSystem
                  : accounts.reduce((s, a) => s + (systemBalances[a.id] || 0), 0),
              )}
            </div>
            <div className="text-xs text-slate-500">
              {withBank.length ? 'Das mesmas contas, na mesma data' : 'Todas as contas'}
            </div>
          </div>
          <div className={cn(cardClass, 'p-4')}>
            <div className="text-[13px] font-medium text-slate-600">Diferença</div>
            <div
              className={cn(
                'mt-2 text-[22px] font-bold tabular-nums',
                !withBank.length
                  ? 'text-slate-400'
                  : totalBank === totalSystem
                    ? 'text-emerald-700'
                    : 'text-amber-700',
              )}
            >
              {withBank.length ? formatCents(Math.abs(totalBank - totalSystem)) : '—'}
            </div>
            <div className="text-xs text-slate-500">
              {!withBank.length
                ? 'Aparece quando houver saldo do banco'
                : totalBank === totalSystem
                  ? 'Tudo batendo'
                  : 'Concilie os movimentos para fechar'}
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => {
            const conn = connOf(a.id)
            const b = bankBalance(conn, imports[a.id])
            const system = b ? systemBalanceOn(a, b.day) : systemBalances[a.id] || 0
            const diff = b ? b.cents - system : 0
            const isCash = a.kind === 'CAIXA'
            return (
              <div key={a.id} className={cn(cardClass, 'flex flex-col p-4')}>
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    {isCash ? <Wallet className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">{a.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {[a.bank_name, a.congregation].filter(Boolean).join(' · ') ||
                        (isCash ? 'Caixa' : 'Conta bancária')}
                    </div>
                  </div>
                  {!isCash && <ConnectionBadge conn={conn} />}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      {isCash ? 'Saldo' : 'Saldo no banco'}
                    </div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                      {isCash ? formatCents(system) : b ? formatCents(b.cents) : '—'}
                    </div>
                    {!isCash && b && (
                      <div className="text-[11.5px] text-slate-500">
                        {b.source === 'API'
                          ? `${brtDateTime(b.at)} (${timeAgo(b.at, now)})`
                          : `OFX de ${shortDate(b.day, true)}`}
                      </div>
                    )}
                    {!isCash && b && b.available !== b.cents && (
                      <div className="text-[11.5px] text-slate-500">
                        Disponível {formatCents(b.available)}
                      </div>
                    )}
                  </div>
                  {!isCash && (
                    <div>
                      <div className="text-xs font-medium text-slate-500">No LouvorFlow</div>
                      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                        {formatCents(system)}
                      </div>
                      {b && (
                        <div
                          className={cn(
                            'text-[11.5px] font-semibold',
                            diff === 0 ? 'text-emerald-700' : 'text-amber-700',
                          )}
                        >
                          {diff === 0
                            ? 'Igual ao banco'
                            : `Diferença de ${formatCents(Math.abs(diff))}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {conn?.last_status === 'ERRO' && conn.last_error && (
                  <div className="mt-3 flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words">{conn.last_error}</span>
                  </div>
                )}

                {!isCash && (
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    {(pending[a.id] || 0) > 0 && (
                      <Link
                        to={`/financeiro/conciliacao?conta=${a.id}`}
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        {pending[a.id]} a conciliar
                      </Link>
                    )}
                    {conn?.purpose === 'VISUALIZAR' && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Só extrato
                      </span>
                    )}
                    <HistoryNote conn={conn} />
                    {conn?.last_auto_reconciled ? (
                      <span className="text-xs text-slate-500">
                        {conn.last_auto_reconciled} conciliado(s) sozinho(s) na última busca
                      </span>
                    ) : null}
                    <div className="ml-auto flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                        onClick={() => {
                          setStAccount(a.id)
                          setParams({ conta: a.id }, { replace: true })
                          document.getElementById('extrato')?.scrollIntoView({ behavior: 'smooth' })
                        }}
                      >
                        Ver extrato
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 rounded-lg"
                          onClick={() => setEditing({ account: a, conn })}
                        >
                          {conn ? (
                            <Settings2 className="h-3.5 w-3.5" />
                          ) : (
                            <PlugZap className="h-3.5 w-3.5" />
                          )}
                          {conn ? 'Conexão' : 'Conectar ao banco'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {accounts.length === 0 && (
            <p className="text-sm text-slate-500">Cadastre as contas em Cadastros.</p>
          )}
        </div>
      )}

      {bankAccounts.length > 0 && (
        <div id="extrato" className={cn(cardClass, 'scroll-mt-4')}>
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center">
            <div className="px-1">
              <h2 className="font-semibold text-slate-900">Extrato</h2>
              {connOf(stAccount) && (
                <p className="text-xs text-slate-500">
                  {lastLineSync
                    ? `Do banco, atualizado ${timeAgo(lastLineSync, now)}`
                    : 'Aguardando a primeira busca no banco'}
                  {canEdit && connOf(stAccount)?.enabled && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        onClick={syncNow}
                        disabled={syncing || waiting}
                        className="font-semibold text-teal-700 hover:underline disabled:text-slate-400 disabled:no-underline"
                      >
                        {waiting ? 'buscando no banco…' : 'buscar agora'}
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Select
                value={stAccount}
                onValueChange={(v) => {
                  setStAccount(v)
                  setParams({ conta: v }, { replace: true })
                }}
              >
                <SelectTrigger
                  className="h-9 w-full rounded-lg sm:w-52"
                  aria-label="Conta do extrato"
                >
                  <SelectValue placeholder="Conta" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="h-9 w-full rounded-lg sm:w-44" aria-label="Período">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Este mês</SelectItem>
                  <SelectItem value="mes-passado">Mês passado</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="outro">Outro período</SelectItem>
                </SelectContent>
              </Select>
              {period === 'outro' && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={from || rangeFrom}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9 w-[150px]"
                    aria-label="De"
                  />
                  <span className="text-sm text-slate-400">a</span>
                  <Input
                    type="date"
                    value={to || rangeTo}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 w-[150px]"
                    aria-label="Até"
                  />
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg"
                disabled={lines.length === 0}
                onClick={exportCsv}
              >
                <Download className="h-4 w-4" />
                Planilha
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-200 text-center">
            <div className="p-3">
              <div className="text-xs text-slate-500">Entradas</div>
              <div className="text-sm font-bold tabular-nums sm:text-base text-emerald-700">
                {formatCents(summary.credits)}
              </div>
            </div>
            <div className="p-3">
              <div className="text-xs text-slate-500">Saídas</div>
              <div className="text-sm font-bold tabular-nums sm:text-base text-rose-700">
                {formatCents(summary.debits)}
              </div>
            </div>
            <div className="p-3">
              <div className="text-xs text-slate-500">Resultado</div>
              <div
                className={cn(
                  'text-sm font-bold tabular-nums sm:text-base',
                  summary.net < 0 ? 'text-rose-700' : 'text-slate-900',
                )}
              >
                {summary.net < 0 ? '− ' : ''}
                {formatCents(Math.abs(summary.net))}
              </div>
            </div>
          </div>

          {stLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : lines.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold text-slate-800">Nenhum movimento neste período</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                {connOf(stAccount)
                  ? 'Os movimentos chegam a cada busca no banco.'
                  : 'Conecte a conta ao banco ou importe o extrato OFX na Conciliação.'}
              </p>
            </div>
          ) : (
            <div>
              {[...summary.days].reverse().map((day) => (
                <div key={day.date}>
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-600">
                    <span>{shortDate(day.date, true)}</span>
                    <span className="tabular-nums">
                      {day.net < 0 ? '− ' : ''}
                      {formatCents(Math.abs(day.net))}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {day.lines.map((l) => {
                      const credit = l.amount_cents > 0
                      const tx = l.expand?.transaction_id
                      return (
                        <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div
                            className={cn(
                              'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                              credit
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700',
                            )}
                          >
                            {credit ? (
                              <ArrowDownLeft className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {l.description || 'Movimento'}
                            </div>
                            <div className="truncate text-xs">
                              {l.status === 'CONCILIADO' ? (
                                <span className="text-emerald-700">
                                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                                  {tx?.expand?.category_id?.name || 'Conciliado'}
                                </span>
                              ) : l.status === 'IGNORADO' ? (
                                <span className="text-slate-500">Ignorado</span>
                              ) : l.status === 'EXTRATO' ? (
                                <span className="text-slate-500">Só extrato</span>
                              ) : (
                                <Link
                                  to={`/financeiro/conciliacao?conta=${l.account_id}`}
                                  className="font-semibold text-amber-700 hover:underline"
                                >
                                  A conciliar
                                </Link>
                              )}
                            </div>
                          </div>
                          <div
                            className={cn(
                              'shrink-0 text-right text-sm font-semibold tabular-nums',
                              credit ? 'text-emerald-700' : 'text-rose-700',
                            )}
                          >
                            {credit ? '' : '− '}
                            {formatCents(Math.abs(l.amount_cents))}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && churchId && (
        <ConnectionDialog
          account={editing.account}
          conn={editing.conn}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await saveBankConnection(churchId, input, editing.conn?.id)
            toast({ title: editing.conn ? 'Conexão atualizada' : 'Conta conectada ao banco' })
            setEditing(null)
            // Histórico novo pedido numa conta já conectada: já pede a busca ao conector
            const old = editing.conn
            if (
              old?.enabled &&
              input.enabled &&
              (Boolean(old.history_max) !== Boolean(input.history_max) ||
                dayOf(old.history_from) !== dayOf(input.history_from))
            ) {
              syncNow()
            } else {
              load(true)
            }
          }}
          onDelete={
            editing.conn
              ? async () => {
                  await deleteBankConnection(editing.conn!.id)
                  toast({ title: 'Conexão removida' })
                  setEditing(null)
                  load(true)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function HistoryNote({ conn }: { conn?: FinBankConnection }) {
  const h = historyState(conn)
  if (!h || !conn?.enabled) return null
  if (h.done) {
    return h.loaded ? (
      <span className="text-xs text-slate-500">Histórico desde {shortDate(h.loaded, true)}</span>
    ) : null
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <Loader2 className="h-3 w-3 animate-spin" />
      {h.loaded
        ? `Buscando histórico, já em ${shortDate(h.loaded, true)}`
        : 'Histórico na próxima busca'}
    </span>
  )
}

function ConnectionBadge({ conn }: { conn?: FinBankConnection }) {
  if (!conn) {
    return (
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        Sem API
      </span>
    )
  }
  const label = PROVIDER_LABELS[conn.provider]
  if (!conn.enabled) {
    return (
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        {label} · pausada
      </span>
    )
  }
  if (conn.last_status === 'ERRO') {
    return (
      <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
        {label} · erro
      </span>
    )
  }
  if (!conn.last_sync_at) {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        {label} · aguardando
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      {label} · on-line
    </span>
  )
}

/** Agência ou conta como o Bradesco pede: só números, sem o dígito. */
const withoutDigit = (s?: string) => (s || '').split(/[-–]/)[0].replace(/\D/g, '')

function ConnectionDialog({
  account,
  conn,
  onClose,
  onSave,
  onDelete,
}: {
  account: FinAccount
  conn?: FinBankConnection
  onClose: () => void
  onSave: (input: BankConnectionInput) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const guess = /cora/i.test(`${account.bank_name} ${account.name}`) ? 'CORA' : 'BRADESCO'
  const [form, setForm] = useState<BankConnectionInput>({
    account_id: account.id,
    provider: conn?.provider || guess,
    environment: conn?.environment || 'PRODUCAO',
    branch: conn?.branch ?? withoutDigit(account.agency),
    account_number: conn?.account_number ?? withoutDigit(account.account_number),
    account_type: conn?.account_type || 'CC',
    credential_key: conn?.credential_key || '',
    enabled: conn?.enabled ?? true,
    auto_reconcile: conn?.auto_reconcile ?? true,
    initial_days: conn?.initial_days || 30,
    purpose: conn?.purpose || 'CONCILIAR',
    reconcile_from: conn?.reconcile_from || '',
    history_from: conn?.history_from || '',
    history_max: conn?.history_max ?? false,
  })
  const [history, setHistory] = useState<'none' | 'date' | 'max'>(
    conn?.history_max ? 'max' : conn?.history_from ? 'date' : 'none',
  )
  const reconcile = form.purpose !== 'VISUALIZAR'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<BankConnectionInput>) => setForm((f) => ({ ...f, ...patch }))
  const bradesco = form.provider === 'BRADESCO'

  const submit = async () => {
    setError('')
    if (bradesco && (!form.branch || !form.account_number)) {
      setError('Informe a agência e a conta do Bradesco, sem o dígito.')
      return
    }
    if (history === 'date' && !dayOf(form.history_from)) {
      setError('Escolha a data de início do histórico.')
      return
    }
    setBusy(true)
    try {
      await onSave({
        ...form,
        history_max: history === 'max',
        history_from: history === 'date' ? form.history_from : '',
        reconcile_from: reconcile ? form.reconcile_from : '',
        branch: bradesco ? form.branch : '',
        account_number: bradesco ? form.account_number : '',
        credential_key: (form.credential_key || '').toUpperCase(),
      })
    } catch (err) {
      setError(serverMessage(err, 'Não foi possível salvar.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{conn ? 'Conexão com o banco' : 'Conectar ao banco'}</DialogTitle>
          <DialogDescription>
            {account.name}: o LouvorFlow busca o saldo e o extrato sozinho
            {reconcile ? ' e concilia o que bater.' : '.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Select
                value={form.provider}
                onValueChange={(v) => set({ provider: v as BankConnectionInput['provider'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORA">Cora</SelectItem>
                  <SelectItem value="BRADESCO">Bradesco</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ambiente</Label>
              <Select
                value={form.environment}
                onValueChange={(v) => set({ environment: v as BankConnectionInput['environment'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCAO">Produção (conta real)</SelectItem>
                  <SelectItem value="TESTE">Teste do banco</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {bradesco && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bank-branch">Agência</Label>
                <Input
                  id="bank-branch"
                  inputMode="numeric"
                  value={form.branch}
                  onChange={(e) => set({ branch: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="3995"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-account">Conta</Label>
                <Input
                  id="bank-account"
                  inputMode="numeric"
                  value={form.account_number}
                  onChange={(e) =>
                    set({ account_number: e.target.value.replace(/\D/g, '').slice(0, 7) })
                  }
                  placeholder="75557"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.account_type || 'CC'}
                  onValueChange={(v) => set({ account_type: v as 'CC' | 'CP' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">Corrente</SelectItem>
                    <SelectItem value="CP">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="col-span-3 -mt-1 text-xs text-slate-500">Sem o dígito.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>O que fazer com o extrato</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Uso do extrato">
              {(
                [
                  ['CONCILIAR', 'Visualizar e conciliar', 'Os movimentos entram na Conciliação.'],
                  ['VISUALIZAR', 'Só visualizar', 'Acompanha o extrato, sem pendências.'],
                ] as const
              ).map(([value, title, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.purpose === value}
                  onClick={() => set({ purpose: value })}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    form.purpose === value
                      ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <span className="block text-sm font-semibold text-slate-800">{title}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </button>
              ))}
            </div>
            {conn && (conn.purpose || 'CONCILIAR') !== form.purpose && (
              <p className="text-xs text-slate-500">
                {reconcile
                  ? 'Os movimentos que estão só no extrato passam para a Conciliação.'
                  : 'Os movimentos ainda não conciliados saem da Conciliação e ficam só no extrato.'}
              </p>
            )}
          </div>

          {reconcile && (
            <div className="space-y-1.5">
              <Label htmlFor="bank-reconcile-from">Conciliar a partir de (opcional)</Label>
              <Input
                id="bank-reconcile-from"
                type="date"
                value={dayOf(form.reconcile_from)}
                onChange={(e) => set({ reconcile_from: pbDay(e.target.value) })}
                className="w-[170px]"
              />
              <p className="text-xs text-slate-500">
                Movimentos de antes dessa data ficam só no extrato, sem pendência.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Histórico do extrato</Label>
            <Select value={history} onValueChange={(v) => setHistory(v as typeof history)}>
              <SelectTrigger aria-label="Histórico do extrato">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Só a partir da primeira busca</SelectItem>
                <SelectItem value="date">Buscar desde uma data</SelectItem>
                <SelectItem value="max">Buscar tudo o que o banco tiver</SelectItem>
              </SelectContent>
            </Select>
            {history === 'date' && (
              <Input
                type="date"
                aria-label="Histórico desde"
                value={dayOf(form.history_from)}
                max={today()}
                onChange={(e) => set({ history_from: pbDay(e.target.value) })}
                className="w-[170px]"
              />
            )}
            {history !== 'none' && (
              <p className="text-xs text-slate-500">
                O conector busca em partes de 3 meses, do mais novo para o mais antigo, a cada
                rodada. Anos de extrato podem levar algumas rodadas.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bank-days">Na primeira busca, trazer</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="bank-days"
                  type="number"
                  min={1}
                  max={365}
                  value={form.initial_days || ''}
                  onChange={(e) =>
                    set({ initial_days: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })
                  }
                  className="w-20"
                />
                <span className="text-sm text-slate-500">dias</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-cred">Credencial (opcional)</Label>
              <Input
                id="bank-cred"
                value={form.credential_key}
                onChange={(e) =>
                  set({ credential_key: e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 30) })
                }
                placeholder="ex.: DIAMANTE"
              />
            </div>
          </div>

          {reconcile && (
            <label className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Conciliar sozinho
                </span>
                <span className="block text-xs text-slate-500">
                  Quando há um único lançamento com o mesmo valor e sentido em até 3 dias.
                </span>
              </span>
              <Switch
                checked={form.auto_reconcile}
                onCheckedChange={(v) => set({ auto_reconcile: v })}
              />
            </label>
          )}
          <label className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <span>
              <span className="block text-sm font-semibold text-slate-800">Buscar no banco</span>
              <span className="block text-xs text-slate-500">Desligue para pausar a conexão.</span>
            </span>
            <Switch checked={form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </label>

          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            O client ID, o certificado e a chave do banco são cadastrados pelo MASTER em{' '}
            <Link to="/configuracoes/integracoes" className="font-semibold text-teal-700 underline">
              Configurações › Integrações
            </Link>
            , junto com a chave do conector bancário.{' '}
            <a
              href={README_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-teal-700 underline"
            >
              Veja o passo a passo
            </a>
            .
          </div>
          {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {onDelete ? (
            <Button
              variant="ghost"
              className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onDelete()
                } catch (err) {
                  setError(serverMessage(err, 'Não foi possível remover.'))
                  setBusy(false)
                }
              }}
            >
              Remover conexão
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy} className={primaryButtonClass}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {conn ? 'Salvar' : 'Conectar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
