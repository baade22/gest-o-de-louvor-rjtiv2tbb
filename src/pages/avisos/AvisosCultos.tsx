// Avisos dos cultos: cada culto da agenda que combina com uma regra vira um aviso automático.
// A mídia só sobe a arte (ou o vídeo) da semana; sem arte, a regra diz se vai só o texto ou
// se espera. As regras ficam embaixo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus, Upload } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { MEDIA_TYPES, WEEKDAYS, mediaSummary, serverMs, whenLabel } from '@/lib/whatsappAvisos'
import {
  avisoMediaUrl,
  getAvisosOverview,
  getWeek,
  openOccurrence,
  saveAviso,
  skipAviso,
  uploadAvisoMedia,
  type Aviso,
  type WeekItem,
} from '@/services/whatsappAvisos'
import { MediaIcon, StatusBadge, errorText } from './AvisosPanel'

const DAY = 24 * 3600 * 1000

/** Segunda-feira da semana de `ms`, como YYYY-MM-DD (horário de Brasília). */
function weekStart(ms: number): string {
  const b = new Date(ms - 3 * 3600 * 1000)
  const d = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
  const wd = (b.getUTCDay() + 6) % 7
  return new Date(d - wd * DAY).toISOString().slice(0, 10)
}

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

function ruleInput(r: Aviso, active: boolean) {
  return {
    id: r.id,
    type: 'REGRA_CULTO' as const,
    title: r.title,
    media_type: r.media_type,
    text: r.text,
    audience: r.audience,
    window_start: r.window_start,
    window_end: r.window_end,
    pace_min: r.pace_min,
    pace_max: r.pace_max,
    church_event_id: r.church_event_id,
    weekday: r.weekday,
    title_match: r.title_match,
    days_before: r.days_before,
    send_time: r.send_time,
    missing_media: r.missing_media,
    active,
  }
}

function itemState(it: WeekItem): { label: string; tone: 'ok' | 'warn' | 'done' | 'off' } {
  const o = it.occurrence
  if (o?.status === 'CANCELADO') return { label: 'Não vai sair', tone: 'off' }
  if (o && ['ENVIANDO', 'PAUSADO'].includes(o.status)) return { label: 'Enviando', tone: 'done' }
  if (o?.status === 'CONCLUIDO') return { label: 'Enviado', tone: 'done' }
  if (it.rule && it.rule.media_type !== 'TEXTO' && !it.has_media)
    return {
      label: it.rule.media_type === 'VIDEO' ? 'Falta o vídeo' : 'Falta a arte',
      tone: 'warn',
    }
  return { label: 'Pronto', tone: 'ok' }
}

const TONE: Record<string, string> = {
  ok: 'bg-sky-50 text-sky-800 border-sky-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-300',
  done: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  off: 'bg-slate-100 text-slate-600 border-slate-200',
}

function CultoCard({
  it,
  canEdit,
  canSend,
  onChanged,
}: {
  it: WeekItem
  canEdit: boolean
  canSend: boolean
  onChanged: () => void
}) {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id || ''
  const { toast } = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const rule = it.rule
  const occ = it.occurrence
  const state = itemState(it)
  const open = !occ || ['AGUARDANDO', 'PROGRAMADO'].includes(occ.status)
  const media = MEDIA_TYPES.find((m) => m.value === rule?.media_type)
  const src = occ?.media_path || rule?.media_path || ''
  const showImage = rule?.media_type === 'IMAGEM' && it.has_media && src

  const upload = async (file?: File) => {
    if (!file || !rule) return
    setBusy(true)
    try {
      const o = occ || (await openOccurrence(churchId, rule.id, it.event.id))
      await uploadAvisoMedia(churchId, o.id, file)
      toast({ title: 'Arte enviada', description: 'Vai junto no aviso deste culto.' })
      onChanged()
    } catch (err) {
      toast({ title: 'Não deu para subir', description: errorText(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    if (!rule) return
    setBusy(true)
    try {
      const o = occ || (await openOccurrence(churchId, rule.id, it.event.id))
      await skipAviso(churchId, o.id)
      onChanged()
    } catch (err) {
      toast({ title: 'Não deu', description: errorText(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const editText = async () => {
    if (!rule) return
    try {
      const o = occ || (await openOccurrence(churchId, rule.id, it.event.id))
      navigate(`/avisos/${o.id}`)
    } catch (err) {
      toast({ title: 'Não deu', description: errorText(err), variant: 'destructive' })
    }
  }

  return (
    <article
      className={`bg-white rounded-2xl p-4 flex flex-col gap-3 border ${
        state.tone === 'warn' && open ? 'border-2 border-amber-400' : 'border-slate-200'
      }`}
    >
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0">
          <p className="text-xs text-slate-600">
            {WEEKDAYS[new Date(it.event.date + 'T12:00:00Z').getUTCDay()]} {dm(it.event.date)}
            {it.event.start_time ? ` · ${it.event.start_time}` : ''}
          </p>
          <h2 className="font-bold text-slate-900 truncate">{it.event.title}</h2>
        </div>
        {rule && (
          <span
            className={`text-xs font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${TONE[state.tone]}`}
          >
            {state.label}
          </span>
        )}
      </div>

      {!rule ? (
        <p className="text-sm text-slate-600">Nenhuma regra de aviso para este culto.</p>
      ) : (
        <>
          {showImage ? (
            <img
              src={avisoMediaUrl(src)}
              alt={`Arte de ${it.event.title}`}
              className="h-40 w-full object-cover rounded-xl"
            />
          ) : rule.media_type !== 'TEXTO' && open && canEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="h-40 rounded-xl border border-dashed border-slate-400 bg-slate-50 text-slate-700 text-sm flex flex-col items-center justify-center gap-1.5 hover:border-teal-600"
            >
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Upload className="h-6 w-6" aria-hidden="true" />
              )}
              {it.has_media
                ? `Trocar ${media?.label.toLowerCase()}`
                : `Subir ${media?.label.toLowerCase()}`}
            </button>
          ) : (
            <div className="h-24 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center gap-2 text-sm">
              <MediaIcon type={rule.media_type} className="h-5 w-5" />
              {mediaSummary(rule.media_type, !!rule.text.trim())}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={media?.accept}
            className="hidden"
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <p className="text-sm text-slate-700">
            {occ && !open
              ? occ.note ||
                (occ.status === 'CONCLUIDO'
                  ? `Saiu ${whenLabel(serverMs(occ.started_at))} · ${occ.stats?.enviado ?? 0} de ${occ.total} enviadas`
                  : `${occ.stats?.enviado ?? 0} de ${occ.total} enviadas`)
              : `Sai ${whenLabel(serverMs(it.send_at))}` +
                (rule.media_type !== 'TEXTO' && !it.has_media
                  ? rule.missing_media === 'ESPERAR'
                    ? ' · espera a arte'
                    : ' · sem arte, vai só o texto'
                  : '')}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {occ && !open && occ.total > 0 && (
              <Link
                to={`/avisos/${occ.id}/envio`}
                className="text-sm font-semibold text-teal-700 min-h-11 inline-flex items-center"
              >
                Ver envio
              </Link>
            )}
            {open && canEdit && (
              <button
                type="button"
                onClick={editText}
                className="text-sm font-semibold text-teal-700 min-h-11"
              >
                Editar texto
              </button>
            )}
            {open && rule.media_type !== 'TEXTO' && it.has_media && canEdit && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-sm font-semibold text-teal-700 min-h-11"
              >
                Trocar arte
              </button>
            )}
            {open && canSend && (
              <button
                type="button"
                onClick={skip}
                className="text-sm font-semibold text-slate-600 min-h-11"
              >
                Não enviar esta semana
              </button>
            )}
          </div>
        </>
      )}
    </article>
  )
}

export default function AvisosCultos() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id || ''
  const { toast } = useToast()
  const [start, setStart] = useState(() => weekStart(Date.now()))
  const [items, setItems] = useState<WeekItem[]>([])
  const [rules, setRules] = useState<Aviso[]>([])
  const [perm, setPerm] = useState({ novo: false, alterar: false, excluir: false, enviar: false })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!churchId) return
    try {
      const [week, ov] = await Promise.all([getWeek(churchId, start), getAvisosOverview(churchId)])
      setItems(week.items)
      setRules(ov.items.filter((a) => a.type === 'REGRA_CULTO'))
      setPerm(ov.can)
    } catch (err) {
      toast({
        title: 'Erro ao abrir os avisos dos cultos',
        description: errorText(err),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [churchId, start, toast])

  useEffect(() => {
    load()
  }, [load])

  const shift = (days: number) =>
    setStart(
      new Date(new Date(start + 'T00:00:00Z').getTime() + days * DAY).toISOString().slice(0, 10),
    )
  const end = new Date(new Date(start + 'T00:00:00Z').getTime() + 6 * DAY)
    .toISOString()
    .slice(0, 10)

  const toggle = async (r: Aviso, active: boolean) => {
    try {
      await saveAviso(churchId, ruleInput(r, active))
      load()
    } catch (err) {
      toast({
        title: 'Não deu para mudar a regra',
        description: errorText(err),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Link
            to="/avisos"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Avisos
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Avisos dos cultos
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Cada culto da agenda vira um aviso automático. A mídia só sobe a arte ou o vídeo da
            semana.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl h-11 w-11"
            aria-label="Semana anterior"
            onClick={() => shift(-7)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[150px] text-center">
            {dm(start)} a {dm(end)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl h-11 w-11"
            aria-label="Próxima semana"
            onClick={() => shift(7)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <p className="text-sm text-slate-600 bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
              Nenhum culto na agenda nesta semana.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((it) => (
                <CultoCard
                  key={it.event.id + (it.rule?.id || '')}
                  it={it}
                  canEdit={perm.novo || perm.alterar}
                  canSend={perm.enviar}
                  onChanged={load}
                />
              ))}
            </div>
          )}

          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Regras dos avisos automáticos</h2>
              {perm.novo && (
                <Button variant="outline" className="rounded-xl gap-1.5" asChild>
                  <Link to="/avisos/regras/nova">
                    <Plus className="h-4 w-4" /> Nova regra para um tipo de culto
                  </Link>
                </Button>
              )}
            </div>
            {rules.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nenhuma regra ainda. Crie uma, por exemplo: Culto de Domingo, na véspera às 10:00,
                com a arte da semana.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Link
                      to={`/avisos/regras/${r.id}`}
                      className="flex-[1_1_200px] font-semibold text-slate-900 hover:text-teal-800"
                    >
                      {r.title}
                    </Link>
                    <span className="flex-[1_1_200px] text-sm text-slate-700">
                      {WEEKDAYS[r.weekday]}
                      {r.title_match ? ` ("${r.title_match}")` : ''} ·{' '}
                      {r.days_before === 0
                        ? 'no dia'
                        : r.days_before === 1
                          ? 'na véspera'
                          : `${r.days_before} dias antes`}{' '}
                      às {r.send_time}
                    </span>
                    <span className="flex-[1_1_160px] text-sm text-slate-700">
                      {mediaSummary(r.media_type, !!r.text.trim())}
                    </span>
                    <StatusBadge status={r.status} />
                    {perm.alterar && (
                      <label className="flex items-center gap-2 text-sm min-h-11">
                        <Switch
                          checked={r.status === 'ATIVA'}
                          onCheckedChange={(v) => toggle(r, v)}
                          aria-label={`Ligar ${r.title}`}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
