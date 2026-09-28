import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Image as ImageIcon,
  ArrowLeft,
  UploadCloud,
  Download,
  Check,
  CalendarDays,
  FileVideo,
  Trash2,
  ExternalLink,
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
import type { MediaAsset, EventItem, ChurchMember } from '@/types'
import {
  listAllChurchMedia,
  uploadMediaAsset,
  updateMediaStatus,
  getMediaFileUrl,
  deleteMediaAsset,
} from '@/services/media'

export default function MediaModule() {
  const { currentChurch, currentMember, isAdmin, isMaster } = useAuth()
  const { toast } = useToast()

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
  const [mediaCategory, setMediaCategory] = useState<
    'AGENDA' | 'ANIVERSARIANTES' | 'AVISOS' | 'CULTOS' | 'EVENTOS' | 'VIDEO_ESPECIAL' | 'OUTROS'
  >('AVISOS')
  const [assignedOperator, setAssignedOperator] = useState('')
  const [isUploading, setIsUploading] = useState(false)

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

  const handleUploadSubmit = async () => {
    if (!mediaFile || !selectedEventId || !currentChurch) {
      toast({
        title: 'Campos incompletos',
        description: 'Selecione o arquivo e o evento.',
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
    toast({
      title: 'Download iniciado',
      description: 'Após conferir o arquivo, clique em [Marcar como baixada].',
    })
  }

  const handleMarkDownloaded = async (id: string) => {
    try {
      await updateMediaStatus(id, 'BAIXADA')
      toast({ title: 'Mídia marcada como BAIXADA!' })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleMarkImported = async (id: string) => {
    try {
      await updateMediaStatus(id, 'IMPORTADA_HOLYRICS', 'IMPORTADO_MANUALMENTE')
      toast({
        title: 'Mídia confirmada como importada no Holyrics!',
      })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta mídia?')) return
    try {
      await deleteMediaAsset(id)
      toast({ title: 'Mídia excluída' })
      loadData()
    } catch (err) {
      console.error(err)
    }
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
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {item.category}
                        </Badge>
                        <Badge
                          className={`text-[10px] ${
                            item.status === 'IMPORTADA_HOLYRICS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'BAIXADA'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.status}
                        </Badge>
                        {item.holyrics_status && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-purple-50 text-purple-700 border-purple-200"
                          >
                            Holyrics: {item.holyrics_status}
                          </Badge>
                        )}
                      </div>

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

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(item)}
                        className="text-xs rounded-xl gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar Mídia
                      </Button>

                      {item.status === 'ENVIADA' || item.status === 'RECEBIDA' ? (
                        <Button
                          size="sm"
                          onClick={() => handleMarkDownloaded(item.id)}
                          className="text-xs rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Marcar como Baixada
                        </Button>
                      ) : null}

                      {item.status === 'BAIXADA' ? (
                        <Button
                          size="sm"
                          onClick={() => handleMarkImported(item.id)}
                          className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Importado no Holyrics
                        </Button>
                      ) : null}

                      {(isAdmin || isMaster) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item.id)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
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
                    setMediaFile(f)
                    if (!mediaName) setMediaName(f.name)
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
                <Select value={mediaType} onValueChange={(val) => setMediaType(val as any)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIDEO">VÍDEO</SelectItem>
                    <SelectItem value="IMAGEM">IMAGEM</SelectItem>
                    <SelectItem value="AUDIO">ÁUDIO</SelectItem>
                    <SelectItem value="DOCUMENTO">DOCUMENTO</SelectItem>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUploadSubmit}
              disabled={!mediaFile || !selectedEventId || isUploading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isUploading ? 'Enviando...' : 'Enviar Mídia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
