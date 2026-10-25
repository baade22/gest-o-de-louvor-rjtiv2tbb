// Recibo de uma contribuição com nome: folha para imprimir ou salvar em PDF e a mensagem pronta
// para mandar pelo WhatsApp ou e-mail de quem está na tesouraria. Nada sai do servidor.

import { useEffect, useRef, useState } from 'react'
import { Copy, Loader2, Mail, MessageCircle, Printer } from 'lucide-react'
import { formatCents } from '@/lib/money'
import { amountInWords } from '@/lib/memberGiving'
import { mailtoLink, receiptMessage, receiptNumber, whatsappLink } from '@/lib/receipt'
import { getFinSettings, listSigners } from '@/services/finance'
import type { FinSettings, FinSigner, FinTransaction } from '@/types/finance'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCnpj, formatCpf } from './AnnualStatementSheet'
import { printSheet } from './print'
import { PAYMENT_METHOD_LABELS, shortDate } from './shared'

export interface ReceiptData {
  tx: Pick<FinTransaction, 'id' | 'date' | 'amount_cents' | 'payment_method' | 'description'>
  person: { name: string; document?: string; phone?: string; email?: string }
  categoryName: string
  campaignName?: string
}

export function ReceiptSheet({
  data,
  churchName,
  settings,
  signers,
}: {
  data: ReceiptData
  churchName: string
  settings: FinSettings | null
  signers: FinSigner[]
}) {
  const church = settings?.legal_name || churchName
  const cnpj = formatCnpj(settings?.cnpj)
  const cpf = formatCpf(data.person.document)
  const what = data.campaignName ? `${data.categoryName} (${data.campaignName})` : data.categoryName
  const method = data.tx.payment_method ? PAYMENT_METHOD_LABELS[data.tx.payment_method] : ''
  return (
    <article className="mx-auto max-w-2xl bg-white text-[13px] leading-relaxed text-slate-900">
      <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold uppercase tracking-wide">{church}</h2>
          <p className="text-xs text-slate-600">
            {[cnpj && `CNPJ ${cnpj}`, settings?.address, settings?.city]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold">RECIBO</p>
          <p className="text-xs text-slate-600">nº {receiptNumber(data.tx)}</p>
        </div>
      </header>
      <p className="mt-4 text-right text-xl font-bold tabular-nums">
        {formatCents(data.tx.amount_cents)}
      </p>
      <p className="mt-4 text-justify">
        Recebemos de <b>{data.person.name}</b>
        {cpf && <>, CPF {cpf},</>} a importância de <b>{formatCents(data.tx.amount_cents)}</b> (
        {amountInWords(data.tx.amount_cents)}), referente a <b>{what}</b>, em{' '}
        {shortDate(data.tx.date, true)}
        {method && <>, por {method === 'PIX' ? method : method.toLowerCase()}</>}.
      </p>
      <p className="mt-3">Que Deus abençoe a sua fidelidade.</p>
      <p className="mt-6">
        {settings?.city ? `${settings.city}, ` : ''}
        {shortDate(data.tx.date, true)}.
      </p>
      {signers.length > 0 && (
        <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-10">
          {signers.slice(0, 2).map((s) => (
            <div key={s.id} className="border-t border-slate-800 pt-1.5 text-center">
              <p className="text-sm font-medium">{s.name}</p>
              {s.title && <p className="text-xs text-slate-500">{s.title}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="mt-8 text-right text-[10px] text-slate-400">Emitido pelo LouvorFlow</p>
    </article>
  )
}

export function ReceiptDialog({
  data,
  churchId,
  churchName,
  onOpenChange,
}: {
  data: ReceiptData | null
  churchId: string
  churchName: string
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [settings, setSettings] = useState<FinSettings | null>(null)
  const [signers, setSigners] = useState<FinSigner[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!data) return
    setLoading(true)
    Promise.all([getFinSettings(churchId).catch(() => null), listSigners(churchId).catch(() => [])])
      .then(([s, sg]) => {
        setSettings(s)
        setSigners(sg.filter((x) => x.is_active !== false))
      })
      .finally(() => setLoading(false))
  }, [data, churchId])

  if (!data) return null
  const number = receiptNumber(data.tx)
  const text = receiptMessage({
    personName: data.person.name,
    churchName: settings?.legal_name || churchName,
    number,
    categoryName: data.categoryName,
    campaignName: data.campaignName,
    amountCents: data.tx.amount_cents,
    date: data.tx.date,
  })
  const wa = whatsappLink(data.person.phone, text)
  const mail = mailtoLink(data.person.email, `Recibo nº ${number}`, text)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Mensagem copiada' })
    } catch {
      toast({ title: 'Não deu para copiar', variant: 'destructive' })
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recibo nº {number}</DialogTitle>
          <DialogDescription>
            Imprima ou salve em PDF. A mensagem vai pelo seu WhatsApp ou e-mail; anexe o PDF se
            quiser.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 p-5">
            <div ref={sheetRef}>
              <ReceiptSheet
                data={data}
                churchName={churchName}
                settings={settings}
                signers={signers}
              />
            </div>
          </div>
        )}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-700">
          {text}
        </div>
        {!wa && !mail && (
          <p className="text-xs text-slate-500">
            {data.person.name} não tem telefone com DDD nem e-mail no cadastro. Copie a mensagem ou
            entregue o recibo impresso.
          </p>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" className="h-9" onClick={copy}>
            <Copy className="h-4 w-4" /> Copiar mensagem
          </Button>
          {mail && (
            <Button variant="outline" className="h-9" asChild>
              <a href={mail}>
                <Mail className="h-4 w-4" /> E-mail
              </a>
            </Button>
          )}
          {wa && (
            <Button variant="outline" className="h-9" asChild>
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          <Button
            className="h-9 bg-teal-700 hover:bg-teal-800"
            disabled={loading}
            onClick={() =>
              sheetRef.current &&
              printSheet(sheetRef.current, `Recibo ${number} - ${data.person.name}`)
            }
          >
            <Printer className="h-4 w-4" /> Imprimir ou PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Dá para emitir recibo: entrada confirmada com nome de uma pessoa. */
export const canIssueReceipt = (
  tx: Pick<FinTransaction, 'type' | 'status' | 'person_id' | 'is_anonymous'>,
) => tx.type === 'ENTRADA' && tx.status !== 'ESTORNADO' && !!tx.person_id && !tx.is_anonymous
