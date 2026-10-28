import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  EyeOff,
  HandCoins,
  Loader2,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents, centsToInput, parseMoneyToCents } from '@/lib/money'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import {
  approveCount,
  cancelCount,
  createCount,
  listCounts,
  pointCountDifference,
  saveRegistry,
  updateCount,
} from '@/services/finance'
import type { FinCount, FinCountEnvelope, Person } from '@/types/finance'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/ConfirmDialog'
import type { FinanceLookups } from './TransactionSheet'
import { useFinanceLookups } from './useFinanceLookups'
import {
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

const envelopesOf = (c: Pick<FinCount, 'envelopes'>): FinCountEnvelope[] =>
  Array.isArray(c.envelopes) ? c.envelopes : []

const countTotal = (c: Pick<FinCount, 'cash_cents' | 'envelopes'>) =>
  (c.cash_cents || 0) + envelopesOf(c).reduce((s, e) => s + (e.amount_cents || 0), 0)

const STATUS: Record<FinCount['status'], { label: string; tone: string }> = {
  CONTADO: { label: 'Aguardando conferência', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  APROVADO: {
    label: 'Aprovada e lançada',
    tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  CANCELADO: { label: 'Cancelada', tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

function StatusBadge({ status }: { status: FinCount['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
        STATUS[status].tone,
      )}
    >
      {STATUS[status].label}
    </span>
  )
}

export default function FinanceCounts() {
  const { currentChurch, user } = useAuth()
  const { canEdit } = useFinanceAccess('contagem')
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const churchId = currentChurch?.id
  const [counts, setCounts] = useState<FinCount[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<FinCount | null>(null)
  const { lookups, reload: reloadLookups } = useFinanceLookups(churchId)

  const load = useCallback(async () => {
    if (!churchId) return
    setLoading(true)
    try {
      setCounts((await listCounts(churchId)).items)
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar as contagens', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [churchId, toast])

  useEffect(() => {
    load()
  }, [load])

  // Atalho: /financeiro/contagem?nova=1
  useEffect(() => {
    if (params.get('nova') && canEdit) {
      setCurrent(null)
      setOpen(true)
      params.delete('nova')
      setParams(params, { replace: true })
    }
  }, [params, setParams, canEdit])

  const pending = counts.filter((c) => c.status === 'CONTADO')
  const others = counts.filter((c) => c.status !== 'CONTADO')

  const openCount = (c: FinCount | null) => {
    setCurrent(c)
    setOpen(true)
  }

  const renderRow = (c: FinCount) => (
    <li key={c.id}>
      <button
        type="button"
        onClick={() => openCount(c)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <HandCoins className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">
            {shortDate(c.date)} · {c.expand?.event_id?.title || 'Culto'}
          </div>
          <div className="truncate text-xs text-slate-500">
            <span className="sm:hidden">{STATUS[c.status].label} · </span>
            Contou: {c.counted_by_name || '—'}
            {c.approved_by_name ? ` · Conferiu: ${c.approved_by_name}` : ''}
            {c.expand?.account_id ? ` · ${c.expand.account_id.name}` : ''}
          </div>
        </div>
        <div className="hidden sm:block">
          <StatusBadge status={c.status} />
        </div>
        <div
          className={cn(
            'w-28 shrink-0 text-right font-semibold tabular-nums',
            c.status === 'CANCELADO' ? 'text-slate-400 line-through' : 'text-slate-900',
          )}
        >
          {formatCents(countTotal(c))}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      </button>
    </li>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contagem do culto"
        subtitle="Uma pessoa conta e registra; outra confere e aprova. Só então vira lançamento."
      >
        {canEdit && (
          <Button onClick={() => openCount(null)} className={primaryButtonClass}>
            <Plus className="h-4 w-4" />
            Nova contagem
          </Button>
        )}
      </PageHeader>

      {!canEdit && <ReadOnlyNotice />}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : counts.length === 0 ? (
        <div className={cn(cardClass, 'px-6 py-14 text-center')}>
          <p className="font-semibold text-slate-800">Nenhuma contagem ainda</p>
          <p className="mt-1 text-sm text-slate-500">
            Depois do culto, registre o total em dinheiro da salva e os envelopes. PIX e cartão não
            entram aqui: chegam pelo extrato do banco.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className={cardClass}>
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-amber-800">
                Aguardando conferência ({pending.length})
              </div>
              <ul className="divide-y divide-slate-100">{pending.map(renderRow)}</ul>
            </div>
          )}
          {others.length > 0 && (
            <div className={cardClass}>
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Histórico
              </div>
              <ul className="divide-y divide-slate-100">{others.map(renderRow)}</ul>
            </div>
          )}
        </>
      )}

      <CountSheet
        open={open}
        onOpenChange={setOpen}
        churchId={churchId || ''}
        userId={user?.id || ''}
        canEdit={canEdit}
        count={current}
        lookups={lookups}
        onLookupsChanged={reloadLookups}
        onChanged={load}
      />
    </div>
  )
}

interface EnvelopeRow {
  key: string
  person_id: string
  anonymous: boolean
  category_id: string
  amount: string
}

const newKey = () => Math.random().toString(36).slice(2)

function CountSheet({
  open,
  onOpenChange,
  churchId,
  userId,
  canEdit,
  count,
  lookups,
  onLookupsChanged,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  userId: string
  canEdit: boolean
  count: FinCount | null
  lookups: FinanceLookups
  onLookupsChanged: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(getLocalTodayYMD())
  const [eventId, setEventId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [cash, setCash] = useState('')
  const [offeringCategoryId, setOfferingCategoryId] = useState('')
  const [envelopes, setEnvelopes] = useState<EnvelopeRow[]>([])
  const [notes, setNotes] = useState('')
  const [differenceOpen, setDifferenceOpen] = useState(false)
  const [difference, setDifference] = useState('')

  const incomeCategories = lookups.categories.filter(
    (c) => c.direction === 'ENTRADA' && (c.is_active || c.id === offeringCategoryId),
  )
  const contributionCategories = incomeCategories.filter((c) => c.is_contribution)
  const activeAccounts = lookups.accounts.filter((a) => a.is_active || a.id === accountId)

  const isNew = !count
  const isCounter = !!count && count.counted_by === userId
  const editable = canEdit && (isNew || (count.status === 'CONTADO' && isCounter))
  const canApprove = canEdit && !!count && count.status === 'CONTADO' && !isCounter

  const findCategory = (name: string) =>
    lookups.categories.find(
      (c) => c.direction === 'ENTRADA' && c.is_active && c.name.toLowerCase() === name,
    )?.id || ''

  useEffect(() => {
    if (!open) return
    setDifferenceOpen(false)
    setDifference('')
    if (count) {
      setDate(count.date.slice(0, 10))
      setEventId(count.event_id || '')
      setAccountId(count.account_id)
      setCash(count.cash_cents ? centsToInput(count.cash_cents) : '')
      setOfferingCategoryId(count.offering_category_id)
      setEnvelopes(
        envelopesOf(count).map((e) => ({
          key: newKey(),
          person_id: e.person_id || '',
          anonymous: !e.person_id,
          category_id: e.category_id,
          amount: centsToInput(e.amount_cents),
        })),
      )
      setNotes(count.notes || '')
    } else {
      setDate(getLocalTodayYMD())
      // Sugere o culto de hoje, se houver
      const today = lookups.events.find((e) => e.date.slice(0, 10) === getLocalTodayYMD())
      setEventId(today?.id || '')
      const cashAccount =
        lookups.accounts.find((a) => a.is_active && a.kind === 'CAIXA') ||
        lookups.accounts.find((a) => a.is_active)
      setAccountId(cashAccount?.id || '')
      setCash('')
      setOfferingCategoryId(findCategory('oferta'))
      setEnvelopes([])
      setNotes('')
    }
    // Só reinicia ao abrir: recarregar cadastros (ex.: pessoa criada aqui) não pode apagar o que foi digitado.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, count])

  const cashCents = parseMoneyToCents(cash) || 0
  const envelopeCents = envelopes.reduce((s, e) => s + (parseMoneyToCents(e.amount) || 0), 0)
  const total = cashCents + envelopeCents

  const addEnvelope = () =>
    setEnvelopes((list) => [
      ...list,
      {
        key: newKey(),
        person_id: '',
        anonymous: false,
        category_id: findCategory('dízimo') || contributionCategories[0]?.id || '',
        amount: '',
      },
    ])

  const patchEnvelope = (key: string, patch: Partial<EnvelopeRow>) =>
    setEnvelopes((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)))

  const createPerson = async (name: string) => {
    const p = await saveRegistry<Person>('people', churchId, { name })
    onLookupsChanged()
    return p.id
  }

  const personName = (id?: string) =>
    lookups.people.find((p) => p.id === id)?.name || (id ? 'Pessoa' : 'Envelope sem nome')
  const categoryName = (id?: string) => lookups.categories.find((c) => c.id === id)?.name || ''
  const accountName = (id?: string) => lookups.accounts.find((a) => a.id === id)?.name || ''
  const eventLabel = (id?: string) => {
    const ev = lookups.events.find((e) => e.id === id)
    return ev ? `${shortDate(ev.date)} · ${ev.title}` : count?.expand?.event_id?.title || ''
  }

  const handleSave = async () => {
    if (!accountId) {
      toast({ title: 'Escolha a conta que recebe o dinheiro', variant: 'destructive' })
      return
    }
    if (!offeringCategoryId) {
      toast({ title: 'Escolha a categoria da oferta', variant: 'destructive' })
      return
    }
    if (cash.trim() && parseMoneyToCents(cash) === null) {
      toast({
        title: 'Valor em dinheiro inválido',
        description: 'Ex.: 1.086,50',
        variant: 'destructive',
      })
      return
    }
    const parsed: FinCountEnvelope[] = []
    for (const e of envelopes) {
      const cents = parseMoneyToCents(e.amount)
      if (!cents || cents <= 0) {
        toast({ title: 'Informe o valor de cada envelope', variant: 'destructive' })
        return
      }
      if (!e.category_id) {
        toast({ title: 'Escolha a categoria de cada envelope', variant: 'destructive' })
        return
      }
      if (!e.anonymous && !e.person_id) {
        toast({
          title: 'De quem é o envelope?',
          description: 'Escolha a pessoa ou marque como sem nome.',
          variant: 'destructive',
        })
        return
      }
      parsed.push({
        person_id: e.anonymous ? '' : e.person_id,
        category_id: e.category_id,
        amount_cents: cents,
      })
    }
    if (total <= 0) {
      toast({ title: 'A contagem está vazia', variant: 'destructive' })
      return
    }

    const input = {
      date,
      event_id: eventId,
      account_id: accountId,
      cash_cents: cashCents,
      offering_category_id: offeringCategoryId,
      envelopes: parsed,
      notes: notes.trim(),
    }
    setSaving(true)
    try {
      if (count) await updateCount(count.id, input)
      else await createCount(churchId, input)
      toast({
        title: 'Contagem enviada para conferência',
        description: 'Outra pessoa do financeiro precisa conferir e aprovar.',
      })
      onChanged()
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

  const handleApprove = () =>
    count &&
    confirm({
      title: 'Aprovar a contagem?',
      description: `Os lançamentos de ${formatCents(countTotal(count))} serão criados na conta ${accountName(count.account_id) || 'escolhida'} e a contagem fica travada.`,
      confirmLabel: 'Aprovar e lançar',
      onConfirm: async () => {
        await approveCount(count.id)
        toast({ title: 'Contagem aprovada', description: 'Os lançamentos já estão no caixa.' })
        onChanged()
        onOpenChange(false)
      },
    })

  const handleDifference = async () => {
    if (!count || !difference.trim()) return
    setSaving(true)
    try {
      await pointCountDifference(count.id, difference.trim())
      toast({
        title: 'Diferença registrada',
        description: 'Quem contou vai ver o aviso e corrigir.',
      })
      onChanged()
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () =>
    count &&
    confirm({
      title: 'Cancelar esta contagem?',
      description: 'Ela fica no histórico como cancelada e nada é lançado.',
      confirmLabel: 'Cancelar contagem',
      destructive: true,
      onConfirm: async () => {
        await cancelCount(count.id)
        toast({ title: 'Contagem cancelada' })
        onChanged()
        onOpenChange(false)
      },
    })

  const fieldLabel = 'text-xs font-semibold text-slate-600'
  const step = !count ? 0 : count.status === 'CONTADO' ? 1 : count.status === 'APROVADO' ? 3 : -1

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{count ? 'Contagem do culto' : 'Nova contagem'}</SheetTitle>
          <SheetDescription>
            Dinheiro da salva (valor total, sem separar notas) e envelopes. PIX e cartão chegam pelo
            extrato do banco.
          </SheetDescription>
        </SheetHeader>

        {step >= 0 && (
          <ol className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {[
              { title: 'Contado', sub: count?.counted_by_name || 'Você' },
              {
                title: 'Conferência',
                sub: count?.approved_by_name || (step === 1 ? 'Outra pessoa' : 'Depois'),
              },
              { title: 'Lançado', sub: step === 3 ? 'No caixa' : 'Ao aprovar' },
            ].map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  'rounded-lg border px-2.5 py-2',
                  i < step
                    ? 'border-teal-200 bg-teal-50'
                    : i === step
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200',
                )}
              >
                <div className="flex items-center gap-1 font-semibold text-slate-800">
                  {i < step && <Check className="h-3.5 w-3.5 text-teal-700" />}
                  {i + 1}. {s.title}
                </div>
                <div className="truncate text-slate-500">{s.sub}</div>
              </li>
            ))}
          </ol>
        )}

        {count?.status === 'CONTADO' && count.difference_note && (
          <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Diferença apontada na conferência</div>
              <div>{count.difference_note}</div>
              {isCounter && <div className="mt-1 text-xs">Corrija os valores e salve de novo.</div>}
            </div>
          </div>
        )}

        {editable ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-[150px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="count-date" className={fieldLabel}>
                  Data
                </Label>
                <Input
                  id="count-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Culto</Label>
                <Select
                  value={eventId || NONE}
                  onValueChange={(v) => setEventId(v === NONE ? '' : v)}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem culto</SelectItem>
                    {lookups.events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {shortDate(ev.date)} · {ev.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <Label htmlFor="count-cash" className={fieldLabel}>
                Dinheiro da salva (valor total contado)
              </Label>
              <Input
                id="count-cash"
                inputMode="decimal"
                placeholder="0,00"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="mt-1.5 h-12 rounded-lg text-xl font-bold"
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={fieldLabel}>Lançar como</Label>
                  <Select value={offeringCategoryId} onValueChange={setOfferingCategoryId}>
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {incomeCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={fieldLabel}>Vai para a conta</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
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
              </div>
            </div>

            <div className="rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Envelopes</div>
                  <div className="text-xs text-slate-500">Com nome vira dízimo da pessoa</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEnvelope}
                  className="h-8 gap-1 rounded-lg"
                >
                  <Plus className="h-3.5 w-3.5" /> Envelope
                </Button>
              </div>
              {envelopes.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-slate-500">Nenhum envelope.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {envelopes.map((e) => (
                    <li key={e.key} className="space-y-2 p-3">
                      <div className="flex items-center gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                          <button
                            type="button"
                            onClick={() => patchEnvelope(e.key, { anonymous: false })}
                            className={cn(
                              'flex items-center justify-center gap-1 rounded-md py-1 text-xs font-semibold',
                              !e.anonymous ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500',
                            )}
                          >
                            <UserRound className="h-3.5 w-3.5" /> Com nome
                          </button>
                          <button
                            type="button"
                            onClick={() => patchEnvelope(e.key, { anonymous: true, person_id: '' })}
                            className={cn(
                              'flex items-center justify-center gap-1 rounded-md py-1 text-xs font-semibold',
                              e.anonymous ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500',
                            )}
                          >
                            <EyeOff className="h-3.5 w-3.5" /> Sem nome
                          </button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remover envelope"
                          onClick={() =>
                            setEnvelopes((list) => list.filter((x) => x.key !== e.key))
                          }
                          className="h-8 w-8 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {!e.anonymous && (
                        <SearchPicker
                          value={e.person_id}
                          onChange={(id) => patchEnvelope(e.key, { person_id: id })}
                          placeholder="Buscar pessoa"
                          options={lookups.people
                            .filter((p) => p.is_active || p.id === e.person_id)
                            .map((p) => ({ id: p.id, label: p.name, hint: p.phone }))}
                          onCreate={createPerson}
                          createLabel="Cadastrar pessoa"
                        />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={e.category_id}
                          onValueChange={(v) => patchEnvelope(e.key, { category_id: v })}
                        >
                          <SelectTrigger className="h-10 rounded-lg">
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {contributionCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label="Valor do envelope"
                          value={e.amount}
                          onChange={(ev) => patchEnvelope(e.key, { amount: ev.target.value })}
                          className="h-10 rounded-lg text-right font-semibold"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="count-notes" className={fieldLabel}>
                Observações (opcional)
              </Label>
              <Textarea
                id="count-notes"
                rows={2}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-lg"
              />
            </div>

            <Summary cash={cashCents} envelopes={envelopeCents} count={envelopes.length} />

            <div className="flex gap-2">
              {count && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={handleCancel}
                  className="h-10 rounded-lg text-rose-700"
                >
                  Cancelar contagem
                </Button>
              )}
              <Button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="h-10 flex-1 gap-2 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar para conferência
              </Button>
            </div>
          </div>
        ) : count ? (
          <div className="mt-5 space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Data</dt>
                <dd className="font-semibold text-slate-900">{shortDate(count.date, true)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Culto</dt>
                <dd className="font-semibold text-slate-900">
                  {eventLabel(count.event_id) || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Conta</dt>
                <dd className="font-semibold text-slate-900">
                  {accountName(count.account_id) || count.expand?.account_id?.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Situação</dt>
                <dd>
                  <StatusBadge status={count.status} />
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-slate-200">
              <div className="flex justify-between px-3 py-2.5 text-sm">
                <span>
                  Dinheiro da salva
                  <span className="text-slate-500">
                    {' '}
                    · {categoryName(count.offering_category_id)}
                  </span>
                </span>
                <b className="tabular-nums">{formatCents(count.cash_cents || 0)}</b>
              </div>
              {envelopesOf(count).map((e, i) => (
                <div
                  key={i}
                  className="flex justify-between border-t border-slate-100 px-3 py-2.5 text-sm"
                >
                  <span>
                    {personName(e.person_id)}
                    <span className="text-slate-500"> · {categoryName(e.category_id)}</span>
                  </span>
                  <b className="tabular-nums">{formatCents(e.amount_cents)}</b>
                </div>
              ))}
              <div className="flex items-baseline justify-between border-t border-slate-200 bg-slate-50 px-3 py-3">
                <span className="text-sm font-semibold text-slate-700">Total do culto</span>
                <b className="text-xl tabular-nums">{formatCents(countTotal(count))}</b>
              </div>
            </div>

            {count.notes && (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{count.notes}</p>
            )}

            {count.status === 'CONTADO' && isCounter && (
              <p className="text-sm text-slate-500">
                Aguardando outra pessoa do financeiro conferir e aprovar.
              </p>
            )}

            {canApprove && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-sm text-amber-900">
                  <b>Confira e aprove.</b> Recontem o dinheiro juntos. Se bater, aprove: os
                  lançamentos são criados e a contagem fica travada.
                </div>
                {differenceOpen ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={2}
                      maxLength={500}
                      autoFocus
                      placeholder="Ex.: contei R$ 1.076,50 no dinheiro da salva"
                      value={difference}
                      onChange={(e) => setDifference(e.target.value)}
                      className="rounded-lg bg-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDifferenceOpen(false)}
                        className="h-9 rounded-lg"
                      >
                        Voltar
                      </Button>
                      <Button
                        type="button"
                        disabled={saving || !difference.trim()}
                        onClick={handleDifference}
                        className="h-9 flex-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                      >
                        Enviar para quem contou
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDifferenceOpen(true)}
                      className="h-10 rounded-lg bg-white"
                    >
                      Apontar diferença
                    </Button>
                    <Button
                      type="button"
                      onClick={handleApprove}
                      className="h-10 flex-1 gap-1.5 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
                    >
                      <Check className="h-4 w-4" /> Aprovar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {count.status === 'APROVADO' && (
              <p className="text-sm text-slate-500">
                Aprovada por {count.approved_by_name || 'outra pessoa'}
                {count.approved_at ? ` em ${shortDate(count.approved_at, true)}` : ''}. Os
                lançamentos estão em Lançamentos, marcados como contagem do culto.
              </p>
            )}
          </div>
        ) : null}
        {dialog}
      </SheetContent>
    </Sheet>
  )
}

function Summary({ cash, envelopes, count }: { cash: number; envelopes: number; count: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 text-sm">
      <div className="flex justify-between px-3 py-2">
        <span>Dinheiro da salva</span>
        <span className="tabular-nums">{formatCents(cash)}</span>
      </div>
      <div className="flex justify-between border-t border-dashed border-slate-200 px-3 py-2">
        <span>Envelopes ({count})</span>
        <span className="tabular-nums">{formatCents(envelopes)}</span>
      </div>
      <div className="flex items-baseline justify-between border-t border-slate-200 px-3 py-3">
        <span className="font-semibold">Total do culto</span>
        <b className="text-xl tabular-nums">{formatCents(cash + envelopes)}</b>
      </div>
    </div>
  )
}
