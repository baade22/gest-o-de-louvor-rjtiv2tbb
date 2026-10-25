import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertCircle, CalendarDays, Check, MapPin, Send, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { getEventSignupInfo, submitEventSignup, type EventSignupInfo } from '@/services/churchEvents'
import { eventDateLabel, formatBRL } from '@/lib/churchEvents'

const inputClass = 'rounded-xl border-slate-200 h-11 text-base sm:text-sm'

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">{children}</div>
    </div>
  )
}

export default function PublicEventSignup() {
  const { key = '' } = useParams<{ key: string }>()
  const [info, setInfo] = useState<EventSignupInfo | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getEventSignupInfo(key).then(setInfo)
  }, [key])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (name.trim().split(/\s+/).length < 2) return setError('Informe o nome completo.')
    if (phone.replace(/\D/g, '').length < 10) return setError('Informe o telefone com DDD.')
    if (!consent) return setError('Marque a autorização para enviar.')
    setSending(true)
    try {
      await submitEventSignup({ key, name, phone, email, consent, website })
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  if (!info.valid) {
    return (
      <Centered>
        <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Inscrição indisponível</h1>
        <p className="text-slate-600">{info.message}</p>
      </Centered>
    )
  }

  const paid = !!info.price && info.price > 0
  const dateLabel = eventDateLabel({ starts_on: info.starts_on || '', ends_on: info.ends_on, start_time: info.start_time })

  if (done) {
    return (
      <Centered>
        <div className="h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
          <Check className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Inscrição feita!</h1>
        <p className="text-slate-600">
          {name.trim().split(/\s+/)[0]}, você está inscrito(a) em <strong>{info.title}</strong> ({dateLabel}).
        </p>
        {paid && (
          <div className="text-left rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-1">
            <p className="text-sm font-semibold text-amber-900">Falta o pagamento de {formatBRL(info.price!)}</p>
            <p className="text-sm text-amber-900 whitespace-pre-line">
              {info.payment_info || 'A secretaria da igreja vai passar as instruções.'}
            </p>
          </div>
        )}
      </Centered>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="bg-teal-700 text-white">
        <div className="max-w-xl mx-auto px-4 py-7 space-y-2">
          <p className="text-teal-100 text-sm">{info.church_name}</p>
          <h1 className="text-2xl font-bold leading-tight">{info.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-teal-50">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {dateLabel}
            </span>
            {info.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {info.location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Ticket className="h-4 w-4" />
              {paid ? formatBRL(info.price!) : 'Gratuito'}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 -mt-3 space-y-4">
        {info.description && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <p className="text-sm text-slate-700 whitespace-pre-line">{info.description}</p>
          </section>
        )}

        {!info.open ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-1 shadow-xs">
            <p className="font-semibold text-slate-900">
              {info.closed_reason === 'full' ? 'As vagas acabaram' : 'Inscrições encerradas'}
            </p>
            <p className="text-sm text-slate-500">Fale com a secretaria da igreja.</p>
          </section>
        ) : (
          <form onSubmit={submit} noValidate className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
            {typeof info.spots_left === 'number' && info.spots_left <= 10 && (
              <p className="text-sm font-medium text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
                {info.spots_left === 1 ? 'Última vaga!' : `Restam ${info.spots_left} vagas`}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ev-name" className="text-sm font-semibold">
                Nome completo <span className="text-red-500">*</span>
              </Label>
              <Input id="ev-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-phone" className="text-sm font-semibold">
                Telefone / WhatsApp <span className="text-red-500">*</span>
              </Label>
              <Input id="ev-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(81) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-email" className="text-sm font-semibold">
                E-mail
              </Label>
              <Input id="ev-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} maxLength={200} />
            </div>
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="h-5 w-5 mt-0.5" />
              <span>Autorizo a {info.church_name} a usar estes dados para organizar o evento e falar comigo.</span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                {error}
              </p>
            )}
            <Button type="submit" disabled={sending} className="w-full h-12 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold gap-2">
              <Send className="h-4 w-4" />
              {sending ? 'Enviando...' : 'Fazer inscrição'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
