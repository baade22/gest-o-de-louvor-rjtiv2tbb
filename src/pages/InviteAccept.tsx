import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Music2,
  Lock,
  ShieldCheck,
  Check,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [inviteData, setInviteData] = useState<{
    valid: boolean
    church_name?: string
    name?: string
    email?: string
    role?: string
    operational_roles?: string[]
    message?: string
  } | null>(null)

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Valida o convite
  useEffect(() => {
    if (!token) {
      setInviteData({ valid: false, message: 'Link de convite inválido ou incompleto.' })
      setIsLoading(false)
      return
    }

    const validateToken = async () => {
      try {
        const res = await pb.send<{
          valid: boolean
          church_name?: string
          name?: string
          email?: string
          role?: string
          operational_roles?: string[]
          message?: string
        }>(`/backend/v1/invitations/validate?token=${token}`, { method: 'GET' })

        setInviteData(res)
      } catch (err: any) {
        setInviteData({
          valid: false,
          message:
            err.data?.message || err.message || 'Convite não encontrado, já aceito ou expirado.',
        })
      } finally {
        setIsLoading(false)
      }
    }

    validateToken()
  }, [token])

  // Checagens de força da senha
  const hasMinLength = password.length >= 8
  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const passwordsMatch = password && password === passwordConfirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    if (!hasMinLength || !hasLetter || !hasNumber) {
      toast({
        title: 'Senha fraca',
        description: 'A senha deve ter no mínimo 8 caracteres, incluindo letras e números.',
        variant: 'destructive',
      })
      return
    }

    if (!passwordsMatch) {
      toast({
        title: 'Senhas diferentes',
        description: 'A confirmação de senha não confere.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await pb.send<{ success: boolean; message: string; email: string }>(
        '/backend/v1/invitations/accept',
        {
          method: 'POST',
          body: {
            token: token,
            password: password,
            password_confirm: passwordConfirm,
          },
        },
      )

      setSuccess(true)
      toast({
        title: 'Conta configurada com sucesso!',
        description: res.message || 'Sua senha foi definida e seu acesso foi liberado.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao ativar conta',
        description: err.data?.message || err.message || 'Não foi possível definir a senha.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent mx-auto" />
          <p className="text-sm font-medium text-slate-600">Verificando seu convite...</p>
        </div>
      </div>
    )
  }

  if (!inviteData?.valid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full rounded-2xl border-slate-200 shadow-sm p-6 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">
            Convite Inválido ou Expirado
          </CardTitle>
          <CardDescription className="text-slate-600">
            {inviteData?.message ||
              'Este link de convite já foi utilizado ou sua validade foi encerrada. Solicite um novo convite ao administrador da congregação.'}
          </CardDescription>
          <div className="pt-4">
            <Link to="/login">
              <Button className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 text-white">
                Ir para a tela de login
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full rounded-2xl border-slate-200 shadow-sm p-6 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">Tudo Pronto!</CardTitle>
          <CardDescription className="text-slate-600">
            Sua conta foi ativada com sucesso na congregação{' '}
            <strong>{inviteData.church_name}</strong>. Agora você já pode acessar com seu e-mail e a
            senha que acabou de cadastrar.
          </CardDescription>
          <div className="pt-4">
            <Link to="/login">
              <Button className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 text-white gap-2 font-semibold">
                Fazer Login Agora
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-8">
      <Card className="max-w-md w-full rounded-2xl border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-teal-700 p-6 text-white text-center">
          <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3">
            <Music2 className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">LouvorFlow</h1>
          <p className="text-teal-100 text-xs mt-1">Primeiro Acesso • Ativação de Conta</p>
        </div>

        <CardHeader className="pt-6 pb-2">
          <CardTitle className="text-lg font-bold text-slate-900">
            Olá, {inviteData.name}!
          </CardTitle>
          <CardDescription className="text-xs text-slate-600">
            Você foi convidado para integrar a equipe de <strong>{inviteData.church_name}</strong>.
          </CardDescription>

          <div className="pt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[10px] font-semibold bg-slate-100">
              Perfil: {inviteData.role}
            </Badge>
            {inviteData.operational_roles &&
              inviteData.operational_roles.map((op) => (
                <Badge
                  key={op}
                  variant="outline"
                  className="text-[10px] bg-teal-50 text-teal-800 border-teal-200"
                >
                  {op}
                </Badge>
              ))}
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
              <span>
                Por segurança, o administrador da igreja não define sua senha. Defina sua própria
                senha pessoal abaixo.
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                Seu E-mail
              </Label>
              <Input
                id="email"
                value={inviteData.email}
                disabled
                className="bg-slate-100 text-slate-500 rounded-xl text-xs cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="pass" className="text-xs font-semibold text-slate-700">
                  Defina sua Senha
                </Label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-teal-700 hover:text-teal-800 flex items-center gap-1"
                >
                  {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <Input
                id="pass"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres (letras e números)"
                className="rounded-xl text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pass-confirm" className="text-xs font-semibold text-slate-700">
                Confirme sua Senha
              </Label>
              <Input
                id="pass-confirm"
                type={showPassword ? 'text' : 'password'}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Repita a senha criada"
                className="rounded-xl text-xs"
                required
              />
            </div>

            {/* Checklist de requisitos de senha em pt-BR */}
            <div className="space-y-1 pt-1 text-[11px]">
              <div
                className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${hasMinLength ? 'bg-emerald-600' : 'bg-slate-300'}`}
                />
                Mínimo de 8 caracteres
              </div>
              <div
                className={`flex items-center gap-1.5 ${hasLetter ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${hasLetter ? 'bg-emerald-600' : 'bg-slate-300'}`}
                />
                Pelo menos uma letra
              </div>
              <div
                className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${hasNumber ? 'bg-emerald-600' : 'bg-slate-300'}`}
                />
                Pelo menos um número
              </div>
              {passwordConfirm && (
                <div
                  className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-rose-600'}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-600' : 'bg-rose-500'}`}
                  />
                  {passwordsMatch ? 'Senhas conferem' : 'As senhas não conferem'}
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="pt-2 pb-6">
            <Button
              type="submit"
              disabled={
                isSubmitting || !hasMinLength || !hasLetter || !hasNumber || !passwordsMatch
              }
              className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs h-10 shadow-sm"
            >
              {isSubmitting ? 'Ativando sua conta...' : 'Definir Senha e Ativar Acesso'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
