import React from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RouteGuardProps {
  children: React.ReactNode
  requireRole?: 'MASTER'
  /**
   * Chave(s) dos perfis de acesso. Basta ter uma. Chave completa (modulo.tela.acao) confere
   * a ação exata; chave curta (ex.: 'financeiro') aceita qualquer ação do módulo.
   */
  requirePermission?: string | string[]
}

const Blocked: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
      <ShieldAlert className="h-8 w-8" />
    </div>
    <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
    <p className="mt-2 max-w-md text-sm text-slate-600">{text}</p>
    <Link to="/dashboard" className="mt-6">
      <Button variant="outline" className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Voltar ao Início
      </Button>
    </Link>
  </div>
)

export const RequireAuth: React.FC<RouteGuardProps> = ({
  children,
  requireRole,
  requirePermission,
}) => {
  const { isAuthenticated, isLoading, isMaster, can, canAny } = useAuth()
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
      <Blocked
        title="Acesso Restrito ao MASTER"
        text="Esta funcionalidade exige privilégio de Administrador Máximo (MASTER) da igreja."
      />
    )
  }

  if (requirePermission) {
    const wanted = Array.isArray(requirePermission) ? requirePermission : [requirePermission]
    const ok = wanted.some((k) => (k.split('.').length === 3 ? can(k) : canAny(k)))
    if (!ok) {
      return (
        <Blocked
          title="Acesso não liberado"
          text="Seu perfil de acesso não libera esta tela. Peça ao MASTER da igreja para incluí-la no seu perfil."
        />
      )
    }
  }

  return <>{children}</>
}
