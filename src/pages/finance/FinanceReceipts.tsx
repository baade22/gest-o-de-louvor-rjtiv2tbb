import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  Phone,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import {
  chooseReceiptLine,
  deleteReceiptSender,
  discardReceipt,
  listReceiptSenders,
  listReceipts,
  receiptFileUrl,
  receiptsStatus,
  retryReceipt,
  saveReceiptSender,
} from '@/services/finance'
import type {
  FinReceipt,
  FinReceiptLine,
  FinReceiptSender,
  FinReceiptStatus,
  FinReceiptsStatus,
} from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFinanceLookups } from './useFinanceLookups'
import {
  PAYMENT_METHOD_LABELS,
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  errorMessage,
  primaryButtonClass,
  shortDate,
  useFinanceAccess,
} from './shared'

type Tab = 'conferir' | 'andamento' | 'concluidos' | ''

const TABS: { id: Tab; label: string }[] = [
  { id: 'conferir', label: 'Para conferir' },
  { id: 'andamento', label: 'Em andamento' },
  { id: 'concluidos', label: 'Concluídos' },
  { id: '', label: 'Todos' },
]

const STATUS: Record<FinReceiptStatus, { label: string; className: string }> = {
  RECEBIDO: { label: 'Na fila da IA', className: 'bg-slate-100 text-slate-700' },
  LENDO: { label: 'Lendo', className: 'bg-slate-100 text-slate-700' },
  AGUARDANDO: { label: 'Esperando o extrato', className: 'bg-sky-50 text-sky-800' },
  ANALISE: { label: 'Para conferir', className: 'bg-amber-50 text-amber-800' },
  CONFIRMANDO: { label: 'Conciliando', className: 'bg-teal-50 text-teal-800' },
  CONCILIADO: { label: 'Conciliado', className: 'bg-emerald-50 text-emerald-800' },
  DESCARTADO: { label: 'Descartado', className: 'bg-slate-100 text-slate-500' },
}

const BUSY: FinReceiptStatus[] = ['RECEBIDO', 'LENDO', 'CONFIRMANDO']

const serverMessage = (err: unknown, fallback: string) =>
  (err as { response?: { message?: string } })?.response?.message || errorMessage(err, fallback)

const phoneLabel = (p: string) => {
  const d = p.replace(/^55/, '')
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p
}

export default function FinanceReceipts() {
  const { currentChurch } = useAuth()
  const { canEdit } = useFinanceAccess('conciliacao')
  const { toast } = useToast()
  const churchId = currentChurch?.id
  const { lookups } = useFinanceLookups(churchId)

  const [status, setStatus] = useState<FinReceiptsStatus | null>(null)
  const [tab, setTab] = useState<Tab>('conferir')
  const [items, setItems] = useState<FinReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [senders, setSenders] = useState<FinReceiptSender[]>([])

  const load = useCallback(
    async (quiet = false) => {
      if (!churchId) return
      if (!quiet) setLoading(true)
      try {
        const [st, list, ss] = await Promise.all([
          receiptsStatus(churchId),
          listReceipts(churchId, tab),
          listReceiptSenders(churchId),
        ])
        setStatus(st)
        setItems(list.items)
        setSenders(ss)
      } catch (err) {
        if (!quiet) {
          toast({
            title: 'Erro ao carregar os comprovantes',
            description: serverMessage(err, 'Tente de novo em instantes.'),
            variant: 'destructive',
          })
        }
      } finally {
        setLoading(false)
      }
    },
    [churchId, tab, toast],
  )

  useEffect(() => {
    load()
  }, [load])

  // Enquanto a IA lê ou o servidor concilia, atualiza sozinho
  const busy = items.some((r) => BUSY.includes(r.status))
  useEffect(() => {
    if (!busy) return
    const t = window.setInterval(() => load(true), 5000)
    return () => window.clearInterval(t)
  }, [busy, load])

  const expenseCategories = useMemo(() => {
    const byId = new Map(lookups.categories.map((c) => [c.id, c]))
    return lookups.categories
      .filter((c) => c.direction === 'SAIDA' && c.is_active)
      .map((c) => {
        const parent = c.parent_id ? byId.get(c.parent_id) : undefined
        return { id: c.id, name: parent ? `${parent.name} › ${c.name}` : c.name }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [lookups.categories])

  const pending = status?.counts.ANALISE || 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Comprovantes"
        subtitle="Quem paga contas da igreja manda o comprovante para o WhatsApp da igreja. A IA lê, acha o movimento no extrato, abre a conta a pagar e concilia."
      />
      {!canEdit && <ReadOnlyNotice />}
      {status && <SetupNotes status={status} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.id || 'todos'}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600',
                )}
              >
                {t.label}
                {t.id === 'conferir' && pending > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">
                    {pending}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className={cn(cardClass, 'p-8 text-center text-sm text-slate-500')}>
              {tab === 'conferir'
                ? 'Nada para conferir. Os comprovantes que a IA não conseguir ligar sozinha aparecem aqui.'
                : 'Nenhum comprovante por aqui ainda.'}
            </div>
          ) : (
            items.map((r) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                churchId={churchId || ''}
                canEdit={canEdit}
                categories={expenseCategories}
                onChanged={() => load(true)}
              />
            ))
          )}
        </div>

        <SendersCard
          churchId={churchId || ''}
          senders={senders}
          canEdit={canEdit}
          onChanged={() => load(true)}
        />
      </div>
    </div>
  )
}

function SetupNotes({ status }: { status: FinReceiptsStatus }) {
  const notes: ReactNode[] = []
  if (!status.ai) {
    notes.push(
      'A leitura por IA ainda não está ligada: falta cadastrar o segredo ANTHROPIC_API_KEY no servidor (no Skip, em Segredos). Os comprovantes ficam guardados e são lidos quando a chave entrar.',
    )
  }
  if (status.whatsapp === 'SEM_SERVIDOR') {
    notes.push('O servidor do WhatsApp ainda não foi configurado.')
  } else if (status.whatsapp === 'DESCONECTADO') {
    notes.push(
      <>
        O WhatsApp da igreja está desconectado. Conecte em{' '}
        <Link to="/configuracoes/whatsapp" className="font-medium underline">
          Configurações › WhatsApp
        </Link>
        .
      </>,
    )
  }
  if (status.webhook_error) {
    notes.push(
      `Não deu para ligar o recebimento de mensagens no servidor do WhatsApp (${status.webhook_error}). Abra esta tela de novo daqui a pouco.`,
    )
  }
  if (notes.length === 0) return null
  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {notes.map((n, i) => (
        <div key={i} className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{n}</div>
        </div>
      ))}
    </div>
  )
}

function Thumb({ receipt }: { receipt: FinReceipt }) {
  const [url, setUrl] = useState('')
  const isPdf = receipt.mime === 'application/pdf'
  useEffect(() => {
    if (!receipt.has_file || isPdf) return
    let gone = false
    let made = ''
    receiptFileUrl(receipt.id)
      .then((u) => {
        made = u
        if (!gone) setUrl(u)
      })
      .catch(() => {})
    return () => {
      gone = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [receipt.id, receipt.has_file, isPdf])

  const open = async () => {
    try {
      const u = url || (await receiptFileUrl(receipt.id))
      window.open(u, '_blank', 'noopener')
    } catch {
      /* sem arquivo */
    }
  }
  if (!receipt.has_file) {
    return <div className="h-24 w-20 shrink-0 rounded-lg bg-slate-100" />
  }
  return (
    <button
      type="button"
      onClick={open}
      title="Abrir o comprovante"
      className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
    >
      {isPdf ? (
        <FileText className="h-8 w-8 text-slate-400" />
      ) : url ? (
        <img src={url} alt="Comprovante" className="h-full w-full object-cover" />
      ) : (
        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
      )}
    </button>
  )
}

function LineRow({ line }: { line: FinReceiptLine }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <div className="truncate text-slate-800">{line.description || 'Movimento'}</div>
        <div className="text-xs text-slate-500">
          {shortDate(line.date, true)}
          {line.account_name && ` · ${line.account_name}`}
        </div>
      </div>
      <div className="shrink-0 font-medium text-rose-700 tabular-nums">
        {formatCents(line.amount_cents)}
      </div>
    </div>
  )
}

function ReceiptCard({
  receipt: r,
  churchId,
  canEdit,
  categories,
  onChanged,
}: {
  receipt: FinReceipt
  churchId: string
  canEdit: boolean
  categories: { id: string; name: string }[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const d = r.data
  const st = STATUS[r.status]
  const [lineId, setLineId] = useState(
    r.line?.id || (r.candidates.length === 1 ? r.candidates[0].id : ''),
  )
  const [categoryId, setCategoryId] = useState(d?.category_id || '')
  const [working, setWorking] = useState('')

  const run = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setWorking(what)
    try {
      await fn()
      toast({ title: done })
      onChanged()
    } catch (err) {
      toast({
        title: 'Não deu certo',
        description: serverMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setWorking('')
    }
  }

  const choices = r.candidates.length ? r.candidates : r.line ? [r.line] : []
  const StatusIcon =
    r.status === 'CONCILIADO'
      ? CheckCircle2
      : r.status === 'DESCARTADO'
        ? XCircle
        : r.status === 'ANALISE'
          ? AlertTriangle
          : BUSY.includes(r.status)
            ? Loader2
            : Clock

  return (
    <div className={cn(cardClass, 'p-4')}>
      <div className="flex gap-4">
        <Thumb receipt={r} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-900 tabular-nums">
                {d?.amount_cents ? formatCents(d.amount_cents) : 'Valor não lido'}
              </div>
              <div className="truncate text-sm text-slate-700">
                {[d?.payee_name, d?.description].filter(Boolean).join(' · ') || 'Comprovante'}
              </div>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                st.className,
              )}
            >
              <StatusIcon
                className={cn('h-3.5 w-3.5', BUSY.includes(r.status) && 'animate-spin')}
              />
              {st.label}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {[
              d?.date && `Pago em ${shortDate(d.date, true)}`,
              d?.method && d.method !== 'OUTRO' && PAYMENT_METHOD_LABELS[d.method],
              `Mandado por ${r.sender_name || phoneLabel(r.sender_phone)} em ${shortDate(
                r.created.slice(0, 10),
              )}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {r.caption && <div className="text-xs text-slate-500 italic">“{r.caption}”</div>}
          {r.reason && r.status !== 'CONCILIADO' && (
            <div className="text-sm text-slate-600">{r.reason}</div>
          )}
          {r.status === 'CONCILIADO' && r.line && (
            <div className="mt-2 rounded-lg bg-emerald-50/60 px-3 py-2">
              <LineRow line={r.line} />
              <div className="mt-1 text-xs text-emerald-800">
                Lançado e conciliado
                {r.done_by_name ? ` por ${r.done_by_name}` : ' sozinho'}.{' '}
                <Link to="/financeiro/contas" className="underline">
                  Ver em contas a pagar
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {canEdit && (r.status === 'ANALISE' || r.status === 'AGUARDANDO') && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {choices.length > 0 ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Qual movimento do extrato é este?</Label>
              {choices.map((l) => (
                <label
                  key={l.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2',
                    lineId === l.id ? 'border-teal-600 bg-teal-50/40' : 'border-slate-200',
                  )}
                >
                  <input
                    type="radio"
                    name={`line-${r.id}`}
                    checked={lineId === l.id}
                    onChange={() => setLineId(l.id)}
                    className="accent-teal-700"
                  />
                  <LineRow line={l} />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Nenhum movimento de saída com este valor apareceu no extrato. Quando aparecer, o
              LouvorFlow liga sozinho; se o valor lido estiver errado, descarte e lance pela
              conciliação.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            {choices.length > 0 && (
              <div className="min-w-56 flex-1 space-y-1.5">
                <Label className="text-xs text-slate-500">Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-10">
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
            )}
            {choices.length > 0 && (
              <Button
                className={primaryButtonClass}
                disabled={!lineId || !categoryId || !!working}
                onClick={() =>
                  run(
                    'choose',
                    () => chooseReceiptLine(churchId, r.id, lineId, categoryId),
                    'Conciliando o comprovante',
                  )
                }
              >
                {working === 'choose' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Lançar e conciliar
              </Button>
            )}
            {r.can_retry && (
              <Button
                variant="outline"
                className="h-10 gap-2"
                disabled={!!working}
                onClick={() =>
                  run('retry', () => retryReceipt(churchId, r.id), 'A IA vai ler de novo')
                }
              >
                <RotateCcw className="h-4 w-4" />
                Ler de novo
              </Button>
            )}
            <Button
              variant="ghost"
              className="h-10 gap-2 text-slate-500"
              disabled={!!working}
              onClick={() =>
                run('discard', () => discardReceipt(churchId, r.id), 'Comprovante descartado')
              }
            >
              <Trash2 className="h-4 w-4" />
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SendersCard({
  churchId,
  senders,
  canEdit,
  onChanged,
}: {
  churchId: string
  senders: FinReceiptSender[]
  canEdit: boolean
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn()
      if (done) toast({ title: done })
      onChanged()
      return true
    } catch (err) {
      toast({
        title: 'Não deu certo',
        description: serverMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      })
      return false
    }
  }

  const add = async () => {
    setSaving(true)
    const ok = await act(() => saveReceiptSender(churchId, { name, phone }), 'Número cadastrado')
    setSaving(false)
    if (ok) {
      setName('')
      setPhone('')
    }
  }

  return (
    <div className={cn(cardClass, 'h-fit space-y-4 p-4')}>
      <div>
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <MessageCircle className="h-4 w-4 text-teal-700" />
          Quem pode mandar
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Só comprovantes destes celulares são lidos. Mensagens de outros números são ignoradas.
        </p>
      </div>
      <div className="space-y-2">
        {senders.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum número cadastrado ainda.</p>
        )}
        {senders.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className={cn('truncate text-sm font-medium', !s.is_active && 'text-slate-400')}>
                {s.name}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Phone className="h-3 w-3" />
                {phoneLabel(s.phone)}
              </div>
            </div>
            {canEdit && (
              <>
                <Switch
                  checked={s.is_active}
                  aria-label="Pode mandar"
                  onCheckedChange={(v) =>
                    act(() =>
                      saveReceiptSender(churchId, {
                        id: s.id,
                        name: s.name,
                        phone: s.phone,
                        is_active: v,
                      }),
                    )
                  }
                />
                <button
                  type="button"
                  title="Remover"
                  className="text-slate-400 hover:text-rose-600"
                  onClick={() => act(() => deleteReceiptSender(churchId, s.id), 'Número removido')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="Celular com DDD"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button
            className={cn(primaryButtonClass, 'w-full')}
            disabled={!name.trim() || phone.replace(/\D/g, '').length < 10 || saving}
            onClick={add}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar número
          </Button>
        </div>
      )}
    </div>
  )
}
