import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Info,
  Loader2,
  Lock,
  LockOpen,
  OctagonAlert,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { shiftMonth } from '@/lib/financeSummary'
import { brtDateTime, brtDay } from '@/lib/bankStatement'
import {
  checkClosing,
  closeMonth,
  listClosings,
  lockedUntil as lastLocked,
  reopenMonth,
} from '@/services/finance'
import type {
  FinClosing,
  FinClosingCheck,
  FinClosingItem,
  FinClosingSummary,
} from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  errorMessage,
  monthLabel,
  monthShort,
  primaryButtonClass,
  useFinanceAccess,
} from './shared'

const serverMessage = (err: unknown, fallback: string) =>
  (err as { response?: { message?: string } })?.response?.message || errorMessage(err, fallback)

const currentMonth = () => brtDay(new Date().toISOString()).slice(0, 7)
const monthName = (ym: string) => monthLabel(ym).split(' de ')[0].toLowerCase()

/** Mês sugerido: o primeiro aberto que já terminou, ou o último fechado. */
function suggestedMonth(locked: string, current: string) {
  const previous = shiftMonth(current, -1)
  if (!locked) return previous
  const next = shiftMonth(locked, 1)
  return next < current ? next : locked
}

const LEVEL_STYLE: Record<FinClosingItem['level'], { icon: typeof Check; className: string }> = {
  ok: { icon: Check, className: 'bg-emerald-50 text-emerald-700' },
  warning: { icon: AlertTriangle, className: 'bg-amber-50 text-amber-700' },
  blocking: { icon: OctagonAlert, className: 'bg-red-50 text-red-600' },
  info: { icon: Info, className: 'bg-slate-100 text-slate-500' },
}

function Checklist({ items, readOnly }: { items: FinClosingItem[]; readOnly?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const style = LEVEL_STYLE[item.level] || LEVEL_STYLE.info
        const Icon = style.icon
        return (
          <li key={item.key} className="flex items-start gap-3 px-5 py-3.5">
            <span
              className={cn(
                'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                style.className,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{item.title}</p>
              {item.detail && <p className="mt-0.5 text-sm text-slate-500">{item.detail}</p>}
            </div>
            {!readOnly && item.link && (item.level === 'blocking' || item.level === 'warning') && (
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to={item.link}>
                  Resolver
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Summary({ summary, month }: { summary: FinClosingSummary; month: string }) {
  const { totals } = summary
  return (
    <div className={cardClass}>
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="font-semibold text-slate-900">Resumo de {monthName(month)}</h3>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        <div className="flex justify-between px-5 py-3">
          <dt className="text-slate-500">Saldo inicial</dt>
          <dd className="tabular-nums">{formatCents(totals.opening)}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-slate-500">Entradas</dt>
          <dd className="tabular-nums text-emerald-700">+ {formatCents(totals.income)}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-slate-500">Saídas</dt>
          <dd className="tabular-nums text-red-600">− {formatCents(totals.expense)}</dd>
        </div>
        <div className="flex justify-between px-5 py-3 font-semibold text-slate-900">
          <dt>Saldo final</dt>
          <dd className="tabular-nums">{formatCents(totals.closing)}</dd>
        </div>
      </dl>
      {summary.accounts.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Saldo final por conta
          </p>
          <ul className="space-y-1.5 text-sm">
            {summary.accounts.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className="truncate text-slate-600">
                  {a.name}
                  {a.congregation && <span className="text-slate-400"> · {a.congregation}</span>}
                </span>
                <span className="tabular-nums text-slate-800">{formatCents(a.closing_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function FinanceClosing() {
  const { currentChurch, isMaster } = useAuth()
  const churchId = currentChurch?.id
  const { canEdit } = useFinanceAccess()
  const { toast } = useToast()

  const [closings, setClosings] = useState<FinClosing[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [month, setMonth] = useState('')
  const [check, setCheck] = useState<FinClosingCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reopening, setReopening] = useState(false)

  const current = currentMonth()
  const locked = lastLocked(closings)

  const loadClosings = useCallback(async () => {
    if (!churchId) return
    setLoadingList(true)
    try {
      const rows = await listClosings(churchId)
      setClosings(rows)
      return rows
    } catch (err) {
      toast({
        title: errorMessage(err, 'Não foi possível carregar os fechamentos.'),
        variant: 'destructive',
      })
    } finally {
      setLoadingList(false)
    }
  }, [churchId, toast])

  useEffect(() => {
    loadClosings().then((rows) => {
      if (rows) setMonth(suggestedMonth(lastLocked(rows), currentMonth()))
    })
  }, [loadClosings])

  const isClosedMonth = !!month && !!locked && month <= locked
  const record = useMemo(
    () => closings.find((c) => c.status === 'FECHADO' && c.month === month),
    [closings, month],
  )

  useEffect(() => {
    if (!churchId || !month || isClosedMonth) {
      setCheck(null)
      return
    }
    let alive = true
    setChecking(true)
    checkClosing(churchId, month)
      .then((res) => alive && setCheck(res))
      .catch((err) => {
        if (alive)
          toast({
            title: serverMessage(err, 'Não foi possível conferir o mês.'),
            variant: 'destructive',
          })
      })
      .finally(() => alive && setChecking(false))
    return () => {
      alive = false
    }
  }, [churchId, month, isClosedMonth, toast])

  // Faixa de meses: os 6 até o mês passado (ou até o selecionado, se for mais novo)
  const strip = useMemo(() => {
    const last = shiftMonth(current, -1)
    return Array.from({ length: 6 }, (_, i) => shiftMonth(last, i - 5))
  }, [current])

  async function handleClose() {
    if (!churchId || !check) return
    setClosing(true)
    try {
      await closeMonth(churchId, month, notes.trim())
      toast({
        title: `${monthLabel(month)} fechado. Os lançamentos até ${monthName(month)} estão travados.`,
      })
      setNotes('')
      const rows = await loadClosings()
      if (rows) setMonth(month)
    } catch (err) {
      toast({
        title: serverMessage(err, 'Não foi possível fechar o mês.'),
        variant: 'destructive',
      })
    } finally {
      setClosing(false)
    }
  }

  async function handleReopen() {
    if (!churchId) return
    setReopening(true)
    try {
      const res = await reopenMonth(churchId, reason.trim())
      toast({ title: `${monthLabel(res.reopened)} reaberto.` })
      setReopenOpen(false)
      setReason('')
      await loadClosings()
      setMonth(res.reopened)
    } catch (err) {
      toast({
        title: serverMessage(err, 'Não foi possível reabrir o mês.'),
        variant: 'destructive',
      })
    } finally {
      setReopening(false)
    }
  }

  const blocking = check?.items.filter((i) => i.level === 'blocking').length || 0
  const okCount = check?.items.filter((i) => i.level === 'ok').length || 0
  const alsoCloses =
    check && check.from_month && check.from_month < month
      ? `Também trava ${monthLabel(check.from_month).toLowerCase()} até o mês escolhido.`
      : check && !check.from_month && !locked
        ? 'É o primeiro fechamento: trava tudo o que foi lançado até o fim do mês.'
        : ''

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fechamento do mês"
        subtitle="Confira tudo, feche e o mês fica travado para edição."
      />
      {!canEdit && <ReadOnlyNotice />}

      {locked && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center">
          <Lock className="h-4 w-4 shrink-0 text-slate-500" />
          <p className="flex-1">
            Fechado até <b>{monthLabel(locked).toLowerCase()}</b>. Lançamentos, contagens e saldos
            iniciais até lá não podem ser alterados; dá para anexar comprovante e conciliar com o
            extrato.
          </p>
          {isMaster && (
            <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}>
              <LockOpen className="h-4 w-4" />
              Reabrir {monthName(locked)}
            </Button>
          )}
        </div>
      )}

      <div className={cn(cardClass, 'p-4')}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {loadingList
            ? strip.map((m) => <Skeleton key={m} className="h-[62px] rounded-lg" />)
            : strip.map((m) => {
                const closed = !!locked && m <= locked
                const selected = m === month
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonth(m)}
                    className={cn(
                      'rounded-lg border px-2 py-2.5 text-center text-sm transition',
                      closed
                        ? 'border-slate-200 bg-slate-50 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      selected && 'border-teal-600 ring-2 ring-teal-100',
                    )}
                  >
                    <span className="block font-semibold capitalize text-slate-800">
                      {monthShort(m)} {m.slice(2, 4)}
                    </span>
                    <span className="mt-0.5 flex items-center justify-center gap-1 text-xs">
                      {closed ? (
                        <>
                          <Lock className="h-3 w-3" /> Fechado
                        </>
                      ) : (
                        'Aberto'
                      )}
                    </span>
                  </button>
                )
              })}
        </div>
      </div>

      {month && isClosedMonth && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
              <h3 className="font-semibold text-slate-900">{monthLabel(month)}</h3>
              <span className="text-sm text-slate-500">
                {record
                  ? `fechado por ${record.closed_by_name || 'alguém'} em ${brtDateTime(record.closed_at || record.created)}`
                  : 'travado por um fechamento posterior'}
              </span>
            </div>
            {record?.checklist?.length ? (
              <>
                <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Conferência no dia do fechamento
                </p>
                <Checklist items={record.checklist} readOnly />
              </>
            ) : (
              <p className="px-5 py-6 text-sm text-slate-500">
                Este mês foi travado junto com o fechamento de um mês seguinte.
              </p>
            )}
            {record?.notes && (
              <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                <b>Observação:</b> {record.notes}
              </p>
            )}
          </div>
          {record?.summary && <Summary summary={record.summary} month={month} />}
        </div>
      )}

      {month && !isClosedMonth && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
              <h3 className="font-semibold text-slate-900">Conferência de {monthName(month)}</h3>
              {check && (
                <span className="text-sm text-slate-500">
                  {okCount} de {check.items.length} itens ok
                </span>
              )}
              {check && (
                <div className="ml-auto h-1.5 w-36 overflow-hidden rounded-full bg-slate-100">
                  <i
                    className="block h-full rounded-full bg-teal-600"
                    style={{
                      width: `${(okCount / Math.max(check.items.length, 1)) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
            {checking || !check ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <Checklist items={check.items} />
            )}
          </div>

          <div className="flex flex-col gap-5">
            {check && <Summary summary={check.summary} month={month} />}
            <div className={cn(cardClass, 'flex flex-col gap-3 p-5')}>
              <div>
                <p className="font-semibold text-slate-900">Fechar {monthName(month)}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Depois de fechado, ninguém altera lançamentos até o fim do mês. Só o MASTER
                  reabre, explicando o motivo.
                </p>
              </div>
              {alsoCloses && <p className="text-sm text-amber-700">{alsoCloses}</p>}
              {canEdit && (
                <div className="space-y-1.5">
                  <Label htmlFor="closing-notes">Observação (opcional)</Label>
                  <Textarea
                    id="closing-notes"
                    value={notes}
                    onChange={(ev) => setNotes(ev.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="Ex.: conferido com o conselho fiscal"
                  />
                </div>
              )}
              <Button
                className={primaryButtonClass}
                disabled={!canEdit || !check?.can_close || closing}
                onClick={handleClose}
              >
                {closing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Fechar {monthName(month)}
              </Button>
              {check && !check.can_close && (
                <p className="text-center text-xs text-slate-500">
                  {month >= current
                    ? 'O mês ainda não terminou.'
                    : blocking
                      ? `Resolva ${blocking === 1 ? 'a pendência marcada' : `as ${blocking} pendências marcadas`} em vermelho para liberar.`
                      : check.problems.join(' ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {closings.length > 0 && (
        <div className={cardClass}>
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Histórico</h3>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {closings.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="w-36 font-medium text-slate-800">{monthLabel(c.month)}</span>
                {c.status === 'FECHADO' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    <Lock className="h-3 w-3" /> Fechado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <LockOpen className="h-3 w-3" /> Reaberto
                  </span>
                )}
                <span className="text-slate-500">
                  por {c.closed_by_name || 'alguém'} em {brtDateTime(c.closed_at || c.created)}
                </span>
                {c.status === 'REABERTO' && (
                  <span className="w-full text-slate-500 sm:w-auto">
                    · reaberto por {c.reopened_by_name} em {brtDateTime(c.reopened_at || c.updated)}
                    : “{c.reopen_reason}”
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir {locked && monthLabel(locked).toLowerCase()}?</DialogTitle>
            <DialogDescription>
              O mês volta a aceitar lançamentos e alterações. O motivo fica registrado no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reopen-reason">Motivo</Label>
            <Textarea
              id="reopen-reason"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex.: lançamento duplicado no dia 14"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleReopen} disabled={reason.trim().length < 5 || reopening}>
              {reopening && <Loader2 className="h-4 w-4 animate-spin" />}
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
