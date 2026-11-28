// Meus dados: a pessoa atualiza contato, endereço e dados pessoais. Nome, situação, rol e datas
// da igreja ficam com a secretaria; o CPF ela preenche uma vez (trocar é com a secretaria).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Lock, MessageCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatCep, parseViaCep } from '@/lib/eventPage'
import {
  formatCpfInput,
  formatPhoneInput,
  isValidCpf,
  isValidPhone,
  MEMBER_STATUS_LABEL,
} from '@/lib/memberArea'
import { whatsappUrl } from '@/lib/site'
import { lookupCep } from '@/services/churchEvents'
import { memberError, saveMemberProfile, type MemberProfileInput } from '@/services/member'
import { useSite } from '../siteContext'
import { BackTitle, Label, Spinner, useMemberMe } from './memberParts'

const inputCls =
  'h-[50px] w-full rounded-2xl border-[1.5px] border-[var(--c-line)] bg-white px-4 text-[15.5px] font-semibold outline-none focus:border-[var(--c-blue)] focus:shadow-[0_0_0_4px_var(--c-sky)]'

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mx-1 mb-1.5 block text-[12.5px] font-bold text-[var(--c-gray)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mx-1 mt-1 block text-[12px] font-medium text-[var(--c-gray)]">{hint}</span>
      )}
    </label>
  )
}

function brDate(d: string) {
  return d ? d.slice(0, 10).split('-').reverse().join('/') : ''
}

export default function MemberData() {
  const { site, slug, to } = useSite()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { me, loading } = useMemberMe()
  const [form, setForm] = useState<MemberProfileInput | null>(null)
  const [cpf, setCpf] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!me) return
    const p = me.profile
    setForm({
      phone: formatPhoneInput(p.phone) || p.phone,
      email: p.email,
      birth_date: p.birth_date,
      gender: p.gender,
      marital_status: p.marital_status,
      wedding_date: p.wedding_date,
      zip_code: p.zip_code,
      address: p.address,
      neighborhood: p.neighborhood,
      city: p.city,
      state: p.state,
      profession: p.profession,
    })
  }, [me])

  if (loading || !me || !form) return <Spinner />
  const p = me.profile
  const set = (k: keyof MemberProfileInput, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const onCep = async (v: string) => {
    const cep = formatCep(v)
    set('zip_code', cep)
    if (cep.replace(/\D/g, '').length !== 8) return
    try {
      const a = parseViaCep(await lookupCep(cep))
      if (a)
        setForm((f) =>
          f
            ? {
                ...f,
                zip_code: cep,
                address: f.address || a.address_street || '',
                neighborhood: a.address_district || f.neighborhood,
                city: a.address_city || f.city,
                state: a.address_state || f.state,
              }
            : f,
        )
    } catch (_) {
      // sem internet para o CEP: a pessoa digita
    }
  }

  const save = async () => {
    setError('')
    if (!isValidPhone(form.phone)) return setError('Confira o celular (com DDD).')
    if (cpf && !isValidCpf(cpf)) return setError('Confira o CPF.')
    setSaving(true)
    try {
      await saveMemberProfile(slug, { ...form, document: p.has_document ? undefined : cpf })
      toast({ title: 'Dados salvos', description: 'Obrigado por manter seu cadastro em dia.' })
      navigate(to('/eu'))
    } catch (err) {
      setError(memberError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const secretaria = site.whatsapp
    ? whatsappUrl(site.whatsapp, `Olá! Sou ${p.name} e preciso corrigir um dado da minha ficha.`)
    : ''

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pt-2 lg:pt-10">
      <BackTitle>Meus dados</BackTitle>

      <div className="c-card mt-2 p-4">
        <p className="text-[17px] font-extrabold">{p.name}</p>
        <p className="text-[12.5px] font-medium text-[var(--c-gray)]">
          {[MEMBER_STATUS_LABEL[p.status], p.congregation && `Congregação ${p.congregation}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Label>Contato</Label>
      <div className="space-y-3">
        <Field label="Celular (WhatsApp)" hint="É por ele que você entra no app.">
          <input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set('phone', formatPhoneInput(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="E-mail">
          <input
            type="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Label>Pessoal</Label>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nascimento">
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => set('birth_date', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Sexo">
            <select
              value={form.gender}
              onChange={(e) => set('gender', e.target.value)}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="F">Feminino</option>
              <option value="M">Masculino</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado civil">
            <select
              value={form.marital_status}
              onChange={(e) => set('marital_status', e.target.value)}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="SOLTEIRO">Solteiro(a)</option>
              <option value="CASADO">Casado(a)</option>
              <option value="UNIAO_ESTAVEL">União estável</option>
              <option value="DIVORCIADO">Divorciado(a)</option>
              <option value="VIUVO">Viúvo(a)</option>
            </select>
          </Field>
          {(form.marital_status === 'CASADO' || form.marital_status === 'UNIAO_ESTAVEL') && (
            <Field label="Casamento">
              <input
                type="date"
                value={form.wedding_date}
                onChange={(e) => set('wedding_date', e.target.value)}
                className={inputCls}
              />
            </Field>
          )}
        </div>
        <Field label="Profissão">
          <input
            value={form.profession}
            onChange={(e) => set('profession', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field
          label="CPF"
          hint={
            p.has_document
              ? 'Para trocar o CPF, fale com a secretaria.'
              : 'Com o CPF, seus dízimos pelo Pix entram no seu nome sozinhos.'
          }
        >
          {p.has_document ? (
            <span className={inputCls + ' flex items-center bg-[#f6f7f9] text-[var(--c-gray)]'}>
              {p.document_masked}
              <Lock className="ml-auto h-4 w-4" />
            </span>
          ) : (
            <input
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatCpfInput(e.target.value))}
              placeholder="000.000.000-00"
              className={inputCls}
            />
          )}
        </Field>
      </div>

      <Label>Endereço</Label>
      <div className="space-y-3">
        <Field label="CEP" hint="Preenche rua, bairro e cidade.">
          <input
            inputMode="numeric"
            value={form.zip_code}
            onChange={(e) => onCep(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Endereço">
          <input
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Rua, número e complemento"
            className={inputCls}
          />
        </Field>
        <Field label="Bairro">
          <input
            value={form.neighborhood}
            onChange={(e) => set('neighborhood', e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <Field label="Cidade">
            <input
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="UF">
            <input
              value={form.state}
              maxLength={2}
              onChange={(e) => set('state', e.target.value.toUpperCase())}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      <Label>Da secretaria</Label>
      <div className="c-card divide-y divide-[#eef1f5] px-4 py-1">
        {[
          ['Situação', MEMBER_STATUS_LABEL[p.status] || '—'],
          ['Nº de rol', p.roll_number || '—'],
          ['Batismo', brDate(p.baptism_date) || '—'],
          ['Membro desde', brDate(p.admission_date) || '—'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 py-3">
            <span className="flex-1">
              <b className="block text-[14px] font-bold">{k}</b>
              <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">{v}</span>
            </span>
            <Lock className="h-4 w-4 text-[var(--c-gray)]" />
          </div>
        ))}
      </div>
      {secretaria && (
        <a
          href={secretaria}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 py-2 text-[13px] font-extrabold text-[var(--c-blue)]"
        >
          <MessageCircle className="h-4 w-4" /> Algo errado? Falar com a secretaria
        </a>
      )}

      {error && (
        <p className="text-center text-[13.5px] font-bold text-[#c0392b]" role="alert">
          {error}
        </p>
      )}
      <div
        className="sticky z-20 pb-2 pt-1 lg:bottom-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
      >
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] text-[15px] font-extrabold text-[var(--sp-text)] shadow-[0_10px_24px_rgba(20,34,58,0.2)] disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          Salvar
        </button>
      </div>
    </div>
  )
}
