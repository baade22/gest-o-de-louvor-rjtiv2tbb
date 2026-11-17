// Painel Site e App › Hinário (migração 0103): a igreja cadastra os hinos que canta (Cantor
// Cristão, Harpa Cristã...) com número, título e letra. A letra pode vir de uma música do
// repertório do LouvorFlow. O app mostra o índice e a letra dos hinos ligados.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileUp, Loader2, Music, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { cn } from '@/lib/utils'
import { fold } from '@/lib/bible'
import { deleteHymn, getHymn, listHymns, saveHymn, type SiteHymn } from '@/services/site'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Box, Field } from './siteAdminParts'
import HymnImportDialog from './SiteAdminHymnImport'

const SUGGESTED = ['Cantor Cristão', 'Harpa Cristã']

type Draft = Partial<SiteHymn> & { id: string | null }

interface RepertoireSong {
  id: string
  title: string
  artist: string
  lyrics: string
}

export default function HymnsTab({ churchId, canEdit }: { churchId: string; canEdit: boolean }) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [items, setItems] = useState<SiteHymn[] | null>(null)
  const [tab, setTab] = useState('')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadingDraft, setLoadingDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState(false)

  const load = useCallback(() => {
    listHymns(churchId)
      .then(setItems)
      .catch(() => setItems([]))
  }, [churchId])
  useEffect(load, [load])

  const hymnals = useMemo(() => {
    const names: string[] = []
    for (const h of items || []) if (!names.includes(h.hymnal)) names.push(h.hymnal)
    return names
  }, [items])
  const current = hymnals.includes(tab) ? tab : hymnals[0] || ''
  const list = useMemo(() => {
    const rows = (items || []).filter((h) => h.hymnal === current)
    const q = query.trim()
    if (!q) return rows
    if (/^\d+$/.test(q)) return rows.filter((h) => String(h.number).startsWith(q))
    const k = fold(q)
    return rows.filter((h) => fold(h.title).includes(k))
  }, [items, current, query])

  const nextNumber = () => {
    const rows = (items || []).filter((h) => h.hymnal === current)
    return rows.reduce((m, h) => Math.max(m, h.number || 0), 0) + 1
  }

  const openNew = () =>
    setDraft({
      id: null,
      hymnal: current || SUGGESTED[0],
      number: current ? nextNumber() : 1,
      title: '',
      lyrics: '',
      active: true,
    })

  const openEdit = async (h: SiteHymn) => {
    setLoadingDraft(h.id)
    try {
      const full = await getHymn(h.id)
      setDraft({ ...full })
    } catch (err) {
      toast({
        title: 'Não foi possível abrir',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setLoadingDraft('')
    }
  }

  const save = async () => {
    if (!draft) return
    const hymnal = (draft.hymnal || '').trim()
    const title = (draft.title || '').trim()
    if (!hymnal || !title) {
      toast({ title: 'Preencha o hinário e o título', variant: 'destructive' })
      return
    }
    const number = Number(draft.number) || 0
    const dup = (items || []).find(
      (h) => h.id !== draft.id && h.hymnal === hymnal && number > 0 && h.number === number,
    )
    if (dup) {
      toast({
        title: `Já existe o hino ${number} no ${hymnal}`,
        description: `"${dup.title}". Confira o número.`,
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      await saveHymn(churchId, draft.id, {
        hymnal,
        number,
        title,
        lyrics: (draft.lyrics || '').replace(/\r/g, '').trim(),
        active: draft.active ?? true,
      })
      setTab(hymnal)
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
      title="Hinário"
      hint="Os hinos que a igreja canta (Cantor Cristão, Harpa Cristã ou outro). Aparecem na aba Hinário do app, com a letra."
      action={
        canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setFileOpen(true)}
              className="gap-1.5 rounded-xl"
            >
              <FileUp className="h-4 w-4" /> Importar arquivo
            </Button>
            <Button
              onClick={openNew}
              className="gap-1.5 rounded-xl bg-teal-700 text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" /> Novo hino
            </Button>
          </div>
        )
      }
    >
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        As letras de hinários têm direitos autorais (a Harpa Cristã é da CPAD; parte do Cantor
        Cristão também tem dono). Ao publicar uma letra, a igreja responde por ela.
      </p>

      {items === null ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum hino cadastrado. Use "Importar arquivo" (exportação do Holyrics) ou "Novo hino".
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {hymnals.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setTab(n)
                  setQuery('')
                }}
                className={cn(
                  'rounded-xl border px-3.5 py-1.5 text-sm font-semibold',
                  current === n
                    ? 'border-teal-700 bg-teal-700 text-white'
                    : 'border-slate-200 bg-white text-slate-700',
                )}
              >
                {n}{' '}
                <span className="opacity-70">
                  ({(items || []).filter((h) => h.hymnal === n).length})
                </span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Número ou título"
              className="pl-9"
            />
          </div>
          <div className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {list.map((h) => (
              <div key={h.id} className="flex items-center gap-3 p-2.5 pl-3">
                <span className="grid h-9 min-w-[2.5rem] place-items-center rounded-lg bg-slate-100 px-1.5 text-sm font-bold text-slate-700">
                  {h.number || '–'}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate font-medium',
                    !h.active && 'text-slate-400 line-through',
                  )}
                >
                  {h.title}
                </span>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Alterar"
                      onClick={() => openEdit(h)}
                      disabled={loadingDraft === h.id}
                    >
                      {loadingDraft === h.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir"
                      onClick={() =>
                        confirm({
                          title: 'Excluir este hino?',
                          description: `"${h.number ? `${h.number}. ` : ''}${h.title}" sai do app na hora.`,
                          confirmLabel: 'Excluir',
                          destructive: true,
                          onConfirm: async () => {
                            await deleteHymn(h.id)
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
            {list.length === 0 && (
              <p className="p-4 text-center text-sm text-slate-500">Nenhum hino com "{query}".</p>
            )}
          </div>
        </>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Alterar hino' : 'Novo hino'}</DialogTitle>
            <DialogDescription>
              Na letra, deixe uma linha em branco entre as estrofes. Uma linha só com "Coro" vira
              título pequeno.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
                <Field label="Hinário">
                  <Input
                    value={draft.hymnal || ''}
                    onChange={(e) => setDraft({ ...draft, hymnal: e.target.value })}
                    list="site-hymnals"
                    maxLength={60}
                  />
                  <datalist id="site-hymnals">
                    {[...new Set([...hymnals, ...SUGGESTED])].map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Número">
                  <Input
                    type="number"
                    min={0}
                    max={9999}
                    value={draft.number ?? ''}
                    onChange={(e) => setDraft({ ...draft, number: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>
              <Field label="Título">
                <Input
                  value={draft.title || ''}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={160}
                />
              </Field>
              <Field label="Letra">
                <Textarea
                  value={draft.lyrics || ''}
                  onChange={(e) => setDraft({ ...draft, lyrics: e.target.value })}
                  rows={14}
                  maxLength={12000}
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.active ?? true}
                    onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                  />
                  <span className="text-sm">Aparece no app</span>
                </div>
                <Button variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
                  <Download className="h-4 w-4" /> Trazer letra do repertório
                </Button>
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

      <RepertoirePicker
        churchId={churchId}
        open={importOpen}
        initial={draft?.title || ''}
        onClose={() => setImportOpen(false)}
        onPick={(s) => {
          setImportOpen(false)
          if (!draft) return
          setDraft({
            ...draft,
            title: draft.title?.trim() ? draft.title : s.title,
            lyrics: s.lyrics,
          })
        }}
      />
      <HymnImportDialog
        churchId={churchId}
        open={fileOpen}
        existing={items || []}
        suggestions={[...new Set([...hymnals, ...SUGGESTED])]}
        onClose={() => setFileOpen(false)}
        onDone={(h) => {
          setFileOpen(false)
          setTab(h)
          load()
        }}
      />
      {dialog}
    </Box>
  )
}

/** Procura uma música do repertório (com letra) para copiar a letra para o hino. */
function RepertoirePicker({
  churchId,
  open,
  initial,
  onClose,
  onPick,
}: {
  churchId: string
  open: boolean
  initial: string
  onClose: () => void
  onPick: (s: RepertoireSong) => void
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<RepertoireSong[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setQuery(initial)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    let alive = true
    const t = setTimeout(() => {
      const q = query.trim()
      const filter = q
        ? pb.filter("church_id = {:c} && lyrics != '' && (title ~ {:q} || artist ~ {:q})", {
            c: churchId,
            q,
          })
        : pb.filter("church_id = {:c} && lyrics != ''", { c: churchId })
      pb.collection('songs')
        .getList<RepertoireSong>(1, 30, { filter, sort: 'title', fields: 'id,title,artist,lyrics' })
        .then((r) => {
          if (!alive) return
          setRows(r.items)
          setError('')
        })
        .catch((err) => {
          if (!alive) return
          setRows([])
          setError(getErrorMessage(err))
        })
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [open, query, churchId])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trazer letra do repertório</DialogTitle>
          <DialogDescription>
            Músicas do LouvorFlow que já têm letra (as que vieram do Holyrics também).
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Título ou artista"
          autoFocus
        />
        {error ? (
          <p className="text-sm text-red-600">Não foi possível ler o repertório: {error}</p>
        ) : rows === null ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Nenhuma música com letra encontrada.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {rows.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
              >
                <Music className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.title}</span>
                  {s.artist && (
                    <span className="block truncate text-xs text-slate-500">{s.artist}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
