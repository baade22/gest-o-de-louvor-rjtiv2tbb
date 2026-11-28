// Quem lê o QR da carteirinha cai aqui: mostra se ela vale, de quem é e a situação. Nada mais.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BadgeCheck, Loader2, ShieldAlert } from 'lucide-react'
import { checkMemberCard, type MemberCardCheck } from '@/services/member'

export default function CardCheck() {
  const { code = '' } = useParams()
  const [res, setRes] = useState<MemberCardCheck | null>(null)

  useEffect(() => {
    checkMemberCard(code).then(setRes)
  }, [code])

  if (!res) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--c-gray)]" />
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md px-4 pt-6 lg:pt-12">
      <div className="c-card p-6 text-center">
        <span
          className={
            'mx-auto grid h-16 w-16 place-items-center rounded-[20px] ' +
            (res.valid ? 'bg-[#ddf3e8] text-[#1f8a5b]' : 'bg-[#fdecea] text-[#c0392b]')
          }
        >
          {res.valid ? <BadgeCheck className="h-8 w-8" /> : <ShieldAlert className="h-8 w-8" />}
        </span>
        <p className="mt-4 text-[22px] font-extrabold">
          {res.valid ? 'Carteirinha válida' : 'Carteirinha não vale'}
        </p>
        {res.name && <p className="mt-2 text-[17px] font-bold">{res.name}</p>}
        {res.church_name && (
          <p className="text-[13.5px] font-medium text-[var(--c-gray)]">
            {[res.status, res.church_name, res.congregation].filter(Boolean).join(' · ')}
          </p>
        )}
        {!res.valid && !res.name && (
          <p className="mt-2 text-[13.5px] font-medium text-[var(--c-gray)]">
            Este código não é de nenhuma carteirinha.
          </p>
        )}
      </div>
    </div>
  )
}
