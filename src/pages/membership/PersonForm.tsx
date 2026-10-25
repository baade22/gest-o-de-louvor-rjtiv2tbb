import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  createPerson,
  createPersonEvent,
  getPerson,
  updatePerson,
  type PersonPayload,
} from '@/services/people'
import type { AdmissionType, MaritalStatus, Person, PersonGender, PersonStatus } from '@/types'
import {
  ADMISSION_TYPE_LABELS,
  CONGREGATIONS,
  MARITAL_STATUS_LABELS,
  PERSON_STATUS_LABELS,
  PERSON_STATUS_ORDER,
  STATUS_CHANGE_REASONS,
  ageOn,
  reasonGroupFor,
} from '@/lib/membership'
import { getLocalTodayYMD, toCalendarYMD } from '@/lib/dateUtils'
import { ArrowLeft, Camera, Save, Trash2 } from 'lucide-react'
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
import { PersonAvatar, errorMessage, usePhotoToken } from './shared'

// O Select do Radix não aceita valor vazio; usamos este marcador para "não informado".
const NONE = '__none__'

const DATE_FIELDS = [
  'birth_date',
  'wedding_date',
  'conversion_date',
  'baptism_date',
  'admission_date',
] as const

type FormState = Omit<PersonPayload, 'church_id'>

const EMPTY: FormState = {
  name: '',
  birth_date: '',
  gender: '',
  marital_status: '',
  wedding_date: '',
  phone: '',
  email: '',
  document: '',
  address: '',
  neighborhood: '',
  city: '',
  state: '',
  zip_code: '',
  congregation: '',
  status: 'MEMBRO',
  conversion_date: '',
  baptism_date: '',
  admission_date: '',
  admission_type: '',
  church_office: '',
  roll_number: '',
  notes: '',
  user_id: '',
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  required,
  children,
  className = '',
}: {
  id: string
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
    </div>
  )
}

const inputClass = 'rounded-xl border-slate-200'

export default function PersonForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = !!id
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const photoToken = usePhotoToken(isEditing)
  const fileInput = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [original, setOriginal] = useState<Person | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [removePhoto, setRemovePhoto] = useState(false)
  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Mudança de situação vira registro na linha do tempo, com data e motivo
  const [statusDate, setStatusDate] = useState(getLocalTodayYMD())
  const [statusReason, setStatusReason] = useState('')
  const [statusNote, setStatusNote] = useState('')

  useEffect(() => {
    if (!id) return
    getPerson(id)
      .then((p) => {
        setOriginal(p)
        const next = { ...EMPTY }
        for (const key of Object.keys(EMPTY) as Array<keyof FormState>) {
          const value = p[key]
          ;(next as Record<string, unknown>)[key] = value ?? ''
        }
        for (const key of DATE_FIELDS) next[key] = toCalendarYMD(p[key])
        setForm(next)
      })
      .catch((err) => {
        toast({
          title: 'Ficha não encontrada',
          description: errorMessage(err, 'Não foi possível abrir esta ficha.'),
          variant: 'destructive',
        })
        navigate('/membros')
      })
      .finally(() => setIsLoading(false))
  }, [id])

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview('')
      return
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast({
        title: 'Formato não aceito',
        description: 'Use uma foto JPG, PNG ou WEBP.',
        variant: 'destructive',
      })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Foto muito grande', description: 'O limite é 5 MB.', variant: 'destructive' })
      return
    }
    setPhotoFile(file)
    setRemovePhoto(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return
    if (!form.name.trim()) {
      toast({ title: 'Informe o nome', variant: 'destructive' })
      return
    }

    const payload: PersonPayload = {
      ...form,
      church_id: currentChurch.id,
      name: form.name.trim(),
      email: form.email?.trim(),
      document: form.document?.trim(),
      congregation: form.congregation?.trim(),
      state: form.state?.trim().toUpperCase(),
    }
    for (const key of DATE_FIELDS) {
      payload[key] = form[key] ? `${form[key]} 00:00:00.000Z` : ''
    }
    // Data de casamento só faz sentido para quem é casado(a) ou viúvo(a)
    if (!['CASADO', 'VIUVO', 'UNIAO_ESTAVEL'].includes(form.marital_status || '')) {
      payload.wedding_date = ''
    }

    const statusChanged = !!original && original.status !== form.status
    if (statusChanged && (!statusReason || !statusDate)) {
      toast({
        title: 'Informe o motivo da mudança de situação',
        description: 'Ele fica registrado na linha do tempo da pessoa.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const photo = { file: photoFile, remove: removePhoto }
      const saved =
        isEditing && id
          ? await updatePerson(id, payload, photo)
          : await createPerson(payload, photo)
      if (statusChanged && original) {
        await createPersonEvent({
          church_id: saved.church_id,
          person_id: saved.id,
          kind: 'SITUACAO',
          date: `${statusDate} 00:00:00.000Z`,
          title: statusReason,
          description: statusNote.trim(),
          from_status: original.status,
          to_status: form.status,
        })
      }
      toast({
        title: isEditing ? 'Ficha atualizada' : 'Membro cadastrado',
        description: `${payload.name} foi salvo(a).`,
      })
      navigate(`/membros/${saved.id}`)
    } catch (err) {
      console.error('Falha ao salvar ficha:', err)
      toast({
        title: 'Erro ao salvar',
        description: errorMessage(err, 'Não foi possível salvar a ficha. Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  const backTo = isEditing ? `/membros/${id}` : '/membros'
  const age = ageOn(form.birth_date, getLocalTodayYMD())
  const showWedding = ['CASADO', 'VIUVO', 'UNIAO_ESTAVEL'].includes(form.marital_status || '')
  const avatarPerson: Person = {
    ...(original || { id: '', church_id: '', created: '', updated: '' }),
    name: form.name || 'M',
    status: form.status,
    photo: removePhoto ? undefined : original?.photo,
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        to={backTo}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {isEditing ? 'Voltar para o perfil' : 'Voltar para Membros'}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isEditing ? 'Ficha do membro' : 'Novo membro'}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Só o nome e a situação são obrigatórios. O resto pode ser completado depois.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Section title="Dados pessoais">
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="flex flex-col items-center gap-2 shrink-0">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Nova foto"
                  className="h-24 w-24 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <PersonAvatar person={avatarPerson} token={photoToken} size="lg" />
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhoto}
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  className="rounded-xl text-xs gap-1.5"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Foto
                </Button>
                {(photoFile || (original?.photo && !removePhoto)) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover foto"
                    onClick={() => {
                      setPhotoFile(null)
                      if (original?.photo) setRemovePhoto(true)
                    }}
                    className="h-8 w-8 text-slate-400 hover:text-red-600 rounded-lg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="name" label="Nome completo" required className="sm:col-span-2">
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Ex: Maria da Silva"
                  className={inputClass}
                  required
                />
              </Field>
              <Field
                id="birth_date"
                label={age !== null ? `Nascimento (${age} anos)` : 'Nascimento'}
              >
                <Input
                  id="birth_date"
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => set('birth_date', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="gender" label="Sexo">
                <Select
                  value={form.gender || NONE}
                  onValueChange={(v) => set('gender', v === NONE ? '' : (v as PersonGender))}
                >
                  <SelectTrigger id="gender" className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="M">Masculino</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="marital_status" label="Estado civil">
                <Select
                  value={form.marital_status || NONE}
                  onValueChange={(v) =>
                    set('marital_status', v === NONE ? '' : (v as MaritalStatus))
                  }
                >
                  <SelectTrigger id="marital_status" className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {(Object.keys(MARITAL_STATUS_LABELS) as MaritalStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {MARITAL_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {showWedding && (
                <Field id="wedding_date" label="Data de casamento">
                  <Input
                    id="wedding_date"
                    type="date"
                    value={form.wedding_date}
                    onChange={(e) => set('wedding_date', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              )}
            </div>
          </div>
        </Section>

        <Section title="Contato e endereço">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="phone" label="Telefone / WhatsApp">
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="(81) 98765-4321"
                className={inputClass}
              />
            </Field>
            <Field id="email" label="E-mail">
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="maria@email.com"
                className={inputClass}
              />
            </Field>
            <Field id="document" label="CPF (sai no informe de contribuições)">
              <Input
                id="document"
                value={form.document}
                onChange={(e) => set('document', e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            <Field id="address" label="Endereço" className="sm:col-span-2">
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Rua, número e complemento"
                className={inputClass}
              />
            </Field>
            <Field id="neighborhood" label="Bairro">
              <Input
                id="neighborhood"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-[1fr_4.5rem] gap-3">
              <Field id="city" label="Cidade">
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="state" label="UF">
                <Input
                  id="state"
                  value={form.state}
                  maxLength={2}
                  onChange={(e) => set('state', e.target.value.toUpperCase())}
                  placeholder="PE"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field id="zip_code" label="CEP">
              <Input
                id="zip_code"
                value={form.zip_code}
                maxLength={10}
                onChange={(e) => set('zip_code', e.target.value)}
                placeholder="00000-000"
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="Vida na igreja">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="status" label="Situação" required>
              <Select value={form.status} onValueChange={(v) => set('status', v as PersonStatus)}>
                <SelectTrigger id="status" className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSON_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PERSON_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="congregation" label="Congregação">
              <Input
                id="congregation"
                list="congregation-options"
                value={form.congregation}
                onChange={(e) => set('congregation', e.target.value)}
                placeholder="Aldeia ou Diamante"
                className={inputClass}
              />
              <datalist id="congregation-options">
                {CONGREGATIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            {original && original.status !== form.status && (
              <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <p className="sm:col-span-3 text-xs text-amber-900">
                  Situação muda de <b>{PERSON_STATUS_LABELS[original.status]}</b> para{' '}
                  <b>{PERSON_STATUS_LABELS[form.status]}</b>. Isso fica na linha do tempo e na
                  movimentação do painel.
                </p>
                <Field id="status_reason" label="Motivo" required>
                  <Select value={statusReason} onValueChange={setStatusReason}>
                    <SelectTrigger id="status_reason" className={`${inputClass} bg-white`}>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_CHANGE_REASONS[reasonGroupFor(original.status, form.status)].map(
                        (r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="status_date" label="Data da mudança" required>
                  <Input
                    id="status_date"
                    type="date"
                    value={statusDate}
                    onChange={(e) => setStatusDate(e.target.value)}
                    className={`${inputClass} bg-white`}
                  />
                </Field>
                <Field id="status_note" label="Observação">
                  <Input
                    id="status_note"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Ex: carta para a IB Central"
                    className={`${inputClass} bg-white`}
                  />
                </Field>
              </div>
            )}
            <Field id="church_office" label="Cargo">
              <Input
                id="church_office"
                value={form.church_office}
                onChange={(e) => set('church_office', e.target.value)}
                placeholder="Ex: Diácono, Presbítero"
                className={inputClass}
              />
            </Field>
            <Field id="roll_number" label="Nº do rol">
              <Input
                id="roll_number"
                value={form.roll_number}
                maxLength={20}
                onChange={(e) => set('roll_number', e.target.value)}
                placeholder="Matrícula do membro"
                className={inputClass}
              />
            </Field>
            <Field id="conversion_date" label="Data de conversão">
              <Input
                id="conversion_date"
                type="date"
                value={form.conversion_date}
                onChange={(e) => set('conversion_date', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="baptism_date" label="Data de batismo">
              <Input
                id="baptism_date"
                type="date"
                value={form.baptism_date}
                onChange={(e) => set('baptism_date', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="admission_date" label="Data de admissão como membro">
              <Input
                id="admission_date"
                type="date"
                value={form.admission_date}
                onChange={(e) => set('admission_date', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="admission_type" label="Forma de admissão">
              <Select
                value={form.admission_type || NONE}
                onValueChange={(v) => set('admission_type', v === NONE ? '' : (v as AdmissionType))}
              >
                <SelectTrigger id="admission_type" className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {(Object.keys(ADMISSION_TYPE_LABELS) as AdmissionType[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {ADMISSION_TYPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Observações" description="Visível apenas para os administradores.">
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={4}
            className={inputClass}
          />
        </Section>

        <div className="flex justify-end gap-2 pb-6">
          <Link to={backTo}>
            <Button type="button" variant="outline" className="rounded-xl">
              Cancelar
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar ficha' : 'Cadastrar membro'}
          </Button>
        </div>
      </form>
    </div>
  )
}
