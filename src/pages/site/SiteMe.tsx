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
import { Card, SectionTitle } from './siteParts'

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
    { to: '/perfil', icon: UserPen, title: 'Meus dados', hint: 'Telefone, senha e foto' },
    {
      to: '/dashboard',
      icon: LayoutDashboard,
      title: 'Abrir o LouvorFlow',
      hint: 'Tudo o que seu acesso libera',
    },
  ]

  return (
    <div className="space-y-5 px-4 pt-5 lg:px-8 lg:pt-10">
      <SectionTitle>{logged && name ? `Olá, ${name}` : 'Eu'}</SectionTitle>
      <div className="mx-auto max-w-lg space-y-4">
        {logged ? (
          <Card className="divide-y divide-stone-100 p-0">
            {rows.map((r) => {
              const Icon = r.icon
              return (
                <Link key={r.to} to={r.to} className="flex items-center gap-3 p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-stone-100 text-[var(--sp)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{r.title}</span>
                    <span className="block text-[13px] text-slate-500">{r.hint}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </Link>
              )
            })}
          </Card>
        ) : (
          <Card className="space-y-3 p-6 text-center">
            <p className="text-slate-600">
              Quem serve na igreja entra para ver as escalas, o repertório e os próprios dados.
            </p>
            <Link
              to="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sp)] px-4 py-3 font-semibold text-[var(--sp-text)]"
            >
              <LogIn className="h-5 w-5" /> Entrar
            </Link>
          </Card>
        )}
        {site.sections.novo && site.signup_url && (
          <Link
            to={site.signup_url}
            className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Primeira vez aqui?</span>
              <span className="block text-[13px] text-slate-500">
                Deixe seu contato e a igreja fala com você
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </Link>
        )}
      </div>
    </div>
  )
}
