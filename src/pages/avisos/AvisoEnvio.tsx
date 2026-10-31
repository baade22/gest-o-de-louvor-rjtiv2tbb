// Acompanhar um envio em massa: progresso, quem já recebeu, quem ficou sem WhatsApp, pausar,
// continuar ou cancelar o restante.
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Pause, Play, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mediaSummary, serverMs, whenLabel } from '@/lib/whatsappAvisos'
import {
  cancelAviso,
  getAviso,
  listRecipients,
  pauseAviso,
  removeRecipient,
  resumeAviso,
  type Aviso,
  type AvisoRecipient,
} from '@/services/whatsappAvisos'
import { StatusBadge, errorText } from './AvisosPanel'

const R_STATUS: Record<AvisoRecipient['status'], { label: string; className: string }> = {
  ENVIADO: { label: 'Enviada', className: 'bg-emerald-50 text-emerald-800' },
  FILA: { label: 'Na fila', className: 'bg-slate-100 text-slate-700' },
  PAUSADO: { label: 'Pausada', className: 'bg-orange-50 text-orange-800' },
  ERRO: { label: 'Erro', className: 'bg-amber-50 text-amber-900' },
  CANCELADO: { label: 'Fora da lista', className: 'bg-slate-100 text-slate-500' },
}

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'ENVIADO', label: 'Enviadas' },
  { value: 'ERRO', label: 'Sem WhatsApp ou com erro' },
  { value: 'FILA', label: 'Na fila' },
]

export default function AvisoEnvio() {
  const { currentChurch, can } = useAuth()
  const churchId = currentChurch?.id || ''
  const { id = '' } = useParams()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [rows, setRows] = useState<AvisoRecipient[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [canSend, setCanSend] = useState(true)

  const load = useCallback(
    async (p = 1) => {
      if (!churchId || !id) return
      try {
        const [a, res] = await Promise.all([
          getAviso(churchId, id),
          listRecipients(churchId, id, { page: p, status, q }),
        ])
        setAviso({ ...a, stats: res.stats })
        setRows((prev) => (p === 1 ? res.items : [...prev, ...res.items]))
        setHasMore(res.has_more)
        setPage(p)
      } catch (err) {
        toast({
          title: 'Erro ao abrir o envio',
          description: errorText(err),
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [churchId, id, status, q, toast],
  )

  useEffect(() => {
    const t = setTimeout(() => load(1), q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  useEffect(() => {
    if (aviso?.status !== 'ENVIANDO') return
    const t = setInterval(() => load(1), 30000)
    return () => clearInterval(t)
  }, [aviso?.status, load])

  const act = async (fn: () => Promise<Aviso>, ok: string) => {
    try {
      const a = await fn()
      setAviso(a)
      toast({ title: ok })
      load(1)
    } catch (err) {
      const msg = errorText(err)
      if (/perfil/i.test(msg)) setCanSend(false)
      toast({ title: 'Não deu', description: msg, variant: 'destructive' })
    }
  }

  if (loading || !aviso) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const s = aviso.stats || { fila: 0, pausado: 0, enviado: 0, erro: 0, cancelado: 0 }
  const total = s.fila + s.pausado + s.enviado + s.erro + s.cancelado
  const pctSent = total ? (s.enviado / total) * 100 : 0
  const pctErr = total ? (s.erro / total) * 100 : 0
  const left = s.fila + s.pausado

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {confirmDialog}
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div className="space-y-2 min-w-0">
          <Link
            to={aviso.type === 'CULTO' ? '/avisos/cultos' : '/avisos'}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />{' '}
            {aviso.type === 'CULTO' ? 'Avisos dos cultos' : 'Avisos'}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {aviso.title}
            </h1>
            <StatusBadge status={aviso.status} />
          </div>
          <p className="text-sm text-slate-600">
            {mediaSummary(aviso.media_type, !!aviso.text.trim())} · criado por{' '}
            {aviso.created_by || 'a equipe'}
            {aviso.note ? ` · ${aviso.note}` : ''}
          </p>
        </div>
        {canSend && (
          <div className="flex flex-wrap gap-2">
            {aviso.status === 'ENVIANDO' && (
              <Button
                variant="outline"
                className="rounded-xl gap-1.5 min-h-11"
                onClick={() => act(() => pauseAviso(churchId, aviso.id), 'Envio pausado')}
              >
                <Pause className="h-4 w-4" /> Pausar
              </Button>
            )}
            {aviso.status === 'PAUSADO' && (
              <Button
                className="rounded-xl gap-1.5 min-h-11 bg-teal-700 hover:bg-teal-800 text-white"
                onClick={() => act(() => resumeAviso(churchId, aviso.id), 'Envio retomado')}
              >
                <Play className="h-4 w-4" /> Continuar
              </Button>
            )}
            {['ENVIANDO', 'PAUSADO', 'PROGRAMADO'].includes(aviso.status) && (
              <Button
                variant="outline"
                className="rounded-xl gap-1.5 min-h-11 border-red-300 text-red-700 hover:bg-red-50"
                onClick={() =>
                  confirm({
                    title: 'Cancelar o restante?',
                    description: `${left} pessoas ainda não receberam e não vão mais receber este aviso.`,
                    confirmLabel: 'Cancelar o restante',
                    destructive: true,
                    onConfirm: () => act(() => cancelAviso(churchId, aviso.id), 'Envio cancelado'),
                  })
                }
              >
                <X className="h-4 w-4" /> Cancelar o restante
              </Button>
            )}
          </div>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap justify-between gap-2">
          <p className="font-semibold text-slate-900">
            {s.enviado} de {total} enviadas
          </p>
          <p className="text-sm text-slate-700">
            {aviso.status === 'ENVIANDO' && aviso.eta
              ? `Termina ${whenLabel(serverMs(aviso.eta))}`
              : aviso.status === 'CONCLUIDO'
                ? `Terminou ${whenLabel(serverMs(aviso.finished_at))}`
                : aviso.status === 'PAUSADO'
                  ? 'Pausado: ninguém recebe até você continuar'
                  : ''}
          </p>
        </div>
        <div className="h-3 rounded-full bg-slate-200 overflow-hidden flex" aria-hidden="true">
          <div className="bg-teal-600" style={{ width: `${pctSent}%` }} />
          <div className="bg-amber-500" style={{ width: `${pctErr}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-2xl font-bold text-emerald-700">{s.enviado}</p>
            <p className="text-xs text-slate-600">Enviadas</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-700">{s.erro}</p>
            <p className="text-xs text-slate-600">Sem WhatsApp ou com erro</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-700">{left}</p>
            <p className="text-xs text-slate-600">{s.pausado ? 'Pausadas' : 'Na fila'}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-500">{s.cancelado}</p>
            <p className="text-xs text-slate-600">Fora da lista</p>
          </div>
        </div>
        <p className="text-xs text-slate-600">
          Ritmo: 1 a cada {aviso.pace_min} a {aviso.pace_max} minutos, só das {aviso.window_start}{' '}
          às {aviso.window_end}. Se o WhatsApp desconectar, as mensagens esperam e continuam quando
          reconectar.
        </p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap justify-between items-center gap-3 px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Pessoas</h2>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="r-q" className="sr-only">
              Buscar pessoa
            </label>
            <Input
              id="r-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar pessoa"
              className="rounded-xl min-h-11 w-52"
            />
            <label htmlFor="r-f" className="sr-only">
              Situação
            </label>
            <select
              id="r-f"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-5 py-3 font-semibold">Pessoa</th>
                <th className="px-5 py-3 font-semibold">Celular ou grupo</th>
                <th className="px-5 py-3 font-semibold">Situação</th>
                <th className="px-5 py-3 font-semibold">Horário</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 text-slate-900">{r.name || '—'}</td>
                  <td className="px-5 py-3 text-slate-700">
                    {r.group ? 'Grupo do WhatsApp' : `•••• ${r.phone_end}`}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-semibold rounded-full px-2 py-0.5 ${R_STATUS[r.status].className}`}
                    >
                      {r.status === 'ERRO' && /WhatsApp/i.test(r.error)
                        ? 'Sem WhatsApp'
                        : R_STATUS[r.status].label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {r.sent_at
                      ? whenLabel(serverMs(r.sent_at))
                      : r.status === 'FILA'
                        ? `~${whenLabel(serverMs(r.send_after))}`
                        : ''}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {(r.status === 'FILA' || r.status === 'PAUSADO') && canSend && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-11"
                        onClick={async () => {
                          try {
                            await removeRecipient(churchId, r.id)
                            load(1)
                          } catch (err) {
                            toast({
                              title: 'Não deu',
                              description: errorText(err),
                              variant: 'destructive',
                            })
                          }
                        }}
                      >
                        Tirar da lista
                      </button>
                    )}
                    {r.status === 'ERRO' && can('membresia.pessoas.alterar') && (
                      <Link to="/membros" className="text-sm font-semibold text-teal-700">
                        Corrigir número
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-600">
                    Ninguém nesta lista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="p-4 text-center">
            <Button variant="outline" className="rounded-xl" onClick={() => load(page + 1)}>
              Ver mais
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
