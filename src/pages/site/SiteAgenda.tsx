// Agenda pública: eventos marcados "mostrar no site" (com capa e inscrição) e cultos.

import { useMemo, useState } from 'react'
import { groupByMonth } from '@/lib/site'
import { useSite } from './siteContext'
import { AgendaRow, EventCard, PageTitle, Pills } from './siteParts'

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
  const hasBoth =
    site.agenda.some((i) => i.kind === 'CULTO') && site.agenda.some((i) => i.kind === 'EVENTO')

  return (
    <div className="space-y-5 px-4 pt-2 lg:space-y-8 lg:px-8 lg:pt-10">
      <PageTitle>Agenda</PageTitle>

      {featured.length > 0 && filter !== 'CULTO' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {featured.map((it) => (
            <EventCard key={it.id} item={it} />
          ))}
        </div>
      )}

      {hasBoth && (
        <Pills
          value={filter}
          onChange={setFilter}
          options={[
            ['TUDO', 'Tudo'],
            ['CULTO', 'Cultos'],
            ['EVENTO', 'Eventos'],
          ]}
        />
      )}

      {groups.length === 0 && (
        <p className="c-card p-8 text-center font-medium text-[var(--c-gray)]">
          Nada marcado por enquanto. Volte em breve!
        </p>
      )}

      {groups.map((g) => (
        <section key={g.label} className="space-y-2.5">
          <p className="pt-1 text-[22px] font-extrabold tracking-tight first-letter:uppercase">
            {g.label}
          </p>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {g.items.map((it) => (
              <AgendaRow
                key={`${it.kind}-${it.id}`}
                item={it}
                siteTitle={site.title}
                address={site.address}
              />
            ))}
          </div>
        </section>
      ))}
      <p className="text-center text-xs font-medium text-[var(--c-gray)]">
        Toque no calendário ao lado de cada item para salvar na agenda do celular.
      </p>
    </div>
  )
}
