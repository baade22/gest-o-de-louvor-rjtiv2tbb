import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  EyeOff,
  FileUp,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Search,
  Undo2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { periodTotals } from '@/lib/financeSummary'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { listTransactionsOfMonth, openAttachment, voidTransaction } from '@/services/finance'
import type { FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { TransactionSheet } from './TransactionSheet'
import { EklesiaImportDialog } from './EklesiaImportDialog'
import { ReceiptDialog, canIssueReceipt, type ReceiptData } from './ReceiptDialog'
import { useFinanceLookups } from './useFinanceLookups'
import {
  MonthSwitcher,
  PAYMENT_METHOD_LABELS,
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  primaryButtonClass,
  shortDate,
  useFinanceAccess,
} from './shared'

type Filter = 'TODOS' | 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'CONTRIBUICAO'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'ENTRADA', label: 'Entradas' },
  { value: 'SAIDA', label: 'Saídas' },
  { value: 'TRANSFERENCIA', label: 'Transferências' },
  { value: 'CONTRIBUICAO', label: 'Dízimos e ofertas' },
]

/** Quem ou o quê: pessoa, anônimo, fornecedor ou descrição. */
function counterpart(tx: FinTransaction) {
  if (tx.type === 'TRANSFERENCIA') return tx.description || 'Transferência entre contas'
  if (tx.is_anonymous) return 'Anônimo'
  return (
    tx.expand?.person_id?.name ||
    tx.expand?.supplier_id?.name ||
    tx.description ||
    tx.expand?.category_id?.name ||
    'Lançamento'
  )
}

function detail(tx: FinTransaction) {
  if (tx.type === 'TRANSFERENCIA')
    return `${tx.expand?.account_id?.name || 'Conta'} → ${tx.expand?.to_account_id?.name || 'Conta'}`
  const parts = [tx.expand?.category_id?.name]
  if ((tx.is_anonymous || tx.person_id || tx.supplier_id) && tx.description)
    parts.push(tx.description)
  if (tx.expand?.event_id) parts.push(tx.expand.event_id.title)
  if (tx.expand?.campaign_id) parts.push(`campanha ${tx.expand.campaign_id.name}`)
  if (tx.count_id) parts.push('contagem do culto')
  if (tx.bill_id) parts.push(tx.type === 'SAIDA' ? 'conta a pagar' : 'conta a receber')
  if (tx.bank_line_id) parts.push('conciliado')
  return parts.filter(Boolean).join(' · ')
}

export default function FinanceTransactions() {
  const { currentChurch } = useAuth()
  const { canEdit } = useFinanceAccess('lancamentos')
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const churchId = currentChurch?.id

  const [month, setMonth] = useState(() => getLocalTodayYMD().slice(0, 7))
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('TODOS')
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<FinTransaction | null>(null)
  const [voiding, setVoiding] = useState<FinTransaction | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const { lookups, reload: reloadLookups } = useFinanceLookups(churchId)

  const load = useCallback(async () => {
    if (!churchId) return
    setLoading(true)
    try {
      setTxs(await listTransactionsOfMonth(churchId, month))
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar lançamentos', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [churchId, month, toast])

  useEffect(() => {
    load()
  }, [load])

  // Atalho vindo do painel: /financeiro/lancamentos?novo=1
  useEffect(() => {
    if (params.get('novo') && canEdit) {
      setEditing(null)
      setSheetOpen(true)
      params.delete('novo')
      setParams(params, { replace: true })
    }
  }, [params, setParams, canEdit])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return txs.filter((tx) => {
      if (filter === 'ENTRADA' && tx.type !== 'ENTRADA') return false
      if (filter === 'SAIDA' && tx.type !== 'SAIDA') return false
      if (filter === 'TRANSFERENCIA' && tx.type !== 'TRANSFERENCIA') return false
      if (filter === 'CONTRIBUICAO' && !tx.expand?.category_id?.is_contribution) return false
      if (!term) return true
      return `${counterpart(tx)} ${detail(tx)} ${tx.expand?.account_id?.name || ''}`
        .toLowerCase()
        .includes(term)
    })
  }, [txs, filter, search])

  const totals = useMemo(
    () => periodTotals(visible, lookups.categories),
    [visible, lookups.categories],
  )

  const openNew = () => {
    setEditing(null)
    setSheetOpen(true)
  }

  const handleVoid = async () => {
    if (!voiding) return
    await voidTransaction(voiding.id, voidReason.trim())
    toast({
      title: 'Lançamento estornado',
      description: voiding.bill_id
        ? 'Ele sai dos saldos e a conta volta para em aberto.'
        : voiding.bank_line_id
          ? 'Ele sai dos saldos e o movimento do extrato volta para a conciliação.'
          : 'Ele continua no histórico, fora dos saldos.',
    })
    load()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lançamentos"
        subtitle="Entradas, saídas e transferências de todas as contas"
      >
        <MonthSwitcher value={month} onChange={setMonth} />
        {canEdit && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" />
            Importar do Eklesia
          </Button>
        )}
        {canEdit && (
          <Button onClick={openNew} className={primaryButtonClass}>
            <Plus className="h-4 w-4" />
            Novo lançamento
          </Button>
        )}
      </PageHeader>

      {!canEdit && <ReadOnlyNotice />}

      <div className={cardClass}>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  'h-8 rounded-full border px-3 text-[12.5px] font-semibold transition-colors',
                  filter === f.value
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pessoa, categoria…"
              className="h-9 rounded-lg pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-slate-800">Nenhum lançamento neste período</p>
            <p className="mt-1 text-sm text-slate-500">
              {canEdit
                ? 'Use “Novo lançamento” para registrar uma entrada ou saída.'
                : 'Troque o mês para ver outros períodos.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((tx) => {
              const voided = tx.status === 'ESTORNADO'
              const isIn = tx.type === 'ENTRADA'
              const isTransfer = tx.type === 'TRANSFERENCIA'
              const Icon = isIn ? ArrowDownLeft : isTransfer ? ArrowLeftRight : ArrowUpRight
              return (
                <li
                  key={tx.id}
                  className={cn('flex items-center gap-3 px-4 py-3', voided && 'opacity-60')}
                >
                  <div
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                      isIn
                        ? 'bg-emerald-50 text-emerald-700'
                        : isTransfer
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-rose-50 text-rose-700',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="w-12 shrink-0 text-sm tabular-nums text-slate-500">
                    {shortDate(tx.date)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                      {tx.is_anonymous && <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                      <span className={cn('truncate', voided && 'line-through')}>
                        {counterpart(tx)}
                      </span>
                      {tx.attachment && (
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {voided
                        ? `Estornado${tx.void_reason ? `: ${tx.void_reason}` : ''}`
                        : detail(tx)}
                    </div>
                  </div>
                  <div className="hidden w-40 shrink-0 text-sm text-slate-600 md:block">
                    <div className="truncate">{tx.expand?.account_id?.name}</div>
                    <div className="text-xs text-slate-400">
                      {tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] : ''}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'w-28 shrink-0 text-right font-semibold tabular-nums',
                      voided
                        ? 'text-slate-400 line-through'
                        : isIn
                          ? 'text-emerald-700'
                          : isTransfer
                            ? 'text-slate-700'
                            : 'text-rose-700',
                    )}
                  >
                    {isIn || isTransfer ? '' : '− '}
                    {formatCents(tx.amount_cents)}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Ações"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canIssueReceipt(tx) && tx.expand?.person_id && (
                        <DropdownMenuItem
                          onClick={() =>
                            setReceipt({
                              tx,
                              person: tx.expand!.person_id!,
                              categoryName: tx.expand?.category_id?.name || 'Contribuição',
                              campaignName: tx.expand?.campaign_id?.name,
                            })
                          }
                        >
                          <Receipt className="mr-2 h-4 w-4" /> Recibo
                        </DropdownMenuItem>
                      )}
                      {tx.attachment && (
                        <DropdownMenuItem onClick={() => openAttachment(tx)}>
                          <Paperclip className="mr-2 h-4 w-4" /> Ver comprovante
                        </DropdownMenuItem>
                      )}
                      {canEdit && !voided && (
                        <>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(tx)
                              setSheetOpen(true)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-700"
                            onClick={() => {
                              setVoidReason('')
                              setVoiding(tx)
                            }}
                          >
                            <Undo2 className="mr-2 h-4 w-4" /> Estornar
                          </DropdownMenuItem>
                        </>
                      )}
                      {!tx.attachment && (!canEdit || voided) && !canIssueReceipt(tx) && (
                        <DropdownMenuItem disabled>Sem ações disponíveis</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}

        <div className="grid grid-cols-3 border-t border-slate-200 text-sm">
          <div className="px-4 py-3">
            <div className="text-xs text-slate-500">Entradas</div>
            <div className="font-bold tabular-nums text-emerald-700">
              {formatCents(totals.income)}
            </div>
          </div>
          <div className="border-l border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-500">Saídas</div>
            <div className="font-bold tabular-nums text-rose-700">
              {formatCents(totals.expense)}
            </div>
          </div>
          <div className="border-l border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-500">Anônimos</div>
            <div className="font-bold tabular-nums text-slate-800">
              {formatCents(totals.anonymous)}
            </div>
          </div>
        </div>
      </div>

      {churchId && (
        <ReceiptDialog
          data={receipt}
          churchId={churchId}
          churchName={currentChurch?.name || ''}
          onOpenChange={(open) => !open && setReceipt(null)}
        />
      )}
      {churchId && (
        <TransactionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          churchId={churchId}
          lookups={lookups}
          editing={editing}
          onSaved={load}
          onLookupsChanged={reloadLookups}
        />
      )}
      {churchId && canEdit && (
        <EklesiaImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          churchId={churchId}
          lookups={lookups}
          onImported={load}
        />
      )}

      <ConfirmDialog
        open={Boolean(voiding)}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Estornar lançamento?"
        description="O valor sai dos saldos, mas o lançamento continua no histórico e não pode mais ser editado."
        confirmLabel="Estornar"
        destructive
        onConfirm={handleVoid}
      >
        <Textarea
          rows={2}
          maxLength={300}
          placeholder="Motivo (ex.: lançado em duplicidade)"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          className="rounded-lg"
        />
      </ConfirmDialog>
    </div>
  )
}
