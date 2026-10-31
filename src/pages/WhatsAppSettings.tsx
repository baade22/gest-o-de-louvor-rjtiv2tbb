// Configurações > WhatsApp: conectar o WhatsApp da igreja por QR Code, ligar os envios
// automáticos e acompanhar a fila. Só o MASTER vê esta tela (a rota do servidor também exige).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  Smartphone,
  Unplug,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  WHATSAPP_AUTO,
  WHATSAPP_KIND_LABEL,
  formatWhatsAppPhone,
  normalizeWhatsAppPhone,
  type WhatsAppAutoKind,
} from '@/lib/whatsapp'
import {
  cancelWhatsAppMessage,
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  listWhatsAppMessages,
  retryWhatsAppMessage,
  saveWhatsAppAuto,
  sendWhatsAppTest,
  type WhatsAppMessage,
  type WhatsAppMessageStatus,
  type WhatsAppStatus,
} from '@/services/whatsapp'

const STATUS_FILTERS: Array<{
  value: WhatsAppMessageStatus | ''
  label: string
}> = [
  { value: '', label: 'Todas' },
  { value: 'FILA', label: 'Na fila' },
  { value: 'ENVIADO', label: 'Enviadas' },
  { value: 'ERRO', label: 'Com erro' },
]

const STATUS_BADGE: Record<WhatsAppMessageStatus, { label: string; className: string }> = {
  FILA: {
    label: 'Na fila',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  PAUSADO: {
    label: 'Pausada',
    className: 'bg-orange-50 text-orange-800 border-orange-200',
  },
  ENVIADO: {
    label: 'Enviada',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  ERRO: { label: 'Erro', className: 'bg-red-50 text-red-700 border-red-200' },
  CANCELADO: {
    label: 'Cancelada',
    className: 'bg-slate-100 text-slate-500 border-slate-200',
  },
}

const when = (s: string) =>
  s
    ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : ''

const errorText = (err: unknown) =>
  (err as { response?: { message?: string }; message?: string })?.response?.message ||
  (err as Error)?.message ||
  'Tente de novo.'

export default function WhatsAppSettings() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id || ''
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [qr, setQr] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [filter, setFilter] = useState<WhatsAppMessageStatus | ''>('')
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [openId, setOpenId] = useState('')
  const qrAt = useRef(0)

  const loadStatus = useCallback(async () => {
    if (!churchId) return null
    try {
      const s = await getWhatsAppStatus(churchId)
      setStatus(s)
      setLoadError('')
      return s
    } catch (err) {
      setLoadError(errorText(err))
      toast({
        title: 'Erro ao ler o WhatsApp',
        description: errorText(err),
        variant: 'destructive',
      })
      return null
    } finally {
      setLoading(false)
    }
  }, [churchId, toast])

  const loadMessages = useCallback(
    async (p = 1) => {
      if (!churchId) return
      try {
        const res = await listWhatsAppMessages(churchId, {
          page: p,
          status: filter,
        })
        setMessages((prev) => (p === 1 ? res.items : [...prev, ...res.items]))
        setHasMore(res.has_more)
        setPage(p)
      } catch {
        // O status já mostra o erro
      }
    },
    [churchId, filter],
  )

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    loadMessages(1)
  }, [loadMessages])

  // Com o QR na tela: confere a conexão a cada 3s e troca o QR a cada 40s
  useEffect(() => {
    if (!qr) return
    const t = setInterval(async () => {
      const s = await loadStatus()
      if (s?.state === 'open') {
        setQr('')
        toast({
          title: 'WhatsApp conectado',
          description: formatWhatsAppPhone(s.phone),
        })
        return
      }
      if (Date.now() - qrAt.current > 40000) {
        try {
          const r = await connectWhatsApp(churchId)
          if (r.qr) {
            setQr(r.qr)
            qrAt.current = Date.now()
          }
        } catch {
          // tenta de novo no próximo ciclo
        }
      }
    }, 3000)
    return () => clearInterval(t)
  }, [qr, churchId, loadStatus, toast])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const r = await connectWhatsApp(churchId)
      if (r.state === 'open') {
        await loadStatus()
      } else if (r.qr) {
        setQr(r.qr)
        qrAt.current = Date.now()
      }
    } catch (err) {
      toast({
        title: 'Não foi possível conectar',
        description: errorText(err),
        variant: 'destructive',
      })
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = () =>
    confirm({
      title: 'Desconectar o WhatsApp?',
      description:
        'Os envios automáticos param até alguém ler o QR Code de novo. As mensagens na fila esperam até 12 horas. Depois de conectar, os envios começam devagar (nada nos primeiros 30 minutos e uma mensagem a cada 3 minutos até completar 24 horas), para o WhatsApp não tirar o aparelho.',
      confirmLabel: 'Desconectar',
      destructive: true,
      onConfirm: async () => {
        try {
          await disconnectWhatsApp(churchId)
          await loadStatus()
        } catch (err) {
          toast({
            title: 'Erro ao desconectar',
            description: errorText(err),
            variant: 'destructive',
          })
        }
      },
    })

  const toggleAuto = async (kind: WhatsAppAutoKind, on: boolean) => {
    if (!status) return
    const previousAuto = status.auto
    const auto = { ...previousAuto, [kind]: on }
    setStatus({ ...status, auto })
    try {
      const res = await saveWhatsAppAuto(churchId, auto)
      if (res?.auto) {
        setStatus((prev) => (prev ? { ...prev, auto: res.auto } : prev))
      }
      toast({
        title: 'Configurações salvas',
        description: `${WHATSAPP_AUTO.find((a) => a.kind === kind)?.label || 'Envio automático'}: ${on ? 'ativado' : 'desativado'}.`,
      })
    } catch (err) {
      setStatus((prev) => (prev ? { ...prev, auto: previousAuto } : prev))
      toast({
        title: 'Não foi possível salvar',
        description: errorText(err),
        variant: 'destructive',
      })
    }
  }

  const handleTest = async () => {
    if (!normalizeWhatsAppPhone(testPhone)) {
      toast({ title: 'Informe um celular com DDD', variant: 'destructive' })
      return
    }
    setSendingTest(true)
    try {
      await sendWhatsAppTest(churchId, testPhone)
      toast({
        title: 'Teste na fila',
        description: 'Deve chegar em até 1 minuto.',
      })
      setTestPhone('')
      loadMessages(1)
    } catch (err) {
      toast({
        title: 'Erro no teste',
        description: errorText(err),
        variant: 'destructive',
      })
    } finally {
      setSendingTest(false)
    }
  }

  const handleRetry = async (m: WhatsAppMessage, cancel = false) => {
    try {
      if (cancel) await cancelWhatsAppMessage(churchId, m.id)
      else await retryWhatsAppMessage(churchId, m.id)
      loadMessages(1)
    } catch (err) {
      toast({
        title: 'Não deu certo',
        description: errorText(err),
        variant: 'destructive',
      })
    }
  }

  const state = status?.state
  const connected = state === 'open'

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {confirmDialog}
      <Link
        to="/configuracoes/integracoes"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Integrações
      </Link>

      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <MessageSquare className="h-7 w-7 text-emerald-600" />
          WhatsApp
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Conecte o WhatsApp de <strong>{currentChurch?.name}</strong> para o LouvorFlow mandar
          avisos sozinho.
        </p>
      </div>

      {/* Conexão */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Conexão</h2>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : connected ? (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Conectado
            </Badge>
          ) : state === 'unconfigured' ? (
            <Badge variant="outline" className="bg-slate-50 text-slate-500">
              Servidor não configurado
            </Badge>
          ) : !status ? (
            <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 gap-1">
              <AlertTriangle className="h-3 w-3" /> Erro
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 gap-1">
              <AlertTriangle className="h-3 w-3" /> Desconectado
            </Badge>
          )}
        </div>

        {!loading && !status && (
          <div className="space-y-3">
            <p className="text-sm text-red-600">
              O LouvorFlow não conseguiu ler o WhatsApp: {loadError || 'sem resposta do servidor.'}
            </p>
            <p className="text-xs text-slate-500">
              Confira no Skip se a migração 0074 foi aplicada e se os segredos{' '}
              <code>WHATSAPP_API_URL</code> e <code>WHATSAPP_API_KEY</code> estão no backend.
            </p>
            <Button
              variant="outline"
              className="rounded-xl gap-1.5"
              onClick={() => {
                setLoading(true)
                loadStatus()
              }}
            >
              <RefreshCw className="h-4 w-4" /> Tentar de novo
            </Button>
          </div>
        )}

        {state === 'unconfigured' && (
          <p className="text-sm text-slate-600 leading-relaxed">
            Falta ligar o servidor do WhatsApp. Siga o passo a passo de <code>deploy/whatsapp</code>{' '}
            e cadastre os segredos <code>WHATSAPP_API_URL</code> e <code>WHATSAPP_API_KEY</code> no
            Skip.
          </p>
        )}

        {connected && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">
                  {status?.profile_name || 'WhatsApp da igreja'}
                </p>
                <p className="text-sm text-slate-500">{formatWhatsAppPhone(status?.phone)}</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl gap-1.5" onClick={handleDisconnect}>
              <Unplug className="h-4 w-4" /> Desconectar
            </Button>
          </div>
        )}

        {!connected && state && state !== 'unconfigured' && !qr && (
          <div className="space-y-3">
            {status?.last_error && <p className="text-sm text-red-600">{status.last_error}</p>}
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              Conectar WhatsApp
            </Button>
          </div>
        )}

        {qr && (
          <div className="space-y-3">
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-sm text-sky-900">
              No celular da igreja, abra o WhatsApp, toque em <strong>Aparelhos conectados</strong>{' '}
              → <strong>Conectar um aparelho</strong> e leia o QR Code. Ele troca sozinho a cada 40
              segundos.
            </div>
            <img
              src={qr}
              alt="QR Code para conectar o WhatsApp"
              className="w-64 h-64 max-w-full border border-slate-200 rounded-xl"
            />
            <Button variant="outline" className="rounded-xl" onClick={() => setQr('')}>
              Cancelar
            </Button>
          </div>
        )}

        {connected && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Celular para teste, com DDD"
              inputMode="tel"
              className="rounded-xl sm:max-w-xs"
            />
            <Button
              variant="outline"
              className="rounded-xl gap-1.5"
              onClick={handleTest}
              disabled={sendingTest}
            >
              <Send className="h-4 w-4" /> Enviar teste
            </Button>
          </div>
        )}
      </section>

      {/* Envios automáticos */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Envio automático</h2>
          <p className="text-xs text-slate-500 mt-1">
            As mensagens saem aos poucos (no máximo 6 por minuto) para o WhatsApp não estranhar.
            Quem não tem celular com DDD na ficha fica de fora.
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {WHATSAPP_AUTO.map((a) => (
            <li key={a.kind} className="flex items-start justify-between gap-4 py-3">
              <label htmlFor={`wa-${a.kind}`} className="cursor-pointer">
                <span className="block text-sm font-semibold text-slate-800">{a.label}</span>
                <span className="block text-xs text-slate-500">{a.hint}</span>
              </label>
              <Switch
                id={`wa-${a.kind}`}
                checked={!!status?.auto?.[a.kind]}
                disabled={!status}
                onCheckedChange={(on) => toggleAuto(a.kind, on)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Histórico */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">
            Histórico
            {status && (status.queue.fila > 0 || status.queue.erro > 0) && (
              <span className="ml-2 text-xs font-medium text-slate-500">
                {status.queue.fila} na fila · {status.queue.erro} com erro
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value || 'all'}
                size="sm"
                variant={filter === f.value ? 'default' : 'ghost'}
                className="rounded-lg h-8 text-xs"
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Atualizar"
              onClick={() => {
                loadStatus()
                loadMessages(1)
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma mensagem por aqui ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((m) => (
              <li key={m.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left min-w-0"
                    onClick={() => setOpenId(openId === m.id ? '' : m.id)}
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      {m.name || formatWhatsAppPhone(m.phone)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {' '}
                      · {WHATSAPP_KIND_LABEL[m.kind]} · {when(m.sent_at || m.created)}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={STATUS_BADGE[m.status].className}>
                      {m.status === 'ENVIADO' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {STATUS_BADGE[m.status].label}
                    </Badge>
                    {(m.status === 'ERRO' || m.status === 'CANCELADO') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label="Tentar de novo"
                        onClick={() => handleRetry(m)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {m.status === 'FILA' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label="Cancelar envio"
                        onClick={() => handleRetry(m, true)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {m.error && <p className="text-xs text-red-600">{m.error}</p>}
                {openId === m.id && (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">
                    {m.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <Button
            variant="outline"
            className="rounded-xl w-full"
            onClick={() => loadMessages(page + 1)}
          >
            Ver mais
          </Button>
        )}
      </section>
    </div>
  )
}
