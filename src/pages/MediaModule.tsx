import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Image as ImageIcon,
  ArrowLeft,
  UploadCloud,
  Download,
  FileVideo,
  Trash2,
  AlertCircle,
  FolderCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import type { MediaAsset, EventItem, ChurchMember } from '@/types'
import {
  listAllChurchMedia,
  uploadMediaAsset,
  getMediaFileUrl,
  deleteMediaAsset,
} from '@/services/media'
import { generateHolyricsFileName } from '@/lib/mediaNaming'

const ALLOWED_EXTENSIONS_BY_TYPE: Record<string, string[]> = {
  IMAGEM: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
  VIDEO: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'],
  AUDIO: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'flac'],
  DOCUMENTO: ['pdf', 'pptx', 'ppt', 'ppsx', 'pps'],
}

function detectMediaTypeFromExtension(
  fileName: string,
): 'VIDEO' | 'IMAGEM' | 'AUDIO' | 'DOCUMENTO' | null {
  const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/)
  if (!extMatch) return null
  const ext = extMatch[1].toLowerCase()
  for (const [type, exts] of Object.entries(ALLOWED_EXTENSIONS_BY_TYPE)) {
    if (exts.includes(ext)) {
      return type as 'VIDEO' | 'IMAGEM' | 'AUDIO' | 'DOCUMENTO'
    }
  }
  return null
}

export default function MediaModule() {
  const { currentChurch, currentMember, isAdmin, isMaster } = useAuth()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [backendAllowed, setBackendAllowed] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [medias, setMedias] = useState<MediaAsset[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [members, setMembers] = useState<ChurchMember[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Upload Modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaName, setMediaName] = useState('')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [mediaType, setMediaType] = useState<'VIDEO' | 'IMAGEM' | 'AUDIO' | 'DOCUMENTO'>('VIDEO')
  const [typeValidationWarning, setTypeValidationWarning] = useState<string | null>(null)
  const [mediaCategory, setMediaCategory] = useState<
    'AGENDA' | 'ANIVERSARIANTES' | 'AVISOS' | 'CULTOS' | 'EVENTOS' | 'VIDEO_ESPECIAL' | 'OUTROS'
  >('AVISOS')
  const [assignedOperator, setAssignedOperator] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Cálculo reativo do nome físico final do arquivo
  const selectedEvent = events.find((e) => e.id === selectedEventId)
  const computedHolyricsFileName = generateHolyricsFileName({
    eventName: selectedEvent?.title || 'Culto',
    category: mediaCategory,
    eventDate: selectedEvent?.date,
    title: mediaName || mediaFile?.name || '',
    originalFileName: mediaFile?.name || '',
  })

  const loadData = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const mediaList = await listAllChurchMedia(currentChurch.id)
      setMedias(mediaList)

      const evs = await pb.collection('events').getFullList<EventItem>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: '-date',
      })
      setEvents(evs)

      const membs = await pb.collection('church_members').getFullList<ChurchMember>({
        filter: `church_id = "${currentChurch.id}" && is_active = true`,
        expand: 'user_id',
      })
      setMembers(membs)
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const churchId = currentChurch?.id || ''
        const res = await pb.send<{ allowed: boolean; message?: string }>(
          `/backend/v1/modules/access?module=media&church_id=${churchId}`,
          { method: 'GET' },
        )
        setBackendAllowed(res.allowed)
        if (res.allowed) {
          loadData()
        }
      } catch (err: any) {
        setBackendAllowed(false)
        setErrorMsg(err.data?.message || err.message || 'Acesso negado pelo backend')
        setIsLoading(false)
      }
    }
    checkBackend()
  }, [currentChurch?.id])

  if (backendAllowed === false) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-red-600">Acesso Bloqueado pelo Servidor</h2>
        <p className="text-sm text-slate-600">{errorMsg}</p>
        <Link to="/dashboard">
          <Button variant="outline">Voltar ao Início</Button>
        </Link>
      </div>
    )
  }

  // Validação cruzada estrita entre extensão do arquivo e o media_type selecionado
  const validateFileAndType = (
    file: File | null,
    type: string,
  ): { valid: boolean; message?: string } => {
    if (!file) return { valid: true }
    const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/)
    const ext = extMatch ? extMatch[1].toLowerCase() : ''
    const allowed = ALLOWED_EXTENSIONS_BY_TYPE[type] || []

    if (ext && !allowed.includes(ext)) {
      const detected = detectMediaTypeFromExtension(file.name)
      let suggestion = ''
      if (detected) {
        suggestion = ` Sugestão: altere o tipo para ${detected}.`
      }
      return {
        valid: false,
        message: `Extensão .${ext} não é permitida para o tipo ${type}. Extensões aceitas: ${allowed.join(', ')}.${suggestion}`,
      }
    }
    return { valid: true }
  }

  const handleFileSelection = (f: File) => {
    setMediaFile(f)
    if (!mediaName) setMediaName(f.name)
    const detected = detectMediaTypeFromExtension(f.name)
    const effectiveType = detected || mediaType
    if (detected) {
      setMediaType(detected)
    }
    const val = validateFileAndType(f, effectiveType)
    setTypeValidationWarning(val.valid ? null : val.message || null)
  }

  const handleMediaTypeChange = (newType: 'VIDEO' | 'IMAGEM' | 'AUDIO' | 'DOCUMENTO') => {
    setMediaType(newType)
    if (mediaFile) {
      const val = validateFileAndType(mediaFile, newType)
      setTypeValidationWarning(val.valid ? null : val.message || null)
    }
  }

  const handleUploadSubmit = async () => {
    if (!mediaFile || !selectedEventId || !currentChurch) {
      toast({
        title: 'Campos incompletos',
        description: 'Selecione o arquivo e o evento.',
        variant: 'destructive',
      })
      return
    }

    const validation = validateFileAndType(mediaFile, mediaType)
    if (!validation.valid) {
      toast({
        title: 'Incompatibilidade de formato',
        description: validation.message,
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('church_id', currentChurch.id)
      formData.append('event_id', selectedEventId)
      formData.append('name', mediaName || mediaFile.name)
      formData.append('file', mediaFile)
      formData.append('original_filename', mediaFile.name)
      formData.append('holyrics_filename', computedHolyricsFileName)
      formData.append('media_type', mediaType)
      formData.append('category', mediaCategory)
      formData.append('size', String(mediaFile.size))
      formData.append('status', 'ENVIADA')
      if (currentMember?.id) {
        formData.append('uploaded_by', currentMember.id)
      }
      if (assignedOperator) {
        formData.append('assigned_operator', assignedOperator)
      }

      await uploadMediaAsset(formData)
      toast({
        title: 'Mídia enviada com sucesso!',
        description: 'Arquivo associado ao culto e notificação disparada para o operador.',
      })
      setUploadModalOpen(false)
      setMediaFile(null)
      setMediaName('')
      setSelectedEventId('')
      setAssignedOperator('')
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro no envio',
        description: err.message || 'Falha ao processar arquivo.',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleDownload = (item: MediaAsset) => {
    const url = getMediaFileUrl(item)
    if (!url) return
    window.open(url, '_blank')
  }

  const handleDelete = (id: string) => {
    confirm({
      title: 'Excluir esta mídia?',
      description:
        'O arquivo é apagado do LouvorFlow. Cópias já transferidas para o computador do Holyrics continuam lá.',
      confirmLabel: 'Excluir mídia',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteMediaAsset(id)
          toast({ title: 'Mídia excluída' })
          loadData()
        } catch (err) {
          console.error(err)
        }
      },
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Início
        </Link>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
          Módulo Operacional • Mídias & Artes
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ImageIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Gestão de Mídias
            </h1>
            <p className="text-sm text-slate-500">
              Fluxo integrado de produção e exibição de vídeos, avisos e telões para{' '}
              <strong>{currentChurch?.name}</strong>.
            </p>
          </div>
        </div>

        <Button
          onClick={() => setUploadModalOpen(true)}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm gap-2"
        >
          <UploadCloud className="h-4 w-4" />
          Enviar Nova Mídia
        </Button>
      </div>

      {/* Lista de Mídias */}
      <Card className="rounded-2xl border-slate-200 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Todas as Mídias Cadastradas ({medias.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Vídeos enviados, downloads e status de importação no software de projeção
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-xs text-slate-400 py-8 text-center">Carregando mídias...</p>
          ) : medias.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <FileVideo className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm font-semibold text-slate-700">Nenhuma mídia encontrada</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Envie vídeos de avisos, aniversariantes ou apresentações especiais.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {medias.map((item) => {
                const eventInfo = item.expand?.event_id
                const operatorInfo = item.expand?.assigned_operator?.expand?.user_id
                const uploaderInfo = item.expand?.uploaded_by?.expand?.user_id

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {item.name}
                        </span>
                        {item.holyrics_filename && (
                          <span
                            className="text-xs text-slate-600 font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded truncate max-w-xs"
                            title={`Nome físico padronizado: ${item.holyrics_filename}`}
                          >
                            {item.holyrics_filename}
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {item.category}
                        </Badge>
                        {/* Estado real da mídia */}
                        <Badge
                          className={`text-[10px] ${
                            item.status === 'IMPORTADA_HOLYRICS'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : item.status === 'BAIXADA'
                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                : item.status === 'ENVIADA'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                        >
                          {item.status === 'IMPORTADA_HOLYRICS'
                            ? 'Reconhecida pelo Holyrics'
                            : item.status === 'BAIXADA'
                              ? 'Transferida para o computador'
                              : item.status === 'ENVIADA'
                                ? 'Cadastrada no SaaS (Aguardando transferência)'
                                : item.status}
                        </Badge>
                        {item.holyrics_status && (
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              item.holyrics_status.startsWith('ERRO_')
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : item.holyrics_status.startsWith('RECONHECIDO_')
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : item.holyrics_status.startsWith('GRAVADO_')
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}
                          >
                            Status Agent: {item.holyrics_status}
                          </Badge>
                        )}
                      </div>

                      {item.downloaded_at && (
                        <p className="text-[11px] text-slate-400 mb-1 flex items-center gap-1.5">
                          <FolderCheck className="h-3 w-3 text-slate-500" />
                          Última sincronização/download:{' '}
                          {new Date(item.downloaded_at).toLocaleString('pt-BR')}
                        </p>
                      )}

                      <p className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                        {eventInfo && (
                          <span className="font-semibold text-slate-700">
                            Culto: {eventInfo.title} ({eventInfo.date.slice(0, 10)})
                          </span>
                        )}
                        <span>Tipo: {item.media_type}</span>
                        <span>Enviado por: {uploaderInfo?.name || 'Equipe'}</span>
                        <span>Operador: {operatorInfo?.name || 'Não atribuído'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(item)}
                        className="text-xs rounded-xl gap-1.5"
                        title="Visualizar/baixar cópia do arquivo"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar Cópia
                      </Button>

                      {(isAdmin || isMaster) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item.id)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
                          title="Excluir mídia cadastrada"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Upload */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Enviar Arquivo de Mídia
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Associe a um culto para que o operador técnico receba o arquivo e a notificação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Arquivo</Label>
              <Input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    handleFileSelection(f)
                  }
                }}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Título / Descrição</Label>
              <Input
                value={mediaName}
                onChange={(e) => setMediaName(e.target.value)}
                placeholder="Ex: Vídeo de Aniversariantes do Mês"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Evento / Culto Alvo</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione o evento..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.title} ({ev.date.slice(0, 10)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Tipo</Label>
                <Select
                  value={mediaType}
                  onValueChange={(val) => handleMediaTypeChange(val as any)}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIDEO">VÍDEO (mp4, mov, avi...)</SelectItem>
                    <SelectItem value="IMAGEM">IMAGEM (jpg, png, gif...)</SelectItem>
                    <SelectItem value="AUDIO">ÁUDIO (mp3, wav, m4a...)</SelectItem>
                    <SelectItem value="DOCUMENTO">DOCUMENTO (pdf, pptx...)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Categoria</Label>
                <Select value={mediaCategory} onValueChange={(val) => setMediaCategory(val as any)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AVISOS">AVISOS</SelectItem>
                    <SelectItem value="ANIVERSARIANTES">ANIVERSARIANTES</SelectItem>
                    <SelectItem value="AGENDA">AGENDA</SelectItem>
                    <SelectItem value="CULTOS">CULTOS</SelectItem>
                    <SelectItem value="EVENTOS">EVENTOS</SelectItem>
                    <SelectItem value="VIDEO_ESPECIAL">VÍDEO ESPECIAL</SelectItem>
                    <SelectItem value="OUTROS">OUTROS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Operador Responsável pela Operação
              </Label>
              <Select value={assignedOperator} onValueChange={setAssignedOperator}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione quem irá exibir (Projeção)..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="">Sem operador definido</SelectItem>
                  {members.map((m) => {
                    const u = m.expand?.user_id
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {u?.name || 'Membro'}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Aviso de Incompatibilidade de Formato */}
            {typeValidationWarning && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2.5 text-red-800 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Incompatibilidade detectada:</strong>
                  <span>{typeValidationWarning}</span>
                </div>
              </div>
            )}

            {/* Preview do Nome Físico no Holyrics */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1">
              <span className="text-[11px] font-bold text-slate-700 block">
                Nome físico no Holyrics (gerado automaticamente):
              </span>
              <code className="text-xs text-emerald-700 bg-white px-2 py-1 rounded border border-slate-200 block truncate font-mono">
                {computedHolyricsFileName}
              </code>
              <span className="text-[10px] text-slate-400 block">
                Padrão: Evento - Categoria - DD-MM - Título.extensão
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUploadSubmit}
              disabled={
                !mediaFile || !selectedEventId || isUploading || Boolean(typeValidationWarning)
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isUploading ? 'Enviando...' : 'Cadastrar Mídia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}
