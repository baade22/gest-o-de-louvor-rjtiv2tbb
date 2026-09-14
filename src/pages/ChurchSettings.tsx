import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import {
  Church as ChurchIcon,
  CreditCard,
  AlertTriangle,
  Save,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

export default function ChurchSettings() {
  const { currentChurch, refreshAuthData, logout } = useAuth()
  const { toast } = useToast()

  const [churchName, setChurchName] = useState(currentChurch?.name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch || !churchName.trim()) return

    setIsSaving(true)
    try {
      await pb.collection('churches').update(currentChurch.id, {
        name: churchName.trim(),
      })
      await refreshAuthData()
      toast({
        title: 'Configurações salvas!',
        description: 'Os dados da igreja foram atualizados.',
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível atualizar as configurações da igreja.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeactivateChurch = async () => {
    if (!currentChurch) return
    const confirmation = window.prompt(
      `ATENÇÃO: Você está prestes a desativar a igreja "${currentChurch.name}". Para confirmar, digite exatamente o nome da igreja:`,
    )

    if (confirmation !== currentChurch.name) {
      toast({
        title: 'Ação cancelada',
        description: 'O nome digitado não confere.',
        variant: 'destructive',
      })
      return
    }

    setIsDeactivating(true)
    try {
      // Soft-delete setando is_active = false
      await pb.collection('churches').update(currentChurch.id, {
        is_active: false,
      })

      toast({
        title: 'Igreja desativada',
        description: 'A congregação foi desativada no sistema.',
      })
      logout()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao desativar',
        description: 'Não foi possível desativar a igreja.',
        variant: 'destructive',
      })
    } finally {
      setIsDeactivating(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Configurações da Igreja
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Dados da congregação, assinatura e opções avançadas de administrador.
        </p>
      </div>

      {/* Dados Gerais da Igreja */}
      <Card className="rounded-2xl border-slate-200 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">
            Identificação da Congregação
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Nome exibido nos relatórios, escalas e aplicativo mobile.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="church-name" className="text-xs font-semibold text-slate-700">
                Nome da Igreja / Ministério <span className="text-red-500">*</span>
              </Label>
              <Input
                id="church-name"
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                placeholder="Ex: Igreja Nova Aliança"
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="church-slug" className="text-xs font-semibold text-slate-700">
                Identificador Único (Slug Multi-tenant)
              </Label>
              <Input
                id="church-slug"
                value={currentChurch?.slug || ''}
                disabled
                className="rounded-xl border-slate-200 bg-slate-50 text-slate-500 font-mono text-xs"
              />
              <p className="text-[11px] text-slate-400">
                O slug identifica o workspace seguro e isolado desta igreja no banco de dados.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Salvando...' : 'Salvar Dados'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Placeholder de Assinatura / Billing (Preparado para módulos futuros) */}
      <Card className="rounded-2xl border-slate-200 shadow-xs opacity-90">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-violet-600" />
              <span>Assinatura & Planos</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Módulo SaaS pronto para integração com gateway de pagamentos
            </CardDescription>
          </div>
          <Badge className="bg-violet-100 text-violet-800 border-violet-200 text-xs">
            Plano PRO Ativo
          </Badge>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">Assinatura — Em breve</h4>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                A arquitetura multi-tenant do LouvorFlow já suporta controle de planos e cobrança
                por congregação. A tela de gerenciamento de faturas e cartões estará disponível na
                próxima atualização do sistema.
              </p>
            </div>
          </div>

          <Button disabled variant="outline" className="w-full rounded-xl text-xs font-semibold">
            Gerenciar Assinatura (Disponível em Breve)
          </Button>
        </CardContent>
      </Card>

      {/* Zona de Perigo - Soft Delete da Igreja */}
      <Card className="rounded-2xl border-red-200 shadow-xs bg-red-50/20">
        <CardHeader className="pb-3 border-b border-red-100">
          <CardTitle className="text-base font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span>Zona de Perigo</span>
          </CardTitle>
          <CardDescription className="text-xs text-red-600/80">
            Ações irreversíveis que impactam o acesso da congregação.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Desativar Igreja</h4>
            <p className="text-xs text-slate-600 mt-0.5 max-w-md">
              A congregação será marcada como inativa. Os músicos perderão o acesso até que um
              administrador reative a conta.
            </p>
          </div>

          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivateChurch}
            disabled={isDeactivating}
            className="rounded-xl text-xs font-semibold shrink-0"
          >
            {isDeactivating ? 'Desativando...' : 'Desativar Igreja'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
