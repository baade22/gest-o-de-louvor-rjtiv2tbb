// Avisos pelo WhatsApp: painel da equipe de Mídia. Mostra o que está saindo agora, o que está
// programado, os rascunhos e o histórico. O envio é do servidor (hooks/whatsapp_avisos.js).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Mic,
  Plus,
  RefreshCw,
  Video,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  STATUS_INFO,
  WEEKDAYS,
  mediaSummary,
  serverMs,
  whenLabel,
  type AvisoMediaType,
} from '@/lib/whatsappAvisos'
import { formatWhatsAppPhone } from '@/lib/whatsapp'
import { getAvisosOverview, type Aviso, type AvisosOverview } from '@/services/whatsappAvisos'

type Tab = 'ativos' | 'rascunhos' | 'enviados'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'ativos', label: 'Em andamento e programados' },
  { value: 'rascunhos', label: 'Rascunhos' },
  { value: 'enviados', label: 'Enviados e cancelados' },
]

const TAB_STATUSES: Record<Tab, string[]> = {
  ativos: ['ENVIANDO', 'PAUSADO', 'PROGRAMADO', 'AGUARDANDO'],
  rascunhos: ['RASCUNHO'],
  enviados: ['CONCLUIDO', 'CANCELADO'],
}

export const errorText = (err: unknown) =>
  (err as { response?: { message?: string }; message?: string })?.response?.message ||
  (err as Error)?.message ||
  'Tente de novo.'

export function MediaIcon({ type, className }: { type: AvisoMediaType; className?: string }) {
  const Icon =
    type === 'IMAGEM'
      ? ImageIcon
      : type === 'VIDEO'
        ? Video
        : type === 'AUDIO'
          ? Mic
          : type === 'DOCUMENTO'
            ? FileText
            : Megaphone
  return <Icon className={className} aria-hidden="true" />
}

export function StatusBadge({ status }: { status: Aviso['status'] }) {
  const info = STATUS_INFO[status]
  return (
    <Badge variant="outline" className={`${info.className} font-semibold`}>
      {info.label}
    </Badge>
  )
}

function progressOf(a: Aviso) {
  const s = a.stats
  if (!s) return null
  const done = s.enviado + s.erro
  const total = done + s.fila + s.pausado + s.cancelado
  return { done, total, sent: s.enviado, erro: s.erro, left: s.fila + s.pausado }
}

function AvisoRow({ a }: { a: Aviso }) {
  const p = progressOf(a)
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0
  const tracking =
    ['ENVIANDO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO'].includes(a.status) && a.total > 0
  const to = tracking ? `/avisos/${a.id}/envio` : `/avisos/${a.id}`
  let line = ''
  if (a.status === 'PROGRAMADO')
    line = `Começa ${whenLabel(serverMs(a.starts_at))} · ${a.total} pessoas`
  else if (a.status === 'AGUARDANDO') line = a.note || 'Esperando a hora do culto'
  else if (a.status === 'ENVIANDO' && a.eta)
    line = `Termina ${whenLabel(serverMs(a.eta))} · uma a cada ${a.pace_min} a ${a.pace_max} min`
  else if (a.status === 'PAUSADO') line = a.note || 'Pausado'
  else if (a.status === 'CONCLUIDO')
    line =
      `Terminou ${whenLabel(serverMs(a.finished_at || a.updated))}` + (a.note ? ` · ${a.note}` : '')
  else if (a.status === 'CANCELADO') line = a.note || 'Cancelado'
  else line = `Criado por ${a.created_by || 'alguém da equipe'}`

  return (
    <Link
      to={to}
      className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-4 items-center hover:border-teal-300 transition-colors"
    >
      <div className="h-14 w-14 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
        <MediaIcon type={a.media_type} className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 truncate">{a.title}</span>
          <StatusBadge status={a.status} />
          <span className="text-xs text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
            {mediaSummary(a.media_type, !!a.text.trim())}
          </span>
        </div>
        <p className="text-sm text-slate-600">{line}</p>
        {p && p.total > 0 && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
              <div className="h-2 bg-teal-600" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-600">
              {p.sent} enviadas{p.erro ? ` · ${p.erro} sem WhatsApp ou com erro` : ''}
              {p.left ? ` · ${p.left} na fila` : ''}
            </p>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function AvisosPanel() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id || ''
  const { toast } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState<AvisosOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('ativos')

  const load = useCallback(async () => {
    if (!churchId) return
    try {
      setData(await getAvisosOverview(churchId))
      setError('')
    } catch (err) {
      setError(errorText(err))
      toast({
        title: 'Erro ao abrir os avisos',
        description: errorText(err),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [churchId, toast])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const items = useMemo(() => (data?.items || []).filter((a) => a.type !== 'REGRA_CULTO'), [data])
  const rules = useMemo(() => (data?.items || []).filter((a) => a.type === 'REGRA_CULTO'), [data])
  const shown = items.filter((a) => TAB_STATUSES[tab].includes(a.status))
  const sending = items.filter((a) => a.status === 'ENVIANDO')
  const scheduled = items
    .filter((a) => a.status === 'PROGRAMADO')
    .sort((x, y) => serverMs(x.starts_at) - serverMs(y.starts_at))
  const wa = data?.whatsapp
  const connected = wa?.state === 'open'

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-teal-700" />
            Avisos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Mensagens, artes, vídeos e documentos que a igreja manda pelo WhatsApp.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl gap-1.5" asChild>
            <Link to="/avisos/cultos">
              <CalendarClock className="h-4 w-4" /> Avisos dos cultos
            </Link>
          </Button>
          {data?.can.novo && (
            <Button
              className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white gap-1.5"
              onClick={() => navigate('/avisos/novo')}
            >
              <Plus className="h-4 w-4" /> Novo aviso
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : !data ? (
        <div className="bg-white border border-red-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm text-red-700">Não deu para abrir os avisos: {error}</p>
          <p className="text-xs text-slate-600">
            Se for a primeira vez, confira no Skip se a migração 0075 foi aplicada.
          </p>
          <Button variant="outline" className="rounded-xl gap-1.5" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-slate-600">WhatsApp da igreja</p>
              {connected ? (
                <>
                  <p className="font-bold text-emerald-700">Conectado</p>
                  <p className="text-xs text-slate-600">{formatWhatsAppPhone(wa?.phone)}</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />{' '}
                    {wa?.configured ? 'Desconectado' : 'Não configurado'}
                  </p>
                  <p className="text-xs text-slate-600">
                    Os avisos esperam na fila até o MASTER conectar.
                  </p>
                </>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-slate-600">Enviando agora</p>
              <p className="font-bold text-slate-900">
                {sending.length === 1 ? '1 aviso' : `${sending.length} avisos`}
              </p>
              <p className="text-xs text-slate-600">
                {sending.reduce((n, a) => n + (a.stats?.fila || 0), 0)} mensagens na fila
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-slate-600">Programados</p>
              <p className="font-bold text-slate-900">
                {scheduled.length === 1 ? '1 aviso' : `${scheduled.length} avisos`}
              </p>
              <p className="text-xs text-slate-600">
                {scheduled[0]
                  ? `Próximo: ${whenLabel(serverMs(scheduled[0].starts_at))}`
                  : 'Nenhum'}
              </p>
            </div>
            <Link
              to="/avisos/cultos"
              className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 hover:border-teal-300"
            >
              <p className="text-xs text-slate-600">Avisos automáticos dos cultos</p>
              <p className="font-bold text-slate-900">
                {rules.filter((r) => r.status === 'ATIVA').length} ligados
              </p>
              <p className="text-xs text-slate-600 truncate">
                {rules
                  .filter((r) => r.status === 'ATIVA')
                  .map((r) => `${WEEKDAYS[r.weekday]} ${r.send_time}`)
                  .join(' · ') || 'Nenhum ainda'}
              </p>
            </Link>
          </div>

          <div
            role="tablist"
            aria-label="Filtro"
            className="flex flex-wrap gap-1 border-b border-slate-200"
          >
            {TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={`min-h-11 px-4 text-sm border-b-2 -mb-px ${
                  tab === t.value
                    ? 'border-teal-700 text-teal-800 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-slate-500">
                  {items.filter((a) => TAB_STATUSES[t.value].includes(a.status)).length}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {shown.length === 0 ? (
              <p className="text-sm text-slate-600 bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
                {tab === 'ativos'
                  ? 'Nada saindo nem programado agora.'
                  : tab === 'rascunhos'
                    ? 'Nenhum rascunho.'
                    : 'Nenhum aviso enviado ainda.'}
              </p>
            ) : (
              shown.map((a) => <AvisoRow key={a.id} a={a} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}
