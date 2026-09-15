import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  Youtube,
  MessageSquare,
  Mail,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Info,
  Unplug,
  Sparkles,
  ArrowLeft,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import type { IntegrationItem } from '@/types'
import {
  getChurchIntegrations,
  saveIntegrationCredential,
  testIntegrationConnection,
  disconnectIntegration,
} from '@/services/integrations'

export default function IntegrationsSettings() {
  const { currentChurch, isAdmin } = useAuth()
  const { toast } = useToast()

  const [integrations, setIntegrations] = useState<IntegrationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal de configuração do YouTube
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const fetchIntegrations = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const list = await getChurchIntegrations(currentChurch.id)
      setIntegrations(list)
    } catch (err: any) {
      console.error('Erro ao buscar integrações:', err)
      toast({
        title: 'Erro ao carregar integrações',
        description: err.message || 'Não foi possível carregar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchIntegrations()
  }, [currentChurch?.id])

  const youtubeIntegration = integrations.find((i) => i.provider === 'youtube')
  const isYoutubeConnected =
    Boolean(youtubeIntegration?.enabled) &&
    Boolean(youtubeIntegration?.has_credentials) &&
    youtubeIntegration?.status === 'CONNECTED'
  const isYoutubeConfigured =
    Boolean(youtubeIntegration?.enabled) && Boolean(youtubeIntegration?.has_credentials)

  // Abrir modal de edição/configuração
  const handleOpenYoutubeModal = () => {
    setApiKeyInput('')
    setTestResult(null)
    setYoutubeModalOpen(true)
  }

  // Salvar API Key
  const handleSaveApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!currentChurch) return
    const key = apiKeyInput.trim()

    if (!key && !isYoutubeConfigured) {
      toast({
        title: 'Chave obrigatória',
        description: 'Por favor, informe a API Key do YouTube Data API v3.',
        variant: 'destructive',
      })
      return
    }

    setIsSavingKey(true)
    try {
      if (key) {
        await saveIntegrationCredential({
          churchId: currentChurch.id,
          provider: 'youtube',
          name: 'YouTube Data API v3',
          apiKey: key,
          configuration: { version: 'v3' },
        })
      }

      toast({
        title: 'Credencial salva com sucesso!',
        description: 'A API Key do YouTube foi armazenada com segurança.',
      })

      // Executa teste logo após salvar para validar imediatamente
      await handleTestConnection(key || undefined)
      await fetchIntegrations()
      setYoutubeModalOpen(false)
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao salvar credencial',
        description:
          err.message ||
          'Falha ao persistir a credencial no banco de dados. Verifique suas permissões.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingKey(false)
    }
  }
  // Testar conexão
  const handleTestConnection = async (directKey?: string) => {
    if (!currentChurch) return
    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await testIntegrationConnection({
        churchId: currentChurch.id,
        provider: 'youtube',
        apiKey: directKey,
      })

      setTestResult({
        success: res.success,
        message: res.message,
      })

      if (res.success) {
        toast({
          title: 'Conexão validada!',
          description: res.message,
        })
      } else {
        toast({
          title: 'Falha no teste de conexão',
          description: res.message,
          variant: 'destructive',
        })
      }

      await fetchIntegrations()
    } catch (err: any) {
      setTestResult({
        success: false,
        message:
          err.message ||
          '✕ Não foi possível conectar ao YouTube. Verifique: API Key, YouTube Data API v3 habilitada, restrições da chave, quota disponível.',
      })
    } finally {
      setIsTesting(false)
    }
  }

  // Desconectar / Desativar
  const handleDisconnect = async () => {
    if (!currentChurch) return
    if (!window.confirm('Tem certeza de que deseja desconectar a integração com o YouTube?')) {
      return
    }

    try {
      await disconnectIntegration({
        churchId: currentChurch.id,
        provider: 'youtube',
      })

      toast({
        title: 'Integração desconectada',
        description: 'A chave foi removida para esta congregação.',
      })

      setYoutubeModalOpen(false)
      fetchIntegrations()
    } catch (err: any) {
      toast({
        title: 'Erro ao desconectar',
        description: err.message || 'Falha ao remover integração.',
        variant: 'destructive',
      })
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <ShieldCheck className="mx-auto h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito</h2>
        <p className="text-sm text-slate-500">
          A Central de Integrações é restrita a administradores da congregação. Músicos e líderes
          não possuem permissão para visualizar nem alterar credenciais.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header com navegação e breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/configuracoes"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Configurações
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Central de Integrações
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie chaves de API e serviços externos conectados com total isolamento multi-tenant
          para <strong>{currentChurch?.name}</strong>.
        </p>
      </div>

      {/* Box explicativo de arquitetura segura */}
      <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200/80 flex items-start gap-3 text-xs text-teal-900">
        <ShieldCheck className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Segurança de Credenciais e Isolamento por Igreja</p>
          <p className="text-teal-800 leading-relaxed">
            As chaves cadastradas são armazenadas com segurança no banco de dados e nunca são
            expostas ao frontend, logs ou usuários sem perfil de administrador. Cada congregação
            utiliza sua própria chave, sem necessidade de alterações no código ou variáveis de
            ambiente.
          </p>
        </div>
      </div>

      {/* Grid de Cards de Integração */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* CARD 1: YOUTUBE (ATIVO / CONFIGURÁVEL) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                <Youtube className="h-6 w-6" />
              </div>

              {isYoutubeConnected ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-xs gap-1 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Conectado
                </Badge>
              ) : isYoutubeConfigured ? (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs gap-1 font-semibold">
                  <AlertTriangle className="h-3 w-3" />
                  Verificar conexão
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-slate-50 text-slate-500 border-slate-200 text-xs"
                >
                  ⚪ Não configurado
                </Badge>
              )}
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                YouTube
              </h3>
              <p className="text-xs text-slate-400 font-medium">YouTube Data API v3</p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isYoutubeConfigured
                ? 'Permite pesquisar e vincular vídeos de referência diretamente pelo repertório da igreja.'
                : 'Para pesquisar vídeos do YouTube dentro do LouvorFlow, cadastre uma API Key.'}
            </p>

            {isYoutubeConfigured && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>API Key:</span>
                  <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    {youtubeIntegration?.masked_key || '••••••••••••••••'}
                  </span>
                </div>

                {youtubeIntegration?.last_tested_at && (
                  <p className="text-[11px] text-slate-400">
                    Última validação:{' '}
                    {new Date(youtubeIntegration.last_tested_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
            {isYoutubeConfigured ? (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleOpenYoutubeModal}
                  className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs gap-1.5"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Alterar API Key
                </Button>

                <Button
                  variant="outline"
                  disabled={isTesting}
                  onClick={() => handleTestConnection()}
                  className="w-full rounded-xl border-slate-200 text-xs font-semibold gap-1.5 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  {isTesting ? 'Testando...' : 'Testar conexão'}
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleOpenYoutubeModal}
                className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Configurar
              </Button>
            )}
          </div>
        </div>

        {/* CARD 2: WHATSAPP (EM BREVE) */}
        <div className="bg-white/80 rounded-2xl border border-dashed border-slate-200 p-5 shadow-xs flex flex-col justify-between opacity-80">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <MessageSquare className="h-6 w-6" />
              </div>
              <Badge
                variant="outline"
                className="text-[10px] bg-slate-100 text-slate-500 font-bold"
              >
                Em breve
              </Badge>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">WhatsApp</h3>
              <p className="text-xs text-slate-400 font-medium">WhatsApp Business API</p>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Notificação automática de escalas para músicos e líderes via mensagens do WhatsApp.
            </p>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <Button disabled variant="outline" className="w-full rounded-xl text-xs font-medium">
              Disponível em breve
            </Button>
          </div>
        </div>

        {/* CARD 3: E-MAIL (EM BREVE) */}
        <div className="bg-white/80 rounded-2xl border border-dashed border-slate-200 p-5 shadow-xs flex flex-col justify-between opacity-80">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Mail className="h-6 w-6" />
              </div>
              <Badge
                variant="outline"
                className="text-[10px] bg-slate-100 text-slate-500 font-bold"
              >
                Em breve
              </Badge>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">E-mail</h3>
              <p className="text-xs text-slate-400 font-medium">SMTP / Resend / SendGrid</p>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Envio de escalas, lembretes de ensaio e avisos litúrgicos para a equipe ministerial.
            </p>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100">
            <Button disabled variant="outline" className="w-full rounded-xl text-xs font-medium">
              Disponível em breve
            </Button>
          </div>
        </div>
      </div>

      {/* MODAL: Configurar / Alterar YouTube API Key */}
      <Dialog open={youtubeModalOpen} onOpenChange={setYoutubeModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-600" />
              Configurar YouTube Data API v3
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Chave de API exclusiva da congregação <strong>{currentChurch?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveApiKey} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="api-key" className="text-xs font-semibold text-slate-700">
                  Google API Key (YouTube Data API v3)
                </Label>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-teal-700 hover:text-teal-900 underline flex items-center gap-0.5"
                >
                  Obter no Google Cloud
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>

              <Input
                id="api-key"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  isYoutubeConfigured
                    ? 'Digite uma nova chave para substituir a atual'
                    : 'Cole aqui sua chave (ex: AIzaSyD...)'
                }
                className="rounded-xl font-mono text-xs"
              />

              {isYoutubeConfigured && (
                <p className="text-[11px] text-slate-500">
                  Chave configurada atualmente:{' '}
                  <code className="text-slate-800 font-bold">
                    {youtubeIntegration?.masked_key || '••••••••••••••••'}
                  </code>
                </p>
              )}
            </div>

            {/* Resultado do Teste de Conexão no Modal */}
            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                )}
                <p className="leading-relaxed font-medium">{testResult.message}</p>
              </div>
            )}

            <DialogFooter className="pt-2 gap-2 flex-col sm:flex-row">
              {isYoutubeConfigured && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDisconnect}
                  className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs"
                >
                  <Unplug className="h-3.5 w-3.5 mr-1" />
                  Desconectar
                </Button>
              )}

              {apiKeyInput.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isTesting || isSavingKey}
                  onClick={() => handleTestConnection(apiKeyInput.trim())}
                  className="rounded-xl border-slate-200 text-xs"
                  title="Testa a chave digitada sem salvá-la no banco"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isTesting ? 'animate-spin' : ''}`} />
                  {isTesting ? 'Testando...' : 'Apenas testar'}
                </Button>
              )}

              <Button
                type="submit"
                disabled={isSavingKey || isTesting}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs"
              >
                {isSavingKey ? 'Salvando...' : 'Salvar API Key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
