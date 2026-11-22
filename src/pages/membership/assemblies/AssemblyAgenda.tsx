import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addCandidate,
  deleteCandidate,
  deleteItem,
  saveItem,
} from '@/services/assemblies'
import {
  ITEM_KIND_LABELS,
  MAJORITY_LABELS,
  METHOD_LABELS,
  OFFICE_SUGGESTIONS,
  dateNumeric,
  missingQualification,
  type AssemblyItem,
  type AssemblyItemKind,
  type Majority,
  type VoteMethod,
} from '@/lib/assemblies'
import { AlertTriangle, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { PersonPicker, errorMessage } from '../shared'
import { Field, Panel, inputClass, selectClass, toPbDate, ymd, type AssemblyCtx } from './common'

type Draft = {
  kind: AssemblyItemKind
  title: string
  description: string
  seats: number
  term_start: string
  term_end: string
  method: VoteMethod
  majority: Majority
  office_date: string
}

const blank = (date: string): Draft => ({
  kind: 'ELEICAO',
  title: '',
  description: '',
  seats: 1,
  term_start: '',
  term_end: '',
  method: 'ESCRUTINIO_SECRETO',
  majority: 'SIMPLES',
  office_date: date,
})

export default function AssemblyAgenda({ ctx }: { ctx: AssemblyCtx }) {
  const { assembly, items, candidates, people, peopleById, canEdit, reload } = ctx
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [editing, setEditing] = useState<AssemblyItem | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(blank(ymd(assembly.date)))
  const [pickFor, setPickFor] = useState<AssemblyItem | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((p) => ({ ...p, [k]: v }))

  const fail = (err: unknown) =>
    toast({
      title: 'Não foi possível salvar',
      description: errorMessage(err, 'Tente de novo.'),
      variant: 'destructive',
    })

  const openNew = () => {
    setEditing(null)
    setDraft(blank(ymd(assembly.date)))
    setOpen(true)
  }
  const openEdit = (it: AssemblyItem) => {
    setEditing(it)
    setDraft({
      kind: it.kind,
      title: it.title,
      description: it.description || '',
      seats: it.seats || 1,
      term_start: ymd(it.term_start),
      term_end: ymd(it.term_end),
      method: (it.method || 'ESCRUTINIO_SECRETO') as VoteMethod,
      majority: (it.majority || 'SIMPLES') as Majority,
      office_date: ymd(it.office_date),
    })
    setOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.title.trim()) return
    try {
      await saveItem(assembly, editing?.id || null, {
        ...draft,
        title: draft.title.trim(),
        seats: draft.kind === 'ELEICAO' ? Math.max(1, draft.seats) : 1,
        term_start: toPbDate(draft.term_start),
        term_end: toPbDate(draft.term_end),
        office_date: toPbDate(draft.office_date),
        ...(editing ? {} : { order: items.length + 1 }),
      })
      setOpen(false)
      await reload()
    } catch (err) {
      fail(err)
    }
  }

  const removeItem = (it: AssemblyItem) =>
    confirm({
      title: `Tirar "${it.title}" da pauta?`,
      description: 'Os candidatos e votos deste ponto também saem.',
      confirmLabel: 'Tirar',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteItem(it.id)
          await reload()
        } catch (err) {
          fail(err)
        }
      },
    })

  const pick = async (personId: string) => {
    if (!pickFor) return
    try {
      const count = candidates.filter((c) => c.item_id === pickFor.id).length
      await addCandidate(pickFor, personId, count + 1)
      setPickFor(null)
      await reload()
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="space-y-4">
      {dialog}
      <Panel
        title="Pauta"
        description="Cada ponto é uma eleição (vários candidatos), uma recondução (sim ou não, ex.: reeleição do pastor) ou um assunto para deliberar."
        actions={
          canEdit && (
            <Button onClick={openNew} className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800">
              <Plus className="h-4 w-4" />
              Novo ponto
            </Button>
          )
        }
      >
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ainda sem pontos. Ex.: "Pastor Presidente" (recondução), "Diretoria" (eleição),
            "Conselho Fiscal" (eleição com 3 vagas).
          </p>
        ) : (
          <ol className="space-y-3">
            {items.map((it, i) => {
              const cands = candidates.filter((c) => c.item_id === it.id)
              const single = it.kind === 'REFERENDO'
              return (
                <li key={it.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">
                        {i + 1}. {it.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {ITEM_KIND_LABELS[it.kind]}
                        {it.kind === 'ELEICAO' && (it.seats || 1) > 1 ? ` · ${it.seats} vagas` : ''}
                        {it.method ? ` · ${METHOD_LABELS[it.method]}` : ''}
                        {it.term_start
                          ? ` · mandato ${dateNumeric(it.term_start)} a ${dateNumeric(it.term_end)}`
                          : ''}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar ponto"
                          onClick={() => openEdit(it)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Tirar ponto"
                          onClick={() => removeItem(it)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {it.kind !== 'DELIBERACAO' && (
                    <div className="space-y-1.5">
                      <ul className="flex flex-wrap gap-2">
                        {cands.map((c) => {
                          const p = peopleById.get(c.person_id)
                          const miss = p ? missingQualification(p) : []
                          return (
                            <li
                              key={c.id}
                              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-3 pr-1 py-1 text-sm"
                            >
                              {p ? (
                                <Link to={`/membros/${p.id}`} className="hover:underline">
                                  {p.name}
                                </Link>
                              ) : (
                                'Ficha removida'
                              )}
                              {miss.length > 0 && (
                                <span title={`Falta na ficha: ${miss.join(', ')}`}>
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                </span>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  aria-label="Tirar candidato"
                                  onClick={async () => {
                                    try {
                                      await deleteCandidate(c.id)
                                      await reload()
                                    } catch (err) {
                                      fail(err)
                                    }
                                  }}
                                  className="h-6 w-6 rounded-full hover:bg-slate-200 flex items-center justify-center"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </li>
                          )
                        })}
                        {canEdit && !(single && cands.length >= 1) && (
                          <li>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPickFor(it)}
                              className="rounded-full gap-1.5 h-8"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              {single ? 'Quem será reconduzido' : 'Candidato'}
                            </Button>
                          </li>
                        )}
                      </ul>
                      {cands.some((c) => {
                        const p = peopleById.get(c.person_id)
                        return p && missingQualification(p).length > 0
                      }) && (
                        <p className="text-[11px] text-amber-700">
                          <AlertTriangle className="inline h-3 w-3 mr-1" />
                          Há fichas sem os dados que o cartório pede. Toque no nome e complete
                          RG, CPF, profissão, nacionalidade, estado civil e endereço.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar ponto da pauta' : 'Novo ponto da pauta'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="i-kind" label="Tipo" className="sm:col-span-2">
                <select
                  id="i-kind"
                  value={draft.kind}
                  onChange={(e) => set('kind', e.target.value as AssemblyItemKind)}
                  className={selectClass}
                >
                  {(Object.keys(ITEM_KIND_LABELS) as AssemblyItemKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ITEM_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="i-title"
                label={draft.kind === 'DELIBERACAO' ? 'Assunto' : 'Cargo'}
                className="sm:col-span-2"
              >
                <Input
                  id="i-title"
                  value={draft.title}
                  onChange={(e) => set('title', e.target.value)}
                  list={draft.kind === 'DELIBERACAO' ? undefined : 'office-options'}
                  placeholder={
                    draft.kind === 'DELIBERACAO' ? 'Ex: Aprovação das contas de 2026' : 'Pastor Presidente'
                  }
                  className={inputClass}
                  required
                />
                <datalist id="office-options">
                  {OFFICE_SUGGESTIONS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </Field>
              <Field id="i-desc" label="Observação (opcional, sai na ata)" className="sm:col-span-2">
                <Textarea
                  id="i-desc"
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </Field>
              {draft.kind === 'ELEICAO' && (
                <Field id="i-seats" label="Vagas">
                  <Input
                    id="i-seats"
                    type="number"
                    min={1}
                    value={draft.seats}
                    onChange={(e) => set('seats', Number(e.target.value) || 1)}
                    className={inputClass}
                  />
                </Field>
              )}
              <Field id="i-method" label="Forma de votação">
                <select
                  id="i-method"
                  value={draft.method}
                  onChange={(e) => set('method', e.target.value as VoteMethod)}
                  className={selectClass}
                >
                  {(Object.keys(METHOD_LABELS) as VoteMethod[]).map((k) => (
                    <option key={k} value={k}>
                      {METHOD_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              {draft.method !== 'ACLAMACAO' && (
                <Field id="i-majority" label="Maioria exigida">
                  <select
                    id="i-majority"
                    value={draft.majority}
                    onChange={(e) => set('majority', e.target.value as Majority)}
                    className={selectClass}
                  >
                    {(Object.keys(MAJORITY_LABELS) as Majority[]).map((k) => (
                      <option key={k} value={k}>
                        {MAJORITY_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {draft.kind !== 'DELIBERACAO' && (
                <>
                  <Field id="i-ts" label="Mandato: início">
                    <Input
                      id="i-ts"
                      type="date"
                      value={draft.term_start}
                      onChange={(e) => set('term_start', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field id="i-te" label="Mandato: fim">
                    <Input
                      id="i-te"
                      type="date"
                      value={draft.term_end}
                      onChange={(e) => set('term_end', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    id="i-od"
                    label="Data da posse"
                    hint="Mesma data da assembleia = posse na própria assembleia."
                  >
                    <Input
                      id="i-od"
                      type="date"
                      value={draft.office_date}
                      onChange={(e) => set('office_date', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-xl bg-teal-700 hover:bg-teal-800">
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pickFor} onOpenChange={(v) => !v && setPickFor(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pickFor?.title}: escolher a ficha</DialogTitle>
          </DialogHeader>
          <PersonPicker
            people={people}
            exclude={
              new Set(candidates.filter((c) => c.item_id === pickFor?.id).map((c) => c.person_id))
            }
            onPick={(p) => pick(p.id)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
