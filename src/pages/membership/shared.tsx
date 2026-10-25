import React, { useEffect, useState } from 'react'
import type { Person, PersonStatus } from '@/types'
import { getPhotoToken, personPhotoUrl } from '@/services/people'
import { PERSON_STATUS_LABELS } from '@/lib/membership'
import { Badge } from '@/components/ui/badge'

export const STATUS_BADGE_CLASSES: Record<PersonStatus, string> = {
  MEMBRO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CONGREGADO: 'bg-sky-50 text-sky-800 border-sky-200',
  VISITANTE: 'bg-amber-50 text-amber-800 border-amber-200',
  AFASTADO: 'bg-slate-100 text-slate-600 border-slate-200',
  TRANSFERIDO: 'bg-violet-50 text-violet-800 border-violet-200',
  FALECIDO: 'bg-slate-200 text-slate-700 border-slate-300',
}

export function StatusBadge({ status }: { status: PersonStatus }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${STATUS_BADGE_CLASSES[status]}`}>
      {PERSON_STATUS_LABELS[status]}
    </Badge>
  )
}

/** Token para as fotos protegidas; renova a cada 2 minutos enquanto a tela está aberta. */
export function usePhotoToken(enabled = true): string {
  const [token, setToken] = useState('')
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () =>
      getPhotoToken()
        .then((t) => alive && setToken(t))
        .catch(() => {})
    load()
    const timer = window.setInterval(load, 120000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [enabled])
  return token
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function PersonAvatar({
  person,
  token,
  size = 'md',
}: {
  person: Person
  token: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const url = personPhotoUrl(person, token)
  const dims =
    size === 'lg' ? 'h-24 w-24 text-2xl' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-12 w-12 text-base'
  if (url) {
    return (
      <img
        src={url}
        alt={person.name}
        className={`${dims} rounded-full object-cover border border-slate-200 shrink-0`}
      />
    )
  }
  return (
    <div
      className={`${dims} rounded-full bg-teal-50 text-teal-800 font-bold flex items-center justify-center shrink-0 border border-teal-100`}
    >
      {initials(person.name) || 'M'}
    </div>
  )
}

export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { data?: { message?: string }; message?: string; status?: number }
  if (e?.status === 404) {
    return 'O cadastro de membros ainda não existe no servidor. Publique a versão nova do backend.'
  }
  if (e?.status === 403) return 'Só administradores da igreja podem ver e editar as fichas.'
  return e?.data?.message || e?.message || fallback
}

export function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold text-slate-900 mt-1">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}
