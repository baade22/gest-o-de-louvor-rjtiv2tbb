import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarCheck,
  CheckCheck,
  CheckCircle2,
  EyeOff,
  FileUp,
  Landmark,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Undo2,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { decodeOfx, parseOfx } from '@/lib/ofx'
import { accountBalances, daysBetween } from '@/lib/financeSummary'
import { sameSide, suggestMatches } from '@/lib/reconcile'
import {
  importStatement,
  listBankImports,
  listBankLines,
  listLedger,
  listOpenBills,
  listUnreconciled,
  reconcileLine,
  saveRegistry,
  setLineIgnored,
  unreconcileLine,
  type ReconcileTarget,
} from '@/services/finance'
import type {
  FinBankImport,
  FinBankLine,
  FinBill,
  FinSupplier,
  FinTransaction,
  Person,
} from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FinanceLookups } from './TransactionSheet'
import { useFinanceLookups } from './useFinanceLookups'
import {
  PAYMENT_METHOD_LABELS,
  PageHeader,
  ReadOnlyNotice,
  SearchPicker,
  cardClass,
  errorMessage,
  primaryButtonClass,
  shortDate,
  useFinanceAccess,
} from './shared'

const NONE = '__none__'
type StatusFilter = FinBankLine['status']

const serverMessage = (err: unknown, fallback: string) =>
  (err as { response?: { message?: string } })?.response?.message || errorMessage(err, fallback)

/** Quem ou o quê de um lançamento, em poucas palavras. */
function txLabel(tx: FinTransaction) {
  if (tx.type === 'TRANSFERENCIA') return tx.description || 'Transferência'
  const who = tx.is_anonymous
    ? 'Anônimo'
    : tx.expand?.person_id?.name || tx.expand?.supplier_id?.name || tx.description
  return [who, tx.expand?.category_id?.name].filter(Boolean).join(' · ') || 'Lançamento'
}

export default function FinanceReconcile() {
  const { currentChurch } = useAuth()
  const { canEdit } = useFinanceAccess()
  const { toast } = useToast()
  const churchId = currentChurch?.id
  const { lookups, reload: reloadLookups } = useFinanceLookups(churchId)
  const fileRef = useRef<HTMLInputElement>(null)

  const bankAccounts = useMemo(() => {
    const active = lookups.accounts.filter((a) => a.is_active)
    const banks = active.filter((a) => a.kind !== 'CAIXA')
    return banks.length ? banks : active
  }, [lookups.accounts])
  const [accountId, setAccountId] = useState('')
  useEffect(() => {
    if (!accountId && bankAccounts.length) setAccountId(bankAccounts[0].id)
  }, [accountId, bankAccounts])

  const [lines, setLines] = useState<FinBankLine[]>([])
  const [imports, setImports] = useState<FinBankImport[]>([])
  const [candidates, setCandidates] = useState<FinTransaction[]>([])
  const [bills, setBills] = useState<FinBill[]>([])
  const [ledger, setLedger] = useState<FinTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<StatusFilter>('PENDENTE')
  const [search, setSearch] = useState('')
  const [busyLine, setBusyLine] = useState('')
  const [bulk, setBulk] = useState(false)
  const [creating, setCreating] = useState<FinBankLine | null>(null)
  const [choosing, setChoosing] = useState<FinBankLine | null>(null)

  const load = useCallback(async () => {
    if (!churchId || !accountId) return
    setLoading(true)
    try {
      const [ls, imps, open, led] = await Promise.all([
        listBankLines(churchId, accountId),
        listBankImports(churchId, accountId).then((r) => r.items),
        listOpenBills(churchId),
        listLedger(churchId),
      ])
      const pending = ls.filter((l) => l.status === 'PENDENTE').map((l) => l.date.slice(0, 10))
      let txs: FinTransaction[] = []
      if (pending.length) {
        pending.sort()
        const from = new Date(`${pending[0]}T12:00:00Z`)
        from.setUTCDate(from.getUTCDate() - 45)
        const to = new Date(`${pending[pending.length - 1]}T12:00:00Z`)
        to.setUTCDate(to.getUTCDate() + 45)
        txs = await listUnreconciled(
          churchId,
          accountId,
          from.toISOString().slice(0, 10),
          to.toISOString().slice(0, 10),
        )
      }
      setLines(ls)
      setImports(imps)
      setBills(open)
      setLedger(led)
      setCandidates(txs)
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar o extrato', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [churchId, accountId, toast])

  useEffect(() => {
    load()
  }, [load])

  const account = lookups.accounts.find((a) => a.id === accountId)
  const pendingLines = useMemo(() => lines.filter((l) => l.status === 'PENDENTE'), [lines])
  const suggestions = useMemo(
    () => suggestMatches(pendingLines, candidates, bills, lookups.people),
    [pendingLines, candidates, bills, lookups.people],
  )
  const withTx = pendingLines.filter((l) => suggestions.get(l.id)?.tx)

  // Saldo do banco (último arquivo com saldo) x saldo no LouvorFlow na mesma data
  const lastBalance = imports.find((i) => i.has_balance)
  const balanceDate = (lastBalance?.balance_date || lastBalance?.end_date || '').slice(0, 10)
  const systemBalance = useMemo(() => {
    if (!account) return 0
    const upTo = balanceDate ? ledger.filter((tx) => tx.date.slice(0, 10) <= balanceDate) : ledger
    return accountBalances([account], upTo)[account.id] || 0
  }, [account, ledger, balanceDate])
  const balanceDiff = lastBalance ? (lastBalance.balance_cents || 0) - systemBalance : 0

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return lines.filter(
      (l) =>
        l.status === status &&
        (!term ||
          `${l.description || ''} ${formatCents(Math.abs(l.amount_cents))}`
            .toLowerCase()
            .includes(term)),
    )
  }, [lines, status, search])

  const counts = {
    PENDENTE: pendingLines.length,
    CONCILIADO: lines.filter((l) => l.status === 'CONCILIADO').length,
    IGNORADO: lines.filter((l) => l.status === 'IGNORADO').length,
  }

  const handleFile = async (file: File) => {
    if (!accountId) return
    setImporting(true)
    try {
      const st = parseOfx(decodeOfx(await file.arrayBuffer()))
      if (st.lines.length === 0) throw new Error('O arquivo não tem movimentos.')
      const res = await importStatement(accountId, file.name, st)
      toast({
        title:
          res.created === 0
            ? 'Nada novo neste arquivo'
            : `${res.created} ${res.created === 1 ? 'movimento importado' : 'movimentos importados'}`,
        description: res.skipped
          ? `${res.skipped} já ${res.skipped === 1 ? 'tinha sido importado' : 'tinham sido importados'} antes.`
          : undefined,
      })
      setStatus('PENDENTE')
      load()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Não foi possível importar',
        description:
          err instanceof Error && !('status' in err)
            ? err.message
            : serverMessage(err, 'Confira se o arquivo é o OFX do banco.'),
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const run = async (line: FinBankLine, action: () => Promise<unknown>, done: string) => {
    setBusyLine(line.id)
    try {
      await action()
      toast({ title: done })
      await load()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Não deu certo',
        description: serverMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setBusyLine('')
    }
  }

  const reconcile = (line: FinBankLine, target: ReconcileTarget, done = 'Movimento conciliado') =>
    run(line, () => reconcileLine(line.id, target), done)

  const reconcileAll = async () => {
    setBulk(true)
    let ok = 0
    for (const line of withTx) {
      const tx = suggestions.get(line.id)?.tx
      if (!tx) continue
      try {
        await reconcileLine(line.id, { transaction_id: tx.id })
        ok++
      } catch (err) {
        console.error(err)
      }
    }
    setBulk(false)
    toast({
      title: `${ok} ${ok === 1 ? 'movimento conciliado' : 'movimentos conciliados'}`,
      description:
        ok < withTx.length ? `${withTx.length - ok} não deram certo; confira um por um.` : '',
    })
    load()
  }

  const statusChips: { value: StatusFilter; label: string }[] = [
    { value: 'PENDENTE', label: 'A conciliar' },
    { value: 'CONCILIADO', label: 'Conciliados' },
    { value: 'IGNORADO', label: 'Ignorados' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Conciliação bancária"
        subtitle="Importe o extrato do banco e confira cada movimento com os lançamentos"
      >
        {bankAccounts.length > 0 && (
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-10 w-full rounded-lg bg-white sm:w-60" aria-label="Conta">
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
        )}
        {canEdit && accountId && (
          <>
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className={primaryButtonClass}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              Importar extrato OFX
            </Button>
            <input
              ref={fileRef}
              type="file"
              // Sem "accept": o .ofx não tem tipo registrado e alguns navegadores (celular,
              // Safari) passam a liberar só .txt. O conteúdo é conferido na leitura.
              className="hidden"
              aria-label="Arquivo OFX"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </>
        )}
      </PageHeader>

      {!canEdit && <ReadOnlyNotice />}

      {lookups.accounts.length > 0 && bankAccounts.length === 0 && (
        <p className="text-sm text-slate-500">Cadastre uma conta bancária em Cadastros.</p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div className={cn(cardClass, 'min-w-0 p-4')}>
            <div className="text-[13px] font-medium text-slate-600">A conciliar</div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-slate-900">
              {counts.PENDENTE}
            </div>
            <div className="text-xs text-slate-500">
              {withTx.length > 0
                ? `${withTx.length} com lançamento correspondente`
                : counts.PENDENTE
                  ? 'Lance ou ligue cada um'
                  : 'Tudo em dia'}
            </div>
          </div>
          <div className={cn(cardClass, 'min-w-0 p-4')}>
            <div className="text-[13px] font-medium text-slate-600">Conciliados</div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-slate-900">
              {counts.CONCILIADO}
            </div>
            <div className="truncate text-xs text-slate-500">
              {imports[0]
                ? `Último extrato até ${shortDate(imports[0].end_date || imports[0].created, true)}`
                : 'Nenhum extrato importado'}
            </div>
          </div>
          <div className={cn(cardClass, 'col-span-2 min-w-0 p-4 lg:col-span-1')}>
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
              <Landmark className="h-4 w-4 text-slate-400" />
              Saldo no banco
              {balanceDate && (
                <span className="text-slate-400">em {shortDate(balanceDate, true)}</span>
              )}
            </div>
            {lastBalance ? (
              <>
                <div className="mt-2 text-[22px] font-bold tabular-nums text-slate-900">
                  {formatCents(lastBalance.balance_cents || 0)}
                </div>
                <div
                  className={cn(
                    'text-xs font-semibold',
                    balanceDiff === 0 ? 'text-emerald-700' : 'text-amber-700',
                  )}
                >
                  {balanceDiff === 0
                    ? 'Igual ao saldo no LouvorFlow'
                    : `LouvorFlow mostra ${formatCents(systemBalance)} (diferença de ${formatCents(Math.abs(balanceDiff))})`}
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Aparece quando o arquivo do banco traz o saldo.
              </p>
            )}
          </div>
        </div>
      )}

      <div className={cardClass}>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {statusChips.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={cn(
                  'h-8 rounded-full border px-3 text-[12.5px] font-semibold transition-colors',
                  status === f.value
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300',
                )}
              >
                {f.label}
                {counts[f.value] > 0 && <span className="ml-1 opacity-70">{counts[f.value]}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
            {canEdit && status === 'PENDENTE' && withTx.length > 1 && (
              <Button
                variant="outline"
                onClick={reconcileAll}
                disabled={bulk}
                className="h-9 gap-2 rounded-lg font-semibold"
              >
                {bulk ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4" />
                )}
                Conciliar os {withTx.length} correspondentes
              </Button>
            )}
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar no extrato…"
                className="h-9 rounded-lg pl-9"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-slate-800">
              {lines.length === 0
                ? 'Nenhum extrato importado nesta conta'
                : status === 'PENDENTE'
                  ? 'Nada para conciliar'
                  : status === 'CONCILIADO'
                    ? 'Nenhum movimento conciliado ainda'
                    : 'Nenhum movimento ignorado'}
            </p>
            {lines.length === 0 && (
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                No internet banking, exporte o extrato no formato OFX (às vezes chamado de “Money”)
                e use “Importar extrato OFX”. Os PIX e as tarifas aparecem aqui para lançar.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((line) => {
              const credit = line.amount_cents > 0
              const s = suggestions.get(line.id)
              const tx = line.expand?.transaction_id
              const busy = busyLine === line.id || bulk
              return (
                <li
                  key={line.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                        credit ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                      )}
                    >
                      {credit ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="w-12 shrink-0 text-sm tabular-nums text-slate-500">
                      {shortDate(line.date)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">
                        {line.description || 'Movimento'}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {line.status === 'CONCILIADO' ? (
                          <span className="text-emerald-700">
                            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                            {tx ? txLabel(tx) : 'Conciliado'}
                            {line.reconciled_by_name ? ` · por ${line.reconciled_by_name}` : ''}
                          </span>
                        ) : line.status === 'IGNORADO' ? (
                          'Ignorado: fica fora das pendências'
                        ) : s?.tx ? (
                          <span className="text-teal-800">
                            <Link2 className="mr-1 inline h-3.5 w-3.5" />
                            Corresponde a {txLabel(s.tx)} de {shortDate(s.tx.date)}
                          </span>
                        ) : s?.bill ? (
                          <span className="text-amber-800">
                            <CalendarCheck className="mr-1 inline h-3.5 w-3.5" />
                            {credit ? 'Conta a receber' : 'Conta a pagar'}: {s.bill.description}{' '}
                            (vence {shortDate(s.bill.due_date)})
                          </span>
                        ) : s?.person ? (
                          <span>
                            <UserRound className="mr-1 inline h-3.5 w-3.5" />
                            Parece ser de {s.person.name}
                          </span>
                        ) : (
                          'Sem lançamento correspondente'
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'shrink-0 text-right font-semibold tabular-nums',
                        credit ? 'text-emerald-700' : 'text-rose-700',
                      )}
                    >
                      {credit ? '' : '− '}
                      {formatCents(Math.abs(line.amount_cents))}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex shrink-0 items-center justify-end gap-1.5 pl-12 sm:pl-0">
                      {line.status === 'PENDENTE' &&
                        (s?.tx ? (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => reconcile(line, { transaction_id: s.tx!.id })}
                            className="h-8 gap-1.5 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
                          >
                            {busyLine === line.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" />
                            )}
                            Conciliar
                          </Button>
                        ) : s?.bill ? (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              reconcile(
                                line,
                                { bill_id: s.bill!.id, payment_method: credit ? 'PIX' : 'BOLETO' },
                                credit ? 'Conta recebida e conciliada' : 'Conta paga e conciliada',
                              )
                            }
                            className="h-8 gap-1.5 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
                          >
                            <CalendarCheck className="h-3.5 w-3.5" />
                            {credit ? 'Receber' : 'Pagar'} conta
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setCreating(line)}
                            className="h-8 gap-1.5 rounded-lg font-semibold"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Lançar
                          </Button>
                        ))}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            className="h-8 w-8"
                            aria-label="Ações"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {line.status === 'PENDENTE' && (
                            <>
                              {(s?.tx || s?.bill) && (
                                <DropdownMenuItem onClick={() => setCreating(line)}>
                                  <Plus className="mr-2 h-4 w-4" /> Lançar como novo
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setChoosing(line)}>
                                <Link2 className="mr-2 h-4 w-4" /> Escolher lançamento
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  run(
                                    line,
                                    () => setLineIgnored(line.id, true),
                                    'Movimento ignorado',
                                  )
                                }
                              >
                                <EyeOff className="mr-2 h-4 w-4" /> Ignorar
                              </DropdownMenuItem>
                            </>
                          )}
                          {line.status === 'CONCILIADO' && (
                            <DropdownMenuItem
                              onClick={() =>
                                run(line, () => unreconcileLine(line.id), 'Conciliação desfeita')
                              }
                            >
                              <Undo2 className="mr-2 h-4 w-4" /> Desfazer conciliação
                            </DropdownMenuItem>
                          )}
                          {line.status === 'IGNORADO' && (
                            <DropdownMenuItem
                              onClick={() =>
                                run(
                                  line,
                                  () => setLineIgnored(line.id, false),
                                  'Movimento voltou para a conciliação',
                                )
                              }
                            >
                              <Undo2 className="mr-2 h-4 w-4" /> Voltar para a conciliação
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {status === 'CONCILIADO' && counts.CONCILIADO > 0 && (
        <p className="text-xs text-slate-500">
          Desfazer a conciliação não apaga o lançamento. Para tirar um lançamento dos saldos,
          estorne em{' '}
          <Link to="/financeiro/lancamentos" className="underline">
            Lançamentos
          </Link>
          .
        </p>
      )}

      {churchId && (
        <CreateFromLineDialog
          line={creating}
          churchId={churchId}
          lookups={lookups}
          suggestedPerson={creating ? suggestions.get(creating.id)?.person : undefined}
          onClose={() => setCreating(null)}
          onLookupsChanged={reloadLookups}
          onDone={(target) => creating && reconcile(creating, target, 'Lançado e conciliado')}
        />
      )}

      <ChooseTransactionDialog
        line={choosing}
        candidates={candidates}
        onClose={() => setChoosing(null)}
        onChoose={(tx) => choosing && reconcile(choosing, { transaction_id: tx.id })}
      />
    </div>
  )
}

// ---- Lançar a partir do movimento ----

function CreateFromLineDialog({
  line,
  churchId,
  lookups,
  suggestedPerson,
  onClose,
  onLookupsChanged,
  onDone,
}: {
  line: FinBankLine | null
  churchId: string
  lookups: FinanceLookups
  suggestedPerson?: Person
  onClose: () => void
  onLookupsChanged: () => void
  onDone: (target: ReconcileTarget) => Promise<unknown>
}) {
  const credit = (line?.amount_cents || 0) > 0
  const [mode, setMode] = useState<'LANCAMENTO' | 'TRANSFERENCIA'>('LANCAMENTO')
  const [categoryId, setCategoryId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [personId, setPersonId] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [description, setDescription] = useState('')
  const [method, setMethod] = useState('PIX')
  const [otherAccount, setOtherAccount] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!line) return
    setMode('LANCAMENTO')
    setCategoryId('')
    setCostCenterId('')
    setPersonId(suggestedPerson?.id || '')
    setAnonymous(false)
    setSupplierId('')
    setDescription((line.description || '').slice(0, 200))
    setMethod(/TARIFA|TAR\b|CESTA|PACOTE/i.test(line.description || '') ? 'OUTRO' : 'PIX')
    setOtherAccount('')
    // Só reinicia ao abrir outro movimento
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [line])

  const direction = credit ? 'ENTRADA' : 'SAIDA'
  const categories = lookups.categories.filter((c) => c.direction === direction && c.is_active)
  const category = lookups.categories.find((c) => c.id === categoryId)
  const isContribution = credit && Boolean(category?.is_contribution)
  const costCenters = lookups.costCenters.filter((c) => c.is_active)
  // Atalhos para o que mais aparece no extrato
  const shortcuts = categories.filter((c) =>
    credit ? /d[ií]zimo|rendiment/i.test(c.name) : /tarifa/i.test(c.name),
  )
  const others = lookups.accounts.filter((a) => a.is_active && a.id !== line?.account_id)

  const createSupplier = async (name: string) => {
    const s = await saveRegistry<FinSupplier>('fin_suppliers', churchId, { name })
    onLookupsChanged()
    return s.id
  }
  const createPerson = async (name: string) => {
    const p = await saveRegistry<Person>('people', churchId, { name })
    onLookupsChanged()
    return p.id
  }

  const submit = async () => {
    if (mode === 'TRANSFERENCIA' && !otherAccount) {
      toast({ title: 'Escolha a outra conta', variant: 'destructive' })
      return
    }
    if (mode === 'LANCAMENTO' && !categoryId) {
      toast({ title: 'Escolha a categoria', variant: 'destructive' })
      return
    }
    if (mode === 'LANCAMENTO' && isContribution && !anonymous && !personId) {
      toast({
        title: 'Quem contribuiu?',
        description: 'Escolha a pessoa ou marque como anônimo.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      await onDone({
        create:
          mode === 'TRANSFERENCIA'
            ? { transfer_account_id: otherAccount, description, payment_method: 'TRANSFERENCIA' }
            : {
                category_id: categoryId,
                cost_center_id: costCenterId,
                person_id: isContribution && !anonymous ? personId : '',
                is_anonymous: isContribution && anonymous,
                supplier_id: credit ? '' : supplierId,
                description,
                payment_method: method,
              },
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel = 'text-xs font-semibold text-slate-600'

  return (
    <Dialog open={Boolean(line)} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {credit ? 'Lançar entrada' : 'Lançar saída'} de{' '}
            {formatCents(Math.abs(line?.amount_cents || 0))}
          </DialogTitle>
          <DialogDescription>
            {line &&
              `${shortDate(line.date, true)} · ${line.description || 'Movimento do extrato'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                {
                  value: 'LANCAMENTO',
                  label: credit ? 'Entrada' : 'Saída',
                  icon: credit ? ArrowDownLeft : ArrowUpRight,
                },
                { value: 'TRANSFERENCIA', label: 'Transferência', icon: ArrowLeftRight },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-semibold',
                  mode === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'TRANSFERENCIA' ? (
            <div className="space-y-1.5">
              <Label className={fieldLabel}>{credit ? 'Veio da conta' : 'Foi para a conta'}</Label>
              <Select value={otherAccount} onValueChange={setOtherAccount}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Ex.: depósito do dinheiro do caixa no banco. Não conta como entrada nem saída.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Categoria</Label>
                {shortcuts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {shortcuts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(c.id)}
                        className={cn(
                          'h-7 rounded-full border px-2.5 text-xs font-semibold',
                          categoryId === c.id
                            ? 'border-teal-200 bg-teal-50 text-teal-800'
                            : 'border-slate-200 text-slate-600',
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Escolha a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isContribution && (
                <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
                  <Label className={fieldLabel}>Quem contribuiu</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
                    <button
                      type="button"
                      onClick={() => setAnonymous(false)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-semibold',
                        !anonymous ? 'bg-teal-700 text-white' : 'text-slate-500',
                      )}
                    >
                      <UserRound className="h-4 w-4" /> Pessoa
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnonymous(true)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-semibold',
                        anonymous ? 'bg-teal-700 text-white' : 'text-slate-500',
                      )}
                    >
                      <EyeOff className="h-4 w-4" /> Anônimo
                    </button>
                  </div>
                  {!anonymous && (
                    <SearchPicker
                      value={personId}
                      onChange={setPersonId}
                      placeholder="Buscar pessoa"
                      options={lookups.people
                        .filter((p) => p.is_active || p.id === personId)
                        .map((p) => ({ id: p.id, label: p.name, hint: p.phone }))}
                      onCreate={createPerson}
                      createLabel="Cadastrar pessoa"
                    />
                  )}
                </div>
              )}

              {!credit && (
                <div className="space-y-1.5">
                  <Label className={fieldLabel}>Fornecedor (opcional)</Label>
                  <SearchPicker
                    value={supplierId}
                    onChange={setSupplierId}
                    placeholder="Para quem foi pago"
                    options={lookups.suppliers
                      .filter((s) => s.is_active || s.id === supplierId)
                      .map((s) => ({ id: s.id, label: s.name }))}
                    onCreate={createSupplier}
                    createLabel="Cadastrar fornecedor"
                  />
                </div>
              )}

              <div className={cn('grid gap-3', costCenters.length > 1 && 'grid-cols-2')}>
                <div className="space-y-1.5">
                  <Label className={fieldLabel}>Forma</Label>
                  <Select
                    value={method || NONE}
                    onValueChange={(v) => setMethod(v === NONE ? '' : v)}
                  >
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informar</SelectItem>
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {costCenters.length > 1 && (
                  <div className="space-y-1.5">
                    <Label className={fieldLabel}>Centro de custo</Label>
                    <Select
                      value={costCenterId || NONE}
                      onValueChange={(v) => setCostCenterId(v === NONE ? '' : v)}
                    >
                      <SelectTrigger className="h-10 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Geral</SelectItem>
                        {costCenters.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rec-desc" className={fieldLabel}>
              Descrição
            </Label>
            <Input
              id="rec-desc"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 rounded-lg"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={saving} onClick={onClose} className="rounded-lg">
            Voltar
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="gap-2 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Lançar e conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Escolher um lançamento que já existe ----

function ChooseTransactionDialog({
  line,
  candidates,
  onClose,
  onChoose,
}: {
  line: FinBankLine | null
  candidates: FinTransaction[]
  onClose: () => void
  onChoose: (tx: FinTransaction) => Promise<unknown>
}) {
  const options = useMemo(() => {
    if (!line) return []
    const abs = Math.abs(line.amount_cents)
    return candidates
      .filter((tx) => sameSide(line, tx) && tx.amount_cents === abs)
      .sort(
        (a, b) =>
          Math.abs(daysBetween(line.date, a.date)) - Math.abs(daysBetween(line.date, b.date)),
      )
  }, [line, candidates])

  return (
    <Dialog open={Boolean(line)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher lançamento</DialogTitle>
          <DialogDescription>
            {line &&
              `Lançamentos de ${formatCents(Math.abs(line.amount_cents))} nesta conta, ainda não conciliados.`}
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-600">
            Nenhum lançamento com esse valor perto dessa data. Se o lançamento foi feito com outro
            valor ou em outra conta, corrija em Lançamentos e volte aqui.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {options.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={async () => {
                    onClose()
                    await onChoose(tx)
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="w-12 shrink-0 tabular-nums text-slate-500">
                    {shortDate(tx.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                    {txLabel(tx)}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCents(tx.amount_cents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
