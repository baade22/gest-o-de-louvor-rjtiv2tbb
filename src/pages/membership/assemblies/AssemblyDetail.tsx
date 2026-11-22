import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople } from '@/services/people'
import { getChurchForDocs } from '@/services/churchDocs'
import {
  deleteAssembly,
  getAssembly,
  listAttendees,
  listCandidates,
  listItems,
} from '@/services/assemblies'
import { ASSEMBLY_KIND_LABELS, ASSEMBLY_STATUS_LABELS, dateNumeric } from '@/lib/assemblies'
import type { Church, Person } from '@/types'
import type { Assembly, AssemblyAttendee, AssemblyCandidate, AssemblyItem } from '@/lib/assemblies'
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Megaphone,
  Trash2,
  UserCheck,
  Vote,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'
import { STATUS_STYLE } from './Assemblies'
import type { AssemblyCtx } from './common'
import AssemblySetup from './AssemblySetup'
import AssemblyAgenda from './AssemblyAgenda'
import AssemblyAttendance from './AssemblyAttendance'
import AssemblyVoting from './AssemblyVoting'
import AssemblyMinutes from './AssemblyMinutes'

export default function AssemblyDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const { currentChurch, can } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [assembly, setAssembly] = useState<Assembly | null>(null)
  const [items, setItems] = useState<AssemblyItem[]>([])
  const [candidates, setCandidates] = useState<AssemblyCandidate[]>([])
  const [attendees, setAttendees] = useState<AssemblyAttendee[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [church, setChurch] = useState<Church | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('convocacao')

  const reload = useCallback(async () => {
    if (!currentChurch) return
    try {
      const [a, it, c, at, p, ch] = await Promise.all([
        getAssembly(id),
        listItems(id),
        listCandidates(id),
        listAttendees(id),
        listPeople(currentChurch.id),
        getChurchForDocs(currentChurch.id),
      ])
      setAssembly(a)
      setItems(it)
      setCandidates(c)
      setAttendees(at)
      setPeople(p)
      setChurch(ch)
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível abrir a assembleia.'))
    }
  }, [id, currentChurch])

  useEffect(() => {
    reload()
  }, [reload])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!assembly || !church) return <Skeleton className="h-64 rounded-2xl" />

  const locked = assembly.status === 'FINALIZADA'
  const ctx: AssemblyCtx = {
    assembly,
    items,
    candidates,
    attendees,
    people,
    peopleById,
    church,
    reload,
    locked,
    canEdit: !locked && can('membresia.assembleias.alterar'),
    canTally:
      !locked && (can('membresia.assembleias.apurar') || can('membresia.assembleias.alterar')),
    canAta: can('membresia.assembleias.ata'),
  }

  const remove = () =>
    confirm({
      title: 'Excluir assembleia?',
      description: 'A pauta, os candidatos, a presença e os votos registrados também saem.',
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteAssembly(assembly.id)
          navigate('/membros/assembleias')
        } catch (err) {
          toast({
            title: 'Não foi possível excluir',
            description: errorMessage(err, 'Tente de novo.'),
            variant: 'destructive',
          })
        }
      },
    })

  const tabs: [string, string, LucideIcon][] = [
    ['convocacao', 'Convocação', Megaphone],
    ['pauta', 'Pauta e cargos', ClipboardList],
    ['presenca', 'Presença', UserCheck],
    ['votacao', 'Votação', Vote],
    ['ata', 'Ata e cartório', FileText],
  ]

  return (
    <div className="space-y-5">
      {dialog}
      <div className="space-y-2">
        <Link
          to="/membros/assembleias"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Assembleias
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {assembly.title}
            </h1>
            <p className="text-sm text-slate-500">
              {dateNumeric(assembly.date)}
              {assembly.kind ? ` · Assembleia ${ASSEMBLY_KIND_LABELS[assembly.kind].toLowerCase()}` : ''}
            </p>
          </div>
          {assembly.status && (
            <span
              className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_STYLE[assembly.status]}`}
            >
              {ASSEMBLY_STATUS_LABELS[assembly.status]}
            </span>
          )}
          {!locked && can('membresia.assembleias.excluir') && (
            <Button variant="outline" size="sm" onClick={remove} className="rounded-xl gap-1.5">
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-full justify-start sm:min-w-max gap-1 rounded-none border-b border-slate-200 bg-transparent p-0">
            {tabs.map(([value, label, Icon]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-w-0 flex-1 flex-col gap-1 whitespace-normal px-1 text-center text-[11px] leading-tight sm:flex-none sm:flex-row sm:whitespace-nowrap sm:text-sm sm:gap-1.5 rounded-none border-b-2 border-transparent sm:px-3 py-2.5 font-semibold text-slate-500 data-[state=active]:border-teal-600 data-[state=active]:text-teal-800 data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="convocacao" className="pt-4">
          <AssemblySetup ctx={ctx} />
        </TabsContent>
        <TabsContent value="pauta" className="pt-4">
          <AssemblyAgenda ctx={ctx} />
        </TabsContent>
        <TabsContent value="presenca" className="pt-4">
          <AssemblyAttendance ctx={ctx} />
        </TabsContent>
        <TabsContent value="votacao" className="pt-4">
          <AssemblyVoting ctx={ctx} />
        </TabsContent>
        <TabsContent value="ata" className="pt-4">
          <AssemblyMinutes ctx={ctx} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
