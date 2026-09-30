import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type {
  EventItem,
  EventSong,
  EventMember,
  Song,
  Role,
  ChurchMember,
  EventTask,
  MediaAsset,
  TeamArea,
} from '@/types'
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
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Search,
  Check,
  Edit,
  Volume2,
  Tv,
  Image as ImageIcon,
  Sun,
  CheckSquare,
  UploadCloud,
  Download,
  ExternalLink,
  Layers,
  FileVideo,
  ListTodo,
  Radio,
  Loader2,
  X,
} from 'lucide-react'
import {
  syncEventRepertoireWithHolyrics,
  type SyncEventSongItemResult,
  type SyncEventRepertoireSummary,
} from '@/services/holyricsAgent'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { AVAILABLE_KEYS } from '@/lib/transposition'
import { listEventTasks, saveEventTask, updateTaskStatus, deleteTask } from '@/services/tasks'
import {
  listEventMedia,
  uploadMediaAsset,
  updateMediaStatus,
  getMediaFileUrl,
  deleteMediaAsset,
} from '@/services/media'

export default function EventScaleDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    currentChurch,
    canManageContent,
    currentMember,
    isMaster,
    isAdmin,
    isLeader,
    hasOperationalRole,
    hasPermission,
  } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [event, setEvent] = useState<EventItem | null>(null)
  const [eventSongs, setEventSongs] = useState<EventSong[]>([])
  const [eventMembers, setEventMembers] = useState<EventMember[]>([])
  const [availableSongs, setAvailableSongs] = useState<Song[]>([])
  const [activeMusicians, setActiveMusicians] = useState<ChurchMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])

  // Mídias e Tarefas do Evento
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [mediaList, setMediaList] = useState<MediaAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Aba ativa vinda da URL ou default 'overview'
  const initialTab = searchParams.get('tab') || 'overview'
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab')
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
  }, [searchParams])

  const handleTabChange = (val: string) => {
    setActiveTab(val)
    setSearchParams({ tab: val })
  }

  // Modais de Repertório e Escala
  const [addSongModalOpen, setAddSongModalOpen] = useState(false)
  const [selectedSongToAdd, setSelectedSongToAdd] = useState<string>('')
  const [customKeyToAdd, setCustomKeyToAdd] = useState<string>('')
  const [songNotesToAdd, setSongNotesToAdd] = useState<string>('')

  const [addMusicianModalOpen, setAddMusicianModalOpen] = useState(false)
  const [selectedMemberToAdd, setSelectedMemberToAdd] = useState<string>('')
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState<string>('')
  const [selectedTeamAreaToAdd, setSelectedTeamAreaToAdd] = useState<TeamArea>('LOUVOR')
  const [memberNotesToAdd, setMemberNotesToAdd] = useState<string>('')

  // Modal recusa
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [selectedScaleItem, setSelectedScaleItem] = useState<EventMember | null>(null)

  // Modais de Tarefa
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskArea, setTaskArea] = useState<TeamArea>('LOUVOR')
  const [taskAssignedTo, setTaskAssignedTo] = useState('')
  const [taskPriority, setTaskPriority] = useState<'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE'>(
    'NORMAL',
  )
  const [taskDueDate, setTaskDueDate] = useState('')

  // Modal de Upload de Mídia
  const [mediaModalOpen, setMediaModalOpen] = useState(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaName, setMediaName] = useState('')
  const [mediaType, setMediaType] = useState<'VIDEO' | 'IMAGEM' | 'AUDIO' | 'DOCUMENTO'>('VIDEO')
  const [mediaCategory, setMediaCategory] = useState<
    'AGENDA' | 'ANIVERSARIANTES' | 'AVISOS' | 'CULTOS' | 'EVENTOS' | 'VIDEO_ESPECIAL' | 'OUTROS'
  >('AVISOS')
  const [mediaAssignedOperator, setMediaAssignedOperator] = useState('')
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)

  // Estado da Sincronização de Repertório com o Holyrics
  const [isSyncingRepertoire, setIsSyncingRepertoire] = useState(false)
  const [syncReportModalOpen, setSyncReportModalOpen] = useState(false)
  const [syncReportItems, setSyncReportItems] = useState<SyncEventSongItemResult[]>([])
  const [syncReportSummary, setSyncReportSummary] = useState<SyncEventRepertoireSummary | null>(
    null,
  )
  const [syncReportMessage, setSyncReportMessage] = useState('')
  const [syncReportHasErrors, setSyncReportHasErrors] = useState(false)

  // PERMISSÕES DE ABAS
  // 1. Visão geral: todos com acesso ao evento
  // 2. Repertório: Músicos, Líderes, Admin, Master
  // 3. Escala: todos com acesso ao evento (equipes gerais)
  // 4. Som: MASTER, ADMIN ou perfil operacional SOM
  // 5. Projeção: MASTER, ADMIN ou perfil operacional PROJECAO
  // 6. Mídia: MASTER, ADMIN, MIDIA ou PROJECAO
  // 7. Iluminação: MASTER, ADMIN ou perfil operacional ILUMINACAO
  // 8. Tarefas: MASTER, ADMIN, LIDER, MIDIA ou quem tem tarefas atribuídas
  const canSeeRepertoire = isMaster || isAdmin || isLeader || hasOperationalRole('MUSICO')
  const canSeeSound = isMaster || isAdmin || hasOperationalRole('SOM')
  const canSeeProjection = isMaster || isAdmin || hasOperationalRole('PROJECAO')
  const canSeeMedia =
    isMaster || isAdmin || hasOperationalRole('MIDIA') || hasOperationalRole('PROJECAO')
  const canSeeLighting = isMaster || isAdmin || hasOperationalRole('ILUMINACAO')
  const canSeeTasks = isMaster || isAdmin || isLeader || hasOperationalRole('MIDIA')
  const canSyncHolyrics = isMaster || isAdmin || isLeader || hasPermission('holyrics.sync')

  const fetchFullEventData = async () => {
    if (!id || !currentChurch) return
    setIsLoading(true)
    try {
      // 1. Evento
      const ev = await pb.collection('events').getOne<EventItem>(id)
      setEvent(ev)

      // 2. Repertório
      const songsList = await pb.collection('event_songs').getFullList<EventSong>({
        filter: `event_id = "${id}"`,
        expand: 'song_id',
        sort: 'order',
      })
      setEventSongs(songsList)

      // 3. Equipes do evento
      const membersList = await pb.collection('event_members').getFullList<EventMember>({
        filter: `event_id = "${id}"`,
        expand: 'member_id.user_id,role_id',
        sort: 'created',
      })
      setEventMembers(membersList)

      // 4. Músicas disponíveis para biblioteca
      const allSongs = await pb.collection('songs').getFullList<Song>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: 'title',
      })
      setAvailableSongs(allSongs)

      // 5. Membros ativos
      const allMembers = await pb.collection('church_members').getFullList<ChurchMember>({
        filter: `church_id = "${currentChurch.id}" && is_active = true`,
        expand: 'user_id',
      })
      setActiveMusicians(allMembers)

      // 6. Funções
      const allRoles = await pb.collection('roles').getFullList<Role>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: 'name',
      })
      setRoles(allRoles)

      // 7. Tarefas do evento
      try {
        const tasksData = await listEventTasks(currentChurch.id, id)
        setTasks(tasksData)
      } catch (e) {
        console.error('Erro ao listar tarefas:', e)
      }

      // 8. Mídias do evento
      try {
        const mediaData = await listEventMedia(currentChurch.id, id)
        setMediaList(mediaData)
      } catch (e) {
        console.error('Erro ao listar mídias:', e)
      }
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar evento',
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

  // SINCRONIZAÇÃO DO REPERTÓRIO COM O HOLYRICS
  const handleSyncRepertoireWithHolyrics = async () => {
    if (!event || !currentChurch) return
    if (!canSyncHolyrics) {
      toast({
        title: 'Permissão negada',
        description: 'Apenas Administradores e Líderes podem sincronizar com o Holyrics.',
        variant: 'destructive',
      })
      return
    }

    if (eventSongs.length === 0) {
      toast({
        title: 'Repertório vazio',
        description: 'Adicione músicas ao repertório antes de sincronizar com o Holyrics.',
      })
      return
    }

    setIsSyncingRepertoire(true)
    toast({
      title: 'Sincronizando com o Holyrics...',
      description: `Processando ${eventSongs.length} música(s) na ordem do repertório. Aguarde...`,
    })

    try {
      const res = await syncEventRepertoireWithHolyrics({
        churchId: currentChurch.id,
        eventId: event.id,
      })

      if (res.items && res.items.length > 0) {
        setSyncReportItems(res.items)
        setSyncReportSummary(res.summary || null)
        setSyncReportMessage(res.message)
        setSyncReportHasErrors(Boolean(res.has_errors))
        setSyncReportModalOpen(true)
      }

      if (res.success) {
        toast({
          title: 'Repertório sincronizado!',
          description: res.message,
        })
      } else {
        toast({
          title: res.has_errors ? 'Sincronização com avisos' : 'Falha na sincronização',
          description: res.message || 'Verifique o status do LouvorFlow Agent e do Holyrics.',
          variant: res.has_errors ? 'default' : 'destructive',
        })
      }

      await fetchFullEventData()
    } catch (err: any) {
      console.error('Erro na sincronização:', err)
      toast({
        title: 'Erro ao sincronizar com Holyrics',
        description: err.message || 'Não foi possível conectar ao Holyrics ou ao Agent.',
        variant: 'destructive',
      })
    } finally {
      setIsSyncingRepertoire(false)
    }
  }

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

  const handleRemoveSong = async (eventSongId: string) => {
    if (!window.confirm('Remover esta música do repertório deste culto?')) return
    try {
      await pb.collection('event_songs').delete(eventSongId)
      toast({ title: 'Música removida do repertório' })
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

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

  // EQUIPES: Adicionar Pessoa a uma Área
  const handleAddMemberToTeam = async () => {
    if (!selectedMemberToAdd || !event || !currentChurch) return
    try {
      // Se não tiver papel selecionado, pega o primeiro correspondente ou default
      const defaultRole = roles[0]?.id || ''
      await pb.collection('event_members').create({
        church_id: currentChurch.id,
        event_id: event.id,
        member_id: selectedMemberToAdd,
        role_id: selectedRoleToAdd || defaultRole,
        team_area: selectedTeamAreaToAdd,
        status: 'PENDENTE',
        notes: memberNotesToAdd || null,
      })

      toast({
        title: 'Membro escalado',
        description: `Adicionado à equipe de ${selectedTeamAreaToAdd}.`,
      })

      setAddMusicianModalOpen(false)
      setSelectedMemberToAdd('')
      setSelectedRoleToAdd('')
      setMemberNotesToAdd('')
      fetchFullEventData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao escalar',
        description: 'Não foi possível registrar o membro na equipe.',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveMember = async (scaleId: string) => {
    if (!window.confirm('Remover esta pessoa da escala?')) return
    try {
      await pb.collection('event_members').delete(scaleId)
      toast({ title: 'Membro removido da equipe' })
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleConfirmParticipation = async (scaleId: string) => {
    try {
      await pb.collection('event_members').update(scaleId, {
        status: 'CONFIRMADO',
        response_at: new Date().toISOString(),
      })
      toast({ title: 'Presença confirmada!' })
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeclineSubmit = async () => {
    if (!selectedScaleItem) return
    try {
      await pb.collection('event_members').update(selectedScaleItem.id, {
        status: 'RECUSADO',
        response_at: new Date().toISOString(),
        decline_reason: declineReason || 'Sem motivo informado',
      })
      toast({ title: 'Escala recusada' })
      setDeclineModalOpen(false)
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

  // TAREFAS: Criar Nova Tarefa
  const handleCreateTask = async () => {
    if (!taskTitle || !event || !currentChurch) return
    try {
      await saveEventTask({
        church_id: currentChurch.id,
        event_id: event.id,
        title: taskTitle,
        description: taskDesc,
        team_area: taskArea,
        assigned_to: taskAssignedTo || null,
        priority: taskPriority,
        due_date: taskDueDate || null,
        status: 'PENDENTE',
      })
      toast({ title: 'Tarefa criada com sucesso!' })
      setTaskModalOpen(false)
      setTaskTitle('')
      setTaskDesc('')
      setTaskAssignedTo('')
      fetchFullEventData()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar tarefa',
        description: err.message || 'Falha ao salvar.',
        variant: 'destructive',
      })
    }
  }

  const handleToggleTaskStatus = async (task: EventTask) => {
    if (!currentChurch) return
    const nextStatus = task.status === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA'
    try {
      await updateTaskStatus(task.id, currentChurch.id, nextStatus)
      toast({
        title: nextStatus === 'CONCLUIDA' ? 'Tarefa concluída!' : 'Tarefa reaberta',
      })
      fetchFullEventData()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar tarefa',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Excluir esta tarefa?')) return
    try {
      await deleteTask(taskId)
      toast({ title: 'Tarefa excluída' })
      fetchFullEventData()
    } catch (err) {
      console.error(err)
    }
  }

  // MÍDIAS: Upload
  const handleUploadMedia = async () => {
    if (!mediaFile || !event || !currentChurch) return
    setIsUploadingMedia(true)
    try {
      const formData = new FormData()
      formData.append('church_id', currentChurch.id)
      formData.append('event_id', event.id)
      formData.append('name', mediaName || mediaFile.name)
      formData.append('file', mediaFile)
      formData.append('media_type', mediaType)
      formData.append('category', mediaCategory)
      formData.append('size', String(mediaFile.size))
      formData.append('status', 'ENVIADA')
      if (currentMember?.id) {
        formData.append('uploaded_by', currentMember.id)
      }
      if (mediaAssignedOperator) {
        formData.append('assigned_operator', mediaAssignedOperator)
      }

      await uploadMediaAsset(formData)
      toast({
        title: 'Mídia enviada com sucesso!',
        description: 'O arquivo foi associado ao culto e a notificação disparada.',
      })
      setMediaModalOpen(false)
      setMediaFile(null)
      setMediaName('')
      setMediaAssignedOperator('')
      fetchFullEventData()
    } catch (err: any) {
      toast({
        title: 'Erro no upload',
        description: err.message || 'Falha ao enviar arquivo.',
        variant: 'destructive',
      })
    } finally {
      setIsUploadingMedia(false)
    }
  }

  // MÍDIAS: Download e Confirmação
  const handleDownloadMedia = (media: MediaAsset) => {
    const url = getMediaFileUrl(media)
    if (!url) return
    window.open(url, '_blank')
    toast({
      title: 'Download iniciado',
      description: 'Lembre-se de clicar em [Marcar como baixada] após conferir o arquivo.',
    })
  }

  const handleMarkAsDownloaded = async (mediaId: string) => {
    try {
      await updateMediaStatus(mediaId, 'BAIXADA')
      toast({ title: 'Mídia marcada como BAIXADA!' })
      fetchFullEventData()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Não foi possível atualizar status.',
        variant: 'destructive',
      })
    }
  }

  const handleMarkAsImportedHolyrics = async (mediaId: string) => {
    try {
      await updateMediaStatus(mediaId, 'IMPORTADA_HOLYRICS', 'IMPORTADO_MANUALMENTE')
      toast({
        title: 'Mídia marcada como importada no Holyrics!',
        description: 'Status atualizado com sucesso.',
      })
      fetchFullEventData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleDeleteMedia = async (mediaId: string) => {
    if (!window.confirm('Excluir esta mídia do evento?')) return
    try {
      await deleteMediaAsset(mediaId)
      toast({ title: 'Mídia excluída' })
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
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (!event) return null

  // Filtros por área da equipe
  const getMembersByArea = (area: TeamArea) => {
    return eventMembers.filter((m) => {
      if (m.team_area) return m.team_area === area
      // Fallback para quem não tem team_area (louvor por padrão)
      return area === 'LOUVOR'
    })
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header Topo */}
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

      {/* Banner Principal do Culto */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Centro Operacional do Culto
            </span>
            <Badge variant="outline" className="text-xs font-semibold">
              {event.status}
            </Badge>
            {event.holyrics_event_id && (
              <Badge
                variant="outline"
                className="text-xs bg-purple-50 text-purple-700 border-purple-200"
              >
                Holyrics ID: {event.holyrics_event_id}
              </Badge>
            )}
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

        <div className="flex flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
          <div className="text-left md:text-right">
            <span className="text-xs text-slate-400 block">Equipe do Evento</span>
            <span className="text-lg font-bold text-slate-900">
              {eventMembers.filter((m) => m.status === 'CONFIRMADO').length} de{' '}
              {eventMembers.length} confirmados
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {mediaList.length} mídias
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {tasks.length} tarefas
            </Badge>
          </div>
        </div>
      </div>

      {/* ABAS OPERACIONAIS FILTRADAS POR PERMISSÃO */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-11 bg-white border border-slate-200 p-1 rounded-xl inline-flex min-w-max gap-1">
            <TabsTrigger
              value="overview"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
            >
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Visão Geral
            </TabsTrigger>

            {canSeeRepertoire && (
              <TabsTrigger
                value="repertorio"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                <Music2 className="h-3.5 w-3.5 mr-1.5" />
                Repertório ({eventSongs.length})
              </TabsTrigger>
            )}

            <TabsTrigger
              value="escala"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Equipes ({eventMembers.length})
            </TabsTrigger>

            {canSeeSound && (
              <TabsTrigger
                value="som"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                <Volume2 className="h-3.5 w-3.5 mr-1.5" />
                Som ({getMembersByArea('SOM').length})
              </TabsTrigger>
            )}

            {canSeeProjection && (
              <TabsTrigger
                value="projecao"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                <Tv className="h-3.5 w-3.5 mr-1.5" />
                Projeção ({getMembersByArea('PROJECAO').length})
              </TabsTrigger>
            )}

            {canSeeMedia && (
              <TabsTrigger
                value="midia"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                Mídias ({mediaList.length})
              </TabsTrigger>
            )}

            {canSeeLighting && (
              <TabsTrigger
                value="iluminacao"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                <Sun className="h-3.5 w-3.5 mr-1.5" />
                Iluminação ({getMembersByArea('ILUMINACAO').length})
              </TabsTrigger>
            )}

            {canSeeTasks && (
              <TabsTrigger
                value="tarefas"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                Tarefas ({tasks.length})
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* 1. ABA: VISÃO GERAL */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  <span>Louvor / Repertório</span>
                  <Music2 className="h-4 w-4 text-teal-700" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold text-slate-900">
                  {eventSongs.length} músicas
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {eventSongs
                    .map((s) => s.expand?.song_id?.title)
                    .slice(0, 3)
                    .join(', ')}
                  {eventSongs.length > 3 ? '...' : ''}
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  <span>Mídias para Exibição</span>
                  <ImageIcon className="h-4 w-4 text-emerald-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold text-slate-900">
                  {mediaList.length} arquivos
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {mediaList.filter((m) => m.status === 'IMPORTADA_HOLYRICS').length} importadas no
                  Holyrics
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  <span>Tarefas do Evento</span>
                  <CheckSquare className="h-4 w-4 text-indigo-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold text-slate-900">
                  {tasks.filter((t) => t.status === 'CONCLUIDA').length} de {tasks.length}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {tasks.filter((t) => t.status === 'PENDENTE').length} pendentes
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Resumo das Equipes do Evento */}
          <Card className="rounded-2xl border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Equipes Técnicas e Ministeriais
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Pessoas atribuídas a cada área deste culto
                </CardDescription>
              </div>
              {canManageContent && (
                <Button
                  size="sm"
                  onClick={() => setAddMusicianModalOpen(true)}
                  className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Atribuir Pessoa
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {(['LOUVOR', 'SOM', 'PROJECAO', 'MIDIA', 'ILUMINACAO'] as TeamArea[]).map(
                  (area) => {
                    const areaMembers = getMembersByArea(area)
                    return (
                      <div
                        key={area}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-800">{area}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {areaMembers.length}
                          </Badge>
                        </div>
                        <div className="space-y-1.5">
                          {areaMembers.length === 0 ? (
                            <span className="text-[11px] text-slate-400 italic">Nenhum</span>
                          ) : (
                            areaMembers.map((m) => {
                              const u = m.expand?.member_id?.expand?.user_id
                              const r = m.expand?.role_id
                              return (
                                <div
                                  key={m.id}
                                  className="text-xs bg-white p-1.5 rounded-lg border border-slate-200/70"
                                >
                                  <span className="font-semibold text-slate-800 block truncate">
                                    {u?.name || 'Membro'}
                                  </span>
                                  {r && (
                                    <span className="text-[10px] text-slate-500 block truncate">
                                      {r.name}
                                    </span>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  },
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. ABA: REPERTÓRIO */}
        {canSeeRepertoire && (
          <TabsContent value="repertorio" className="mt-4">
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Repertório do Culto ({eventSongs.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Músicas na ordem litúrgica e sincronização com o Holyrics
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {canSyncHolyrics && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSyncingRepertoire || eventSongs.length === 0}
                      onClick={handleSyncRepertoireWithHolyrics}
                      className="rounded-xl border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800 text-xs font-semibold gap-1.5 shadow-xs"
                      title="Sincroniza todas as músicas do repertório na ordem exata com o Holyrics (cria as não existentes e adiciona à playlist sem duplicar)"
                    >
                      {isSyncingRepertoire ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                      ) : (
                        <Radio className="h-3.5 w-3.5 text-purple-600" />
                      )}
                      <span>
                        {isSyncingRepertoire
                          ? 'Sincronizando...'
                          : '🚀 Sincronizar repertório com Holyrics'}
                      </span>
                    </Button>
                  )}
                  {canManageContent && (
                    <Button
                      size="sm"
                      onClick={() => setAddSongModalOpen(true)}
                      className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Música
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {eventSongs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Music2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-700">Repertório vazio</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Adicione as músicas que serão ministradas neste culto.
                    </p>
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
                          className="bg-slate-50 hover:bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
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
                                {song.holyrics_song_id && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200 shrink-0"
                                    title={`ID Holyrics: ${song.holyrics_song_id}`}
                                  >
                                    Holyrics #{song.holyrics_song_id}
                                  </Badge>
                                )}
                                {item.holyrics_status && item.holyrics_status !== 'NOT_SYNCED' && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] font-medium shrink-0 ${
                                      item.holyrics_status === 'ADDED_TO_PLAYLIST' ||
                                      item.holyrics_status === 'ALREADY_IN_PLAYLIST'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : item.holyrics_status === 'ERROR'
                                          ? 'bg-red-50 text-red-700 border-red-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}
                                  >
                                    {item.holyrics_status === 'ADDED_TO_PLAYLIST'
                                      ? 'Na playlist'
                                      : item.holyrics_status === 'ALREADY_IN_PLAYLIST'
                                        ? 'Playlist (já estava)'
                                        : item.holyrics_status === 'CREATED'
                                          ? 'Criada no Holyrics'
                                          : item.holyrics_status === 'CREATING'
                                            ? 'Criando...'
                                            : item.holyrics_status === 'ADDING_TO_PLAYLIST'
                                              ? 'Adicionando...'
                                              : item.holyrics_status === 'ERROR'
                                                ? 'Erro'
                                                : item.holyrics_status}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 truncate">
                                {song.artist}
                                {item.notes && (
                                  <span className="text-amber-700 font-medium">
                                    {' '}
                                    • {item.notes}
                                  </span>
                                )}
                                {item.holyrics_error && (
                                  <span className="text-red-600 font-medium block text-[11px] mt-0.5">
                                    ⚠️ {item.holyrics_error}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {canManageContent && (
                              <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={index === 0}
                                  onClick={() => handleMoveSong(index, 'up')}
                                  aria-label="Subir música"
                                  className="h-6 w-6 text-slate-500"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={index === eventSongs.length - 1}
                                  onClick={() => handleMoveSong(index, 'down')}
                                  aria-label="Descer música"
                                  className="h-6 w-6 text-slate-500"
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
                              </div>
                            )}

                            <Link to={`/songs/${song.id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
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
                                onClick={() => handleRemoveSong(item.id)}
                                aria-label="Remover música"
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
          </TabsContent>
        )}

        {/* 3. ABA: EQUIPES (GERAL) */}
        <TabsContent value="escala" className="mt-4">
          <Card className="rounded-2xl border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Escala Geral das Equipes ({eventMembers.length})
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Músicos e operadores técnicos escalados
                </CardDescription>
              </div>
              {canManageContent && (
                <Button
                  size="sm"
                  onClick={() => setAddMusicianModalOpen(true)}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Escalar Pessoa
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-4">
              {eventMembers.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-slate-700">Nenhuma pessoa escalada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eventMembers.map((memberScale) => {
                    const musician = memberScale.expand?.member_id?.expand?.user_id
                    const memberRecord = memberScale.expand?.member_id
                    const role = memberScale.expand?.role_id
                    const isCurrentLoggedMember = currentMember?.id === memberRecord?.id
                    const area = memberScale.team_area || 'LOUVOR'

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
                                  {musician?.name || 'Membro'}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-semibold">
                                  Área: {area}
                                </Badge>
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
                                onClick={() => handleRemoveMember(memberScale.id)}
                                aria-label="Remover da escala"
                                className="h-7 w-7 text-slate-400 hover:text-red-600 rounded-lg"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {memberScale.status === 'RECUSADO' && memberScale.decline_reason && (
                          <div className="p-2 rounded-lg bg-red-50 text-xs text-red-700">
                            <p className="font-semibold">Motivo da ausência:</p>
                            <p className="italic">"{memberScale.decline_reason}"</p>
                          </div>
                        )}

                        {/* Ações de resposta */}
                        {(isCurrentLoggedMember || canManageContent) &&
                          memberScale.status === 'PENDENTE' && (
                            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                              <Button
                                size="sm"
                                onClick={() => handleConfirmParticipation(memberScale.id)}
                                className="h-8 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold gap-1.5"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Confirmar Presença
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
        </TabsContent>

        {/* 4. ABA: SOM */}
        {canSeeSound && (
          <TabsContent value="som" className="mt-4 space-y-4">
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Volume2 className="h-5 w-5 text-sky-600" />
                    Operação de Som & Áudio
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Equipe escalada, alinhamento técnico e tarefas do som
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-sky-900 uppercase">
                    Equipe de Som Escalada
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getMembersByArea('SOM').length === 0 ? (
                      <span className="text-xs text-sky-700">Nenhum operador de som escalado.</span>
                    ) : (
                      getMembersByArea('SOM').map((m) => {
                        const u = m.expand?.member_id?.expand?.user_id
                        return (
                          <Badge key={m.id} className="bg-sky-100 text-sky-900 border-sky-300">
                            {u?.name || 'Operador'} ({m.status})
                          </Badge>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Tarefas de Som */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Checklist & Tarefas de Som</h4>
                    {(isAdmin || isLeader) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTaskArea('SOM')
                          setTaskModalOpen(true)
                        }}
                        className="text-xs rounded-xl"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Nova Tarefa de Som
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {tasks.filter((t) => t.team_area === 'SOM').length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        Nenhuma tarefa de som cadastrada para este culto.
                      </p>
                    ) : (
                      tasks
                        .filter((t) => t.team_area === 'SOM')
                        .map((task) => (
                          <div
                            key={task.id}
                            className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={task.status === 'CONCLUIDA'}
                                onChange={() => handleToggleTaskStatus(task)}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div>
                                <p
                                  className={`text-sm font-semibold ${
                                    task.status === 'CONCLUIDA'
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {task.title}
                                </p>
                                {task.description && (
                                  <p className="text-xs text-slate-500">{task.description}</p>
                                )}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {task.status}
                            </Badge>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* 5. ABA: PROJEÇÃO */}
        {canSeeProjection && (
          <TabsContent value="projecao" className="mt-4 space-y-4">
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Tv className="h-5 w-5 text-purple-600" />
                    Operação de Projeção & Telões
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Roteiro para software de projeção externa e mídias do evento
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-purple-900 uppercase">
                    Operadores de Projeção
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getMembersByArea('PROJECAO').length === 0 ? (
                      <span className="text-xs text-purple-700">
                        Nenhum operador de projeção escalado.
                      </span>
                    ) : (
                      getMembersByArea('PROJECAO').map((m) => {
                        const u = m.expand?.member_id?.expand?.user_id
                        return (
                          <Badge
                            key={m.id}
                            className="bg-purple-100 text-purple-900 border-purple-300"
                          >
                            {u?.name || 'Operador'} ({m.status})
                          </Badge>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Mídias para Projeção */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    Mídias para Baixar e Importar no Holyrics
                  </h4>
                  <div className="space-y-2">
                    {mediaList.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        Nenhuma mídia associada a este culto.
                      </p>
                    ) : (
                      mediaList.map((media) => (
                        <div
                          key={media.id}
                          className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 truncate">
                                {media.name}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {media.category}
                              </Badge>
                              <Badge
                                className={`text-[10px] ${
                                  media.status === 'IMPORTADA_HOLYRICS'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : media.status === 'BAIXADA'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {media.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Tipo: {media.media_type} • Enviado por:{' '}
                              {media.expand?.uploaded_by?.expand?.user_id?.name || 'Equipe'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadMedia(media)}
                              className="text-xs rounded-xl gap-1.5"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Baixar Mídia
                            </Button>

                            {media.status === 'ENVIADA' || media.status === 'RECEBIDA' ? (
                              <Button
                                size="sm"
                                onClick={() => handleMarkAsDownloaded(media.id)}
                                className="text-xs rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                              >
                                Marcar como Baixada
                              </Button>
                            ) : null}

                            {media.status === 'BAIXADA' ? (
                              <Button
                                size="sm"
                                onClick={() => handleMarkAsImportedHolyrics(media.id)}
                                className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Importado no Holyrics
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* 6. ABA: MÍDIAS */}
        {canSeeMedia && (
          <TabsContent value="midia" className="mt-4 space-y-4">
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-emerald-600" />
                    Mídias do Evento ({mediaList.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Vídeos de avisos, aniversariantes, artes de abertura e transmissão
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setMediaModalOpen(true)}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Enviar Mídia
                </Button>
              </CardHeader>
              <CardContent className="p-4">
                {mediaList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <FileVideo className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-700">Nenhuma mídia enviada</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      A equipe de mídia pode anexar vídeos e artes para este culto.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mediaList.map((media) => (
                      <div
                        key={media.id}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {media.name}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-semibold">
                              {media.category}
                            </Badge>
                            <Badge
                              className={`text-[10px] ${
                                media.status === 'IMPORTADA_HOLYRICS'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : media.status === 'BAIXADA'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {media.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Tipo: {media.media_type} • Operador atribuído:{' '}
                            <strong className="text-slate-700">
                              {media.expand?.assigned_operator?.expand?.user_id?.name ||
                                'A definir'}
                            </strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadMedia(media)}
                            className="text-xs rounded-xl gap-1.5"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Baixar Mídia
                          </Button>

                          {media.status === 'ENVIADA' || media.status === 'RECEBIDA' ? (
                            <Button
                              size="sm"
                              onClick={() => handleMarkAsDownloaded(media.id)}
                              className="text-xs rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Marcar como Baixada
                            </Button>
                          ) : null}

                          {media.status === 'BAIXADA' ? (
                            <Button
                              size="sm"
                              onClick={() => handleMarkAsImportedHolyrics(media.id)}
                              className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Marcar Importado no Holyrics
                            </Button>
                          ) : null}

                          {canManageContent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteMedia(media.id)}
                              className="h-8 w-8 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* 7. ABA: ILUMINAÇÃO */}
        {canSeeLighting && (
          <TabsContent value="iluminacao" className="mt-4 space-y-4">
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Sun className="h-5 w-5 text-amber-600" />
                    Operação de Iluminação & Cenas
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Equipe, momentos litúrgicos e checklist de iluminação
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-amber-900 uppercase">
                    Equipe de Iluminação Escalada
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getMembersByArea('ILUMINACAO').length === 0 ? (
                      <span className="text-xs text-amber-700">
                        Nenhum operador de iluminação escalado.
                      </span>
                    ) : (
                      getMembersByArea('ILUMINACAO').map((m) => {
                        const u = m.expand?.member_id?.expand?.user_id
                        return (
                          <Badge
                            key={m.id}
                            className="bg-amber-100 text-amber-900 border-amber-300"
                          >
                            {u?.name || 'Operador'} ({m.status})
                          </Badge>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Tarefas de Iluminação */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Tarefas de Iluminação</h4>
                    {(isAdmin || isLeader) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTaskArea('ILUMINACAO')
                          setTaskModalOpen(true)
                        }}
                        className="text-xs rounded-xl"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Nova Tarefa
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {tasks.filter((t) => t.team_area === 'ILUMINACAO').length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        Nenhuma tarefa de iluminação cadastrada.
                      </p>
                    ) : (
                      tasks
                        .filter((t) => t.team_area === 'ILUMINACAO')
                        .map((task) => (
                          <div
                            key={task.id}
                            className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={task.status === 'CONCLUIDA'}
                                onChange={() => handleToggleTaskStatus(task)}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div>
                                <p
                                  className={`text-sm font-semibold ${
                                    task.status === 'CONCLUIDA'
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {task.title}
                                </p>
                                {task.description && (
                                  <p className="text-xs text-slate-500">{task.description}</p>
                                )}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {task.status}
                            </Badge>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* 8. ABA: TAREFAS */}
        {canSeeTasks && (
          <TabsContent value="tarefas" className="mt-4 space-y-4">
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-indigo-600" />
                    Tarefas do Culto ({tasks.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Acompanhamento operacional por área
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setTaskModalOpen(true)}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nova Tarefa
                </Button>
              </CardHeader>
              <CardContent className="p-4">
                {tasks.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <ListTodo className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-700">Nenhuma tarefa pendente</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Crie checklists para as áreas de Som, Projeção, Mídia, Louvor ou Iluminação.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={task.status === 'CONCLUIDA'}
                            onChange={() => handleToggleTaskStatus(task)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-bold truncate ${
                                  task.status === 'CONCLUIDA'
                                    ? 'line-through text-slate-400'
                                    : 'text-slate-900'
                                }`}
                              >
                                {task.title}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-semibold">
                                {task.team_area}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${
                                  task.priority === 'URGENTE'
                                    ? 'bg-red-100 text-red-800'
                                    : task.priority === 'ALTA'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {task.priority}
                              </Badge>
                            </div>
                            {task.description && (
                              <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>
                            )}
                            <p className="text-[11px] text-slate-400 mt-1">
                              Responsável:{' '}
                              <strong className="text-slate-600">
                                {task.assigned_user?.name || 'Não atribuído'}
                              </strong>
                              {task.due_date && <span> • Prazo: {task.due_date.slice(0, 10)}</span>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            className={`text-xs ${
                              task.status === 'CONCLUIDA'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {task.status}
                          </Badge>
                          {canManageContent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTask(task.id)}
                              className="h-8 w-8 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* MODAL: Adicionar Música ao Repertório */}
      <Dialog open={addSongModalOpen} onOpenChange={setAddSongModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Adicionar Música ao Repertório
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Música da Biblioteca</Label>
              <Select
                value={selectedSongToAdd}
                onValueChange={(val) => {
                  setSelectedSongToAdd(val)
                  const chosen = availableSongs.find((s) => s.id === val)
                  if (chosen) setCustomKeyToAdd(chosen.key)
                }}
              >
                <SelectTrigger className="rounded-xl">
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
              <Label className="text-xs font-semibold text-slate-700">Tom para este Culto</Label>
              <Select value={customKeyToAdd} onValueChange={setCustomKeyToAdd}>
                <SelectTrigger className="rounded-xl">
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
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Observações de Arranjo</Label>
              <Input
                value={songNotesToAdd}
                onChange={(e) => setSongNotesToAdd(e.target.value)}
                placeholder="Ex: Abertura suave, espontâneo..."
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSongModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddSongToEvent}
              disabled={!selectedSongToAdd}
              className="bg-teal-700 text-white"
            >
              Adicionar ao Culto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Atribuir Pessoa / Escalar */}
      <Dialog open={addMusicianModalOpen} onOpenChange={setAddMusicianModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Atribuir Membro à Equipe
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Selecione o membro cadastrado na igreja e a área técnica ou instrumental.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Área do Evento</Label>
              <Select
                value={selectedTeamAreaToAdd}
                onValueChange={(val) => setSelectedTeamAreaToAdd(val as TeamArea)}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOUVOR">LOUVOR (Música/Banda)</SelectItem>
                  <SelectItem value="SOM">SOM (Áudio/Mesa)</SelectItem>
                  <SelectItem value="PROJECAO">PROJEÇÃO (Slides/Holyrics)</SelectItem>
                  <SelectItem value="MIDIA">MÍDIA (Comunicação/Vídeo)</SelectItem>
                  <SelectItem value="ILUMINACAO">ILUMINAÇÃO (Cênica/DMX)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Membro da Igreja</Label>
              <Select value={selectedMemberToAdd} onValueChange={setSelectedMemberToAdd}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione a pessoa..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {activeMusicians.map((m) => {
                    const u = m.expand?.user_id
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {u?.name || 'Membro'} ({u?.email})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Função / Instrumento</Label>
              <Select value={selectedRoleToAdd} onValueChange={setSelectedRoleToAdd}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione a função..." />
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
              <Label className="text-xs font-semibold text-slate-700">Observações</Label>
              <Input
                value={memberNotesToAdd}
                onChange={(e) => setMemberNotesToAdd(e.target.value)}
                placeholder="Ex: Chegada às 18h30..."
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMusicianModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddMemberToTeam}
              disabled={!selectedMemberToAdd}
              className="bg-teal-700 text-white"
            >
              Salvar Escala
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Recusa */}
      <Dialog open={declineModalOpen} onOpenChange={setDeclineModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Recusar Participação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold text-slate-700">Motivo da Ausência</Label>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Ex: Viagem, compromisso de trabalho..."
              className="rounded-xl min-h-[90px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineModalOpen(false)}>
              Voltar
            </Button>
            <Button onClick={handleDeclineSubmit} className="bg-red-600 text-white font-semibold">
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Nova Tarefa */}
      <Dialog open={taskModalOpen} onOpenChange={setTaskModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Nova Tarefa</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Crie uma demanda para uma das áreas do culto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Título da Tarefa</Label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ex: Testar pilhas dos microfones sem fio"
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Área</Label>
                <Select value={taskArea} onValueChange={(val) => setTaskArea(val as TeamArea)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOUVOR">LOUVOR</SelectItem>
                    <SelectItem value="SOM">SOM</SelectItem>
                    <SelectItem value="PROJECAO">PROJEÇÃO</SelectItem>
                    <SelectItem value="MIDIA">MÍDIA</SelectItem>
                    <SelectItem value="ILUMINACAO">ILUMINAÇÃO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Prioridade</Label>
                <Select value={taskPriority} onValueChange={(val) => setTaskPriority(val as any)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA">BAIXA</SelectItem>
                    <SelectItem value="NORMAL">NORMAL</SelectItem>
                    <SelectItem value="ALTA">ALTA</SelectItem>
                    <SelectItem value="URGENTE">URGENTE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Responsável</Label>
              <Select value={taskAssignedTo} onValueChange={setTaskAssignedTo}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Atribuir a..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="">Sem responsável</SelectItem>
                  {activeMusicians.map((m) => {
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

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Descrição / Checklist</Label>
              <Textarea
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="Detalhes da atividade..."
                className="rounded-xl min-h-[70px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!taskTitle}
              className="bg-indigo-600 text-white font-semibold"
            >
              Criar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Enviar Mídia */}
      <Dialog open={mediaModalOpen} onOpenChange={setMediaModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Enviar Mídia para o Culto
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O arquivo será associado a este evento e o operador receberá notificação interna.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Arquivo de Mídia</Label>
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
              <Label className="text-xs font-semibold text-slate-700">Nome / Título da Mídia</Label>
              <Input
                value={mediaName}
                onChange={(e) => setMediaName(e.target.value)}
                placeholder="Ex: Aniversariantes da Semana"
                className="rounded-xl"
              />
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
                Operador Responsável (Notificação)
              </Label>
              <Select value={mediaAssignedOperator} onValueChange={setMediaAssignedOperator}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione o operador (Projeção)..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="">Nenhum operador</SelectItem>
                  {activeMusicians.map((m) => {
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
            <Button variant="outline" onClick={() => setMediaModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUploadMedia}
              disabled={!mediaFile || isUploadingMedia}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isUploadingMedia ? 'Enviando...' : 'Enviar Mídia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Relatório Visual de Sincronização com o Holyrics */}
      <Dialog open={syncReportModalOpen} onOpenChange={setSyncReportModalOpen}>
        <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-50 text-purple-700">
                <Radio className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Relatório de Sincronização com Holyrics
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {event.title} • Ordem litúrgica do culto
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {syncReportSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 pb-1">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Total</span>
                <span className="text-lg font-extrabold text-slate-900">
                  {syncReportSummary.total}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-center">
                <span className="text-[10px] uppercase font-bold text-purple-700 block">
                  Criadas
                </span>
                <span className="text-lg font-extrabold text-purple-900">
                  {syncReportSummary.created}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                  Na Playlist
                </span>
                <span className="text-lg font-extrabold text-emerald-900">
                  {syncReportSummary.added + syncReportSummary.already_in_playlist}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-700 block">Erros</span>
                <span className="text-lg font-extrabold text-rose-900">
                  {syncReportSummary.errors}
                </span>
              </div>
            </div>
          )}

          {syncReportMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-medium border ${
                syncReportHasErrors
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
              }`}
            >
              {syncReportMessage}
            </div>
          )}

          <div className="overflow-y-auto flex-1 my-2 space-y-2 pr-1">
            {syncReportItems.map((item) => {
              const isSuccess = item.status === 'SUCCESS'
              return (
                <div
                  key={item.event_song_id || item.order}
                  className={`p-3 rounded-xl border flex items-start gap-3 transition-colors ${
                    isSuccess
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-rose-50/50 border-rose-200'
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${
                      isSuccess ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {isSuccess ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800">
                        {item.order}. {item.song_title}
                      </span>
                      {item.holyrics_song_id && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-semibold"
                        >
                          ID: {item.holyrics_song_id}
                        </Badge>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        isSuccess ? 'text-slate-600' : 'text-rose-700 font-medium'
                      }`}
                    >
                      {item.detail || item.error}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter className="pt-2 border-t border-slate-100">
            <Button
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs"
              onClick={() => setSyncReportModalOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
