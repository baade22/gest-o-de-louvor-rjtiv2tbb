import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Copy,
  KeyRound,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import type { AccessProfile } from '@/types'
import { summarizeProfile } from '@/lib/accessCatalog'
import {
  deleteAccessProfile,
  listAccessProfiles,
  saveAccessProfile,
} from '@/services/accessProfiles'
import { listMusicians, type MusicianDetailResponse } from '@/services/musicians'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { cn } from '@/lib/utils'

const LEVEL_LABEL: Record<string, string> = { tudo: 'tudo', ver: 'ver', parcial: 'parcial' }

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return (
    (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase()
}

/** Lista dos perfis de acesso (estilo Eklesia). Só o MASTER cria e altera. */
export default function AccessProfiles() {
  const { currentChurch, isMaster } = useAuth()
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const navigate = useNavigate()

  const [profiles, setProfiles] = useState<AccessProfile[]>([])
  const [people, setPeople] = useState<MusicianDetailResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    if (!currentChurch) return
    setLoading(true)
    try {
      const [p, m] = await Promise.all([
        listAccessProfiles(currentChurch.id),
        listMusicians(currentChurch.id).catch(() => []),
      ])
      setProfiles(p)
      setPeople(m)
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar os perfis de acesso', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChurch?.id])

  const holders = useMemo(() => {
    const map: Record<string, MusicianDetailResponse[]> = {}
    for (const m of people) {
      if (!m.is_active || m.role === 'MASTER') continue
      for (const p of m.access_profiles || []) (map[p.id] = map[p.id] || []).push(m)
    }
    return map
  }, [people])

  const visible = profiles.filter(
    (p) =>
      p.is_active === !showInactive &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase())),
  )

  const toggleActive = async (p: AccessProfile, active: boolean) => {
    try {
      const saved = await saveAccessProfile(p.id, {
        church_id: p.church_id,
        name: p.name,
        description: p.description || '',
        permissions: p.permissions,
        congregations: p.congregations,
        is_active: active,
      })
      setProfiles((list) => list.map((x) => (x.id === p.id ? saved : x)))
      toast({
        title: active ? 'Perfil ativado' : 'Perfil desativado',
        description: active
          ? `Quem tem "${p.name}" volta a ter esses acessos.`
          : `Quem tem "${p.name}" perde esses acessos até você ativar de novo.`,
      })
    } catch (err) {
      console.error(err)
      toast({ title: 'Não foi possível mudar o perfil', variant: 'destructive' })
    }
  }

  const askDelete = (p: AccessProfile) => {
    const n = holders[p.id]?.length || 0
    confirm({
      title: `Excluir o perfil "${p.name}"?`,
      description:
        n > 0
          ? `${n} pessoa(s) têm este perfil e perdem os acessos dele na hora.`
          : 'Ninguém tem este perfil hoje.',
      confirmLabel: 'Excluir perfil',
      destructive: true,
      onConfirm: async () => {
        await deleteAccessProfile(p.id)
        setProfiles((list) => list.filter((x) => x.id !== p.id))
        toast({ title: 'Perfil excluído' })
      },
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Perfis de acesso
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Cada perfil diz o que a pessoa vê e o que pode mudar. Só o Master cria e altera perfis.
          </p>
        </div>
        {isMaster && (
          <Button
            onClick={() => navigate('/perfis-acesso/novo')}
            className="h-10 gap-2 rounded-xl bg-teal-700 font-semibold text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            Novo perfil
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            title: '1. Monte o perfil',
            text: 'Marque módulo por módulo: Consultar, Novo, Alterar, Excluir.',
          },
          {
            icon: UserPlus,
            title: '2. Dê o perfil às pessoas',
            text: 'Uma pessoa pode ter mais de um perfil (ex.: Músico + Financeiro). Os acessos somam.',
          },
          {
            icon: MapPin,
            title: '3. Escolha as congregações',
            text: 'Aldeia, Diamante ou as duas. Fora delas a pessoa não vê nada daquele perfil.',
          },
        ].map((s) => (
          <div
            key={s.title}
            className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <s.icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
            <div>
              <p className="text-sm font-bold text-slate-900">{s.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-900">
            {visible.length} perfi{visible.length === 1 ? 'l' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar perfil"
                className="h-9 rounded-xl pl-9"
              />
            </div>
            {(['Ativos', 'Inativos'] as const).map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setShowInactive(i === 1)}
                className={cn(
                  'h-9 rounded-full border px-3 text-xs font-semibold',
                  showInactive === (i === 1)
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound className="mx-auto mb-2 h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">Nenhum perfil aqui</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((p) => {
              const who = holders[p.id] || []
              const summary = summarizeProfile(p.permissions)
              return (
                <li
                  key={p.id}
                  className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] md:items-center"
                >
                  <Link to={`/perfis-acesso/${p.id}`} className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 hover:text-teal-800">
                      {p.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {p.description || (p.is_system ? 'PADRÃO DO SISTEMA' : '')}
                    </p>
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {summary.length === 0 ? (
                      <span className="text-xs text-slate-400">nada liberado</span>
                    ) : (
                      summary.map((s) => (
                        <span
                          key={s.module}
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                            s.module === 'financeiro'
                              ? 'bg-indigo-50 text-indigo-700'
                              : s.level === 'ver'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-teal-50 text-teal-800',
                          )}
                        >
                          {s.label} · {LEVEL_LABEL[s.level]}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(p.congregations.length ? p.congregations : ['Todas']).map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center">
                    {who.length === 0 ? (
                      <span className="text-xs text-slate-400">ninguém</span>
                    ) : (
                      <div className="flex -space-x-1.5" title={who.map((w) => w.name).join(', ')}>
                        {who.slice(0, 3).map((w) => (
                          <span
                            key={w.id}
                            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-teal-50 text-[10px] font-bold text-teal-800"
                          >
                            {initials(w.name || '?')}
                          </span>
                        ))}
                        {who.length > 3 && (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-600">
                            +{who.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.is_active}
                      disabled={!isMaster}
                      onCheckedChange={(v) => toggleActive(p, v)}
                      aria-label={p.is_active ? 'Desativar perfil' : 'Ativar perfil'}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Mais ações"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/perfis-acesso/${p.id}`)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {isMaster ? 'Editar' : 'Ver'}
                        </DropdownMenuItem>
                        {isMaster && (
                          <DropdownMenuItem
                            onClick={() => navigate(`/perfis-acesso/novo?copiar=${p.id}`)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicar
                          </DropdownMenuItem>
                        )}
                        {isMaster && !p.is_system && (
                          <DropdownMenuItem
                            onClick={() => askDelete(p)}
                            className="text-red-600 focus:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {dialog}
    </div>
  )
}
