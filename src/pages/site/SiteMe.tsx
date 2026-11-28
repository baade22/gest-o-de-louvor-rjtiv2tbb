// Aba "Eu": a área do membro (estilo "painel do dia", escolhido pelo Pedro em 28/11/2026).
// Sem sessão mostra a tela de entrar (código pelo WhatsApp). Logado: primeiro o que pede ação
// (cadastro incompleto, evento chegando, escala a confirmar), depois os atalhos.
// Quem é da equipe também vê o atalho para o LouvorFlow.

import { Link } from 'react-router-dom'
import {
  CalendarCheck2,
  Gift,
  HeartHandshake,
  IdCard,
  LogOut,
  Music,
  Ticket,
  UserRound,
  UsersRound,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { daysUntil, firstName, missingLabel, untilLabel } from '@/lib/memberArea'
import { formatTime } from '@/lib/site'
import { todayBrazil } from '@/lib/eventPage'
import { useSite } from './siteContext'
import { DateBadge } from './siteParts'
import MemberLogin from './member/MemberLogin'
import { Avatar, RowLink, Spinner, useMemberMe } from './member/memberParts'

const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function whenText(date: string, time: string, today: string) {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`)
  const wd = Number.isNaN(d.getTime()) ? '' : WEEKDAY[d.getUTCDay()]
  const t = time ? formatTime(time) : ''
  const left = untilLabel(daysUntil(date, today))
  return [wd && t ? `${wd} ${t}` : wd || t, left].filter(Boolean).join(' · ')
}

export default function SiteMe() {
  const { site, to } = useSite()
  const { me, error, loading, logged, reload } = useMemberMe(false)

  const logout = () => {
    pb.authStore.clear()
    reload()
  }

  if (loading) return <Spinner />
  if (!logged) return <MemberLogin onLogged={reload} />

  if (!me) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 pt-2 lg:pt-10">
        <h1 className="text-[28px] font-extrabold leading-none tracking-tight">Eu</h1>
        <div className="c-card space-y-2 p-5">
          <p className="text-[15px] font-bold">
            {error?.no_profile
              ? 'Sua conta ainda não tem ficha nesta igreja'
              : 'Não deu para abrir'}
          </p>
          <p className="text-[13.5px] font-medium text-[var(--c-gray)]">
            {error?.no_profile
              ? 'Peça à secretaria para ligar a sua conta à sua ficha em Membros.'
              : error?.message}
          </p>
        </div>
        <div className="c-card divide-y divide-[#eef1f5] py-1">
          <RowLink to="/dashboard" icon={Music} title="Abrir o LouvorFlow" />
          <RowLink onClick={logout} icon={LogOut} title="Sair" right={<span />} />
        </div>
      </div>
    )
  }

  const today = todayBrazil()
  const p = me.profile
  const { percent, missing } = me.completeness
  const scale = me.next_scale
  const shortcuts = [
    ...(site.sections.contribuir !== false && site.pix
      ? [{ to: to('/contribuir'), icon: Gift, label: 'Contribuir' }]
      : []),
    ...(me.card ? [{ to: to('/eu/carteirinha'), icon: IdCard, label: 'Carteirinha' }] : []),
    { to: to('/eu/familia'), icon: UsersRound, label: 'Família' },
    { to: to('/eu/dados'), icon: UserRound, label: 'Meus dados' },
  ]

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pt-2 lg:pt-10">
      <div className="flex items-center gap-3 pb-2">
        <Avatar name={p.name} />
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight">
          Olá, {firstName(p.name)}
        </h1>
        <button
          type="button"
          onClick={logout}
          aria-label="Sair"
          title="Sair"
          className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white text-[var(--c-gray)] shadow-[0_2px_8px_rgba(20,34,58,0.06)]"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>

      {percent < 100 && (
        <Link to={to('/eu/dados')} className="block rounded-[22px] bg-[#fcf3e1] p-4 text-[#6b4a12]">
          <span className="flex items-center justify-between gap-3">
            <b className="text-[15px] font-extrabold text-[var(--c-ink)]">
              Seu cadastro está {percent}% completo
            </b>
            <span className="shrink-0 text-[12.5px] font-extrabold">Completar</span>
          </span>
          <span className="my-2.5 block h-2 overflow-hidden rounded bg-[#f1dfbc]">
            <span
              className="block h-full rounded bg-[var(--sa,#c8963e)]"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="block text-[12.5px] font-semibold">{missingLabel(missing)}</span>
        </Link>
      )}

      {me.registrations.map((r) => (
        <div key={r.id} className="c-card flex items-center gap-3 p-3.5">
          <DateBadge date={r.date} />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[15px] font-bold">{r.event}</b>
            <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
              {whenText(r.date, r.time, today)}
            </span>
          </span>
          <span
            className={
              'inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold ' +
              (r.paid || !r.amount_due
                ? 'bg-[#ddf3e8] text-[#1f8a5b]'
                : 'bg-[#fcf3e1] text-[#b7791f]')
            }
          >
            <Ticket className="h-3.5 w-3.5" />
            {r.paid ? 'Pago' : r.amount_due ? 'Falta pagar' : 'Inscrito'}
          </span>
        </div>
      ))}

      {scale && (
        <Link to="/minhas-escalas" className="c-card flex items-center gap-3 p-3.5">
          <DateBadge date={scale.date} className="bg-[#e9e2f7] text-[#4b3591]" />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[15px] font-bold">
              Escala{scale.role ? `: ${scale.role}` : ''}
            </b>
            <span className="block truncate text-[12.5px] font-medium text-[var(--c-gray)]">
              {scale.event} · {whenText(scale.date, scale.time, today)}
            </span>
          </span>
          <span
            className={
              'shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold ' +
              (scale.status === 'CONFIRMADO'
                ? 'bg-[#ddf3e8] text-[#1f8a5b]'
                : scale.status === 'RECUSADO'
                  ? 'bg-[#eef1f5] text-[var(--c-gray)]'
                  : 'bg-[#fcf3e1] text-[#b7791f]')
            }
          >
            {scale.status === 'CONFIRMADO'
              ? 'Confirmada'
              : scale.status === 'RECUSADO'
                ? 'Recusada'
                : 'Confirmar'}
          </span>
        </Link>
      )}

      <div
        className="grid gap-2 pt-1"
        style={{ gridTemplateColumns: `repeat(${shortcuts.length}, minmax(0, 1fr))` }}
      >
        {shortcuts.map((s) => {
          const Icon = s.icon
          return (
            <Link
              key={s.label}
              to={s.to}
              className="c-card flex flex-col items-center gap-2 px-1 pb-2.5 pt-3 text-center text-[11.5px] font-bold"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--c-sky)] text-[var(--c-blue)]">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {s.label}
            </Link>
          )
        })}
      </div>

      <div className="c-card divide-y divide-[#eef1f5] py-1">
        <RowLink
          to={to('/eu/dados')}
          icon={UserRound}
          title="Meus dados"
          hint="Contato, endereço e CPF"
        />
        {site.sections.oracao !== false && (
          <RowLink to={to('/oracao')} icon={HeartHandshake} title="Pedir oração" />
        )}
        {me.team && (
          <>
            <RowLink to="/minhas-escalas" icon={CalendarCheck2} title="Minhas escalas" />
            <RowLink
              to="/dashboard"
              icon={Music}
              title="Abrir o LouvorFlow"
              hint="Gestão da equipe"
            />
          </>
        )}
      </div>
    </div>
  )
}
