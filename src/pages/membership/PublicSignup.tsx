import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertCircle, Check, HeartHandshake, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { getSignupInfo, submitPublicSignup, type SignupInfo } from '@/services/signups'
import { RELATIONSHIP_LABELS } from '@/lib/signups'
import { MARITAL_STATUS_LABELS } from '@/lib/membership'
import type { MaritalStatus, SignupRelationship } from '@/types'

const inputClass = 'rounded-xl border-slate-200 h-11 text-base sm:text-sm'

function Field({
  id,
  label,
  required,
  hint,
  children,
  className = '',
}: {
  id?: string
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Choice<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T | ''
  options: Array<[T, string]>
  onChange: (v: T) => void
  name: string
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`px-4 h-11 rounded-xl border text-sm font-medium transition-colors ${
            value === v
              ? 'bg-teal-700 border-teal-700 text-white'
              : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  birth_date: '',
  gender: '' as '' | 'M' | 'F',
  marital_status: '' as '' | MaritalStatus,
  address: '',
  neighborhood: '',
  city: '',
  state: '',
  zip_code: '',
  congregation: '',
  relationship: '' as '' | SignupRelationship,
  baptized: false,
  how_found: '',
  prayer_request: '',
  website: '',
}

export default function PublicSignup() {
  const { key = '' } = useParams<{ key: string }>()
  const [info, setInfo] = useState<SignupInfo | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getSignupInfo(key).then(setInfo)
  }, [key])

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.name.trim().split(/\s+/).length < 2) return setError('Informe o nome completo.')
    if (!form.phone.trim() && !form.email.trim()) {
      return setError('Informe um telefone ou um e-mail para a igreja falar com você.')
    }
    if (!form.relationship)
      return setError('Conte se está visitando, se frequenta ou se já é membro.')
    if (!consent) return setError('Marque a autorização no fim do formulário.')
    setSending(true)
    try {
      await submitPublicSignup({ ...form, relationship: form.relationship, key, consent })
      setDone(true)
      window.scrollTo(0, 0)
    } catch (err) {
      const data = (err as { response?: { message?: string } }).response
      setError(data?.message || 'Não foi possível enviar agora. Tente de novo em instantes.')
    } finally {
      setSending(false)
    }
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  if (!info.valid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Cadastro indisponível</h1>
          <p className="text-slate-600">{info.message}</p>
        </div>
      </div>
    )
  }

  if (done) {
    const first = form.name.trim().split(/\s+/)[0]
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Obrigado, {first}!</h1>
          <p className="text-slate-600">
            Seu cadastro chegou para a secretaria da {info.church_name}. Que bom ter você com a
            gente.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="bg-teal-700 text-white">
        <div className="max-w-xl mx-auto px-4 py-7 flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <HeartHandshake className="h-7 w-7" />
          </div>
          <div>
            <p className="text-teal-100 text-sm">{info.church_name}</p>
            <h1 className="text-2xl font-bold leading-tight">Ficha de cadastro</h1>
            {info.congregation && (
              <p className="text-teal-100 text-sm mt-0.5">Congregação {info.congregation}</p>
            )}
          </div>
        </div>
      </header>

      <form onSubmit={submit} className="max-w-xl mx-auto px-4 -mt-3 space-y-4" noValidate>
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <Field id="su-name" label="Nome completo" required>
            <Input
              id="su-name"
              autoComplete="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              id="su-phone"
              label="Telefone / WhatsApp"
              hint="Telefone ou e-mail: pelo menos um."
            >
              <Input
                id="su-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(81) 99999-9999"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className={inputClass}
                maxLength={40}
              />
            </Field>
            <Field id="su-email" label="E-mail">
              <Input
                id="su-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={inputClass}
                maxLength={200}
              />
            </Field>
          </div>
          <Field label="Você..." required>
            <Choice
              name="Relação com a igreja"
              value={form.relationship}
              onChange={(v) => set('relationship', v)}
              options={Object.entries(RELATIONSHIP_LABELS) as Array<[SignupRelationship, string]>}
            />
          </Field>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">Sobre você</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="su-birth" label="Data de nascimento">
              <Input
                id="su-birth"
                type="date"
                value={form.birth_date}
                onChange={(e) => set('birth_date', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Sexo">
              <Choice
                name="Sexo"
                value={form.gender}
                onChange={(v) => set('gender', v)}
                options={[
                  ['M', 'Masculino'],
                  ['F', 'Feminino'],
                ]}
              />
            </Field>
          </div>
          <Field id="su-marital" label="Estado civil">
            <select
              id="su-marital"
              value={form.marital_status}
              onChange={(e) => set('marital_status', e.target.value as MaritalStatus | '')}
              className={`${inputClass} w-full border bg-white px-3`}
            >
              <option value="">Prefiro não informar</option>
              {(Object.entries(MARITAL_STATUS_LABELS) as Array<[MaritalStatus, string]>).map(
                ([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </Field>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <Checkbox
              checked={form.baptized}
              onCheckedChange={(c) => set('baptized', c === true)}
              className="h-5 w-5"
            />
            Já fui batizado(a)
          </label>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">Endereço</h2>
          <Field id="su-address" label="Rua, número e complemento">
            <Input
              id="su-address"
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className={inputClass}
              maxLength={300}
            />
          </Field>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_80px] gap-4">
            <Field id="su-neigh" label="Bairro">
              <Input
                id="su-neigh"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className={inputClass}
                maxLength={120}
              />
            </Field>
            <Field id="su-city" label="Cidade">
              <Input
                id="su-city"
                autoComplete="address-level2"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                className={inputClass}
                maxLength={120}
              />
            </Field>
            <Field id="su-state" label="UF">
              <Input
                id="su-state"
                value={form.state}
                onChange={(e) => set('state', e.target.value.toUpperCase())}
                className={inputClass}
                maxLength={2}
              />
            </Field>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">Para a igreja te conhecer</h2>
          {!info.congregation && (
            <Field id="su-cong" label="Congregação que frequenta">
              <Input
                id="su-cong"
                value={form.congregation}
                onChange={(e) => set('congregation', e.target.value)}
                className={inputClass}
                maxLength={120}
              />
            </Field>
          )}
          <Field id="su-how" label="Como conheceu a igreja?">
            <Input
              id="su-how"
              placeholder="Ex: convite de um amigo, Instagram"
              value={form.how_found}
              onChange={(e) => set('how_found', e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </Field>
          <Field id="su-prayer" label="Pedido de oração (opcional)">
            <Textarea
              id="su-prayer"
              value={form.prayer_request}
              onChange={(e) => set('prayer_request', e.target.value)}
              className="rounded-xl border-slate-200 min-h-24 text-base sm:text-sm"
              maxLength={1000}
            />
          </Field>
        </section>

        {/* Campo invisível contra robôs: pessoas não veem nem preenchem */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Site
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-start gap-3 text-sm text-slate-700 bg-white rounded-2xl border border-slate-200 p-4">
          <Checkbox
            checked={consent}
            onCheckedChange={(c) => setConsent(c === true)}
            className="h-5 w-5 mt-0.5"
          />
          <span>
            Autorizo a {info.church_name} a guardar estes dados para cuidar de mim e entrar em
            contato. Eles não são compartilhados com ninguém de fora da igreja.
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={sending}
          className="w-full h-12 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold gap-2"
        >
          <Send className="h-4 w-4" />
          {sending ? 'Enviando...' : 'Enviar cadastro'}
        </Button>
      </form>
    </div>
  )
}
