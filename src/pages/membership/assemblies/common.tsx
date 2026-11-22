import React from 'react'
import type { Church, Person } from '@/types'
import type { Assembly, AssemblyAttendee, AssemblyCandidate, AssemblyItem } from '@/lib/assemblies'
import { Label } from '@/components/ui/label'

/** Tudo o que as abas da assembleia usam (carregado uma vez em AssemblyDetail). */
export interface AssemblyCtx {
  assembly: Assembly
  items: AssemblyItem[]
  candidates: AssemblyCandidate[]
  attendees: AssemblyAttendee[]
  people: Person[]
  peopleById: Map<string, Person>
  church: Church
  reload: () => Promise<void>
  /** Ata finalizada: nada muda até reabrir. */
  locked: boolean
  canEdit: boolean
  canTally: boolean
  canAta: boolean
}

export const inputClass = 'rounded-xl border-slate-200'
export const selectClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-60'

export function Field({
  id,
  label,
  hint,
  children,
  className = '',
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}

export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** "2026-11-22" a partir do campo de data do PocketBase. */
export const ymd = (v?: string) => (v ? v.slice(0, 10) : '')
export const toPbDate = (v: string) => (v ? `${v} 00:00:00.000Z` : '')
