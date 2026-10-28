import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listAllRegistrations, listChurchEvents, updateChurchEvent } from '@/services/churchEvents'
import type { ChurchEvent, EventRegistration } from '@/types'
import {
  eventDateLabel,
  formatBRL,
  isFree,
  isPastEvent,
  summarizeRegistrations,
} from '@/lib/churchEvents'
import { getLocalTodayYMD, toCalendarYMD } from '@/lib/dateUtils'
import { eventsDashboard } from '@/lib/eventPage'
import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  List,
  Lock,
  MapPin,
  Plus,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from './shared'
import { EventsCalendar } from './EventsCalendar'
import { useToast } from '@/hooks/use-toast'

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'slate',
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  tone?: 'slate' | 'amber'
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-xs ${
        tone === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
      }`}
    >
      <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="text-2xl font-extrabold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

function EventCard({
  event,
  regs,
  past,
}: {
  event: ChurchEvent
  regs: EventRegistration[]
  past: boolean
}) {
  const s = summarizeRegistrations(event, regs)
  const [, m, d] = toCalendarYMD(event.starts_on).split('-').map(Number)
  return (
    <Link
      to={`/membros/eventos/${event.id}`}
      className={`group bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-teal-300 transition-colors flex gap-4 ${
        past ? 'opacity-75' : ''
      }`}
    >
      <div className="h-16 w-14 shrink-0 rounded-xl bg-teal-50 border border-teal-100 text-teal-800 flex flex-col items-center justify-center">
        <span className="text-[11px] font-bold tracking-wide">{MONTHS[m - 1]}</span>
        <span className="text-2xl font-extrabold leading-none">{d}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start gap-2">
          <h3 className="font-bold text-slate-900 group-hover:text-teal-800 truncate">
            {event.title}
          </h3>
          {event.closed_at ? (
            <span className="ml-auto shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
              Encerrado
            </span>
          ) : (
            !past && (
              <span
                className={`ml-auto shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                  event.registration_open && !event.publish_only
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {event.publish_only
                  ? 'Só divulgação'
                  : event.registration_open
                    ? 'Inscrições abertas'
                    : 'Inscrições fechadas'}
              </span>
            )
          )}
        </div>
        <p className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{eventDateLabel(event)}</span>
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {event.location}
            </span>
          )}
          <span>
            {isFree(event)
              ? 'Gratuito'
              : `${formatBRL(event.price!)}${event.couple_only ? ' por casal' : ''}`}
          </span>
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 pt-0.5">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <strong>{s.total}</strong>
            {event.capacity ? ` de ${event.capacity} vagas` : ' inscritos'}
          </span>
          {!isFree(event) && (
            <span className="flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 text-slate-400" />
              {formatBRL(s.collected)} recebidos
              {s.pending > 0 && <span className="text-amber-700">· {s.pending} a pagar</span>}
            </span>
          )}
          {past && (
            <span className="flex items-center gap-1">
              <Ticket className="h-3.5 w-3.5 text-slate-400" />
              {s.attended} presentes
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function ChurchEvents() {
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const today = getLocalTodayYMD()
  const [view, setView] = useState<'lista' | 'calendario'>('lista')
  const [events, setEvents] = useState<ChurchEvent[]>([])
  const [regs, setRegs] = useState<EventRegistration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!currentChurch) return
    Promise.all([listChurchEvents(currentChurch.id), listAllRegistrations(currentChurch.id)])
      .then(([e, r]) => {
        setEvents(e)
        setRegs(r)
      })
      .catch((err) => setLoadError(errorMessage(err, 'Não foi possível carregar os eventos.')))
      .finally(() => setIsLoading(false))
  }, [currentChurch])

  const regsByEvent = useMemo(() => {
    const map = new Map<string, EventRegistration[]>()
    for (const r of regs) map.set(r.event_id, [...(map.get(r.event_id) || []), r])
    return map
  }, [regs])
  // Próximos do mais perto para o mais longe; passados do mais recente para trás
  const upcoming = events.filter((e) => !isPastEvent(e, today)).reverse()
  const past = events.filter((e) => isPastEvent(e, today))
  const panel = useMemo(() => eventsDashboard(events, regs, today), [events, regs, today])

  const closeEvent = async (e: ChurchEvent) => {
    try {
      const saved = await updateChurchEvent(e.id, {
        closed_at: new Date().toISOString().replace('T', ' '),
        registration_open: false,
      })
      setEvents((list) => list.map((x) => (x.id === e.id ? saved : x)))
      toast({ title: `${e.title} encerrado` })
    } catch (err) {
      toast({
        title: 'Não foi possível encerrar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Eventos da igreja
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Retiros, cursos, batismos: inscrição, pagamento e lista de presença.
          </p>
        </div>
        <Link to="/membros/eventos/novo" className="sm:ml-auto">
          <Button className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800">
            <Plus className="h-4 w-4" />
            Novo evento
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid lg:grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {loadError}
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-2">
          <CalendarPlus className="h-10 w-10 text-slate-400 mx-auto" />
          <p className="font-semibold text-slate-800">Nenhum evento ainda</p>
          <p className="text-sm text-slate-500">
            Crie o primeiro e divulgue o link de inscrição no grupo da igreja.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile
              icon={CalendarDays}
              label="Eventos ativos"
              value={String(panel.active)}
              sub={`de ${events.length} cadastrados`}
            />
            <Tile
              icon={Users}
              label="Inscrições"
              value={String(panel.registrations)}
              sub="nos eventos não encerrados"
            />
            <Tile
              icon={Wallet}
              label="Pagamentos pendentes"
              value={String(panel.unpaid)}
              sub={panel.unpaid ? `falta ${formatBRL(panel.unpaidAmount)}` : 'nenhuma pendência'}
              tone={panel.unpaid ? 'amber' : 'slate'}
            />
            <Tile
              icon={AlertCircle}
              label="Para encerrar"
              value={String(panel.toClose.length)}
              sub="já aconteceram e seguem abertos"
              tone={panel.toClose.length ? 'amber' : 'slate'}
            />
          </div>

          {panel.toClose.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs">
              <h2 className="px-4 pt-4 text-sm font-bold text-slate-900">
                Pendentes de encerramento
              </h2>
              <p className="px-4 text-xs text-slate-500">
                Confira presença e pagamentos e encerre: o evento sai das contas do painel.
              </p>
              <ul className="divide-y divide-slate-100 mt-2">
                {panel.toClose.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Link
                      to={`/membros/eventos/${e.id}`}
                      className="min-w-0 flex-1 text-sm font-semibold text-slate-900 hover:underline truncate"
                    >
                      {e.title}
                    </Link>
                    <span className="text-xs text-slate-500 shrink-0">{eventDateLabel(e)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg gap-1.5 shrink-0"
                      onClick={() => closeEvent(e)}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Encerrar
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex gap-1">
            {(
              [
                ['lista', 'Lista', List],
                ['calendario', 'Calendário', CalendarDays],
              ] as const
            ).map(([v, text, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
                  view === v
                    ? 'bg-teal-50 border-teal-300 text-teal-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {text}
              </button>
            ))}
          </div>

          {view === 'calendario' ? (
            <EventsCalendar events={events} today={today} />
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Próximos
                </h2>
                {upcoming.length === 0 && (
                  <p className="text-sm text-slate-500">Nenhum evento marcado.</p>
                )}
                <div className="grid lg:grid-cols-2 gap-3">
                  {upcoming.map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      regs={regsByEvent.get(e.id) || []}
                      past={false}
                    />
                  ))}
                </div>
              </section>
              {past.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                    Já aconteceram
                  </h2>
                  <div className="grid lg:grid-cols-2 gap-3">
                    {past.map((e) => (
                      <EventCard key={e.id} event={e} regs={regsByEvent.get(e.id) || []} past />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
