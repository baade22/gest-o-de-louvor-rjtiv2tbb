import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { MOMENT_KIND_LABELS } from '@/lib/runSheet'
import type { EventItem, EventMoment, EventMomentKind, EventSong, MediaAsset } from '@/types'

interface MomentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: EventItem
  /** null = novo momento */
  moment: EventMoment | null
  nextOrder: number
  suggestedStart?: string
  songs: EventSong[]
  medias: MediaAsset[]
  onSaved: () => void
}

export function MomentDialog({
  open,
  onOpenChange,
  event,
  moment,
  nextOrder,
  suggestedStart,
  songs,
  medias,
  onSaved,
}: MomentDialogProps) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventMomentKind>('LOUVOR')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState('')
  const [responsible, setResponsible] = useState('')
  const [notes, setNotes] = useState('')
  const [songIds, setSongIds] = useState<string[]>([])
  const [mediaIds, setMediaIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(moment?.title || '')
    setKind(moment?.kind || 'LOUVOR')
    setStartTime(moment?.start_time || suggestedStart || '')
    setDuration(moment?.duration_min ? String(moment.duration_min) : '')
    setResponsible(moment?.responsible || '')
    setNotes(moment?.notes || '')
    setSongIds(moment ? songs.filter((s) => s.moment_id === moment.id).map((s) => s.id) : [])
    setMediaIds(moment ? medias.filter((m) => m.moment_id === moment.id).map((m) => m.id) : [])
  }, [open, moment])

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const payload = {
        church_id: event.church_id,
        event_id: event.id,
        title: title.trim(),
        kind,
        start_time: startTime,
        duration_min: duration ? Number(duration) : null,
        responsible: responsible.trim(),
        notes: notes.trim(),
      }
      const saved = moment
        ? await pb.collection('event_moments').update<EventMoment>(moment.id, payload)
        : await pb.collection('event_moments').create<EventMoment>({ ...payload, order: nextOrder })

      // Liga/desliga músicas e mídias deste momento (só o que mudou)
      const updates: Promise<unknown>[] = []
      for (const s of songs) {
        const want = songIds.includes(s.id)
        if (want && s.moment_id !== saved.id) {
          updates.push(pb.collection('event_songs').update(s.id, { moment_id: saved.id }))
        } else if (!want && s.moment_id === saved.id) {
          updates.push(pb.collection('event_songs').update(s.id, { moment_id: '' }))
        }
      }
      for (const m of medias) {
        const want = mediaIds.includes(m.id)
        if (want && m.moment_id !== saved.id) {
          updates.push(pb.collection('media_assets').update(m.id, { moment_id: saved.id }))
        } else if (!want && m.moment_id === saved.id) {
          updates.push(pb.collection('media_assets').update(m.id, { moment_id: '' }))
        }
      }
      await Promise.all(updates)

      toast({ title: moment ? 'Momento atualizado' : 'Momento adicionado ao roteiro' })
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Não foi possível salvar o momento',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{moment ? 'Editar momento' : 'Novo momento do culto'}</DialogTitle>
          <DialogDescription>
            O roteiro é a ordem que todas as equipes seguem durante o culto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
            <div className="space-y-1.5">
              <Label htmlFor="moment-title">Nome</Label>
              <Input
                id="moment-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Louvor, Avisos, Santa Ceia"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as EventMomentKind)
                  if (!title.trim()) setTitle(MOMENT_KIND_LABELS[v as EventMomentKind])
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MOMENT_KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="moment-start">Começa às</Label>
              <Input
                id="moment-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="moment-duration">Duração (min)</Label>
              <Input
                id="moment-duration"
                type="number"
                min={0}
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="moment-resp">Responsável</Label>
              <Input
                id="moment-resp"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder="Ex: Pr. Marcos"
              />
            </div>
          </div>

          {(songs.length > 0 || medias.length > 0) && (
            <div className="space-y-2">
              <Label>O que entra neste momento</Label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {songs.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={songIds.includes(s.id)}
                      onCheckedChange={() => setSongIds(toggle(songIds, s.id))}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {s.expand?.song_id?.title || 'Música'}
                    </span>
                    <span className="text-xs text-slate-400">Música</span>
                  </label>
                ))}
                {medias.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={mediaIds.includes(m.id)}
                      onCheckedChange={() => setMediaIds(toggle(mediaIds, m.id))}
                    />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="text-xs text-slate-400">Mídia</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="moment-notes">Observações</Label>
            <Textarea
              id="moment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: luz baixa, só teclado no fundo"
              className="min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="bg-teal-700 text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {moment ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
