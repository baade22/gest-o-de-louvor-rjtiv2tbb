// Peças do painel Site e App (campo com rótulo e caixa de seção), usadas em várias abas.

import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-slate-700">{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function Box({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[12rem] flex-1">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-sm text-slate-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
