// Pedido de oração e "Fale conosco": vai para a caixa da pastoral no LouvorFlow; nunca é publicado.

import { useState } from 'react'
import { CheckCircle2, Loader2, Lock, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendPrayer } from '@/services/site'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useSite } from './siteContext'
import { Card } from './siteParts'

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
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#ddf0e4] text-[#2d7a4b]">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <p className="text-2xl font-extrabold tracking-tight">
            {kind === 'ORACAO' ? 'Pedido recebido' : 'Mensagem enviada'}
          </p>
          <p className="font-medium text-[var(--c-gray)]">
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
            className="text-sm font-bold text-[var(--c-blue)]"
          >
            Enviar outro
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="lg:px-8 lg:pt-10">
      <div className="-mt-px rounded-b-[30px] bg-[var(--c-navy)] px-5 pb-8 pt-3 text-[var(--sp-text)] lg:mx-auto lg:max-w-xl lg:rounded-[30px] lg:p-8">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
          {kind === 'ORACAO' ? 'Podemos orar por você?' : 'Fale conosco'}
        </h1>
        <p className="mt-2 text-[14px] font-medium leading-relaxed opacity-80">
          {kind === 'ORACAO'
            ? 'Seu pedido vai só para a equipe pastoral e nunca é publicado.'
            : 'Sua mensagem vai para a secretaria da igreja.'}
        </p>
      </div>
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-4 px-4 pt-5 lg:px-0">
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
                'rounded-full px-3 py-3 text-[13.5px] font-bold',
                kind === k
                  ? 'bg-[var(--c-navy)] text-[var(--sp-text)]'
                  : 'bg-white text-[var(--c-gray)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
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
          <span className="ml-1 text-[13.5px] font-bold">
            Seu nome {kind === 'ORACAO' && '(opcional)'}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Como podemos te chamar?"
            className="h-[52px] rounded-[18px] border-[var(--c-line)] bg-white px-4 text-base"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="ml-1 text-[13.5px] font-bold">
            {kind === 'ORACAO' ? 'Pelo que podemos orar?' : 'Sua mensagem'}
          </span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={3000}
            rows={6}
            placeholder="Escreva aqui…"
            className="rounded-[18px] border-[var(--c-line)] bg-white px-4 py-3.5 text-base"
          />
        </label>
        {kind === 'ORACAO' && (
          <div className="space-y-1.5">
            <span className="ml-1 text-[13.5px] font-bold">Quer que alguém entre em contato?</span>
            <div className="grid grid-cols-2 gap-2">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setWants(v)}
                  className={cn(
                    'rounded-full px-3 py-3 text-[13.5px] font-bold',
                    wants === v
                      ? 'bg-[var(--c-navy)] text-[var(--sp-text)]'
                      : 'bg-white text-[var(--c-gray)]',
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
            <span className="ml-1 text-[13.5px] font-bold">WhatsApp ou e-mail</span>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={120}
              placeholder="(81) 9 0000-0000"
              className="h-[52px] rounded-[18px] border-[var(--c-line)] bg-white px-4 text-base"
            />
          </label>
        )}
        <label className="flex items-start gap-3 px-1 text-[13.5px] font-medium text-[var(--c-gray)]">
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
          className="inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] px-4 text-[15px] font-extrabold text-[var(--sp-text)] disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {kind === 'ORACAO' ? 'Enviar pedido' : 'Enviar mensagem'}
        </button>
        {kind === 'ORACAO' && (
          <p className="flex items-center justify-center gap-2 text-[12.5px] font-medium text-[var(--c-gray)]">
            <Lock className="h-3.5 w-3.5" /> Em sigilo, só a pastoral lê
          </p>
        )}
      </form>
    </div>
  )
}
