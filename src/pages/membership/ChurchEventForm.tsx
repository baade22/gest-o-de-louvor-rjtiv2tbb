import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  createChurchEvent,
  eventCoverUrl,
  getChurchEvent,
  lookupCep,
  setEventCover,
  updateChurchEvent,
  type ChurchEventPayload,
  type CoverField,
} from '@/services/churchEvents'
import { listAccounts } from '@/services/finance'
import { CONGREGATIONS } from '@/lib/membership'
import { toCalendarYMD } from '@/lib/dateUtils'
import {
  DEFAULT_CONFIRM_MESSAGE,
  DEFAULT_PAYMENT_MESSAGE,
  EVENT_COLORS,
  MESSAGE_FIELDS,
  eventColor,
  formatCep,
  QUESTION_KIND_LABELS,
  newQuestionId,
  normalizeCouponCode,
  parseViaCep,
} from '@/lib/eventPage'
import type { ChurchEvent, EventCoupon, EventQuestion, EventStaffMember } from '@/types'
import type { FinAccount } from '@/types/finance'
import {
  ArrowLeft,
  Bell,
  ClipboardList,
  HandHelping,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Monitor,
  Palette,
  Plus,
  Save,
  Search,
  Smartphone,
  Ticket,
  Trash2,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/components/RichText'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from './shared'

const NONE = '__none__'
const AUTO = '__auto__'
const inputClass = 'rounded-xl border-slate-200'

function Field({
  id,
  label,
  required,
  hint,
  children,
  className = '',
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Icon className="h-4 w-4 text-teal-700" />
          {title}
        </h2>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  hint?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium text-slate-800">{title}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  )
}

const EMPTY = {
  title: '',
  description: '',
  starts_on: '',
  ends_on: '',
  start_time: '',
  registration_deadline: '',
  location: '',
  congregation: NONE,
  contact_name: '',
  contact_phone: '',
  address_cep: '',
  address_street: '',
  address_number: '',
  address_complement: '',
  address_district: '',
  address_city: '',
  address_state: '',
  color: '',
  publish_only: false,
  hide_price: false,
  hide_header: false,
  couple_only: false,
  price: '',
  capacity: '',
  payment_info: '',
  registration_open: true,
  coupons: [] as Array<{ code: string; kind: EventCoupon['kind']; value: string; limit: string }>,
  skip_finance: false,
  fin_account_id: AUTO,
  confirm_message: DEFAULT_CONFIRM_MESSAGE,
  payment_message: DEFAULT_PAYMENT_MESSAGE,
  send_confirm_email: true,
  send_payment_email: true,
  questions: [] as Array<{
    id: string
    label: string
    kind: EventQuestion['kind']
    options: string
    required: boolean
  }>,
  staff: [] as Array<{ name: string; phone: string; task: string }>,
}

type FormState = typeof EMPTY

function fromEvent(e: ChurchEvent): FormState {
  return {
    title: e.title,
    description: e.description || '',
    starts_on: toCalendarYMD(e.starts_on),
    ends_on: toCalendarYMD(e.ends_on),
    start_time: e.start_time || '',
    registration_deadline: toCalendarYMD(e.registration_deadline),
    location: e.location || '',
    congregation: e.congregation || NONE,
    contact_name: e.contact_name || '',
    contact_phone: e.contact_phone || '',
    address_cep: e.address_cep || '',
    address_street: e.address_street || '',
    address_number: e.address_number || '',
    address_complement: e.address_complement || '',
    address_district: e.address_district || '',
    address_city: e.address_city || '',
    address_state: e.address_state || '',
    color: e.color || '',
    publish_only: !!e.publish_only,
    hide_price: !!e.hide_price,
    hide_header: !!e.hide_header,
    couple_only: !!e.couple_only,
    price: e.price ? String(e.price).replace('.', ',') : '',
    capacity: e.capacity ? String(e.capacity) : '',
    payment_info: e.payment_info || '',
    registration_open: e.registration_open,
    coupons: (e.coupons || []).map((c) => ({
      code: c.code,
      kind: c.kind,
      value: String(c.value).replace('.', ','),
      limit: c.limit ? String(c.limit) : '',
    })),
    skip_finance: !!e.skip_finance,
    fin_account_id: e.fin_account_id || AUTO,
    confirm_message: e.confirm_message || '',
    payment_message: e.payment_message || '',
    send_confirm_email: !!e.send_confirm_email,
    send_payment_email: !!e.send_payment_email,
    questions: (e.questions || []).map((q) => ({
      id: q.id,
      label: q.label,
      kind: q.kind,
      options: (q.options || []).join(', '),
      required: !!q.required,
    })),
    staff: (e.staff || []).map((m) => ({
      name: m.name,
      phone: m.phone || '',
      task: m.task || '',
    })),
  }
}

const money = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0

/** Capa escolhida: arquivo novo, "tirar" (null) ou sem mudança (undefined). */
type CoverChange = Partial<Record<CoverField, File | null>>

function CoverPicker({
  field,
  title,
  icon: Icon,
  ratio,
  tips,
  current,
  change,
  onChange,
}: {
  field: CoverField
  title: string
  icon: LucideIcon
  ratio: string
  tips: string[]
  current: string
  change: File | null | undefined
  onChange: (f: File | null) => void
}) {
  const preview = useMemo(
    () => (change ? URL.createObjectURL(change) : change === null ? '' : current),
    [change, current],
  )
  useEffect(
    () => () => {
      if (change) URL.revokeObjectURL(preview)
    },
    [change, preview],
  )
  const vertical = field === 'cover_side'
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="ml-auto font-normal text-slate-500">{ratio}</span>
      </p>
      <div
        className={`mx-auto overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center ${
          vertical ? 'aspect-[9/16] w-28' : 'aspect-video w-full'
        }`}
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400 flex flex-col items-center gap-1">
            <ImageIcon className="h-5 w-5" />
            Sem imagem
          </span>
        )}
      </div>
      <ul className="text-[11px] text-slate-500 space-y-0.5">
        {tips.map((t) => (
          <li key={t}>· {t}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="rounded-lg gap-1.5" asChild>
          <label className="cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            {preview ? 'Trocar' : 'Enviar imagem'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onChange(f)
                e.target.value = ''
              }}
            />
          </label>
        </Button>
        {preview && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-lg text-slate-500"
            onClick={() => onChange(null)}
          >
            Tirar
          </Button>
        )}
      </div>
    </div>
  )
}

export default function ChurchEventForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = !!id
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [event, setEvent] = useState<ChurchEvent | null>(null)
  const [covers, setCovers] = useState<CoverChange>({})
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [isLoading, setIsLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [cepBusy, setCepBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    getChurchEvent(id)
      .then((e) => {
        setEvent(e)
        setForm(fromEvent(e))
      })
      .catch((err) =>
        toast({
          title: 'Erro',
          description: errorMessage(err, 'Evento não encontrado.'),
          variant: 'destructive',
        }),
      )
      .finally(() => setIsLoading(false))
  }, [id, toast])

  // Só quem vê o Financeiro escolhe a conta; para os outros a lista vem vazia
  useEffect(() => {
    if (!currentChurch) return
    listAccounts(currentChurch.id)
      .then((list) => setAccounts(list.filter((a) => a.is_active)))
      .catch(() => setAccounts([]))
  }, [currentChurch])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const findCep = async () => {
    setCepBusy(true)
    try {
      const found = parseViaCep(await lookupCep(form.address_cep))
      if (!found) {
        toast({ title: 'CEP não encontrado', description: 'Confira os números.' })
        return
      }
      setForm((f) => ({ ...f, ...found }))
    } catch {
      toast({ title: 'Não deu para buscar o CEP', description: 'Preencha o endereço à mão.' })
    } finally {
      setCepBusy(false)
    }
  }

  const setCoupon = (i: number, patch: Partial<FormState['coupons'][number]>) =>
    set(
      'coupons',
      form.coupons.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    )

  const setQuestion = (i: number, patch: Partial<FormState['questions'][number]>) =>
    set(
      'questions',
      form.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)),
    )
  const setStaff = (i: number, patch: Partial<FormState['staff'][number]>) =>
    set(
      'staff',
      form.staff.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return
    const fail = (description: string) =>
      toast({ title: 'Confira os dados', description, variant: 'destructive' })
    if (!form.title.trim() || !form.starts_on) return fail('Informe o nome e a data do evento.')
    if (form.ends_on && form.ends_on < form.starts_on) return fail('O término vem antes do início.')
    const coupons: EventCoupon[] = form.coupons
      .map((c) => ({
        code: normalizeCouponCode(c.code),
        kind: c.kind,
        value: money(c.value),
        limit: Math.max(0, parseInt(c.limit, 10) || 0),
      }))
      .filter((c) => c.code || c.value)
    if (coupons.some((c) => !c.code || c.value <= 0))
      return fail('Cada cupom precisa de um código e de um desconto.')
    if (new Set(coupons.map((c) => c.code)).size !== coupons.length)
      return fail('Há dois cupons com o mesmo código.')
    if (coupons.some((c) => c.kind === 'PERCENT' && c.value > 100))
      return fail('Desconto em % vai até 100.')
    const questions: EventQuestion[] = form.questions
      .filter((q) => q.label.trim())
      .map((q) => ({
        id: q.id,
        label: q.label.trim().slice(0, 200),
        kind: q.kind,
        options:
          q.kind === 'CHOICE'
            ? q.options
                .split(/[,;\n]/)
                .map((o) => o.trim())
                .filter(Boolean)
                .slice(0, 30)
            : [],
        required: q.required,
      }))
    if (questions.some((q) => q.kind === 'CHOICE' && (q.options?.length || 0) < 2))
      return fail('Pergunta de escolher precisa de pelo menos duas opções, separadas por vírgula.')
    const staff: EventStaffMember[] = form.staff
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), phone: m.phone.trim(), task: m.task.trim() }))

    const price = money(form.price)
    const payload: ChurchEventPayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      starts_on: `${form.starts_on} 00:00:00.000Z`,
      ends_on: form.ends_on ? `${form.ends_on} 00:00:00.000Z` : '',
      start_time: form.start_time,
      registration_deadline: form.registration_deadline
        ? `${form.registration_deadline} 00:00:00.000Z`
        : '',
      location: form.location.trim(),
      congregation: form.congregation === NONE ? '' : form.congregation,
      contact_name: form.contact_name.trim(),
      contact_phone: form.contact_phone.trim(),
      address_cep: formatCep(form.address_cep),
      address_street: form.address_street.trim(),
      address_number: form.address_number.trim(),
      address_complement: form.address_complement.trim(),
      address_district: form.address_district.trim(),
      address_city: form.address_city.trim(),
      address_state: form.address_state.trim().toUpperCase().slice(0, 2),
      color: form.color,
      publish_only: form.publish_only,
      hide_price: form.hide_price,
      hide_header: form.hide_header,
      couple_only: form.couple_only,
      price: Math.max(0, Math.round(price * 100) / 100),
      capacity: Math.max(0, parseInt(form.capacity, 10) || 0),
      payment_info: form.payment_info.trim(),
      registration_open: form.registration_open,
      coupons,
      skip_finance: form.skip_finance,
      fin_account_id: form.fin_account_id === AUTO ? '' : form.fin_account_id,
      confirm_message: form.confirm_message.trim(),
      payment_message: form.payment_message.trim(),
      send_confirm_email: form.send_confirm_email,
      send_payment_email: form.send_payment_email,
      questions,
      staff,
    }
    // Quem não vê o Financeiro não mexe na conta escolhida por outra pessoa
    if (!accounts.length) delete payload.fin_account_id
    setSaving(true)
    try {
      let saved = id
        ? await updateChurchEvent(id, payload)
        : await createChurchEvent(currentChurch.id, payload)
      for (const field of ['cover', 'cover_side'] as CoverField[]) {
        if (covers[field] !== undefined)
          saved = await setEventCover(saved.id, field, covers[field]!)
      }
      toast({ title: id ? 'Evento atualizado' : 'Evento criado' })
      navigate(`/membros/eventos/${saved.id}`)
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

  if (isLoading) return <p className="text-sm text-slate-500">Carregando...</p>

  const back = id ? `/membros/eventos/${id}` : '/membros/eventos'
  const accent = eventColor(form.color)
  const isPaid = money(form.price) > 0
  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-5">
      <Link
        to={back}
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">
          {id ? 'Editar evento' : 'Novo evento'}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Depois de salvar, o evento ganha uma página com link e QR code de inscrição.
        </p>
      </div>

      <Section icon={Ticket} title="Dados do evento">
        <Field id="ev-title" label="Nome do evento" required>
          <Input
            id="ev-title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ex: Encontro para Casais"
            className={inputClass}
            maxLength={160}
          />
        </Field>
        <div className="grid sm:grid-cols-4 gap-4">
          <Field id="ev-start" label="Data" required>
            <Input
              id="ev-start"
              type="date"
              value={form.starts_on}
              onChange={(e) => set('starts_on', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="ev-end" label="Até (se durar mais)">
            <Input
              id="ev-end"
              type="date"
              value={form.ends_on}
              onChange={(e) => set('ends_on', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="ev-time" label="Horário">
            <Input
              id="ev-time"
              type="time"
              value={form.start_time}
              onChange={(e) => set('start_time', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="ev-deadline" label="Inscrições até">
            <Input
              id="ev-deadline"
              type="date"
              value={form.registration_deadline}
              onChange={(e) => set('registration_deadline', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field id="ev-cong" label="Congregação">
            <Select value={form.congregation} onValueChange={(v) => set('congregation', v)}>
              <SelectTrigger id="ev-cong" className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Toda a igreja</SelectItem>
                {CONGREGATIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="ev-contact" label="Responsável / dúvidas">
            <Input
              id="ev-contact"
              value={form.contact_name}
              onChange={(e) => set('contact_name', e.target.value)}
              placeholder="Nome"
              className={inputClass}
              maxLength={120}
            />
          </Field>
          <Field id="ev-contact-phone" label="WhatsApp do responsável">
            <Input
              id="ev-contact-phone"
              type="tel"
              value={form.contact_phone}
              onChange={(e) => set('contact_phone', e.target.value)}
              placeholder="(81) 99999-9999"
              className={inputClass}
              maxLength={40}
            />
          </Field>
        </div>
      </Section>

      <Section
        icon={MapPin}
        title="Local do evento"
        hint="A página mostra o endereço com um botão para abrir no mapa."
      >
        <Field id="ev-location" label="Nome do local">
          <Input
            id="ev-location"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Ex: Templo sede, Sítio Recanto"
            className={inputClass}
            maxLength={200}
          />
        </Field>
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[12rem_auto_1fr] gap-2 items-end">
          <Field id="ev-cep" label="CEP">
            <Input
              id="ev-cep"
              inputMode="numeric"
              value={form.address_cep}
              onChange={(e) => set('address_cep', formatCep(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  findCep()
                }
              }}
              placeholder="00000-000"
              className={inputClass}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl gap-1.5"
            disabled={cepBusy || form.address_cep.replace(/\D/g, '').length !== 8}
            onClick={findCep}
          >
            {cepBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Buscar
          </Button>
        </div>
        <div className="grid sm:grid-cols-[1fr_7rem] gap-4">
          <Field id="ev-street" label="Endereço">
            <Input
              id="ev-street"
              value={form.address_street}
              onChange={(e) => set('address_street', e.target.value)}
              className={inputClass}
              maxLength={160}
            />
          </Field>
          <Field id="ev-number" label="Número">
            <Input
              id="ev-number"
              value={form.address_number}
              onChange={(e) => set('address_number', e.target.value)}
              className={inputClass}
              maxLength={20}
            />
          </Field>
        </div>
        <div className="grid sm:grid-cols-[1fr_1fr_1fr_5rem] gap-4">
          <Field id="ev-compl" label="Complemento">
            <Input
              id="ev-compl"
              value={form.address_complement}
              onChange={(e) => set('address_complement', e.target.value)}
              className={inputClass}
              maxLength={80}
            />
          </Field>
          <Field id="ev-district" label="Bairro">
            <Input
              id="ev-district"
              value={form.address_district}
              onChange={(e) => set('address_district', e.target.value)}
              className={inputClass}
              maxLength={80}
            />
          </Field>
          <Field id="ev-city" label="Cidade">
            <Input
              id="ev-city"
              value={form.address_city}
              onChange={(e) => set('address_city', e.target.value)}
              className={inputClass}
              maxLength={80}
            />
          </Field>
          <Field id="ev-uf" label="UF">
            <Input
              id="ev-uf"
              value={form.address_state}
              onChange={(e) => set('address_state', e.target.value.toUpperCase().slice(0, 2))}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section
        icon={ImageIcon}
        title="Página de divulgação"
        hint="O que as pessoas veem ao abrir o link do evento."
      >
        <Field
          id="ev-desc"
          label="Descrição do evento"
          hint="Conte o que vai acontecer, quem vai ministrar e o que está incluso no valor."
        >
          <RichTextEditor
            id="ev-desc"
            value={form.description}
            onChange={(v) => set('description', v)}
            maxLength={8000}
            minHeight="min-h-48"
          />
        </Field>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <CoverPicker
            field="cover"
            title="Capa para celular"
            icon={Smartphone}
            ratio="16:9 · horizontal"
            tips={['1600 × 900 ou 1920 × 1080 px', 'Aparece inteira no topo, sem corte']}
            current={event ? eventCoverUrl(event, 'cover') : ''}
            change={covers.cover}
            onChange={(f) => setCovers((c) => ({ ...c, cover: f }))}
          />
          <CoverPicker
            field="cover_side"
            title="Capa para computador"
            icon={Monitor}
            ratio="9:16 · vertical"
            tips={['1080 × 1920 px', 'Vira faixa lateral', 'Sem ela, usa a do celular']}
            current={event ? eventCoverUrl(event, 'cover_side') : ''}
            change={covers.cover_side}
            onChange={(f) => setCovers((c) => ({ ...c, cover_side: f }))}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Cor dos botões e destaques
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => set('color', c)}
                className={`h-8 w-8 rounded-full border-2 ${
                  accent === c ? 'border-slate-900 scale-110' : 'border-white shadow'
                }`}
                style={{ background: c }}
              />
            ))}
            <label className="h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer">
              <input
                type="color"
                value={accent}
                onChange={(e) => set('color', e.target.value)}
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
              />
              Outra
            </label>
            <span
              className="ml-auto h-9 px-4 rounded-xl text-sm font-semibold text-white flex items-center"
              style={{ background: accent }}
            >
              Exemplo do botão
            </span>
          </div>
        </div>
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <Toggle
            checked={form.publish_only}
            onChange={(v) => set('publish_only', v)}
            title="Só divulgar, sem receber inscrições"
            hint="A página mostra as informações, mas sem o formulário. Bom para evento que ainda não abriu."
          />
          <Toggle
            checked={form.hide_price}
            onChange={(v) => set('hide_price', v)}
            title="Esconder o valor antes da inscrição"
            hint="O preço só aparece depois que a pessoa se inscreve."
          />
          <Toggle
            checked={form.hide_header}
            onChange={(v) => set('hide_header', v)}
            title="Esconder o nome da igreja e do evento sobre a capa"
            hint="Use quando a arte da capa já traz esses nomes."
          />
        </div>
      </Section>

      <Section icon={Wallet} title="Inscrição e pagamento">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            id="ev-price"
            label={form.couple_only ? 'Valor por casal (R$)' : 'Valor por pessoa (R$)'}
            hint="Deixe vazio se for gratuito."
          >
            <Input
              id="ev-price"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set('price', e.target.value.replace(/[^\d,.]/g, ''))}
              placeholder="0,00"
              className={inputClass}
            />
          </Field>
          <Field
            id="ev-cap"
            label={form.couple_only ? 'Vagas (casais)' : 'Vagas'}
            hint="Deixe vazio para não limitar."
          >
            <Input
              id="ev-cap"
              inputMode="numeric"
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))}
              className={inputClass}
            />
          </Field>
        </div>
        <Toggle
          checked={form.couple_only}
          onChange={(v) => set('couple_only', v)}
          title="Exclusivo para casais"
          hint="A inscrição pede o nome do cônjuge e o valor vale para os dois."
        />
        <Field
          id="ev-pay"
          label="Outras formas de pagar"
          hint="Aparece depois da inscrição, junto com o Pix (ex.: dinheiro na secretaria, parcelamento)."
        >
          <Textarea
            id="ev-pay"
            value={form.payment_info}
            onChange={(e) => set('payment_info', e.target.value)}
            className="rounded-xl border-slate-200 min-h-20"
            maxLength={500}
          />
        </Field>

        {isPaid && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700">Cupons de desconto</p>
            {form.coupons.length === 0 && (
              <p className="text-xs text-slate-500">
                Nenhum cupom. Ex.: PASTORES com 100% ou CASAL10 com R$ 10 de desconto.
              </p>
            )}
            {form.coupons.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-2 sm:grid-cols-[1fr_8rem_7rem_6rem_auto] gap-2"
              >
                <Input
                  aria-label="Código do cupom"
                  value={c.code}
                  onChange={(e) => setCoupon(i, { code: normalizeCouponCode(e.target.value) })}
                  placeholder="CÓDIGO"
                  className={`${inputClass} font-mono uppercase`}
                />
                <Select
                  value={c.kind}
                  onValueChange={(v) => setCoupon(i, { kind: v as EventCoupon['kind'] })}
                >
                  <SelectTrigger className={inputClass} aria-label="Tipo de desconto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">% do valor</SelectItem>
                    <SelectItem value="VALUE">R$ a menos</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Desconto"
                  inputMode="decimal"
                  value={c.value}
                  onChange={(e) => setCoupon(i, { value: e.target.value.replace(/[^\d,.]/g, '') })}
                  placeholder={c.kind === 'PERCENT' ? '10' : '10,00'}
                  className={inputClass}
                />
                <Input
                  aria-label="Limite de usos"
                  inputMode="numeric"
                  value={c.limit}
                  onChange={(e) => setCoupon(i, { limit: e.target.value.replace(/\D/g, '') })}
                  placeholder="Usos"
                  title="Quantas inscrições podem usar (vazio = sem limite)"
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-red-600"
                  aria-label="Tirar cupom"
                  onClick={() =>
                    set(
                      'coupons',
                      form.coupons.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg gap-1.5"
              onClick={() =>
                set('coupons', [
                  ...form.coupons,
                  { code: '', kind: 'PERCENT', value: '', limit: '' },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Novo cupom
            </Button>
          </div>
        )}

        {isPaid && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <Toggle
              checked={!form.skip_finance}
              onChange={(v) => set('skip_finance', !v)}
              title="Lançar os pagamentos no Financeiro"
              hint='Quando a inscrição é marcada como paga, a receita entra no Financeiro em "Eventos e inscrições". Desfazer o pagamento estorna o lançamento.'
            />
            {!form.skip_finance && accounts.length > 0 && (
              <Field
                id="ev-account"
                label="Conta que recebe"
                hint="Automático: usa a conta da congregação do evento (dinheiro vai para o caixa)."
              >
                <Select value={form.fin_account_id} onValueChange={(v) => set('fin_account_id', v)}>
                  <SelectTrigger id="ev-account" className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>Automático</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.congregation ? ` · ${a.congregation}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <Toggle
            checked={form.registration_open}
            onChange={(v) => set('registration_open', v)}
            title="Inscrições abertas pelo link"
          />
        </div>
      </Section>

      <Section
        icon={ClipboardList}
        title="Questionário"
        hint="Perguntas extras no formulário de inscrição. As respostas aparecem na lista e na planilha."
      >
        {form.questions.length === 0 && (
          <p className="text-xs text-slate-500">
            Nenhuma pergunta. Ex.: tamanho da camiseta, restrição alimentar, idade dos filhos.
          </p>
        )}
        {form.questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="grid sm:grid-cols-[1fr_12rem_auto] gap-2">
              <Input
                aria-label="Pergunta"
                value={q.label}
                onChange={(e) => setQuestion(i, { label: e.target.value })}
                placeholder="Ex.: Tamanho da camiseta"
                className={inputClass}
                maxLength={200}
              />
              <Select
                value={q.kind}
                onValueChange={(v) => setQuestion(i, { kind: v as EventQuestion['kind'] })}
              >
                <SelectTrigger className={inputClass} aria-label="Tipo de resposta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_KIND_LABELS) as EventQuestion['kind'][]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {QUESTION_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-red-600"
                aria-label="Tirar pergunta"
                onClick={() =>
                  set(
                    'questions',
                    form.questions.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {q.kind === 'CHOICE' && (
              <Input
                aria-label="Opções"
                value={q.options}
                onChange={(e) => setQuestion(i, { options: e.target.value })}
                placeholder="Opções separadas por vírgula: P, M, G, GG"
                className={inputClass}
              />
            )}
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Checkbox
                checked={q.required}
                onCheckedChange={(c) => setQuestion(i, { required: c === true })}
              />
              Resposta obrigatória
            </label>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-lg gap-1.5"
          onClick={() =>
            set('questions', [
              ...form.questions,
              { id: newQuestionId(), label: '', kind: 'TEXT', options: '', required: false },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Nova pergunta
        </Button>
      </Section>

      <Section
        icon={HandHelping}
        title="Equipe de apoio"
        hint="Quem ajuda no dia (recepção, check-in, cozinha). Aparece na tela do evento e na impressão."
      >
        {form.staff.map((m, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_10rem_1fr_auto] gap-2">
            <Input
              aria-label="Nome"
              value={m.name}
              onChange={(e) => setStaff(i, { name: e.target.value })}
              placeholder="Nome"
              className={inputClass}
              maxLength={120}
            />
            <Input
              aria-label="Telefone"
              type="tel"
              value={m.phone}
              onChange={(e) => setStaff(i, { phone: e.target.value })}
              placeholder="Telefone"
              className={inputClass}
              maxLength={40}
            />
            <Input
              aria-label="Tarefa"
              value={m.task}
              onChange={(e) => setStaff(i, { task: e.target.value })}
              placeholder="Ex.: Check-in na entrada"
              className={inputClass}
              maxLength={120}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-red-600"
              aria-label="Tirar da equipe"
              onClick={() =>
                set(
                  'staff',
                  form.staff.filter((_, j) => j !== i),
                )
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-lg gap-1.5"
          onClick={() => set('staff', [...form.staff, { name: '', phone: '', task: '' }])}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar pessoa
        </Button>
      </Section>

      <Section
        icon={Bell}
        title="Mensagens"
        hint="Use os botões {nome}, {evento}... para preencher sozinho. Por e-mail vai só para quem informou o e-mail; pelo WhatsApp, a secretaria envia com um toque."
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">Confirmação de inscrição</p>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Checkbox
              checked={form.send_confirm_email}
              onCheckedChange={(c) => set('send_confirm_email', c === true)}
            />
            Enviar por e-mail para quem se inscreve pelo link (também aparece na tela)
          </label>
          <RichTextEditor
            id="ev-confirm"
            value={form.confirm_message}
            onChange={(v) => set('confirm_message', v)}
            maxLength={4000}
            fields={MESSAGE_FIELDS}
          />
        </div>
        {isPaid && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Confirmação de pagamento</p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Checkbox
                checked={form.send_payment_email}
                onCheckedChange={(c) => set('send_payment_email', c === true)}
              />
              Enviar por e-mail quando o pagamento for marcado como recebido
            </label>
            <RichTextEditor
              id="ev-payment-msg"
              value={form.payment_message}
              onChange={(v) => set('payment_message', v)}
              maxLength={4000}
              fields={MESSAGE_FIELDS}
            />
          </div>
        )}
      </Section>

      <div className="flex justify-end gap-2 pb-6">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={() => navigate(back)}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={saving}
          className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar evento
        </Button>
      </div>
    </form>
  )
}
