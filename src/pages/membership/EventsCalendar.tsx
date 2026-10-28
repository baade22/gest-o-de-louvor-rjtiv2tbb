// Calendário do mês com os eventos da igreja (os de vários dias aparecem em cada dia).

import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ChurchEvent } from '@/types'
import { eventColor, eventsOnDay, monthWeeks } from '@/lib/eventPage'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function EventsCalendar({ events, today }: { events: ChurchEvent[]; today: string }) {
  const [ym, setYm] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }))
  const shift = (delta: number) =>
    setYm(({ year, month }) => {
      const i = year * 12 + (month - 1) + delta
      return { year: Math.floor(i / 12), month: (i % 12) + 1 }
    })
  const weeks = monthWeeks(ym.year, ym.month)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <h2 className="font-bold text-slate-900">
          {MONTH_NAMES[ym.month - 1]} de {ym.year}
        </h2>
        <div className="ml-auto flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => shift(-1)}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() =>
              setYm({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })
            }
          >
            Hoje
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => shift(1)}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-500 border-b border-slate-100">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, i) => (
        <div key={i} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
          {week.map((day, j) => {
            const list = day ? eventsOnDay(events, day) : []
            return (
              <div
                key={j}
                className={`min-h-20 sm:min-h-24 p-1 border-r border-slate-100 last:border-r-0 ${
                  day ? '' : 'bg-slate-50'
                }`}
              >
                {day && (
                  <p
                    className={`text-xs font-semibold mb-1 h-5 w-5 flex items-center justify-center rounded-full ${
                      day === today ? 'bg-teal-700 text-white' : 'text-slate-600'
                    }`}
                  >
                    {Number(day.slice(8))}
                  </p>
                )}
                <div className="space-y-0.5">
                  {list.map((e) => (
                    <Link
                      key={e.id}
                      to={`/membros/eventos/${e.id}`}
                      title={e.title}
                      className="block truncate rounded px-1 py-0.5 text-[10px] sm:text-[11px] font-medium text-white hover:opacity-90"
                      style={{ background: eventColor(e.color) }}
                    >
                      {e.start_time && day === (e.starts_on || '').slice(0, 10)
                        ? `${e.start_time} `
                        : ''}
                      {e.title}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
