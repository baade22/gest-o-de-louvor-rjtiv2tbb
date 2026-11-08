import React, { useEffect, useState } from 'react'
import { Loader2, Music, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { parseYoutubeVideoId } from '@/lib/youtube'
import { requestYoutubeMedia } from '@/services/media'
import type { EventItem } from '@/types'

const CATEGORIES: Array<[string, string]> = [
  ['VIDEO_ESPECIAL', 'Vídeo especial'],
  ['AVISOS', 'Avisos'],
  ['ANIVERSARIANTES', 'Aniversariantes'],
  ['AGENDA', 'Agenda'],
  ['CULTOS', 'Cultos'],
  ['EVENTOS', 'Eventos'],
  ['OUTROS', 'Outros'],
]

/**
 * Baixar vídeo ou áudio do YouTube pelo link.
 * Quem baixa é o servidor; se ele falhar, o computador do Holyrics baixa quando estiver conectado.
 */
export function YoutubeMediaDialog({
  open,
  onOpenChange,
  churchId,
  events,
  fixedEvent,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  /** Lista de cultos para escolher (tela Mídia). */
  events?: EventItem[]
  /** Culto já definido (Central do Culto). */
  fixedEvent?: EventItem
  onCreated: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState<'VIDEO' | 'AUDIO'>('VIDEO')
  const [name, setName] = useState('')
  const [eventId, setEventId] = useState('')
  const [category, setCategory] = useState('VIDEO_ESPECIAL')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setUrl('')
    setName('')
    setFormat('VIDEO')
    setEventId(fixedEvent?.id || '')
  }, [open, fixedEvent?.id])

  const videoId = parseYoutubeVideoId(url)
  const showUrlError = url.trim().length > 0 && !videoId
  const targetEventId = fixedEvent?.id || eventId

  const submit = async () => {
    if (!videoId || !targetEventId) return
    setSaving(true)
    try {
      const res = await requestYoutubeMedia({
        churchId,
        eventId: targetEventId,
        url,
        format,
        category,
        name: name.trim(),
      })
      if (res.success) {
        toast({
          title: res.name ? `"${res.name}" vai ser baixado` : 'Download pedido',
          description: res.message,
        })
        onOpenChange(false)
      } else {
        toast({
          title: 'Não foi possível baixar',
          description: res.message,
          variant: 'destructive',
        })
      }
      await onCreated()
    } catch (err: any) {
      toast({
        title: 'Não foi possível baixar',
        description: err?.response?.message || err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Baixar do YouTube</DialogTitle>
          <DialogDescription className="text-xs">
            Cole o link do vídeo. O arquivo entra na mídia do culto e vai para o computador do
            Holyrics como as outras mídias.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="yt-url" className="text-xs font-semibold">
              Link do YouTube
            </Label>
            <Input
              id="yt-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              inputMode="url"
              autoComplete="off"
              className="rounded-xl"
            />
            {showUrlError && (
              <p className="text-xs text-red-600">
                Esse link não é de um vídeo do YouTube (playlist e canal não servem).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Baixar como</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['VIDEO', 'Vídeo (MP4)', Video],
                  ['AUDIO', 'Só o áudio (MP3)', Music],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  aria-pressed={format === value}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    format === value
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="yt-name" className="text-xs font-semibold">
              Título (opcional)
            </Label>
            <Input
              id="yt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Em branco usa o título do YouTube"
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!fixedEvent && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Culto</Label>
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Escolha o culto" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {(events || []).map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {ev.title} ({ev.date.slice(8, 10)}/{ev.date.slice(5, 7)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Baixe só vídeos que a igreja tem direito de exibir. Se o servidor não conseguir, o
            computador do Holyrics baixa assim que estiver conectado.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={!videoId || !targetEventId || saving}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
