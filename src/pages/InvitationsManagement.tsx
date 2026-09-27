import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { Invitation, OperationalRole, AppRole, Role } from '@/types'
import {
  UserPlus,
  Mail,
  Copy,
  Check,
  RefreshCw,
  XCircle,
  Clock,
  ShieldCheck,
  ExternalLink,
  Crown,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

export default function InvitationsManagement() {
  const { currentChurch, isMaster, isAdmin } = useAuth()
  const { toast } = useToast()

  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal de criação de convite
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'MUSICO' as AppRole,
    operational_roles: ['MUSICO'] as OperationalRole[],
    role_ids: [] as string[],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generatedInvite, setGeneratedInvite] = useState<{
    link: string
    name: string
    email: string
  } | null>(null)

  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchInvitations = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const res = await pb.send<{ items: Invitation[]; totalItems: number }>(
        `/backend/v1/invitations/list?church_id=${currentChurch.id}`,
        { method: 'GET' },
      )
      setInvitations(res.items || [])
    } catch (err: any) {
      console.error('Erro ao buscar convites:', err)
      toast({
        title: 'Erro ao carregar convites',
        description: err.message || 'Falha ao buscar convites da congregação.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchInvitations()
  }, [currentChurch?.id])

  useEffect(() => {
    if (!currentChurch) return
    const loadRoles = async () => {
      try {
        const list = await pb.collection('roles').getFullList<Role>({
          filter: `church_id = "${currentChurch.id}"`,
        })
        setAvailableRoles(list)
      } catch {
        /* intentionally ignored */
      }
    }
    loadRoles()
  }, [currentChurch?.id])

  const toggleOpRole = (op: OperationalRole) => {
    setFormData((prev) => {
      const exists = prev.operational_roles.includes(op)
      const updated = exists
        ? prev.operational_roles.filter((r) => r !== op)
        : [...prev.operational_roles, op]
      return { ...prev, operational_roles: updated }
    })
  }

  const toggleInstrument = (roleId: string) => {
    setFormData((prev) => {
      const exists = prev.role_ids.includes(roleId)
      const updated = exists
        ? prev.role_ids.filter((r) => r !== roleId)
        : [...prev.role_ids, roleId]
      return { ...prev, role_ids: updated }
    })
  }

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome completo do novo usuário.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.email.trim()) {
      toast({
        title: 'E-mail obrigatório',
        description: 'Informe o e-mail do convidado.',
        variant: 'destructive',
      })
      return
    }

    if (formData.operational_roles.length === 0) {
      toast({
        title: 'Função operacional obrigatória',
        description: 'Selecione pelo menos uma função (Músico, Som, Projeção, Mídia, Iluminação).',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await pb.send<{ success: boolean; invitation: Invitation; message: string }>(
        '/backend/v1/invitations/create',
        {
          method: 'POST',
          body: {
            church_id: currentChurch.id,
            name: formData.name.trim(),
            email: formData.email.trim(),
            role: formData.role,
            operational_roles: formData.operational_roles,
            role_ids: formData.role_ids,
          },
        },
      )

      // Monta o link completo com o origin do site
      const inviteUrl = `${window.location.origin}/convite/${res.invitation.token}`

      setGeneratedInvite({
        link: inviteUrl,
        name: formData.name.trim(),
        email: formData.email.trim(),
      })

      toast({
        title: 'Convite criado com sucesso!',
        description: 'Copie o link abaixo para enviar ao usuário.',
      })

      fetchInvitations()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar convite',
        description: err.data?.message || err.message || 'Falha ao registrar convite no backend.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      toast({
        title: 'Link copiado!',
        description: 'O link de ativação foi copiado para a área de transferência.',
      })
      setTimeout(() => setCopiedId(null), 3000)
    } catch (_) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar automaticamente.',
        variant: 'destructive',
      })
    }
  }

  const handleAction = async (action: 'resend' | 'cancel', invitationId: string) => {
    try {
      const res = await pb.send<{
        success: boolean
        message: string
        token?: string
      }>('/backend/v1/invitations/actions', {
        method: 'POST',
        body: { action: action, invitation_id: invitationId },
      })

      toast({
        title: action === 'resend' ? 'Convite renovado!' : 'Convite cancelado',
        description: res.message,
      })

      fetchInvitations()
    } catch (err: any) {
      toast({
        title: 'Erro na operação',
        description: err.data?.message || err.message,
        variant: 'destructive',
      })
    }
  }

  const filtered = invitations.filter((inv) => {
    const q = search.toLowerCase()
    return inv.name.toLowerCase().includes(q) || inv.email.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-teal-700" />
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Convites & Primeiro Acesso
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Convide usuários para a congregação <strong>{currentChurch?.name}</strong>. O próprio
            usuário define sua senha e acessa apenas os módulos permitidos.
          </p>
        </div>

        <Button
          onClick={() => {
            setGeneratedInvite(null)
            setFormData({
              name: '',
              email: '',
              role: 'MUSICO',
              operational_roles: ['MUSICO'],
              role_ids: [],
            })
            setCreateModalOpen(true)
          }}
          className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs gap-1.5 shadow-sm h-10"
        >
          <UserPlus className="h-4 w-4" />
          Novo Convite
        </Button>
      </div>

      {/* Explicação de segurança */}
      <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200/80 flex items-start gap-3 text-xs text-teal-900">
        <ShieldCheck className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Fluxo Seguro de Primeiro Acesso</p>
          <p className="text-teal-800 leading-relaxed">
            O administrador não cadastra senhas para outras pessoas. Ao gerar um convite, um token
            único e seguro é criado com expiração de 7 dias. O convidado clica no link, define sua
            própria senha com validação forte e entra no sistema já com suas funções operacionais
            atribuídas.
          </p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail do convidado..."
          className="pl-10 h-10 rounded-xl border-slate-200 bg-white text-xs"
        />
      </div>

      {/* Lista de Convites */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-12 text-center">
          <UserPlus className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-base font-bold text-slate-900">
            {search ? 'Nenhum convite encontrado' : 'Nenhum convite pendente'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'Tente outro termo de busca.'
              : 'Clique em "Novo Convite" para convidar operadores de som, projeção, mídia, louvor ou administração.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((inv) => {
            const inviteUrl = `${window.location.origin}/convite/${inv.token}`
            const isPending = inv.status === 'PENDING'
            const isAccepted = inv.status === 'ACCEPTED'
            const isExpired = inv.status === 'EXPIRED'
            const isCancelled = inv.status === 'CANCELLED'

            return (
              <div
                key={inv.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 truncate">{inv.name}</h3>
                    {isPending && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-1 font-semibold">
                        <Clock className="h-3 w-3" />
                        Pendente
                      </Badge>
                    )}
                    {isAccepted && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] gap-1 font-semibold">
                        <Check className="h-3 w-3" />
                        Aceito & Ativo
                      </Badge>
                    )}
                    {isExpired && (
                      <Badge variant="outline" className="text-slate-500 text-[10px]">
                        Expirado
                      </Badge>
                    )}
                    {isCancelled && (
                      <Badge
                        variant="outline"
                        className="text-rose-600 border-rose-200 text-[10px]"
                      >
                        Cancelado
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700">
                      {inv.role}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {inv.email}
                    </span>
                    <span>
                      Expira em:{' '}
                      {new Date(inv.expires_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  {/* Funções operacionais */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {inv.operational_roles &&
                      inv.operational_roles.map((op) => (
                        <span
                          key={op}
                          className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-semibold"
                        >
                          {op}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isPending && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(inviteUrl, inv.id)}
                        className="rounded-xl border-slate-200 text-xs font-semibold gap-1.5 hover:bg-slate-50"
                      >
                        {copiedId === inv.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-500" />
                            Copiar link
                          </>
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAction('resend', inv.id)}
                        title="Renovar expiração por mais 7 dias"
                        className="text-xs text-slate-600 hover:text-teal-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        Renovar
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAction('cancel', inv.id)}
                        className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Cancelar
                      </Button>
                    </>
                  )}

                  {(isExpired || isCancelled) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction('resend', inv.id)}
                      className="rounded-xl border-slate-200 text-xs font-semibold gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reenviar Convite
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Criar Novo Convite */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-teal-700" />
              Novo Convite de Acesso
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Convide um colaborador para <strong>{currentChurch?.name}</strong> com as permissões
              exatas para sua atuação.
            </DialogDescription>
          </DialogHeader>

          {!generatedInvite ? (
            <form onSubmit={handleCreateInvite} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name" className="text-xs font-semibold text-slate-700">
                  Nome Completo do Convidado <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="inv-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Carlos Eduardo"
                  className="rounded-xl text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-email" className="text-xs font-semibold text-slate-700">
                  E-mail <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="carlos@exemplo.com"
                  className="rounded-xl text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Nível Administrativo</Label>
                <Select
                  value={formData.role}
                  onValueChange={(val) => setFormData({ ...formData, role: val as AppRole })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue placeholder="Selecione o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MUSICO">Operacional (Músico / Técnico / Mídia)</SelectItem>
                    <SelectItem value="LIDER">
                      Líder (Cria eventos, repertórios e cultos)
                    </SelectItem>
                    <SelectItem value="ADMIN">
                      Administrador (Gestão de membros e igreja)
                    </SelectItem>
                    {isMaster && (
                      <SelectItem value="MASTER" className="font-bold text-amber-900">
                        MASTER (Acesso 100% irrestrito a todos os módulos)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {!isMaster && (
                  <p className="text-[11px] text-slate-400">
                    O nível MASTER só pode ser concedido pelo usuário MASTER atual.
                  </p>
                )}
              </div>

              {/* Múltiplas Funções Operacionais (Músico, Som, Projeção, Mídia, Iluminação) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <Label className="text-xs font-semibold text-slate-700 block">
                  Funções Operacionais (Selecione uma ou mais){' '}
                  <span className="text-red-500">*</span>
                </Label>
                <p className="text-[11px] text-slate-500">
                  O usuário verá exatamente a união dos módulos das funções selecionadas.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'MUSICO', label: 'Músico / Louvor', desc: 'Músicas e repertório' },
                    { key: 'SOM', label: 'Som & Áudio', desc: 'Mesa e microfones' },
                    { key: 'PROJECAO', label: 'Projeção', desc: 'Slides e Holyrics' },
                    { key: 'MIDIA', label: 'Mídia & Comunicação', desc: 'Artes e tarefas' },
                    { key: 'ILUMINACAO', label: 'Iluminação', desc: 'Luzes cênicas e cenas' },
                  ].map((op) => {
                    const isSelected = formData.operational_roles.includes(
                      op.key as OperationalRole,
                    )
                    return (
                      <button
                        key={op.key}
                        type="button"
                        onClick={() => toggleOpRole(op.key as OperationalRole)}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                          isSelected
                            ? 'bg-teal-50 border-teal-600 text-teal-900 font-semibold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{op.label}</span>
                          {isSelected && <Check className="h-4 w-4 text-teal-700" />}
                        </div>
                        <p className="text-[10px] text-slate-400 font-normal mt-0.5">{op.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Se Músico estiver selecionado, permite marcar instrumentos */}
              {formData.operational_roles.includes('MUSICO') && availableRoles.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <Label className="text-xs font-semibold text-slate-700 block">
                    Instrumentos / Voz (Opcional)
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1">
                    {availableRoles.map((r) => {
                      const isSel = formData.role_ids.includes(r.id)
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggleInstrument(r.id)}
                          className={`px-2 py-1.5 rounded-lg border text-left text-[11px] truncate ${
                            isSel
                              ? 'bg-teal-50 border-teal-600 text-teal-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          {r.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs"
                >
                  {isSubmitting ? 'Gerando convite...' : 'Criar Convite'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4 py-3">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Check className="h-5 w-5 text-emerald-700" />
                  Convite Criado com Sucesso!
                </div>
                <p>
                  O link de ativação para <strong>{generatedInvite.name}</strong> (
                  {generatedInvite.email}) está pronto.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Link de Convite</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={generatedInvite.link}
                    className="font-mono text-xs bg-slate-50 select-all rounded-xl"
                  />
                  <Button
                    type="button"
                    onClick={() => copyToClipboard(generatedInvite.link, 'modal')}
                    className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs shrink-0 gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Envie este link por WhatsApp ou E-mail. O usuário abrirá a página para definir sua
                  própria senha.
                </p>
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="w-full rounded-xl bg-slate-900 text-white text-xs font-semibold"
                >
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
