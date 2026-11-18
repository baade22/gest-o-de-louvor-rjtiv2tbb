// Editor de página do site em blocos (migração 0104): capa, texto, título, foto, galeria, vídeo do
// YouTube, botão e pessoa. As fotos sobem do celular ou do computador para a própria página
// (campo "images"); ao salvar, as fotos que nenhum bloco usa mais são apagadas.

import { useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Heading,
  Image as ImageIcon,
  Images,
  Link2,
  Loader2,
  Trash2,
  Type,
  Upload,
  UserRound,
  X,
  Youtube,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { cn } from '@/lib/utils'
import { slugify } from '@/lib/site'
import {
  pageFileUrl,
  removePageImages,
  savePage,
  setPageCover,
  uploadPageImages,
  type SitePage,
  type SitePageBlock,
} from '@/services/site'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from './siteAdminParts'

type Kind = SitePageBlock['t']

const KINDS: { t: Kind; label: string; icon: typeof Type }[] = [
  { t: 'text', label: 'Texto', icon: Type },
  { t: 'h', label: 'Título', icon: Heading },
  { t: 'image', label: 'Foto', icon: ImageIcon },
  { t: 'gallery', label: 'Galeria', icon: Images },
  { t: 'video', label: 'Vídeo', icon: Youtube },
  { t: 'button', label: 'Botão', icon: Link2 },
  { t: 'person', label: 'Pessoa', icon: UserRound },
]

const LABEL: Record<Kind, string> = Object.fromEntries(KINDS.map((k) => [k.t, k.label])) as Record<
  Kind,
  string
>

function emptyBlock(t: Kind): SitePageBlock {
  switch (t) {
    case 'text':
    case 'h':
      return { t, text: '' }
    case 'image':
      return { t, img: '', caption: '' }
    case 'gallery':
      return { t, imgs: [], caption: '' }
    case 'video':
      return { t, url: '', caption: '' }
    case 'button':
      return { t, label: '', link: '' }
    case 'person':
      return { t, name: '', role: '', img: '', text: '' }
  }
}

/** Blocos da página; página antiga (só texto) vira um bloco de texto. */
export function initialBlocks(p: SitePage): SitePageBlock[] {
  if (Array.isArray(p.blocks) && p.blocks.length) return p.blocks
  return p.body?.trim() ? [{ t: 'text', text: p.body }] : []
}

/** Texto simples equivalente (fica em "body" para servidor antigo e busca). */
export function blocksToBody(blocks: SitePageBlock[]): string {
  return blocks
    .map((b) => (b.t === 'h' ? `# ${b.text.trim()}` : b.t === 'text' ? b.text.trim() : ''))
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 20000)
}

/** Nomes de foto que algum bloco usa. */
export function usedImages(blocks: SitePageBlock[]): Set<string> {
  const out = new Set<string>()
  for (const b of blocks) {
    if (b.t === 'image' && b.img) out.add(b.img)
    if (b.t === 'person' && b.img) out.add(b.img)
    if (b.t === 'gallery') b.imgs.forEach((n) => out.add(n))
  }
  return out
}

function UploadButton({
  multiple,
  busy,
  onFiles,
  children,
}: {
  multiple?: boolean
  busy: boolean
  onFiles: (files: File[]) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="gap-1.5 rounded-xl"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {children}
      </Button>
    </>
  )
}

export default function PageEditor({
  page,
  onClose,
  onSaved,
}: {
  page: SitePage
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [rec, setRec] = useState<SitePage>(page)
  const [title, setTitle] = useState(page.title)
  const [slug, setSlug] = useState(page.slug)
  const [active, setActive] = useState(page.active ?? true)
  const [blocks, setBlocks] = useState<SitePageBlock[]>(() => initialBlocks(page))
  const [busy, setBusy] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const thumb = (name?: string) => pageFileUrl(rec, name, '320x0')
  const set = (i: number, b: SitePageBlock) => setBlocks((l) => l.map((x, j) => (j === i ? b : x)))
  const move = (i: number, d: -1 | 1) =>
    setBlocks((l) => {
      const j = i + d
      if (j < 0 || j >= l.length) return l
      const n = [...l]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })

  /** Sobe fotos e devolve os nomes novos (na ordem). */
  const upload = async (key: string, files: File[]): Promise<string[]> => {
    const big = files.find((f) => f.size > 5 * 1024 * 1024)
    if (big) {
      toast({
        title: 'Foto grande demais',
        description: `"${big.name}" passa de 5 MB.`,
        variant: 'destructive',
      })
      return []
    }
    setBusy(key)
    try {
      const before = new Set(rec.images || [])
      const saved = await uploadPageImages(rec.id, files)
      setRec(saved)
      return (saved.images || []).filter((n) => !before.has(n))
    } catch (err) {
      toast({
        title: 'Não foi possível enviar a foto',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
      return []
    } finally {
      setBusy('')
    }
  }

  const changeCover = async (file: File | null) => {
    setBusy('cover')
    try {
      setRec(await setPageCover(rec.id, file))
    } catch (err) {
      toast({
        title: 'Não foi possível trocar a capa',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setBusy('')
    }
  }

  const save = async () => {
    const s = slugify(slug || title)
    if (!title.trim() || !s) {
      toast({ title: 'Confira o título e o endereço', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const clean = blocks.filter((b) =>
        b.t === 'text' || b.t === 'h'
          ? b.text.trim()
          : b.t === 'image'
            ? b.img
            : b.t === 'gallery'
              ? b.imgs.length
              : b.t === 'video'
                ? b.url.trim()
                : b.t === 'button'
                  ? b.link.trim()
                  : (b as { name: string }).name.trim(),
      )
      await savePage(rec.church_id, rec.id, {
        title: title.trim(),
        slug: s,
        active,
        blocks: clean,
        body: blocksToBody(clean),
      })
      const used = usedImages(clean)
      const orphans = (rec.images || []).filter((n) => !used.has(n))
      if (orphans.length) await removePageImages(rec.id, orphans).catch(() => null)
      onSaved()
      onClose()
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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Alterar página</DialogTitle>
          <DialogDescription>
            Monte a página com blocos. Use as setas para mudar a ordem. As fotos aparecem no site
            assim que você salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Título">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Endereço" hint={`/igreja/p/${slugify(slug || '') || '...'}`}>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={80} />
            </Field>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Capa (foto do topo)
              <div className="flex gap-2 normal-case tracking-normal">
                {rec.cover && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => changeCover(null)}
                    disabled={!!busy}
                    className="text-red-600"
                  >
                    Tirar
                  </Button>
                )}
                <UploadButton busy={busy === 'cover'} onFiles={(f) => changeCover(f[0])}>
                  {rec.cover ? 'Trocar foto' : 'Pôr foto'}
                </UploadButton>
              </div>
            </div>
            {rec.cover ? (
              <img
                src={pageFileUrl(rec, rec.cover, '960x0')}
                alt=""
                className="h-40 w-full object-cover"
              />
            ) : (
              <p className="p-4 text-sm text-slate-500">
                Sem capa a página abre só com o título. Foto deitada fica melhor.
              </p>
            )}
          </div>

          {blocks.map((b, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                <span className="flex-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  {LABEL[b.t]}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Subir"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Descer"
                  disabled={i === blocks.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Tirar bloco"
                  onClick={() => setBlocks((l) => l.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
              <div className="space-y-3 p-3">
                {b.t === 'text' && (
                  <Textarea
                    value={b.text}
                    onChange={(e) => set(i, { ...b, text: e.target.value })}
                    rows={5}
                    maxLength={6000}
                    placeholder="Escreva aqui. Linha em branco separa parágrafos; linha começando com - vira lista."
                  />
                )}
                {b.t === 'h' && (
                  <Input
                    value={b.text}
                    onChange={(e) => set(i, { ...b, text: e.target.value })}
                    maxLength={200}
                    placeholder="Ex.: Nosso propósito"
                    className="font-semibold"
                  />
                )}
                {b.t === 'image' && (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      {b.img && (
                        <img
                          src={thumb(b.img)}
                          alt=""
                          className="h-24 w-36 rounded-xl object-cover"
                        />
                      )}
                      <UploadButton
                        busy={busy === `b${i}`}
                        onFiles={async (f) => {
                          const [name] = await upload(`b${i}`, f.slice(0, 1))
                          if (name) set(i, { ...b, img: name })
                        }}
                      >
                        {b.img ? 'Trocar foto' : 'Escolher foto'}
                      </UploadButton>
                    </div>
                    <Input
                      value={b.caption || ''}
                      onChange={(e) => set(i, { ...b, caption: e.target.value })}
                      maxLength={200}
                      placeholder="Legenda (opcional)"
                    />
                  </>
                )}
                {b.t === 'gallery' && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {b.imgs.map((n) => (
                        <span key={n} className="relative">
                          <img
                            src={thumb(n)}
                            alt=""
                            className="h-20 w-24 rounded-xl object-cover"
                          />
                          <button
                            type="button"
                            aria-label="Tirar foto"
                            onClick={() =>
                              set(i, {
                                ...b,
                                imgs: b.imgs.filter((x) => x !== n),
                              })
                            }
                            className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-red-600 shadow"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <UploadButton
                      multiple
                      busy={busy === `b${i}`}
                      onFiles={async (f) => {
                        const room = 24 - b.imgs.length
                        const names = await upload(`b${i}`, f.slice(0, Math.max(0, room)))
                        if (names.length) set(i, { ...b, imgs: [...b.imgs, ...names] })
                      }}
                    >
                      Pôr fotos
                    </UploadButton>
                    <Input
                      value={b.caption || ''}
                      onChange={(e) => set(i, { ...b, caption: e.target.value })}
                      maxLength={200}
                      placeholder="Legenda (opcional)"
                    />
                  </>
                )}
                {b.t === 'video' && (
                  <>
                    <Input
                      value={b.url}
                      onChange={(e) => set(i, { ...b, url: e.target.value })}
                      maxLength={300}
                      placeholder="Link do vídeo no YouTube"
                    />
                    <Input
                      value={b.caption || ''}
                      onChange={(e) => set(i, { ...b, caption: e.target.value })}
                      maxLength={200}
                      placeholder="Legenda (opcional)"
                    />
                  </>
                )}
                {b.t === 'button' && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      value={b.label}
                      onChange={(e) => set(i, { ...b, label: e.target.value })}
                      maxLength={60}
                      placeholder="Texto do botão (ex.: Fale conosco)"
                    />
                    <Input
                      value={b.link}
                      onChange={(e) => set(i, { ...b, link: e.target.value })}
                      maxLength={500}
                      placeholder="Link (https://... ou /igreja/agenda)"
                    />
                  </div>
                )}
                {b.t === 'person' && (
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex flex-col items-center gap-2">
                      {b.img ? (
                        <img
                          src={thumb(b.img)}
                          alt=""
                          className="h-20 w-20 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid h-20 w-20 place-items-center rounded-full bg-slate-100 text-slate-400">
                          <UserRound className="h-8 w-8" />
                        </span>
                      )}
                      <UploadButton
                        busy={busy === `b${i}`}
                        onFiles={async (f) => {
                          const [name] = await upload(`b${i}`, f.slice(0, 1))
                          if (name) set(i, { ...b, img: name })
                        }}
                      >
                        Foto
                      </UploadButton>
                    </div>
                    <div className="min-w-[12rem] flex-1 space-y-2">
                      <Input
                        value={b.name}
                        onChange={(e) => set(i, { ...b, name: e.target.value })}
                        maxLength={120}
                        placeholder="Nome (ex.: Pr. Luís Carlos)"
                      />
                      <Input
                        value={b.role || ''}
                        onChange={(e) => set(i, { ...b, role: e.target.value })}
                        maxLength={160}
                        placeholder="Função (ex.: Pastor presidente)"
                      />
                      <Textarea
                        value={b.text || ''}
                        onChange={(e) => set(i, { ...b, text: e.target.value })}
                        rows={2}
                        maxLength={1000}
                        placeholder="Texto curto (opcional)"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="rounded-2xl bg-sky-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sky-800">
              Adicionar bloco
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
              {KINDS.map((k) => {
                const Icon = k.icon
                return (
                  <button
                    key={k.t}
                    type="button"
                    onClick={() => setBlocks((l) => [...l, emptyBlock(k.t)])}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl bg-white px-2 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50',
                    )}
                  >
                    <Icon className="h-5 w-5 text-sky-700" />
                    {k.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <span className="text-sm">Página ligada (aparece no menu do site)</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving || !!busy}
            className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
