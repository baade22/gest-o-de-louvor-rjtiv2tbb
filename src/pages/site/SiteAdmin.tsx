// Painel "Site e App" (migração 0098): o que aparece no site público da igreja (/igreja), que
// também vira app na tela de início do celular. Só conteúdo público: nada de dado de membro.
// Chaves: admin.site.ver (consultar) e admin.site.alterar (mudar).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { cn } from '@/lib/utils'
import {
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  SECTION_LABELS,
  WEEKDAYS,
  cleanServiceTimes,
  sections as withDefaults,
  slugify,
  type ServiceTime,
  type SiteSections,
} from '@/lib/site'
import {
  deleteHighlight,
  deleteNotice,
  deletePage,
  getSiteOptions,
  getSiteSettings,
  highlightImageUrl,
  listHighlights,
  listNotices,
  listPages,
  saveHighlight,
  saveNotice,
  savePage,
  saveSiteSettings,
  setEventOnSite,
  siteSettingsFileUrl,
  type SiteHighlight,
  type SiteNotice,
  type SiteOptions,
  type SitePage,
  type SiteSettings,
} from '@/services/site'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { publicOrigin } from '@/lib/publicOrigin'
import { Box, Field } from './siteAdminParts'
import HymnsTab from './SiteAdminHymns'

const day10 = (s?: string) => (s ? s.slice(0, 10) : '')
const toDate = (s: string) => (s ? `${s} 12:00:00.000Z` : '')
const fmtDay = (s: string) => {
  const d = day10(s)
  return d ? d.split('-').reverse().join('/') : ''
}

// ---------------------------------------------------------------- Geral

interface GeneralForm {
  published: boolean
  title: string
  short_name: string
  tagline: string
  about: string
  primary_color: string
  accent_color: string
  address: string
  maps_url: string
  phone: string
  whatsapp: string
  email: string
  instagram: string
  facebook: string
  youtube: string
  youtube_channel_id: string
  footer_text: string
  signup_link_id: string
  service_times: ServiceTime[]
  sections: SiteSections
}

function toForm(s: SiteSettings | null, churchName: string): GeneralForm {
  return {
    published: s?.published ?? false,
    title: s?.title || churchName,
    short_name: s?.short_name || '',
    tagline: s?.tagline || '',
    about: s?.about || '',
    primary_color: s?.primary_color || DEFAULT_PRIMARY,
    accent_color: s?.accent_color || DEFAULT_ACCENT,
    address: s?.address || '',
    maps_url: s?.maps_url || '',
    phone: s?.phone || '',
    whatsapp: s?.whatsapp || '',
    email: s?.email || '',
    instagram: s?.instagram || '',
    facebook: s?.facebook || '',
    youtube: s?.youtube || '',
    youtube_channel_id: s?.youtube_channel_id || '',
    footer_text: s?.footer_text || '',
    signup_link_id: s?.signup_link_id || '',
    service_times: cleanServiceTimes(s?.service_times || []),
    sections: withDefaults(s?.sections),
  }
}

function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={7}
        disabled={disabled}
        className="w-28 font-mono"
      />
    </div>
  )
}

function GeneralTab({
  churchId,
  churchName,
  settings,
  options,
  canEdit,
  onSaved,
}: {
  churchId: string
  churchName: string
  settings: SiteSettings | null
  options: SiteOptions | null
  canEdit: boolean
  onSaved: (s: SiteSettings) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<GeneralForm>(() => toForm(settings, churchName))
  const [logo, setLogo] = useState<File | null>(null)
  const [icon, setIcon] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm(toForm(settings, churchName)), [settings, churchName])
  const set = <K extends keyof GeneralForm>(k: K, v: GeneralForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Dê um nome ao site', variant: 'destructive' })
      return
    }
    for (const c of [form.primary_color, form.accent_color]) {
      if (!/^#[0-9a-f]{6}$/i.test(c)) {
        toast({
          title: 'Cor inválida',
          description: 'Use o formato #RRGGBB.',
          variant: 'destructive',
        })
        return
      }
    }
    setSaving(true)
    try {
      const fd = new FormData()
      const plain: Record<string, unknown> = {
        ...form,
        service_times: JSON.stringify(cleanServiceTimes(form.service_times)),
        sections: JSON.stringify(form.sections),
      }
      for (const [k, v] of Object.entries(plain))
        fd.set(k, typeof v === 'boolean' ? String(v) : String(v ?? ''))
      if (logo) fd.set('logo', logo)
      if (icon) fd.set('app_icon', icon)
      const saved = await saveSiteSettings(churchId, settings?.id || null, fd)
      setLogo(null)
      setIcon(null)
      onSaved(saved)
      toast({
        title: 'Site salvo',
        description: form.published ? 'As mudanças já estão no ar.' : 'O site continua fora do ar.',
      })
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const times = form.service_times
  const setTime = (i: number, patch: Partial<ServiceTime>) =>
    set(
      'service_times',
      times.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    )

  return (
    <div className="space-y-5">
      <Box
        title="Publicação"
        hint="Enquanto estiver desligado, o endereço /igreja mostra 'Site não encontrado'."
        action={
          <div className="flex items-center gap-2">
            <Switch
              checked={form.published}
              onCheckedChange={(v) => set('published', v)}
              disabled={!canEdit}
            />
            <span
              className={cn(
                'text-sm font-semibold',
                form.published ? 'text-emerald-700' : 'text-slate-500',
              )}
            >
              {form.published ? 'No ar' : 'Fora do ar'}
            </span>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome no site">
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={160}
              disabled={!canEdit}
            />
          </Field>
          <Field
            label="Nome curto (embaixo do ícone no celular)"
            hint="Até 12 letras aparecem inteiras."
          >
            <Input
              value={form.short_name}
              onChange={(e) => set('short_name', e.target.value)}
              maxLength={30}
              disabled={!canEdit}
              placeholder="IBMA"
            />
          </Field>
          <Field label="Frase (aparece no topo)">
            <Input
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
              maxLength={200}
              disabled={!canEdit}
              placeholder="Uma igreja para pertencer e servir"
            />
          </Field>
          <Field label="Texto do rodapé">
            <Input
              value={form.footer_text}
              onChange={(e) => set('footer_text', e.target.value)}
              maxLength={300}
              disabled={!canEdit}
            />
          </Field>
        </div>
      </Box>

      <Box title="Aparência" hint="Cores, logo e o ícone do app na tela de início.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Cor principal (topo e botões escuros)">
            <ColorInput
              value={form.primary_color}
              onChange={(v) => set('primary_color', v)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Cor de destaque (botões e detalhes)">
            <ColorInput
              value={form.accent_color}
              onChange={(v) => set('accent_color', v)}
              disabled={!canEdit}
            />
          </Field>
          <Field
            label="Logo"
            hint="Quadrada, fundo transparente ou branco. PNG, JPG ou WEBP até 2 MB."
          >
            <div className="flex items-center gap-3">
              {settings?.logo && !logo && (
                <img
                  src={siteSettingsFileUrl(settings, 'logo')}
                  alt=""
                  className="h-12 w-12 rounded-full border bg-white object-contain"
                />
              )}
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setLogo(e.target.files?.[0] || null)}
                disabled={!canEdit}
              />
            </div>
          </Field>
          <Field
            label="Ícone do app"
            hint="PNG quadrado de 512×512, sem transparência. É o que aparece na tela de início."
          >
            <div className="flex items-center gap-3">
              {settings?.app_icon && !icon && (
                <img
                  src={siteSettingsFileUrl(settings, 'app_icon')}
                  alt=""
                  className="h-12 w-12 rounded-xl border object-cover"
                />
              )}
              <Input
                type="file"
                accept="image/png"
                onChange={(e) => setIcon(e.target.files?.[0] || null)}
                disabled={!canEdit}
              />
            </div>
          </Field>
        </div>
      </Box>

      <Box
        title="Horários dos cultos"
        hint="Aparecem no site e ligam o aviso 'Ao vivo agora' durante o culto."
      >
        <div className="space-y-2">
          {times.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                value={String(t.day)}
                onValueChange={(v) => setTime(i, { day: Number(v) })}
                disabled={!canEdit}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, j) => (
                    <SelectItem key={j} value={String(j)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="time"
                value={t.time}
                onChange={(e) => setTime(i, { time: e.target.value })}
                className="w-28"
                disabled={!canEdit}
              />
              <Input
                value={t.label}
                onChange={(e) => setTime(i, { label: e.target.value })}
                maxLength={60}
                className="min-w-[10rem] flex-1"
                placeholder="Culto, EBD, Oração..."
                disabled={!canEdit}
              />
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    set(
                      'service_times',
                      times.filter((_, j) => j !== i),
                    )
                  }
                  aria-label="Tirar horário"
                >
                  <Trash2 className="h-4 w-4 text-slate-500" />
                </Button>
              )}
            </div>
          ))}
          {canEdit && (
            <Button
              variant="outline"
              className="gap-1.5 rounded-xl"
              onClick={() =>
                set('service_times', [
                  ...times,
                  { day: 0, time: '18:00', label: 'Culto', duration: 120 },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Horário
            </Button>
          )}
        </div>
      </Box>

      <Box title="Contatos, endereço e redes">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Endereço">
            <Input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              maxLength={300}
              disabled={!canEdit}
            />
          </Field>
          <Field
            label="Link do mapa (opcional)"
            hint="Vazio: o 'Como chegar' procura o endereço no Google Maps."
          >
            <Input
              value={form.maps_url}
              onChange={(e) => set('maps_url', e.target.value)}
              disabled={!canEdit}
              placeholder="https://maps.app.goo.gl/..."
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              maxLength={40}
              disabled={!canEdit}
            />
          </Field>
          <Field label="WhatsApp da secretaria">
            <Input
              value={form.whatsapp}
              onChange={(e) => set('whatsapp', e.target.value)}
              maxLength={40}
              disabled={!canEdit}
            />
          </Field>
          <Field label="E-mail">
            <Input
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Instagram">
            <Input
              value={form.instagram}
              onChange={(e) => set('instagram', e.target.value)}
              maxLength={100}
              disabled={!canEdit}
              placeholder="ibmaldeia"
            />
          </Field>
          <Field label="Facebook">
            <Input
              value={form.facebook}
              onChange={(e) => set('facebook', e.target.value)}
              maxLength={100}
              disabled={!canEdit}
            />
          </Field>
          <Field
            label="Canal do YouTube"
            hint="O @ do canal ou o link. Os cultos e vídeos entram sozinhos na aba Assistir."
          >
            <Input
              value={form.youtube}
              onChange={(e) => set('youtube', e.target.value)}
              maxLength={200}
              disabled={!canEdit}
              placeholder="https://www.youtube.com/@ibmaldeia"
            />
          </Field>
        </div>
      </Box>

      <Box title="Seções do site e do app" hint="Desligado some do site e do app.">
        <div className="divide-y divide-slate-100">
          {(Object.keys(SECTION_LABELS) as (keyof SiteSections)[]).map((k) => (
            <div key={k} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{SECTION_LABELS[k].title}</p>
                <p className="text-sm text-slate-500">{SECTION_LABELS[k].hint}</p>
                {k === 'contribuir' && options && !options.pix_configured && (
                  <p className="text-xs font-medium text-amber-700">
                    A chave PIX ainda não está cadastrada (Financeiro › Cadastros).
                  </p>
                )}
              </div>
              <Switch
                checked={form.sections[k]}
                onCheckedChange={(v) => set('sections', { ...form.sections, [k]: v })}
                disabled={!canEdit}
              />
            </div>
          ))}
        </div>
        {form.sections.novo && (
          <Field
            label="Link do 'Sou novo aqui'"
            hint="Um dos links de autocadastro de Membros › Cadastros (QR)."
          >
            <Select
              value={form.signup_link_id || 'none'}
              onValueChange={(v) => set('signup_link_id', v === 'none' ? '' : v)}
              disabled={!canEdit}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (o atalho não aparece)</SelectItem>
                {(options?.signup_links || []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title}
                    {l.active ? '' : ' (desativado)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </Box>

      <Box
        title="Quem somos"
        hint="Texto curto na página inicial. Para páginas maiores use a aba Páginas."
      >
        <Textarea
          value={form.about}
          onChange={(e) => set('about', e.target.value)}
          rows={5}
          maxLength={8000}
          disabled={!canEdit}
        />
      </Box>

      {canEdit && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button
            onClick={save}
            disabled={saving}
            className="gap-1.5 rounded-xl bg-teal-700 px-6 text-white shadow-lg hover:bg-teal-800"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Destaques

interface HighlightDraft {
  id: string | null
  title: string
  subtitle: string
  button_label: string
  linkType: 'none' | 'event' | 'url'
  link: string
  church_event_id: string
  starts_on: string
  ends_on: string
  active: boolean
  file: File | null
  image: string
}

function HighlightsTab({
  churchId,
  canEdit,
  options,
}: {
  churchId: string
  canEdit: boolean
  options: SiteOptions | null
}) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [items, setItems] = useState<SiteHighlight[] | null>(null)
  const [draft, setDraft] = useState<HighlightDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    listHighlights(churchId)
      .then(setItems)
      .catch(() => setItems([]))
  }, [churchId])
  useEffect(load, [load])

  const events = options?.events || []
  const open = (h?: SiteHighlight) =>
    setDraft({
      id: h?.id || null,
      title: h?.title || '',
      subtitle: h?.subtitle || '',
      button_label: h?.button_label || '',
      linkType: h?.church_event_id ? 'event' : h?.link ? 'url' : 'none',
      link: h?.link || '',
      church_event_id: h?.church_event_id || '',
      starts_on: day10(h?.starts_on),
      ends_on: day10(h?.ends_on),
      active: h?.active ?? true,
      file: null,
      image: h ? highlightImageUrl(h) : '',
    })

  const save = async () => {
    if (!draft) return
    if (!draft.title.trim()) {
      toast({ title: 'Dê um título ao destaque', variant: 'destructive' })
      return
    }
    if (draft.linkType === 'event' && !draft.church_event_id) {
      toast({ title: 'Escolha o evento', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('title', draft.title.trim())
      fd.set('subtitle', draft.subtitle.trim())
      fd.set('button_label', draft.linkType === 'none' ? '' : draft.button_label.trim())
      fd.set('link', draft.linkType === 'url' ? draft.link.trim() : '')
      fd.set('church_event_id', draft.linkType === 'event' ? draft.church_event_id : '')
      fd.set('starts_on', toDate(draft.starts_on))
      fd.set('ends_on', toDate(draft.ends_on))
      fd.set('active', String(draft.active))
      if (!draft.id) fd.set('order', String((items?.length || 0) + 1))
      if (draft.file) fd.set('image', draft.file)
      await saveHighlight(churchId, draft.id, fd)
      if (draft.linkType === 'event') {
        const ev = events.find((e) => e.id === draft.church_event_id)
        if (ev && !ev.show_on_site && ev.has_link) await setEventOnSite(churchId, ev.id, true)
      }
      setDraft(null)
      load()
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    if (!items) return
    const list = [...items]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setItems(list)
    try {
      await Promise.all(
        list.map((h, k) => {
          const fd = new FormData()
          fd.set('order', String(k + 1))
          return saveHighlight(churchId, h.id, fd)
        }),
      )
    } catch (_) {
      load()
    }
  }

  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const status = (h: SiteHighlight) => {
    if (!h.active) return { label: 'Desligado', cls: 'bg-slate-100 text-slate-600' }
    if (day10(h.starts_on) && day10(h.starts_on) > today)
      return { label: `Entra em ${fmtDay(h.starts_on)}`, cls: 'bg-indigo-50 text-indigo-700' }
    if (day10(h.ends_on) && day10(h.ends_on) < today)
      return { label: 'Saiu do ar', cls: 'bg-slate-100 text-slate-600' }
    return { label: 'No ar', cls: 'bg-emerald-50 text-emerald-700' }
  }

  return (
    <Box
      title="Destaques (banners do topo)"
      hint="Imagem 1920×635 (ou parecida). No celular a imagem é cortada nas laterais: deixe o texto importante no centro."
      action={
        canEdit && (
          <Button
            onClick={() => open()}
            className="gap-1.5 rounded-xl bg-teal-700 text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" /> Novo destaque
          </Button>
        )
      }
    >
      {items === null ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum destaque. Sem destaque, o topo do site mostra o nome e a frase da igreja.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((h, i) => {
            const st = status(h)
            const ev = h.church_event_id ? events.find((e) => e.id === h.church_event_id) : null
            return (
              <div
                key={h.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"
              >
                {canEdit && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Subir"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-slate-400 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descer"
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      className="text-slate-400 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div className="grid h-14 w-40 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-amber-600 to-slate-900">
                  {h.image ? (
                    <img src={highlightImageUrl(h)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-white/70" />
                  )}
                </div>
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold">{h.title}</p>
                  <p className="text-sm text-slate-500">
                    {ev
                      ? `Botão: ${h.button_label || 'Saiba mais'} → inscrição de ${ev.title}`
                      : h.link
                        ? `Botão: ${h.button_label || 'Saiba mais'} → ${h.link}`
                        : 'Sem botão'}
                    {day10(h.ends_on) ? ` · sai do ar depois de ${fmtDay(h.ends_on)}` : ''}
                  </p>
                </div>
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', st.cls)}>
                  {st.label}
                </span>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => open(h)}
                      aria-label="Alterar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir"
                      onClick={() =>
                        confirm({
                          title: 'Excluir este destaque?',
                          description: `"${h.title}" sai do site na hora.`,
                          confirmLabel: 'Excluir',
                          destructive: true,
                          onConfirm: async () => {
                            await deleteHighlight(h.id)
                            load()
                          },
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Alterar destaque' : 'Novo destaque'}</DialogTitle>
            <DialogDescription>
              Aparece no topo da página inicial do site e do app.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <Field label="Título">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={120}
                />
              </Field>
              <Field label="Texto curto (opcional)">
                <Input
                  value={draft.subtitle}
                  onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                  maxLength={240}
                />
              </Field>
              <Field label="Imagem" hint="1920×635, até 3 MB. Sem imagem, usa as cores do site.">
                {draft.image && !draft.file && (
                  <img
                    src={draft.image}
                    alt=""
                    className="mb-2 h-20 w-full rounded-lg object-cover"
                  />
                )}
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] || null })}
                />
              </Field>
              <Field label="Botão">
                <Select
                  value={draft.linkType}
                  onValueChange={(v) =>
                    setDraft({ ...draft, linkType: v as HighlightDraft['linkType'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem botão</SelectItem>
                    <SelectItem value="event">Inscrição de um evento</SelectItem>
                    <SelectItem value="url">Outro link</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {draft.linkType === 'event' && (
                <Field
                  label="Evento"
                  hint="O evento entra na agenda do site. Quando ele acabar ou sair do site, o destaque sai junto."
                >
                  <Select
                    value={draft.church_event_id}
                    onValueChange={(v) =>
                      setDraft({
                        ...draft,
                        church_event_id: v,
                        button_label: draft.button_label || 'Quero me inscrever',
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {events
                        .filter((e) => e.has_link)
                        .map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.title} · {fmtDay(e.starts_on)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {draft.linkType === 'url' && (
                <Field label="Link" hint="Do próprio site (ex.: /igreja/assistir) ou https://...">
                  <Input
                    value={draft.link}
                    onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                    maxLength={500}
                  />
                </Field>
              )}
              {draft.linkType !== 'none' && (
                <Field label="Texto do botão">
                  <Input
                    value={draft.button_label}
                    onChange={(e) => setDraft({ ...draft, button_label: e.target.value })}
                    maxLength={40}
                    placeholder="Saiba mais"
                  />
                </Field>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Entra no ar em (opcional)">
                  <Input
                    type="date"
                    value={draft.starts_on}
                    onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
                  />
                </Field>
                <Field label="Fica no ar até (opcional)">
                  <Input
                    type="date"
                    value={draft.ends_on}
                    onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.active}
                  onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                />
                <span className="text-sm">Ligado</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Box>
  )
}

// ---------------------------------------------------------------- Avisos

function NoticesTab({ churchId, canEdit }: { churchId: string; canEdit: boolean }) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [items, setItems] = useState<SiteNotice[] | null>(null)
  const [draft, setDraft] = useState<(Partial<SiteNotice> & { id: string | null }) | null>(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(() => {
    listNotices(churchId)
      .then(setItems)
      .catch(() => setItems([]))
  }, [churchId])
  useEffect(load, [load])

  const save = async () => {
    if (!draft?.title?.trim()) {
      toast({ title: 'Dê um título ao aviso', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await saveNotice(churchId, draft.id, {
        title: draft.title.trim(),
        body: (draft.body || '').trim(),
        starts_on: toDate(day10(draft.starts_on)),
        ends_on: toDate(day10(draft.ends_on)),
        active: draft.active ?? true,
        order: draft.order || 0,
      })
      setDraft(null)
      load()
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      title="Avisos da semana"
      hint="Recados curtos na página inicial. Coloque 'fica até' para o aviso sair sozinho."
      action={
        canEdit && (
          <Button
            onClick={() => setDraft({ id: null, active: true })}
            className="gap-1.5 rounded-xl bg-teal-700 text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" /> Novo aviso
          </Button>
        )
      }
    >
      {items === null ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum aviso.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-3 p-3">
              <Megaphone className="h-5 w-5 text-slate-400" />
              <div className="min-w-[10rem] flex-1">
                <p className={cn('font-semibold', !n.active && 'text-slate-400 line-through')}>
                  {n.title}
                </p>
                <p className="line-clamp-1 text-sm text-slate-500">
                  {n.body}
                  {day10(n.ends_on) ? ` · até ${fmtDay(n.ends_on)}` : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Alterar"
                    onClick={() =>
                      setDraft({ ...n, starts_on: day10(n.starts_on), ends_on: day10(n.ends_on) })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir"
                    onClick={() =>
                      confirm({
                        title: 'Excluir este aviso?',
                        confirmLabel: 'Excluir',
                        destructive: true,
                        onConfirm: async () => {
                          await deleteNotice(n.id)
                          load()
                        },
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Alterar aviso' : 'Novo aviso'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <Field label="Título">
                <Input
                  value={draft.title || ''}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={160}
                />
              </Field>
              <Field label="Texto (opcional)">
                <Textarea
                  value={draft.body || ''}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  maxLength={1000}
                  rows={3}
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Aparece a partir de">
                  <Input
                    type="date"
                    value={draft.starts_on || ''}
                    onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
                  />
                </Field>
                <Field label="Fica até">
                  <Input
                    type="date"
                    value={draft.ends_on || ''}
                    onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.active ?? true}
                  onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                />
                <span className="text-sm">Ligado</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Box>
  )
}

// ---------------------------------------------------------------- Páginas

function PagesTab({ churchId, canEdit }: { churchId: string; canEdit: boolean }) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [items, setItems] = useState<SitePage[] | null>(null)
  const [draft, setDraft] = useState<(Partial<SitePage> & { id: string | null }) | null>(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(() => {
    listPages(churchId)
      .then(setItems)
      .catch(() => setItems([]))
  }, [churchId])
  useEffect(load, [load])

  const save = async () => {
    if (!draft?.title?.trim()) {
      toast({ title: 'Dê um título à página', variant: 'destructive' })
      return
    }
    const slug = slugify(draft.slug || draft.title)
    if (!slug) {
      toast({ title: 'Confira o endereço da página', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await savePage(churchId, draft.id, {
        title: draft.title.trim(),
        slug,
        body: draft.body || '',
        active: draft.active ?? true,
        order: draft.order ?? (items?.length || 0) + 1,
      })
      setDraft(null)
      load()
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      title="Páginas"
      hint="Quem somos, Ministérios, Missões... Aparecem no menu do site."
      action={
        canEdit && (
          <Button
            onClick={() => setDraft({ id: null, active: true })}
            className="gap-1.5 rounded-xl bg-teal-700 text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" /> Nova página
          </Button>
        )
      }
    >
      {items === null ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhuma página.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <FileText className="h-5 w-5 text-slate-400" />
              <div className="min-w-[10rem] flex-1">
                <p className={cn('font-semibold', !p.active && 'text-slate-400 line-through')}>
                  {p.title}
                </p>
                <p className="text-sm text-slate-500">/igreja/p/{p.slug}</p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Alterar"
                    onClick={() => setDraft({ ...p })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir"
                    onClick={() =>
                      confirm({
                        title: 'Excluir esta página?',
                        description: `"${p.title}" sai do site na hora.`,
                        confirmLabel: 'Excluir',
                        destructive: true,
                        onConfirm: async () => {
                          await deletePage(p.id)
                          load()
                        },
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Alterar página' : 'Nova página'}</DialogTitle>
            <DialogDescription>
              Escreva normalmente. Linha começando com # vira título; com - vira lista.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Título">
                  <Input
                    value={draft.title || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        title: e.target.value,
                        slug: draft.id ? draft.slug : slugify(e.target.value),
                      })
                    }
                    maxLength={120}
                  />
                </Field>
                <Field label="Endereço" hint={`/igreja/p/${slugify(draft.slug || '') || '...'}`}>
                  <Input
                    value={draft.slug || ''}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    maxLength={80}
                  />
                </Field>
              </div>
              <Field label="Texto">
                <Textarea
                  value={draft.body || ''}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={14}
                  maxLength={20000}
                />
              </Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.active ?? true}
                  onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                />
                <span className="text-sm">Ligada</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Box>
  )
}

// ---------------------------------------------------------------- Agenda

function AgendaTab({
  churchId,
  canEdit,
  options,
  reload,
}: {
  churchId: string
  canEdit: boolean
  options: SiteOptions | null
  reload: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState('')
  const toggle = async (id: string, show: boolean) => {
    setBusy(id)
    try {
      await setEventOnSite(churchId, id, show)
      reload()
    } catch (err) {
      toast({
        title: 'Não foi possível mudar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setBusy('')
    }
  }
  const events = options?.events || []
  return (
    <Box
      title="Eventos na agenda do site"
      hint="Só entram no site os eventos marcados aqui. Os cultos da agenda do louvor entram sozinhos (só nome, dia e hora), se a seção 'Cultos na agenda' estiver ligada."
    >
      {!options ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum evento por vir. Crie em{' '}
          <Link to="/membros/eventos" className="font-semibold text-teal-700">
            Membresia › Eventos da igreja
          </Link>
          .
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 p-3">
              <CalendarDays className="h-5 w-5 text-slate-400" />
              <div className="min-w-[10rem] flex-1">
                <p className="font-semibold">{e.title}</p>
                <p className="text-sm text-slate-500">
                  {fmtDay(e.starts_on)}
                  {e.ends_on && e.ends_on !== e.starts_on ? ` a ${fmtDay(e.ends_on)}` : ''}
                  {e.start_time ? ` · ${e.start_time}` : ''}
                  {e.registration_open ? ' · inscrições abertas' : ''}
                </p>
              </div>
              {busy === e.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <Switch
                  checked={e.show_on_site}
                  onCheckedChange={(v) => toggle(e.id, v)}
                  disabled={!canEdit || !e.has_link}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------- Página

export default function SiteAdmin() {
  const { currentChurch, can } = useAuth()
  const { toast } = useToast()
  const churchId = currentChurch?.id || ''
  const canEdit = can('admin.site.alterar')
  const [settings, setSettings] = useState<SiteSettings | null | undefined>(undefined)
  const [options, setOptions] = useState<SiteOptions | null>(null)
  const [previewKey, setPreviewKey] = useState(0)

  const loadOptions = useCallback(() => {
    if (!churchId) return
    getSiteOptions(churchId)
      .then(setOptions)
      .catch(() =>
        setOptions({ events: [], signup_links: [], pix_configured: false, campaigns: [] }),
      )
  }, [churchId])

  useEffect(() => {
    if (!churchId) return
    getSiteSettings(churchId)
      .then(setSettings)
      .catch(() => setSettings(null))
    loadOptions()
  }, [churchId, loadOptions])

  const siteUrl = useMemo(() => {
    const slug = settings?.slug
    return `${publicOrigin()}/igreja${slug ? `?s=${slug}` : ''}`
  }, [settings?.slug])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl)
      toast({ title: 'Link copiado', description: siteUrl })
    } catch (_) {
      toast({ title: siteUrl })
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            <Globe className="h-7 w-7 text-teal-700" />
            Site e App da igreja
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            O site público da igreja, que também vira app na tela de início do celular. Só conteúdo
            público: nenhum dado de membro aparece lá.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5 rounded-xl" onClick={copyLink}>
            <Copy className="h-4 w-4" /> Copiar link
          </Button>
          <Button variant="outline" className="gap-1.5 rounded-xl" asChild>
            <a href={siteUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir o site
            </a>
          </Button>
        </div>
      </div>

      {settings !== undefined && !settings?.published && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          O site está <b>fora do ar</b>. Preencha a aba Geral e ligue "Publicação" quando estiver
          pronto.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {settings === undefined ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <Tabs defaultValue="geral">
              <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
                <TabsTrigger value="geral" className="gap-1.5">
                  <Settings2 className="h-4 w-4" /> Geral
                </TabsTrigger>
                <TabsTrigger value="destaques" className="gap-1.5" disabled={!settings}>
                  <ImageIcon className="h-4 w-4" /> Destaques
                </TabsTrigger>
                <TabsTrigger value="avisos" className="gap-1.5" disabled={!settings}>
                  <Megaphone className="h-4 w-4" /> Avisos
                </TabsTrigger>
                <TabsTrigger value="agenda" className="gap-1.5" disabled={!settings}>
                  <CalendarDays className="h-4 w-4" /> Agenda
                </TabsTrigger>
                <TabsTrigger value="paginas" className="gap-1.5" disabled={!settings}>
                  <FileText className="h-4 w-4" /> Páginas
                </TabsTrigger>
                <TabsTrigger value="hinario" className="gap-1.5" disabled={!settings}>
                  <Music className="h-4 w-4" /> Hinário
                </TabsTrigger>
              </TabsList>
              <TabsContent value="geral">
                <GeneralTab
                  churchId={churchId}
                  churchName={currentChurch?.name || ''}
                  settings={settings}
                  options={options}
                  canEdit={canEdit}
                  onSaved={(s) => {
                    setSettings(s)
                    setPreviewKey((k) => k + 1)
                  }}
                />
              </TabsContent>
              <TabsContent value="destaques">
                <HighlightsTab churchId={churchId} canEdit={canEdit} options={options} />
              </TabsContent>
              <TabsContent value="avisos">
                <NoticesTab churchId={churchId} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="agenda">
                <AgendaTab
                  churchId={churchId}
                  canEdit={canEdit}
                  options={options}
                  reload={loadOptions}
                />
              </TabsContent>
              <TabsContent value="paginas">
                <PagesTab churchId={churchId} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="hinario">
                <HymnsTab churchId={churchId} canEdit={canEdit} />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-6 space-y-2">
            <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
              <span>Como está no ar (celular)</span>
              <button
                type="button"
                onClick={() => setPreviewKey((k) => k + 1)}
                className="inline-flex items-center gap-1 text-teal-700"
              >
                <RefreshCw className="h-4 w-4" /> Atualizar
              </button>
            </div>
            <div className="mx-auto h-[720px] w-[360px] overflow-hidden rounded-[2.5rem] border-[10px] border-slate-900 bg-white shadow-xl">
              {settings?.published ? (
                <iframe
                  key={previewKey}
                  title="Pré-visualização"
                  src={siteUrl}
                  className="h-full w-full"
                />
              ) : (
                <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-500">
                  A pré-visualização aparece quando o site estiver no ar.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
