import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople, listStatusChanges } from '@/services/people'
import type { Person, PersonEvent } from '@/types'
import {
  CONGREGATIONS,
  ageBuckets,
  genderBuckets,
  isActiveStatus,
  membershipMovements,
  missingEssentials,
  recentlyAdded,
  tenureBuckets,
  upcomingCelebrations,
  type Bucket,
} from '@/lib/membership'
import { getLocalTodayYMD, parseCalendarDate } from '@/lib/dateUtils'
import {
  Cake,
  FileWarning,
  Heart,
  HeartHandshake,
  MessageCircle,
  UserPlus,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PersonAvatar, errorMessage, usePhotoToken } from './shared'

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  to,
}: {
  icon: LucideIcon
  tone: string
  label: string
  value: React.ReactNode
  hint: string
  to?: string
}) {
  const body = (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 h-full hover:border-teal-300 transition-colors">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <span className={`h-8 w-8 rounded-lg grid place-items-center ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <p className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

function BucketBars({
  buckets,
  peopleById,
}: {
  buckets: Bucket[]
  peopleById: Map<string, Person>
}) {
  const [open, setOpen] = useState<string | null>(null)
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="space-y-2.5">
      {buckets.map((b) => (
        <div key={b.label}>
          <button
            type="button"
            onClick={() => setOpen(open === b.label ? null : b.label)}
            disabled={b.count === 0}
            className="w-full grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 text-sm text-left disabled:cursor-default"
          >
            <span className="text-slate-600 truncate">{b.label}</span>
            <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <span
                className="block h-full rounded-full bg-teal-600"
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </span>
            <span className="text-right font-bold text-slate-900">{b.count}</span>
          </button>
          {open === b.label && (
            <div className="mt-2 ml-1 flex flex-wrap gap-1.5">
              {b.ids.map((id) => {
                const p = peopleById.get(id)
                return p ? (
                  <Link
                    key={id}
                    to={`/membros/${id}`}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-teal-300 hover:text-teal-800"
                  >
                    {p.name}
                  </Link>
                ) : null
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function whatsappLink(phone: string | undefined, text: string): string {
  let digits = (phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 11) digits = `55${digits}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export default function MembershipDashboard() {
  const { currentChurch } = useAuth()
  const photoToken = usePhotoToken()
  const today = getLocalTodayYMD()
  const year = parseCalendarDate(today)!.year

  const [people, setPeople] = useState<Person[]>([])
  const [changes, setChanges] = useState<PersonEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [congregation, setCongregation] = useState('TODAS')
  const [view, setView] = useState<'idade' | 'tempo' | 'sexo'>('idade')

  useEffect(() => {
    if (!currentChurch) return
    setIsLoading(true)
    Promise.all([listPeople(currentChurch.id), listStatusChanges(currentChurch.id, year)])
      .then(([ppl, ev]) => {
        setPeople(ppl)
        setChanges(ev)
      })
      .catch((err) => setLoadError(errorMessage(err, 'Não foi possível carregar o painel.')))
      .finally(() => setIsLoading(false))
  }, [currentChurch, year])

  const congregationOptions = useMemo(() => {
    const set = new Set(CONGREGATIONS)
    people.forEach((p) => p.congregation && set.add(p.congregation))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [people])

  const scoped = useMemo(
    () =>
      congregation === 'TODAS' ? people : people.filter((p) => p.congregation === congregation),
    [people, congregation],
  )
  const scopedIds = useMemo(() => new Set(scoped.map((p) => p.id)), [scoped])
  const active = useMemo(() => scoped.filter((p) => isActiveStatus(p.status)), [scoped])
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const members = scoped.filter((p) => p.status === 'MEMBRO').length
  const visitors = scoped.filter((p) => p.status === 'VISITANTE').length
  const recent = recentlyAdded(scoped, today, 30)
  const incomplete = active.filter((p) => missingEssentials(p).length > 0)
  const birthdays = upcomingCelebrations(scoped, today, 7)
  const movements = membershipMovements(
    changes.filter((e) => scopedIds.has(e.person_id)),
    year,
  )
  const buckets =
    view === 'idade'
      ? ageBuckets(active, today)
      : view === 'tempo'
        ? tenureBuckets(
            active.filter((p) => p.status === 'MEMBRO'),
            today,
          )
        : genderBuckets(active)

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
      on ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-white border-slate-200 text-slate-500'
    }`

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Painel da membresia
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Retrato da {currentChurch?.name} hoje</p>
        </div>
        <div className="lg:ml-auto flex flex-wrap items-center gap-2">
          {['TODAS', ...congregationOptions].map((c) => (
            <button
              key={c}
              type="button"
              className={chip(congregation === c)}
              onClick={() => setCongregation(c)}
            >
              {c === 'TODAS' ? 'Toda a igreja' : c}
            </button>
          ))}
          <Link to="/membros/novo">
            <Button className="h-9 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2">
              <UserPlus className="h-4 w-4" />
              Novo membro
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <Card className="rounded-2xl border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {loadError}
        </Card>
      ) : people.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-lg font-bold text-slate-900">
            O painel aparece com as primeiras fichas
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre os membros para ver idade, tempo de igreja e aniversariantes.
          </p>
          <Link to="/membros/novo" className="mt-5 inline-block">
            <Button className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold">
              Cadastrar primeiro membro
            </Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              icon={Users}
              tone="bg-teal-50 text-teal-700"
              label="Membros"
              value={members}
              hint={`${scoped.length ? Math.round((members / scoped.length) * 100) : 0}% das ${scoped.length} pessoas cadastradas`}
              to="/membros"
            />
            <Stat
              icon={UserRoundPlus}
              tone="bg-indigo-50 text-indigo-700"
              label="Cadastros em 30 dias"
              value={recent.length}
              hint="fichas novas no sistema"
            />
            <Stat
              icon={HeartHandshake}
              tone="bg-amber-50 text-amber-700"
              label="Visitantes"
              value={visitors}
              hint="com situação Visitante"
            />
            <Stat
              icon={FileWarning}
              tone="bg-violet-50 text-violet-700"
              label="Fichas incompletas"
              value={incomplete.length}
              hint="sem nascimento, telefone ou batismo"
              to="/membros?incompletas=1"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
            <section className="bg-white rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Composição da igreja</h2>
                  <p className="text-xs text-slate-500">
                    {view === 'tempo'
                      ? 'Só membros, pela data de admissão'
                      : 'Membros, congregados e visitantes'}{' '}
                    · toque numa barra para ver os nomes
                  </p>
                </div>
                <div className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    className={chip(view === 'idade')}
                    onClick={() => setView('idade')}
                  >
                    Idade
                  </button>
                  <button
                    type="button"
                    className={chip(view === 'tempo')}
                    onClick={() => setView('tempo')}
                  >
                    Tempo de igreja
                  </button>
                  <button
                    type="button"
                    className={chip(view === 'sexo')}
                    onClick={() => setView('sexo')}
                  >
                    Sexo
                  </button>
                </div>
              </div>
              <div className="p-5">
                <BucketBars key={view} buckets={buckets} peopleById={peopleById} />
              </div>
            </section>

            <div className="space-y-5">
              <section className="bg-white rounded-2xl border border-slate-200">
                <div className="flex items-center px-5 py-4 border-b border-slate-100">
                  <h2 className="text-base font-bold text-slate-900">Aniversariantes da semana</h2>
                  <Link
                    to="/membros/aniversarios"
                    className="ml-auto text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Ver todos
                  </Link>
                </div>
                {birthdays.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">
                    Nenhum aniversário nos próximos 7 dias.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {birthdays.slice(0, 6).map((c) => {
                      const first = c.person.name.split(/\s+/)[0]
                      const wa = whatsappLink(
                        c.person.phone,
                        c.kind === 'NASCIMENTO'
                          ? `Feliz aniversário, ${first}! Que Deus abençoe sua vida ricamente.`
                          : `Feliz aniversário de casamento, ${first}! Que Deus abençoe a família de vocês.`,
                      )
                      return (
                        <li
                          key={`${c.person.id}-${c.kind}`}
                          className="flex items-center gap-3 px-5 py-2.5"
                        >
                          <PersonAvatar person={c.person} token={photoToken} size="sm" />
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/membros/${c.person.id}`}
                              className="text-sm font-semibold text-slate-900 hover:text-teal-800 truncate block"
                            >
                              {c.person.name}
                            </Link>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              {c.kind === 'NASCIMENTO' ? (
                                <Cake className="h-3 w-3 text-pink-500" />
                              ) : (
                                <Heart className="h-3 w-3 text-rose-500" />
                              )}
                              {c.inDays === 0
                                ? 'Hoje'
                                : `${String(c.day).padStart(2, '0')}/${String(c.month).padStart(2, '0')}`}
                              {c.years !== null &&
                                ` · ${c.years} ${c.kind === 'NASCIMENTO' ? 'anos' : 'anos de casados'}`}
                            </p>
                          </div>
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Parabenizar ${c.person.name}`}
                            >
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg">
                                <MessageCircle className="h-4 w-4 text-emerald-600" />
                              </Button>
                            </a>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="bg-white rounded-2xl border border-slate-200">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-base font-bold text-slate-900">Movimentação em {year}</h2>
                  <p className="text-xs text-slate-500">
                    Entradas e saídas do rol registradas ao mudar a situação
                  </p>
                </div>
                {movements.entradas.length + movements.saidas.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">
                    Nenhuma mudança registrada este ano. Ao mudar a situação de alguém na ficha, o
                    motivo aparece aqui.
                  </p>
                ) : (
                  <dl className="px-5 py-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                    {movements.entradas.map((m) => (
                      <React.Fragment key={`in-${m.reason}`}>
                        <dt className="text-slate-600">{m.reason}</dt>
                        <dd className="font-bold text-emerald-700 text-right">+{m.count}</dd>
                      </React.Fragment>
                    ))}
                    {movements.saidas.map((m) => (
                      <React.Fragment key={`out-${m.reason}`}>
                        <dt className="text-slate-600">{m.reason}</dt>
                        <dd className="font-bold text-red-600 text-right">−{m.count}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
