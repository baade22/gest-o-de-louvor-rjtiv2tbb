import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { ChurchMember, Role, MemberRole, User } from '@/types'
import { ArrowLeft, Save, User as UserIcon, Phone, Mail, Shield, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

export default function MusicianForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const { currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'MUSICO' as 'ADMIN' | 'LIDER' | 'MUSICO',
    is_active: true,
    selectedRoleIds: [] as string[],
  })

  // Carrega lista de funções disponíveis na igreja
  useEffect(() => {
    if (!currentChurch) return
    const fetchRoles = async () => {
      try {
        const roles = await pb.collection('roles').getFullList<Role>({
          filter: `church_id = "${currentChurch.id}"`,
          sort: 'name',
        })
        setAvailableRoles(roles)
      } catch (err) {
        console.error(err)
      }
    }
    fetchRoles()
  }, [currentChurch])

  // Se editando, busca dados do membro
  useEffect(() => {
    if (isEditing && id && currentChurch) {
      const fetchMemberData = async () => {
        try {
          const member = await pb.collection('church_members').getOne<ChurchMember>(id, {
            expand: 'user_id',
          })
          const user = member.expand?.user_id

          // Busca as funções já atribuídas
          const memberRoles = await pb.collection('member_roles').getFullList<MemberRole>({
            filter: `member_id = "${member.id}"`,
          })
          const roleIds = memberRoles.map((mr) => mr.role_id)

          setFormData({
            name: user?.name || '',
            email: user?.email || '',
            phone: member.phone || '',
            role: member.role || 'MUSICO',
            is_active: member.is_active,
            selectedRoleIds: roleIds,
          })
        } catch (err) {
          console.error(err)
          toast({
            title: 'Erro ao carregar músico',
            description: 'Músico não encontrado.',
            variant: 'destructive',
          })
          navigate('/musicians')
        } finally {
          setIsLoading(false)
        }
      }
      fetchMemberData()
    }
  }, [id, isEditing, currentChurch])

  const toggleRole = (roleId: string) => {
    setFormData((prev) => {
      const exists = prev.selectedRoleIds.includes(roleId)
      return {
        ...prev,
        selectedRoleIds: exists
          ? prev.selectedRoleIds.filter((r) => r !== roleId)
          : [...prev.selectedRoleIds, roleId],
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return

    if (!formData.name.trim() || !formData.email.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, informe nome e e-mail do músico.',
        variant: 'destructive',
      })
      return
    }

    if (formData.selectedRoleIds.length === 0) {
      toast({
        title: 'Selecione uma função',
        description: 'Defina ao menos uma função/instrumento para este músico.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (isEditing && id) {
        // Atualiza membro
        const member = await pb.collection('church_members').getOne<ChurchMember>(id)
        await pb.collection('church_members').update(id, {
          role: formData.role,
          phone: formData.phone.trim() || null,
          is_active: formData.is_active,
        })

        // Atualiza nome do usuário
        if (member.user_id) {
          await pb.collection('users').update(member.user_id, {
            name: formData.name.trim(),
          })
        }

        // Sincroniza funções (remove antigas e adiciona novas)
        const oldRoles = await pb.collection('member_roles').getFullList<MemberRole>({
          filter: `member_id = "${id}"`,
        })
        for (const mr of oldRoles) {
          await pb.collection('member_roles').delete(mr.id)
        }
        for (const roleId of formData.selectedRoleIds) {
          await pb.collection('member_roles').create({
            church_id: currentChurch.id,
            member_id: id,
            role_id: roleId,
          })
        }

        toast({
          title: 'Músico atualizado',
          description: 'Os dados foram alterados com sucesso.',
        })
      } else {
        // Novo membro: verifica se usuário já existe com esse email ou cria
        let targetUserId: string
        try {
          const existingUser = await pb
            .collection('users')
            .getFirstListItem<User>(`email = "${formData.email.trim()}"`)
          targetUserId = existingUser.id
        } catch (_) {
          // Cria novo usuário com senha padrão inicial
          const newUser = await pb.collection('users').create({
            email: formData.email.trim(),
            password: 'Skip@Pass',
            passwordConfirm: 'Skip@Pass',
            name: formData.name.trim(),
          })
          targetUserId = newUser.id
        }

        // Cria o church_member
        const newMember = await pb.collection('church_members').create({
          church_id: currentChurch.id,
          user_id: targetUserId,
          role: formData.role,
          phone: formData.phone.trim() || null,
          is_active: formData.is_active,
        })

        // Atribui funções
        for (const roleId of formData.selectedRoleIds) {
          await pb.collection('member_roles').create({
            church_id: currentChurch.id,
            member_id: newMember.id,
            role_id: roleId,
          })
        }

        toast({
          title: 'Músico cadastrado!',
          description: 'O músico agora faz parte da equipe da igreja.',
        })
      }

      navigate('/musicians')
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível cadastrar ou atualizar o músico.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/musicians"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Músicos
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditing ? 'Editar Músico' : 'Cadastrar Novo Músico'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Informe os dados pessoais e os instrumentos/funções que o membro domina.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold text-slate-700">
              Nome Completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: João Silva"
              className="rounded-xl border-slate-200"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                E-mail <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                disabled={isEditing}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="joao@igreja.com.br"
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">
                Telefone / WhatsApp
              </Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(11) 98765-4321"
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-xs font-semibold text-slate-700">
                Permissão no Sistema
              </Label>
              <Select
                value={formData.role}
                onValueChange={(val) =>
                  setFormData({ ...formData, role: val as 'ADMIN' | 'LIDER' | 'MUSICO' })
                }
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Selecione o nível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MUSICO">Músico (Visualiza e confirma escalas)</SelectItem>
                  <SelectItem value="LIDER">Líder (Cria cultos, repertórios e escalas)</SelectItem>
                  <SelectItem value="ADMIN">Administrador (Acesso total)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 flex flex-col justify-end">
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 h-10">
                <Label
                  htmlFor="active-toggle"
                  className="text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Músico Ativo na Igreja
                </Label>
                <Switch
                  id="active-toggle"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
          </div>

          {/* Seleção de Múltiplas Funções / Instrumentos */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-semibold text-slate-700 block">
              Instrumentos & Funções (Selecione um ou mais) <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableRoles.map((r) => {
                const isSelected = formData.selectedRoleIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRole(r.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-teal-50 border-teal-600 text-teal-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="truncate">{r.name}</span>
                    {isSelected && <Check className="h-4 w-4 text-teal-700 shrink-0 ml-1" />}
                  </button>
                )
              })}
            </div>
            {formData.selectedRoleIds.length === 0 && (
              <p className="text-[11px] text-amber-600">
                Selecione pelo menos uma função que o músico executa.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Link to="/musicians">
              <Button type="button" variant="outline" className="rounded-xl">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2"
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Cadastrar Músico'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
