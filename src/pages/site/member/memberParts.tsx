// Peças da área do membro (/igreja/eu): avatar, linha de lista, título com voltar e o carregamento
// dos dados da pessoa logada.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, type LucideIcon } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/memberArea'
import {
  getMemberMe,
  memberError,
  refreshMemberSession,
  type MemberApiError,
  type MemberMe,
} from '@/services/member'
import { useSite } from '../siteContext'

const AVATAR_TONES = [
  'from-[#3E6CA8] to-[#14223A]',
  'from-[#C8963E] to-[#8A5D1C]',
  'from-[#4BA37C] to-[#1F6B4B]',
  'from-[#7B61C4] to-[#3F2D86]',
]

export function Avatar({
  name,
  tone = 0,
  className,
}: {
  name: string
  tone?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[15px] font-extrabold text-white',
        AVATAR_TONES[tone % AVATAR_TONES.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

export function IconCircle({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--c-sky)] text-[var(--c-blue)]',
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  )
}

/** Linha de lista com ícone, título, dica e seta. */
export function RowLink({
  to,
  href,
  onClick,
  icon,
  title,
  hint,
  right,
}: {
  to?: string
  href?: string
  onClick?: () => void
  icon?: LucideIcon
  title: string
  hint?: string
  right?: ReactNode
}) {
  const body = (
    <>
      {icon && <IconCircle icon={icon} />}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{title}</span>
        {hint && (
          <span className="block text-[12.5px] font-medium leading-snug text-[var(--c-gray)]">
            {hint}
          </span>
        )}
      </span>
      {right ?? <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#b3bbc7]" />}
    </>
  )
  const cls = 'flex w-full items-center gap-3.5 px-4 py-3 text-left'
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {body}
      </a>
    )
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

/** Título de tela interna com o botão de voltar para o Eu. */
export function BackTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { to } = useSite()
  return (
    <div className="flex items-center gap-3">
      <Link
        to={to('/eu')}
        aria-label="Voltar"
        className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(20,34,58,0.06)]"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-[24px] font-extrabold tracking-tight lg:text-3xl">
        {children}
      </h1>
      {action}
    </div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mx-1 mb-2.5 mt-5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--c-gray)]">
      {children}
    </p>
  )
}

export function Spinner() {
  return (
    <div className="grid place-items-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--c-gray)]" />
    </div>
  )
}

/** Dados da pessoa logada; sem sessão, manda de volta para o Eu (tela de entrar). */
export function useMemberMe(requireLogin = true) {
  const { slug, to } = useSite()
  const navigate = useNavigate()
  const [me, setMe] = useState<MemberMe | null>(null)
  const [error, setError] = useState<MemberApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [logged, setLogged] = useState(pb.authStore.isValid)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const ok = await refreshMemberSession()
    setLogged(ok)
    if (!ok) {
      setMe(null)
      setLoading(false)
      if (requireLogin) navigate(to('/eu'), { replace: true })
      return
    }
    try {
      setMe(await getMemberMe(slug))
    } catch (err) {
      setMe(null)
      setError(memberError(err))
    } finally {
      setLoading(false)
    }
  }, [slug, to, navigate, requireLogin])

  useEffect(() => {
    load()
  }, [load])

  return { me, error, loading, logged, reload: load }
}
