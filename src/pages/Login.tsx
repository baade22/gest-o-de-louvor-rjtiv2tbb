import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Music2, Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

export default function Login() {
  const [email, setEmail] = useState('pedro_baade@hotmail.com')
  const [password, setPassword] = useState('Skip@Pass')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Por favor preencha seu e-mail e senha.')
      return
    }

    setIsSubmitting(true)
    try {
      await login(email, password)
      toast({
        title: 'Bem-vindo de volta!',
        description: 'Login realizado com sucesso.',
      })
      navigate(from, { replace: true })
    } catch (err: unknown) {
      console.error(err)
      setError('E-mail ou senha inválidos. Verifique suas credenciais.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail) return
    setForgotSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-radial-[at_top] from-teal-50 via-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-xl shadow-teal-700/20 mb-4">
            <Music2 className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Louvor<span className="text-teal-700">Flow</span>
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Plataforma SaaS para gestão de ministérios de louvor
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Acesse sua conta</h2>
            <p className="text-xs text-slate-500 mt-1">
              Informe suas credenciais para entrar na sua igreja.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 p-3.5 text-sm text-red-700 border border-red-200"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div className="leading-tight">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                E-mail institucional ou de músico
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@igreja.com.br"
                  className="pl-10 h-11 rounded-xl border-slate-200 focus-visible:ring-teal-700"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Senha
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotSent(false)
                    setForgotEmail(email)
                    setForgotPasswordOpen(true)
                  }}
                  className="text-xs text-teal-700 hover:text-teal-800 font-medium hover:underline focus:outline-none"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10 h-11 rounded-xl border-slate-200 focus-visible:ring-teal-700"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold transition-all mt-2 shadow-md shadow-teal-700/20"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Entrando...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Entrar</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          {/* Seed demo quick logins */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Acesso Demo Rápido:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEmail('pedro_baade@hotmail.com')
                  setPassword('Skip@Pass')
                }}
                className="text-xs h-8 justify-start border-slate-200 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-200"
              >
                Admin (Pedro)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEmail('joao.santos@demo.louvorflow.com')
                  setPassword('Skip@Pass')
                }}
                className="text-xs h-8 justify-start border-slate-200 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-200"
              >
                Músico (João)
              </Button>
            </div>
          </div>

          <div className="mt-6 pt-4 text-center border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Não tem conta?{' '}
              <span className="font-medium text-slate-700">
                Fale com o administrador da sua igreja.
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Dialog Esqueci Senha */}
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Recuperar Acesso</DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Insira o e-mail cadastrado na sua igreja para instruções de redefinição.
            </DialogDescription>
          </DialogHeader>

          {forgotSent ? (
            <div className="space-y-4 py-3">
              <div className="flex items-start gap-3 rounded-xl bg-teal-50 p-4 border border-teal-200 text-teal-800">
                <Info className="h-5 w-5 shrink-0 text-teal-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold">Instruções enviadas!</p>
                  <p className="mt-1 text-xs text-teal-700">
                    Se houver uma conta associada a <strong>{forgotEmail}</strong>, as instruções
                    para redefinição foram simuladas. Em caso de dúvidas, contate o administrador da
                    sua igreja.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setForgotPasswordOpen(false)}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white rounded-xl"
              >
                Entendi, voltar ao login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-semibold text-slate-700">
                  Seu E-mail
                </Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seu.email@igreja.com.br"
                  className="rounded-xl border-slate-200"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotPasswordOpen(false)}
                  className="rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white"
                >
                  Enviar Instruções
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
