// Avisos pelo WhatsApp: criar ou mudar um aviso (avulso), uma regra de culto ou o aviso de
// um culto específico. A arte sobe para o servidor, que guarda e manda o link à Evolution.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock, Loader2, RefreshCw, Send, Trash2, Upload, Users, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  AUDIENCE_TYPES,
  GROUP_PACE,
  MEDIA_TYPES,
  PERSON_STATUS_OPTIONS,
  TEXT_VARIABLES,
  WEEKDAYS,
  estimateEnd,
  fromLocalInput,
  isGroupAudience,
  previewText,
  serverMs,
  toLocalInput,
  whenLabel,
  type AvisoAudience,
  type AvisoMediaType,
} from '@/lib/whatsappAvisos'
import {
  avisoMediaUrl,
  countAudience,
  deleteAviso,
  getAviso,
  getAvisoOptions,
  listWaGroups,
  removeAvisoMedia,
  saveAviso,
  scheduleAviso,
  testAviso,
  uploadAvisoMedia,
  type Aviso,
  type AvisoInput,
  type AvisoOptions,
  type WaGroup,
} from '@/services/whatsappAvisos'
import { StatusBadge, errorText } from './AvisosPanel'

const PACES = [
  { value: '3-5', label: 'Devagar (3 a 5 min)', min: 3, max: 5 },
  { value: '6-10', label: 'Bem devagar (6 a 10 min)', min: 6, max: 10 },
  { value: '1-2', label: 'Normal (1 a 2 min)', min: 1, max: 2 },
]

const CONGREGATIONS = ['', 'Aldeia', 'Diamante']

const fieldClass =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600'

interface Form {
  title: string
  media_type: AvisoMediaType
  text: string
  audience: AvisoAudience
  window_start: string
  window_end: string
  pace: string
  church_event_id: string
  use_event_cover: boolean
  weekday: number
  title_match: string
  days_before: number
  send_time: string
  missing_media: 'SO_TEXTO' | 'ESPERAR'
  active: boolean
}

const EMPTY: Form = {
  title: '',
  media_type: 'TEXTO',
  text: '',
  audience: { type: 'TODOS', congregation: '', statuses: ['MEMBRO', 'CONGREGADO'] },
  window_start: '08:00',
  window_end: '20:00',
  pace: '3-5',
  church_event_id: '',
  use_event_cover: false,
  weekday: 0,
  title_match: '',
  days_before: 1,
  send_time: '10:00',
  missing_media: 'SO_TEXTO',
  active: true,
}

function formOf(a: Aviso): Form {
  const pace = PACES.find((p) => p.min === a.pace_min && p.max === a.pace_max)
  return {
    title: a.title,
    media_type: a.media_type,
    text: a.text,
    audience: a.audience?.type ? a.audience : EMPTY.audience,
    window_start: a.window_start || '08:00',
    window_end: a.window_end || '20:00',
    pace: pace ? pace.value : `${a.pace_min}-${a.pace_max}`,
    church_event_id: a.church_event_id,
    use_event_cover: a.use_event_cover,
    weekday: a.weekday,
    title_match: a.title_match,
    days_before: a.days_before,
    send_time: a.send_time || '10:00',
    missing_media: a.missing_media || 'SO_TEXTO',
    active: a.status !== 'INATIVA',
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-11 px-4 rounded-xl text-sm border ${
        selected
          ? 'border-2 border-teal-700 bg-teal-50 text-teal-900 font-semibold'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
      }`}
    >
      {children}
    </button>
  )
}

export default function AvisoEditor({ kind }: { kind: 'AVULSO' | 'REGRA_CULTO' }) {
  const { currentChurch, user } = useAuth()
  const churchId = currentChurch?.id || ''
  const { id: routeId } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [form, setForm] = useState<Form>({ ...EMPTY })
  const [loading, setLoading] = useState(!!routeId)
  const [busy, setBusy] = useState('')
  const [options, setOptions] = useState<AvisoOptions>({ groups: [], events: [], people: [] })
  const [peopleQ, setPeopleQ] = useState('')
  const [peopleFound, setPeopleFound] = useState<AvisoOptions['people']>([])
  const [chosen, setChosen] = useState<AvisoOptions['people']>([])
  const [count, setCount] = useState<{ total: number; no_phone: number } | null>(null)
  const [mode, setMode] = useState<'AGORA' | 'DATA'>('AGORA')
  const [startsAt, setStartsAt] = useState(() => toLocalInput(Date.now() + 3600 * 1000))
  const [localPreview, setLocalPreview] = useState('')
  const [waGroups, setWaGroups] = useState<WaGroup[] | null>(null)
  const [waError, setWaError] = useState('')
  const [waLoading, setWaLoading] = useState(false)
  const [waQ, setWaQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const type = aviso?.type || kind
  const isRule = type === 'REGRA_CULTO'
  const isCulto = type === 'CULTO'
  const editable =
    !aviso || ['RASCUNHO', 'PROGRAMADO', 'AGUARDANDO', 'ATIVA', 'INATIVA'].includes(aviso.status)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setAud = (patch: Partial<AvisoAudience>) =>
    setForm((f) => ({ ...f, audience: { ...f.audience, ...patch } }))

  // Carrega o aviso e as opções (grupos, eventos)
  useEffect(() => {
    if (!churchId) return
    let alive = true
    ;(async () => {
      try {
        const opts = await getAvisoOptions(churchId)
        if (!alive) return
        setOptions(opts)
        if (routeId) {
          const a = await getAviso(churchId, routeId)
          if (!alive) return
          setAviso(a)
          setForm(formOf(a))
          if (a.starts_at && a.status === 'PROGRAMADO') {
            setMode('DATA')
            setStartsAt(toLocalInput(serverMs(a.starts_at)))
          }
          if (a.audience?.type === 'PESSOAS' && a.audience.person_ids?.length) {
            const res = await getAvisoOptions(churchId, { person_ids: a.audience.person_ids })
            if (alive) setChosen(res.people)
          }
        } else {
          const evId = search.get('evento')
          const ev = evId ? opts.events.find((x) => x.id === evId) : null
          if (ev) {
            setForm((f) => ({
              ...f,
              title: `Divulgação: ${ev.title}`,
              media_type: ev.has_cover ? 'IMAGEM' : 'TEXTO',
              use_event_cover: ev.has_cover,
              church_event_id: ev.id,
              text:
                'Olá, {primeiro_nome}! 👋\nAs inscrições para **{evento}** estão abertas.\n📅 {data_evento}' +
                (ev.location ? ' · 📍 {local}' : '') +
                '\nInscreva-se pelo link: {link_inscricao}',
              audience: { ...f.audience, congregation: ev.congregation || '' },
            }))
          }
        }
      } catch (err) {
        toast({
          title: 'Erro ao abrir o aviso',
          description: errorText(err),
          variant: 'destructive',
        })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [churchId, routeId, search, toast])

  // Quantas pessoas o público alcança
  const audKey = JSON.stringify(form.audience)
  useEffect(() => {
    if (!churchId || isCulto) return
    const t = setTimeout(async () => {
      try {
        setCount(await countAudience(churchId, form.audience))
      } catch {
        setCount(null)
      }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchId, audKey, isCulto])

  // Grupos do WhatsApp: lidos do celular da igreja quando esse público é escolhido
  const toGroups = isGroupAudience(form.audience)
  const loadWaGroups = useCallback(async () => {
    if (!churchId) return
    setWaLoading(true)
    setWaError('')
    try {
      setWaGroups((await listWaGroups(churchId)).items)
    } catch (err) {
      setWaError(errorText(err))
    } finally {
      setWaLoading(false)
    }
  }, [churchId])
  useEffect(() => {
    if (toGroups && waGroups === null && !waLoading && !waError) void loadWaGroups()
  }, [toGroups, waGroups, waLoading, waError, loadWaGroups])
  const chosenGroups = form.audience.wa_groups || []
  const toggleGroup = (g: { id: string; name: string }) => {
    const on = chosenGroups.some((x) => x.id === g.id)
    setAud({
      wa_groups: on
        ? chosenGroups.filter((x) => x.id !== g.id)
        : [...chosenGroups, { id: g.id, name: g.name }],
    })
  }
  const waFiltered = useMemo(() => {
    const q = waQ.trim().toLowerCase()
    return (waGroups || []).filter((g) => !q || g.name.toLowerCase().includes(q))
  }, [waGroups, waQ])

  // Busca de pessoas
  useEffect(() => {
    if (!churchId || peopleQ.trim().length < 2) {
      setPeopleFound([])
      return
    }
    const t = setTimeout(async () => {
      try {
        setPeopleFound((await getAvisoOptions(churchId, { q: peopleQ })).people)
      } catch {
        setPeopleFound([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [churchId, peopleQ])

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    },
    [localPreview],
  )

  const pickedPace = PACES.find((p) => p.value === form.pace) || PACES[0]
  const pace = useMemo(
    () => (toGroups ? { ...pickedPace, ...GROUP_PACE } : pickedPace),
    [toGroups, pickedPace],
  )
  const selectedEvent = options.events.find((x) => x.id === form.church_event_id)

  const input = useCallback((): AvisoInput => {
    const p = PACES.find((x) => x.value === form.pace)
    const [pmin, pmax] = p ? [p.min, p.max] : form.pace.split('-').map((n) => parseInt(n, 10))
    return {
      id: aviso?.id,
      type: isRule ? 'REGRA_CULTO' : 'AVULSO',
      title: form.title,
      media_type: form.media_type,
      text: form.text,
      audience: form.audience,
      window_start: form.window_start,
      window_end: form.window_end,
      pace_min: pmin,
      pace_max: pmax,
      church_event_id: form.church_event_id,
      use_event_cover: form.use_event_cover,
      weekday: form.weekday,
      title_match: form.title_match,
      days_before: form.days_before,
      send_time: form.send_time,
      missing_media: form.missing_media,
      active: form.active,
    }
  }, [aviso?.id, form, isRule])

  const persist = async (): Promise<Aviso | null> => {
    try {
      const saved = await saveAviso(churchId, input())
      setAviso((prev) => ({ ...(prev || saved), ...saved, stats: prev?.stats }))
      if (!aviso) {
        navigate(isRule ? `/avisos/regras/${saved.id}` : `/avisos/${saved.id}`, { replace: true })
      }
      return saved
    } catch (err) {
      toast({ title: 'Não deu para salvar', description: errorText(err), variant: 'destructive' })
      return null
    }
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } finally {
      setBusy('')
    }
  }

  const handleSave = () =>
    run('save', async () => {
      const saved = await persist()
      if (saved) toast({ title: isRule ? 'Regra salva' : 'Aviso salvo' })
    })

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: 'Arquivo grande demais',
        description: 'O limite é 16 MB.',
        variant: 'destructive',
      })
      return
    }
    run('upload', async () => {
      // A arte precisa de um aviso salvo; o primeiro envio salva como rascunho
      const saved = aviso && aviso.media_type === form.media_type ? aviso : await persist()
      if (!saved) return
      try {
        const res = await uploadAvisoMedia(churchId, saved.id, file)
        setAviso((prev) =>
          prev ? { ...prev, media_name: res.media_name, media_path: res.media_path } : prev,
        )
        setLocalPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : '')
        set('use_event_cover', false)
        if (form.use_event_cover)
          await saveAviso(churchId, { ...input(), id: saved.id, use_event_cover: false })
        toast({ title: 'Arquivo enviado' })
      } catch (err) {
        toast({
          title: 'Não deu para subir o arquivo',
          description: errorText(err),
          variant: 'destructive',
        })
      }
    })
  }

  const handleRemoveFile = () =>
    run('upload', async () => {
      if (!aviso) return
      try {
        await removeAvisoMedia(churchId, aviso.id)
        setAviso({ ...aviso, media_name: '', media_path: '' })
        setLocalPreview('')
      } catch (err) {
        toast({
          title: 'Não deu para tirar o arquivo',
          description: errorText(err),
          variant: 'destructive',
        })
      }
    })

  const handleTest = () =>
    run('test', async () => {
      const saved = await persist()
      if (!saved) return
      try {
        const res = await testAviso(churchId, saved.id)
        toast({
          title: 'Teste na fila',
          description: `Vai chegar em até 1 minuto no celular terminado em ${res.phone_end}.`,
        })
      } catch (err) {
        toast({ title: 'Não deu para testar', description: errorText(err), variant: 'destructive' })
      }
    })

  const handleSchedule = () =>
    run('schedule', async () => {
      const saved = await persist()
      if (!saved) return
      const iso = mode === 'DATA' ? fromLocalInput(startsAt) : undefined
      confirm({
        title: mode === 'AGORA' ? 'Começar o envio agora?' : 'Programar o envio?',
        description: toGroups
          ? `O aviso vai para ${count?.total ?? 'os'} ${count?.total === 1 ? 'grupo' : 'grupos'} do WhatsApp, um a cada ${pace.min} a ${pace.max} minutos, das ${form.window_start} às ${form.window_end}.`
          : `${count?.total ?? 'As'} pessoas vão receber este aviso pelo WhatsApp, uma a cada ${pace.min} a ${pace.max} minutos, das ${form.window_start} às ${form.window_end}.`,
        confirmLabel: mode === 'AGORA' ? 'Começar' : 'Programar',
        onConfirm: async () => {
          try {
            await scheduleAviso(churchId, saved.id, mode, iso)
            toast({ title: mode === 'AGORA' ? 'Envio começando' : 'Envio programado' })
            navigate('/avisos')
          } catch (err) {
            toast({
              title: 'Não deu para programar',
              description: errorText(err),
              variant: 'destructive',
            })
          }
        },
      })
    })

  const handleDelete = () => {
    if (!aviso) return
    confirm({
      title: isRule ? 'Excluir esta regra?' : 'Excluir este aviso?',
      description: 'Isso não pode ser desfeito.',
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteAviso(churchId, aviso.id)
          navigate(isRule ? '/avisos/cultos' : '/avisos')
        } catch (err) {
          toast({
            title: 'Não deu para excluir',
            description: errorText(err),
            variant: 'destructive',
          })
        }
      },
    })
  }

  const sample = useMemo(() => {
    const first = (user?.name || 'Ana').split(' ')[0]
    return {
      primeiro_nome: toGroups ? '' : first,
      nome: toGroups ? '' : user?.name || 'Ana Souza',
      igreja: currentChurch?.name || 'Igreja',
      culto: 'Culto de Domingo',
      data: '08/11',
      hora: '18:00',
      evento: selectedEvent?.title || 'Evento',
      data_evento: selectedEvent?.starts_on
        ? `${selectedEvent.starts_on.slice(8, 10)}/${selectedEvent.starts_on.slice(5, 7)}`
        : '20/11',
      local: selectedEvent?.location || 'Local',
      link_inscricao: `${window.location.origin}/inscricao/…`,
    }
  }, [user?.name, currentChurch?.name, selectedEvent, toGroups])

  const estimate = useMemo(() => {
    const start = mode === 'DATA' ? serverMs(fromLocalInput(startsAt)) || Date.now() : Date.now()
    return estimateEnd(start, count?.total || 0, {
      windowStart: form.window_start,
      windowEnd: form.window_end,
      paceMin: pace.min,
      paceMax: pace.max,
    })
  }, [count?.total, form.window_start, form.window_end, pace, mode, startsAt])

  const mediaInfo = MEDIA_TYPES.find((m) => m.value === form.media_type) || MEDIA_TYPES[0]
  const hasFile = !!aviso?.media_name
  const coverUrl = form.use_event_cover && aviso?.media_path ? avisoMediaUrl(aviso.media_path) : ''
  const imageUrl =
    form.media_type === 'IMAGEM'
      ? localPreview || (hasFile || coverUrl ? avisoMediaUrl(aviso?.media_path || '') : '')
      : ''
  const backTo = isRule || isCulto ? '/avisos/cultos' : '/avisos'
  const variables = TEXT_VARIABLES.filter(
    (v) =>
      v.scope === 'sempre' ||
      (v.scope === 'culto' && (isRule || isCulto)) ||
      (v.scope === 'evento' && !!form.church_event_id),
  )

  const insertVar = (key: string) => set('text', `${form.text}{${key}}`)

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24">
      {confirmDialog}
      <div className="space-y-2">
        <Link
          to={backTo}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {isRule || isCulto ? 'Avisos dos cultos' : 'Avisos'}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {isRule
              ? aviso
                ? 'Regra de aviso do culto'
                : 'Nova regra para um tipo de culto'
              : isCulto
                ? aviso?.title
                : aviso
                  ? 'Aviso'
                  : 'Novo aviso'}
          </h1>
          {aviso && <StatusBadge status={aviso.status} />}
        </div>
        {!editable && (
          <p className="text-sm text-slate-600">
            Este aviso já saiu.{' '}
            <Link to={`/avisos/${aviso?.id}/envio`} className="text-teal-700 font-semibold">
              Ver quem recebeu
            </Link>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <fieldset disabled={!editable || !!busy} className="flex-[999_1_560px] min-w-0 space-y-5">
          <Section title="1. O que vai ser enviado">
            {!isCulto && (
              <div className="space-y-1.5">
                <label htmlFor="aviso-title" className="text-sm font-semibold text-slate-800">
                  {isRule ? 'Nome da regra' : 'Nome do aviso (só a equipe vê)'}
                </label>
                <Input
                  id="aviso-title"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder={isRule ? 'Ex.: Culto de Domingo' : 'Ex.: Inscrições do retiro'}
                  className="rounded-xl min-h-11"
                />
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800" id="aviso-type">
                Tipo
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="aviso-type">
                {MEDIA_TYPES.map((m) => (
                  <Choice
                    key={m.value}
                    selected={form.media_type === m.value}
                    onClick={() => set('media_type', m.value)}
                  >
                    {m.label}
                  </Choice>
                ))}
              </div>
            </div>
            {form.media_type !== 'TEXTO' && (
              <div className="rounded-2xl border border-dashed border-slate-400 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="h-20 w-20 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center overflow-hidden shrink-0">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Arte do aviso"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Upload className="h-6 w-6" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {hasFile
                        ? aviso?.media_name.replace(/_[a-z0-9]{10}(\.[a-z0-9]+)$/i, '$1')
                        : form.use_event_cover
                          ? 'Capa do evento'
                          : isRule
                            ? 'Arte fixa (opcional): a mídia pode subir uma arte para cada culto'
                            : 'Nenhum arquivo ainda'}
                    </p>
                    <p className="text-xs text-slate-600">{mediaInfo.hint}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl gap-1.5 min-h-11"
                      onClick={() => fileRef.current?.click()}
                    >
                      {busy === 'upload' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {hasFile ? 'Trocar arquivo' : 'Escolher arquivo'}
                    </Button>
                    {hasFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-xl min-h-11"
                        aria-label="Tirar arquivo"
                        onClick={handleRemoveFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={mediaInfo.accept}
                    className="hidden"
                    onChange={(e) => {
                      handleFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
                {form.media_type === 'IMAGEM' && selectedEvent?.has_cover && !hasFile && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Switch
                      checked={form.use_event_cover}
                      onCheckedChange={(v) => set('use_event_cover', v)}
                    />
                    Usar a capa do evento como arte
                  </label>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="aviso-text" className="text-sm font-semibold text-slate-800">
                {form.media_type === 'TEXTO' ? 'Texto' : 'Texto (opcional, vai como legenda)'}
              </label>
              <Textarea
                id="aviso-text"
                rows={6}
                value={form.text}
                onChange={(e) => set('text', e.target.value)}
                className="rounded-xl"
                placeholder="Olá, {primeiro_nome}! ..."
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-600">Inserir:</span>
                {variables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    className="text-xs min-h-8 px-2.5 rounded-full border border-slate-300 bg-white text-slate-700 hover:border-teal-600"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-600">
                Para negrito use **texto**.{' '}
                {toGroups
                  ? 'Nos grupos não vai nome de pessoa: {nome} e {primeiro_nome} ficam de fora.'
                  : 'Cada pessoa recebe com o próprio nome.'}
              </p>
            </div>
            {!isRule && !isCulto && (
              <div className="space-y-1.5">
                <label htmlFor="aviso-event" className="text-sm font-semibold text-slate-800">
                  Evento ligado (opcional: libera nome, data, local e link de inscrição)
                </label>
                <select
                  id="aviso-event"
                  className={fieldClass}
                  value={form.church_event_id}
                  onChange={(e) => {
                    set('church_event_id', e.target.value)
                    if (!e.target.value) set('use_event_cover', false)
                  }}
                >
                  <option value="">Nenhum</option>
                  {options.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} · {ev.starts_on.slice(8, 10)}/{ev.starts_on.slice(5, 7)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Section>

          {!isCulto && (
            <Section title="2. Para quem">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
                {AUDIENCE_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className={`flex items-center gap-2.5 min-h-12 px-3.5 rounded-xl border text-sm cursor-pointer ${
                      form.audience.type === t.value
                        ? 'border-2 border-teal-700 bg-teal-50 font-semibold text-teal-900'
                        : 'border-slate-300 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="aud"
                      checked={form.audience.type === t.value}
                      onChange={() => setAud({ type: t.value })}
                    />
                    {t.label}
                  </label>
                ))}
              </div>

              {form.audience.type === 'TODOS' && (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {PERSON_STATUS_OPTIONS.map((s) => {
                    const list = form.audience.statuses || []
                    const on = list.includes(s.value)
                    return (
                      <label key={s.value} className="flex items-center gap-2 text-sm min-h-11">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setAud({
                              statuses: on ? list.filter((x) => x !== s.value) : [...list, s.value],
                            })
                          }
                        />
                        {s.label}
                      </label>
                    )
                  })}
                </div>
              )}
              {form.audience.type === 'GRUPO' && (
                <div className="space-y-1.5">
                  <label htmlFor="aud-group" className="text-sm font-semibold text-slate-800">
                    Ministério ou grupo
                  </label>
                  <select
                    id="aud-group"
                    className={fieldClass}
                    value={form.audience.group_id || ''}
                    onChange={(e) => setAud({ group_id: e.target.value })}
                  >
                    <option value="">Escolha…</option>
                    {options.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.audience.type === 'EVENTO' && (
                <div className="space-y-1.5">
                  <label htmlFor="aud-event" className="text-sm font-semibold text-slate-800">
                    Evento
                  </label>
                  <select
                    id="aud-event"
                    className={fieldClass}
                    value={form.audience.event_id || ''}
                    onChange={(e) => setAud({ event_id: e.target.value })}
                  >
                    <option value="">Escolha…</option>
                    {options.events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} · {ev.starts_on.slice(8, 10)}/{ev.starts_on.slice(5, 7)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.audience.type === 'PESSOAS' && (
                <div className="space-y-2">
                  <label htmlFor="aud-q" className="text-sm font-semibold text-slate-800">
                    Buscar pessoa
                  </label>
                  <Input
                    id="aud-q"
                    value={peopleQ}
                    onChange={(e) => setPeopleQ(e.target.value)}
                    placeholder="Digite parte do nome"
                    className="rounded-xl min-h-11"
                  />
                  {peopleFound.length > 0 && (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-auto">
                      {peopleFound.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 min-h-11 text-sm hover:bg-slate-50 flex justify-between items-center"
                          onClick={() => {
                            if (!chosen.some((c) => c.id === p.id)) {
                              const next = [...chosen, p]
                              setChosen(next)
                              setAud({ person_ids: next.map((c) => c.id) })
                            }
                            setPeopleQ('')
                          }}
                        >
                          {p.name}
                          {!p.has_phone && (
                            <span className="text-xs text-amber-700">sem celular</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {chosen.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 text-sm bg-slate-100 rounded-full pl-3 pr-1 py-1"
                      >
                        {p.name}
                        <button
                          type="button"
                          aria-label={`Tirar ${p.name}`}
                          className="h-7 w-7 rounded-full hover:bg-slate-200 flex items-center justify-center"
                          onClick={() => {
                            const next = chosen.filter((c) => c.id !== p.id)
                            setChosen(next)
                            setAud({ person_ids: next.map((c) => c.id) })
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {toGroups && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">
                    Sai uma mensagem em cada grupo escolhido. O número da igreja precisa estar no
                    grupo e, se só administradores podem mandar mensagem, precisa ser administrador.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Buscar grupo"
                      value={waQ}
                      onChange={(e) => setWaQ(e.target.value)}
                      placeholder="Buscar grupo pelo nome"
                      className="rounded-xl min-h-11"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 rounded-xl shrink-0"
                      disabled={waLoading}
                      onClick={() => void loadWaGroups()}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1.5 ${waLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                  {waError && (
                    <p className="text-sm text-red-700" role="alert">
                      {waError}
                    </p>
                  )}
                  {waLoading && waGroups === null && (
                    <p className="text-sm text-slate-600 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Lendo os grupos do WhatsApp…
                    </p>
                  )}
                  {waGroups !== null && waGroups.length === 0 && !waError && (
                    <p className="text-sm text-slate-600">
                      O número da igreja não está em nenhum grupo.
                    </p>
                  )}
                  {waFiltered.length > 0 && (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-auto">
                      {waFiltered.map((g) => {
                        const on = chosenGroups.some((x) => x.id === g.id)
                        return (
                          <label
                            key={g.id}
                            className="flex items-center gap-3 px-3 min-h-12 text-sm cursor-pointer hover:bg-slate-50"
                          >
                            <input type="checkbox" checked={on} onChange={() => toggleGroup(g)} />
                            <span className="flex-1 min-w-0">
                              <span className="block truncate font-medium text-slate-900">
                                {g.name}
                              </span>
                              <span className="block text-xs text-slate-600">
                                {g.size > 0 ? `${g.size} participantes` : 'Grupo'}
                                {g.only_admins && ' · só administradores mandam mensagem'}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {chosenGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {chosenGroups.map((g) => (
                        <span
                          key={g.id}
                          className="inline-flex items-center gap-1 text-sm bg-teal-50 text-teal-900 rounded-full pl-3 pr-1 py-1"
                        >
                          <Users className="h-3.5 w-3.5" />
                          {g.name}
                          <button
                            type="button"
                            aria-label={`Tirar ${g.name}`}
                            className="h-7 w-7 rounded-full hover:bg-teal-100 flex items-center justify-center"
                            onClick={() => toggleGroup(g)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {form.audience.type !== 'EVENTO' && form.audience.type !== 'PESSOAS' && !toGroups && (
                <div className="space-y-1.5 max-w-xs">
                  <label htmlFor="aud-cong" className="text-sm font-semibold text-slate-800">
                    Congregação
                  </label>
                  <select
                    id="aud-cong"
                    className={fieldClass}
                    value={form.audience.congregation || ''}
                    onChange={(e) => setAud({ congregation: e.target.value })}
                  >
                    {CONGREGATIONS.map((c) => (
                      <option key={c} value={c}>
                        {c || 'Aldeia e Diamante'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-sm text-slate-700">
                {toGroups ? (
                  <>
                    <strong>
                      {chosenGroups.length} {chosenGroups.length === 1 ? 'grupo' : 'grupos'}
                    </strong>{' '}
                    {chosenGroups.length === 1 ? 'escolhido' : 'escolhidos'} · 1 mensagem por grupo
                  </>
                ) : count ? (
                  <>
                    <strong>{count.total} pessoas</strong> com celular cadastrado
                    {count.no_phone > 0 && ` · ${count.no_phone} sem celular ficam de fora`}
                  </>
                ) : (
                  'Contando…'
                )}
              </p>
            </Section>
          )}

          <Section title={isRule ? '3. Quando sai, para cada culto' : '3. Quando e em que ritmo'}>
            {isRule && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="r-wd" className="text-sm font-semibold text-slate-800">
                    Dia do culto
                  </label>
                  <select
                    id="r-wd"
                    className={fieldClass}
                    value={form.weekday}
                    onChange={(e) => set('weekday', parseInt(e.target.value, 10))}
                  >
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="r-match" className="text-sm font-semibold text-slate-800">
                    Nome do culto contém (opcional)
                  </label>
                  <Input
                    id="r-match"
                    value={form.title_match}
                    onChange={(e) => set('title_match', e.target.value)}
                    placeholder="Ex.: Oração"
                    className="rounded-xl min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="r-days" className="text-sm font-semibold text-slate-800">
                    Mandar
                  </label>
                  <select
                    id="r-days"
                    className={fieldClass}
                    value={form.days_before}
                    onChange={(e) => set('days_before', parseInt(e.target.value, 10))}
                  >
                    <option value={0}>No dia do culto</option>
                    <option value={1}>Na véspera</option>
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} dias antes
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="r-time" className="text-sm font-semibold text-slate-800">
                    Às
                  </label>
                  <Input
                    id="r-time"
                    type="time"
                    value={form.send_time}
                    onChange={(e) => set('send_time', e.target.value)}
                    className="rounded-xl min-h-11"
                  />
                </div>
                {form.media_type !== 'TEXTO' && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="r-missing" className="text-sm font-semibold text-slate-800">
                      Se a mídia não subir a arte da semana
                    </label>
                    <select
                      id="r-missing"
                      className={fieldClass}
                      value={form.missing_media}
                      onChange={(e) =>
                        set('missing_media', e.target.value as Form['missing_media'])
                      }
                    >
                      <option value="SO_TEXTO">Manda só o texto</option>
                      <option value="ESPERAR">
                        Espera a arte (sai quando subir, até o dia do culto)
                      </option>
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-800 min-h-11">
                  <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
                  Regra ligada
                </label>
              </div>
            )}
            {!isRule && !isCulto && (
              <div className="flex flex-wrap gap-2">
                <Choice selected={mode === 'AGORA'} onClick={() => setMode('AGORA')}>
                  Começar agora
                </Choice>
                <Choice selected={mode === 'DATA'} onClick={() => setMode('DATA')}>
                  Dia e hora
                </Choice>
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {!isRule && !isCulto && mode === 'DATA' && (
                <div className="space-y-1.5 col-span-2 lg:col-span-1">
                  <label htmlFor="a-start" className="text-sm font-semibold text-slate-800">
                    Começa em
                  </label>
                  <Input
                    id="a-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="rounded-xl min-h-11"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="a-ws" className="text-sm font-semibold text-slate-800">
                  Enviar das
                </label>
                <Input
                  id="a-ws"
                  type="time"
                  value={form.window_start}
                  onChange={(e) => set('window_start', e.target.value)}
                  className="rounded-xl min-h-11"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="a-we" className="text-sm font-semibold text-slate-800">
                  até
                </label>
                <Input
                  id="a-we"
                  type="time"
                  value={form.window_end}
                  onChange={(e) => set('window_end', e.target.value)}
                  className="rounded-xl min-h-11"
                />
              </div>
              <div className="space-y-1.5 col-span-2 lg:col-span-1">
                <label htmlFor="a-pace" className="text-sm font-semibold text-slate-800">
                  Ritmo
                </label>
                <select
                  id="a-pace"
                  className={fieldClass}
                  value={toGroups ? '1-2' : form.pace}
                  disabled={toGroups}
                  title={toGroups ? 'Nos grupos sai um a cada 1 a 2 minutos' : undefined}
                  onChange={(e) => set('pace', e.target.value)}
                >
                  {PACES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!isCulto && count && count.total > 0 && (
              <div className="flex gap-3 items-start bg-teal-50 rounded-xl p-3.5">
                <Clock className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-teal-950">
                  {toGroups
                    ? `${count.total} ${count.total === 1 ? 'grupo' : 'grupos'}, um a cada ${pace.min} a ${pace.max} minutos.`
                    : `${count.total} mensagens, uma a cada ${pace.min} a ${pace.max} minutos, em horários um pouco diferentes para parecer envio manual.`}{' '}
                  {isRule ? (
                    <>
                      Cada culto leva umas{' '}
                      {Math.round((count.total * (pace.min + pace.max)) / 2 / 60) || 1} hora(s) para
                      todos receberem.
                    </>
                  ) : (
                    <strong>
                      Termina {whenLabel(estimate.end)}
                      {estimate.days > 1 ? ` (${estimate.days} dias)` : ''}.
                    </strong>
                  )}{' '}
                  Fora da janela, o restante sai no dia seguinte a partir das {form.window_start}.
                </p>
              </div>
            )}
          </Section>

          {editable && (
            <div className="flex flex-wrap gap-2 justify-end">
              {aviso && ((isRule && aviso.status !== 'ATIVA') || aviso.status === 'RASCUNHO') && (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl gap-1.5 text-red-700 mr-auto min-h-11"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="rounded-xl min-h-11"
                onClick={handleSave}
              >
                {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {isRule ? 'Salvar regra' : isCulto ? 'Salvar' : 'Salvar como rascunho'}
              </Button>
              {!isRule && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl min-h-11"
                  onClick={handleTest}
                >
                  {busy === 'test' && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  Mandar teste para mim
                </Button>
              )}
              {!isRule && !isCulto && (
                <Button
                  type="button"
                  className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white gap-1.5 min-h-11"
                  onClick={handleSchedule}
                >
                  {busy === 'schedule' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {mode === 'AGORA' ? 'Começar envio' : 'Programar envio'}
                </Button>
              )}
            </div>
          )}
        </fieldset>

        <aside aria-label="Prévia no WhatsApp" className="flex-[1_1_320px] max-w-[380px] space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            {toGroups ? 'Como vai aparecer no grupo' : 'Como a pessoa vai receber'}
          </p>
          <div className="rounded-[28px] border-[10px] border-slate-800 bg-[#EFE7DD] min-h-[480px] overflow-hidden">
            <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                {(currentChurch?.name || 'IG').slice(0, 2).toUpperCase()}
              </div>
              <span className="font-semibold text-sm truncate">{currentChurch?.name}</span>
            </div>
            <div className="p-3">
              <div className="max-w-[88%] bg-white rounded-lg p-1.5 shadow-sm space-y-1.5">
                {form.media_type === 'IMAGEM' &&
                  (imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="rounded-md w-full object-cover max-h-72"
                    />
                  ) : (
                    <div className="h-40 rounded-md bg-teal-50 text-teal-800 text-xs flex items-center justify-center">
                      [imagem]
                    </div>
                  ))}
                {(form.media_type === 'VIDEO' ||
                  form.media_type === 'DOCUMENTO' ||
                  form.media_type === 'AUDIO') && (
                  <div className="rounded-md bg-slate-100 text-slate-700 text-xs p-3 flex items-center gap-2">
                    {MEDIA_TYPES.find((m) => m.value === form.media_type)?.label}
                    {hasFile
                      ? `: ${aviso?.media_name.replace(/_[a-z0-9]{10}(\.[a-z0-9]+)$/i, '$1')}`
                      : ''}
                  </div>
                )}
                {form.text.trim() && (
                  <p className="text-sm whitespace-pre-line px-1.5 pb-1 text-slate-900 break-words">
                    {previewText(form.text, sample)
                      .split(/(\*[^*\n]+\*)/g)
                      .map((part, i) =>
                        /^\*[^*\n]+\*$/.test(part) ? (
                          <strong key={i}>{part.slice(1, -1)}</strong>
                        ) : (
                          part
                        ),
                      )}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 text-right px-1.5">
                  {isRule ? form.send_time : '08:03'}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
