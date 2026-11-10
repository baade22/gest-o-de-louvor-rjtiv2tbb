// Rendimentos bancários e Despesas bancárias (tarifas, IOF...), como no Eklesia.
// A lista mostra todo lançamento das categorias de rendimento (ou de despesa bancária) da
// conta no período, venha de onde vier: conciliação, regra das tarifas, avulso ou importação.
// "Novo" lança do extrato (já sai conciliado) ou avulso (concilia depois, aqui mesmo).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Link2, Loader2, MoreHorizontal, Plus, Unlink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { cn } from '@/lib/utils'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import { brtDay } from '@/lib/bankStatement'
import {
  defaultCategoryName,
  isBankItemCategory,
  itemDirection,
  lineCandidates,
  type BankItemKind,
} from '@/lib/bankItems'
import { isRealized } from '@/lib/realizedBalance'
import {
  createTransaction,
  listCategoryTransactions,
  listPendingLinesOf,
  reconcileLine,
  saveRegistry,
  unreconcileLine,
  voidTransaction,
} from '@/services/finance'
import type { FinAccount, FinBankLine, FinCategory, FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  errorMessage,
  primaryButtonClass,
  shortDate,
  useFinanceAccess,
} from './shared'
import { useFinanceLookups } from './useFinanceLookups'
import { useReconcileStarts } from './useReconcileStarts'

const ALL = '__all__'
const today = () => brtDay(new Date().toISOString())
const DAY = 24 * 60 * 60 * 1000
const shiftDay = (ymd: string, n: number) =>
  new Date(new Date(`${ymd}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10)

const TEXT: Record<BankItemKind, { title: string; subtitle: string; one: string }> = {
  RENDIMENTO: {
    title: 'Rendimentos bancários',
    subtitle:
      'Rendimento de aplicação e de conta remunerada. Lance do extrato (já conciliado) ou avulso.',
    one: 'rendimento',
  },
  DESPESA: {
    title: 'Despesas bancárias',
    subtitle: 'Tarifas, cesta de serviços, IOF. Lance do extrato (já conciliado) ou avulso.',
    one: 'despesa bancária',
  },
}

export default function FinanceBankItems({ kind }: { kind: BankItemKind }) {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id
  const { canView, canEdit } = useFinanceAccess('conciliacao')
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const { lookups, reload: reloadLookups } = useFinanceLookups(churchId)
  const starts = useReconcileStarts(churchId, lookups.accounts)
  const text = TEXT[kind]

  const [accountId, setAccountId] = useState(ALL)
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`)
  const [to, setTo] = useState(today())
  const [voided, setVoided] = useState(false)
  const [items, setItems] = useState<FinTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [linking, setLinking] = useState<FinTransaction | null>(null)

  const categories = useMemo(
    () =>
      [...lookups.categories, ...(lookups.categoryGroups || [])].filter((c) =>
        isBankItemCategory(c, kind),
      ),
    [lookups.categories, lookups.categoryGroups, kind],
  )
  const categoryKey = categories.map((c) => c.id).join(',')
  const accounts = lookups.accounts.filter((a) => a.is_active)

  const load = useCallback(async () => {
    if (!churchId || !from || !to) return
    setLoading(true)
    try {
      setItems(
        await listCategoryTransactions(
          churchId,
          categoryKey ? categoryKey.split(',') : [],
          from,
          to,
          {
            accountId: accountId === ALL ? undefined : accountId,
            voided,
          },
        ),
      )
    } catch (err) {
      toast({
        title: 'Não foi possível carregar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [churchId, categoryKey, from, to, accountId, voided, toast])

  useEffect(() => {
    load()
  }, [load])

  const signed = (t: FinTransaction) => (t.type === 'SAIDA' ? -t.amount_cents : t.amount_cents)
  const total = items.reduce((s, t) => s + (kind === 'DESPESA' ? t.amount_cents : signed(t)), 0)

  /** Situação da conciliação: data, "a conciliar" ou "não precisa" (caixa, fundo). */
  const reconcileState = (t: FinTransaction) => {
    const line = t.expand?.bank_line_id
    if (t.bank_line_id)
      return {
        state: 'OK' as const,
        label: shortDate(line?.reconciled_at || line?.date || t.date, true),
      }
    if (isRealized(t, t.account_id, starts)) return { state: 'FREE' as const, label: 'Não precisa' }
    return { state: 'PENDING' as const, label: 'A conciliar' }
  }

  const undo = (t: FinTransaction) =>
    confirm({
      title: 'Desfazer a conciliação?',
      description:
        'O lançamento continua aqui, mas volta a ficar a conciliar e o movimento volta para a Conciliação.',
      confirmLabel: 'Desfazer',
      onConfirm: async () => {
        try {
          await unreconcileLine(t.bank_line_id!)
          toast({ title: 'Conciliação desfeita' })
          load()
        } catch (err) {
          toast({
            title: 'Não foi possível desfazer',
            description: errorMessage(err, 'Tente de novo.'),
            variant: 'destructive',
          })
        }
      },
    })

  const cancel = (t: FinTransaction) =>
    confirm({
      title: `Estornar este ${text.one}?`,
      description: `${shortDate(t.date, true)} · ${formatCents(t.amount_cents)}. Ele sai do saldo e fica em "Ver estornados". Se estava conciliado, o movimento do extrato volta a ficar pendente.`,
      confirmLabel: 'Estornar',
      destructive: true,
      onConfirm: async () => {
        try {
          await voidTransaction(t.id, `Estornado em ${text.title}`)
          toast({ title: 'Estornado' })
          load()
        } catch (err) {
          toast({
            title: 'Não foi possível estornar',
            description: errorMessage(err, 'Tente de novo.'),
            variant: 'destructive',
          })
        }
      },
    })

  if (!canView) return null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={text.title} subtitle={text.subtitle}>
        <Button variant="outline" onClick={() => setVoided(!voided)}>
          <Ban className="mr-2 h-4 w-4" />
          {voided ? 'Ver ativos' : 'Ver estornados'}
        </Button>
        {canEdit && (
          <Button className={primaryButtonClass} onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo
          </Button>
        )}
      </PageHeader>
      {!canEdit && <ReadOnlyNotice />}

      <div className={cn(cardClass, 'flex flex-wrap items-end gap-3 p-4')}>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <Label>Conta</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as contas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bi-from">Data inicial</Label>
            <Input
              id="bi-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="sm:w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bi-to">Data final</Label>
            <Input
              id="bi-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="sm:w-[160px]"
            />
          </div>
        </div>
      </div>

      <div className={cn(cardClass, 'overflow-hidden')}>
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {categories.length
              ? 'Nenhum registro encontrado.'
              : `Ainda não há categoria de ${text.one}. Ela é criada no primeiro lançamento.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 sm:px-4">Baixa</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Conciliação</th>
                  <th className="px-3 py-2.5 sm:px-4">Histórico</th>
                  <th className="px-3 py-2.5 text-right sm:px-4">Valor</th>
                  <th className="w-12 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const r = reconcileState(t)
                  const value = kind === 'DESPESA' ? t.amount_cents : signed(t)
                  const state = voided ? (
                    <span className="text-slate-400">Estornado</span>
                  ) : r.state === 'PENDING' ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      A conciliar
                    </span>
                  ) : (
                    <span className={r.state === 'FREE' ? 'text-slate-400' : 'tabular-nums'}>
                      {r.label}
                    </span>
                  )
                  return (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums sm:px-4">
                        {shortDate(t.date, true)}
                        <div className="mt-1 text-xs sm:hidden">{state}</div>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 sm:table-cell">
                        {state}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4">
                        <p className="line-clamp-2 text-slate-800">
                          {t.description || t.expand?.category_id?.name || '—'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {[
                            accountId === ALL && t.expand?.account_id?.name,
                            t.expand?.category_id?.name,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums sm:px-4',
                          kind === 'RENDIMENTO' && value < 0 && 'text-red-600',
                        )}
                      >
                        {formatCents(value)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {canEdit && !voided && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Ações">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {r.state === 'PENDING' && (
                                <DropdownMenuItem onClick={() => setLinking(t)}>
                                  <Link2 className="mr-2 h-4 w-4" /> Conciliar com o extrato
                                </DropdownMenuItem>
                              )}
                              {r.state === 'OK' && (
                                <DropdownMenuItem onClick={() => undo(t)}>
                                  <Unlink className="mr-2 h-4 w-4" /> Desfazer conciliação
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-red-600" onClick={() => cancel(t)}>
                                <Ban className="mr-2 h-4 w-4" /> Estornar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="hidden sm:table-cell" />
                  <td colSpan={2} className="px-3 py-2.5 text-right text-slate-600 sm:px-4">
                    Total ({items.length})
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {formatCents(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {churchId && (
        <NewItemDialog
          open={creating}
          kind={kind}
          churchId={churchId}
          accounts={accounts}
          categories={categories}
          defaultAccountId={accountId === ALL ? '' : accountId}
          needsStatement={(id) => !!starts[id]}
          onClose={() => setCreating(false)}
          onSaved={() => {
            reloadLookups()
            load()
          }}
        />
      )}
      {churchId && (
        <LinkDialog
          tx={linking}
          kind={kind}
          churchId={churchId}
          onClose={() => setLinking(null)}
          onSaved={load}
        />
      )}
      {dialog}
    </div>
  )
}

function LineOption({
  line,
  exact,
  active,
  onPick,
}: {
  line: Pick<FinBankLine, 'id' | 'date' | 'amount_cents' | 'description'>
  exact?: boolean
  active: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0',
        active ? 'bg-teal-50' : 'hover:bg-slate-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-slate-800">{line.description || 'Movimento'}</span>
        <span className="text-xs text-slate-500">
          {shortDate(line.date, true)}
          {exact ? ' · mesmo valor' : ''}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          line.amount_cents < 0 ? 'text-red-600' : 'text-emerald-700',
        )}
      >
        {formatCents(line.amount_cents)}
      </span>
    </button>
  )
}

function NewItemDialog({
  open,
  kind,
  churchId,
  accounts,
  categories,
  defaultAccountId,
  needsStatement,
  onClose,
  onSaved,
}: {
  open: boolean
  kind: BankItemKind
  churchId: string
  accounts: FinAccount[]
  categories: FinCategory[]
  defaultAccountId: string
  /** A conta tem extrato para conciliar? */
  needsStatement: (accountId: string) => boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [accountId, setAccountId] = useState('')
  const [mode, setMode] = useState<'EXTRATO' | 'AVULSO'>('EXTRATO')
  const [negative, setNegative] = useState(false)
  const [lines, setLines] = useState<FinBankLine[]>([])
  const [loadingLines, setLoadingLines] = useState(false)
  const [lineId, setLineId] = useState('')
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const first = defaultAccountId || accounts.find((a) => a.kind !== 'CAIXA')?.id || ''
    setAccountId(first)
    setMode(first && needsStatement(first) ? 'EXTRATO' : 'AVULSO')
    setNegative(false)
    setLineId('')
    setDate(today())
    setAmount('')
    setDescription('')
    // Só reinicia ao abrir
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const direction = itemDirection(kind, negative)
  const options = categories.filter((c) => c.direction === direction && !c.is_group)
  useEffect(() => {
    setCategoryId(options[0]?.id || '')
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, categories])

  const account = accounts.find((a) => a.id === accountId)
  const hasStatement = !!accountId && account?.kind !== 'CAIXA'
  const isFree = !!accountId && !needsStatement(accountId)

  useEffect(() => {
    if (!open || mode !== 'EXTRATO' || !accountId) return
    let alive = true
    setLoadingLines(true)
    listPendingLinesOf(churchId, accountId, shiftDay(today(), -90), today())
      .then((l) => alive && setLines(l))
      .catch(() => alive && setLines([]))
      .finally(() => alive && setLoadingLines(false))
    return () => {
      alive = false
    }
  }, [open, mode, accountId, churchId])

  const candidates = lineCandidates(lines, { kind, direction })
  const line = lines.find((l) => l.id === lineId)

  const ensureCategory = async () => {
    if (categoryId) return categoryId
    const c = await saveRegistry<FinCategory>('fin_categories', churchId, {
      name: defaultCategoryName(kind, direction),
      direction,
      is_contribution: false,
    })
    return c.id
  }

  const submit = async () => {
    if (!accountId) {
      toast({ title: 'Escolha a conta', variant: 'destructive' })
      return
    }
    const cents = parseMoneyToCents(amount)
    if (mode === 'EXTRATO' && !line) {
      toast({ title: 'Escolha o movimento do extrato', variant: 'destructive' })
      return
    }
    if (mode === 'AVULSO' && (!cents || cents <= 0)) {
      toast({ title: 'Informe o valor', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const category_id = await ensureCategory()
      if (mode === 'EXTRATO') {
        await reconcileLine(line!.id, {
          create: {
            category_id,
            description: description.trim() || line!.description || '',
            payment_method: 'OUTRO',
          },
        })
        toast({ title: 'Lançado e conciliado' })
      } else {
        await createTransaction(churchId, {
          type: direction,
          date,
          amount_cents: cents!,
          account_id: accountId,
          category_id,
          description: description.trim(),
          payment_method: 'OUTRO',
        })
        toast({
          title: 'Lançado',
          description: isFree
            ? undefined
            : 'Fica a conciliar até ligar ao movimento do extrato (menu da linha).',
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      toast({
        title: 'Não foi possível lançar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const label = 'text-xs font-semibold text-slate-600'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Novo {kind === 'RENDIMENTO' ? 'rendimento' : 'despesa bancária'}
            {account ? ` · ${account.name}` : ''}
          </DialogTitle>
          <DialogDescription>
            Do extrato já sai conciliado. Avulso fica a conciliar (em conta sem extrato, já vale no
            saldo).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className={label}>Conta</Label>
            <Select
              value={accountId}
              onValueChange={(v) => {
                setAccountId(v)
                setLineId('')
                if (accounts.find((a) => a.id === v)?.kind === 'CAIXA') setMode('AVULSO')
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['EXTRATO', 'Do extrato (conciliado)'],
                ['AVULSO', 'Avulso'],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                disabled={value === 'EXTRATO' && !hasStatement}
                onClick={() => setMode(value)}
                className={cn(
                  'rounded-md py-2 text-[13px] font-semibold disabled:opacity-40',
                  mode === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500',
                )}
              >
                {text}
              </button>
            ))}
          </div>

          {kind === 'RENDIMENTO' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={negative}
                onCheckedChange={(on) => {
                  setNegative(on === true)
                  setLineId('')
                }}
              />
              Rendimento com valor negativo
            </label>
          )}

          {mode === 'EXTRATO' ? (
            <div className="space-y-1.5">
              <Label className={label}>Movimento do extrato</Label>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                {loadingLines ? (
                  <p className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando o extrato…
                  </p>
                ) : candidates.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">
                    Nenhum movimento pendente nos últimos 90 dias. Atualize o extrato em Saldos e
                    extratos ou lance avulso.
                  </p>
                ) : (
                  candidates.map((c) => (
                    <LineOption
                      key={c.line.id}
                      line={c.line}
                      active={c.line.id === lineId}
                      onPick={() => {
                        setLineId(c.line.id)
                        setDescription((c.line.description || '').slice(0, 200))
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={label} htmlFor="bi-date">
                  Data
                </Label>
                <Input
                  id="bi-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={label} htmlFor="bi-amount">
                  Valor
                </Label>
                <Input
                  id="bi-amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-right"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className={label}>Categoria</Label>
            {options.length ? (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Vai ser criada a categoria “{defaultCategoryName(kind, direction)}”.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className={label} htmlFor="bi-desc">
              Histórico
            </Label>
            <Textarea
              id="bi-desc"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                kind === 'RENDIMENTO'
                  ? 'Ex.: Rendimento do Fundo Max DI'
                  : 'Ex.: Tarifa pacote de serviços'
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button className={primaryButtonClass} disabled={saving} onClick={submit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'EXTRATO' ? 'Lançar e conciliar' : 'Lançar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Liga um lançamento avulso ao movimento do extrato com o mesmo valor. */
function LinkDialog({
  tx,
  kind,
  churchId,
  onClose,
  onSaved,
}: {
  tx: FinTransaction | null
  kind: BankItemKind
  churchId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [lines, setLines] = useState<FinBankLine[]>([])
  const [loading, setLoading] = useState(false)
  const [lineId, setLineId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!tx) return
    let alive = true
    setLineId('')
    setLoading(true)
    const d = tx.date.slice(0, 10)
    listPendingLinesOf(churchId, tx.account_id, shiftDay(d, -15), shiftDay(d, 15))
      .then((l) => alive && setLines(l))
      .catch(() => alive && setLines([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [tx, churchId])

  const same = tx
    ? lineCandidates(lines, {
        kind,
        direction: tx.type === 'ENTRADA' ? 'ENTRADA' : 'SAIDA',
        amountCents: tx.amount_cents,
        date: tx.date,
      }).filter((c) => c.exact)
    : []

  useEffect(() => {
    if (same.length === 1) setLineId(same[0].line.id)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [lines])

  const submit = async () => {
    if (!tx || !lineId) return
    setSaving(true)
    try {
      await reconcileLine(lineId, { transaction_id: tx.id })
      toast({ title: 'Conciliado' })
      onSaved()
      onClose()
    } catch (err) {
      toast({
        title: 'Não foi possível conciliar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!tx} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conciliar com o extrato</DialogTitle>
          <DialogDescription>
            {tx &&
              `${shortDate(tx.date, true)} · ${formatCents(tx.amount_cents)} · ${tx.expand?.account_id?.name || ''}`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
          {loading ? (
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando o extrato…
            </p>
          ) : same.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">
              O extrato ainda não tem um movimento pendente com esse valor (15 dias antes ou
              depois). Quando chegar, concilie por aqui ou pela Conciliação.
            </p>
          ) : (
            same.map((c) => (
              <LineOption
                key={c.line.id}
                line={c.line}
                exact
                active={c.line.id === lineId}
                onPick={() => setLineId(c.line.id)}
              />
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button className={primaryButtonClass} disabled={saving || !lineId} onClick={submit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
