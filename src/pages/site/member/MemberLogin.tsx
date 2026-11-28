// Entrar na área do membro: celular da ficha + código pelo WhatsApp da igreja (sem senha).

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  MessageCircle,
  Music,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { formatPhoneInput, isValidPhone } from '@/lib/memberArea'
import { whatsappUrl } from '@/lib/site'
import {
  memberError,
  requestMemberCode,
  verifyMemberCode,
  type MemberCodeResult,
} from '@/services/member'
import { useSite } from '../siteContext'
import { Avatar, RowLink } from './memberParts'

type Step = 'contact' | 'code' | 'choose' | 'notfound' | 'team'

const inputCls =
  'h-[52px] w-full rounded-2xl border-[1.5px] border-[var(--c-line)] bg-white px-4 text-[16px] font-semibold outline-none focus:border-[var(--c-blue)] focus:shadow-[0_0_0_4px_var(--c-sky)]'
const btnCls =
  'inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-extrabold disabled:opacity-60'

export default function MemberLogin({ onLogged }: { onLogged: () => void }) {
  const { site, slug, to } = useSite()
  const [step, setStep] = useState<Step>('contact')
  const [byEmail, setByEmail] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<MemberCodeResult | null>(null)
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const contact = byEmail ? { email: email.trim() } : { phone }
  const churchName = site.short_name || site.title

  const sendCode = async () => {
    setError('')
    if (byEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) : !isValidPhone(phone)) {
      setError(byEmail ? 'Confira o e-mail.' : 'Digite o celular com DDD.')
      return
    }
    setBusy(true)
    try {
      const res = await requestMemberCode(slug, contact)
      setSent(res)
      setCode('')
      setStep('code')
      setWait(45)
      setTimeout(() => codeRef.current?.focus(), 50)
    } catch (err) {
      const e = memberError(err)
      if (e.team) setStep('team')
      else if (e.found === false) setStep('notfound')
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (personId?: string) => {
    setError('')
    if (code.replace(/\D/g, '').length !== 6) {
      setError('Digite os 6 números do código.')
      return
    }
    setBusy(true)
    try {
      const res = await verifyMemberCode(slug, contact, code, personId)
      if (res.choose) {
        setChoices(res.choose)
        setStep('choose')
      } else onLogged()
    } catch (err) {
      const e = memberError(err)
      if (e.team) setStep('team')
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const back = () => {
    setStep('contact')
    setError('')
  }

  const BackBtn = () => (
    <button
      type="button"
      onClick={back}
      aria-label="Voltar"
      className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(20,34,58,0.06)]"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  )

  const Badge = ({
    icon: Icon,
    tone,
  }: {
    icon: typeof Search
    tone: 'green' | 'amber' | 'blue'
  }) => (
    <span
      className={
        'grid h-16 w-16 place-items-center rounded-[20px] ' +
        (tone === 'green'
          ? 'bg-[#ddf3e8] text-[#1fa855]'
          : tone === 'amber'
            ? 'bg-[#fcf3e1] text-[#b7791f]'
            : 'bg-[var(--c-sky)] text-[var(--c-blue)]')
      }
    >
      <Icon className="h-8 w-8" />
    </span>
  )

  const ErrorText = () =>
    error ? (
      <p className="mt-3 text-center text-[13.5px] font-bold text-[#c0392b]" role="alert">
        {error}
      </p>
    ) : null

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pt-2 lg:pt-10">
      {step === 'contact' && (
        <>
          <h1 className="text-[28px] font-extrabold leading-none tracking-tight">Área do membro</h1>
          <p className="text-[14.5px] font-medium text-[var(--c-gray)]">
            Seu cadastro, sua família e a carteirinha da igreja. Use o{' '}
            {byEmail ? 'e-mail' : 'celular'} que está na sua ficha.
          </p>
          <form
            className="c-card space-y-3 p-4"
            onSubmit={(ev) => {
              ev.preventDefault()
              sendCode()
            }}
          >
            {byEmail ? (
              <label className="block">
                <span className="mx-1 mb-2 block text-[12.5px] font-bold text-[var(--c-gray)]">
                  Seu e-mail
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  className={inputCls}
                  placeholder="voce@exemplo.com"
                />
              </label>
            ) : (
              <label className="block">
                <span className="mx-1 mb-2 block text-[12.5px] font-bold text-[var(--c-gray)]">
                  Seu celular
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(ev) => setPhone(formatPhoneInput(ev.target.value))}
                  className={inputCls}
                  placeholder="(81) 99999-9999"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={busy}
              className={
                btnCls +
                (byEmail ? ' bg-[var(--c-navy)] text-[var(--sp-text)]' : ' bg-[#1fa855] text-white')
              }
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : byEmail ? (
                <Mail className="h-5 w-5" />
              ) : (
                <MessageCircle className="h-5 w-5" />
              )}
              {byEmail ? 'Receber código por e-mail' : 'Receber código no WhatsApp'}
            </button>
            <ErrorText />
            <p className="text-center text-[12.5px] font-medium text-[var(--c-gray)]">
              {byEmail ? 'Prefere o celular? ' : 'Sem WhatsApp? '}
              <button
                type="button"
                onClick={() => {
                  setByEmail((v) => !v)
                  setError('')
                }}
                className="font-extrabold text-[var(--c-blue)]"
              >
                {byEmail ? 'Usar o celular' : 'Receber por e-mail'}
              </button>
            </p>
          </form>
          <div className="c-card py-1">
            <RowLink
              to="/login"
              icon={Music}
              title="Sou da equipe"
              hint="Escalas, repertório e gestão no LouvorFlow"
            />
          </div>
        </>
      )}

      {step === 'code' && (
        <>
          <BackBtn />
          <Badge icon={sent?.channel === 'EMAIL' ? Mail : MessageCircle} tone="green" />
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">
            Digite o código
          </h1>
          <p className="text-[14.5px] font-medium text-[var(--c-gray)]">
            Mandamos 6 números {sent?.channel === 'EMAIL' ? 'por e-mail' : 'pelo WhatsApp'} da{' '}
            <b className="text-[var(--c-ink)]">{churchName}</b>
            {sent?.sent_to ? ` para ${sent.sent_to}` : ''}.
          </p>
          <form
            onSubmit={(ev) => {
              ev.preventDefault()
              verify()
            }}
            className="space-y-3"
          >
            <input
              ref={codeRef}
              value={code}
              onChange={(ev) => {
                const v = ev.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(v)
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Código de 6 números"
              placeholder="000000"
              className={inputCls + ' h-[60px] text-center text-[28px] tracking-[0.5em]'}
            />
            <button
              type="submit"
              disabled={busy}
              className={btnCls + ' bg-[var(--c-navy)] text-[var(--sp-text)]'}
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              Entrar
            </button>
            <ErrorText />
            <p className="text-center text-[13px] font-medium text-[var(--c-gray)]">
              {wait > 0 ? (
                `Reenviar em 0:${String(wait).padStart(2, '0')}`
              ) : (
                <button
                  type="button"
                  onClick={sendCode}
                  className="font-extrabold text-[var(--c-blue)]"
                >
                  Mandar outro código
                </button>
              )}
            </p>
          </form>
          <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--c-sky)] px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[var(--c-navy)]">
            <ShieldCheck className="mt-px h-[18px] w-[18px] shrink-0" />
            O código vale 10 minutos e só funciona uma vez. Ninguém da igreja pede esse código.
          </div>
        </>
      )}

      {step === 'choose' && (
        <>
          <BackBtn />
          <Badge icon={UserRound} tone="blue" />
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">Quem é você?</h1>
          <p className="text-[14.5px] font-medium text-[var(--c-gray)]">
            Este contato está em mais de uma ficha da família. Escolha a sua.
          </p>
          <div className="c-card divide-y divide-[#eef1f5] py-1">
            {choices.map((c, i) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => verify(c.id)}
                className="flex w-full items-center gap-3.5 px-4 py-3 text-left"
              >
                <Avatar name={c.name} tone={i} />
                <span className="flex-1 text-[15px] font-bold">{c.name}</span>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--c-gray)]" />
                ) : (
                  <ChevronRight className="h-[18px] w-[18px] text-[#b3bbc7]" />
                )}
              </button>
            ))}
          </div>
          <ErrorText />
        </>
      )}

      {step === 'notfound' && (
        <>
          <BackBtn />
          <Badge icon={Search} tone="amber" />
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">
            Não achamos {byEmail ? 'esse e-mail' : 'esse celular'}
          </h1>
          <p className="text-[14.5px] font-medium text-[var(--c-gray)]">
            {byEmail ? email : phone} não está em nenhum cadastro da igreja. Pode ser um contato
            antigo.
          </p>
          <div className="c-card divide-y divide-[#eef1f5] py-1">
            {site.signup_url && (
              <RowLink
                to={site.signup_url}
                icon={Sparkles}
                title="Fazer meu cadastro"
                hint="Vai para a secretaria aprovar. Depois é só entrar."
              />
            )}
            {site.whatsapp && (
              <RowLink
                href={whatsappUrl(
                  site.whatsapp,
                  'Olá! Quero atualizar o contato da minha ficha para entrar no app da igreja.',
                )}
                icon={MessageCircle}
                title="Falar com a secretaria"
                hint="Para atualizar o contato da sua ficha"
              />
            )}
            <RowLink
              onClick={() => {
                setByEmail((v) => !v)
                back()
              }}
              icon={byEmail ? Smartphone : Mail}
              title={byEmail ? 'Tentar pelo celular' : 'Tentar pelo e-mail'}
              hint="Ou digite de novo"
            />
          </div>
        </>
      )}

      {step === 'team' && (
        <>
          <BackBtn />
          <Badge icon={Music} tone="blue" />
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">
            Você é da equipe
          </h1>
          <p className="text-[14.5px] font-medium text-[var(--c-gray)]">
            Sua ficha já tem acesso ao LouvorFlow, que é protegido por senha. Entre com o seu e-mail
            e senha: depois a área do membro abre do mesmo jeito.
          </p>
          <Link
            to="/login"
            state={{ from: { pathname: to('/eu').split('?')[0] } }}
            className={btnCls + ' bg-[var(--c-navy)] text-[var(--sp-text)]'}
          >
            Entrar com e-mail e senha
          </Link>
        </>
      )}
    </div>
  )
}
