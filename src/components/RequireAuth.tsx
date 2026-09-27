import React from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RouteGuardProps {
  children: React.ReactNode
  requireRole?: 'MASTER' | 'ADMIN' | 'LIDER' | 'CONTENT_MANAGER'
  requireModule?: string
}

export const RequireAuth: React.FC<RouteGuardProps> = ({
  children,
  requireRole,
  requireModule,
}) => {
  const { isAuthenticated, isLoading, isMaster, isAdmin, isLeader, hasModule, hasOperationalRole } =
    useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Carregando LouvorFlow...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireRole === 'MASTER' && !isMaster) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Acesso Restrito ao MASTER</h2>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          Esta funcionalidade exige privilégio de Administrador Máximo (MASTER) da igreja.
        </p>
        <Link to="/dashboard" className="mt-6">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Início
          </Button>
        </Link>
      </div>
    )
  }

  if (requireRole === 'ADMIN' && !isAdmin) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Acesso Restrito</h2>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          Você precisa de permissão de Administrador da igreja para acessar esta página.
        </p>
        <Link to="/dashboard" className="mt-6">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Início
          </Button>
        </Link>
      </div>
    )
  }

  if (requireRole === 'CONTENT_MANAGER' && !isAdmin && !isLeader) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Acesso de Gestão</h2>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          Esta área é reservada para Líderes de Louvor e Administradores da igreja.
        </p>
        <Link to="/dashboard" className="mt-6">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Início
          </Button>
        </Link>
      </div>
    )
  }

  if (requireModule && !isMaster && !isAdmin) {
    let hasAccess = false
    if (requireModule === 'sound') hasAccess = hasOperationalRole('SOM')
    else if (requireModule === 'projection') hasAccess = hasOperationalRole('PROJECAO')
    else if (requireModule === 'media')
      hasAccess = hasOperationalRole('MIDIA') || hasOperationalRole('PROJECAO')
    else if (requireModule === 'lighting') hasAccess = hasOperationalRole('ILUMINACAO')
    else if (requireModule === 'tasks') hasAccess = hasOperationalRole('MIDIA') || isLeader
    else if (requireModule === 'songs') hasAccess = hasOperationalRole('MUSICO') || isLeader
    else if (requireModule === 'events') {
      hasAccess =
        hasOperationalRole('SOM') ||
        hasOperationalRole('PROJECAO') ||
        hasOperationalRole('MIDIA') ||
        hasOperationalRole('ILUMINACAO') ||
        isLeader
    } else {
      hasAccess = hasModule(requireModule)
    }

    if (!hasAccess) {
      return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Módulo Não Autorizado</h2>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Sua função operacional não possui acesso ao módulo{' '}
            <strong className="text-slate-800">{requireModule.toUpperCase()}</strong>. Entre em
            contato com a administração se precisar deste acesso.
          </p>
          <Link to="/dashboard" className="mt-6">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Início
            </Button>
          </Link>
        </div>
      )
    }
  }

  return <>{children}</>
}
