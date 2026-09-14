import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { EventItem, EventSong, EventMember, Song, Role, ChurchMember } from '@/types'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Music2,
  Users,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Search,
  Check,
  Edit,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { AVAILABLE_KEYS } from '@/lib/transposition'

export default function EventScaleDetail() {
  const { id } = useParams<{ id: string }>()
  const { currentChurch, canManageContent, currentMember } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [event, setEvent] = useState<EventItem | null>(null)
  const [eventSongs, setEventSongs] = useState<EventSong[]>([])
  const [eventMembers, setEventMembers] = useState<EventMember[]>([])
  const [availableSongs, setAvailableSongs] = useState<Song[]>([])
  const [activeMusicians, setActiveMusicians] = useState<ChurchMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])

  const [isLoading, setIsLoading] = useState(true)

  // Modais
  const [addSongModalOpen, setAddSongModalOpen] = useState(false)
  const [selectedSongToAdd, setSelectedSongToAdd] = useState<string>('')
  const [customKeyToAdd, setCustomKeyToAdd] = useState<string>('')
  const [songNotesToAdd, setSongNotesToAdd] = useState<string>('')
  const [songSearchFilter, setSongSearchFilter] = useState<string>('')

  const [addMusicianModalOpen, setAddMusicianModalOpen] = useState(false)
  const [selectedMemberToAdd, setSelectedMemberToAdd] = useState<string>('')
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState<string>('')
  const [memberNotesToAdd, setMemberNotesToAdd] = useState<string>('')

  // Modal recusa (se o usuário logado estiver na escala)
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [selectedScaleItem, setSelectedScaleItem] = useState<EventMember | null>(null)

  const fetchFullEventData = async () => {
    if (!id || !currentChurch) return
    setIsLoading(true)
    try {
      // 1. Dados do evento
      const ev = await pb.collection('events').getOne<EventItem>(id)
      setEvent(ev)

      // 2. Repertório do evento (com músicas expandidas)
      const songsList = await pb.collection('event_songs').getFullList<EventSong>({
        filter: `event_id = "${id}"`,
        expand: 'song_id',
        sort: 'order',
      })
      setEventSongs(songsList)

      // 3. Escala de músicos do evento
      const membersList = await pb.collection('event_members').getFullList<EventMember>({
        filter: `event_id = "${id}"`,
        expand: 'member_id.user_id,role_id',
        sort: 'created',
      })
      setEventMembers(membersList)

      // 4. Carregar músicas disponíveis da igreja para o picker
      const allSongs = await pb.collection('songs').getFullList<Song>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: 'title',
      })
      setAvailableSongs(allSongs)

      // 5. Carregar músicos ativos da igreja
      const allMembers = await pb.collection('church_members').getFullList<ChurchMember>({
        filter: `church_id = "${currentChurch.id}" && is_active = true`,
        expand: 'user_id',
      })
      setActiveMusicians(allMembers)

      // 6. Carregar funções da igreja
      const allRoles = await pb.collection('roles').getFullList<Role>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: 'name',
      })
      setRoles(allRoles)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar escala',
        description: 'Não foi possível carregar as informações do culto.',
        variant: 'destructive',
      })
      navigate('/events')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchFullEventData()
  }, [id, currentChurch])

  // REPERTÓRIO: Adicionar Música ao Evento
  const handleAddSongToEvent = async () => {
    if (!selectedSongToAdd || !event || !currentChurch) return
    const chosenSong = availableSongs.find((s) => s.id === selectedSongToAdd)
    if (!chosenSong) return

    try {
      const nextOrder = eventSongs.length + 1
      await pb.collection('event_songs').create({
        church_id: currentChurch.id,
        event_id: event.id,
        song_id: chosenSong.id,
        order: nextOrder,
        custom_key: customKeyToAdd || chosenSong.key,
        notes: songNotesToAdd || null,
      })

      toast({
        title: 'Música adicionada',
        description: `"${chosenSong.title}" inserida no repertório.`,
      })

      setAddSongModalOpen(false)
      setSelectedSongToAdd('')
      setCustomKeyToAdd('')
      setSongNotesToAdd('')
      fetchFullEventData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao adicionar',
        description: 'Não foi possível incluir a música no culto.',
        variant: 'destructive',
      })
    }
  }

  // REPERTÓRIO: Remover Música do Evento
  const handleRemoveSong = async (eventSongId: string) => {
    if (!window.confirm('Remover esta música do repertório deste culto?')) return
    try {
      await pb.collection('event_songs').delete(eventSongId)
      toast({
        title: 'Música removida do repertório',
      })
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

  // REPERTÓRIO: Reordenação via botões (perfeito para mobile e desktop)
  const handleMoveSong = async (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= eventSongs.length) return

    const newSongs = [...eventSongs]
    const temp = newSongs[currentIndex]
    newSongs[currentIndex] = newSongs[targetIndex]
    newSongs[targetIndex] = temp

    setEventSongs(newSongs)

    try {
      await Promise.all([
        pb.collection('event_songs').update(newSongs[currentIndex].id, { order: currentIndex + 1 }),
        pb.collection('event_songs').update(newSongs[targetIndex].id, { order: targetIndex + 1 }),
      ])
    } catch (err) {
      console.error('Erro ao reordenar repertório:', err)
      fetchFullEventData()
    }
  }

  // ESCALA: Adicionar Músico à Escala
  const handleAddMusicianToScale = async () => {
    if (!selectedMemberToAdd || !selectedRoleToAdd || !event || !currentChurch) return
    try {
      await pb.collection('event_members').create({
        church_id: currentChurch.id,
        event_id: event.id,
        member_id: selectedMemberToAdd,
        role_id: selectedRoleToAdd,
        status: 'PENDENTE',
        notes: memberNotesToAdd || null,
      })

      toast({
        title: 'Músico escalado',
        description: 'Convite de escala registrado como Pendente.',
      })

      setAddMusicianModalOpen(false)
      setSelectedMemberToAdd('')
      setSelectedRoleToAdd('')
      setMemberNotesToAdd('')
      fetchFullEventData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao escalar músico',
        description: 'Não foi possível registrar o músico na escala.',
        variant: 'destructive',
      })
    }
  }

  // ESCALA: Remover Músico da Escala
  const handleRemoveMusician = async (scaleId: string) => {
    if (!window.confirm('Remover este músico da escala?')) return
    try {
      await pb.collection('event_members').delete(scaleId)
      toast({
        title: 'Escala removida',
      })
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

  // ESCALA: Confirmar Escala (músico ou admin)
  const handleConfirmParticipation = async (scaleId: string) => {
    try {
      await pb.collection('event_members').update(scaleId, {
        status: 'CONFIRMADO',
        response_at: new Date().toISOString(),
      })
      toast({
        title: 'Presença confirmada!',
        description: 'A participação foi registrada.',
      })
      fetchFullEventData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a escala.',
        variant: 'destructive',
      })
    }
  }

  // ESCALA: Recusar com motivo
  const handleDeclineSubmit = async () => {
    if (!selectedScaleItem) return
    try {
      await pb.collection('event_members').update(selectedScaleItem.id, {
        status: 'RECUSADO',
        response_at: new Date().toISOString(),
        decline_reason: declineReason || 'Sem motivo informado',
      })
      toast({
        title: 'Escala recusada',
        description: 'A justificativa de ausência foi salva.',
      })
      setDeclineModalOpen(false)
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!event) return null

  const filteredPickerSongs = availableSongs.filter(
    (s) =>
      s.title.toLowerCase().includes(songSearchFilter.toLowerCase()) ||
      s.artist.toLowerCase().includes(songSearchFilter.toLowerCase()),
  )

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Eventos
        </Link>

        {canManageContent && (
          <Link to={`/events/${event.id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 text-xs font-semibold gap-1.5"
            >
              <Edit className="h-3.5 w-3.5" />
              Editar Culto
            </Button>
          </Link>
        )}
      </div>

      {/* Event Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Planejamento Litúrgico
            </span>
            <Badge variant="outline" className="text-xs">
              {event.status}
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {event.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <CalendarDays className="h-4 w-4 text-teal-700" />
              {formatDateDisplay(event.date)}
            </span>
            {event.start_time && (
              <span className="flex items-center gap-1 text-slate-600">
                <Clock className="h-4 w-4 text-slate-400" />
                {event.start_time}
                {event.end_time ? ` às ${event.end_time}` : ''}
              </span>
            )}
          </p>
          {event.description && (
            <p className="text-xs text-slate-600 mt-2 max-w-2xl">{event.description}</p>
          )}
        </div>

        <div className="flex flex-row md:flex-col items-center md:items-end gap-2 shrink-0">
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Equipe Escalada</span>
            <span className="text-lg font-bold text-slate-900">
              {eventMembers.filter((m) => m.status === 'CONFIRMADO').length} de{' '}
              {eventMembers.length} confirmados
            </span>
          </div>
        </div>
      </div>

      {/* DUAL COLUMN: Repertório (Esquerda) e Escala (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* COLUNA 1: REPERTÓRIO */}
        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Music2 className="h-5 w-5 text-teal-700" />
                <CardTitle className="text-base font-bold text-slate-900">
                  Repertório ({eventSongs.length})
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Músicas e tons definidos especificamente para este culto
              </CardDescription>
            </div>

            {canManageContent && (
              <Button
                size="sm"
                onClick={() => setAddSongModalOpen(true)}
                className="h-8 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Música
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-4">
            {eventSongs.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Music2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-semibold text-slate-700">Nenhuma música no repertório</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adicione as músicas que serão ministradas neste culto.
                </p>
                {canManageContent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddSongModalOpen(true)}
                    className="mt-3 rounded-xl text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
                  >
                    Adicionar Música
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {eventSongs.map((item, index) => {
                  const song = item.expand?.song_id
                  if (!song) return null
                  const effectiveKey = item.custom_key || song.key

                  return (
                    <div
                      key={item.id}
                      className="group bg-slate-50 hover:bg-white rounded-xl border border-slate-200/80 hover:border-teal-200 p-3 transition-all flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Ordem */}
                        <div className="h-7 w-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {index + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/songs/${song.id}`}
                              className="text-sm font-bold text-slate-900 hover:text-teal-700 transition-colors truncate"
                            >
                              {song.title}
                            </Link>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold bg-teal-50 text-teal-800 border-teal-200 shrink-0"
                            >
                              Tom: {effectiveKey}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {song.artist}
                            {item.notes && (
                              <span className="text-amber-700 font-medium"> • {item.notes}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Controles de reordenação */}
                        {canManageContent && (
                          <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={index === 0}
                              onClick={() => handleMoveSong(index, 'up')}
                              aria-label="Mover para cima"
                              className="h-6 w-6 text-slate-500 hover:text-slate-800"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={index === eventSongs.length - 1}
                              onClick={() => handleMoveSong(index, 'down')}
                              aria-label="Mover para baixo"
                              className="h-6 w-6 text-slate-500 hover:text-slate-800"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        )}

                        <Link to={`/songs/${song.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Abrir cifra da música"
                            title="Abrir Cifra"
                            className="h-7 w-7 text-slate-400 hover:text-teal-700"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </Link>

                        {canManageContent && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remover do repertório"
                            onClick={() => handleRemoveSong(item.id)}
                            className="h-7 w-7 text-slate-400 hover:text-red-600"
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

        {/* COLUNA 2: ESCALA DA EQUIPE */}
        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-600" />
                <CardTitle className="text-base font-bold text-slate-900">
                  Escala Ministerial ({eventMembers.length})
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Músicos escalados e confirmação de presença em tempo real
              </CardDescription>
            </div>

            {canManageContent && (
              <Button
                size="sm"
                onClick={() => setAddMusicianModalOpen(true)}
                className="h-8 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Escalar Músico
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-4">
            {eventMembers.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-semibold text-slate-700">Nenhum músico escalado</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monte a equipe definindo os vocais e instrumentos.
                </p>
                {canManageContent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddMusicianModalOpen(true)}
                    className="mt-3 rounded-xl text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
                  >
                    Escalar Primeiro Músico
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {eventMembers.map((memberScale) => {
                  const musician = memberScale.expand?.member_id?.expand?.user_id
                  const memberRecord = memberScale.expand?.member_id
                  const role = memberScale.expand?.role_id
                  const isCurrentLoggedMember = currentMember?.id === memberRecord?.id

                  return (
                    <div
                      key={memberScale.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0 border border-slate-200 text-xs">
                            {musician?.name ? musician.name[0].toUpperCase() : 'M'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 truncate">
                                {musician?.name || 'Músico'}
                              </span>
                              {role && (
                                <Badge
                                  style={{
                                    backgroundColor: role.color ? `${role.color}15` : undefined,
                                    borderColor: role.color ? `${role.color}40` : undefined,
                                    color: role.color || undefined,
                                  }}
                                  className="text-[10px] font-semibold"
                                >
                                  {role.name}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 block truncate">
                              {memberRecord?.phone || musician?.email}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2 shrink-0">
                          {memberScale.status === 'CONFIRMADO' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Confirmado
                            </Badge>
                          ) : memberScale.status === 'RECUSADO' ? (
                            <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 text-xs gap-1">
                              <XCircle className="h-3 w-3" />
                              Recusado
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Pendente
                            </Badge>
                          )}

                          {canManageContent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveMusician(memberScale.id)}
                              aria-label="Remover da escala"
                              className="h-7 w-7 text-slate-400 hover:text-red-600 rounded-lg"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Motivo de recusa e data da resposta */}
                      {memberScale.status === 'RECUSADO' && memberScale.decline_reason && (
                        <div className="p-2.5 rounded-lg bg-red-50 text-xs text-red-700 border border-red-100">
                          <p className="font-semibold">Motivo da recusa:</p>
                          <p className="mt-0.5 italic">"{memberScale.decline_reason}"</p>
                        </div>
                      )}

                      {memberScale.response_at && (
                        <p className="text-[10px] text-slate-400">
                          Resposta registrada em:{' '}
                          {new Date(memberScale.response_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}

                      {/* Botões de Ação Inline caso pertença ao usuário logado ou líder queira atualizar */}
                      {(isCurrentLoggedMember || canManageContent) &&
                        memberScale.status === 'PENDENTE' && (
                          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                            <Button
                              size="sm"
                              onClick={() => handleConfirmParticipation(memberScale.id)}
                              className="h-8 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold gap-1.5"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Confirmar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedScaleItem(memberScale)
                                setDeclineReason('')
                                setDeclineModalOpen(true)
                              }}
                              className="h-8 px-3 rounded-lg border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold gap-1.5"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Recusar
                            </Button>
                          </div>
                        )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MODAL: Adicionar Música ao Repertório */}
      <Dialog open={addSongModalOpen} onOpenChange={setAddSongModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Adicionar Música ao Repertório
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Selecione uma música cadastrada na biblioteca e personalize o tom deste culto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="song-select" className="text-xs font-semibold text-slate-700">
                Música da Biblioteca
              </Label>
              <Select
                value={selectedSongToAdd}
                onValueChange={(val) => {
                  setSelectedSongToAdd(val)
                  const chosen = availableSongs.find((s) => s.id === val)
                  if (chosen) setCustomKeyToAdd(chosen.key)
                }}
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Selecione a música..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableSongs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} ({s.artist}) - Tom {s.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-key" className="text-xs font-semibold text-slate-700">
                Tom Específico para este Culto
              </Label>
              <Select value={customKeyToAdd} onValueChange={setCustomKeyToAdd}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Tom para este evento" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400">
                O tom escolhido aqui não modifica o tom original cadastrado na música.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="song-notes" className="text-xs font-semibold text-slate-700">
                Observações de Arranjo para este Culto
              </Label>
              <Input
                id="song-notes"
                value={songNotesToAdd}
                onChange={(e) => setSongNotesToAdd(e.target.value)}
                placeholder="Ex: Abertura suave, espontâneo na ponte..."
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddSongModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddSongToEvent}
              disabled={!selectedSongToAdd}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            >
              Adicionar ao Culto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Escalar Músico */}
      <Dialog open={addMusicianModalOpen} onOpenChange={setAddMusicianModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Escalar Músico / Instrumento
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Selecione o membro da equipe e a função que ele exercerá neste culto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="musician-select" className="text-xs font-semibold text-slate-700">
                Membro / Músico
              </Label>
              <Select value={selectedMemberToAdd} onValueChange={setSelectedMemberToAdd}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Selecione o músico..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {activeMusicians.map((m) => {
                    const u = m.expand?.user_id
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {u?.name || 'Músico'} ({u?.email})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-select" className="text-xs font-semibold text-slate-700">
                Função / Instrumento
              </Label>
              <Select value={selectedRoleToAdd} onValueChange={setSelectedRoleToAdd}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Selecione o instrumento..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-notes" className="text-xs font-semibold text-slate-700">
                Observações para a Escala
              </Label>
              <Input
                id="member-notes"
                value={memberNotesToAdd}
                onChange={(e) => setMemberNotesToAdd(e.target.value)}
                placeholder="Ex: Chegar às 18:30 para passagem de som..."
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddMusicianModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddMusicianToScale}
              disabled={!selectedMemberToAdd || !selectedRoleToAdd}
              className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold"
            >
              Salvar Escala
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Recusar Escala */}
      <Dialog open={declineModalOpen} onOpenChange={setDeclineModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Recusar Participação
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informe a justificativa para que o líder possa organizar a substituição.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="reason-decline" className="text-xs font-semibold text-slate-700">
              Motivo da Ausência
            </Label>
            <Textarea
              id="reason-decline"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Ex: Compromisso de trabalho, viagem familiar, saúde..."
              className="rounded-xl border-slate-200 min-h-[90px]"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeclineModalOpen(false)}
              className="rounded-xl"
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleDeclineSubmit}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
