// Base de números dos Avisos: carrega números de grupos do WhatsApp (todos ou alguns), guarda
// números digitados e organiza em listas (ex.: "Mães do infantil"). Os avisos podem ir para
// essas listas. Não são fichas da Membresia. Servidor: hooks/whatsapp_contacts.js.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { listWaGroups, type WaGroup } from '@/services/whatsappAvisos'
import {
  deleteContacts,
  deleteList,
  getContactsOverview,
  importFromGroup,
  previewGroup,
  saveContact,
  saveList,
  setContactsList,
  type ContactsOverview,
  type GroupPreview,
  type WaContact,
  type WaList,
} from '@/services/whatsappContacts'
import { errorText } from './AvisosPanel'

const fieldClass =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600'

export default function AvisosContatos() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id || ''
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [data, setData] = useState<ContactsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [listFilter, setListFilter] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulkList, setBulkList] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<WaContact | 'new' | null>(null)
  const [editingList, setEditingList] = useState<WaList | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    if (!churchId) return
    setLoading(true)
    setError('')
    try {
      setData(await getContactsOverview(churchId))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [churchId])
  useEffect(() => {
    void load()
  }, [load])

  const listName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of data?.lists || []) m[l.id] = l.name
    return m
  }, [data])

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return (data?.contacts || []).filter(
      (c) =>
        (!listFilter || c.lists.includes(listFilter)) &&
        (!term ||
          c.name.toLowerCase().includes(term) ||
          (digits.length >= 3 && c.phone.includes(digits))),
    )
  }, [data, listFilter, q])

  const allPicked = visible.length > 0 && visible.every((c) => picked.has(c.id))
  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const togglePickAll = () =>
    setPicked((s) => {
      const n = new Set(s)
      for (const c of visible) {
        if (allPicked) n.delete(c.id)
        else n.add(c.id)
      }
      return n
    })

  const can = data?.can || { novo: false, alterar: false, excluir: false }
  const currentList = data?.lists.find((l) => l.id === listFilter) || null

  const runBulk = async (fn: () => Promise<string>) => {
    setBusy(true)
    try {
      toast({ title: await fn() })
      setPicked(new Set())
      await load()
    } catch (err) {
      toast({ title: 'Não deu certo', description: errorText(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8">
      <div>
        <Link
          to="/avisos"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Avisos
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Contatos e listas
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Números para os avisos. Carregue de um grupo do WhatsApp e separe em listas, como
              “Mães do infantil”. Não viram fichas da Membresia.
            </p>
          </div>
          {(can.novo || can.alterar) && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={() => setImporting(true)}
              >
                <Download className="h-4 w-4" /> Carregar de um grupo
              </Button>
              {can.novo && (
                <Button
                  className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white gap-1.5"
                  onClick={() => setEditing('new')}
                >
                  <UserPlus className="h-4 w-4" /> Novo número
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : !data ? (
        <div className="bg-white border border-red-200 rounded-2xl p-5 space-y-2">
          <p className="text-sm text-red-700">Não deu para abrir os contatos: {error}</p>
          <p className="text-xs text-slate-600">
            Se for a primeira vez, confira no Skip se a migração 0102 foi aplicada.
          </p>
        </div>
      ) : (
        <>
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Listas</h2>
              {can.novo && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1"
                  onClick={() => setEditingList('new')}
                >
                  <Plus className="h-4 w-4" /> Nova lista
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <ListChip
                label={`Todos os números (${data.contacts.length})`}
                active={!listFilter}
                onClick={() => setListFilter('')}
              />
              {data.lists.map((l) => (
                <ListChip
                  key={l.id}
                  label={`${l.name} (${l.count})`}
                  active={listFilter === l.id}
                  onClick={() => setListFilter(listFilter === l.id ? '' : l.id)}
                />
              ))}
            </div>
            {currentList && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                {currentList.description && <span>{currentList.description}</span>}
                {can.alterar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => setEditingList(currentList)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Renomear
                  </Button>
                )}
                {can.excluir && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-red-700"
                    onClick={() =>
                      confirm({
                        title: `Apagar a lista “${currentList.name}”?`,
                        description: 'Os números continuam na base, só a lista some.',
                        confirmLabel: 'Apagar lista',
                        onConfirm: () =>
                          runBulk(async () => {
                            await deleteList(churchId, currentList.id)
                            setListFilter('')
                            return 'Lista apagada'
                          }),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Apagar lista
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nome ou número"
                  className="pl-9 rounded-xl min-h-11"
                  aria-label="Buscar contato"
                />
              </div>
              {visible.length > 0 && (
                <Button variant="outline" className="rounded-xl min-h-11" onClick={togglePickAll}>
                  {allPicked ? 'Desmarcar' : 'Marcar todos'}
                </Button>
              )}
            </div>

            {data.contacts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-2">
                <Users className="h-8 w-8 mx-auto text-slate-400" />
                <p className="text-sm text-slate-700">
                  Ainda não há números. Comece por “Carregar de um grupo”.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <p className="text-sm text-slate-600 py-4">Nenhum número com esse filtro.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {visible.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={picked.has(c.id)}
                      onChange={() => togglePick(c.id)}
                      aria-label={`Marcar ${c.name || c.display}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {c.name || <span className="text-slate-500 font-normal">Sem nome</span>}
                        <span className="ml-2 font-normal text-slate-600">{c.display}</span>
                      </p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {c.lists.map((l) =>
                          listName[l] ? (
                            <span
                              key={l}
                              className="text-xs bg-teal-50 text-teal-900 rounded-full px-2 py-0.5"
                            >
                              {listName[l]}
                            </span>
                          ) : null,
                        )}
                        {c.origin && <span className="text-xs text-slate-500">{c.origin}</span>}
                      </div>
                    </div>
                    {can.alterar && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Editar ${c.name || c.display}`}
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {picked.size > 0 && (
            <div className="sticky bottom-3 z-30 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 mr-auto">
                  {picked.size} marcado(s)
                </span>
                {can.alterar && data.lists.length > 0 && (
                  <>
                    <select
                      className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      value={bulkList}
                      onChange={(e) => setBulkList(e.target.value)}
                      aria-label="Lista"
                    >
                      <option value="">Escolha a lista…</option>
                      {data.lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white"
                      disabled={!bulkList || busy}
                      onClick={() =>
                        runBulk(async () => {
                          const r = await setContactsList(churchId, bulkList, [...picked], true)
                          return `${r.changed} número(s) postos em ${listName[bulkList]}`
                        })
                      }
                    >
                      Pôr na lista
                    </Button>
                  </>
                )}
                {can.alterar && currentList && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() =>
                      runBulk(async () => {
                        const r = await setContactsList(
                          churchId,
                          currentList.id,
                          [...picked],
                          false,
                        )
                        return `${r.changed} número(s) tirados de ${currentList.name}`
                      })
                    }
                  >
                    Tirar desta lista
                  </Button>
                )}
                {can.excluir && (
                  <Button
                    variant="outline"
                    className="rounded-xl text-red-700 border-red-200"
                    disabled={busy}
                    onClick={() =>
                      confirm({
                        title: `Apagar ${picked.size} número(s) da base?`,
                        description: 'Eles saem de todas as listas. Avisos já enviados não mudam.',
                        confirmLabel: 'Apagar',
                        onConfirm: () =>
                          runBulk(async () => {
                            const r = await deleteContacts(churchId, [...picked])
                            return `${r.deleted} número(s) apagados`
                          }),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {editing && data && (
        <ContactDialog
          churchId={churchId}
          contact={editing === 'new' ? null : editing}
          lists={data.lists}
          defaultList={listFilter}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
      {editingList && (
        <ListDialog
          churchId={churchId}
          list={editingList === 'new' ? null : editingList}
          onClose={() => setEditingList(null)}
          onSaved={(l) => {
            setEditingList(null)
            setListFilter(l.id)
            void load()
          }}
        />
      )}
      {importing && data && (
        <ImportDialog
          churchId={churchId}
          lists={data.lists}
          canCreateList={can.novo}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false)
            void load()
          }}
        />
      )}
      {confirmDialog}
    </div>
  )
}

function ListChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 px-3.5 rounded-full border text-sm ${
        active
          ? 'border-teal-700 bg-teal-700 text-white font-semibold'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )
}

function ListChecks({
  lists,
  value,
  onChange,
}: {
  lists: WaList[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  if (lists.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {lists.map((l) => {
        const on = value.includes(l.id)
        return (
          <label
            key={l.id}
            className={`inline-flex items-center gap-2 min-h-10 px-3 rounded-xl border text-sm cursor-pointer ${
              on ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-slate-300 text-slate-700'
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(on ? value.filter((x) => x !== l.id) : [...value, l.id])}
            />
            {l.name}
          </label>
        )
      })}
    </div>
  )
}

function ContactDialog({
  churchId,
  contact,
  lists,
  defaultList,
  onClose,
  onSaved,
}: {
  churchId: string
  contact: WaContact | null
  lists: WaList[]
  defaultList: string
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [phone, setPhone] = useState(contact?.display || '')
  const [name, setName] = useState(contact?.name || '')
  const [note, setNote] = useState(contact?.note || '')
  const [sel, setSel] = useState<string[]>(contact?.lists || (defaultList ? [defaultList] : []))
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await saveContact(churchId, { id: contact?.id, phone, name, note, lists: sel })
      toast({ title: contact ? 'Número salvo' : 'Número incluído' })
      onSaved()
    } catch (err) {
      toast({ title: 'Não deu para salvar', description: errorText(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? 'Editar número' : 'Novo número'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-800">WhatsApp (com DDD)</span>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="(81) 98888-7777"
              className="rounded-xl min-h-11"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-800">Nome</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Usado no {nome} da mensagem"
              className="rounded-xl min-h-11"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-800">Observação</span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: mãe do Pedro, turma 2"
              className="rounded-xl min-h-11"
            />
          </label>
          {lists.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-800">Listas</span>
              <ListChecks lists={lists} value={sel} onChange={setSel} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-teal-700 hover:bg-teal-800 text-white"
            disabled={saving || !phone.trim()}
            onClick={save}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ListDialog({
  churchId,
  list,
  onClose,
  onSaved,
}: {
  churchId: string
  list: WaList | null
  onClose: () => void
  onSaved: (l: WaList) => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(list?.name || '')
  const [description, setDescription] = useState(list?.description || '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      onSaved(await saveList(churchId, { id: list?.id, name, description }))
    } catch (err) {
      toast({ title: 'Não deu para salvar', description: errorText(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{list ? 'Editar lista' : 'Nova lista'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Mães do infantil"
            className="rounded-xl min-h-11"
            aria-label="Nome da lista"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            className="rounded-xl min-h-11"
            aria-label="Descrição"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-teal-700 hover:bg-teal-800 text-white"
            disabled={saving || !name.trim()}
            onClick={save}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({
  churchId,
  lists,
  canCreateList,
  onClose,
  onDone,
}: {
  churchId: string
  lists: WaList[]
  canCreateList: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [groups, setGroups] = useState<WaGroup[] | null>(null)
  const [groupId, setGroupId] = useState('')
  const [preview, setPreview] = useState<GroupPreview | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [listIds, setListIds] = useState<string[]>([])
  const [newList, setNewList] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listWaGroups(churchId)
      .then((r) => setGroups(r.items))
      .catch((e) => setErr(errorText(e)))
  }, [churchId])

  const pickGroup = async (id: string) => {
    setGroupId(id)
    setPreview(null)
    setErr('')
    if (!id) return
    setLoading(true)
    try {
      const p = await previewGroup(churchId, id)
      setPreview(p)
      setNames(Object.fromEntries(p.items.map((i) => [i.phone, i.name || i.wa_name])))
      setSel(new Set(p.items.map((i) => i.phone)))
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  const group = groups?.find((g) => g.id === groupId)
  const allOn = !!preview && preview.items.length > 0 && sel.size === preview.items.length

  const run = async () => {
    if (!preview || !group) return
    setSaving(true)
    try {
      const r = await importFromGroup(churchId, {
        group_id: group.id,
        group_name: group.name,
        items: preview.items
          .filter((i) => sel.has(i.phone))
          .map((i) => ({ phone: i.phone, name: names[i.phone] || '' })),
        list_ids: listIds,
        new_list: newList.trim() || undefined,
      })
      toast({
        title: 'Números carregados',
        description: `${r.created} novo(s), ${r.updated} que já estavam na base${r.skipped ? `, ${r.skipped} de fora` : ''}.`,
      })
      onDone()
    } catch (e) {
      toast({ title: 'Não deu para carregar', description: errorText(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carregar números de um grupo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <select
            className={fieldClass}
            value={groupId}
            onChange={(e) => void pickGroup(e.target.value)}
            aria-label="Grupo do WhatsApp"
          >
            <option value="">
              {groups === null && !err ? 'Lendo os grupos…' : 'Escolha o grupo'}
            </option>
            {(groups || []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.size ? ` (${g.size})` : ''}
              </option>
            ))}
          </select>
          {err && (
            <p className="text-sm text-red-700" role="alert">
              {err}
            </p>
          )}
          {loading && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo os participantes…
            </p>
          )}
          {preview && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-700">
                  <strong>{preview.items.length} números</strong> visíveis
                  {preview.hidden > 0 && ` · ${preview.hidden} escondem o número e ficam de fora`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() =>
                    setSel(allOn ? new Set() : new Set(preview.items.map((i) => i.phone)))
                  }
                >
                  {allOn ? 'Desmarcar todos' : 'Marcar todos'}
                </Button>
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80 overflow-auto">
                {preview.items.map((i) => (
                  <div
                    key={i.phone}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={sel.has(i.phone)}
                      onChange={() =>
                        setSel((s) => {
                          const n = new Set(s)
                          if (n.has(i.phone)) n.delete(i.phone)
                          else n.add(i.phone)
                          return n
                        })
                      }
                      aria-label={`Marcar ${i.display}`}
                    />
                    <span className="text-sm text-slate-700 sm:w-36 shrink-0">{i.display}</span>
                    <Input
                      value={names[i.phone] || ''}
                      onChange={(e) => setNames((n) => ({ ...n, [i.phone]: e.target.value }))}
                      placeholder="Nome"
                      className="h-9 rounded-lg text-sm order-last sm:order-none basis-full sm:basis-auto"
                      aria-label={`Nome de ${i.display}`}
                    />
                    {i.contact_id && (
                      <span className="text-xs text-teal-800 bg-teal-50 rounded-full px-2 py-0.5 shrink-0">
                        já na base
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  Pôr os marcados em lista (opcional)
                </p>
                <ListChecks lists={lists} value={listIds} onChange={setListIds} />
                {canCreateList && (
                  <Input
                    value={newList}
                    onChange={(e) => setNewList(e.target.value)}
                    placeholder="Ou crie uma lista nova, ex.: Mães do infantil"
                    className="rounded-xl min-h-11"
                    aria-label="Nova lista"
                  />
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-teal-700 hover:bg-teal-800 text-white"
            disabled={!preview || sel.size === 0 || saving}
            onClick={run}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Carregar {sel.size > 0 ? sel.size : ''} número(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
