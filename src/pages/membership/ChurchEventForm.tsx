import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  createChurchEvent,
  getChurchEvent,
  updateChurchEvent,
  type ChurchEventPayload,
} from '@/services/churchEvents'
import { CONGREGATIONS } from '@/lib/membership'
import { toCalendarYMD } from '@/lib/dateUtils'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from './shared'

const NONE = '__none__'
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

const EMPTY = {
  title: '',
  description: '',
  starts_on: '',
  ends_on: '',
  start_time: '',
  location: '',
  congregation: NONE,
  price: '',
  capacity: '',
  payment_info: '',
  registration_open: true,
}

export default function ChurchEventForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = !!id
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [isLoading, setIsLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    getChurchEvent(id)
      .then((e) =>
        setForm({
          title: e.title,
          description: e.description || '',
          starts_on: toCalendarYMD(e.starts_on),
          ends_on: toCalendarYMD(e.ends_on),
          start_time: e.start_time || '',
          location: e.location || '',
          congregation: e.congregation || NONE,
          price: e.price ? String(e.price).replace('.', ',') : '',
          capacity: e.capacity ? String(e.capacity) : '',
          payment_info: e.payment_info || '',
          registration_open: e.registration_open,
        }),
      )
      .catch((err) =>
        toast({
          title: 'Erro',
          description: errorMessage(err, 'Evento não encontrado.'),
          variant: 'destructive',
        }),
      )
      .finally(() => setIsLoading(false))
  }, [id, toast])

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return
    if (!form.title.trim() || !form.starts_on) {
      toast({
        title: 'Faltam dados',
        description: 'Informe o nome e a data do evento.',
        variant: 'destructive',
      })
      return
    }
    if (form.ends_on && form.ends_on < form.starts_on) {
      toast({
        title: 'Confira as datas',
        description: 'O término vem antes do início.',
        variant: 'destructive',
      })
      return
    }
    const price = Number(form.price.replace(/\./g, '').replace(',', '.')) || 0
    const payload: ChurchEventPayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      starts_on: `${form.starts_on} 00:00:00.000Z`,
      ends_on: form.ends_on ? `${form.ends_on} 00:00:00.000Z` : '',
      start_time: form.start_time,
      location: form.location.trim(),
      congregation: form.congregation === NONE ? '' : form.congregation,
      price: Math.max(0, Math.round(price * 100) / 100),
      capacity: Math.max(0, parseInt(form.capacity, 10) || 0),
      payment_info: form.payment_info.trim(),
      registration_open: form.registration_open,
    }
    setSaving(true)
    try {
      const saved = id
        ? await updateChurchEvent(id, payload)
        : await createChurchEvent(currentChurch.id, payload)
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
          Depois de salvar, o evento ganha um link e um QR code de inscrição.
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <Field id="ev-title" label="Nome do evento" required>
          <Input
            id="ev-title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ex: Retiro de Jovens 2026"
            className={inputClass}
            maxLength={160}
          />
        </Field>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field id="ev-start" label="Data" required>
            <Input
              id="ev-start"
              type="date"
              value={form.starts_on}
              onChange={(e) => set('starts_on', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="ev-end" label="Até (se durar mais de um dia)">
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
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="ev-location" label="Local">
            <Input
              id="ev-location"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Ex: Sítio Recanto, Gravatá"
              className={inputClass}
              maxLength={200}
            />
          </Field>
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
        </div>
        <Field id="ev-desc" label="Descrição" hint="Aparece na página de inscrição.">
          <Textarea
            id="ev-desc"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className="rounded-xl border-slate-200 min-h-24"
            maxLength={3000}
          />
        </Field>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900">Inscrição e pagamento</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="ev-price" label="Valor por pessoa (R$)" hint="Deixe vazio se for gratuito.">
            <Input
              id="ev-price"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set('price', e.target.value.replace(/[^\d,.]/g, ''))}
              placeholder="0,00"
              className={inputClass}
            />
          </Field>
          <Field id="ev-cap" label="Vagas" hint="Deixe vazio para não limitar.">
            <Input
              id="ev-cap"
              inputMode="numeric"
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field
          id="ev-pay"
          label="Como pagar"
          hint="Ex: chave Pix, conta, com quem entregar o dinheiro. Aparece depois da inscrição."
        >
          <Textarea
            id="ev-pay"
            value={form.payment_info}
            onChange={(e) => set('payment_info', e.target.value)}
            className="rounded-xl border-slate-200 min-h-20"
            maxLength={500}
          />
        </Field>
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <Switch
            checked={form.registration_open}
            onCheckedChange={(v) => set('registration_open', v)}
          />
          Inscrições abertas pelo link
        </label>
      </section>

      <div className="flex justify-end gap-2">
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
          <Save className="h-4 w-4" />
          Salvar evento
        </Button>
      </div>
    </form>
  )
}
