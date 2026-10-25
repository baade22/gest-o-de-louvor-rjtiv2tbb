import React from 'react'
import type { Church, Person } from '@/types'
import { personPhotoUrl } from '@/services/people'
import { PERSON_STATUS_LABELS } from '@/lib/membership'
import { formatCalendarDateDisplay } from '@/lib/dateUtils'

// Tamanho de cartão de crédito (ISO 7810 ID-1)
const CARD = 'font-sans w-[85.6mm] h-[54mm] rounded-[3mm] overflow-hidden border border-slate-300 bg-white relative shrink-0'

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function date(d?: string) {
  return d ? formatCalendarDateDisplay(d, 'numeric') : '—'
}

export function MemberCardFront({ person, church, token }: { person: Person; church: Church; token: string }) {
  const photo = personPhotoUrl(person, token, false)
  return (
    <div className={CARD}>
      <div className="h-[13mm] bg-teal-700 text-white px-[4mm] flex items-center gap-[2.5mm]">
        <div className="h-[8mm] w-[8mm] rounded-full bg-white/20 flex items-center justify-center text-[3mm] font-bold">
          {initials(church.name)}
        </div>
        <div className="leading-tight min-w-0">
          <p className="text-[3.2mm] font-bold truncate">{church.name}</p>
          <p className="text-[2.3mm] text-teal-100 uppercase tracking-wider">Carteira de membro</p>
        </div>
      </div>
      <div className="flex gap-[3.5mm] px-[4mm] pt-[3mm]">
        {photo ? (
          <img src={photo} alt="" className="h-[28mm] w-[22mm] object-cover rounded-[1.5mm] border border-slate-200" />
        ) : (
          <div className="h-[28mm] w-[22mm] rounded-[1.5mm] bg-teal-50 border border-teal-100 text-teal-800 font-bold text-[7mm] flex items-center justify-center">
            {initials(person.name)}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-[1.6mm]">
          <div>
            <p className="text-[2.2mm] uppercase text-slate-500">Nome</p>
            <p className="text-[3.4mm] font-bold text-slate-900 leading-tight">{person.name}</p>
          </div>
          <div className="flex gap-[4mm]">
            <div>
              <p className="text-[2.2mm] uppercase text-slate-500">Situação</p>
              <p className="text-[2.9mm] font-semibold text-slate-800">{PERSON_STATUS_LABELS[person.status]}</p>
            </div>
            {person.roll_number && (
              <div>
                <p className="text-[2.2mm] uppercase text-slate-500">Nº do rol</p>
                <p className="text-[2.9mm] font-semibold text-slate-800">{person.roll_number}</p>
              </div>
            )}
          </div>
          {(person.congregation || person.church_office) && (
            <div>
              <p className="text-[2.2mm] uppercase text-slate-500">
                {person.church_office ? 'Cargo' : 'Congregação'}
              </p>
              <p className="text-[2.9mm] font-semibold text-slate-800 truncate">
                {person.church_office || person.congregation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function MemberCardBack({ person, church }: { person: Person; church: Church }) {
  return (
    <div className={CARD}>
      <div className="px-[4mm] pt-[4mm] grid grid-cols-2 gap-x-[4mm] gap-y-[2.2mm]">
        <div>
          <p className="text-[2.2mm] uppercase text-slate-500">Nascimento</p>
          <p className="text-[2.9mm] font-semibold text-slate-800">{date(person.birth_date)}</p>
        </div>
        <div>
          <p className="text-[2.2mm] uppercase text-slate-500">Batismo</p>
          <p className="text-[2.9mm] font-semibold text-slate-800">{date(person.baptism_date)}</p>
        </div>
        <div>
          <p className="text-[2.2mm] uppercase text-slate-500">Membro desde</p>
          <p className="text-[2.9mm] font-semibold text-slate-800">{date(person.admission_date)}</p>
        </div>
        <div>
          <p className="text-[2.2mm] uppercase text-slate-500">Congregação</p>
          <p className="text-[2.9mm] font-semibold text-slate-800 truncate">{person.congregation || '—'}</p>
        </div>
      </div>
      <div className="absolute left-[4mm] right-[4mm] bottom-[4mm]">
        <div className="border-t border-slate-400 pt-[0.8mm] text-center">
          <p className="text-[2.6mm] font-semibold text-slate-800 leading-tight">
            {church.doc_signer_name || 'Assinatura do pastor'}
          </p>
          <p className="text-[2.2mm] text-slate-500">{church.doc_signer_title || 'Pastor'}</p>
        </div>
        {church.doc_city && (
          <p className="text-[2.1mm] text-slate-400 text-center mt-[1mm]">
            {church.name} · {church.doc_city}
          </p>
        )}
      </div>
    </div>
  )
}
