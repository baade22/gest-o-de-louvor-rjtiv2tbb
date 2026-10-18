import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  EyeOff,
  Loader2,
  Paperclip,
  UserRound,
  X,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { centsToInput, parseMoneyToCents } from '@/lib/money'
import {
  createTransaction,
  saveRegistry,
  updateTransaction,
  type TransactionInput,
} from '@/services/finance'
import type {
  FinAccount,
  FinCategory,
  FinCostCenter,
  FinSupplier,
  FinTransaction,
  FinTransactionType,
  Person,
} from '@/types/finance'
import { PAYMENT_METHOD_LABELS, SearchPicker, errorMessage, shortDate } from './shared'

export interface FinanceLookups {
  accounts: FinAccount[]
  categories: FinCategory[]
  costCenters: FinCostCenter[]
  suppliers: FinSupplier[]
  people: Person[]
  events: { id: string; title: string; date: string }[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  lookups: FinanceLookups
  /** Lançamento em edição; vazio para um novo. */
  editing?: FinTransaction | null
  onSaved: () => void
  /** Avisa quando uma pessoa ou fornecedor foi cadastrado direto no formulário. */
  onLookupsChanged: () => void
}

const NONE = '__none__'

const defaultMethod = (type: FinTransactionType) =>
  type === 'ENTRADA' ? 'DINHEIRO' : type === 'SAIDA' ? 'PIX' : 'TRANSFERENCIA'

const TYPE_OPTIONS = [
  { type: 'ENTRADA', label: 'Entrada', icon: ArrowDownLeft, tone: 'text-emerald-700' },
  { type: 'SAIDA', label: 'Saída', icon: ArrowUpRight, tone: 'text-rose-700' },
  { type: 'TRANSFERENCIA', label: 'Transferência', icon: ArrowLeftRight, tone: 'text-indigo-700' },
] as const

const emptyForm = (type: FinTransactionType = 'ENTRADA') => ({
  type,
  date: getLocalTodayYMD(),
  amount: '',
  description: '',
  account_id: '',
  to_account_id: '',
  category_id: '',
  cost_center_id: '',
  payment_method: defaultMethod(type),
  person_id: '',
  is_anonymous: false,
  supplier_id: '',
  event_id: '',
  notes: '',
})

export function TransactionSheet({
  open,
  onOpenChange,
  churchId,
  lookups,
  editing,
  onSaved,
  onLookupsChanged,
}: Props) {
  const { toast } = useToast()
  const [form, setForm] = useState(emptyForm())
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const activeAccounts = lookups.accounts.filter((a) => a.is_active || a.id === form.account_id)
  const activeCostCenters = lookups.costCenters.filter(
    (c) => c.is_active || c.id === form.cost_center_id,
  )

  useEffect(() => {
    if (!open) return
    setFile(null)
    if (editing) {
      setForm({
        type: editing.type,
        date: editing.date.slice(0, 10),
        amount: centsToInput(editing.amount_cents),
        description: editing.description || '',
        account_id: editing.account_id,
        to_account_id: editing.to_account_id || '',
        category_id: editing.category_id || '',
        cost_center_id: editing.cost_center_id || '',
        payment_method: editing.payment_method || '',
        person_id: editing.person_id || '',
        is_anonymous: editing.is_anonymous,
        supplier_id: editing.supplier_id || '',
        event_id: editing.event_id || '',
        notes: editing.notes || '',
      })
    } else {
      const base = emptyForm()
      const firstAccount = lookups.accounts.find((a) => a.is_active)
      setForm({ ...base, account_id: firstAccount?.id || '' })
    }
    // Só reinicia ao abrir: recarregar cadastros (ex.: pessoa criada aqui) não pode apagar o que foi digitado.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const categories = useMemo(
    () =>
      lookups.categories.filter(
        (c) => c.direction === form.type && (c.is_active || c.id === form.category_id),
      ),
    [lookups.categories, form.type, form.category_id],
  )
  const category = lookups.categories.find((c) => c.id === form.category_id)
  const isTransfer = form.type === 'TRANSFERENCIA'
  const isContribution = form.type === 'ENTRADA' && Boolean(category?.is_contribution)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const switchType = (type: FinTransactionType) => {
    if (type === form.type) return
    set({
      type,
      category_id: '',
      to_account_id: '',
      person_id: '',
      is_anonymous: false,
      supplier_id: '',
      payment_method: defaultMethod(type),
    })
  }

  const createPerson = async (name: string) => {
    const p = await saveRegistry<Person>('people', churchId, { name })
    onLookupsChanged()
    return p.id
  }

  const createSupplier = async (name: string) => {
    const s = await saveRegistry<FinSupplier>('fin_suppliers', churchId, { name })
    onLookupsChanged()
    return s.id
  }

  const handleSave = async (e: React.SyntheticEvent, keepOpen = false) => {
    e.preventDefault()
    const cents = parseMoneyToCents(form.amount)
    if (!cents || cents <= 0) {
      toast({ title: 'Informe o valor', description: 'Ex.: 150,00', variant: 'destructive' })
      return
    }
    if (!form.account_id) {
      toast({ title: 'Escolha a conta', variant: 'destructive' })
      return
    }
    if (isTransfer && (!form.to_account_id || form.to_account_id === form.account_id)) {
      toast({ title: 'Escolha a conta de destino', variant: 'destructive' })
      return
    }
    if (!isTransfer && !form.category_id) {
      toast({ title: 'Escolha a categoria', variant: 'destructive' })
      return
    }
    if (isContribution && !form.is_anonymous && !form.person_id) {
      toast({
        title: 'Quem contribuiu?',
        description: 'Escolha a pessoa ou marque como anônimo.',
        variant: 'destructive',
      })
      return
    }

    const input: TransactionInput = {
      type: form.type,
      date: form.date,
      amount_cents: cents,
      description: form.description.trim(),
      account_id: form.account_id,
      to_account_id: isTransfer ? form.to_account_id : '',
      category_id: isTransfer ? '' : form.category_id,
      cost_center_id: isTransfer ? '' : form.cost_center_id,
      payment_method: form.payment_method,
      person_id: isContribution && !form.is_anonymous ? form.person_id : '',
      is_anonymous: isContribution && form.is_anonymous,
      supplier_id: form.type === 'SAIDA' ? form.supplier_id : '',
      event_id: isTransfer ? '' : form.event_id,
      notes: form.notes.trim(),
      attachment: file,
    }

    setSaving(true)
    try {
      if (editing) await updateTransaction(editing.id, input)
      else await createTransaction(churchId, input)
      toast({ title: editing ? 'Lançamento atualizado' : 'Lançamento salvo' })
      onSaved()
      if (keepOpen && !editing) {
        // Mantém tipo, data, conta, categoria e culto para lançar o próximo mais rápido.
        setForm((f) => ({
          ...f,
          amount: '',
          description: '',
          person_id: '',
          is_anonymous: false,
          notes: '',
        }))
        setFile(null)
      } else {
        onOpenChange(false)
      }
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
          <SheetTitle>{editing ? 'Editar lançamento' : 'Novo lançamento'}</SheetTitle>
          <SheetDescription>
            {editing
              ? `Lançado em ${shortDate(editing.created, true)}`
              : 'Entrada, saída ou transferência entre contas.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={(e) => handleSave(e)} className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {TYPE_OPTIONS.map(({ type, label, icon: Icon, tone }) => (
              <button
                key={type}
                type="button"
                // Lançamento de um tipo não vira transferência (e vice-versa) na edição
                disabled={
                  !!editing && (type === 'TRANSFERENCIA') !== (editing.type === 'TRANSFERENCIA')
                }
                onClick={() => switchType(type)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-semibold transition-colors disabled:opacity-40',
                  form.type === type ? 'bg-white shadow-xs ' + tone : 'text-slate-500',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_150px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fin-amount" className={fieldLabel}>
                Valor (R$)
              </Label>
              <Input
                id="fin-amount"
                inputMode="decimal"
                autoFocus
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="h-12 rounded-lg text-xl font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-date" className={fieldLabel}>
                Data
              </Label>
              <Input
                id="fin-date"
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
                className="h-12 rounded-lg"
              />
            </div>
          </div>

          {isTransfer ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Sai da conta</Label>
                <Select value={form.account_id} onValueChange={(v) => set({ account_id: v })}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Vai para a conta</Label>
                <Select value={form.to_account_id} onValueChange={(v) => set({ to_account_id: v })}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts
                      .filter((a) => a.id !== form.account_id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="col-span-2 text-xs text-slate-500">
                Ex.: depósito do dinheiro do caixa no banco. Não conta como entrada nem saída.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => set({ category_id: v })}>
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
              {categories.length === 0 && (
                <p className="text-xs text-amber-700">
                  Nenhuma categoria de {form.type === 'ENTRADA' ? 'entrada' : 'saída'}. Cadastre em
                  Cadastros.
                </p>
              )}
            </div>
          )}

          {isContribution && (
            <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
              <Label className={fieldLabel}>Quem contribuiu</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => set({ is_anonymous: false })}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-semibold',
                    !form.is_anonymous ? 'bg-teal-700 text-white' : 'text-slate-500',
                  )}
                >
                  <UserRound className="h-4 w-4" /> Pessoa
                </button>
                <button
                  type="button"
                  onClick={() => set({ is_anonymous: true, person_id: '' })}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-semibold',
                    form.is_anonymous ? 'bg-teal-700 text-white' : 'text-slate-500',
                  )}
                >
                  <EyeOff className="h-4 w-4" /> Anônimo
                </button>
              </div>
              {!form.is_anonymous && (
                <SearchPicker
                  value={form.person_id}
                  onChange={(id) => set({ person_id: id })}
                  placeholder="Buscar pessoa"
                  options={lookups.people
                    .filter((p) => p.is_active || p.id === form.person_id)
                    .map((p) => ({ id: p.id, label: p.name, hint: p.phone }))}
                  onCreate={createPerson}
                  createLabel="Cadastrar pessoa"
                />
              )}
            </div>
          )}

          {form.type === 'SAIDA' && (
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Fornecedor (opcional)</Label>
              <SearchPicker
                value={form.supplier_id}
                onChange={(id) => set({ supplier_id: id })}
                placeholder="Para quem foi pago"
                options={lookups.suppliers
                  .filter((s) => s.is_active || s.id === form.supplier_id)
                  .map((s) => ({ id: s.id, label: s.name }))}
                onCreate={createSupplier}
                createLabel="Cadastrar fornecedor"
              />
            </div>
          )}

          {!isTransfer && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={fieldLabel}>
                  {form.type === 'ENTRADA' ? 'Entrou na conta' : 'Saiu da conta'}
                </Label>
                <Select value={form.account_id} onValueChange={(v) => set({ account_id: v })}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Forma</Label>
                <Select
                  value={form.payment_method || NONE}
                  onValueChange={(v) => set({ payment_method: v === NONE ? '' : v })}
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
            </div>
          )}

          {!isTransfer && (
            <div className={cn('grid gap-3', activeCostCenters.length > 1 && 'grid-cols-2')}>
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Culto (opcional)</Label>
                <Select
                  value={form.event_id || NONE}
                  onValueChange={(v) => set({ event_id: v === NONE ? '' : v })}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {lookups.events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {shortDate(ev.date)} · {ev.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Centro de custo só aparece quando a igreja usa mais de um */}
              {activeCostCenters.length > 1 && (
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
                      {activeCostCenters.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fin-desc" className={fieldLabel}>
              Descrição (opcional)
            </Label>
            <Input
              id="fin-desc"
              maxLength={200}
              placeholder={
                form.type === 'ENTRADA'
                  ? 'Ex.: Oferta do culto de domingo'
                  : isTransfer
                    ? 'Ex.: Depósito do caixa'
                    : 'Ex.: Conta de luz de outubro'
              }
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label className={fieldLabel}>Comprovante (opcional)</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 text-slate-400" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="ml-auto text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-slate-400">
                <Paperclip className="h-4 w-4" />
                {editing?.attachment ? 'Trocar comprovante anexado' : 'Anexar foto ou PDF'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fin-notes" className={fieldLabel}>
              Observações (opcional)
            </Label>
            <Textarea
              id="fin-notes"
              rows={2}
              maxLength={1000}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className="rounded-lg"
            />
          </div>

          <div className="flex gap-2 pt-2">
            {!editing && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={(e) => handleSave(e, true)}
                className="h-10 flex-1 rounded-lg"
              >
                Salvar e lançar outro
              </Button>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="h-10 flex-1 gap-2 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
