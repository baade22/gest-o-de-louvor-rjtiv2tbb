// Página pública do evento (link / QR code, sem login): capa, descrição, local com mapa,
// formulário de inscrição e, no fim, a mensagem de confirmação e o Pix com o valor certo.

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Info,
  MapPin,
  MessageCircle,
  Send,
  Tag,
  Ticket,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RichTextView } from '@/components/RichText'
import { PixQr, displayPixKey } from '@/pages/finance/PixQr'
import {
  checkEventCoupon,
  getEventSignupInfo,
  publicFileUrl,
  submitEventSignup,
  type EventSignupInfo,
  type EventSignupResult,
} from '@/services/churchEvents'
import { eventDateLabel, formatBRL } from '@/lib/churchEvents'
import {
  CLOSED_REASON_LABELS,
  checkinUrl,
  cleanAnswers,
  addressLines,
  eventColor,
  hasAddress,
  mapsUrl,
  normalizeCouponCode,
  registrationPixTxid,
  whatsappUrl,
} from '@/lib/eventPage'
import { pixPayload, type PixKeyType } from '@/lib/pix'
import { toCalendarYMD } from '@/lib/dateUtils'

const inputClass = 'rounded-xl border-slate-200 h-11 text-base sm:text-sm'

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
        {children}
      </div>
    </div>
  )
}

function Card({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: typeof Info
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
      <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
        <span
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function dmy(value?: string) {
  const ymd = toCalendarYMD(value)
  return ymd ? ymd.split('-').reverse().join('/') : ''
}

export default function PublicEventSignup() {
  const { key = '' } = useParams<{ key: string }>()
  const [info, setInfo] = useState<EventSignupInfo | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [partnerPhone, setPartnerPhone] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState<{ code: string; amount: number } | null>(null)
  const [couponMsg, setCouponMsg] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [website, setWebsite] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<EventSignupResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getEventSignupInfo(key).then(setInfo)
  }, [key])

  useEffect(() => {
    if (info?.title) document.title = info.title
  }, [info?.title])

  const amount = result?.amount ?? 0
  const pixCode = useMemo(() => {
    if (!info?.pix || !result?.id || amount <= 0) return ''
    return pixPayload({
      key: info.pix.key,
      keyType: (info.pix.key_type || undefined) as PixKeyType | undefined,
      name: info.pix.name,
      city: info.pix.city,
      amountCents: Math.round(amount * 100),
      txid: registrationPixTxid(result.id),
      message: info.title,
    })
  }, [info, result, amount])

  const applyCoupon = async () => {
    const code = normalizeCouponCode(couponInput)
    setCouponMsg('')
    if (!code) return
    const r = await checkEventCoupon(key, code)
    if (r.valid && typeof r.amount === 'number') {
      setCoupon({ code, amount: r.amount })
    } else {
      setCoupon(null)
      setCouponMsg(r.message || 'Cupom inválido.')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (name.trim().split(/\s+/).length < 2) return setError('Informe o nome completo.')
    if (phone.replace(/\D/g, '').length < 10) return setError('Informe o telefone com DDD.')
    if (info?.couple_only && partnerName.trim().split(/\s+/).length < 2)
      return setError('Informe o nome completo do cônjuge.')
    const quiz = cleanAnswers(info?.questions, answers)
    if (quiz.missing) return setError(`Responda: ${quiz.missing.label}`)
    if (!consent) return setError('Marque a autorização para enviar.')
    setSending(true)
    try {
      const r = await submitEventSignup({
        key,
        name,
        phone,
        email,
        partner_name: info?.couple_only ? partnerName : undefined,
        partner_phone: info?.couple_only ? partnerPhone : undefined,
        coupon: coupon?.code,
        answers: quiz.answers,
        consent,
        website,
      })
      setResult(r)
      window.scrollTo(0, 0)
    } catch (err) {
      const data = (err as { response?: { message?: string } }).response
      setError(data?.message || 'Não foi possível enviar agora. Tente de novo em instantes.')
    } finally {
      setSending(false)
    }
  }

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* o código continua visível para copiar à mão */
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

  const accent = eventColor(info.color)
  const cover = publicFileUrl(info.cover_url)
  const side = publicFileUrl(info.cover_side_url) || cover
  const dateLabel = eventDateLabel({
    starts_on: info.starts_on || '',
    ends_on: info.ends_on,
    start_time: info.start_time,
  })
  const [addr1, addr2] = addressLines(info)
  const showAddress = hasAddress(info)
  const priceKnown = typeof info.price === 'number'
  const priceLabel = info.couple_only ? 'por casal' : 'por pessoa'
  const firstName = name.trim().split(/\s+/)[0]

  const header = (
    <header className="relative">
      {cover ? (
        <div className="relative lg:hidden">
          <img src={cover} alt="" className="w-full aspect-video object-cover" />
          {!info.hide_header && (
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/10 to-transparent" />
          )}
        </div>
      ) : (
        <div className="h-44 lg:hidden" style={{ background: accent }} />
      )}
      {!info.hide_header && (
        <div className="absolute inset-x-0 top-0 px-5 pt-6 text-white lg:hidden">
          <p className="text-xs font-medium uppercase tracking-wide opacity-90 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: '#fff' }} />
            {info.church_name}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight drop-shadow">{info.title}</h1>
        </div>
      )}
    </header>
  )

  const desktopTitle = !info.hide_header && (
    <div className="hidden lg:block space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
        {info.church_name}
      </p>
      <h1 className="text-3xl font-extrabold leading-tight text-slate-900">{info.title}</h1>
    </div>
  )

  const infoCard = (
    <Card icon={Info} title="Informações" accent={accent}>
      <ul className="space-y-3 text-sm text-slate-700">
        <li className="flex gap-3">
          <CalendarDays className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
          <span>{dateLabel}</span>
        </li>
        {(info.location || showAddress) && (
          <li className="flex gap-3">
            <MapPin className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
            <span className="flex-1 min-w-0">
              {info.location && <span className="block font-medium">{info.location}</span>}
              {addr1 && <span className="block uppercase text-xs font-semibold">{addr1}</span>}
              {addr2 && <span className="block uppercase text-[11px] text-slate-500">{addr2}</span>}
            </span>
            <a
              href={mapsUrl(info, info.location)}
              target="_blank"
              rel="noreferrer noopener"
              className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium flex items-center gap-1 shrink-0 self-start"
              style={{ color: accent }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Mapa
            </a>
          </li>
        )}
        {info.paid_event ? (
          priceKnown && (
            <li className="flex gap-3">
              <Ticket className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
              <span>
                <strong>{formatBRL(info.price!)}</strong> {priceLabel}
              </span>
            </li>
          )
        ) : (
          <li className="flex gap-3">
            <Ticket className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
            <span>Gratuito</span>
          </li>
        )}
        {info.registration_deadline && (
          <li className="flex gap-3">
            <Clock className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
            <span>Inscrições até {dmy(info.registration_deadline)}</span>
          </li>
        )}
        {info.contact_name && (
          <li className="flex gap-3 items-center">
            <MessageCircle className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="flex-1">Dúvidas: {info.contact_name}</span>
            {info.contact_phone && (
              <a
                href={whatsappUrl(info.contact_phone, `Olá! Tenho uma dúvida sobre ${info.title}.`)}
                target="_blank"
                rel="noreferrer noopener"
                className="h-8 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-medium flex items-center"
              >
                WhatsApp
              </a>
            )}
          </li>
        )}
      </ul>
    </Card>
  )

  let body: React.ReactNode
  if (result) {
    body = (
      <>
        <section className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm text-center space-y-3">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: `${accent}1a`, color: accent }}
          >
            <Check className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Inscrição feita!</h2>
          {result.message ? (
            <RichTextView text={result.message} className="text-left" linkColor={accent} />
          ) : (
            <p className="text-slate-600">
              {firstName}, sua inscrição em <strong>{info.title}</strong> ({dateLabel}) foi
              recebida.
            </p>
          )}
        </section>
        {amount > 0 && (
          <section className="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm space-y-3">
            <p className="text-center">
              <span className="block text-sm text-slate-600">Falta o pagamento de</span>
              <span className="block text-3xl font-extrabold text-slate-900">
                {formatBRL(amount)}
              </span>
              {result.coupon_code && (
                <span className="text-xs text-emerald-700">
                  com o cupom {result.coupon_code} (de {formatBRL(result.price || 0)})
                </span>
              )}
            </p>
            {pixCode && (
              <div className="text-center space-y-3">
                <PixQr payload={pixCode} className="mx-auto h-52 w-52" />
                <Button
                  onClick={copyPix}
                  className="h-12 w-full rounded-xl text-base text-white gap-2"
                  style={{ background: accent }}
                >
                  {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                  {copied ? 'Código copiado' : 'Copiar código Pix'}
                </Button>
                <p className="break-all text-left font-mono text-[11px] leading-snug text-slate-400">
                  {pixCode}
                </p>
                <p className="text-xs text-slate-500">
                  O Pix cai na conta da igreja ({info.pix!.name} · chave{' '}
                  {displayPixKey(info.pix!.key, info.pix!.key_type || undefined)}). A equipe
                  confirma o pagamento pelo extrato.
                </p>
              </div>
            )}
            {(result.payment_info || !pixCode) && (
              <p className="text-sm text-slate-700 whitespace-pre-line rounded-xl bg-amber-50 p-3">
                {result.payment_info || 'A equipe do evento vai passar as instruções de pagamento.'}
              </p>
            )}
          </section>
        )}
        {result.checkin_code && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm text-center space-y-2">
            <h2 className="font-bold text-slate-900">Seu comprovante</h2>
            <PixQr
              payload={checkinUrl(result.checkin_code)}
              label="QR do comprovante de inscrição"
              className="mx-auto h-44 w-44"
            />
            <p className="text-sm text-slate-600">
              Mostre este QR na entrada do evento. Tire um print desta tela para guardar.
            </p>
            <p className="font-mono text-xs text-slate-400">{result.checkin_code}</p>
          </section>
        )}
        {infoCard}
      </>
    )
  } else {
    body = (
      <>
        {desktopTitle}
        {info.description && (
          <Card icon={Info} title="Sobre" accent={accent}>
            <RichTextView text={info.description} linkColor={accent} />
          </Card>
        )}
        {infoCard}
        {!info.open ? (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center space-y-2 shadow-sm">
            {info.closed_reason === 'soon' ? (
              <CalendarDays className="h-12 w-12 mx-auto" style={{ color: accent }} />
            ) : (
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
            )}
            <p className="text-xl font-bold text-slate-900">
              {CLOSED_REASON_LABELS[(info.closed_reason || 'closed') as 'closed']}
            </p>
            <p className="text-sm text-slate-500">
              {info.closed_reason === 'soon'
                ? 'Fique de olho: em breve o formulário abre aqui.'
                : 'Fale com a equipe do evento se precisar.'}
            </p>
          </section>
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-900">
              {info.couple_only ? 'Inscrição do casal' : 'Faça sua inscrição'}
            </h2>
            {typeof info.spots_left === 'number' && info.spots_left <= 10 && (
              <p className="text-sm font-medium text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
                {info.spots_left === 1 ? 'Última vaga!' : `Restam ${info.spots_left} vagas`}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ev-name" className="text-sm font-semibold">
                {info.couple_only ? 'Seu nome completo' : 'Nome completo'}{' '}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ev-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-phone" className="text-sm font-semibold">
                Telefone / WhatsApp <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ev-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(81) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-email" className="text-sm font-semibold">
                E-mail
              </Label>
              <Input
                id="ev-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                maxLength={200}
              />
            </div>
            {info.couple_only && (
              <div className="grid sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-partner" className="text-sm font-semibold">
                    Nome do cônjuge <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="ev-partner"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    className={`${inputClass} bg-white`}
                    maxLength={200}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-partner-phone" className="text-sm font-semibold">
                    Telefone do cônjuge
                  </Label>
                  <Input
                    id="ev-partner-phone"
                    type="tel"
                    inputMode="tel"
                    value={partnerPhone}
                    onChange={(e) => setPartnerPhone(e.target.value)}
                    className={`${inputClass} bg-white`}
                    maxLength={40}
                  />
                </div>
              </div>
            )}
            {(info.questions || []).map((q) => (
              <div key={q.id} className="space-y-1.5">
                <Label htmlFor={`ev-q-${q.id}`} className="text-sm font-semibold">
                  {q.label} {q.required && <span className="text-red-500">*</span>}
                </Label>
                {q.kind === 'TEXT' ? (
                  <Input
                    id={`ev-q-${q.id}`}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    className={inputClass}
                    maxLength={500}
                  />
                ) : (
                  <div className="flex flex-wrap gap-2" role="radiogroup" id={`ev-q-${q.id}`}>
                    {(q.kind === 'YESNO' ? ['Sim', 'Não'] : q.options || []).map((opt) => {
                      const on = answers[q.id] === opt
                      return (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: on ? '' : opt }))}
                          className="h-10 min-w-12 px-4 rounded-xl border text-sm font-medium"
                          style={
                            on
                              ? { background: accent, borderColor: accent, color: '#fff' }
                              : { borderColor: '#e2e8f0', color: '#334155' }
                          }
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
            {info.has_coupons && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="ev-coupon"
                  className="text-sm font-semibold flex items-center gap-1.5"
                >
                  <Tag className="h-3.5 w-3.5" />
                  Cupom de desconto
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="ev-coupon"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value.toUpperCase())
                      setCoupon(null)
                      setCouponMsg('')
                    }}
                    className={`${inputClass} font-mono uppercase`}
                    maxLength={30}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={applyCoupon}
                    disabled={!couponInput.trim()}
                  >
                    Aplicar
                  </Button>
                </div>
                {coupon && (
                  <p className="text-sm text-emerald-700">
                    Cupom aplicado:{' '}
                    {coupon.amount > 0
                      ? `você paga ${formatBRL(coupon.amount)}`
                      : 'inscrição sem custo'}
                  </p>
                )}
                {couponMsg && <p className="text-sm text-red-600">{couponMsg}</p>}
              </div>
            )}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <input
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <Checkbox
                checked={consent}
                onCheckedChange={(c) => setConsent(c === true)}
                className="h-5 w-5 mt-0.5"
              />
              <span>
                Autorizo a {info.church_name} a usar estes dados para organizar o evento e falar
                comigo.
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
              className="w-full h-12 rounded-xl text-white text-base font-semibold gap-2 hover:opacity-90"
              style={{ background: accent }}
            >
              <Send className="h-4 w-4" />
              {sending ? 'Enviando...' : 'Quero me inscrever'}
            </Button>
          </form>
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Computador: a arte vira faixa lateral fixa */}
      <aside className="hidden lg:block lg:w-[38%] xl:w-[34%] shrink-0">
        <div className="sticky top-0 h-screen overflow-hidden" style={{ background: accent }}>
          {side && <img src={side} alt="" className="h-full w-full object-cover" />}
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        {header}
        <main className="max-w-xl mx-auto px-4 pb-10 pt-4 lg:pt-10 space-y-4 relative">
          {body}
          <footer className="pt-4 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} · {info.church_name}
          </footer>
        </main>
      </div>
    </div>
  )
}
