// Check-in pelo QR do comprovante: a equipe aponta a câmera do celular para o QR, o celular
// abre /checkin/{código} e aqui marca a entrada (e a saída) da inscrição.

import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRegistrationByCode, updateRegistration } from '@/services/churchEvents'
import type { ChurchEvent, EventRegistration } from '@/types'
import { eventDateLabel, formatBRL, isFree, registrationDue } from '@/lib/churchEvents'
import { timeBrazil } from '@/lib/eventPage'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LogIn,
  LogOut,
  ScanLine,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from './shared'

const nowPb = () => new Date().toISOString().replace('T', ' ')

export default function EventCheckin() {
  const { code = '' } = useParams<{ code: string }>()
  const { toast } = useToast()
  const [reg, setReg] = useState<EventRegistration | null>(null)
  const [event, setEvent] = useState<ChurchEvent | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!/^[a-z0-9]{6,20}$/.test(code)) {
      setState('missing')
      return
    }
    getRegistrationByCode(code)
      .then((r) => {
        setReg(r)
        setEvent(r.expand?.event_id || null)
        setState('ok')
      })
      .catch(() => setState('missing'))
  }, [code])

  const save = useCallback(
    async (data: Parameters<typeof updateRegistration>[1], done: string) => {
      if (!reg) return
      setBusy(true)
      try {
        setReg(await updateRegistration(reg.id, data))
        toast({ title: done })
      } catch (err) {
        toast({
          title: 'Não foi possível salvar',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        })
      } finally {
        setBusy(false)
      }
    },
    [reg, toast],
  )

  if (state === 'loading') return <p className="text-sm text-slate-500">Carregando...</p>

  if (state === 'missing' || !reg || !event) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">Comprovante não encontrado</h1>
        <p className="text-sm text-slate-600">
          O QR não é de uma inscrição desta igreja, ou a inscrição foi cancelada.
        </p>
        <Link to="/membros/eventos" className="text-sm text-teal-700 hover:underline">
          Ir para os eventos
        </Link>
      </div>
    )
  }

  const owes = !isFree(event) && !reg.paid
  return (
    <div className="max-w-md mx-auto space-y-4">
      <Link
        to={`/membros/eventos/${event.id}`}
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Lista do evento
      </Link>
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 flex items-center justify-center gap-1.5">
          <ScanLine className="h-4 w-4" />
          Check-in · {event.title}
        </p>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{reg.name}</h1>
          {reg.partner_name && <p className="text-slate-600">e {reg.partner_name}</p>}
          <p className="text-sm text-slate-500 mt-1">{eventDateLabel(event)}</p>
        </div>

        {owes && (
          <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
            Ainda não pagou ({formatBRL(registrationDue(event, reg))}). Confira antes de liberar.
          </p>
        )}

        {reg.attended ? (
          <div className="space-y-3">
            <p className="flex items-center justify-center gap-2 text-emerald-700 font-semibold">
              <CheckCircle2 className="h-6 w-6" />
              Entrada {reg.attended_at ? `às ${timeBrazil(reg.attended_at)}` : 'registrada'}
            </p>
            {reg.checked_out_at ? (
              <p className="text-sm text-slate-600">Saída às {timeBrazil(reg.checked_out_at)}</p>
            ) : (
              <Button
                disabled={busy}
                variant="outline"
                className="w-full h-12 rounded-xl gap-2 text-base"
                onClick={() => save({ checked_out_at: nowPb() }, 'Saída registrada')}
              >
                <LogOut className="h-5 w-5" />
                Registrar saída
              </Button>
            )}
            <Button
              disabled={busy}
              variant="ghost"
              className="text-slate-500 gap-1.5"
              onClick={() =>
                save({ attended: false, attended_at: '', checked_out_at: '' }, 'Entrada desfeita')
              }
            >
              <Undo2 className="h-4 w-4" />
              Desfazer entrada
            </Button>
          </div>
        ) : (
          <Button
            disabled={busy}
            className="w-full h-14 rounded-xl gap-2 text-lg bg-teal-700 hover:bg-teal-800"
            onClick={() => save({ attended: true, attended_at: nowPb() }, 'Entrada registrada')}
          >
            <LogIn className="h-5 w-5" />
            Registrar entrada
          </Button>
        )}
      </section>
      <p className="text-xs text-slate-500 text-center">
        Para o próximo, aponte a câmera do celular para o QR do comprovante.
      </p>
    </div>
  )
}
