// Contribuir: PIX da igreja (QR e "copia e cola", sem valor) e campanhas públicas do Financeiro.
// Nenhum valor, meta ou saldo aparece aqui. Quem entrou no app vê o Contribuir identificado
// (member/MemberGive.tsx), com tipo e valor; o anônimo continua a um toque.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Copy, Flag, Lock, QrCode, ReceiptText } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { pixPayload, type PixKeyType } from '@/lib/pix'
import { PixQr, displayPixKey } from '@/pages/finance/PixQr'
import { useSite } from './siteContext'
import { Card, PageTitle } from './siteParts'
import MemberGive from './member/MemberGive'
import { Spinner, useMemberMe } from './member/memberParts'

export default function SiteGive() {
  const [anonymous, setAnonymous] = useState(!pb.authStore.isValid)
  if (anonymous) return <AnonymousGive />
  return <LoggedGive onAnonymous={() => setAnonymous(true)} />
}

function LoggedGive({ onAnonymous }: { onAnonymous: () => void }) {
  const { me, loading } = useMemberMe(false)
  if (loading) return <Spinner />
  // Sem ficha nesta igreja (ou sem sessão): o Contribuir de sempre
  if (!me) return <AnonymousGive />
  return <MemberGive me={me} onAnonymous={onAnonymous} />
}

function AnonymousGive() {
  const { site, to } = useSite()
  const [copied, setCopied] = useState<'code' | 'key' | ''>('')
  const [showQr, setShowQr] = useState(false)
  const pix = site.pix
  const payload = useMemo(() => {
    if (!pix) return ''
    try {
      return pixPayload({
        key: pix.key,
        keyType: (pix.key_type || undefined) as PixKeyType | undefined,
        name: pix.name,
        city: pix.city,
        txid: 'SITE',
        message: 'Dizimos e ofertas',
      })
    } catch (_) {
      return ''
    }
  }, [pix])

  const copy = async (text: string, what: 'code' | 'key') => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (_) {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(what)
    setTimeout(() => setCopied(''), 2500)
  }

  return (
    <div className="space-y-5 px-4 pt-2 lg:space-y-8 lg:px-8 lg:pt-10">
      <PageTitle
        action={
          <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white text-[var(--c-gray)]">
            <Lock className="h-[18px] w-[18px]" />
          </span>
        }
      >
        Contribuir
      </PageTitle>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {pix && payload ? (
          <div className="space-y-3">
            <div className="rounded-3xl bg-[var(--c-navy)] p-[18px] text-[var(--sp-text)] lg:p-7">
              <p className="text-[12px] font-bold opacity-75">Dízimos e ofertas · chave Pix</p>
              <p className="mt-2 break-all text-[22px] font-extrabold leading-tight tracking-wide">
                {displayPixKey(pix.key, (pix.key_type || undefined) as PixKeyType | undefined)}
              </p>
              <p className="text-[13px] font-semibold opacity-75">{pix.name}</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => copy(pix.key, 'key')}
                  className="inline-flex h-[46px] flex-1 items-center justify-center gap-2 rounded-full bg-white text-[13.5px] font-extrabold text-[var(--c-navy)]"
                >
                  {copied === 'key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === 'key' ? 'Chave copiada' : 'Copiar chave'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className="inline-flex h-[46px] flex-1 items-center justify-center gap-2 rounded-full bg-white/15 text-[13.5px] font-extrabold"
                >
                  <QrCode className="h-4 w-4" /> QR Code
                </button>
              </div>
              {showQr && (
                <div className="mt-4 grid place-items-center rounded-2xl bg-white p-4">
                  <PixQr payload={payload} className="h-48 w-48" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => copy(payload, 'code')}
              className="c-card inline-flex w-full items-center justify-center gap-2 px-4 py-3.5 text-[14px] font-bold text-[var(--c-navy)]"
            >
              {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === 'code' ? 'Copiado! Cole no app do banco' : 'Copiar Pix copia e cola'}
            </button>
            <p className="text-center text-xs font-medium text-[var(--c-gray)]">
              No app do banco, escolha Pix › Copia e cola e digite o valor.
            </p>
          </div>
        ) : (
          <Card className="text-center font-medium text-[var(--c-gray)]">
            A chave Pix da igreja ainda não foi cadastrada.
          </Card>
        )}
        <div className="space-y-3">
          {site.campaigns.length > 0 && (
            <>
              <h2 className="text-[18px] font-extrabold tracking-tight">Campanhas</h2>
              {site.campaigns.map((c) => (
                <Link
                  key={c.id}
                  to={`/doar/${c.id}`}
                  className="c-card flex items-center gap-3 p-4"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--c-sky)] text-[var(--c-blue)]">
                    <Flag className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">{c.name}</span>
                    {c.description && (
                      <span className="line-clamp-2 block text-[12.5px] font-medium text-[var(--c-gray)]">
                        {c.description}
                      </span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--c-navy)] px-3.5 py-2 text-[13px] font-bold text-[var(--sp-text)]">
                    Ofertar <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </>
          )}
          <Card className="flex items-start gap-3 text-[13.5px] font-medium text-[var(--c-gray)]">
            <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--c-blue)]" />
            <span>
              Quer o comprovante anual no seu nome para o imposto de renda? Fale com a tesouraria ou{' '}
              <Link to={to('/eu')} className="font-bold text-[var(--c-blue)]">
                entre na sua conta
              </Link>
              .
            </span>
          </Card>
          <p className="flex items-center justify-center gap-2 text-[12.5px] font-medium text-[var(--c-gray)]">
            <Lock className="h-3.5 w-3.5" /> O Pix cai direto na conta da igreja
          </p>
        </div>
      </div>
    </div>
  )
}
