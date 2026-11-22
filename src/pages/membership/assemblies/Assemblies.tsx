import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { createAssembly, listAssemblies } from '@/services/assemblies'
import {
  ASSEMBLY_KIND_LABELS,
  ASSEMBLY_STATUS_LABELS,
  dateNumeric,
  type Assembly,
  type AssemblyKind,
} from '@/lib/assemblies'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { ChevronRight, Gavel, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'

export const STATUS_STYLE: Record<string, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-700',
  CONVOCADA: 'bg-amber-50 text-amber-800',
  REALIZADA: 'bg-sky-50 text-sky-800',
  FINALIZADA: 'bg-emerald-50 text-emerald-800',
}

export default function Assemblies() {
  const { currentChurch, can } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [items, setItems] = useState<Assembly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<AssemblyKind>('ORDINARIA')
  const [date, setDate] = useState(getLocalTodayYMD())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentChurch) return
    listAssemblies(currentChurch.id)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'Não foi possível carregar as assembleias.')))
      .finally(() => setLoading(false))
  }, [currentChurch])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch || !title.trim()) return
    setSaving(true)
    try {
      const a = await createAssembly(currentChurch.id, {
        title: title.trim(),
        kind,
        date: date ? `${date} 00:00:00.000Z` : '',
        voter_statuses: ['MEMBRO'],
        quorum_first: 'MAIORIA_ABSOLUTA',
        quorum_second: 'QUALQUER',
        first_call: '19:00',
        second_call: '19:30',
      })
      navigate(`/membros/assembleias/${a.id}`)
    } catch (err) {
      toast({
        title: 'Não foi possível criar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Assembleias
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Eleição e reeleição de pastores, diretoria e equipes, com a ata pronta para o cartório.
          </p>
        </div>
        {can('membresia.assembleias.novo') && (
          <Button
            onClick={() => setOpen(true)}
            className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            Nova assembleia
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <Gavel className="h-8 w-8 mx-auto text-slate-400" />
          <p className="mt-2 font-semibold text-slate-700">Nenhuma assembleia ainda</p>
          <p className="text-sm text-slate-500">
            Crie a assembleia, monte a pauta com os cargos e gere o edital de convocação.
          </p>
        </div>
      ) : (
        <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                to={`/membros/assembleias/${a.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{a.title}</p>
                  <p className="text-xs text-slate-500">
                    {dateNumeric(a.date)}
                    {a.kind ? ` · ${ASSEMBLY_KIND_LABELS[a.kind]}` : ''}
                  </p>
                </div>
                {a.status && (
                  <span
                    className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_STYLE[a.status]}`}
                  >
                    {ASSEMBLY_STATUS_LABELS[a.status]}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Nova assembleia</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="as-title" className="text-xs font-semibold">
                Nome
              </Label>
              <Input
                id="as-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Assembleia de eleição da diretoria 2027-2028"
                className="rounded-xl"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="as-kind" className="text-xs font-semibold">
                  Tipo
                </Label>
                <select
                  id="as-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AssemblyKind)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                >
                  {(Object.keys(ASSEMBLY_KIND_LABELS) as AssemblyKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ASSEMBLY_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="as-date" className="text-xs font-semibold">
                  Data
                </Label>
                <Input
                  id="as-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={saving || !title.trim()}
                className="rounded-xl bg-teal-700 hover:bg-teal-800"
              >
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
