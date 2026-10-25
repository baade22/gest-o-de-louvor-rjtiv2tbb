// Página pública de doação de uma campanha (sem login): meta, quanto já entrou e o QR do PIX
// da igreja com o valor escolhido. Os dados vêm do hook finance_public.js.

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Copy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import { pixPayload, type PixKeyType } from '@/lib/pix'
import { getPublicCampaign } from '@/services/finance'
import type { FinCampaignColor, PublicCampaign as Campaign } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PixQr, displayPixKey } from '@/pages/finance/PixQr'

const HEADERS: Record<FinCampaignColor, string> = {
  TEAL: 'from-teal-700 to-teal-900',
  INDIGO: 'from-indigo-600 to-violet-700',
  ORANGE: 'from-orange-600 to-orange-800',
  ROSE: 'from-rose-600 to-rose-800',
  SKY: 'from-sky-600 to-sky-800',
  AMBER: 'from-amber-600 to-amber-800',
}

const PRESETS = [5000, 10000, 20000]

export default function PublicCampaign() {
  const { id = '' } = useParams()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [error, setError] = useState(false)
  const [amount, setAmount] = useState<number>(10000)
  const [other, setOther] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getPublicCampaign(id)
      .then((c) => {
        setCampaign(c)
        document.title = `${c.name} · ${c.church_name}`
      })
      .catch(() => setError(true))
  }, [id])

  const chosen = other.trim() ? parseMoneyToCents(other) : amount
  const valid = chosen !== null && chosen >= 100 && chosen <= 100000000
  const payload = useMemo(() => {
    if (!campaign?.pix || !valid) return ''
    return pixPayload({
      key: campaign.pix.key,
      keyType: (campaign.pix.key_type || undefined) as PixKeyType | undefined,
      name: campaign.pix.name,
      city: campaign.pix.city,
      amountCents: chosen!,
      txid: `C${campaign.id}`,
      message: campaign.name,
    })
  }, [campaign, chosen, valid])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* o código continua visível para copiar à mão */
    }
  }

  if (error)
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-6 text-center">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Campanha não encontrada</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ela pode ter sido encerrada. Fale com a tesouraria da igreja.
          </p>
        </div>
      </main>
    )

  if (!campaign)
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Carregando" />
      </main>
    )

  const pct = campaign.goal_cents
    ? Math.min(100, (campaign.raised_cents / campaign.goal_cents) * 100)
    : null
  const header = HEADERS[(campaign.color || 'TEAL') as FinCampaignColor] || HEADERS.TEAL

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <section
          className={cn('rounded-2xl bg-gradient-to-br px-5 py-6 text-center text-white', header)}
        >
          <p className="text-sm text-white/80">{campaign.church_name}</p>
          <h1 className="mt-1 text-2xl font-bold">{campaign.name}</h1>
          {pct !== null && (
            <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="mt-3 text-sm text-white/90">
            {formatCents(campaign.raised_cents)}
            {campaign.goal_cents ? ` de ${formatCents(campaign.goal_cents)}` : ' arrecadados'}
            {campaign.participants > 0 &&
              ` · ${campaign.participants} ${campaign.participants === 1 ? 'contribuição' : 'contribuições'}`}
          </p>
          {campaign.description && (
            <p className="mt-3 text-sm text-white/80">{campaign.description}</p>
          )}
        </section>

        {!campaign.pix ? (
          <p className="rounded-2xl bg-white px-5 py-6 text-center text-sm text-slate-600 shadow-sm">
            A igreja ainda não cadastrou a chave PIX. Fale com a tesouraria para contribuir.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Valor">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!other.trim() && amount === v}
                  onClick={() => {
                    setAmount(v)
                    setOther('')
                  }}
                  className={cn(
                    'h-12 rounded-xl border bg-white text-base font-bold text-slate-900',
                    !other.trim() && amount === v
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200',
                  )}
                >
                  {formatCents(v).replace(',00', '')}
                </button>
              ))}
            </div>
            <Input
              inputMode="decimal"
              placeholder="Outro valor (R$)"
              aria-label="Outro valor"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="h-12 rounded-xl bg-white text-base"
            />

            <section className="rounded-2xl bg-white px-5 py-6 text-center shadow-sm">
              {valid ? (
                <>
                  <h2 className="font-bold text-slate-900">PIX de {formatCents(chosen!)}</h2>
                  <PixQr payload={payload} className="mx-auto mt-4 h-56 w-56" />
                  <Button
                    onClick={copy}
                    className="mt-4 h-12 w-full rounded-xl bg-teal-700 text-base hover:bg-teal-800"
                  >
                    {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    {copied ? 'Código copiado' : 'Copiar código PIX'}
                  </Button>
                  <p className="mt-3 break-all text-left font-mono text-[11px] leading-snug text-slate-400">
                    {payload}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-600">Digite um valor a partir de R$ 1,00.</p>
              )}
            </section>

            <p className="px-2 text-center text-xs leading-relaxed text-slate-500">
              O PIX cai direto na conta da igreja ({campaign.pix.name} · chave{' '}
              {displayPixKey(campaign.pix.key, campaign.pix.key_type || undefined)}). Para receber o
              recibo no seu nome, faça o PIX da sua conta pessoal: a tesouraria identifica pelo
              extrato.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
