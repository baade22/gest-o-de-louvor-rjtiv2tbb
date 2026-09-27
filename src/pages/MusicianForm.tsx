import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { saveMusician, getMusician } from '@/services/musicians'
import type { Role, AppRole } from '@/types'
import { ArrowLeft, Save, Check } from 'lucide-react'
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
  const { currentChurch, isMaster } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'MUSICO' as AppRole,
    operational_roles: ['MUSICO'] as string[],
    is_active: true,
    selectedRoleIds: [] as string[],
  })

  // Carrega lista de funções/instrumentos disponíveis na igreja
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
        console.error('Erro ao carregar funções:', err)
      }
    }
    fetchRoles()
  }, [currentChurch])

  // Se editando, busca dados consolidados do membro via serviço do backend
  useEffect(() => {
    if (isEditing && id && currentChurch) {
      const fetchMemberData = async () => {
        try {
          // Busca diretamente no endpoint do backend (com superuser no servidor para retornar name e email)
          const data = await getMusician(id, currentChurch.id)
          setFormData({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            role: data.role || 'MUSICO',
            operational_roles: data.operational_roles || ['MUSICO'],
            is_active: data.is_active ?? true,
            selectedRoleIds: data.role_ids || [],
          })
        } catch (err: unknown) {
          console.error('Erro ao carregar dados do músico:', err)
          const errorObj = err as { data?: { message?: string }; message?: string }
          const errorMsg =
            errorObj.data?.message ||
            errorObj.message ||
            'Músico não encontrado ou sem permissão de acesso.'
          toast({
            title: 'Erro ao carregar músico',
            description: errorMsg,
            variant: 'destructive',
          })
          navigate('/musicians')
        } finally {
          setIsLoading(false)
        }
      }
      fetchMemberData()
    }
  }, [id, isEditing, currentChurch, navigate, toast])

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
    if (!currentChurch) {
      toast({
        title: 'Igreja não selecionada',
        description: 'Selecione uma igreja ativa para continuar.',
        variant: 'destructive',
      })
      return
    }

    const trimmedName = formData.name.trim()
    const trimmedEmail = formData.email.trim().toLowerCase()

    if (!trimmedName || trimmedName.replace(/\s+/g, '').length === 0) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, informe o nome completo do membro (não pode ser apenas espaços).',
        variant: 'destructive',
      })
      return
    }

    if (trimmedName.length < 2) {
      toast({
        title: 'Nome muito curto',
        description: 'O nome deve ter pelo menos 2 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (!trimmedEmail) {
      toast({
        title: 'E-mail obrigatório',
        description: 'Por favor, informe o e-mail do músico.',
        variant: 'destructive',
      })
      return
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(trimmedEmail)) {
      toast({
        title: 'E-mail inválido',
        description: 'Insira um formato de e-mail válido (ex: nome@igreja.com).',
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
      // PERSISTÊNCIA REAL: Dispara para a API do backend
      // O backend persiste em _pb_users_auth_ (name, email), church_members e member_roles
      const result = await saveMusician({
        church_id: currentChurch.id,
        member_id: isEditing ? id : undefined,
        name: trimmedName,
        email: trimmedEmail,
        phone: formData.phone.trim(),
        role: formData.role,
        operational_roles: formData.operational_roles,
        is_active: formData.is_active,
        role_ids: formData.selectedRoleIds,
      })

      // Mensagem de sucesso confirmada SOMENTE após resposta positiva do banco
      toast({
        title: isEditing ? 'Músico atualizado!' : 'Músico cadastrado!',
        description: result.message || 'Dados e funções persistidos com sucesso.',
      })

      navigate('/musicians')
    } catch (err: unknown) {
      console.error('Falha ao salvar músico:', err)
      const errorObj = err as { data?: { message?: string }; message?: string }
      const errorMsg =
        errorObj.data?.message ||
        errorObj.message ||
        'Não foi possível salvar o músico no banco de dados. Tente novamente.'

      toast({
        title: 'Erro ao salvar',
        description: errorMsg,
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
                Permissão no LouvorFlow
              </Label>
              <Select
                value={formData.role}
                onValueChange={(val) => setFormData({ ...formData, role: val as AppRole })}
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Selecione o nível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MUSICO">Operacional (Músico / Áudio / Projeção)</SelectItem>
                  <SelectItem value="LIDER">Líder (Cria cultos, repertórios e escalas)</SelectItem>
                  <SelectItem value="ADMIN">Administrador (Gestão de congregação)</SelectItem>
                  {isMaster && (
                    <SelectItem value="MASTER" className="font-bold text-amber-900">
                      MASTER (Acesso 100% irrestrito)
                    </SelectItem>
                  )}
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
                Selecione pelo menos uma função ou instrumento que o músico executa.
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
              {isSubmitting
                ? 'Gravando no banco...'
                : isEditing
                  ? 'Salvar Alterações'
                  : 'Cadastrar Músico'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
