import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople } from '@/services/people'
import type { Person } from '@/types'
import {
  CONGREGATIONS,
  MONTH_NAMES,
  celebrationsInMonth,
  upcomingCelebrations,
  type Celebration,
} from '@/lib/membership'
import { getLocalTodayYMD, parseCalendarDate } from '@/lib/dateUtils'
import { ArrowLeft, Cake, ChevronLeft, ChevronRight, Heart, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PersonAvatar, errorMessage, usePhotoToken } from './shared'

/** Link do WhatsApp com uma mensagem pronta (telefones brasileiros sem DDI ganham 55). */
function whatsappLink(c: Celebration): string {
  let digits = (c.person.phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 11) digits = `55${digits}`
  const firstName = c.person.name.split(/\s+/)[0]
  const text =
    c.kind === 'NASCIMENTO'
      ? `Feliz aniversário, ${firstName}! Que Deus abençoe sua vida ricamente.`
      : `Feliz aniversário de casamento, ${firstName}! Que Deus abençoe a família de vocês.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function describe(c: Celebration): string {
  if (c.kind === 'NASCIMENTO') return c.years !== null ? `Faz ${c.years} anos` : 'Aniversário'
  if (c.years === null) return 'Aniversário de casamento'
  return `${c.years} ${c.years === 1 ? 'ano' : 'anos'} de casados`
}

function CelebrationRow({
  c,
  token,
  dateLabel,
  highlight,
}: {
  c: Celebration
  token: string
  dateLabel: string
  highlight?: boolean
}) {
  const wa = whatsappLink(c)
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border p-3 sm:p-4 bg-white ${
        highlight ? 'border-teal-300 ring-1 ring-teal-200' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-12 text-center shrink-0">
          <p className="text-lg font-extrabold text-slate-900 leading-none">{dateLabel}</p>
        </div>
        <PersonAvatar person={c.person} token={token} size="sm" />
        <div className="min-w-0">
          <Link
            to={`/membros/${c.person.id}/editar`}
            className="text-sm font-bold text-slate-900 hover:text-teal-800 truncate block"
          >
            {c.person.name}
          </Link>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            {c.kind === 'NASCIMENTO' ? (
              <Cake className="h-3.5 w-3.5 text-pink-500" />
            ) : (
              <Heart className="h-3.5 w-3.5 text-rose-500" />
            )}
            {describe(c)}
            {c.person.congregation && (
              <span className="text-slate-400">· {c.person.congregation}</span>
            )}
          </p>
        </div>
      </div>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5">
            <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Parabenizar</span>
          </Button>
        </a>
      )}
    </div>
  )
}

export default function Birthdays() {
  const { currentChurch } = useAuth()
  const photoToken = usePhotoToken()
  const today = getLocalTodayYMD()
  const todayParts = parseCalendarDate(today)!

  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [month, setMonth] = useState(todayParts.month)
  const [year, setYear] = useState(todayParts.year)
  const [congregation, setCongregation] = useState('TODAS')

  useEffect(() => {
    if (!currentChurch) return
    setIsLoading(true)
    listPeople(currentChurch.id)
      .then(setPeople)
      .catch((err) => setLoadError(errorMessage(err, 'Não foi possível carregar os membros.')))
      .finally(() => setIsLoading(false))
  }, [currentChurch])

  const congregationOptions = useMemo(() => {
    const set = new Set(CONGREGATIONS)
    people.forEach((p) => p.congregation && set.add(p.congregation))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [people])

  const visible = useMemo(
    () =>
      congregation === 'TODAS' ? people : people.filter((p) => p.congregation === congregation),
    [people, congregation],
  )
  const upcoming = useMemo(() => upcomingCelebrations(visible, today, 7), [visible, today])
  const monthList = useMemo(() => celebrationsInMonth(visible, month, year), [visible, month, year])

  const shiftMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setMonth(m)
    setYear(y)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        to="/membros"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Membros
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Aniversariantes
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Aniversários de nascimento e de casamento de membros, congregados e visitantes
          </p>
        </div>
        <Select value={congregation} onValueChange={setCongregation}>
          <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Toda a igreja</SelectItem>
            {congregationOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <Card className="rounded-2xl border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {loadError}
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              Próximos 7 dias
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum aniversário nos próximos 7 dias.</p>
            ) : (
              upcoming.map((c) => (
                <CelebrationRow
                  key={`${c.person.id}-${c.kind}`}
                  c={c}
                  token={photoToken}
                  highlight={c.inDays === 0}
                  dateLabel={
                    c.inDays === 0
                      ? 'Hoje'
                      : `${String(c.day).padStart(2, '0')}/${String(c.month).padStart(2, '0')}`
                  }
                />
              ))
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                {MONTH_NAMES[month - 1]} {year !== todayParts.year ? year : ''}
              </h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Mês anterior"
                  onClick={() => shiftMonth(-1)}
                  className="h-8 w-8 rounded-lg"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Próximo mês"
                  onClick={() => shiftMonth(1)}
                  className="h-8 w-8 rounded-lg"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {monthList.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-8 text-center text-sm text-slate-500">
                Nenhum aniversário cadastrado em {MONTH_NAMES[month - 1].toLowerCase()}.
              </Card>
            ) : (
              monthList.map((c) => (
                <CelebrationRow
                  key={`${c.person.id}-${c.kind}`}
                  c={c}
                  token={photoToken}
                  highlight={
                    month === todayParts.month &&
                    year === todayParts.year &&
                    c.day === todayParts.day
                  }
                  dateLabel={String(c.day).padStart(2, '0')}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}
