import React, { useEffect, useState } from 'react'
import type { ChurchGroup, GroupKind, Person, PersonSkill } from '@/types'
import { saveGroup, type ChurchGroupPayload } from '@/services/groups'
import { GROUP_KIND_HINTS, GROUP_KIND_LABELS, GROUP_TEMPLATES } from '@/lib/groups'
import { CONGREGATIONS, SKILL_LABELS, SKILL_ORDER } from '@/lib/membership'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
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
import { useToast } from '@/hooks/use-toast'
import { PersonPicker, errorMessage } from './shared'

const KINDS = Object.keys(GROUP_KIND_LABELS) as GroupKind[]

const EMPTY: ChurchGroupPayload = {
  name: '',
  kind: 'MINISTERIO',
  description: '',
  congregation: '',
  meeting_info: '',
  leader_id: '',
  skills: [],
  active: true,
}

export function GroupFormDialog({
  open,
  onOpenChange,
  churchId,
  group,
  people,
  existingNames = [],
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  /** Grupo para editar; sem ele, cria um novo. */
  group?: ChurchGroup | null
  people: Person[]
  existingNames?: string[]
  onSaved: (group: ChurchGroup) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<ChurchGroupPayload>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      group
        ? {
            name: group.name,
            kind: group.kind,
            description: group.description || '',
            congregation: group.congregation || '',
            meeting_info: group.meeting_info || '',
            leader_id: group.leader_id || '',
            skills: group.skills || [],
            active: group.active,
          }
        : EMPTY,
    )
  }, [open, group])

  const set = <K extends keyof ChurchGroupPayload>(key: K, value: ChurchGroupPayload[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const toggleSkill = (s: PersonSkill) =>
    set('skills', (form.skills || []).includes(s) ? form.skills!.filter((x) => x !== s) : [...(form.skills || []), s])
  const leader = people.find((p) => p.id === form.leader_id)
  const templates = GROUP_TEMPLATES.filter((t) => !existingNames.includes(t.name))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const saved = await saveGroup(churchId, group?.id || null, { ...form, name: form.name.trim() })
      toast({ title: group ? 'Grupo atualizado' : 'Grupo criado' })
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: errorMessage(err, 'Tente novamente.'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? `Editar ${group.name}` : 'Novo grupo ou ministério'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!group && templates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">Começar por um modelo</p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, name: t.name, kind: t.kind, skills: t.skills }))}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      form.name === t.name
                        ? 'bg-teal-50 border-teal-300 text-teal-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="group-name" className="text-xs font-semibold text-slate-700">
                Nome
              </Label>
              <Input
                id="group-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ex: Ministério infantil"
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => set('kind', v as GroupKind)}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {GROUP_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">{GROUP_KIND_HINTS[form.kind]}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Congregação</Label>
              <Select value={form.congregation || 'TODAS'} onValueChange={(v) => set('congregation', v === 'TODAS' ? '' : v)}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Toda a igreja</SelectItem>
                  {CONGREGATIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="group-meeting" className="text-xs font-semibold text-slate-700">
                Quando se reúne (opcional)
              </Label>
              <Input
                id="group-meeting"
                value={form.meeting_info}
                onChange={(e) => set('meeting_info', e.target.value)}
                placeholder="Ex: Domingos às 9h, sala 2"
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-leader" className="text-xs font-semibold text-slate-700">
              Líder (opcional)
            </Label>
            {leader ? (
              <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
                <span className="font-semibold text-teal-900">{leader.name}</span>
                <button type="button" className="text-xs text-teal-700 underline" onClick={() => set('leader_id', '')}>
                  trocar
                </button>
              </div>
            ) : (
              <PersonPicker id="group-leader" people={people} onPick={(p) => set('leader_id', p.id)} />
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-700">Habilidades que o grupo procura</p>
            <p className="text-[11px] text-slate-500">
              Quem marcou essas habilidades na ficha aparece como sugestão de voluntário.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SKILL_ORDER.map((s) => {
                const on = (form.skills || []).includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSkill(s)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      on ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    {SKILL_LABELS[s]}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-desc" className="text-xs font-semibold text-slate-700">
              Descrição (opcional)
            </Label>
            <Textarea
              id="group-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className="rounded-xl border-slate-200 min-h-16"
            />
          </div>
          {group && (
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              Grupo ativo
              <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-xl bg-teal-700 hover:bg-teal-800"
            onClick={submit}
            disabled={saving || !form.name.trim()}
          >
            {saving ? 'Salvando...' : group ? 'Salvar' : 'Criar grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
