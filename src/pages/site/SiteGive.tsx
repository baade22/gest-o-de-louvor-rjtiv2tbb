// Contribuir: PIX da igreja (QR e "copia e cola", sem valor) e campanhas públicas do Financeiro.
// Nenhum valor, meta ou saldo aparece aqui.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Copy, Flag, ReceiptText } from 'lucide-react'
import { pixPayload, type PixKeyType } from '@/lib/pix'
import { PixQr, displayPixKey } from '@/pages/finance/PixQr'
import { useSite } from './siteContext'
import { Card, SectionTitle } from './siteParts'

export default function SiteGive() {
  const { site, to } = useSite()
  const [copied, setCopied] = useState<'code' | 'key' | ''>('')
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
    <div className="space-y-5 px-4 pt-5 lg:space-y-8 lg:px-8 lg:pt-10">
      <SectionTitle>Contribuir</SectionTitle>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {pix && payload ? (
          <Card className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-slate-500">Dízimos e ofertas · PIX</p>
            <PixQr payload={payload} className="h-48 w-48 rounded-xl border border-stone-200" />
            <div className="text-sm">
              <p>
                <b>Chave:</b> {displayPixKey(pix.key, (pix.key_type || undefined) as PixKeyType | undefined)}{' '}
                <button
                  type="button"
                  onClick={() => copy(pix.key, 'key')}
                  className="ml-1 font-semibold text-[var(--sa)]"
                >
                  {copied === 'key' ? 'copiada' : 'copiar'}
                </button>
              </p>
              <p className="text-slate-500">{pix.name}</p>
            </div>
            <button
              type="button"
              onClick={() => copy(payload, 'code')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sp)] px-4 py-3 font-semibold text-[var(--sp-text)]"
            >
              {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === 'code' ? 'Copiado! Cole no app do banco' : 'Copiar PIX copia e cola'}
            </button>
            <p className="text-xs text-slate-400">
              No app do banco, escolha PIX › Copia e cola e digite o valor.
            </p>
          </Card>
        ) : (
          <Card className="text-center text-slate-500">A chave PIX da igreja ainda não foi cadastrada.</Card>
        )}

        <div className="space-y-3">
          {site.campaigns.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Campanhas</p>
              {site.campaigns.map((c) => (
                <Link
                  key={c.id}
                  to={`/doar/${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--sa)_16%,white)] text-[var(--sp)]">
                    <Flag className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.name}</span>
                    {c.description && (
                      <span className="line-clamp-2 block text-[13px] text-slate-500">{c.description}</span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-xl border border-stone-200 px-3 py-1.5 text-sm font-semibold">
                    Ofertar <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </>
          )}
          <Card className="flex items-start gap-3 text-sm text-slate-600">
            <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sp)]" />
            <span>
              Quer o comprovante anual no seu nome para o imposto de renda? Fale com a tesouraria ou{' '}
              <Link to={to('/eu')} className="font-semibold text-[var(--sa)]">
                entre na sua conta
              </Link>
              .
            </span>
          </Card>
        </div>
      </div>
    </div>
  )
}
