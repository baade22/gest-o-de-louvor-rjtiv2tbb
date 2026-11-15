// Mensagem da equipe para os inscritos de um evento, pelo WhatsApp da igreja (fila do servidor,
// no mesmo ritmo dos outros envios). Cada um recebe com o próprio nome e valor preenchidos.

import React, { useMemo, useState } from 'react'
import type { ChurchEvent, EventRegistration } from '@/types'
import { EVENT_MESSAGE_TARGETS, inMessageTarget, type EventMessageTarget } from '@/lib/churchEvents'
import { normalizeWhatsAppPhone } from '@/lib/whatsapp'
import { sendEventWhatsApp } from '@/services/churchEvents'
import { MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { errorMessage } from './shared'

const VARS = ['{nome}', '{evento}', '{data}', '{local}', '{valor}', '{igreja}']

export function EventWhatsAppMessage({
  event,
  regs,
}: {
  event: ChurchEvent
  regs: EventRegistration[]
}) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [target, setTarget] = useState<EventMessageTarget>('TODOS')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => {
    const out = {} as Record<EventMessageTarget, number>
    for (const [t] of EVENT_MESSAGE_TARGETS) {
      out[t] = regs.filter(
        (r) => inMessageTarget(event, r, t) && normalizeWhatsAppPhone(r.phone),
      ).length
    }
    return out
  }, [event, regs])

  const send = () => {
    const n = counts[target]
    confirm({
      title: `Mandar para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}?`,
      description:
        'A mensagem entra na fila do WhatsApp da igreja e sai aos poucos, no ritmo seguro de envio.',
      confirmLabel: 'Mandar',
      onConfirm: async () => {
        setBusy(true)
        try {
          const res = await sendEventWhatsApp(event.id, text.trim(), target)
          toast({
            title: `${res.queued} ${res.queued === 1 ? 'mensagem na fila' : 'mensagens na fila'}`,
            description: res.no_phone
              ? `${res.no_phone} sem celular válido ficaram de fora.`
              : 'Acompanhe em Configurações > WhatsApp.',
          })
          setText('')
        } catch (err) {
          toast({
            title: 'Não foi possível mandar',
            description: errorMessage(err, 'Tente de novo.'),
            variant: 'destructive',
          })
        } finally {
          setBusy(false)
        }
      },
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
      {dialog}
      <div>
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          Mensagem para os inscritos
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Sai pelo WhatsApp da igreja. Mudança de data, horário ou local, cancelamento e lembrete na
          véspera já vão sozinhos.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_MESSAGE_TARGETS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTarget(t)}
            className={`h-8 px-3 rounded-lg border text-xs font-medium ${
              target === t
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {label} ({counts[t]})
          </button>
        ))}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={3000}
        placeholder="Olá, {nome}! Lembrando que o pagamento de {evento} ({valor}) vai até sexta."
      />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-slate-500 flex-1 min-w-0">
          Preenchidos para cada um: {VARS.join(' ')}. **negrito** e *itálico* funcionam.
        </p>
        <Button
          className="rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          disabled={busy || !text.trim() || counts[target] === 0}
          onClick={send}
        >
          <Send className="h-4 w-4" />
          Mandar
        </Button>
      </div>
    </div>
  )
}
