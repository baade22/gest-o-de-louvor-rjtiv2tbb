// Agenda pública: eventos marcados "mostrar no site" (com capa e inscrição) e cultos.

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { groupByMonth } from '@/lib/site'
import { useSite } from './siteContext'
import { AgendaRow, EventCard, SectionTitle } from './siteParts'

type Filter = 'TUDO' | 'CULTO' | 'EVENTO'

export default function SiteAgenda() {
  const { site } = useSite()
  const [filter, setFilter] = useState<Filter>('TUDO')
  const items = useMemo(
    () => site.agenda.filter((it) => filter === 'TUDO' || it.kind === filter),
    [site.agenda, filter],
  )
  const featured = site.agenda.filter((it) => it.kind === 'EVENTO' && it.signup_open).slice(0, 2)
  const groups = groupByMonth(items)
  const hasBoth = site.agenda.some((i) => i.kind === 'CULTO') && site.agenda.some((i) => i.kind === 'EVENTO')

  return (
    <div className="space-y-5 px-4 pt-5 lg:space-y-8 lg:px-8 lg:pt-10">
      <SectionTitle>Agenda</SectionTitle>

      {featured.length > 0 && filter !== 'CULTO' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {featured.map((it) => (
            <EventCard key={it.id} item={it} />
          ))}
        </div>
      )}

      {hasBoth && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['TUDO', 'Tudo'],
              ['CULTO', 'Cultos'],
              ['EVENTO', 'Eventos'],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                'rounded-xl border px-3.5 py-1.5 text-sm font-semibold',
                filter === k
                  ? 'border-[var(--sp)] bg-[var(--sp)] text-[var(--sp-text)]'
                  : 'border-stone-200 bg-white text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {groups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-slate-500">
          Nada marcado por enquanto. Volte em breve!
        </p>
      )}

      {groups.map((g) => (
        <section key={g.label} className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{g.label}</p>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {g.items.map((it) => (
              <AgendaRow key={`${it.kind}-${it.id}`} item={it} siteTitle={site.title} address={site.address} />
            ))}
          </div>
        </section>
      ))}
      <p className="text-center text-xs text-slate-400">
        Toque no calendário ao lado de cada item para salvar na agenda do celular.
      </p>
    </div>
  )
}
