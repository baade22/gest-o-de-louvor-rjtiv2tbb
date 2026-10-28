import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Repeat,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents, centsToInput, parseMoneyToCents } from '@/lib/money'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { billTotals, daysBetween } from '@/lib/financeSummary'
import {
  cancelBill,
  createBills,
  listBills,
  openBillAttachment,
  saveRegistry,
  settleBill,
  updateBill,
  type BillInput,
} from '@/services/finance'
import type { FinBill, FinBillKind, FinSupplier, Person } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { useConfirm } from '@/components/ConfirmDialog'
import type { FinanceLookups } from './TransactionSheet'
import { useFinanceLookups } from './useFinanceLookups'
import {
  DOCUMENT_TYPE_LABELS,
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

type StatusFilter = 'ABERTO' | 'PAGO' | 'CANCELADO'

const words = (kind: FinBillKind) =>
  kind === 'PAGAR'
    ? {
        tab: 'A pagar',
        noun: 'conta a pagar',
        pay: 'Pagar',
        paid: 'Paga',
        paidPlural: 'Pagas',
        paidMonth: 'Pagas no mês',
        who: 'Fornecedor',
      }
    : {
        tab: 'A receber',
        noun: 'conta a receber',
        pay: 'Receber',
        paid: 'Recebida',
        paidPlural: 'Recebidas',
        paidMonth: 'Recebidas no mês',
        who: 'De quem',
      }

/** "Venceu há 3 dias", "Vence hoje", "Vence em 5 dias" */
function dueLabel(due: string, today: string) {
  const days = daysBetween(today, due)
  if (days < 0) return { text: `Venceu há ${-days} ${days === -1 ? 'dia' : 'dias'}`, late: true }
  if (days === 0) return { text: 'Vence hoje', late: false, soon: true }
  if (days === 1) return { text: 'Vence amanhã', late: false, soon: true }
  return { text: `Vence em ${days} dias`, late: false, soon: days <= 7 }
}

const counterpartOf = (bill: FinBill) =>
  bill.expand?.supplier_id?.name || bill.expand?.person_id?.name || bill.description

function Stat({
  icon: Icon,
  tone,
  label,
  cents,
  count,
}: {
  icon: LucideIcon
  tone: string
  label: string
  cents: number
  count: number
}) {
  return (
    <div className={cn(cardClass, 'min-w-0 p-4')}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="leading-tight">{label}</span>
      </div>
      <div className="mt-3 text-[20px] font-bold tabular-nums tracking-tight text-slate-900 sm:text-[22px]">
        {formatCents(cents)}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">
        {count} {count === 1 ? 'conta' : 'contas'}
      </div>
    </div>
  )
}

export default function FinanceBills() {
  const { currentChurch } = useAuth()
  const { canEdit } = useFinanceAccess('contas_pagar')
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [params, setParams] = useSearchParams()
  const churchId = currentChurch?.id
  const kind: FinBillKind = params.get('tipo') === 'receber' ? 'RECEBER' : 'PAGAR'
  const w = words(kind)
  const today = getLocalTodayYMD()

  const [bills, setBills] = useState<FinBill[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusFilter>('ABERTO')
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<FinBill | null>(null)
  const [settling, setSettling] = useState<FinBill | null>(null)
  const { lookups, reload: reloadLookups } = useFinanceLookups(churchId)

  const load = useCallback(async () => {
    if (!churchId) return
    setLoading(true)
    try {
      setBills(await listBills(churchId))
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar as contas', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [churchId, toast])

  useEffect(() => {
    load()
  }, [load])

  // Atalho vindo do painel: /financeiro/contas?novo=1
  useEffect(() => {
    if (params.get('novo') && canEdit) {
      setEditing(null)
      setSheetOpen(true)
      params.delete('novo')
      setParams(params, { replace: true })
    }
  }, [params, setParams, canEdit])

  const setKind = (next: FinBillKind) => {
    if (next === kind) return
    if (next === 'RECEBER') params.set('tipo', 'receber')
    else params.delete('tipo')
    setParams(params, { replace: true })
  }

  const ofKind = useMemo(() => bills.filter((b) => b.kind === kind), [bills, kind])
  const totals = useMemo(() => billTotals(ofKind, today), [ofKind, today])
  const openCount = (k: FinBillKind) =>
    bills.filter((b) => b.kind === k && b.status === 'ABERTO').length

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = ofKind.filter((b) => {
      if (b.status !== status) return false
      if (!term) return true
      return `${counterpartOf(b)} ${b.description} ${b.expand?.category_id?.name || ''} ${b.document_number || ''}`
        .toLowerCase()
        .includes(term)
    })
    // Pagas: as mais recentes primeiro; em aberto: pelo vencimento
    if (status === 'PAGO')
      return [...list].sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''))
    if (status === 'CANCELADO')
      return [...list].sort((a, b) => b.due_date.localeCompare(a.due_date))
    return list
  }, [ofKind, status, search])

  const handleCancel = (bill: FinBill) =>
    confirm({
      title: `Cancelar esta ${w.noun}?`,
      description: 'Ela sai das pendências e fica no histórico como cancelada.',
      confirmLabel: 'Cancelar conta',
      destructive: true,
      onConfirm: async () => {
        await cancelBill(bill.id)
        toast({ title: 'Conta cancelada' })
        load()
      },
    })

  const statusChips: { value: StatusFilter; label: string }[] = [
    { value: 'ABERTO', label: 'Em aberto' },
    { value: 'PAGO', label: w.paidPlural },
    { value: 'CANCELADO', label: 'Canceladas' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contas a pagar e receber"
        subtitle="Vencimentos, baixas e contas que se repetem todo mês"
      >
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            Nova {w.noun}
          </Button>
        )}
      </PageHeader>

      {!canEdit && <ReadOnlyNotice />}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:w-80">
        {(['PAGAR', 'RECEBER'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-semibold transition-colors',
              kind === k
                ? cn('bg-white shadow-xs', k === 'PAGAR' ? 'text-rose-700' : 'text-emerald-700')
                : 'text-slate-500',
            )}
          >
            {words(k).tab}
            {!loading && openCount(k) > 0 && (
              <span className="rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-700">
                {openCount(k)}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            icon={AlertTriangle}
            tone="bg-rose-50 text-rose-700"
            label="Vencidas"
            {...totals.overdue}
          />
          <Stat
            icon={CalendarClock}
            tone="bg-amber-50 text-amber-700"
            label="Próximos 7 dias"
            {...totals.next7}
          />
          <Stat
            icon={CalendarDays}
            tone="bg-slate-100 text-slate-600"
            label="Em aberto no mês"
            {...totals.openMonth}
          />
          <Stat
            icon={CalendarCheck}
            tone="bg-emerald-50 text-emerald-700"
            label={w.paidMonth}
            {...totals.paidMonth}
          />
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
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === 'PAGAR' ? 'Buscar fornecedor, conta…' : 'Buscar pessoa, conta…'}
              className="h-9 rounded-lg pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-slate-800">
              {status === 'ABERTO'
                ? `Nenhuma ${w.noun} em aberto`
                : status === 'PAGO'
                  ? `Nenhuma conta ${w.paid.toLowerCase()} ainda`
                  : 'Nenhuma conta cancelada'}
            </p>
            {status === 'ABERTO' && canEdit && (
              <p className="mt-1 text-sm text-slate-500">
                {kind === 'PAGAR'
                  ? 'Cadastre boletos, aluguel, luz e água para não perder o vencimento.'
                  : 'Cadastre o que a igreja tem para receber, como aluguel do salão.'}
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((bill) => {
              const open = bill.status === 'ABERTO'
              const due = dueLabel(bill.due_date, today)
              const sub = [
                counterpartOf(bill) !== bill.description ? bill.description : '',
                bill.expand?.category_id?.name,
                bill.installments ? `${bill.installment}/${bill.installments}` : '',
                bill.document_type
                  ? `${DOCUMENT_TYPE_LABELS[bill.document_type]}${bill.document_number ? ` ${bill.document_number}` : ''}`
                  : '',
              ].filter(Boolean)
              return (
                <li
                  key={bill.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    bill.status === 'CANCELADO' && 'opacity-60',
                  )}
                >
                  <div
                    className={cn(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-lg text-center leading-none',
                      !open
                        ? 'bg-slate-100 text-slate-500'
                        : due.late
                          ? 'bg-rose-50 text-rose-700'
                          : due.soon
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-700',
                    )}
                  >
                    <div>
                      <div className="text-[15px] font-bold tabular-nums">
                        {bill.due_date.slice(8, 10)}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold uppercase">
                        {shortDate(bill.due_date).slice(3)}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                      <span
                        className={cn('truncate', bill.status === 'CANCELADO' && 'line-through')}
                      >
                        {counterpartOf(bill)}
                      </span>
                      {bill.recurrence_group && (
                        <Repeat className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                      {bill.attachment && (
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {open ? (
                        <span
                          className={cn(
                            'font-semibold',
                            due.late ? 'text-rose-700' : due.soon ? 'text-amber-700' : '',
                          )}
                        >
                          {due.text}
                        </span>
                      ) : bill.status === 'PAGO' ? (
                        <span className="font-semibold text-emerald-700">
                          {w.paid} em {shortDate(bill.paid_at || '')}
                          {bill.expand?.paid_account_id
                            ? ` · ${bill.expand.paid_account_id.name}`
                            : ''}
                        </span>
                      ) : (
                        'Cancelada'
                      )}
                      {sub.length > 0 && ` · ${sub.join(' · ')}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-semibold tabular-nums text-slate-900 sm:w-28">
                    {formatCents(
                      bill.status === 'PAGO'
                        ? bill.paid_amount_cents || bill.amount_cents
                        : bill.amount_cents,
                    )}
                  </div>
                  {canEdit && open && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSettling(bill)}
                      className="hidden h-8 rounded-lg font-semibold sm:inline-flex"
                    >
                      {w.pay}
                    </Button>
                  )}
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
                      {canEdit && open && (
                        <>
                          <DropdownMenuItem onClick={() => setSettling(bill)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> {w.pay}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(bill)
                              setSheetOpen(true)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                        </>
                      )}
                      {bill.attachment && (
                        <DropdownMenuItem onClick={() => openBillAttachment(bill)}>
                          <Paperclip className="mr-2 h-4 w-4" /> Ver documento
                        </DropdownMenuItem>
                      )}
                      {canEdit && open && (
                        <DropdownMenuItem
                          className="text-rose-700"
                          onClick={() => handleCancel(bill)}
                        >
                          <XCircle className="mr-2 h-4 w-4" /> Cancelar
                        </DropdownMenuItem>
                      )}
                      {bill.status === 'PAGO' && (
                        <DropdownMenuItem disabled className="max-w-64 whitespace-normal text-xs">
                          Para desfazer, estorne o lançamento em Lançamentos: a conta volta para em
                          aberto.
                        </DropdownMenuItem>
                      )}
                      {!bill.attachment && !(canEdit && open) && bill.status !== 'PAGO' && (
                        <DropdownMenuItem disabled>Sem ações disponíveis</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && status === 'ABERTO' && visible.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">Total em aberto</span>
            <span className="font-bold tabular-nums text-slate-900">
              {formatCents(visible.reduce((s, b) => s + b.amount_cents, 0))}
            </span>
          </div>
        )}
      </div>

      {churchId && (
        <BillSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          churchId={churchId}
          kind={editing?.kind || kind}
          lookups={lookups}
          editing={editing}
          onSaved={load}
          onLookupsChanged={reloadLookups}
        />
      )}

      <SettleDialog
        bill={settling}
        lookups={lookups}
        onClose={() => setSettling(null)}
        onSettled={load}
      />

      {dialog}
    </div>
  )
}

// ---- Cadastro da conta ----

const emptyForm = () => ({
  description: '',
  amount: '',
  due_date: getLocalTodayYMD(),
  issue_date: '',
  category_id: '',
  cost_center_id: '',
  campaign_id: '',
  supplier_id: '',
  person_id: '',
  account_id: '',
  document_type: '',
  document_number: '',
  notes: '',
  repeat: false,
  times: '12',
})

function BillSheet({
  open,
  onOpenChange,
  churchId,
  kind,
  lookups,
  editing,
  onSaved,
  onLookupsChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  kind: FinBillKind
  lookups: FinanceLookups
  editing: FinBill | null
  onSaved: () => void
  onLookupsChanged: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState(emptyForm())
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const w = words(kind)
  const isPay = kind === 'PAGAR'
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!open) return
    setFile(null)
    if (editing) {
      setForm({
        description: editing.description,
        amount: centsToInput(editing.amount_cents),
        due_date: editing.due_date.slice(0, 10),
        issue_date: (editing.issue_date || '').slice(0, 10),
        category_id: editing.category_id || '',
        cost_center_id: editing.cost_center_id || '',
        campaign_id: editing.campaign_id || '',
        supplier_id: editing.supplier_id || '',
        person_id: editing.person_id || '',
        account_id: editing.account_id || '',
        document_type: editing.document_type || '',
        document_number: editing.document_number || '',
        notes: editing.notes || '',
        repeat: false,
        times: '12',
      })
    } else {
      setForm({ ...emptyForm(), document_type: isPay ? 'BOLETO' : '' })
    }
    // Só reinicia ao abrir: recarregar cadastros não pode apagar o que foi digitado.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const direction = isPay ? 'SAIDA' : 'ENTRADA'
  const categories = lookups.categories.filter(
    (c) => c.direction === direction && (c.is_active || c.id === form.category_id),
  )
  const accounts = lookups.accounts.filter((a) => a.is_active || a.id === form.account_id)
  const costCenters = lookups.costCenters.filter((c) => c.is_active || c.id === form.cost_center_id)
  const openCampaigns = (lookups.campaigns || []).filter(
    (c) => c.status === 'ATIVA' || c.id === form.campaign_id,
  )
  const cents = parseMoneyToCents(form.amount) || 0
  const times = Math.max(2, Math.min(60, Number(form.times) || 0))

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

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!form.description.trim()) {
      toast({ title: 'Descreva a conta', description: 'Ex.: Conta de luz', variant: 'destructive' })
      return
    }
    if (!cents || cents <= 0) {
      toast({ title: 'Informe o valor', description: 'Ex.: 150,00', variant: 'destructive' })
      return
    }
    if (!form.due_date) {
      toast({ title: 'Informe o vencimento', variant: 'destructive' })
      return
    }
    const input: BillInput = {
      kind,
      description: form.description.trim(),
      amount_cents: cents,
      due_date: form.due_date,
      issue_date: form.issue_date,
      category_id: form.category_id,
      cost_center_id: form.cost_center_id,
      campaign_id: form.campaign_id,
      supplier_id: isPay ? form.supplier_id : '',
      person_id: isPay ? '' : form.person_id,
      account_id: form.account_id,
      document_type: form.document_type,
      document_number: form.document_number.trim(),
      notes: form.notes.trim(),
      attachment: file,
    }
    setSaving(true)
    try {
      if (editing) {
        await updateBill(editing.id, input)
        toast({ title: 'Conta atualizada' })
      } else {
        const created = await createBills(churchId, input, form.repeat ? times : 1)
        toast({
          title: created.length > 1 ? `${created.length} contas criadas` : 'Conta criada',
          description:
            created.length > 1
              ? `Uma por mês, até ${shortDate(created[created.length - 1].due_date, true)}.`
              : undefined,
        })
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel = 'text-xs font-semibold text-slate-600'

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? `Editar ${w.noun}` : `Nova ${w.noun}`}</SheetTitle>
          <SheetDescription>
            {editing?.installments
              ? `Parcela ${editing.installment} de ${editing.installments}. A mudança vale só para esta.`
              : isPay
                ? 'Boleto, aluguel, luz, água: o que a igreja precisa pagar.'
                : 'O que a igreja tem para receber.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bill-desc" className={fieldLabel}>
              Descrição
            </Label>
            <Input
              id="bill-desc"
              autoFocus
              maxLength={200}
              placeholder={isPay ? 'Ex.: Conta de luz' : 'Ex.: Aluguel do salão'}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label className={fieldLabel}>{w.who} (opcional)</Label>
            {isPay ? (
              <SearchPicker
                value={form.supplier_id}
                onChange={(id) => set({ supplier_id: id })}
                placeholder="Para quem vai pagar"
                options={lookups.suppliers
                  .filter((s) => s.is_active || s.id === form.supplier_id)
                  .map((s) => ({ id: s.id, label: s.name }))}
                onCreate={createSupplier}
                createLabel="Cadastrar fornecedor"
              />
            ) : (
              <SearchPicker
                value={form.person_id}
                onChange={(id) => set({ person_id: id })}
                placeholder="Quem vai pagar à igreja"
                options={lookups.people
                  .filter((p) => p.is_active || p.id === form.person_id)
                  .map((p) => ({ id: p.id, label: p.name, hint: p.phone }))}
                onCreate={createPerson}
                createLabel="Cadastrar pessoa"
              />
            )}
          </div>

          <div className="grid grid-cols-[1fr_150px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-amount" className={fieldLabel}>
                Valor (R$)
              </Label>
              <Input
                id="bill-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="h-12 rounded-lg text-xl font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-due" className={fieldLabel}>
                Vencimento
              </Label>
              <Input
                id="bill-due"
                type="date"
                value={form.due_date}
                onChange={(e) => set({ due_date: e.target.value })}
                className="h-12 rounded-lg"
              />
            </div>
          </div>

          {!editing && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.repeat}
                  onChange={(e) => set({ repeat: e.target.checked })}
                  className="h-4 w-4 accent-teal-700"
                />
                <Repeat className="h-4 w-4 text-slate-500" />
                Repetir todo mês
              </label>
              {form.repeat && (
                <div className="flex flex-wrap items-center gap-2 pl-6 text-sm text-slate-600">
                  <span>Criar</span>
                  <Input
                    aria-label="Quantos meses"
                    inputMode="numeric"
                    value={form.times}
                    onChange={(e) => set({ times: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                    className="h-8 w-16 rounded-lg text-center"
                  />
                  <span>
                    contas, uma por mês, no mesmo dia
                    {cents > 0 && ` (total ${formatCents(cents * times)})`}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className={cn('grid gap-3', costCenters.length > 1 && 'grid-cols-2')}>
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Categoria</Label>
              <Select
                value={form.category_id || NONE}
                onValueChange={(v) => set({ category_id: v === NONE ? '' : v })}
              >
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Escolher depois</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {costCenters.length > 1 && (
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Centro de custo</Label>
                <Select
                  value={form.cost_center_id || NONE}
                  onValueChange={(v) => set({ cost_center_id: v === NONE ? '' : v })}
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

          {openCampaigns.length > 0 && (
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Campanha (opcional)</Label>
              <Select
                value={form.campaign_id || NONE}
                onValueChange={(v) => set({ campaign_id: v === NONE ? '' : v })}
              >
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {openCampaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className={fieldLabel}>
              {isPay ? 'Pagar pela conta (opcional)' : 'Receber na conta (opcional)'}
            </Label>
            <Select
              value={form.account_id || NONE}
              onValueChange={(v) => set({ account_id: v === NONE ? '' : v })}
            >
              <SelectTrigger className="h-10 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Escolher na hora</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Documento</Label>
              <Select
                value={form.document_type || NONE}
                onValueChange={(v) => set({ document_type: v === NONE ? '' : v })}
              >
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-doc" className={fieldLabel}>
                Número (opcional)
              </Label>
              <Input
                id="bill-doc"
                maxLength={60}
                value={form.document_number}
                onChange={(e) => set({ document_number: e.target.value })}
                className="h-10 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-issue" className={fieldLabel}>
              Emissão (opcional)
            </Label>
            <Input
              id="bill-issue"
              type="date"
              value={form.issue_date}
              onChange={(e) => set({ issue_date: e.target.value })}
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label className={fieldLabel}>Boleto ou documento (opcional)</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 text-slate-400" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="ml-auto text-slate-400"
                  aria-label="Tirar anexo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-slate-400">
                <Paperclip className="h-4 w-4" />
                {editing?.attachment ? 'Trocar documento anexado' : 'Anexar foto ou PDF'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
            {form.repeat && file && (
              <p className="text-xs text-slate-500">O anexo fica só na primeira conta.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-notes" className={fieldLabel}>
              Observações (opcional)
            </Label>
            <Textarea
              id="bill-notes"
              rows={2}
              maxLength={1000}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className="rounded-lg"
            />
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="h-10 w-full gap-2 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {!editing && form.repeat ? `Criar ${times} contas` : 'Salvar'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---- Baixa ----

function SettleDialog({
  bill,
  lookups,
  onClose,
  onSettled,
}: {
  bill: FinBill | null
  lookups: FinanceLookups
  onClose: () => void
  onSettled: () => void
}) {
  const { toast } = useToast()
  const [date, setDate] = useState(getLocalTodayYMD())
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [busy, setBusy] = useState(false)
  const isPay = bill?.kind === 'PAGAR'

  useEffect(() => {
    if (!bill) return
    setDate(getLocalTodayYMD())
    const preferred = lookups.accounts.find((a) => a.id === bill.account_id && a.is_active)
    const bank = lookups.accounts.find((a) => a.is_active && a.kind === 'BANCO')
    setAccountId(preferred?.id || bank?.id || lookups.accounts.find((a) => a.is_active)?.id || '')
    setAmount(centsToInput(bill.amount_cents))
    setMethod(bill.document_type === 'BOLETO' ? 'BOLETO' : 'PIX')
  }, [bill, lookups.accounts])

  const cents = parseMoneyToCents(amount) || 0

  const handleSettle = async () => {
    if (!bill) return
    if (!cents || cents <= 0) {
      toast({ title: 'Informe o valor', variant: 'destructive' })
      return
    }
    if (!accountId) {
      toast({ title: 'Escolha a conta', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await settleBill(bill.id, {
        date,
        account_id: accountId,
        amount_cents: cents,
        payment_method: method,
      })
      toast({
        title: isPay ? 'Conta paga' : 'Conta recebida',
        description: `O lançamento de ${formatCents(cents)} já está em Lançamentos.`,
      })
      onSettled()
      onClose()
    } catch (err) {
      console.error(err)
      const message = (err as { response?: { message?: string } })?.response?.message
      toast({
        title: 'Não foi possível dar baixa',
        description: message || errorMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const fieldLabel = 'text-xs font-semibold text-slate-600'

  return (
    <Dialog open={Boolean(bill)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isPay ? 'Pagar conta' : 'Receber conta'}</DialogTitle>
          <DialogDescription>
            {bill && `${counterpartOf(bill)} · vence ${shortDate(bill.due_date, true)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount" className={fieldLabel}>
                Valor {isPay ? 'pago' : 'recebido'} (R$)
              </Label>
              <Input
                id="settle-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 rounded-lg text-lg font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-date" className={fieldLabel}>
                Data
              </Label>
              <Input
                id="settle-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 rounded-lg"
              />
            </div>
          </div>
          {bill && cents > 0 && cents !== bill.amount_cents && (
            <p className="text-xs text-amber-700">
              {cents > bill.amount_cents
                ? `${formatCents(cents - bill.amount_cents)} a mais que o valor da conta (juros ou multa).`
                : `${formatCents(bill.amount_cents - cents)} a menos que o valor da conta (desconto).`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={fieldLabel}>{isPay ? 'Saiu da conta' : 'Entrou na conta'}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder="Conta" />
                </SelectTrigger>
                <SelectContent>
                  {lookups.accounts
                    .filter((a) => a.is_active)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Forma</Label>
              <Select value={method || NONE} onValueChange={(v) => setMethod(v === NONE ? '' : v)}>
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
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={busy} onClick={onClose} className="rounded-lg">
            Voltar
          </Button>
          <Button
            onClick={handleSettle}
            disabled={busy}
            className="gap-2 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPay ? 'Confirmar pagamento' : 'Confirmar recebimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
