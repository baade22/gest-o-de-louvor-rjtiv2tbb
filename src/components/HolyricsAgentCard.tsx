import React, { useState, useEffect } from 'react'
import {
  Monitor,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Radio,
  ExternalLink,
  ShieldCheck,
  Clock,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  listHolyricsAgents,
  generateHolyricsPairingCode,
  testHolyricsAgent,
  type HolyricsAgentInfo,
} from '@/services/holyricsAgent'

interface HolyricsAgentCardProps {
  currentChurch: any
  isAdmin: boolean
}

export function HolyricsAgentCard({ currentChurch, isAdmin }: HolyricsAgentCardProps) {
  const { toast } = useToast()
  const [agents, setAgents] = useState<HolyricsAgentInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false)
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [pairingData, setPairingData] = useState<{ code: string; expires_at: string } | null>(null)
  const [agentNameInput, setAgentNameInput] = useState('PC Projeção Holyrics')
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    agentId: string
    success: boolean
    message: string
  } | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  const fetchAgents = async () => {
    if (!currentChurch) return
    try {
      const list = await listHolyricsAgents(currentChurch.id)
      setAgents(list)
    } catch (err: any) {
      console.error('Erro ao listar agentes:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAgents()
    // Polling a cada 10 segundos na tela de integrações para atualizar status do agent em tempo real
    const interval = setInterval(fetchAgents, 10000)
    return () => clearInterval(interval)
  }, [currentChurch?.id])

  // Identifica agentes online e pareados
  const activeAgent = agents.find((a) => a.status === 'ONLINE')
  const pairedAgents = agents.filter((a) => Boolean(a.paired_at))
  const isAnyOnline = Boolean(activeAgent)

  // Gerar código de pareamento
  const handleOpenPairModal = () => {
    setPairingData(null)
    setAgentNameInput('PC Projeção Holyrics')
    setIsPairingModalOpen(true)
  }

  const handleGenerateCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!currentChurch) return
    setIsGeneratingCode(true)
    try {
      const res = await generateHolyricsPairingCode(currentChurch.id, agentNameInput)
      setPairingData({
        code: res.pairing_code,
        expires_at: res.expires_at,
      })
      toast({
        title: 'Código gerado com sucesso!',
        description: 'Válido por 10 minutos. Digite-o no LouvorFlow Agent no computador da igreja.',
      })
      fetchAgents()
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar código',
        description: err.message || 'Não foi possível gerar o código de pareamento.',
        variant: 'destructive',
      })
    } finally {
      setIsGeneratingCode(false)
    }
  }

  const handleCopyCode = () => {
    if (!pairingData?.code) return
    navigator.clipboard.writeText(pairingData.code.replace(/\s+/g, ''))
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
    toast({ title: 'Copiado!', description: 'Código copiado para a área de transferência.' })
  }

  // Testar conexão SaaS -> Agent -> Holyrics Local
  const handleTestAgent = async (agent: HolyricsAgentInfo) => {
    if (!currentChurch) return
    setTestingAgentId(agent.id)
    setTestResult(null)
    try {
      const res = await testHolyricsAgent(currentChurch.id, agent.id)
      setTestResult({
        agentId: agent.id,
        success: res.success && res.holyrics_connected,
        message: res.message,
      })

      if (res.success && res.holyrics_connected) {
        toast({
          title: 'Conexão confirmada!',
          description: res.message,
        })
      } else {
        toast({
          title: res.agent_online ? 'Holyrics não respondeu' : 'Agent offline',
          description: res.message,
          variant: 'destructive',
        })
      }
      fetchAgents()
    } catch (err: any) {
      setTestResult({
        agentId: agent.id,
        success: false,
        message: err.message || 'Falha ao testar agente.',
      })
      toast({
        title: 'Erro ao testar',
        description: err.message || 'Falha de comunicação com o Agent.',
        variant: 'destructive',
      })
    } finally {
      setTestingAgentId(null)
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all col-span-1 md:col-span-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 font-extrabold text-sm">
                <Laptop className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  Holyrics Local Agent
                  <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-bold">
                    Ponte Segura SaaS ↔ Local
                  </Badge>
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Comunicação direta com o Holyrics (127.0.0.1:8091) no computador da congregação
                </p>
              </div>
            </div>

            {isAnyOnline ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-xs gap-1.5 font-semibold px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />🟢 Computador
                Conectado
              </Badge>
            ) : pairedAgents.length > 0 ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs gap-1 font-semibold px-2.5 py-1">
                <AlertTriangle className="h-3 w-3" />
                Computador Offline
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-slate-50 text-slate-500 border-slate-200 text-xs px-2.5 py-1"
              >
                ⚪ Não pareado
              </Badge>
            )}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            O <strong>LouvorFlow Agent</strong> é um aplicativo leve que roda no computador onde o
            Holyrics está instalado. Ele recebe os comandos de envio de músicas e repertório de
            forma 100% segura (comunicação de saída),{' '}
            <strong>sem exigir liberação de portas no roteador</strong> e sem expor o IP da igreja.
          </p>

          {/* LISTA DE AGENTS PAREADOS */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Computadores Registrados ({pairedAgents.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAgents}
                className="h-7 text-xs text-slate-500 hover:text-slate-900 gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {pairedAgents.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-500 text-center space-y-2">
                <p>Nenhum computador com LouvorFlow Agent pareado nesta congregação.</p>
                <p className="text-[11px] text-slate-400">
                  Clique no botão abaixo para gerar o código temporário e conectar o computador da
                  projeção.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pairedAgents.map((agent) => {
                  const isOnline = agent.status === 'ONLINE'
                  const isHolyricsOk = Boolean(agent.holyrics_detected)

                  return (
                    <div
                      key={agent.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Monitor className="h-3.5 w-3.5 text-purple-600" />
                            {agent.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                              isOnline
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isOnline ? '🟢 Online' : '🔴 Offline'}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 space-y-0.5 font-mono">
                          <div>Máquina: {agent.machine_name || 'Desconhecida'}</div>
                          <div>
                            Holyrics Local:{' '}
                            {isHolyricsOk ? (
                              <span className="text-emerald-700 font-bold">
                                🟢 Detectado{' '}
                                {agent.holyrics_version ? `(v${agent.holyrics_version})` : ''}
                              </span>
                            ) : (
                              <span className="text-amber-700 font-semibold">
                                ⚠️ Não detectado (porta {agent.api_port || 8091})
                              </span>
                            )}
                          </div>
                          {agent.last_seen_at && (
                            <div className="text-[10px] text-slate-400">
                              Visto por último:{' '}
                              {new Date(agent.last_seen_at).toLocaleTimeString('pt-BR')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botão de Testar Conexão Real */}
                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={testingAgentId === agent.id || !isAdmin}
                          onClick={() => handleTestAgent(agent)}
                          className="h-7 text-xs font-semibold rounded-lg border-slate-300 w-full hover:bg-white"
                        >
                          <Radio
                            className={`h-3 w-3 mr-1 text-purple-600 ${testingAgentId === agent.id ? 'animate-pulse' : ''}`}
                          />
                          {testingAgentId === agent.id ? 'Testando via Agent...' : 'Testar Conexão'}
                        </Button>
                      </div>

                      {testResult && testResult.agentId === agent.id && (
                        <div
                          className={`p-2.5 rounded-lg border text-[11px] leading-relaxed font-medium ${
                            testResult.success
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-900 border-amber-200'
                          }`}
                        >
                          {testResult.message}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* AÇÕES INFERIORES */}
        <div className="pt-4 mt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              O token do Holyrics fica salvo <strong>exclusivamente</strong> no PC da igreja.
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <a
              href="/LouvorFlow-Agent-0.0.24.zip"
              download="LouvorFlow-Agent-0.0.24.zip"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-purple-700 bg-slate-100 hover:bg-purple-50 rounded-xl transition-colors border border-slate-200"
              title="Baixar pacote do LouvorFlow Agent para execução no computador local"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar Agent (LouvorFlow-Agent-0.0.24.zip)
            </a>

            {isAdmin && (
              <Button
                onClick={handleOpenPairModal}
                className="w-full sm:w-auto rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs gap-1.5 shadow-sm px-4"
              >
                <Laptop className="h-3.5 w-3.5" />
                Conectar computador
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Gerar Código de Pareamento */}
      <Dialog open={isPairingModalOpen} onOpenChange={setIsPairingModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Laptop className="h-5 w-5 text-purple-700" />
              Conectar Computador ao LouvorFlow
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Conecte o computador da projeção onde o Holyrics está instalado através do LouvorFlow
              Agent.
            </DialogDescription>
          </DialogHeader>

          {!pairingData ? (
            <form onSubmit={handleGenerateCode} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name" className="text-xs font-semibold text-slate-700">
                  Nome de identificação do computador
                </Label>
                <Input
                  id="agent-name"
                  value={agentNameInput}
                  onChange={(e) => setAgentNameInput(e.target.value)}
                  placeholder="Ex: PC Projeção - Nave Principal"
                  className="rounded-xl text-xs"
                  required
                />
                <p className="text-[11px] text-slate-500">
                  Ajuda a identificar a máquina caso sua congregação use múltiplos computadores.
                </p>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-700" />
                  Como funciona:
                </p>
                <ol className="list-decimal list-inside text-[11px] space-y-0.5 text-purple-800 pl-1">
                  <li>Será gerado um código numérico de 6 dígitos temporário (10 minutos).</li>
                  <li>
                    Abra o LouvorFlow Agent no computador do Holyrics (http://localhost:8765).
                  </li>
                  <li>Digite o código e clique em Conectar. Pronto!</li>
                </ol>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPairingModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isGeneratingCode}
                  className="rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs"
                >
                  {isGeneratingCode ? 'Gerando...' : 'Gerar Código de Pareamento'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-5 py-3">
              <div className="text-center space-y-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Código de Pareamento
                </span>
                <div className="bg-slate-900 text-white py-4 px-6 rounded-2xl flex items-center justify-center gap-4">
                  <span className="text-3xl font-extrabold tracking-widest font-mono text-emerald-400">
                    {pairingData.code}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyCode}
                    className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
                    title="Copiar código"
                  >
                    {copiedCode ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-amber-600 font-medium">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Código de uso único válido por 10 minutos</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                <p className="font-bold text-slate-900">Passos no computador do Holyrics:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
                  <li>
                    No computador da igreja, abra o painel do Agent:{' '}
                    <strong>http://localhost:8765</strong>
                  </li>
                  <li>
                    No campo <em>"Código de Pareamento"</em>, digite os 6 dígitos acima.
                  </li>
                  <li>
                    Clique em <strong>[Conectar]</strong>. O LouvorFlow detectará a conexão
                    automaticamente.
                  </li>
                </ol>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setIsPairingModalOpen(false)
                    fetchAgents()
                  }}
                  className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs"
                >
                  Concluir e fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
