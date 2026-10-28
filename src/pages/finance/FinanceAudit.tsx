import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCheck, Loader2, MessageSquare, Paperclip, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { shiftMonth } from '@/lib/financeSummary'
import { brtDay } from '@/lib/bankStatement'
import {
  auditTransactions,
  listAuditComments,
  listAudits,
  listClosings,
  listTransactionsOfMonth,
  lockedUntil,
  openAttachment,
} from '@/services/finance'
import type { FinAudit, FinAuditComment, FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  MonthSwitcher,
  PageHeader,
  cardClass,
  errorMessage,
  monthLabel,
  primaryButtonClass,
  shortDate,
  useFinanceAccess,
} from './shared'

type Situation = 'FALTA' | 'ALTERADO' | 'APROVADO' | 'RESSALVA' | 'RESPONDIDA'
type Filter = 'pendentes' | 'todos' | 'aprovados'

const SITUATION: Record<Situation, { label: string; className: string }> = {
  FALTA: { label: 'Falta auditar', className: 'border border-slate-200 text-slate-600' },
  ALTERADO: {
    label: 'Alterado depois da aprovação',
    className: 'border border-amber-200 bg-amber-50 text-amber-800',
  },
  APROVADO: { label: 'Aprovado', className: 'bg-emerald-50 text-emerald-700' },
  RESSALVA: { label: 'Ressalva', className: 'bg-orange-100 text-orange-800' },
  RESPONDIDA: { label: 'Ressalva respondida', className: 'bg-amber-50 text-amber-800' },
}

const serverMessage = (err: unknown, fallback: string) =>
  (err as { response?: { message?: string } })?.response?.message || errorMessage(err, fallback)

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

function txTitle(tx: FinTransaction) {
  return (
    tx.description ||
    tx.expand?.category_id?.name ||
    (tx.type === 'TRANSFERENCIA' ? 'Transferência entre contas' : 'Lançamento')
  )
}

function txDetail(tx: FinTransaction) {
  const parts = [
    tx.expand?.category_id?.name,
    tx.type === 'TRANSFERENCIA'
      ? `${tx.expand?.account_id?.name || ''} → ${tx.expand?.to_account_id?.name || ''}`
      : tx.expand?.account_id?.name,
    tx.expand?.supplier_id?.name,
    tx.person_id && !tx.is_anonymous ? tx.expand?.person_id?.name : '',
    tx.count_id ? 'contagem do culto' : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

export default function FinanceAudit() {
  const { currentChurch, user } = useAuth()
  const churchId = currentChurch?.id
  const { canView, canEdit, canAudit } = useFinanceAccess('auditoria')
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()

  const lastMonth = shiftMonth(brtDay(new Date().toISOString()).slice(0, 7), -1)
  const [month, setMonth] = useState(() =>
    /^\d{4}-\d{2}$/.test(params.get('mes') || '') ? params.get('mes')! : '',
  )
  const [locked, setLocked] = useState('')
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [audits, setAudits] = useState<FinAudit[]>([])
  const [comments, setComments] = useState<FinAuditComment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('pendentes')
  const [selected, setSelected] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  // Mês inicial: o último fechado (é o que o conselho costuma conferir) ou o mês passado
  useEffect(() => {
    if (!churchId) return
    listClosings(churchId)
      .then((rows) => {
        const l = lockedUntil(rows)
        setLocked(l)
        setMonth((m) => m || l || lastMonth)
      })
      .catch(() => setMonth((m) => m || lastMonth))
  }, [churchId, lastMonth])

  const load = useCallback(async () => {
    if (!churchId || !month) return
    const [t, a, c] = await Promise.all([
      listTransactionsOfMonth(churchId, month),
      listAudits(churchId, month),
      listAuditComments(churchId, month),
    ])
    setTxs(
      t.slice().sort((x, y) => x.date.localeCompare(y.date) || x.created.localeCompare(y.created)),
    )
    setAudits(a)
    setComments(c)
  }, [churchId, month])

  useEffect(() => {
    if (!month) return
    setLoading(true)
    setSelected([])
    setOpenId(null)
    load()
      .catch((err) =>
        toast({
          title: 'Não foi possível carregar a auditoria',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        }),
      )
      .finally(() => setLoading(false))
  }, [month, load, toast])

  const auditByTx = useMemo(() => new Map(audits.map((a) => [a.transaction_id, a])), [audits])
  const situationOf = useCallback(
    (tx: FinTransaction): Situation => {
      const a = auditByTx.get(tx.id)
      if (!a) return 'FALTA'
      if (a.status === 'APROVADO')
        return a.tx_updated && a.tx_updated !== tx.updated ? 'ALTERADO' : 'APROVADO'
      return a.status
    },
    [auditByTx],
  )
  const counts = useMemo(() => {
    const c = { FALTA: 0, ALTERADO: 0, APROVADO: 0, RESSALVA: 0, RESPONDIDA: 0 }
    for (const tx of txs) c[situationOf(tx)]++
    return c
  }, [txs, situationOf])
  const auditors = [...new Set(audits.map((a) => a.approved_by_name).filter(Boolean))]
  const visible = txs.filter((tx) => {
    const s = situationOf(tx)
    if (filter === 'aprovados') return s === 'APROVADO'
    if (filter === 'pendentes') return s !== 'APROVADO'
    return true
  })
  const isOwn = (tx: FinTransaction) => !!user?.id && tx.created_by === user.id
  const selectable = visible.filter((tx) => situationOf(tx) !== 'APROVADO' && !isOwn(tx))
  const open = txs.find((t) => t.id === openId) || null
  const openSituation = open ? situationOf(open) : null
  const hasObjection = openSituation === 'RESSALVA' || openSituation === 'RESPONDIDA'
  const canReply = !!open && canEdit && hasObjection
  const canJudge = !!open && canAudit && !isOwn(open)
  const thread = open ? comments.filter((c) => c.audit_id === auditByTx.get(open.id)?.id) : []

  const changeMonth = (m: string) => {
    setMonth(m)
    setParams(m ? { mes: m } : {}, { replace: true })
  }

  async function run(action: 'approve' | 'objection' | 'reply', ids: string[], message = '') {
    if (!churchId) return
    setSaving(action)
    try {
      const r = await auditTransactions(churchId, action, ids, message)
      await load()
      setText('')
      if (action === 'approve') {
        setSelected([])
        toast({
          title: r.approved === 1 ? '1 lançamento aprovado' : `${r.approved} lançamentos aprovados`,
          description: r.skipped_own
            ? `${r.skipped_own} lançado(s) por você ficou(aram) de fora: quem lança não aprova.`
            : undefined,
        })
      } else {
        toast({ title: action === 'objection' ? 'Ressalva registrada' : 'Resposta enviada' })
      }
    } catch (err) {
      toast({
        title: 'Não foi possível gravar',
        description: serverMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(null)
    }
  }

  if (!canView) return null

  const total = txs.length
  const income = txs.filter((t) => t.type === 'ENTRADA').length
  const expense = txs.filter((t) => t.type === 'SAIDA').length
  const objections = counts.RESSALVA + counts.RESPONDIDA
  const pending = counts.FALTA + counts.ALTERADO
  const allSelected = selectable.length > 0 && selectable.every((t) => selected.includes(t.id))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={month ? `Auditoria · ${monthLabel(month)}` : 'Auditoria'}
        subtitle="O conselho fiscal confere cada lançamento: aprova ou registra uma ressalva."
      >
        {month && <MonthSwitcher value={month} onChange={changeMonth} />}
        {canAudit && (
          <Button
            className={primaryButtonClass}
            disabled={!selected.length || saving !== null}
            onClick={() => run('approve', selected)}
          >
            {saving === 'approve' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Aprovar selecionados{selected.length ? ` (${selected.length})` : ''}
          </Button>
        )}
      </PageHeader>

      {month && locked < month && !loading && total > 0 && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          {monthLabel(month)} ainda não foi fechado: a tesouraria ainda pode mudar os lançamentos.
          Se mudar algum já aprovado, ele volta para a auditoria.
        </p>
      )}

      {loading || !month ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={cn(cardClass, 'p-4')}>
              <p className="text-sm text-slate-500">Lançamentos do mês</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{total}</p>
              <p className="mt-1 text-xs text-slate-500">
                {income} entradas · {expense} saídas
                {total - income - expense ? ` · ${total - income - expense} transferências` : ''}
              </p>
            </div>
            <div className={cn(cardClass, 'p-4')}>
              <p className="text-sm text-slate-500">Aprovados</p>
              <p className="mt-1 text-3xl font-bold text-emerald-700">{counts.APROVADO}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${total ? (counts.APROVADO / total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className={cn(cardClass, 'p-4')}>
              <p className="text-sm text-slate-500">Com ressalva</p>
              <p className="mt-1 text-3xl font-bold text-orange-700">{objections}</p>
              <p className="mt-1 text-xs text-slate-500">
                {counts.RESPONDIDA === 1
                  ? '1 já respondida pela tesouraria'
                  : `${counts.RESPONDIDA} já respondidas pela tesouraria`}
              </p>
            </div>
            <div className={cn(cardClass, 'p-4')}>
              <p className="text-sm text-slate-500">Falta auditar</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{pending}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {counts.ALTERADO
                  ? `${counts.ALTERADO} alterado(s) depois da aprovação`
                  : auditors.length
                    ? `Aprovaram: ${auditors.join(', ')}`
                    : 'Ninguém auditou este mês ainda'}
              </p>
            </div>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
            <section className={cn(cardClass, 'min-w-0 overflow-hidden')}>
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-semibold text-slate-900">Lançamentos</h2>
                <div role="group" aria-label="Mostrar" className="flex rounded-lg bg-slate-100 p-1">
                  {(
                    [
                      ['pendentes', 'Falta auditar e ressalvas'],
                      ['todos', 'Todos'],
                      ['aprovados', 'Aprovados'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium',
                        filter === key
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {visible.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  {total === 0
                    ? 'Nenhum lançamento neste mês.'
                    : filter === 'pendentes'
                      ? 'Tudo auditado neste mês.'
                      : 'Nada para mostrar.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="w-10 px-4 py-2.5">
                          {canAudit && (
                            <Checkbox
                              aria-label="Selecionar todos"
                              checked={allSelected}
                              disabled={!selectable.length}
                              onCheckedChange={(on) =>
                                setSelected(on ? selectable.map((t) => t.id) : [])
                              }
                            />
                          )}
                        </th>
                        <th className="px-2 py-2.5 font-medium">Data</th>
                        <th className="px-2 py-2.5 font-medium">Descrição</th>
                        <th className="px-2 py-2.5 text-right font-medium">Valor</th>
                        <th className="px-4 py-2.5 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((tx) => {
                        const s = situationOf(tx)
                        const own = isOwn(tx)
                        const canPick = canAudit && s !== 'APROVADO' && !own
                        const voided = tx.status === 'ESTORNADO'
                        const audit = auditByTx.get(tx.id)
                        return (
                          <tr
                            key={tx.id}
                            onClick={() => {
                              setOpenId(tx.id)
                              setText('')
                            }}
                            className={cn(
                              'cursor-pointer border-b border-slate-100',
                              openId === tx.id
                                ? 'bg-teal-50/60'
                                : s === 'RESSALVA'
                                  ? 'bg-orange-50/50 hover:bg-orange-50'
                                  : 'hover:bg-slate-50',
                            )}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {canAudit && (
                                <Checkbox
                                  aria-label={`Selecionar ${txTitle(tx)}`}
                                  checked={selected.includes(tx.id)}
                                  disabled={!canPick}
                                  title={own ? 'Lançado por você: outra pessoa aprova' : undefined}
                                  onCheckedChange={(on) =>
                                    setSelected((cur) =>
                                      on ? [...cur, tx.id] : cur.filter((id) => id !== tx.id),
                                    )
                                  }
                                />
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 tabular-nums text-slate-600">
                              {shortDate(tx.date)}
                            </td>
                            <td className="px-2 py-3">
                              <p
                                className={cn(
                                  'font-medium text-slate-900',
                                  voided && 'text-slate-400 line-through',
                                )}
                              >
                                {txTitle(tx)}
                              </p>
                              <p className="text-xs text-slate-500">
                                {[
                                  txDetail(tx),
                                  voided ? 'estornado' : '',
                                  tx.type === 'SAIDA' && !voided
                                    ? tx.attachment
                                      ? 'comprovante'
                                      : 'sem comprovante'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                                {tx.attachment && (
                                  <Paperclip className="ml-1 inline h-3 w-3 text-slate-400" />
                                )}
                              </p>
                            </td>
                            <td
                              className={cn(
                                'whitespace-nowrap px-2 py-3 text-right font-semibold tabular-nums',
                                tx.type === 'ENTRADA'
                                  ? 'text-emerald-700'
                                  : tx.type === 'SAIDA'
                                    ? 'text-red-600'
                                    : 'text-slate-700',
                              )}
                            >
                              {formatCents(tx.amount_cents)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
                                  SITUATION[s].className,
                                )}
                              >
                                {s === 'APROVADO' && audit?.approved_by_name
                                  ? `Aprovado por ${audit.approved_by_name.split(' ')[0]}`
                                  : SITUATION[s].label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className={cn(cardClass, 'lg:sticky lg:top-4')}>
              {!open ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-slate-500">
                  <ShieldCheck className="h-8 w-8 text-slate-300" />
                  Toque num lançamento para ver os detalhes, a ressalva e a resposta.
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {openSituation ? SITUATION[openSituation].label : ''}
                    </p>
                    <h3 className="mt-0.5 font-semibold text-slate-900">{txTitle(open)}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatCents(open.amount_cents)} · {shortDate(open.date, true)}
                      {txDetail(open) ? ` · ${txDetail(open)}` : ''}
                    </p>
                    {open.notes && <p className="mt-1 text-xs text-slate-500">{open.notes}</p>}
                    {open.status === 'ESTORNADO' && (
                      <p className="mt-1 text-xs text-red-600">
                        Estornado{open.void_reason ? `: ${open.void_reason}` : ''}
                      </p>
                    )}
                    {open.attachment && (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-teal-700"
                        onClick={() => openAttachment(open)}
                      >
                        <Paperclip className="mr-1 h-3.5 w-3.5" /> Ver comprovante
                      </Button>
                    )}
                  </div>

                  {thread.length > 0 && (
                    <ul className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3">
                      {thread.map((c) => (
                        <li key={c.id} className="flex gap-2.5">
                          <span
                            className={cn(
                              'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                              c.author_role === 'Conselho fiscal'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-orange-50 text-orange-700',
                            )}
                          >
                            {initials(c.author_name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-500">
                              {c.author_name} · {c.author_role.toLowerCase()} ·{' '}
                              {shortDate(brtDay(c.created))}
                            </p>
                            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                              {c.kind === 'APROVACAO' && !c.text ? 'Resolvido e aprovado.' : c.text}
                              {c.kind === 'APROVACAO' && c.text && (
                                <span className="block text-xs text-emerald-700">Aprovado</span>
                              )}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {(canJudge || canReply) && (
                    <div className="flex flex-col gap-2 px-4 py-3">
                      <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder={
                          canJudge
                            ? 'Escreva a ressalva ou um comentário da aprovação...'
                            : 'Escreva uma resposta...'
                        }
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        {canReply && (
                          <Button
                            variant="outline"
                            disabled={text.trim().length < 3 || saving !== null}
                            onClick={() => run('reply', [open.id], text)}
                          >
                            <MessageSquare className="mr-2 h-4 w-4" /> Responder
                          </Button>
                        )}
                        {canJudge && (
                          <>
                            <Button
                              variant="outline"
                              disabled={text.trim().length < 3 || saving !== null}
                              onClick={() => run('objection', [open.id], text)}
                            >
                              Registrar ressalva
                            </Button>
                            {openSituation !== 'APROVADO' && (
                              <Button
                                className={primaryButtonClass}
                                disabled={saving !== null}
                                onClick={() => run('approve', [open.id], text)}
                              >
                                <CheckCheck className="mr-2 h-4 w-4" />
                                {openSituation === 'RESSALVA' || openSituation === 'RESPONDIDA'
                                  ? 'Resolver e aprovar'
                                  : 'Aprovar'}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {canAudit && isOwn(open) && (
                    <p className="px-4 py-3 text-xs text-slate-500">
                      Você lançou este: outra pessoa do conselho fiscal aprova.
                    </p>
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
