import React, { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clock,
  Copy,
  Download,
  Loader2,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Chip, EmptyState, timeAgo, type Tone } from '@/pages/event-center/shared'
import {
  deleteHolyricsAgents,
  generateHolyricsPairingCode,
  listHolyricsAgents,
  renameHolyricsAgent,
  testHolyricsAgent,
  type HolyricsAgentInfo,
} from '@/services/holyricsAgent'

const AGENT_LATEST_VERSION = '0.0.37'
const AGENT_DOWNLOAD = `/LouvorFlow-Agent-${AGENT_LATEST_VERSION}.zip`
const STALE_DAYS = 30

type Filter = 'all' | 'online' | 'stale'

interface HolyricsAgentCardProps {
  currentChurch: any
  isAdmin: boolean
}

/** Datas do PocketBase vêm como "2026-10-17 12:00:00.000Z". */
const parsePbDate = (value?: string) => {
  if (!value) return NaN
  const iso = value.trim().replace(' ', 'T')
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z').getTime()
}

/** Situação do computador do ponto de vista de quem administra. */
export function agentState(agent: HolyricsAgentInfo, now = Date.now()) {
  if (agent.status === 'ONLINE') return { label: 'Online', tone: 'ok' as Tone, key: 'online' }
  if (!agent.paired_at) {
    const expires = parsePbDate(agent.pairing_expires_at)
    if (agent.has_pairing_code && expires > now) {
      return { label: 'Aguardando código', tone: 'violet' as Tone, key: 'pairing' }
    }
    return { label: 'Nunca conectou', tone: 'neutral' as Tone, key: 'never' }
  }
  return { label: 'Offline', tone: 'neutral' as Tone, key: 'offline' }
}

/** Sem contato há mais de 30 dias (ou nunca conectou). */
export function isStaleAgent(agent: HolyricsAgentInfo, now = Date.now()) {
  if (agent.status === 'ONLINE') return false
  const ref = agent.last_seen_at || agent.paired_at
  if (!ref) return agentState(agent, now).key !== 'pairing'
  const time = parsePbDate(ref)
  return Number.isNaN(time) || now - time > STALE_DAYS * 24 * 60 * 60 * 1000
}

/** "0.0.24" < "0.0.37" */
export function isOutdatedVersion(version?: string, latest = AGENT_LATEST_VERSION) {
  if (!version) return false
  const a = version.split('.').map((n) => parseInt(n, 10) || 0)
  const b = latest.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0)
  }
  return false
}

const PLATFORM_LABELS: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

const platformLabel = (p?: string) => (p ? PLATFORM_LABELS[p] || p : '')

const agentDisplayName = (a: HolyricsAgentInfo) => a.name || a.machine_name || 'Computador'

export function HolyricsAgentCard({ currentChurch, isAdmin }: HolyricsAgentCardProps) {
  const { toast } = useToast()
  const [agents, setAgents] = useState<HolyricsAgentInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [toDelete, setToDelete] = useState<HolyricsAgentInfo[]>([])
  const [renaming, setRenaming] = useState<HolyricsAgentInfo | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isRenamingSaving, setIsRenamingSaving] = useState(false)
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null)

  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false)
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [pairingData, setPairingData] = useState<{ code: string; expires_at: string } | null>(null)
  const [agentNameInput, setAgentNameInput] = useState('PC Projeção Holyrics')
  const [copiedCode, setCopiedCode] = useState(false)

  const fetchAgents = async () => {
    if (!currentChurch) return
    try {
      const list = await listHolyricsAgents(currentChurch.id)
      setAgents(list)
      setSelected((prev) => prev.filter((id) => list.some((a) => a.id === id)))
    } catch (err: any) {
      console.error('Erro ao listar agentes:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAgents()
    // Atualiza o status dos computadores a cada 10 segundos
    const interval = setInterval(fetchAgents, 10000)
    return () => clearInterval(interval)
  }, [currentChurch?.id])

  const onlineCount = agents.filter((a) => a.status === 'ONLINE').length
  const staleCount = agents.filter((a) => isStaleAgent(a)).length

  const visible = useMemo(() => {
    if (filter === 'online') return agents.filter((a) => a.status === 'ONLINE')
    if (filter === 'stale') return agents.filter((a) => isStaleAgent(a))
    return agents
  }, [agents, filter])

  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.includes(a.id))
  const selectedAgents = agents.filter((a) => selected.includes(a.id))

  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const toggleAllVisible = () =>
    setSelected((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visible.some((a) => a.id === id))
        : [...new Set([...prev, ...visible.map((a) => a.id)])],
    )

  const handleDelete = async () => {
    const ids = toDelete.map((a) => a.id)
    const res = await deleteHolyricsAgents(currentChurch.id, ids)
    toast({
      title: res.deleted === 1 ? 'Computador excluído' : `${res.deleted} computadores excluídos`,
    })
    setSelected((prev) => prev.filter((id) => !ids.includes(id)))
    setAgents((prev) => prev.filter((a) => !ids.includes(a.id)))
    fetchAgents()
  }

  const handleRename = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!renaming || !renameValue.trim()) return
    setIsRenamingSaving(true)
    try {
      await renameHolyricsAgent(currentChurch.id, renaming.id, renameValue.trim())
      setAgents((prev) =>
        prev.map((a) => (a.id === renaming.id ? { ...a, name: renameValue.trim() } : a)),
      )
      setRenaming(null)
      toast({ title: 'Nome atualizado' })
    } catch (err: any) {
      toast({
        title: 'Não foi possível renomear',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setIsRenamingSaving(false)
    }
  }

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
      setPairingData({ code: res.pairing_code, expires_at: res.expires_at })
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
  }

  // Testa a conexão SaaS -> Agent -> Holyrics local
  const handleTestAgent = async (agent: HolyricsAgentInfo) => {
    if (!currentChurch) return
    setTestingAgentId(agent.id)
    try {
      const res = await testHolyricsAgent(currentChurch.id, agent.id)
      if (res.success && res.holyrics_connected) {
        toast({ title: 'Conexão confirmada', description: res.message })
      } else {
        toast({
          title: res.agent_online ? 'O Holyrics não respondeu' : 'Computador offline',
          description: res.message,
          variant: 'destructive',
        })
      }
      fetchAgents()
    } catch (err: any) {
      toast({
        title: 'Erro ao testar',
        description: err.message || 'Falha de comunicação com o computador.',
        variant: 'destructive',
      })
    } finally {
      setTestingAgentId(null)
    }
  }

  const deletingOnline = toDelete.filter((a) => a.status === 'ONLINE')
  const deleteTitle =
    toDelete.length === 1
      ? `Excluir "${agentDisplayName(toDelete[0])}"?`
      : `Excluir ${toDelete.length} computadores?`
  const deleteNames =
    toDelete.length <= 3
      ? toDelete.map((a) => `"${agentDisplayName(a)}"`).join(toDelete.length === 2 ? ' e ' : ', ')
      : `${toDelete.length} computadores`

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: agents.length },
    { key: 'online', label: 'Online', count: onlineCount },
    { key: 'stale', label: `Sem uso há ${STALE_DAYS} dias`, count: staleCount },
  ]

  return (
    <>
      <section className="col-span-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
            <Monitor className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-slate-900">Computadores conectados</h3>
              {onlineCount > 0 ? (
                <Chip tone="ok">{onlineCount} online</Chip>
              ) : agents.some((a) => a.paired_at) ? (
                <Chip tone="warn">Nenhum online</Chip>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              Computadores com o LouvorFlow Agent, que levam repertório e mídias ao Holyrics.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <a
              href={AGENT_DOWNLOAD}
              download={`LouvorFlow-Agent-${AGENT_LATEST_VERSION}.zip`}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:flex-none"
              title={`Versão ${AGENT_LATEST_VERSION}`}
            >
              <Download className="h-4 w-4" />
              Baixar Agent
            </a>
            {isAdmin && (
              <Button
                onClick={handleOpenPairModal}
                className="h-9 flex-1 gap-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800 sm:flex-none"
              >
                <Plus className="h-4 w-4" />
                Conectar computador
              </Button>
            )}
          </div>
        </div>

        {/* Filtros */}
        {agents.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-2.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  filter === f.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {f.label}
                <span
                  className={cn('ml-1.5', filter === f.key ? 'text-slate-300' : 'text-slate-400')}
                >
                  {f.count}
                </span>
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAgents}
              className="ml-auto h-7 gap-1 text-xs text-slate-500"
            >
              <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        )}

        {/* Barra de seleção */}
        {isAdmin && selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-red-100 bg-red-50/60 px-5 py-2.5">
            <span className="text-sm font-medium text-slate-800">
              {selected.length === 1 ? '1 selecionado' : `${selected.length} selecionados`}
            </span>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Limpar seleção
            </button>
            <Button
              size="sm"
              onClick={() => setToDelete(selectedAgents)}
              className="ml-auto h-8 gap-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir selecionados
            </Button>
          </div>
        )}

        {/* Lista */}
        {isLoading && agents.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando computadores…
          </div>
        ) : agents.length === 0 ? (
          <EmptyState
            icon={Monitor}
            title="Nenhum computador conectado"
            description="Instale o LouvorFlow Agent no computador do Holyrics e conecte com um código de 6 dígitos."
            action={
              isAdmin && (
                <Button
                  onClick={handleOpenPairModal}
                  className="gap-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800"
                >
                  <Plus className="h-4 w-4" />
                  Conectar computador
                </Button>
              )
            }
          />
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Nenhum computador neste filtro.
          </p>
        ) : (
          <div>
            <div className="hidden grid-cols-[28px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] items-center gap-4 border-b border-slate-100 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
              {isAdmin ? (
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Selecionar todos"
                />
              ) : (
                <span />
              )}
              <span>Computador</span>
              <span>Situação</span>
              <span>Último contato</span>
              <span>Versão</span>
              <span className="w-[150px]" />
            </div>
            <ul className="divide-y divide-slate-100">
              {visible.map((agent) => {
                const state = agentState(agent)
                const outdated = isOutdatedVersion(agent.version)
                const isSelected = selected.includes(agent.id)
                const sub = [agent.machine_name, platformLabel(agent.platform)]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li
                    key={agent.id}
                    className={cn(
                      'grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-3.5 md:grid-cols-[28px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] md:gap-x-4',
                      isSelected && 'bg-teal-50/40',
                    )}
                  >
                    {isAdmin ? (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(agent.id)}
                        aria-label={`Selecionar ${agentDisplayName(agent)}`}
                      />
                    ) : (
                      <span />
                    )}

                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                          state.key === 'online'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        <Monitor className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {agentDisplayName(agent)}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {sub || 'Ainda não identificado'}
                          {state.key === 'online' && (
                            <span
                              className={cn(
                                'ml-1.5',
                                agent.holyrics_detected ? 'text-emerald-700' : 'text-amber-700',
                              )}
                            >
                              ·{' '}
                              {agent.holyrics_detected
                                ? 'Holyrics aberto'
                                : 'Holyrics não encontrado'}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Situação/contato/versão: linha própria no celular */}
                    <div className="col-span-3 col-start-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 md:hidden">
                      <Chip tone={state.tone}>{state.label}</Chip>
                      {agent.last_seen_at && <span>{timeAgo(agent.last_seen_at)}</span>}
                      {agent.version && (
                        <span className={cn(outdated && 'text-amber-700')}>
                          v{agent.version}
                          {outdated && ' · atualizar'}
                        </span>
                      )}
                    </div>

                    <div className="hidden md:block">
                      <Chip tone={state.tone}>{state.label}</Chip>
                    </div>
                    <span className="hidden text-sm text-slate-600 md:block">
                      {agent.last_seen_at ? timeAgo(agent.last_seen_at) : '—'}
                    </span>
                    <div className="hidden items-center gap-1.5 md:flex">
                      {agent.version ? (
                        <>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                            {agent.version}
                          </span>
                          {outdated && (
                            <span
                              className="text-[11px] font-medium text-amber-700"
                              title={`Versão mais nova: ${AGENT_LATEST_VERSION}`}
                            >
                              Atualizar
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1 md:w-[150px]">
                      {state.key === 'online' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={testingAgentId === agent.id || !isAdmin}
                          onClick={() => handleTestAgent(agent)}
                          className="h-8 gap-1.5 px-2 text-xs text-slate-600"
                        >
                          {testingAgentId === agent.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Radio className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">Testar</span>
                        </Button>
                      )}
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500"
                              aria-label="Mais ações"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenaming(agent)
                                setRenameValue(agentDisplayName(agent))
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Renomear
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setToDelete([agent])}
                              className="text-red-600 focus:text-red-700"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          A senha do Holyrics fica só no computador da igreja. Nenhuma porta do roteador precisa ser
          aberta.
        </div>
      </section>

      {/* Confirmar exclusão */}
      <ConfirmDialog
        open={toDelete.length > 0}
        onOpenChange={(open) => !open && setToDelete([])}
        title={deleteTitle}
        description={`${deleteNames} ${toDelete.length === 1 ? 'será desconectado' : 'serão desconectados'} do LouvorFlow.`}
        confirmLabel={toDelete.length === 1 ? 'Excluir computador' : 'Excluir computadores'}
        destructive
        onConfirm={handleDelete}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {deletingOnline.length > 0 && (
            <li className="font-medium text-amber-700">
              {deletingOnline.length === 1
                ? toDelete.length === 1
                  ? 'Ele está online agora e para de receber envios na hora.'
                  : `"${agentDisplayName(deletingOnline[0])}" está online agora e para de receber envios na hora.`
                : `${deletingOnline.length} deles estão online agora e param de receber envios na hora.`}
            </li>
          )}
          <li>O acesso do Agent nesse computador deixa de funcionar.</li>
          <li>O histórico de envios ao Holyrics é mantido.</li>
          <li>Para usar de novo, basta conectar com um novo código.</li>
        </ul>
      </ConfirmDialog>

      {/* Renomear */}
      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(o) => !o && !isRenamingSaving && setRenaming(null)}
      >
        <DialogContent className="rounded-xl sm:max-w-sm">
          <form onSubmit={handleRename}>
            <DialogHeader>
              <DialogTitle>Renomear computador</DialogTitle>
              <DialogDescription>
                Um nome que a equipe reconheça, como "Projeção nave".
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={80}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(null)}
                disabled={isRenamingSaving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!renameValue.trim() || isRenamingSaving}
                className="bg-teal-700 text-white hover:bg-teal-800"
              >
                {isRenamingSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Gerar código de pareamento */}
      <Dialog open={isPairingModalOpen} onOpenChange={setIsPairingModalOpen}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar computador</DialogTitle>
            <DialogDescription>
              Use no computador da projeção, onde o Holyrics está instalado.
            </DialogDescription>
          </DialogHeader>

          {!pairingData ? (
            <form onSubmit={handleGenerateCode} className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Nome do computador</Label>
                <Input
                  id="agent-name"
                  value={agentNameInput}
                  onChange={(e) => setAgentNameInput(e.target.value)}
                  placeholder="Ex: Projeção nave"
                  required
                />
              </div>

              <ol className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-600">
                {[
                  'Gere um código de 6 dígitos (vale por 10 minutos).',
                  'No computador do Holyrics, abra o Agent em localhost:8765.',
                  'Digite o código e clique em Conectar.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-700 text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPairingModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isGeneratingCode}
                  className="bg-teal-700 text-white hover:bg-teal-800"
                >
                  {isGeneratingCode && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Gerar código
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4 py-1">
              <div className="flex items-center justify-center gap-4 rounded-xl bg-slate-900 px-6 py-5">
                <span className="font-mono text-3xl font-bold tracking-widest text-emerald-400">
                  {pairingData.code}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyCode}
                  className="h-8 w-8 text-slate-300 hover:bg-slate-800 hover:text-white"
                  aria-label="Copiar código"
                >
                  {copiedCode ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-xs text-amber-700">
                <Clock className="h-3.5 w-3.5" />
                Use uma vez, em até 10 minutos.
              </p>
              <p className="text-sm text-slate-600">
                No computador da igreja, abra <strong>localhost:8765</strong>, digite o código e
                clique em <strong>Conectar</strong>. O computador aparece nesta lista sozinho.
              </p>
              <Button
                type="button"
                onClick={() => {
                  setIsPairingModalOpen(false)
                  fetchAgents()
                }}
                className="w-full bg-slate-900 text-white hover:bg-slate-800"
              >
                Concluir
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
