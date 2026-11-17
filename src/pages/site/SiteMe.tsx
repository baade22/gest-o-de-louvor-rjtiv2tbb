// Aba "Eu": quem tem conta entra e chega às telas que já existem (escalas, perfil, painel).
// A versão completa (inscrições, carteirinha, contribuições) é a etapa 2.

import { Link } from 'react-router-dom'
import {
  CalendarCheck2,
  ChevronRight,
  LayoutDashboard,
  LogIn,
  Sparkles,
  UserPen,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useSite } from './siteContext'
import { Card, PageTitle } from './siteParts'

export default function SiteMe() {
  const { site } = useSite()
  const logged = pb.authStore.isValid
  const name = String((pb.authStore.record as { name?: string } | null)?.name || '').split(' ')[0]

  const rows = [
    {
      to: '/minhas-escalas',
      icon: CalendarCheck2,
      title: 'Minhas escalas',
      hint: 'Confirmar e ver o repertório',
    },
    {
      to: '/perfil',
      icon: UserPen,
      title: 'Meus dados',
      hint: 'Telefone, senha e foto',
    },
    {
      to: '/dashboard',
      icon: LayoutDashboard,
      title: 'Abrir o LouvorFlow',
      hint: 'Tudo o que seu acesso libera',
    },
  ]

  return (
    <div className="space-y-5 px-4 pt-2 lg:px-8 lg:pt-10">
      <PageTitle>{logged && name ? `Olá, ${name}` : 'Eu'}</PageTitle>
      <div className="mx-auto max-w-lg space-y-4">
        {logged ? (
          <Card className="divide-y divide-[#eef1f5] p-0 py-1">
            {rows.map((r) => {
              const Icon = r.icon
              return (
                <Link key={r.to} to={r.to} className="flex items-center gap-3.5 px-4 py-3">
                  <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[var(--c-sky)] text-[var(--c-blue)]">
                    <Icon className="h-[19px] w-[19px]" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-bold">{r.title}</span>
                    <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
                      {r.hint}
                    </span>
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] text-[#b3bbc7]" />
                </Link>
              )
            })}
          </Card>
        ) : (
          <Card className="space-y-3 p-6 text-center">
            <p className="font-medium text-[var(--c-gray)]">
              Quem serve na igreja entra para ver as escalas, o repertório e os próprios dados.
            </p>
            <Link
              to="/login"
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] px-4 font-extrabold text-[var(--sp-text)]"
            >
              <LogIn className="h-5 w-5" /> Entrar
            </Link>
          </Card>
        )}
        {site.sections.novo && site.signup_url && (
          <Link to={site.signup_url} className="c-card flex items-center gap-3.5 p-4">
            <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[var(--c-sky)] text-[var(--c-blue)]">
              <Sparkles className="h-[19px] w-[19px]" />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-bold">Primeira vez aqui?</span>
              <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
                Deixe seu contato e a igreja fala com você
              </span>
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-[#b3bbc7]" />
          </Link>
        )}
      </div>
    </div>
  )
}
