// Pedido de oração e "Fale conosco": vai para a caixa da pastoral no LouvorFlow; nunca é publicado.

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendPrayer } from '@/services/site'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useSite } from './siteContext'
import { Card, SectionTitle } from './siteParts'

export default function SitePrayer() {
  const { slug } = useSite()
  const [kind, setKind] = useState<'ORACAO' | 'CONTATO'>('ORACAO')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [wants, setWants] = useState(false)
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const needContact = wants || kind === 'CONTATO'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (message.trim().length < 3) return setError('Escreva a sua mensagem.')
    if (needContact && contact.replace(/\D/g, '').length < 8 && !contact.includes('@'))
      return setError('Informe um WhatsApp ou e-mail para a resposta.')
    if (!consent) return setError('Marque a concordância com o uso dos dados.')
    setSending(true)
    try {
      await sendPrayer({
        slug: slug || undefined,
        kind,
        name,
        contact: needContact ? contact : '',
        wants_contact: needContact,
        message,
        consent,
        website,
      })
      setDone(true)
    } catch (err) {
      const status = (err as { status?: number }).status
      setError(
        status === 429
          ? 'Muitos envios seguidos. Tente de novo em alguns minutos.'
          : (err as { response?: { message?: string } }).response?.message ||
              'Não foi possível enviar agora. Tente de novo.',
      )
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <div className="px-4 pt-10 lg:px-8">
        <Card className="mx-auto max-w-lg space-y-3 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <p className="font-serif text-2xl font-bold">
            {kind === 'ORACAO' ? 'Pedido recebido' : 'Mensagem enviada'}
          </p>
          <p className="text-slate-600">
            {kind === 'ORACAO'
              ? 'A equipe pastoral vai orar por você.'
              : 'A secretaria da igreja vai responder assim que puder.'}
            {needContact ? ' Se pediu contato, falaremos com você em breve.' : ''}
          </p>
          <button
            type="button"
            onClick={() => {
              setDone(false)
              setMessage('')
            }}
            className="text-sm font-semibold text-[var(--sa)]"
          >
            Enviar outro
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 px-4 pt-5 lg:px-8 lg:pt-10">
      <SectionTitle>{kind === 'ORACAO' ? 'Pedido de oração' : 'Fale conosco'}</SectionTitle>
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['ORACAO', 'Pedido de oração'],
              ['CONTATO', 'Fale conosco'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm font-semibold',
                kind === k
                  ? 'border-[var(--sp)] bg-[var(--sp)] text-[var(--sp-text)]'
                  : 'border-stone-200 bg-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="rounded-xl border border-[color-mix(in_srgb,var(--sa)_40%,white)] bg-[color-mix(in_srgb,var(--sa)_12%,white)] px-4 py-3 text-sm text-slate-700">
          {kind === 'ORACAO'
            ? 'Seu pedido vai só para a equipe pastoral. Ele não aparece no site.'
            : 'Sua mensagem vai para a secretaria da igreja.'}
        </p>
        {/* Campo invisível contra robôs */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
          aria-hidden="true"
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-600">
            Seu nome {kind === 'ORACAO' && '(opcional)'}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Como podemos te chamar?"
            className="h-11 bg-white"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-600">
            {kind === 'ORACAO' ? 'Pelo que podemos orar?' : 'Sua mensagem'}
          </span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={3000}
            rows={6}
            placeholder="Escreva aqui…"
            className="bg-white text-base"
          />
        </label>
        {kind === 'ORACAO' && (
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-600">
              Quer que alguém entre em contato?
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setWants(v)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-semibold',
                    wants === v
                      ? 'border-[var(--sp)] bg-[var(--sp)] text-[var(--sp-text)]'
                      : 'border-stone-200 bg-white',
                  )}
                >
                  {v ? 'Sim, por favor' : 'Não precisa'}
                </button>
              ))}
            </div>
          </div>
        )}
        {needContact && (
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-600">WhatsApp ou e-mail</span>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={120}
              placeholder="(81) 9 0000-0000"
              className="h-11 bg-white"
            />
          </label>
        )}
        <label className="flex items-start gap-3 text-sm text-slate-600">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            className="mt-0.5"
          />
          <span>Concordo que a igreja use estes dados só para responder a este pedido (LGPD).</span>
        </label>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={sending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sa)] px-4 py-3.5 font-semibold text-[var(--sa-text)] disabled:opacity-60"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar
        </button>
      </form>
    </div>
  )
}
