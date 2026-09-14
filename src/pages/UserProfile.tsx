import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { User, Phone, Mail, Lock, Shield, Church as ChurchIcon, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

export default function UserProfile() {
  const { user, currentMember, currentChurch, role, refreshAuthData } = useAuth()
  const { toast } = useToast()

  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(currentMember?.phone || '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Senha
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSavingProfile(true)
    try {
      // Atualiza nome no users
      await pb.collection('users').update(user.id, {
        name: name.trim(),
      })

      // Atualiza telefone no church_members
      if (currentMember) {
        await pb.collection('church_members').update(currentMember.id, {
          phone: phone.trim() || null,
        })
      }

      await refreshAuthData()
      toast({
        title: 'Perfil atualizado',
        description: 'Seus dados foram salvos com sucesso.',
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível salvar as informações.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (newPassword.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A nova senha deve ter no mínimo 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Senhas não conferem',
        description: 'A confirmação de senha é diferente da nova senha.',
        variant: 'destructive',
      })
      return
    }

    setIsChangingPassword(true)
    try {
      await pb.collection('users').update(user.id, {
        oldPassword: oldPassword,
        password: newPassword,
        passwordConfirm: confirmPassword,
      })

      toast({
        title: 'Senha alterada com sucesso!',
        description: 'Utilize sua nova senha no próximo acesso.',
      })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao alterar senha',
        description: 'Verifique se sua senha atual está correta.',
        variant: 'destructive',
      })
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Meu Perfil
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Gerencie suas informações cadastrais e segurança da conta.
        </p>
      </div>

      {/* Overview Card */}
      <Card className="rounded-2xl border-slate-200 shadow-xs">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="h-20 w-20 rounded-full bg-teal-700/10 text-teal-800 font-extrabold text-2xl flex items-center justify-center shrink-0 border-2 border-teal-200">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>

            <div className="space-y-1 text-center sm:text-left flex-1">
              <h2 className="text-xl font-bold text-slate-900">{user?.name}</h2>
              <p className="text-sm text-slate-500">{user?.email}</p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                <Badge className="bg-teal-50 text-teal-800 border-teal-200">
                  <ChurchIcon className="h-3 w-3 mr-1" />
                  {currentChurch?.name}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <Shield className="h-3 w-3 mr-1 text-violet-600" />
                  Papel: {role}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editar Dados */}
      <Card className="rounded-2xl border-slate-200 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">Informações Pessoais</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Mantenha seu contato atualizado para que os líderes possam acioná-lo.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prof-name" className="text-xs font-semibold text-slate-700">
                Nome de Exibição
              </Label>
              <Input
                id="prof-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="prof-email" className="text-xs font-semibold text-slate-700">
                  E-mail (Identificador)
                </Label>
                <Input
                  id="prof-email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="rounded-xl border-slate-200 bg-slate-50 text-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-phone" className="text-xs font-semibold text-slate-700">
                  Telefone / WhatsApp
                </Label>
                <Input
                  id="prof-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={isSavingProfile}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs gap-2"
              >
                <Save className="h-4 w-4" />
                {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Alterar Senha */}
      <Card className="rounded-2xl border-slate-200 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">Segurança & Senha</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Altere sua senha de acesso a qualquer momento.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="old-pass" className="text-xs font-semibold text-slate-700">
                Senha Atual
              </Label>
              <Input
                id="old-pass"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-xs font-semibold text-slate-700">
                  Nova Senha (mínimo 8 caracteres)
                </Label>
                <Input
                  id="new-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-xl border-slate-200"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-xs font-semibold text-slate-700">
                  Confirmar Nova Senha
                </Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-xl border-slate-200"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={isChangingPassword}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs gap-2"
              >
                <Lock className="h-4 w-4" />
                {isChangingPassword ? 'Atualizando...' : 'Atualizar Senha'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
