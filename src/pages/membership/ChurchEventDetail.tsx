import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  createRegistration,
  deleteChurchEvent,
  deleteRegistration,
  eventSignupUrl,
  getChurchEvent,
  getRegistration,
  listRegistrations,
  updateChurchEvent,
  updateRegistration,
} from '@/services/churchEvents'
import { listPeople } from '@/services/people'
import type { ChurchEvent, EventRegistration, PaymentMethod, Person } from '@/types'
import {
  PAYMENT_METHOD_LABELS,
  eventDateLabel,
  filterRegistrations,
  formatBRL,
  isFree,
  registrationDue,
  summarizeRegistrations,
  type RegistrationFilter,
} from '@/lib/churchEvents'
import { filterPeople } from '@/lib/membership'
import { fillMessage, messageVarsFor, richToWhatsApp, whatsappUrl } from '@/lib/eventPage'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Landmark,
  Link2,
  Lock,
  LockOpen,
  MapPin,
  MessageCircle,
  HandHelping,
  Megaphone,
  Printer,
  Search,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { QrCodeImage, downloadQrPng } from '@/components/QrCodeImage'
import { StatusBadge, errorMessage } from './shared'
import { EventPrintTab } from './EventPrintSheets'

const PAY_METHODS: PaymentMethod[] = ['PIX', 'DINHEIRO', 'CARTAO', 'ISENTO', 'OUTRO']

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
      <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="text-2xl font-extrabold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function chip(active: boolean) {
  return `h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${
    active
      ? 'bg-teal-50 border-teal-300 text-teal-800'
      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
  }`
}

export default function ChurchEventDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const { currentChurch, isMaster, hasOperationalRole } = useAuth()
  // Quem tem só a função EVENTOS não vê as fichas da membresia
  const canSeePeople = isMaster || hasOperationalRole('MEMBRESIA')
  const { toast } = useToast()
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [event, setEvent] = useState<ChurchEvent | null>(null)
  const [regs, setRegs] = useState<EventRegistration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RegistrationFilter>('TODOS')
  const [checkinSearch, setCheckinSearch] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [peopleSearch, setPeopleSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newPartner, setNewPartner] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [e, r] = await Promise.all([getChurchEvent(id), listRegistrations(id)])
      setEvent(e)
      setRegs(r)
    } catch (err) {
      toast({
        title: 'Erro',
        description: errorMessage(err, 'Evento não encontrado.'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!addOpen || !currentChurch || people.length || !canSeePeople) return
    listPeople(currentChurch.id)
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [addOpen, currentChurch, people.length, canSeePeople])

  const summary = useMemo(() => (event ? summarizeRegistrations(event, regs) : null), [event, regs])
  const shown = useMemo(() => filterRegistrations(regs, search, filter), [regs, search, filter])
  const checkinList = useMemo(() => filterRegistrations(regs, checkinSearch), [regs, checkinSearch])
  const registeredPeople = useMemo(
    () => new Set(regs.map((r) => r.person_id).filter(Boolean)),
    [regs],
  )
  const peopleResults = useMemo(
    () =>
      peopleSearch.trim().length < 2
        ? []
        : filterPeople(people, { search: peopleSearch })
            .filter((p) => p.status !== 'FALECIDO')
            .slice(0, 8),
    [people, peopleSearch],
  )

  if (isLoading) return <p className="text-sm text-slate-500">Carregando...</p>
  if (!event || !summary) {
    return (
      <div className="space-y-3">
        <Link to="/membros/eventos" className="text-sm text-teal-700 hover:underline">
          Voltar para eventos
        </Link>
        <p className="text-slate-600">Evento não encontrado.</p>
      </div>
    )
  }

  const free = isFree(event)
  const url = eventSignupUrl(event.public_key)

  const patchReg = async (r: EventRegistration, data: Parameters<typeof updateRegistration>[1]) => {
    // Atualiza na tela primeiro: na portaria a lista precisa responder rápido
    setRegs((list) => list.map((x) => (x.id === r.id ? { ...x, ...data } : x)))
    try {
      await updateRegistration(r.id, data)
      // O servidor lança (ou estorna) no Financeiro depois de gravar: busca de novo
      if ('paid' in data) {
        const fresh = await getRegistration(r.id)
        setRegs((list) => list.map((x) => (x.id === r.id ? fresh : x)))
      }
    } catch (err) {
      setRegs((list) => list.map((x) => (x.id === r.id ? r : x)))
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    }
  }

  const markPaid = (r: EventRegistration, method: PaymentMethod) =>
    patchReg(r, {
      paid: true,
      payment_method: method,
      paid_amount: method === 'ISENTO' ? 0 : registrationDue(event, r),
    })

  const whatsappFor = (r: EventRegistration) => {
    const template =
      r.paid && r.payment_method !== 'ISENTO' ? event.payment_message : event.confirm_message
    const text = template
      ? richToWhatsApp(
          fillMessage(
            template,
            messageVarsFor(
              event,
              { name: r.name, amount: registrationDue(event, r) },
              eventDateLabel(event),
              currentChurch?.name || '',
            ),
          ),
        )
      : ''
    return whatsappUrl(r.phone || '', text)
  }

  const toggleClosed = async () => {
    try {
      setEvent(
        await updateChurchEvent(
          event.id,
          event.closed_at
            ? { closed_at: '' }
            : { closed_at: new Date().toISOString().replace('T', ' '), registration_open: false },
        ),
      )
      toast({ title: event.closed_at ? 'Evento reaberto' : 'Evento encerrado' })
    } catch (err) {
      toast({
        title: 'Erro',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    }
  }

  const addRegistration = async (data: Parameters<typeof createRegistration>[1]) => {
    setBusy(true)
    try {
      const created = await createRegistration(event, data)
      setRegs((list) => [...list, created])
      toast({ title: `${created.name} inscrito(a)` })
      setPeopleSearch('')
      setNewName('')
      setNewPhone('')
      setNewPartner('')
    } catch (err) {
      toast({
        title: 'Não foi possível inscrever',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const removeReg = (r: EventRegistration) =>
    confirm({
      title: `Cancelar a inscrição de ${r.name}?`,
      description:
        r.paid && !free
          ? 'Ela já estava paga. Lembre de combinar a devolução, se for o caso.'
          : 'A vaga fica livre de novo.',
      confirmLabel: 'Cancelar inscrição',
      destructive: true,
      onConfirm: async () => {
        await deleteRegistration(r.id)
        setRegs((list) => list.filter((x) => x.id !== r.id))
      },
    })

  const removeEvent = () =>
    confirm({
      title: `Apagar "${event.title}"?`,
      description: `O evento e as ${regs.length} inscrições são apagados. Isso não pode ser desfeito.`,
      confirmLabel: 'Apagar evento',
      destructive: true,
      onConfirm: async () => {
        await deleteChurchEvent(event.id)
        navigate('/membros/eventos')
      },
    })

  const toggleOpen = async (open: boolean) => {
    try {
      setEvent(await updateChurchEvent(event.id, { registration_open: open }))
    } catch (err) {
      toast({
        title: 'Erro',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copiado', description: 'Cole no grupo da igreja.' })
    } catch {
      toast({ title: 'Não deu para copiar', description: url })
    }
  }

  const tabs: Array<[string, string, LucideIcon, number]> = [
    ['inscritos', 'Inscritos', Users, regs.length],
    ['presenca', 'Lista de presença', ClipboardCheck, summary.attended],
    ['divulgar', 'Divulgar', Megaphone, 0],
    ['imprimir', 'Imprimir e planilha', Printer, 0],
  ]

  return (
    <div className="space-y-5">
      {confirmDialog}
      <Link
        to="/membros/eventos"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Eventos da igreja
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {event.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <span>{eventDateLabel(event)}</span>
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {event.location}
              </span>
            )}
            <span>
              {free
                ? 'Gratuito'
                : `${formatBRL(event.price!)} ${event.couple_only ? 'por casal' : 'por pessoa'}`}
            </span>
            {event.congregation && <span>{event.congregation}</span>}
            {event.closed_at && (
              <Badge variant="outline" className="text-[11px] bg-slate-100 text-slate-700">
                Encerrado
              </Badge>
            )}
          </p>
        </div>
        <div className="sm:ml-auto flex gap-2 shrink-0">
          <Button variant="outline" className="rounded-xl gap-1.5" onClick={toggleClosed}>
            {event.closed_at ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {event.closed_at ? 'Reabrir' : 'Encerrar'}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl gap-1.5"
            onClick={() => navigate(`/membros/eventos/${event.id}/editar`)}
          >
            <Edit className="h-4 w-4" />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-slate-400 hover:text-red-600"
            onClick={removeEvent}
            aria-label="Apagar evento"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={Users}
          label="Inscritos"
          value={String(summary.total)}
          sub={
            summary.spotsLeft !== null
              ? `${summary.spotsLeft} vagas livres de ${event.capacity}`
              : 'sem limite de vagas'
          }
        />
        {free ? (
          <Stat
            icon={Link2}
            label="Pelo link"
            value={String(regs.filter((r) => r.source === 'LINK').length)}
            sub="se inscreveram sozinhos"
          />
        ) : (
          <Stat
            icon={Check}
            label="Pagos"
            value={String(summary.paid)}
            sub={summary.pending ? `${summary.pending} ainda não pagaram` : 'todos pagaram'}
          />
        )}
        {free ? (
          <Stat icon={Wallet} label="Valor" value="Gratuito" />
        ) : (
          <Stat
            icon={Wallet}
            label="Recebido"
            value={formatBRL(summary.collected)}
            sub={summary.toCollect ? `falta ${formatBRL(summary.toCollect)}` : undefined}
          />
        )}
        <Stat
          icon={ClipboardCheck}
          label="Presentes"
          value={String(summary.attended)}
          sub={summary.total ? `de ${summary.total} inscritos` : undefined}
        />
      </div>

      <Tabs defaultValue="inscritos">
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-full min-w-max justify-start gap-1 rounded-none border-b border-slate-200 bg-transparent p-0">
            {tabs.map(([value, label, Icon, count]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-slate-500 data-[state=active]:border-teal-600 data-[state=active]:text-teal-800 data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
                {count > 0 && (
                  <span className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-1.5">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="inscritos" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-52">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar inscrito"
                className="pl-9 rounded-xl bg-white"
              />
            </div>
            {(free
              ? (['TODOS', 'PRESENTES', 'AUSENTES'] as RegistrationFilter[])
              : (['TODOS', 'PAGOS', 'PENDENTES', 'PRESENTES'] as RegistrationFilter[])
            ).map((f) => (
              <button
                key={f}
                type="button"
                className={chip(filter === f)}
                onClick={() => setFilter(f)}
              >
                {
                  {
                    TODOS: 'Todos',
                    PAGOS: 'Pagos',
                    PENDENTES: 'A pagar',
                    PRESENTES: 'Presentes',
                    AUSENTES: 'Ausentes',
                  }[f]
                }
              </button>
            ))}
            <Button
              className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800 ml-auto"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Inscrever
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
            {shown.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">
                {regs.length === 0
                  ? 'Ninguém inscrito ainda. Divulgue o link ou inscreva pela secretaria.'
                  : 'Ninguém com esse filtro.'}
              </p>
            )}
            {shown.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.person_id ? (
                      <Link
                        to={`/membros/${r.person_id}`}
                        className="text-sm font-semibold text-slate-900 hover:underline truncate"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {r.name}
                      </span>
                    )}
                    {r.partner_name && (
                      <span className="text-sm text-slate-600 truncate">e {r.partner_name}</span>
                    )}
                    {r.source === 'LINK' && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-sky-800 bg-sky-50 border-sky-200"
                      >
                        pelo link
                      </Badge>
                    )}
                    {r.attended && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Presente" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {[
                      r.phone,
                      r.coupon_code &&
                        `cupom ${r.coupon_code} (${r.amount_due ? formatBRL(r.amount_due) : 'sem custo'})`,
                      r.notes,
                      ...(event.questions || [])
                        .filter((q) => r.answers?.[q.id])
                        .map((q) => `${q.label}: ${r.answers![q.id]}`),
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'sem telefone'}
                  </p>
                  {!free && r.paid && r.payment_method !== 'ISENTO' && !event.skip_finance && (
                    <p
                      className={`text-[11px] flex items-center gap-1 ${
                        r.fin_transaction_id ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      <Landmark className="h-3 w-3" />
                      {r.fin_transaction_id
                        ? 'Lançado no Financeiro'
                        : r.fin_note || 'Ainda não lançado no Financeiro'}
                    </p>
                  )}
                </div>
                {!free &&
                  (r.paid ? (
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="text-[11px] bg-emerald-50 text-emerald-800 border-emerald-200"
                      >
                        {r.payment_method === 'ISENTO'
                          ? 'Isento'
                          : `Pago${r.payment_method ? ` · ${PAYMENT_METHOD_LABELS[r.payment_method]}` : ''}`}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400"
                        aria-label="Desfazer pagamento"
                        onClick={() =>
                          patchReg(r, { paid: false, payment_method: '', paid_amount: 0 })
                        }
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Select onValueChange={(v) => markPaid(r, v as PaymentMethod)}>
                      <SelectTrigger
                        className="h-8 w-32 rounded-lg text-xs border-amber-200 bg-amber-50 text-amber-900"
                        aria-label={`Marcar pagamento de ${r.name}`}
                      >
                        <SelectValue placeholder="A pagar" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAY_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m === 'ISENTO'
                              ? 'Isento (não paga)'
                              : `Pago no ${PAYMENT_METHOD_LABELS[m].toLowerCase()}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
                {r.phone && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                    aria-label={`Mandar mensagem no WhatsApp para ${r.name}`}
                    title={
                      r.paid && r.payment_method !== 'ISENTO'
                        ? 'WhatsApp com a mensagem de pagamento'
                        : 'WhatsApp com a mensagem de inscrição'
                    }
                    asChild
                  >
                    <a href={whatsappFor(r)} target="_blank" rel="noreferrer noopener">
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-slate-400 hover:text-red-600"
                  aria-label={`Cancelar inscrição de ${r.name}`}
                  onClick={() => removeReg(r)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="presenca" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-52">
              <Search className="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={checkinSearch}
                onChange={(e) => setCheckinSearch(e.target.value)}
                placeholder="Digite o nome de quem chegou"
                className="pl-10 h-12 rounded-xl bg-white text-base"
              />
            </div>
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{summary.attended}</strong> de {summary.total}{' '}
              presentes
            </p>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {checkinList.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  patchReg(r, {
                    attended: !r.attended,
                    attended_at: r.attended ? '' : new Date().toISOString().replace('T', ' '),
                    checked_out_at: '',
                  })
                }
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  r.attended
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-white border-slate-200 hover:border-teal-300'
                }`}
              >
                {r.attended ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-6 w-6 text-slate-300 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 truncate">
                    {r.name}
                  </span>
                  {!free && !r.paid && (
                    <span className="block text-xs text-amber-700">ainda não pagou</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          {checkinList.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">
              Ninguém com esse nome na lista.
            </p>
          )}
        </TabsContent>

        <TabsContent value="divulgar" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row gap-6">
            <div className="self-center sm:self-start">
              <QrCodeImage url={url} size={180} alt="QR code da inscrição" />
            </div>
            <div className="flex-1 min-w-0 space-y-4">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                <Switch checked={event.registration_open} onCheckedChange={toggleOpen} />
                {event.registration_open
                  ? 'Inscrições abertas pelo link'
                  : 'Inscrições fechadas (o link mostra que encerrou)'}
              </label>
              <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all text-slate-700">
                {url}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-lg gap-1.5" onClick={copy}>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg gap-1.5"
                  onClick={() => downloadQrPng(url, event.title)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar QR code
                </Button>
                <Button size="sm" variant="outline" className="rounded-lg gap-1.5" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver página de inscrição
                  </a>
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Quem se inscreve pelo link entra como "a pagar" (se o evento for pago) e, no fim, vê
                a mensagem de confirmação e o Pix com o valor certo. Para mudar capa, cor, textos e
                mensagens, use Editar.
              </p>
            </div>
          </div>
          {(event.staff || []).length > 0 && (
            <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <HandHelping className="h-4 w-4 text-teal-700" />
                Equipe de apoio
              </h3>
              <ul className="divide-y divide-slate-100">
                {(event.staff || []).map((m, i) => (
                  <li key={i} className="flex items-center gap-3 py-2 text-sm">
                    <span className="font-medium text-slate-900">{m.name}</span>
                    {m.task && <span className="text-slate-500">{m.task}</span>}
                    {m.phone && (
                      <a
                        href={whatsappUrl(m.phone)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ml-auto text-xs text-emerald-700 hover:underline"
                      >
                        WhatsApp
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="imprimir" className="mt-4">
          <EventPrintTab event={event} regs={regs} churchName={currentChurch?.name || ''} />
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inscrever no evento</DialogTitle>
            <DialogDescription>
              Procure a ficha da pessoa ou inscreva só com nome e telefone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {event.couple_only && (
              <div className="space-y-1.5">
                <Label htmlFor="reg-partner" className="text-xs font-semibold">
                  Cônjuge (evento para casais)
                </Label>
                <Input
                  id="reg-partner"
                  value={newPartner}
                  onChange={(e) => setNewPartner(e.target.value)}
                  placeholder="Nome do cônjuge"
                  className="rounded-xl"
                />
              </div>
            )}
            {canSeePeople && (
              <div className="space-y-1.5">
                <Label htmlFor="reg-search" className="text-xs font-semibold">
                  Buscar ficha
                </Label>
                <Input
                  id="reg-search"
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                  placeholder="Nome ou telefone"
                  className="rounded-xl"
                />
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {peopleResults.map((p) => {
                    const already = registeredPeople.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={already || busy}
                        onClick={() =>
                          addRegistration({
                            name: p.name,
                            person_id: p.id,
                            phone: p.phone || '',
                            email: p.email || '',
                            partner_name: newPartner.trim(),
                          })
                        }
                        className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-50 rounded-lg"
                      >
                        <span className="text-sm font-medium text-slate-900 flex-1 truncate">
                          {p.name}
                        </span>
                        <StatusBadge status={p.status} />
                        {already && <span className="text-xs text-slate-500">já inscrito</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Sem ficha (visitante, convidado)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome completo"
                  className="rounded-xl"
                  aria-label="Nome"
                />
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Telefone"
                  className="rounded-xl"
                  aria-label="Telefone"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Fechar
            </Button>
            <Button
              disabled={busy || newName.trim().length < 3}
              onClick={() =>
                addRegistration({
                  name: newName.trim(),
                  phone: newPhone.trim(),
                  partner_name: newPartner.trim(),
                })
              }
              className="bg-teal-700 hover:bg-teal-800"
            >
              Inscrever sem ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
