// Contribuir logado (etapa 2 da área do membro): a pessoa escolhe o tipo (dízimo, oferta ou
// campanha pública) e o valor, e o Pix já sai com o valor. A contribuição entra no nome dela
// quando a tesouraria concilia o extrato e o CPF de quem pagou é o da ficha
// (pocketbase/hooks/finance_payers.js). Nada de "previsto": o histórico só mostra o conciliado.

import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronLeft, Copy, Lock, QrCode, ReceiptText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { pixPayload, type PixKeyType } from '@/lib/pix'
import { centsFromTyping, giveMessage, giveTxid, giveTypes } from '@/lib/memberArea'
import { PixQr } from '@/pages/finance/PixQr'
import { useSite } from '../siteContext'
import type { MemberMe } from '@/services/member'
import { Avatar, IconCircle } from './memberParts'

const QUICK = [5000, 10000, 20000]

export default function MemberGive({ me, onAnonymous }: { me: MemberMe; onAnonymous: () => void }) {
  const { site, to } = useSite()
  const types = useMemo(() => giveTypes(site.campaigns), [site.campaigns])
  const [typeId, setTypeId] = useState('DIZIMO')
  const [cents, setCents] = useState(0)
  const [step, setStep] = useState<'form' | 'pix'>('form')
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pix = site.pix
  const p = me.profile
  const type = types.find((t) => t.id === typeId) || types[0]

  const payload = useMemo(() => {
    if (!pix || cents <= 0) return ''
    try {
      return pixPayload({
        key: pix.key,
        keyType: (pix.key_type || undefined) as PixKeyType | undefined,
        name: pix.name,
        city: pix.city,
        amountCents: cents,
        txid: giveTxid(type.id),
        message: giveMessage(type.label, p.name),
      })
    } catch (_) {
      return ''
    }
  }, [pix, cents, type, p.name])

  if (!pix) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 pt-2 lg:pt-10">
        <h1 className="text-[28px] font-extrabold tracking-tight">Contribuir</h1>
        <div className="c-card p-5 text-center font-medium text-[var(--c-gray)]">
          A chave Pix da igreja ainda não foi cadastrada.
        </div>
      </div>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload)
    } catch (_) {
      const ta = document.createElement('textarea')
      ta.value = payload
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (step === 'pix' && payload) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 pt-2 lg:pt-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Voltar"
            onClick={() => setStep('form')}
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(20,34,58,0.06)]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[24px] font-extrabold tracking-tight">
            {type.id === 'DIZIMO'
              ? 'Pix do dízimo'
              : type.id === 'OFERTA'
                ? 'Pix da oferta'
                : `Pix: ${type.label}`}
          </h1>
        </div>
        <div className="pt-2 text-center">
          <p className="text-[12.5px] font-bold text-[var(--c-gray)]">
            {type.label} · {p.name}
          </p>
          <p className="text-[34px] font-extrabold tracking-tight">{formatCents(cents)}</p>
        </div>
        <div className="mx-auto grid w-fit place-items-center rounded-3xl bg-white p-4 shadow-[0_2px_12px_rgba(20,34,58,0.06)]">
          <PixQr payload={payload} className="h-48 w-48" />
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] text-[15px] font-extrabold text-[var(--sp-text)]"
        >
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          {copied ? 'Copiado! Cole no app do banco' : 'Copiar Pix copia e cola'}
        </button>
        <p className="text-center text-[12.5px] font-medium text-[var(--c-gray)]">
          Abra o app do seu banco › Pix › Pagar com copia e cola
        </p>
        <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--c-sky)] px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[var(--c-navy)]">
          <Check className="mt-px h-[18px] w-[18px] shrink-0" />
          <span>
            Depois que o banco confirmar, a tesouraria confere no extrato e a contribuição aparece
            em{' '}
            <Link to={to('/eu/contribuicoes')} className="font-extrabold underline">
              Minhas contribuições
            </Link>
            . Pode levar alguns dias.
          </span>
        </div>
        <p className="px-2 text-center text-[12px] font-medium text-[var(--c-gray)]">
          Para entrar no seu nome sozinho, pague de uma conta no seu CPF.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-3 px-4 pt-2 lg:pt-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-extrabold leading-none tracking-tight">Contribuir</h1>
        <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white text-[var(--c-gray)]">
          <Lock className="h-[18px] w-[18px]" />
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Tipo"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pt-2 [scrollbar-width:none]"
      >
        <div className="flex min-w-full gap-1 rounded-full bg-[#e6eaf0] p-1">
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === typeId}
              onClick={() => setTypeId(t.id)}
              className={cn(
                'h-10 flex-1 whitespace-nowrap rounded-full px-4 text-[14px] font-bold transition',
                t.id === typeId
                  ? 'bg-white text-[var(--c-navy)] shadow-[0_2px_6px_rgba(20,34,58,0.1)]'
                  : 'text-[var(--c-gray)]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 text-center">
        <label htmlFor="give-amount" className="text-[12.5px] font-bold text-[var(--c-gray)]">
          Valor
        </label>
        <input
          id="give-amount"
          ref={inputRef}
          inputMode="numeric"
          value={formatCents(cents)}
          onChange={(e) => setCents(centsFromTyping(e.target.value))}
          className="block w-full bg-transparent text-center text-[40px] font-extrabold tracking-tight outline-none"
        />
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {QUICK.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCents(v)}
              className={cn(
                'h-9 rounded-full border-[1.5px] px-3.5 text-[13.5px] font-bold',
                cents === v
                  ? 'border-[var(--c-navy)] bg-[var(--c-navy)] text-[var(--sp-text)]'
                  : 'border-[var(--c-line)] bg-white',
              )}
            >
              {formatCents(v).replace(',00', '')}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCents(0)
              inputRef.current?.focus()
            }}
            className="h-9 rounded-full border-[1.5px] border-[var(--c-line)] bg-white px-3.5 text-[13.5px] font-bold"
          >
            Outro
          </button>
        </div>
      </div>

      <div className="c-card flex items-center gap-3.5 p-4">
        <Avatar name={p.name} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-bold">Em nome de {p.name}</b>
          <span className="block text-[12.5px] font-medium leading-snug text-[var(--c-gray)]">
            Vai para o seu histórico e o informe anual
          </span>
        </span>
      </div>

      {!p.has_document && (
        <Link
          to={to('/eu/dados')}
          className="flex items-start gap-2.5 rounded-2xl bg-[#fcf3e1] px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[#6b4a12]"
        >
          <AlertTriangle className="mt-px h-[18px] w-[18px] shrink-0" />
          <span>
            Sua ficha ainda não tem CPF. Sem ele a tesouraria não sabe que o Pix é seu.{' '}
            <b className="underline">Cadastrar CPF</b>
          </span>
        </Link>
      )}

      <button
        type="button"
        disabled={!payload}
        onClick={() => setStep('pix')}
        className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] text-[15px] font-extrabold text-[var(--sp-text)] disabled:opacity-50"
      >
        <QrCode className="h-5 w-5" />
        {cents > 0 ? `Gerar Pix de ${formatCents(cents)}` : 'Digite o valor'}
      </button>

      <div className="c-card divide-y divide-[#eef1f5] py-1">
        <Link to={to('/eu/contribuicoes')} className="flex items-center gap-3.5 px-4 py-3">
          <IconCircle icon={ReceiptText} />
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] font-bold">Minhas contribuições</b>
            <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
              Histórico e informe para o imposto de renda
            </span>
          </span>
        </Link>
      </div>

      <p className="px-2 pt-1 text-center text-[12.5px] font-medium text-[var(--c-gray)]">
        Prefere anônimo?{' '}
        <button type="button" onClick={onAnonymous} className="font-extrabold text-[var(--c-blue)]">
          Use a chave Pix sem identificação
        </button>
      </p>
    </div>
  )
}
