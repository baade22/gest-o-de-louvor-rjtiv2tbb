import React, { useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { deleteEventType, saveEventType, type EventType } from '@/services/eventTypes'

const EMPTY = { id: '', name: '', start_time: '19:00', end_time: '21:00' }

/** Cadastro dos tipos de culto da igreja (nome + horário padrão). */
export function EventTypesDialog({
  open,
  onOpenChange,
  churchId,
  types,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  types: EventType[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await saveEventType(churchId, {
        id: form.id || undefined,
        name: form.name,
        start_time: form.start_time,
        end_time: form.end_time,
        order: form.id
          ? types.find((t) => t.id === form.id)?.order
          : Math.max(0, ...types.map((t) => t.order || 0)) + 1,
      })
      toast({ title: form.id ? 'Tipo de culto alterado' : 'Tipo de culto cadastrado' })
      setForm(EMPTY)
      onChanged()
    } catch (err: any) {
      toast({
        title: 'Não foi possível salvar',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (type: EventType) => {
    setRemoving(type.id)
    try {
      await deleteEventType(type.id)
      if (form.id === type.id) setForm(EMPTY)
      onChanged()
    } catch (err: any) {
      toast({
        title: 'Não foi possível excluir',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tipos de culto</DialogTitle>
          <DialogDescription>
            Cadastre os cultos que a igreja faz e o horário de cada um. Ao agendar, é só escolher o
            tipo e a data.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {types.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-sm text-slate-500">
              Nenhum tipo cadastrado ainda.
            </li>
          )}
          {types.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{t.name}</div>
                <div className="text-xs text-slate-500">
                  {[t.start_time, t.end_time].filter(Boolean).join(' às ') || 'Sem horário'}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Alterar ${t.name}`}
                onClick={() =>
                  setForm({
                    id: t.id,
                    name: t.name,
                    start_time: t.start_time || '',
                    end_time: t.end_time || '',
                  })
                }
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:text-red-700"
                aria-label={`Excluir ${t.name}`}
                disabled={removing === t.id}
                onClick={() => remove(t)}
              >
                {removing === t.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </li>
          ))}
        </ul>

        <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="type-name" className="text-xs font-semibold text-slate-700">
              {form.id ? 'Alterar tipo' : 'Novo tipo'}
            </Label>
            <Input
              id="type-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Culto Dominical, Congresso, Rede Jovem"
              className="rounded-lg"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="type-start" className="text-xs font-semibold text-slate-700">
                Início
              </Label>
              <Input
                id="type-start"
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type-end" className="text-xs font-semibold text-slate-700">
                Término
              </Label>
              <Input
                id="type-end"
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {form.id && (
              <Button type="button" variant="outline" onClick={() => setForm(EMPTY)}>
                Cancelar
              </Button>
            )}
            <Button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {form.id ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
