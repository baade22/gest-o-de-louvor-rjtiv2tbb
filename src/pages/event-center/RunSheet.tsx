import React, { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  ListOrdered,
  Loader2,
  Music2,
  Pencil,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { buildDefaultRunSheet, formatTime, parseTime, resolveMomentTimes } from '@/lib/runSheet'
import type { EventItem, EventMoment, EventMomentKind, EventSong, MediaAsset } from '@/types'
import { MomentDialog } from './MomentDialog'
import {
  Chip,
  EmptyState,
  MEDIA_STATUS,
  MEDIA_TYPE_LABELS,
  SectionCard,
  songSyncStatus,
} from './shared'

const KIND_DOT: Record<EventMomentKind, string> = {
  ABERTURA: 'bg-violet-500',
  LOUVOR: 'bg-teal-600',
  AVISOS: 'bg-amber-500',
  OFERTA: 'bg-amber-500',
  PALAVRA: 'bg-sky-600',
  MINISTRACAO: 'bg-teal-600',
  ENCERRAMENTO: 'bg-slate-500',
  OUTRO: 'bg-slate-400',
}

interface RunSheetProps {
  event: EventItem
  moments: EventMoment[]
  songs: EventSong[]
  medias: MediaAsset[]
  available: boolean
  canEdit: boolean
  onChanged: () => void
}

export function RunSheet({
  event,
  moments,
  songs,
  medias,
  available,
  canEdit,
  onChanged,
}: RunSheetProps) {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EventMoment | null>(null)
  const [toDelete, setToDelete] = useState<EventMoment | null>(null)
  const [creatingDefault, setCreatingDefault] = useState(false)

  const times = resolveMomentTimes(moments, event.start_time)
  const momentIds = new Set(moments.map((m) => m.id))
  const looseSongs = songs.filter((s) => !s.moment_id || !momentIds.has(s.moment_id))
  const looseMedias = medias.filter((m) => !m.moment_id || !momentIds.has(m.moment_id))

  const nextStart = (() => {
    const last = moments.length - 1
    if (last < 0) return event.start_time || ''
    const start = parseTime(times[last] || undefined)
    return start === null ? '' : formatTime(start + (moments[last].duration_min || 0))
  })()

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const createDefault = async () => {
    setCreatingDefault(true)
    try {
      const created: EventMoment[] = []
      for (const draft of buildDefaultRunSheet(event.start_time)) {
        created.push(
          await pb.collection('event_moments').create<EventMoment>({
            church_id: event.church_id,
            event_id: event.id,
            ...draft,
          }),
        )
      }
      // Todas as músicas entram no Louvor; o líder ajusta depois
      const louvor = created.find((m) => m.kind === 'LOUVOR')
      if (louvor) {
        await Promise.all(
          songs.map((s) => pb.collection('event_songs').update(s.id, { moment_id: louvor.id })),
        )
      }
      toast({
        title: 'Roteiro criado',
        description: 'Ajuste os horários e o que entra em cada momento.',
      })
      onChanged()
    } catch (err: any) {
      toast({
        title: 'Não foi possível criar o roteiro',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setCreatingDefault(false)
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= moments.length) return
    try {
      await Promise.all([
        pb.collection('event_moments').update(moments[index].id, { order: target + 1 }),
        pb.collection('event_moments').update(moments[target].id, { order: index + 1 }),
        // Normaliza a ordem dos demais para evitar empates antigos
        ...moments
          .map((m, i) => ({ m, i }))
          .filter(({ i, m }) => i !== index && i !== target && m.order !== i + 1)
          .map(({ m, i }) => pb.collection('event_moments').update(m.id, { order: i + 1 })),
      ])
      onChanged()
    } catch (err: any) {
      toast({
        title: 'Não foi possível reordenar',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  const remove = async (moment: EventMoment) => {
    await Promise.all([
      ...songs
        .filter((s) => s.moment_id === moment.id)
        .map((s) => pb.collection('event_songs').update(s.id, { moment_id: '' })),
      ...medias
        .filter((m) => m.moment_id === moment.id)
        .map((m) => pb.collection('media_assets').update(m.id, { moment_id: '' })),
    ])
    await pb.collection('event_moments').delete(moment.id)
    toast({ title: 'Momento removido do roteiro' })
    onChanged()
  }

  return (
    <SectionCard
      title="Roteiro do culto"
      subtitle="A ordem que todas as equipes seguem"
      actions={
        canEdit &&
        available &&
        moments.length > 0 && (
          <Button size="sm" variant="outline" onClick={openNew} className="h-8 gap-1.5 rounded-lg">
            <Plus className="h-3.5 w-3.5" />
            Adicionar momento
          </Button>
        )
      }
    >
      {!available ? (
        <EmptyState
          icon={ListOrdered}
          title="Roteiro ainda não disponível"
          description="O servidor precisa ser atualizado para guardar o roteiro do culto."
        />
      ) : moments.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="Este culto ainda não tem roteiro"
          description="Monte a ordem do culto para que louvor, som, projeção e mídia sigam o mesmo plano."
          action={
            canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={createDefault}
                  disabled={creatingDefault}
                  className="gap-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800"
                >
                  {creatingDefault ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Usar roteiro padrão
                </Button>
                <Button variant="outline" onClick={openNew} className="gap-1.5 rounded-lg">
                  <Plus className="h-4 w-4" />
                  Montar do zero
                </Button>
              </div>
            )
          }
        />
      ) : (
        <ol className="px-5 py-4">
          {moments.map((moment, index) => {
            const momentSongs = songs.filter((s) => s.moment_id === moment.id)
            const momentMedias = medias.filter((m) => m.moment_id === moment.id)
            const meta = [
              moment.duration_min ? `${moment.duration_min} min` : null,
              momentSongs.length
                ? `${momentSongs.length} ${momentSongs.length === 1 ? 'música' : 'músicas'}`
                : null,
              moment.responsible || null,
            ].filter(Boolean)
            const isLast =
              index === moments.length - 1 && looseSongs.length + looseMedias.length === 0
            return (
              <li
                key={moment.id}
                className="group grid grid-cols-[44px_20px_minmax(0,1fr)] gap-x-2"
              >
                <div className="pt-0.5 text-right text-xs font-semibold tabular-nums text-slate-500">
                  {times[index] || '--:--'}
                </div>
                <div className="relative flex justify-center">
                  <span
                    className={cn(
                      'relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white',
                      KIND_DOT[moment.kind],
                    )}
                  />
                  {!isLast && <span className="absolute bottom-0 top-3 w-px bg-slate-200" />}
                </div>
                <div className="min-w-0 pb-5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-900">{moment.title}</span>
                      {meta.length > 0 && (
                        <span className="ml-2 text-xs text-slate-500">{meta.join(' · ')}</span>
                      )}
                      {moment.notes && (
                        <p className="mt-0.5 text-xs text-slate-500">{moment.notes}</p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <IconAction
                          label="Subir"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label="Descer"
                          disabled={index === moments.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label="Editar momento"
                          onClick={() => {
                            setEditing(moment)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label="Remover momento"
                          danger
                          onClick={() => setToDelete(moment)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconAction>
                      </div>
                    )}
                  </div>
                  <MomentItems songs={momentSongs} medias={momentMedias} />
                </div>
              </li>
            )
          })}

          {looseSongs.length + looseMedias.length > 0 && (
            <li className="grid grid-cols-[44px_20px_minmax(0,1fr)] gap-x-2">
              <div />
              <div className="flex justify-center">
                <span className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-dashed border-slate-300" />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-slate-500">Ainda sem momento</span>
                <MomentItems songs={looseSongs} medias={looseMedias} muted />
              </div>
            </li>
          )}
        </ol>
      )}

      <MomentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={event}
        moment={editing}
        nextOrder={moments.length + 1}
        suggestedStart={nextStart}
        songs={songs}
        medias={medias}
        onSaved={onChanged}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Remover "${toDelete?.title}" do roteiro?`}
        description="As músicas e mídias deste momento continuam no culto, só ficam sem momento."
        confirmLabel="Remover"
        destructive
        onConfirm={() => toDelete && remove(toDelete)}
      />
    </SectionCard>
  )
}

function IconAction({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 disabled:opacity-30',
        danger ? 'hover:text-red-600' : 'hover:text-slate-700',
      )}
    >
      {children}
    </button>
  )
}

function MomentItems({
  songs,
  medias,
  muted,
}: {
  songs: EventSong[]
  medias: MediaAsset[]
  muted?: boolean
}) {
  if (songs.length + medias.length === 0) return null
  return (
    <div className={cn('mt-2 space-y-1.5', muted && 'opacity-80')}>
      {songs.map((s) => {
        const song = s.expand?.song_id
        const original = song?.key
        const key = s.custom_key || original
        const sync = songSyncStatus(s.holyrics_status)
        return (
          <div
            key={s.id}
            className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
              <Music2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">
                {song?.title || 'Música'}
              </div>
              <div className="truncate text-xs text-slate-500">
                {[song?.artist, song?.bpm ? `${song.bpm} BPM` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            {key && (
              <span className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700">
                {original && original !== key ? `${original} → ${key}` : key}
              </span>
            )}
            <Chip tone={sync.tone} className="hidden sm:inline-flex">
              {sync.label}
            </Chip>
          </div>
        )
      })}
      {medias.map((m) => {
        const status = MEDIA_STATUS[m.status] || MEDIA_STATUS.ENVIADA
        return (
          <div
            key={m.id}
            className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-700">
              <Clapperboard className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{m.name}</div>
              <div className="text-xs text-slate-500">
                {MEDIA_TYPE_LABELS[m.media_type] || m.media_type}
              </div>
            </div>
            <Chip tone={status.tone} className="hidden sm:inline-flex">
              {status.label}
            </Chip>
          </div>
        )
      })}
    </div>
  )
}
