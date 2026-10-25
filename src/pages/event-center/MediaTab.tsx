import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileVideo,
  Loader2,
  MoreHorizontal,
  Radio,
  Send,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { generateHolyricsFileName } from '@/lib/mediaNaming'
import {
  deleteMediaAsset,
  getMediaFileUrl,
  syncEventMediaPlaylistWithHolyrics,
  transferMediaToHolyricsAgent,
  updateMediaOrder,
  uploadMediaAsset,
} from '@/services/media'
import { MEDIA_READY_STATUSES } from '@/lib/eventReadiness'
import type { ChurchMember, EventItem, MediaAsset } from '@/types'
import type { EventCenter } from './useEventCenter'
import {
  Chip,
  EmptyState,
  MEDIA_CATEGORY_LABELS,
  MEDIA_STATUS,
  MEDIA_TYPE_LABELS,
  SectionCard,
  churchMemberName,
} from './shared'

type MediaType = 'VIDEO' | 'IMAGEM' | 'AUDIO' | 'DOCUMENTO'
type MediaCategory =
  | 'AGENDA'
  | 'ANIVERSARIANTES'
  | 'AVISOS'
  | 'CULTOS'
  | 'EVENTOS'
  | 'VIDEO_ESPECIAL'
  | 'OUTROS'

const ALLOWED_EXTENSIONS: Record<MediaType, string[]> = {
  IMAGEM: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
  VIDEO: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'],
  AUDIO: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'flac'],
  DOCUMENTO: ['pdf', 'pptx', 'ppt', 'ppsx', 'pps'],
}

interface MediaTabProps {
  event: EventItem
  medias: MediaAsset[]
  churchMembers: ChurchMember[]
  currentMemberId?: string
  /** Incluir, ordenar e excluir mídia (gestor ou função MÍDIA). */
  canManage: boolean
  /** Enviar ao computador e montar a playlist no Holyrics (gestor, MÍDIA ou Projeção). */
  canOperate: boolean
  patch: EventCenter['patch']
  reload: () => Promise<void>
}

export function MediaTab({
  event,
  medias,
  churchMembers,
  currentMemberId,
  canManage,
  canOperate,
  patch,
  reload,
}: MediaTabProps) {
  const { toast } = useToast()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [transferring, setTransferring] = useState<Record<string, boolean>>({})
  const [isSyncing, setIsSyncing] = useState(false)
  const [toDelete, setToDelete] = useState<MediaAsset | null>(null)

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= medias.length) return
    const next = [...medias]
    ;[next[index], next[target]] = [next[target], next[index]]
    patch(() => ({ medias: next }))
    try {
      await Promise.all(
        next.map((m, i) => (m.presentation_order === i + 1 ? null : updateMediaOrder(m.id, i + 1))),
      )
    } catch (err) {
      console.error('Erro ao salvar ordem das mídias:', err)
      reload()
    }
  }

  const transfer = async (media: MediaAsset) => {
    setTransferring((prev) => ({ ...prev, [media.id]: true }))
    try {
      const res = await transferMediaToHolyricsAgent({
        mediaId: media.id,
        churchId: event.church_id,
      })
      if (res.success) {
        toast({
          title: res.agent_online ? 'Transferência iniciada' : 'Transferência agendada',
          description: res.message,
        })
        reload()
      } else {
        toast({
          title: 'Não foi possível transferir',
          description: res.message || 'Verifique se o LouvorFlow Agent está pareado.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({ title: 'Erro no envio da mídia', description: err?.message, variant: 'destructive' })
    } finally {
      setTransferring((prev) => ({ ...prev, [media.id]: false }))
    }
  }

  const syncPlaylist = async () => {
    const ready = medias.filter((m) => m.status === 'BAIXADA' || m.status === 'IMPORTADA_HOLYRICS')
    if (ready.length === 0) {
      toast({
        title: 'Nenhuma mídia no computador ainda',
        description: 'Use "Enviar ao computador" nas mídias antes de montar a playlist.',
        variant: 'destructive',
      })
      return
    }
    setIsSyncing(true)
    try {
      const res = await syncEventMediaPlaylistWithHolyrics(event.id, event.church_id)
      toast({
        title: res.success ? 'Playlist de mídias enviada' : 'Falha na sincronização de mídias',
        description: res.success && res.warning ? `${res.message} (${res.warning})` : res.message,
        variant: res.success ? 'default' : 'destructive',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao sincronizar a playlist',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const remove = async (media: MediaAsset) => {
    await deleteMediaAsset(media.id)
    toast({ title: `"${media.name}" excluída` })
    await reload()
  }

  const download = (media: MediaAsset) => {
    const url = getMediaFileUrl(media)
    if (url) window.open(url, '_blank')
  }

  const readyCount = medias.filter((m) => MEDIA_READY_STATUSES.includes(m.status)).length

  return (
    <SectionCard
      title="Mídias do culto"
      subtitle={
        medias.length ? `${readyCount} de ${medias.length} no computador da projeção` : undefined
      }
      actions={
        <>
          {canOperate && medias.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={syncPlaylist}
              disabled={isSyncing}
              className="h-8 gap-1.5 rounded-lg"
            >
              {isSyncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Radio className="h-3.5 w-3.5" />
              )}
              Montar playlist no Holyrics
            </Button>
          )}
          {canManage && (
            <Button
              size="sm"
              onClick={() => setUploadOpen(true)}
              className="h-8 gap-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Enviar mídia
            </Button>
          )}
        </>
      }
    >
      {medias.length === 0 ? (
        <EmptyState
          icon={FileVideo}
          title="Nenhuma mídia neste culto"
          description="Vídeos de avisos, aniversariantes e artes que vão passar no telão."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {medias.map((media, index) => {
            const status = MEDIA_STATUS[media.status] || MEDIA_STATUS.ENVIADA
            const operator = media.expand?.assigned_operator?.expand?.user_id?.name
            const isReady = media.status === 'BAIXADA' || media.status === 'IMPORTADA_HOLYRICS'
            return (
              <li key={media.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {canManage && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Subir na playlist"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descer na playlist"
                      disabled={index === medias.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900">{media.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {[
                      MEDIA_TYPE_LABELS[media.media_type] || media.media_type,
                      MEDIA_CATEGORY_LABELS[media.category] || media.category,
                      operator ? `Operador: ${operator}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {media.holyrics_filename && (
                    <div
                      className="truncate font-mono text-[11px] text-slate-400"
                      title={media.holyrics_filename}
                    >
                      {media.holyrics_filename}
                    </div>
                  )}
                </div>
                <Chip tone={status.tone} title={media.holyrics_status || undefined}>
                  {status.label}
                </Chip>
                {canOperate && (
                  <Button
                    size="sm"
                    variant={isReady ? 'outline' : 'default'}
                    disabled={transferring[media.id]}
                    onClick={() => transfer(media)}
                    className={
                      isReady
                        ? 'h-8 gap-1.5 rounded-lg text-xs'
                        : 'h-8 gap-1.5 rounded-lg bg-teal-700 text-xs text-white hover:bg-teal-800'
                    }
                    title="Transfere para o computador do Holyrics pelo LouvorFlow Agent"
                  >
                    {transferring[media.id] ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {isReady ? 'Reenviar' : 'Enviar ao computador'}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-slate-500"
                      aria-label="Ações da mídia"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => download(media)} className="gap-2">
                      <Download className="h-4 w-4 text-slate-500" />
                      Baixar cópia
                    </DropdownMenuItem>
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setToDelete(media)}
                          className="gap-2 text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir mídia
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      )}

      <UploadMediaDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        event={event}
        nextOrder={medias.length + 1}
        churchMembers={churchMembers}
        currentMemberId={currentMemberId}
        onSaved={reload}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Excluir "${toDelete?.name}"?`}
        description="O arquivo sai deste culto. Se já foi enviado ao computador da projeção, a cópia de lá continua."
        confirmLabel="Excluir"
        destructive
        onConfirm={() => toDelete && remove(toDelete)}
      />
    </SectionCard>
  )
}

const NO_OPERATOR = '__none__'

function UploadMediaDialog({
  open,
  onOpenChange,
  event,
  nextOrder,
  churchMembers,
  currentMemberId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: EventItem
  nextOrder: number
  churchMembers: ChurchMember[]
  currentMemberId?: string
  onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [mediaType, setMediaType] = useState<MediaType>('VIDEO')
  const [category, setCategory] = useState<MediaCategory>('AVISOS')
  const [operator, setOperator] = useState(NO_OPERATOR)
  const [uploading, setUploading] = useState(false)

  React.useEffect(() => {
    if (!open) return
    setFile(null)
    setName('')
    setOperator(NO_OPERATOR)
  }, [open])

  const save = async () => {
    if (!file) return
    const ext = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() || ''
    const allowed = ALLOWED_EXTENSIONS[mediaType]
    if (ext && !allowed.includes(ext)) {
      toast({
        title: 'Tipo de arquivo não combina',
        description: `.${ext} não é ${MEDIA_TYPE_LABELS[mediaType].toLowerCase()}. Aceitos: ${allowed.join(', ')}.`,
        variant: 'destructive',
      })
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('church_id', event.church_id)
      formData.append('event_id', event.id)
      formData.append('name', name || file.name)
      formData.append('file', file)
      formData.append('original_filename', file.name)
      formData.append(
        'holyrics_filename',
        generateHolyricsFileName({
          eventName: event.title,
          category,
          eventDate: event.date,
          title: name || file.name,
          originalFileName: file.name,
        }),
      )
      formData.append('presentation_order', String(nextOrder))
      formData.append('media_type', mediaType)
      formData.append('category', category)
      formData.append('size', String(file.size))
      formData.append('status', 'ENVIADA')
      if (currentMemberId) formData.append('uploaded_by', currentMemberId)
      if (operator !== NO_OPERATOR) formData.append('assigned_operator', operator)

      await uploadMediaAsset(formData)
      toast({
        title: 'Mídia enviada',
        description: 'A projeção já pode transferi-la para o computador do Holyrics.',
      })
      onOpenChange(false)
      await onSaved()
    } catch (err: any) {
      toast({ title: 'Erro no envio', description: err?.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !uploading && onOpenChange(next)}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar mídia para o culto</DialogTitle>
          <DialogDescription>O operador escolhido recebe um aviso no app.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="media-file">Arquivo</Label>
            <Input
              id="media-file"
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setFile(f)
                  if (!name) setName(f.name)
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media-name">Nome</Label>
            <Input
              id="media-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Aniversariantes da semana"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as MediaCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MEDIA_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Operador responsável</Label>
            <Select value={operator} onValueChange={setOperator}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={NO_OPERATOR}>Ninguém por enquanto</SelectItem>
                {churchMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {churchMemberName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-600">Nome do arquivo no Holyrics</div>
            <code className="mt-1 block truncate font-mono text-xs text-teal-800">
              {generateHolyricsFileName({
                eventName: event.title,
                category,
                eventDate: event.date,
                title: name || file?.name || '',
                originalFileName: file?.name || '',
              })}
            </code>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={!file || uploading}
            className="bg-teal-700 text-white hover:bg-teal-800"
          >
            {uploading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {uploading ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
