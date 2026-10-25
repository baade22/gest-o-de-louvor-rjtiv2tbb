// Campanhas: arrecadações com meta e prazo (reforma, missões, congresso).
// A entrada conta para a campanha quando ela é escolhida no lançamento, na baixa da conta
// ou na conciliação.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Flag,
  Globe,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { centsToInput, formatCents, parseMoneyToCents } from '@/lib/money'
import { brtDay } from '@/lib/bankStatement'
import { campaignProgress, type CampaignProgress } from '@/lib/campaigns'
import { centsToText, toCsv } from '@/lib/financeReports'
import {
  getFinSettings,
  listCampaignTransactions,
  saveCampaign,
  setCampaignStatus,
  type CampaignInput,
} from '@/services/finance'
import type { FinCampaign, FinCampaignColor, FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { useFinanceLookups } from './useFinanceLookups'
import { download } from './print'
import { PixQr } from './PixQr'
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

const today = () => brtDay(new Date().toISOString())
const WHOLE_CHURCH = '__all__'

const COLORS: Record<
  FinCampaignColor,
  { header: string; bar: string; swatch: string; label: string }
> = {
  TEAL: {
    header: 'from-teal-700 to-teal-500',
    bar: 'bg-teal-600',
    swatch: 'bg-teal-600',
    label: 'Verde',
  },
  INDIGO: {
    header: 'from-indigo-600 to-violet-500',
    bar: 'bg-indigo-600',
    swatch: 'bg-indigo-600',
    label: 'Azul',
  },
  ORANGE: {
    header: 'from-orange-700 to-orange-500',
    bar: 'bg-orange-600',
    swatch: 'bg-orange-600',
    label: 'Laranja',
  },
  ROSE: {
    header: 'from-rose-700 to-rose-500',
    bar: 'bg-rose-600',
    swatch: 'bg-rose-600',
    label: 'Rosa',
  },
  SKY: { header: 'from-sky-700 to-sky-500', bar: 'bg-sky-600', swatch: 'bg-sky-600', label: 'Céu' },
  AMBER: {
    header: 'from-amber-700 to-amber-500',
    bar: 'bg-amber-500',
    swatch: 'bg-amber-500',
    label: 'Âmbar',
  },
}
const colorOf = (c: FinCampaign) => COLORS[(c.color || 'TEAL') as FinCampaignColor] || COLORS.TEAL

function deadline(c: FinCampaign, p: CampaignProgress) {
  if (p.daysLeft === null) return null
  if (c.status === 'ATIVA' && p.daysLeft >= 0 && p.daysLeft <= 30) {
    return {
      text:
        p.daysLeft === 0
          ? 'termina hoje'
          : `faltam ${p.daysLeft} ${p.daysLeft === 1 ? 'dia' : 'dias'}`,
      urgent: true,
    }
  }
  if (p.daysLeft < 0) return { text: `terminou ${shortDate(c.end_date!)}`, urgent: false }
  return { text: `até ${shortDate(c.end_date!)}`, urgent: false }
}

function CampaignCard({
  campaign,
  progress,
  selected,
  onSelect,
}: {
  campaign: FinCampaign
  progress: CampaignProgress
  selected: boolean
  onSelect: () => void
}) {
  const color = colorOf(campaign)
  const due = deadline(campaign, progress)
  const people = progress.participants
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        cardClass,
        'overflow-hidden text-left transition hover:shadow-md',
        selected && 'ring-2 ring-teal-600 ring-offset-2',
      )}
    >
      <div className={cn('flex h-20 items-end bg-gradient-to-r px-4 pb-3', color.header)}>
        <h3 className="truncate text-base font-bold text-white">{campaign.name}</h3>
      </div>
      <div className="space-y-3 p-4">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xl font-bold tabular-nums text-slate-900">
            {formatCents(progress.raised)}
          </span>
          {!!campaign.goal_cents && (
            <span className="text-sm text-slate-500">de {formatCents(campaign.goal_cents)}</span>
          )}
        </p>
        {progress.pct !== null && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full', color.bar)}
              style={{ width: `${Math.min(100, progress.pct)}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">
            {[
              progress.pct !== null && `${Math.floor(progress.pct)}%`,
              `${people} ${people === 1 ? 'participante' : 'participantes'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {due && (
            <span
              className={cn(
                'shrink-0 text-xs',
                due.urgent
                  ? 'rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700'
                  : 'text-slate-500',
              )}
            >
              {due.text}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
            {campaign.congregation || 'Igreja toda'}
          </span>
          {campaign.is_public && campaign.status === 'ATIVA' && (
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
              Doação on-line
            </span>
          )}
          {progress.spent > 0 && (
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
              Gasto {formatCents(progress.spent)}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

const emptyForm = () => ({
  name: '',
  description: '',
  goal: '',
  start_date: today(),
  end_date: '',
  congregation: '',
  color: 'TEAL' as FinCampaignColor,
  is_public: false,
})

function CampaignDialog({
  open,
  onOpenChange,
  editing,
  congregations,
  churchId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: FinCampaign | null
  congregations: string[]
  churchId: string
  onSaved: (c: FinCampaign) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? {
            name: editing.name,
            description: editing.description || '',
            goal: editing.goal_cents ? centsToInput(editing.goal_cents) : '',
            start_date: (editing.start_date || '').slice(0, 10),
            end_date: (editing.end_date || '').slice(0, 10),
            congregation: editing.congregation || '',
            color: (editing.color || 'TEAL') as FinCampaignColor,
            is_public: !!editing.is_public,
          }
        : emptyForm(),
    )
  }, [open, editing])

  const set = (patch: Partial<ReturnType<typeof emptyForm>>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      toast({ title: 'Dê um nome à campanha', variant: 'destructive' })
      return
    }
    const goal = form.goal.trim() ? parseMoneyToCents(form.goal) : 0
    if (goal === null || goal < 0) {
      toast({ title: 'Confira o valor da meta', variant: 'destructive' })
      return
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      toast({ title: 'O término vem antes do início', variant: 'destructive' })
      return
    }
    const input: CampaignInput = {
      name,
      description: form.description.trim(),
      goal_cents: goal,
      start_date: form.start_date,
      end_date: form.end_date,
      congregation: form.congregation,
      color: form.color,
      status: editing?.status || 'ATIVA',
      is_public: form.is_public,
    }
    setSaving(true)
    try {
      const saved = await saveCampaign(churchId, editing?.id || null, input)
      toast({ title: editing ? 'Campanha atualizada' : 'Campanha criada' })
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const label = 'text-xs font-semibold text-slate-600'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar campanha' : 'Nova campanha'}</DialogTitle>
          <DialogDescription>
            Depois, escolha a campanha ao lançar a entrada, dar baixa na conta ou conciliar o
            extrato.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp-name" className={label}>
              Nome
            </Label>
            <Input
              id="cp-name"
              maxLength={120}
              value={form.name}
              placeholder="Ex.: Reforma do templo"
              onChange={(e) => set({ name: e.target.value })}
              className="h-10 rounded-lg"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp-goal" className={label}>
                Meta (R$, opcional)
              </Label>
              <Input
                id="cp-goal"
                inputMode="decimal"
                placeholder="0,00"
                value={form.goal}
                onChange={(e) => set({ goal: e.target.value })}
                className="h-10 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className={label}>Congregação</Label>
              <Select
                value={form.congregation || WHOLE_CHURCH}
                onValueChange={(v) => set({ congregation: v === WHOLE_CHURCH ? '' : v })}
              >
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_CHURCH}>Igreja toda</SelectItem>
                  {congregations.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-start" className={label}>
                Início
              </Label>
              <Input
                id="cp-start"
                type="date"
                value={form.start_date}
                onChange={(e) => set({ start_date: e.target.value })}
                className="h-10 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-end" className={label}>
                Término (opcional)
              </Label>
              <Input
                id="cp-end"
                type="date"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={(e) => set({ end_date: e.target.value })}
                className="h-10 rounded-lg"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <span className={label}>Cor</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Cor">
              {(Object.keys(COLORS) as FinCampaignColor[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={form.color === key}
                  aria-label={COLORS[key].label}
                  onClick={() => set({ color: key })}
                  className={cn(
                    'h-8 w-8 rounded-full',
                    COLORS[key].swatch,
                    form.color === key && 'ring-2 ring-slate-900 ring-offset-2',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-desc" className={label}>
              Descrição (opcional)
            </Label>
            <Textarea
              id="cp-desc"
              rows={2}
              maxLength={500}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
            <Switch
              checked={form.is_public}
              onCheckedChange={(v) => set({ is_public: v })}
              aria-label="Página de doação"
            />
            <span className="text-sm">
              <span className="block font-medium text-slate-900">Página de doação por PIX</span>
              <span className="text-slate-500">
                Um link aberto, sem login, com a meta, quanto já entrou e o QR do PIX da igreja.
                Nomes e valores de quem doou não aparecem.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className={cn(primaryButtonClass, 'h-9')}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Endereço da página pública, com ou sem "#" (o link de teste usa rotas com #). */
export function publicLink(path: string) {
  const { origin, pathname, hash } = window.location
  return hash.startsWith('#/') ? `${origin}${pathname}#${path}` : `${origin}${path}`
}

function ShareDialog({
  campaign,
  churchId,
  open,
  onOpenChange,
}: {
  campaign: FinCampaign
  churchId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const [hasPix, setHasPix] = useState<boolean | null>(null)
  const link = publicLink(`/doar/${campaign.id}`)
  const message = `Contribua com a campanha ${campaign.name}: ${link}`

  useEffect(() => {
    if (!open) return
    setHasPix(null)
    getFinSettings(churchId)
      .then((s) => setHasPix(!!s?.pix_key))
      .catch(() => setHasPix(false))
  }, [open, churchId])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Link copiado' })
    } catch {
      toast({ title: 'Não deu para copiar', description: link, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Doação por PIX</DialogTitle>
          <DialogDescription>
            Mande o link nos grupos ou mostre o QR no telão. Quem abrir vê a meta e o PIX da igreja.
          </DialogDescription>
        </DialogHeader>
        {hasPix === false && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            A igreja ainda não tem chave PIX cadastrada: a página abre, mas sem o QR.{' '}
            <Link to="/financeiro/cadastros?aba=igreja" className="font-semibold underline">
              Cadastrar a chave
            </Link>
          </p>
        )}
        <div className="flex flex-col items-center gap-3">
          <PixQr payload={link} label="QR do link da campanha" className="h-44 w-44" />
          <p className="w-full break-all rounded-lg bg-slate-50 px-3 py-2 text-center text-sm text-slate-700">
            {link}
          </p>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-center">
          <Button variant="outline" className="h-9" onClick={copy}>
            <Copy className="h-4 w-4" /> Copiar link
          </Button>
          <Button variant="outline" className="h-9" asChild>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </Button>
          <Button variant="outline" className="h-9" asChild>
            <a href={link} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function FinanceCampaigns() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id
  const { canEdit } = useFinanceAccess()
  const { toast } = useToast()
  const { lookups, loading: loadingLookups, reload } = useFinanceLookups(churchId)
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [loadingTxs, setLoadingTxs] = useState(true)
  const [tab, setTab] = useState<'ATIVA' | 'ENCERRADA'>('ATIVA')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FinCampaign | null>(null)
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)

  const loadTxs = useCallback(async () => {
    if (!churchId) return
    try {
      setTxs(await listCampaignTransactions(churchId))
    } catch (err) {
      toast({
        title: 'Não foi possível carregar as entradas',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setLoadingTxs(false)
    }
  }, [churchId, toast])

  useEffect(() => {
    loadTxs()
  }, [loadTxs])

  const campaigns = useMemo(() => lookups.campaigns || [], [lookups.campaigns])
  const day = today()
  const progress = useMemo(
    () => new Map(campaigns.map((c) => [c.id, campaignProgress(c, txs, day)])),
    [campaigns, txs, day],
  )
  const shown = campaigns.filter((c) => c.status === tab)
  const selected = campaigns.find((c) => c.id === selectedId) || shown[0] || null
  const congregations = useMemo(
    () => [...new Set(lookups.accounts.map((a) => a.congregation || '').filter(Boolean))].sort(),
    [lookups.accounts],
  )
  const people = useMemo(() => new Map(lookups.people.map((p) => [p.id, p.name])), [lookups.people])
  const accounts = useMemo(
    () => new Map(lookups.accounts.map((a) => [a.id, a.name])),
    [lookups.accounts],
  )
  const categories = useMemo(
    () => new Map(lookups.categories.map((c) => [c.id, c.name])),
    [lookups.categories],
  )

  const rows = useMemo(
    () => (selected ? txs.filter((t) => t.campaign_id === selected.id) : []),
    [txs, selected],
  )
  const who = (t: FinTransaction) =>
    t.type !== 'ENTRADA'
      ? t.description || categories.get(t.category_id || '') || 'Saída'
      : t.is_anonymous || !t.person_id
        ? 'Anônimo'
        : people.get(t.person_id) || 'Pessoa'
  const origin = (t: FinTransaction) => {
    if (t.count_id) return 'Contagem do culto'
    if (t.bill_id) return t.type === 'SAIDA' ? 'Conta a pagar' : 'Conta a receber'
    const name = accounts.get(t.account_id) || 'Conta'
    return t.bank_line_id ? `${name} (conciliado)` : name
  }

  const toggleStatus = async (c: FinCampaign) => {
    setBusy(true)
    try {
      await setCampaignStatus(c.id, c.status === 'ATIVA' ? 'ENCERRADA' : 'ATIVA')
      toast({ title: c.status === 'ATIVA' ? 'Campanha encerrada' : 'Campanha reaberta' })
      await reload()
      setTab(c.status === 'ATIVA' ? 'ENCERRADA' : 'ATIVA')
      setSelectedId(c.id)
    } catch (err) {
      toast({
        title: 'Não foi possível mudar a campanha',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    if (!selected) return
    download(
      `campanha-${selected.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.csv`,
      toCsv([
        ['Data', 'Tipo', 'Contribuinte ou descrição', 'Categoria', 'Forma', 'Origem', 'Valor'],
        ...rows
          .filter((t) => t.status !== 'ESTORNADO')
          .map((t) => [
            shortDate(t.date, true),
            t.type === 'ENTRADA' ? 'Entrada' : 'Saída',
            who(t),
            categories.get(t.category_id || '') || '',
            t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method] : '',
            origin(t),
            centsToText(t.type === 'ENTRADA' ? t.amount_cents : -t.amount_cents),
          ]),
      ]),
    )
  }

  if (!churchId) return null
  const loading = loadingLookups || loadingTxs
  const p = selected ? progress.get(selected.id)! : null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Campanhas"
        subtitle="Arrecadações com meta e prazo: reforma, missões, congressos."
      >
        <div className="flex rounded-lg bg-slate-100 p-1">
          {(['ATIVA', 'ENCERRADA'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTab(s)
                setSelectedId(null)
              }}
              aria-pressed={tab === s}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-semibold',
                tab === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500',
              )}
            >
              {s === 'ATIVA' ? 'Ativas' : 'Encerradas'}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button
            className={primaryButtonClass}
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Nova campanha
          </Button>
        )}
      </PageHeader>
      {!canEdit && <ReadOnlyNotice />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : shown.length === 0 ? (
        <div className={cn(cardClass, 'flex flex-col items-center gap-2 px-6 py-12 text-center')}>
          <Flag className="h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-700">
            {tab === 'ATIVA' ? 'Nenhuma campanha ativa' : 'Nenhuma campanha encerrada'}
          </p>
          {tab === 'ATIVA' && (
            <p className="max-w-md text-sm text-slate-500">
              Crie uma campanha com meta e prazo. As entradas contam para ela quando você escolhe a
              campanha no lançamento, na baixa da conta ou na conciliação.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              progress={progress.get(c.id)!}
              selected={selected?.id === c.id}
              onSelect={() => setSelectedId(c.id)}
            />
          ))}
        </div>
      )}

      {!loading && selected && p && selected.status === tab && (
        <section className={cn(cardClass, 'overflow-hidden')}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{selected.name}</h2>
              <p className="text-xs text-slate-500">
                {selected.description ||
                  [
                    selected.start_date && `Desde ${shortDate(selected.start_date, true)}`,
                    selected.end_date && `até ${shortDate(selected.end_date, true)}`,
                  ]
                    .filter(Boolean)
                    .join(' ')}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {selected.is_public && selected.status === 'ATIVA' && (
                <Button variant="outline" size="sm" onClick={() => setSharing(true)}>
                  <Globe className="mr-1.5 h-4 w-4" />
                  Link de doação
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={!rows.length} onClick={exportCsv}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                Planilha
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(selected)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => toggleStatus(selected)}
                  >
                    {selected.status === 'ATIVA' ? (
                      <Archive className="mr-1.5 h-4 w-4" />
                    ) : (
                      <ArchiveRestore className="mr-1.5 h-4 w-4" />
                    )}
                    {selected.status === 'ATIVA' ? 'Encerrar' : 'Reabrir'}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 sm:grid-cols-4">
            {[
              ['Arrecadado', formatCents(p.raised)],
              ['Gasto', formatCents(p.spent)],
              ['Saldo da campanha', formatCents(p.balance)],
              [
                'Contribuições',
                `${p.entries}${p.anonymousCount ? ` (${p.anonymousCount} anônimas)` : ''}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="font-semibold tabular-nums text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Nenhum lançamento nesta campanha ainda. Escolha a campanha ao lançar a entrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-semibold">Data</th>
                    <th className="px-4 py-2 font-semibold">Contribuinte</th>
                    <th className="px-4 py-2 font-semibold">Forma</th>
                    <th className="px-4 py-2 font-semibold">Origem</th>
                    <th className="px-4 py-2 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const voided = t.status === 'ESTORNADO'
                    const out = t.type !== 'ENTRADA'
                    return (
                      <tr
                        key={t.id}
                        className={cn('border-b border-slate-100', voided && 'text-slate-400')}
                      >
                        <td className="px-4 py-2.5 tabular-nums">{shortDate(t.date)}</td>
                        <td className="px-4 py-2.5">
                          {who(t)}
                          {voided && (
                            <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold">
                              Estornado
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method] : '—'}
                        </td>
                        <td className="px-4 py-2.5">{origin(t)}</td>
                        <td
                          className={cn(
                            'px-4 py-2.5 text-right font-semibold tabular-nums',
                            voided ? 'line-through' : out ? 'text-rose-700' : 'text-emerald-700',
                          )}
                        >
                          {out ? '−' : ''}
                          {formatCents(t.amount_cents)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selected && (
        <ShareDialog
          campaign={selected}
          churchId={churchId}
          open={sharing}
          onOpenChange={setSharing}
        />
      )}
      <CampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        congregations={congregations}
        churchId={churchId}
        onSaved={async (c) => {
          await reload()
          setTab(c.status)
          setSelectedId(c.id)
        }}
      />
    </div>
  )
}
