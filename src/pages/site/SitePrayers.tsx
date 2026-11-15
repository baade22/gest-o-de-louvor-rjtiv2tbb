// Pedidos de oração e "Fale conosco" que chegam pelo site (migração 0098).
// Chaves admin.oracao.ver (ler) e admin.oracao.alterar (marcar, anotar, excluir).

import { useCallback, useEffect, useState } from 'react'
import { HandHeart, Loader2, MessageCircle, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { cn } from '@/lib/utils'
import { whatsappUrl } from '@/lib/site'
import {
  deletePrayer,
  listPrayers,
  updatePrayer,
  type PrayerStatus,
  type SitePrayer,
} from '@/services/site'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

const STATUS: Record<PrayerStatus, { label: string; cls: string }> = {
  NOVO: { label: 'Novo', cls: 'bg-amber-50 text-amber-800' },
  ACOMPANHANDO: { label: 'Acompanhando', cls: 'bg-indigo-50 text-indigo-700' },
  CONCLUIDO: { label: 'Concluído', cls: 'bg-emerald-50 text-emerald-700' },
}

function when(s: string) {
  const d = new Date(s.replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' })
}

export default function SitePrayers() {
  const { currentChurch, can } = useAuth()
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const churchId = currentChurch?.id || ''
  const canEdit = can('admin.oracao.alterar')
  const [filter, setFilter] = useState<PrayerStatus | 'TODOS'>('NOVO')
  const [items, setItems] = useState<SitePrayer[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    if (!churchId) return
    listPrayers(churchId, filter)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
  }, [churchId, filter])
  useEffect(() => {
    setItems(null)
    load()
  }, [load])

  const change = async (p: SitePrayer, patch: Partial<Pick<SitePrayer, 'status' | 'note'>>) => {
    setBusy(p.id)
    try {
      await updatePrayer(p.id, patch)
      load()
    } catch (err) {
      toast({ title: 'Não foi possível salvar', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          <HandHeart className="h-7 w-7 text-teal-700" />
          Pedidos de oração
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          O que chega pelo site e pelo app da igreja. Nada disso é publicado. Trate com sigilo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['NOVO', 'ACOMPANHANDO', 'CONCLUIDO', 'TODOS'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-xl border px-3.5 py-1.5 text-sm font-semibold',
              filter === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700',
            )}
          >
            {k === 'TODOS' ? 'Todos' : STATUS[k].label}
          </button>
        ))}
      </div>

      {items === null ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Nenhum pedido {filter === 'TODOS' ? '' : `"${STATUS[filter].label.toLowerCase()}"`} por aqui.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((p) => {
            const wa = p.wants_contact && p.contact.replace(/\D/g, '').length >= 8 ? whatsappUrl(p.contact) : ''
            const st = STATUS[p.status] || STATUS.NOVO
            return (
              <div key={p.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                    {p.kind === 'CONTATO' ? 'Fale conosco' : 'Oração'}
                  </span>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', st.cls)}>{st.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{p.name || 'Sem nome'}</span>
                  <span className="ml-auto text-xs text-slate-500">{when(p.created)}</span>
                </div>
                <p className="whitespace-pre-line text-[15px] text-slate-800">{p.message}</p>
                {p.wants_contact && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    Pediu contato: <b>{p.contact}</b>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal-700">
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                    )}
                  </p>
                )}
                {canEdit && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <Textarea
                      placeholder="Anotação da equipe (só aparece aqui)"
                      value={notes[p.id] ?? p.note}
                      onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                      rows={2}
                      maxLength={1000}
                    />
                    <div className="flex flex-wrap gap-2">
                      {notes[p.id] !== undefined && notes[p.id] !== p.note && (
                        <Button size="sm" variant="outline" onClick={() => change(p, { note: notes[p.id] })} disabled={busy === p.id}>
                          Salvar anotação
                        </Button>
                      )}
                      {p.status !== 'ACOMPANHANDO' && (
                        <Button size="sm" variant="outline" onClick={() => change(p, { status: 'ACOMPANHANDO' })} disabled={busy === p.id}>
                          Acompanhando
                        </Button>
                      )}
                      {p.status !== 'CONCLUIDO' && (
                        <Button size="sm" className="bg-teal-700 text-white hover:bg-teal-800" onClick={() => change(p, { status: 'CONCLUIDO' })} disabled={busy === p.id}>
                          {busy === p.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                          Concluído
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-red-600"
                        onClick={() =>
                          confirm({
                            title: 'Excluir este pedido?',
                            description: 'Ele some de vez. Não dá para desfazer.',
                            confirmLabel: 'Excluir',
                            destructive: true,
                            onConfirm: async () => {
                              await deletePrayer(p.id)
                              load()
                            },
                          })
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {dialog}
    </div>
  )
}
