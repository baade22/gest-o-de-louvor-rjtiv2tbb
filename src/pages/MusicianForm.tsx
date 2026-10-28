import React, { Fragment, useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { saveMusician, getMusician } from '@/services/musicians'
import {
  listAccessHistory,
  listAccessProfiles,
  type AccessLogEntry,
} from '@/services/accessProfiles'
import type { AccessProfile, Role } from '@/types'
import {
  ACCESS_MODULES,
  ACTION_LABELS,
  canGrantProfile,
  computeEffectiveAccess,
  moduleKeys,
  summarizeProfile,
  type AccessAction,
} from '@/lib/accessCatalog'
import { ArrowLeft, Save, Check, Crown, Info, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

function formatWhen(iso: string) {
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Uma linha do histórico de acesso, em português */
function describeLog(l: AccessLogEntry) {
  const d = l.details || {}
  const parts: string[] = []
  if (d.new_member) parts.push('cadastrou a pessoa')
  if (d.master_after && !d.master_before) parts.push('deu o acesso Master')
  if (d.master_before && !d.master_after) parts.push('tirou o acesso Master')
  if (d.added?.length) parts.push(`deu ${d.added.join(', ')}`)
  if (d.removed?.length) parts.push(`tirou ${d.removed.join(', ')}`)
  return `${d.by_name || 'Alguém'} ${parts.join(' e ') || 'mudou o acesso'}`
}

export default function MusicianForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const { currentChurch, currentMember, isMaster, accessKeys } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])
  const [profiles, setProfiles] = useState<AccessProfile[]>([])
  const [history, setHistory] = useState<AccessLogEntry[]>([])
  const [showDetail, setShowDetail] = useState(false)
  const [targetWasMaster, setTargetWasMaster] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    is_master: false,
    access_profiles: [] as string[],
    is_active: true,
    selectedRoleIds: [] as string[],
  })

  const editingSelf = isEditing && currentMember?.id === id

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
    listAccessProfiles(currentChurch.id)
      .then(setProfiles)
      .catch((err) => console.error('Erro ao carregar perfis de acesso:', err))
    if (id) listAccessHistory(currentChurch.id, 'church_members', id).then(setHistory)
  }, [currentChurch, id])

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
            is_master: data.role === 'MASTER',
            access_profiles: (data.access_profiles || []).map((p) => p.id),
            is_active: data.is_active ?? true,
            selectedRoleIds: data.role_ids || [],
          })
          setTargetWasMaster(data.role === 'MASTER')
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

  // "Ninguém dá mais do que tem": quem não é MASTER só dá ou tira perfis que cabem no seu acesso
  const canTouchProfile = (p: AccessProfile) =>
    isMaster || (!editingSelf && canGrantProfile(accessKeys, p.permissions))

  const toggleProfile = (profileId: string) => {
    setFormData((prev) => ({
      ...prev,
      access_profiles: prev.access_profiles.includes(profileId)
        ? prev.access_profiles.filter((r) => r !== profileId)
        : [...prev.access_profiles, profileId],
    }))
  }

  // Perfis exibidos: os ativos e os inativos que a pessoa ainda tem
  const shownProfiles = profiles.filter(
    (p) => p.is_active || formData.access_profiles.includes(p.id),
  )
  // Quem não é MASTER não mexe num MASTER (o servidor também barra)
  const lockedMaster = targetWasMaster && !isMaster

  const effective = computeEffectiveAccess(
    profiles.filter((p) => formData.access_profiles.includes(p.id)),
  )
  // Por módulo: um resumo (sim / algumas telas / não) e o detalhe de cada tela
  const effectiveModules = ACCESS_MODULES.map((mod) => {
    const congs = effective.congregations[mod.key]
    const cong = mod.scoped && congs ? (congs.includes('*') ? 'todas' : congs.join(', ')) : ''
    const rows = mod.screens
      .map((sc) => {
        const base = `${mod.key}.${sc.key}`
        const has = (k: string) => effective.permissions.includes(`${base}.${k}`)
        const changes = [
          ...sc.actions
            .filter((a) => a !== 'ver' && has(a))
            .map((a) => ACTION_LABELS[a as AccessAction].toLowerCase()),
          ...(sc.specials || []).filter((x) => has(x.key)).map((x) => x.label.toLowerCase()),
        ]
        const from = new Set<string>()
        for (const k of [...sc.actions, ...(sc.specials || []).map((x) => x.key)]) {
          for (const n of effective.sources[`${base}.${k}`] || []) from.add(n)
        }
        return {
          key: base,
          label: sc.label,
          view: has('ver'),
          change: changes.join(', '),
          from: [...from].join(', '),
          cong,
        }
      })
      .filter((r) => r.view || r.change)
    const all = moduleKeys(mod)
    const changeKeys = all.filter((k) => !k.endsWith('.ver'))
    const nChange = changeKeys.filter((k) => effective.permissions.includes(k)).length
    const nView = rows.filter((r) => r.view).length
    return {
      key: mod.key,
      label: mod.label,
      view: nView === 0 ? '' : nView === mod.screens.length ? 'sim' : 'algumas telas',
      change: nChange === 0 ? '' : nChange === changeKeys.length ? 'tudo' : 'em parte',
      from: [...new Set(rows.flatMap((r) => (r.from ? r.from.split(', ') : [])))].join(', '),
      cong: rows.length ? cong : '',
      rows,
    }
  })

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

    if (!formData.is_master && formData.access_profiles.length === 0) {
      toast({
        title: 'Escolha um perfil de acesso',
        description: 'Marque ao menos um perfil (Músico, Som, Financeiro...).',
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
        is_master: formData.is_master,
        access_profiles: formData.is_master ? [] : formData.access_profiles,
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
    <div className="max-w-3xl mx-auto space-y-6">
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
            {isEditing ? 'Editar pessoa' : 'Dar acesso a uma pessoa'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Informe os dados da pessoa e os perfis de acesso: eles dizem o que ela vê e o que pode
            mudar.
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

          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
            <Label
              htmlFor="active-toggle"
              className="text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Acesso ativo (desligue para suspender sem apagar)
            </Label>
            <Switch
              id="active-toggle"
              checked={formData.is_active}
              disabled={lockedMaster || editingSelf}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          {/* Acesso: Master ou perfis de acesso (os acessos dos perfis somam) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold text-slate-700">
                Perfis desta pessoa <span className="text-red-500">*</span>
              </Label>
              {isMaster && (
                <Link
                  to="/perfis-acesso"
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  Gerenciar perfis
                </Link>
              )}
            </div>

            {(isMaster || formData.is_master) && (
              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3',
                  formData.is_master ? 'border-amber-400 bg-amber-50' : 'border-slate-200',
                )}
              >
                <Switch
                  checked={formData.is_master}
                  disabled={!isMaster || editingSelf}
                  onCheckedChange={(v) => setFormData({ ...formData, is_master: v })}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Crown className="h-4 w-4 text-amber-600" />
                    Master
                  </span>
                  <span className="text-xs text-slate-600">
                    Acesso total à igreja, inclusive criar perfis e dar o Master a outros.
                  </span>
                </span>
              </label>
            )}

            {!formData.is_master && (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {shownProfiles.length === 0 && (
                  <p className="p-3 text-xs text-slate-500">Nenhum perfil de acesso cadastrado.</p>
                )}
                {shownProfiles.map((p) => {
                  const checked = formData.access_profiles.includes(p.id)
                  const allowed = canTouchProfile(p) && !lockedMaster
                  const summary = summarizeProfile(p.permissions)
                  return (
                    <label
                      key={p.id}
                      title={
                        allowed
                          ? undefined
                          : editingSelf
                            ? 'Você não pode mudar o seu próprio acesso'
                            : 'Este perfil libera coisas que você não tem. Só o MASTER pode dar ou tirar.'
                      }
                      className={cn(
                        'flex items-center gap-3 p-3',
                        allowed
                          ? 'cursor-pointer hover:bg-slate-50'
                          : 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-teal-700"
                        checked={checked}
                        disabled={!allowed}
                        onChange={() => toggleProfile(p.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                          {p.name}
                          {!p.is_active && (
                            <span className="text-[10px] font-medium text-slate-400">
                              (inativo)
                            </span>
                          )}
                          {!allowed && <Lock className="h-3 w-3 text-slate-400" />}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {summary.map((x) => `${x.label} (${x.level})`).join(' · ') ||
                            'nada liberado'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                        {p.congregations.length ? p.congregations.join(', ') : 'Todas'}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            {!formData.is_master && formData.access_profiles.length > 1 && (
              <p className="flex gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Os acessos somam: a pessoa recebe tudo o que cada perfil marcado libera.
              </p>
            )}
          </div>

          {/* O que ela pode fazer: resultado dos perfis marcados */}
          {!formData.is_master && formData.access_profiles.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-semibold text-slate-700 block">
                O que a pessoa pode fazer{' '}
                <span className="font-normal text-slate-400">resultado dos perfis</span>
                <button
                  type="button"
                  onClick={() => setShowDetail((v) => !v)}
                  className="float-right font-medium text-teal-700 hover:underline"
                >
                  {showDetail ? 'Ver por módulo' : 'Ver tela por tela'}
                </button>
              </Label>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">Módulo</th>
                      <th className="px-2 py-2 text-left font-bold">Consultar</th>
                      <th className="px-2 py-2 text-left font-bold">Mudar</th>
                      <th className="hidden px-3 py-2 text-left font-bold sm:table-cell">Vem de</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {effectiveModules.map((mod) => (
                      <Fragment key={mod.key}>
                        <tr className="bg-slate-50/50">
                          <td className={cn('px-3 py-2 text-slate-800', 'font-semibold')}>
                            {mod.label}
                            {mod.cong && (
                              <span className="ml-1 text-[10px] font-normal text-slate-400">
                                · {mod.cong}
                              </span>
                            )}
                          </td>
                          <td
                            className={cn(
                              'px-2 py-2',
                              mod.view ? 'text-teal-700 font-semibold' : 'text-slate-400',
                            )}
                          >
                            {mod.view || 'não'}
                          </td>
                          <td
                            className={cn(
                              'px-2 py-2',
                              mod.change ? 'text-teal-700 font-semibold' : 'text-slate-400',
                            )}
                          >
                            {mod.change || 'não'}
                          </td>
                          <td className="hidden px-3 py-2 text-slate-500 sm:table-cell">
                            {mod.from || '—'}
                          </td>
                        </tr>
                        {showDetail &&
                          mod.rows.map((row) => (
                            <tr key={row.key}>
                              <td className={cn('px-3 py-2 text-slate-800', 'pl-6')}>
                                {row.label}
                                {row.cong && (
                                  <span className="ml-1 text-[10px] font-normal text-slate-400">
                                    · {row.cong}
                                  </span>
                                )}
                              </td>
                              <td
                                className={cn(
                                  'px-2 py-2',
                                  row.view ? 'text-teal-700 font-semibold' : 'text-slate-400',
                                )}
                              >
                                {row.view ? 'sim' : 'não'}
                              </td>
                              <td
                                className={cn(
                                  'px-2 py-2',
                                  row.change ? 'text-teal-700 font-semibold' : 'text-slate-400',
                                )}
                              >
                                {row.change || 'não'}
                              </td>
                              <td className="hidden px-3 py-2 text-slate-500 sm:table-cell">
                                {row.from || '—'}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Seleção de Múltiplas Funções / Instrumentos */}
          {
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-semibold text-slate-700 block">
                Instrumentos e funções no louvor{' '}
                <span className="font-normal text-slate-400">(opcional)</span>
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
            </div>
          }

          {history.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-semibold text-slate-700 block">
                Histórico de acesso
              </Label>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">
                {history.map((l) => (
                  <li key={l.id} className="flex gap-3 px-3 py-2">
                    <span className="w-28 shrink-0 text-slate-400">{formatWhen(l.created)}</span>
                    <span className="text-slate-700">{describeLog(l)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
