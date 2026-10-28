import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationsBell } from '@/components/NotificationsBell'
import {
  LayoutDashboard,
  Users,
  Music2,
  CalendarDays,
  CalendarCheck2,
  Guitar,
  UserCircle,
  Settings,
  Plug,
  SlidersHorizontal,
  MonitorPlay,
  Images,
  Megaphone,
  LampCeiling,
  ListChecks,
  UserPlus,
  LogOut,
  Menu,
  X,
  ChevronsUpDown,
  ChevronsLeft,
  ChevronsRight,
  AudioLines,
  Wallet,
  ArrowLeftRight,
  FolderCog,
  HandCoins,
  CalendarClock,
  Coins,
  Landmark,
  LockKeyhole,
  Contact,
  Cake,
  PieChart,
  Footprints,
  FileBarChart,
  Ticket,
  QrCode,
  UsersRound,
  TrendingUp,
  ShieldCheck,
  Flag,
  Target,
  KeyRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  allowed: boolean
  end?: boolean
}

interface NavSection {
  label?: string
  items: NavItem[]
}

const ROLE_LABELS: Record<string, string> = {
  MASTER: 'Master',
  ADMIN: 'Administrador',
  LIDER: 'Líder de louvor',
  MUSICO: 'Músico',
}

function initials(name?: string) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/)
  return (
    (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase()
}

export default function Layout() {
  const {
    user,
    currentChurch,
    userChurches,
    role,
    isMaster,
    can,
    canAny,
    accessProfiles,
    switchChurch,
    logout,
    isAuthenticated,
  } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  if (!isAuthenticated && location.pathname === '/login') {
    return (
      <main className="min-h-screen bg-slate-50">
        <Outlet />
      </main>
    )
  }

  // O menu segue as chaves dos perfis de acesso (modulo.tela.acao): cada item aparece para
  // quem pode consultar aquela tela. As regras do servidor conferem as mesmas chaves.
  const fin = (screen: string) => can(`financeiro.${screen}.ver`)
  const mem = (screen: string) => can(`membresia.${screen}.ver`)
  const sections: NavSection[] = [
    {
      items: [
        { to: '/dashboard', label: 'Início', icon: LayoutDashboard, allowed: true },
        {
          to: '/events',
          label: 'Agenda de cultos',
          icon: CalendarDays,
          allowed: can('louvor.cultos.ver'),
        },
        {
          to: '/minhas-escalas',
          label: 'Minhas escalas',
          icon: CalendarCheck2,
          allowed: can('louvor.minhas_escalas.ver') || canAny('louvor') || canAny('culto'),
        },
        { to: '/songs', label: 'Músicas', icon: Music2, allowed: can('louvor.musicas.ver') },
      ],
    },
    {
      label: 'Equipes',
      items: [
        { to: '/som', label: 'Som', icon: SlidersHorizontal, allowed: can('culto.som.ver') },
        {
          to: '/projecao',
          label: 'Projeção',
          icon: MonitorPlay,
          allowed: can('culto.projecao.ver'),
        },
        { to: '/midias', label: 'Mídias', icon: Images, allowed: can('culto.midias.ver') },
        { to: '/avisos', label: 'Avisos', icon: Megaphone, allowed: can('culto.avisos.ver') },
        {
          to: '/iluminacao',
          label: 'Iluminação',
          icon: LampCeiling,
          allowed: can('culto.iluminacao.ver'),
        },
        { to: '/tarefas', label: 'Tarefas', icon: ListChecks, allowed: can('louvor.tarefas.ver') },
      ],
    },
    {
      label: 'Financeiro',
      items: [
        {
          to: '/financeiro',
          label: 'Painel financeiro',
          icon: Wallet,
          allowed: fin('painel'),
          end: true,
        },
        {
          to: '/financeiro/lancamentos',
          label: 'Lançamentos',
          icon: ArrowLeftRight,
          allowed: fin('lancamentos'),
        },
        {
          to: '/financeiro/contagem',
          label: 'Contagem do culto',
          icon: HandCoins,
          allowed: fin('contagem'),
        },
        {
          to: '/financeiro/contas',
          label: 'Contas a pagar e receber',
          icon: CalendarClock,
          allowed: fin('contas_pagar'),
        },
        {
          to: '/financeiro/saldos',
          label: 'Saldos e extratos',
          icon: Coins,
          allowed: fin('conciliacao'),
        },
        {
          to: '/financeiro/conciliacao',
          label: 'Conciliação bancária',
          icon: Landmark,
          allowed: fin('conciliacao'),
        },
        {
          to: '/financeiro/fluxo-de-caixa',
          label: 'Fluxo de caixa',
          icon: TrendingUp,
          allowed: fin('fluxo'),
        },
        {
          to: '/financeiro/campanhas',
          label: 'Campanhas',
          icon: Flag,
          allowed: fin('campanhas'),
        },
        {
          to: '/financeiro/orcamento',
          label: 'Orçamento',
          icon: Target,
          allowed: fin('orcamento'),
        },
        {
          to: '/financeiro/fechamento',
          label: 'Fechamento do mês',
          icon: LockKeyhole,
          allowed: fin('fechamento'),
        },
        {
          to: '/financeiro/auditoria',
          label: 'Auditoria',
          icon: ShieldCheck,
          allowed: fin('auditoria'),
        },
        {
          to: '/financeiro/relatorios',
          label: 'Relatórios',
          icon: FileBarChart,
          allowed: fin('relatorios'),
        },
        {
          to: '/financeiro/cadastros',
          label: 'Cadastros',
          icon: FolderCog,
          allowed: fin('cadastros'),
        },
      ],
    },
    {
      label: 'Membresia',
      items: [
        { to: '/membros/painel', label: 'Painel', icon: PieChart, allowed: mem('painel') },
        { to: '/membros', label: 'Membros', icon: Contact, allowed: mem('pessoas'), end: true },
        {
          to: '/membros/acompanhamento',
          label: 'Visitantes',
          icon: Footprints,
          allowed: mem('acompanhamento'),
        },
        {
          to: '/membros/grupos',
          label: 'Grupos e ministérios',
          icon: UsersRound,
          allowed: mem('grupos'),
        },
        {
          to: '/membros/eventos',
          label: 'Eventos da igreja',
          icon: Ticket,
          allowed: can('eventos.eventos.ver'),
        },
        {
          to: '/membros/aniversarios',
          label: 'Aniversariantes',
          icon: Cake,
          allowed: mem('painel'),
        },
        {
          to: '/membros/cadastros',
          label: 'Cadastros (QR)',
          icon: QrCode,
          allowed: mem('cadastros'),
        },
        {
          to: '/membros/relatorios',
          label: 'Relatórios',
          icon: FileBarChart,
          allowed: mem('relatorios'),
        },
      ],
    },
    {
      label: 'Administração',
      items: [
        {
          to: '/musicians',
          label: 'Equipe do louvor',
          icon: Users,
          allowed: can('admin.pessoas.ver'),
        },
        { to: '/convites', label: 'Convites', icon: UserPlus, allowed: can('admin.pessoas.novo') },
        {
          to: '/perfis-acesso',
          label: 'Perfis de acesso',
          icon: KeyRound,
          allowed: can('admin.pessoas.ver'),
        },
        {
          to: '/roles',
          label: 'Funções e instrumentos',
          icon: Guitar,
          allowed: can('admin.funcoes.ver'),
        },
        {
          to: '/configuracoes/integracoes',
          label: 'Integrações',
          icon: Plug,
          allowed: can('admin.integracoes.ver'),
        },
        {
          to: '/configuracoes',
          label: 'Configurações',
          icon: Settings,
          allowed: can('admin.configuracoes.ver'),
          end: true,
        },
      ],
    },
  ]
    .map((section) => ({ ...section, items: section.items.filter((item) => item.allowed) }))
    .filter((section) => section.items.length > 0)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Abaixo do nome aparece o perfil de acesso (ou "Master")
  const roleLabel = isMaster
    ? ROLE_LABELS.MASTER
    : accessProfiles.length > 0
      ? accessProfiles[0].name + (accessProfiles.length > 1 ? ` +${accessProfiles.length - 1}` : '')
      : role
        ? ROLE_LABELS[role] || role
        : ''
  const userInitials = initials(user?.name)
  const churchInitials = initials(currentChurch?.name)

  const renderNav = (isCollapsed: boolean, onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
      {sections.map((section, idx) => (
        <div key={section.label || idx} className="space-y-0.5">
          {section.label && !isCollapsed && (
            <p className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500">
              {section.label}
            </p>
          )}
          {section.label && isCollapsed && <div className="mx-3 mb-2 h-px bg-white/10" />}
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  } ${isCollapsed ? 'justify-center' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? 'text-teal-300' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      ))}
    </nav>
  )

  const churchSwitcher = (isCollapsed: boolean) => {
    const trigger = (
      <button
        type="button"
        className={`flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-[13px] font-semibold text-slate-100 transition-colors hover:bg-white/10 ${
          isCollapsed ? 'justify-center px-0' : ''
        }`}
        title={currentChurch?.name}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-400/15 text-[10.5px] font-bold text-teal-200">
          {churchInitials}
        </span>
        {!isCollapsed && (
          <>
            <span className="flex-1 truncate">{currentChurch?.name || 'Minha igreja'}</span>
            {userChurches.length > 1 && <ChevronsUpDown className="h-4 w-4 text-slate-400" />}
          </>
        )}
      </button>
    )
    if (userChurches.length <= 1) return trigger
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs text-slate-500">
            Igrejas que você participa
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {userChurches.map((church) => (
            <DropdownMenuItem
              key={church.id}
              onClick={() => switchChurch(church.id)}
              className="flex cursor-pointer items-center justify-between text-sm"
            >
              <span className="truncate">{church.name}</span>
              {church.id === currentChurch?.id && (
                <span className="h-2 w-2 rounded-full bg-teal-600" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const userMenu = (isCollapsed: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-white/5 ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-xs font-bold text-teal-200">
            {userInitials}
          </span>
          {!isCollapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white">
                {user?.name || 'Usuário'}
              </span>
              <span className="block truncate text-[11.5px] text-slate-400">{roleLabel}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer gap-2">
          <UserCircle className="h-4 w-4" /> Meu perfil
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer gap-2 text-red-600 focus:text-red-700"
        >
          <LogOut className="h-4 w-4" /> Sair da conta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const brand = (isCollapsed: boolean) => (
    <div className={`flex items-center gap-2.5 ${isCollapsed ? 'justify-center' : ''}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-teal-400 to-teal-700 text-white shadow-sm">
        <AudioLines className="h-5 w-5" />
      </div>
      {!isCollapsed && (
        <div className="min-w-0">
          <p className="text-[15.5px] font-bold leading-tight tracking-tight text-white">
            LouvorFlow
          </p>
          <p className="text-[11.5px] text-slate-400">Gestão ministerial</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* BARRA LATERAL (≥ 1024px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col gap-4 bg-slate-950 py-4 transition-[width] duration-200 lg:flex print:!hidden ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <div className="px-4">{brand(collapsed)}</div>
        <div className="px-3">{churchSwitcher(collapsed)}</div>
        {renderNav(collapsed)}
        <div className="space-y-1 border-t border-white/10 px-3 pt-3">
          {userMenu(collapsed)}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" /> Recolher menu
              </>
            )}
          </button>
        </div>
      </aside>

      {/* BARRA SUPERIOR NO CELULAR (< 1024px) */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 lg:hidden print:hidden">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Abrir menu de navegação"
            className="h-10 w-10 rounded-lg text-slate-700"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight text-slate-900">LouvorFlow</p>
            <p className="max-w-[180px] truncate text-[11px] text-slate-500">
              {currentChurch?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationsBell />
          <NavLink
            to="/perfil"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800"
          >
            {userInitials}
          </NavLink>
        </div>
      </header>

      {/* MENU LATERAL NO CELULAR */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-4/5 max-w-xs animate-slide-right flex-col gap-4 bg-slate-950 py-4 shadow-2xl">
            <div className="flex items-center justify-between px-4">
              {brand(false)}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Fechar menu"
                className="h-8 w-8 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="px-3">{churchSwitcher(false)}</div>
            {renderNav(false, () => setMobileDrawerOpen(false))}
            <div className="border-t border-white/10 px-3 pt-3">{userMenu(false)}</div>
          </div>
        </div>
      )}

      {/* ÁREA PRINCIPAL */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col pt-14 transition-[margin] duration-200 lg:pt-0 print:!ml-0 print:!pt-0 ${
          collapsed ? 'lg:ml-[76px]' : 'lg:ml-64'
        }`}
      >
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-2 border-b border-slate-200 bg-white/80 px-8 backdrop-blur lg:flex print:!hidden">
          <NotificationsBell />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 animate-fade-in p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
