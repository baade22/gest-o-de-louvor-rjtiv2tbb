import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast as notify } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  FileMusic,
  GripVertical,
  Minus,
  MoreHorizontal,
  Music2,
  Plus,
  Trash2,
  Youtube,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { transposeChordToken } from '@/lib/transposition'
import type { ChurchMember, EventItem, EventMember, EventMoment, EventSong, Song } from '@/types'
import type { EventCenter } from './useEventCenter'
import { AddSongPanel } from './AddSongPanel'
import {
  Avatar,
  Chip,
  EmptyState,
  SectionCard,
  churchMemberName,
  memberArea,
  songSyncStatus,
} from './shared'

const NO_VOCAL = '__none__'

interface RepertoireTabProps {
  event: EventItem
  songs: EventSong[]
  library: Song[]
  members: EventMember[]
  churchMembers: ChurchMember[]
  moments: EventMoment[]
  canEdit: boolean
  patch: EventCenter['patch']
  reload: () => Promise<void>
}

export function RepertoireTab({
  event,
  songs,
  library,
  members,
  churchMembers,
  moments,
  canEdit,
  patch,
  reload,
}: RepertoireTabProps) {
  const { toast } = useToast()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  // Quem canta: primeiro quem está escalado no louvor deste culto, depois o resto da igreja
  const vocalOptions = useMemo(() => {
    const scaledIds = new Set(
      members.filter((m) => memberArea(m) === 'LOUVOR').map((m) => m.member_id),
    )
    const byName = (a: ChurchMember, b: ChurchMember) =>
      churchMemberName(a).localeCompare(churchMemberName(b))
    return {
      scaled: churchMembers.filter((m) => scaledIds.has(m.id)).sort(byName),
      others: churchMembers.filter((m) => !scaledIds.has(m.id)).sort(byName),
    }
  }, [members, churchMembers])

  const fail = (title: string, err: unknown) => {
    console.error(err)
    toast({ title, description: (err as any)?.message, variant: 'destructive' })
    reload()
  }

  const updateSong = (id: string, data: Partial<EventSong>) =>
    patch((prev) => ({ songs: prev.songs.map((s) => (s.id === id ? { ...s, ...data } : s)) }))

  const persistOrder = async (ordered: EventSong[]) => {
    patch(() => ({ songs: ordered.map((s, i) => ({ ...s, order: i + 1 })) }))
    try {
      await Promise.all(
        ordered
          .map((s, i) => ({ s, order: i + 1 }))
          .filter(({ s, order }) => s.order !== order)
          .map(({ s, order }) => pb.collection('event_songs').update(s.id, { order })),
      )
    } catch (err) {
      fail('Não foi possível salvar a nova ordem', err)
    }
  }

  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= songs.length) return
    const next = [...songs]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    persistOrder(next)
  }

  const changeKey = async (item: EventSong, delta: number) => {
    const song = item.expand?.song_id
    const current = item.custom_key || song?.key
    if (!current) return
    const next = transposeChordToken(current, delta)
    updateSong(item.id, { custom_key: next })
    try {
      await pb.collection('event_songs').update(item.id, { custom_key: next })
      notify(`Tom de "${song?.title}" alterado para ${next} neste culto`, {
        id: `key-${item.id}`,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            updateSong(item.id, { custom_key: current })
            try {
              await pb.collection('event_songs').update(item.id, { custom_key: current })
            } catch (err) {
              fail('Não foi possível desfazer', err)
            }
          },
        },
      })
    } catch (err) {
      fail('Não foi possível trocar o tom', err)
    }
  }

  const changeVocal = async (item: EventSong, memberId: string) => {
    const value = memberId === NO_VOCAL ? '' : memberId
    const member = churchMembers.find((m) => m.id === value)
    patch((prev) => ({
      songs: prev.songs.map((s) =>
        s.id === item.id
          ? { ...s, lead_vocal: value, expand: { ...s.expand, lead_vocal: member as any } }
          : s,
      ),
    }))
    try {
      await pb.collection('event_songs').update(item.id, { lead_vocal: value })
    } catch (err) {
      fail('Não foi possível salvar a voz principal', err)
    }
  }

  const removeSong = async (item: EventSong) => {
    const title = item.expand?.song_id?.title || 'Música'
    patch((prev) => ({ songs: prev.songs.filter((s) => s.id !== item.id) }))
    try {
      await pb.collection('event_songs').delete(item.id)
      notify(`"${title}" removida do culto`, {
        action: {
          label: 'Desfazer',
          onClick: async () => {
            try {
              await pb.collection('event_songs').create({
                church_id: item.church_id,
                event_id: item.event_id,
                song_id: item.song_id,
                order: item.order,
                custom_key: item.custom_key || null,
                notes: item.notes || null,
                lead_vocal: item.lead_vocal || '',
                moment_id: item.moment_id || '',
              })
              reload()
            } catch (err) {
              fail('Não foi possível desfazer', err)
            }
          },
        },
      })
    } catch (err) {
      fail('Não foi possível remover a música', err)
    }
  }

  const addSong = async (song: Song) => {
    try {
      const louvor = moments.find((m) => m.kind === 'LOUVOR')
      await pb.collection('event_songs').create({
        church_id: event.church_id,
        event_id: event.id,
        song_id: song.id,
        order: songs.length ? Math.max(...songs.map((s) => s.order || 0)) + 1 : 1,
        custom_key: song.key,
        ...(louvor ? { moment_id: louvor.id } : {}),
      })
      notify(`"${song.title}" adicionada ao repertório`)
      await reload()
    } catch (err) {
      fail('Não foi possível adicionar a música', err)
    }
  }

  const renderParts = (item: EventSong, index: number) => {
    const song = item.expand?.song_id
    const original = song?.key
    const key = item.custom_key || original
    const sync = songSyncStatus(item.holyrics_status, item.holyrics_playlist_order)
    const vocal = item.expand?.lead_vocal
    const meta = [song?.artist, song?.bpm ? `${song.bpm} BPM` : null].filter(Boolean).join(' · ')
    const keyEl = key ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 py-0.5 pl-2 pr-0.5">
        {original && original !== key && (
          <span className="text-xs font-semibold text-slate-400">{original} →</span>
        )}
        <span className="font-mono text-sm font-bold text-slate-900">{key}</span>
        {canEdit && (
          <>
            <KeyStep label="Descer meio tom" onClick={() => changeKey(item, -1)}>
              <Minus className="h-3 w-3" />
            </KeyStep>
            <KeyStep label="Subir meio tom" onClick={() => changeKey(item, 1)}>
              <Plus className="h-3 w-3" />
            </KeyStep>
          </>
        )}
      </span>
    ) : (
      <span className="text-xs text-slate-400">—</span>
    )
    const vocalEl = canEdit ? (
      <Select value={item.lead_vocal || NO_VOCAL} onValueChange={(v) => changeVocal(item, v)}>
        <SelectTrigger
          className="h-8 w-[150px] rounded-lg border-transparent px-2 hover:border-slate-200 focus:ring-1"
          aria-label="Voz principal"
        >
          <VocalLabel member={vocal} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={NO_VOCAL}>Sem definir</SelectItem>
          {vocalOptions.scaled.length > 0 && (
            <SelectGroup>
              <SelectLabel>No louvor deste culto</SelectLabel>
              {vocalOptions.scaled.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {churchMemberName(m)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>Outros membros</SelectLabel>
            {vocalOptions.others.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {churchMemberName(m)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    ) : (
      <VocalLabel member={vocal} />
    )
    const syncEl = (
      <Chip tone={sync.tone} title={item.holyrics_error || undefined}>
        {sync.label}
      </Chip>
    )
    const menuEl = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-slate-500"
            aria-label="Ações da música"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild className="gap-2">
            <Link to={`/songs/${item.song_id}`}>
              <FileMusic className="h-4 w-4 text-slate-500" />
              Abrir cifra
            </Link>
          </DropdownMenuItem>
          {song?.youtube_url && (
            <DropdownMenuItem asChild className="gap-2">
              <a href={song.youtube_url} target="_blank" rel="noreferrer">
                <Youtube className="h-4 w-4 text-slate-500" />
                Ouvir referência
              </a>
            </DropdownMenuItem>
          )}
          {canEdit && (
            <>
              <DropdownMenuItem
                disabled={index === 0}
                onSelect={() => moveTo(index, index - 1)}
                className="gap-2"
              >
                <ArrowUp className="h-4 w-4 text-slate-500" />
                Mover para cima
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === songs.length - 1}
                onSelect={() => moveTo(index, index + 1)}
                className="gap-2"
              >
                <ArrowDown className="h-4 w-4 text-slate-500" />
                Mover para baixo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => removeSong(item)}
                className="gap-2 text-red-600 focus:bg-red-50 focus:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
                Remover do culto
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
    const dragProps = {
      draggable: canEdit,
      onDragStart: (e: React.DragEvent) => {
        setDragIndex(index)
        e.dataTransfer.effectAllowed = 'move'
      },
      onDragOver: (e: React.DragEvent) => {
        if (dragIndex === null) return
        e.preventDefault()
        setOverIndex(index)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        if (dragIndex !== null) moveTo(dragIndex, index)
        setDragIndex(null)
        setOverIndex(null)
      },
      onDragEnd: () => {
        setDragIndex(null)
        setOverIndex(null)
      },
    }
    const dragClass = cn(
      dragIndex === index && 'opacity-40',
      overIndex === index && dragIndex !== null && dragIndex !== index && 'bg-teal-50/60',
    )
    return { song, meta, keyEl, vocalEl, syncEl, menuEl, dragProps, dragClass }
  }

  const table = (
    <SectionCard
      title="Repertório"
      subtitle={
        canEdit && songs.length > 1
          ? 'Arraste para reordenar · o tom vale só para este culto'
          : undefined
      }
    >
      {songs.length === 0 ? (
        <EmptyState
          icon={Music2}
          title="Repertório vazio"
          description={
            canEdit
              ? 'Busque no acervo ao lado as músicas deste culto.'
              : 'O líder ainda não escolheu as músicas.'
          }
        />
      ) : (
        <>
          {/* Celular: um cartão por música */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {songs.map((item, index) => {
              const { song, meta, keyEl, vocalEl, syncEl, menuEl } = renderParts(item, index)
              return (
                <li key={item.id} className="space-y-2.5 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/songs/${item.song_id}`}
                        className="block truncate font-semibold text-slate-900"
                      >
                        {song?.title || 'Música'}
                      </Link>
                      {meta && <div className="truncate text-xs text-slate-500">{meta}</div>}
                      {item.notes && (
                        <div className="truncate text-xs text-amber-700">{item.notes}</div>
                      )}
                    </div>
                    <div className="-mr-1.5 -mt-1">{menuEl}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-9">
                    {keyEl}
                    <div className="min-w-0">{vocalEl}</div>
                    <div className="ml-auto">{syncEl}</div>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Computador: tabela */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  {canEdit && <th className="w-8 py-2.5 pl-3" aria-label="Arrastar" />}
                  <th className="w-10 py-2.5 pl-2">#</th>
                  <th className="py-2.5">Música</th>
                  <th className="py-2.5">Tom</th>
                  <th className="py-2.5">Voz principal</th>
                  <th className="py-2.5">Holyrics</th>
                  <th className="w-12 py-2.5 pr-3" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {songs.map((item, index) => {
                  const { song, meta, keyEl, vocalEl, syncEl, menuEl, dragProps, dragClass } =
                    renderParts(item, index)
                  return (
                    <tr
                      key={item.id}
                      {...dragProps}
                      className={cn(
                        'border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/70',
                        dragClass,
                      )}
                    >
                      {canEdit && (
                        <td className="cursor-grab py-3 pl-3 text-slate-300 active:cursor-grabbing">
                          <GripVertical className="h-4 w-4" />
                        </td>
                      )}
                      <td className="py-3 pl-2">
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">
                          {index + 1}
                        </span>
                      </td>
                      <td className="max-w-[260px] py-3 pr-3">
                        <Link
                          to={`/songs/${item.song_id}`}
                          className="block truncate font-semibold text-slate-900 hover:text-teal-700"
                        >
                          {song?.title || 'Música'}
                        </Link>
                        <div className="truncate text-xs text-slate-500">{meta}</div>
                        {item.notes && (
                          <div className="truncate text-xs text-amber-700">{item.notes}</div>
                        )}
                      </td>
                      <td className="py-3 pr-3">{keyEl}</td>
                      <td className="py-3 pr-3">{vocalEl}</td>
                      <td className="py-3 pr-3">{syncEl}</td>
                      <td className="py-3 pr-3 text-right">{menuEl}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  )

  if (!canEdit) return table

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      {table}
      <AddSongPanel churchId={event.church_id} library={library} songs={songs} onAdd={addSong} />
    </div>
  )
}

function KeyStep({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-600 transition-colors hover:bg-teal-100 hover:text-teal-800 md:h-6 md:w-6"
    >
      {children}
    </button>
  )
}

function VocalLabel({
  member,
}: {
  member?: (ChurchMember & { expand?: { user_id?: { name?: string } } }) | null
}) {
  if (!member) return <span className="text-xs text-slate-400">Definir</span>
  const name = churchMemberName(member as any)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" className="ring-0" />
      <span className="truncate text-sm text-slate-800">{name.split(' ')[0]}</span>
    </span>
  )
}
