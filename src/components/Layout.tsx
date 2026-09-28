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
  Sliders,
  UserCircle,
  Settings,
  Zap,
  Volume2,
  Tv,
  Image as ImageIcon,
  Sun,
  CheckSquare,
  UserPlus,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Church as ChurchIcon,
  Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function Layout() {
  const {
    user,
    currentChurch,
    userChurches,
    role,
    operationalRoles,
    isMaster,
    isAdmin,
    isLeader,
    hasModule,
    hasOperationalRole,
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

  // Definição dos itens de navegação baseado nas regras e permissões:
  // MASTER: 100% dos módulos
  // MÚSICO (somente): Início, Minhas Escalas, Músicas, Meu Perfil. NÃO exibe Som, Projeção, Mídia, Iluminação, Usuários, Integrações, Configurações
  // SOM: Início, Minhas Escalas, Eventos, Som, Meu Perfil
  // PROJEÇÃO: Início, Minhas Escalas, Eventos, Projeção, Mídias, Meu Perfil
  // MÍDIA: Início, Minhas Escalas, Eventos, Mídias, Tarefas, Meu Perfil
  // ILUMINAÇÃO: Início, Minhas Escalas, Eventos, Iluminação, Meu Perfil
  // UNIÃO: usuário com múltiplas funções operacionais vê a união perfeita
  const canSeeSongs = isMaster || isAdmin || isLeader || hasOperationalRole('MUSICO')
  const canSeeEvents =
    isMaster ||
    isAdmin ||
    isLeader ||
    hasOperationalRole('SOM') ||
    hasOperationalRole('PROJECAO') ||
    hasOperationalRole('MIDIA') ||
    hasOperationalRole('ILUMINACAO')
  const canSeeSound = isMaster || isAdmin || hasOperationalRole('SOM')
  const canSeeProjection = isMaster || isAdmin || hasOperationalRole('PROJECAO')
  const canSeeMedia =
    isMaster || isAdmin || hasOperationalRole('MIDIA') || hasOperationalRole('PROJECAO')
  const canSeeLighting = isMaster || isAdmin || hasOperationalRole('ILUMINACAO')
  const canSeeTasks = isMaster || isAdmin || isLeader || hasOperationalRole('MIDIA')
  const canSeeMusicians = isMaster || isAdmin || isLeader
  const canSeeInvitations = isMaster || isAdmin
  const canSeeRoles = isMaster || isAdmin
  const canSeeIntegrations = isMaster || isAdmin
  const canSeeSettings = isMaster || isAdmin

  const navItems = [
    {
      to: '/dashboard',
      label: 'Início',
      icon: LayoutDashboard,
      allowed: true,
    },
    {
      to: '/minhas-escalas',
      label: 'Minhas Escalas',
      icon: CalendarCheck2,
      allowed: true,
    },
    {
      to: '/songs',
      label: 'Músicas',
      icon: Music2,
      allowed: canSeeSongs,
    },
    {
      to: '/events',
      label: 'Eventos & Cultos',
      icon: CalendarDays,
      allowed: canSeeEvents,
    },
    {
      to: '/som',
      label: 'Som',
      icon: Volume2,
      allowed: canSeeSound,
    },
    {
      to: '/projecao',
      label: 'Projeção',
      icon: Tv,
      allowed: canSeeProjection,
    },
    {
      to: '/midias',
      label: 'Mídias',
      icon: ImageIcon,
      allowed: canSeeMedia,
    },
    {
      to: '/tarefas',
      label: 'Tarefas',
      icon: CheckSquare,
      allowed: canSeeTasks,
    },
    {
      to: '/iluminacao',
      label: 'Iluminação',
      icon: Sun,
      allowed: canSeeLighting,
    },
    {
      to: '/musicians',
      label: 'Músicos & Membros',
      icon: Users,
      allowed: canSeeMusicians,
    },
    {
      to: '/convites',
      label: 'Convites',
      icon: UserPlus,
      allowed: canSeeInvitations,
    },
    {
      to: '/roles',
      label: 'Funções & Instrumentos',
      icon: Sliders,
      allowed: canSeeRoles,
    },
    {
      to: '/perfil',
      label: 'Meu Perfil',
      icon: UserCircle,
      allowed: true,
    },
    {
      to: '/configuracoes/integracoes',
      label: 'Integrações',
      icon: Zap,
      allowed: canSeeIntegrations,
    },
    {
      to: '/configuracoes',
      label: 'Configurações',
      icon: Settings,
      allowed: canSeeSettings,
    },
  ].filter((item) => item.allowed)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleLabels: Record<string, { label: string; bg: string }> = {
    MASTER: { label: 'MASTER', bg: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' },
    ADMIN: { label: 'Administrador', bg: 'bg-teal-100 text-teal-800 border-teal-200' },
    LIDER: { label: 'Líder de Louvor', bg: 'bg-violet-100 text-violet-800 border-violet-200' },
    MUSICO: { label: 'Músico', bg: 'bg-slate-100 text-slate-800 border-slate-200' },
  }

  const currentRoleBadge = role
    ? roleLabels[role] || { label: role, bg: 'bg-slate-100 text-slate-800', text: '' }
    : null

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* DESKTOP SIDEBAR (≥ 1024px) */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out fixed inset-y-0 left-0 z-30 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Header / Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          {!collapsed ? (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-teal-700 flex items-center justify-center text-white shadow-sm shadow-teal-700/20">
                <Music2 className="h-5 w-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-lg leading-tight tracking-tight text-slate-900">
                  Louvor<span className="text-teal-700">Flow</span>
                </span>
                <span className="text-xs text-slate-500 truncate">
                  {currentChurch?.name || 'Gestão de Louvor'}
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto h-10 w-10 rounded-xl bg-teal-700 flex items-center justify-center text-white">
              <Music2 className="h-5 w-5" />
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 h-8 w-8 rounded-lg"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Church Selector (Multi-tenant) */}
        {!collapsed && userChurches.length > 1 && (
          <div className="p-3 border-b border-slate-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between text-xs font-medium h-9 border-slate-200 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 truncate">
                    <ChurchIcon className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                    <span className="truncate">{currentChurch?.name}</span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs text-slate-500">
                  Igrejas que você participa
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {userChurches.map((church) => (
                  <DropdownMenuItem
                    key={church.id}
                    onClick={() => switchChurch(church.id)}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="truncate">{church.name}</span>
                    {church.id === currentChurch?.id && (
                      <span className="h-2 w-2 rounded-full bg-teal-600" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Nav Links */}
        <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-teal-50 text-teal-800 font-semibold shadow-xs border-l-4 border-teal-700 pl-2.5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  } ${collapsed ? 'justify-center px-0' : ''}`
                }
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`h-5 w-5 shrink-0 ${collapsed ? 'mx-auto' : ''}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* User Card & Logout Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          {!collapsed && (
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Notificações
              </span>
              <NotificationsBell />
            </div>
          )}
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="h-9 w-9 rounded-full bg-teal-700/10 text-teal-800 font-bold flex items-center justify-center shrink-0 border border-teal-200">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate leading-snug">
                  {user?.name || 'Músico'}
                </p>
                {currentRoleBadge && (
                  <span
                    className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${currentRoleBadge.bg}`}
                  >
                    {currentRoleBadge.label}
                  </span>
                )}
              </div>
            )}
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label="Sair da conta"
                title="Sair"
                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* MOBILE TOPBAR (< 1024px) */}
      <header className="lg:hidden fixed top-0 inset-x-0 h-16 bg-white border-b border-slate-200 z-30 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Abrir menu de navegação"
            className="text-slate-700 hover:bg-slate-100 h-10 w-10 rounded-xl"
          >
            <Menu className="h-6 w-6" />
          </Button>

          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-700 flex items-center justify-center text-white">
              <Music2 className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base leading-tight text-slate-900">
                Louvor<span className="text-teal-700">Flow</span>
              </span>
              <span className="text-[11px] text-slate-500 truncate max-w-[140px]">
                {currentChurch?.name}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Central de Notificações Internas */}
          <NotificationsBell />

          {currentRoleBadge && (
            <Badge
              variant="outline"
              className={`text-[10px] hidden sm:inline-flex ${currentRoleBadge.bg}`}
            >
              {currentRoleBadge.label}
            </Badge>
          )}
          <NavLink to="/perfil">
            <div className="h-9 w-9 rounded-full bg-teal-700/10 text-teal-800 font-bold flex items-center justify-center border border-teal-200">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
          </NavLink>
        </div>
      </header>

      {/* MOBILE DRAWER OVERLAY */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer Menu */}
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-slide-right">
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-teal-700 flex items-center justify-center text-white">
                  <Music2 className="h-4 w-4" />
                </div>
                <span className="font-bold text-lg text-slate-900">LouvorFlow</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Fechar menu"
                className="text-slate-400 hover:text-slate-600 h-8 w-8 rounded-lg"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Church info */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <p className="text-xs text-slate-500 font-medium">Igreja conectada:</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{currentChurch?.name}</p>
            </div>

            {/* Nav items */}
            <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm transition-colors ${
                        isActive
                          ? 'bg-teal-50 text-teal-800 font-semibold border-l-4 border-teal-700 pl-2.5'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            {/* Mobile Footer with User and Logout */}
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-teal-700 text-white font-bold flex items-center justify-center shrink-0">
                  {user?.name ? user.name[0].toUpperCase() : 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setMobileDrawerOpen(false)
                  handleLogout()
                }}
                className="w-full justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-10"
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          collapsed ? 'lg:ml-20' : 'lg:ml-64'
        } min-h-screen pt-16 lg:pt-0`}
      >
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>

        {/* Minimal Mobile Version Footer */}
        <footer className="lg:hidden py-3 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
          LouvorFlow v0.0.14 • Gestão Ministerial de Louvor
        </footer>
      </div>
    </div>
  )
}
