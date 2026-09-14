import React from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RouteGuardProps {
  children: React.ReactNode
  requireRole?: 'ADMIN' | 'LIDER' | 'CONTENT_MANAGER'
}

export const RequireAuth: React.FC<RouteGuardProps> = ({ children, requireRole }) => {
  const { isAuthenticated, isLoading, isAdmin, isLeader } = useAuth()
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
            Voltar ao Dashboard
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
            Voltar ao Dashboard
          </Button>
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
