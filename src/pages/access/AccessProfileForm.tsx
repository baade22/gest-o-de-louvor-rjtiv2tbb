import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Lock,
  Minus,
  Search,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  ACCESS_MODULES,
  ACTION_LABELS,
  STANDARD_ACTIONS,
  groupState,
  moduleKeys,
  screenKeys,
  withImpliedView,
  type AccessModule,
  type AccessScreen,
  type CheckState,
} from '@/lib/accessCatalog'
import { CONGREGATIONS } from '@/lib/membership'
import { getAccessProfile, saveAccessProfile } from '@/services/accessProfiles'
import { listMusicians, type MusicianDetailResponse } from '@/services/musicians'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/** Caixa de marcar com três estados (marcado, parcial, desmarcado), como no Eklesia. */
function Tick({
  state,
  onChange,
  disabled,
  label,
}: {
  state: CheckState
  onChange: (on: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'partial' ? 'mixed' : state === 'on'}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(state !== 'on')}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        state === 'on'
          ? 'border-teal-700 bg-teal-700 text-white'
          : state === 'partial'
            ? 'border-teal-700 bg-white text-teal-700'
            : 'border-slate-300 bg-white hover:border-teal-600',
      )}
    >
      {state === 'on' && <Check className="h-3 w-3" strokeWidth={3} />}
      {state === 'partial' && <Minus className="h-3 w-3" strokeWidth={3} />}
    </button>
  )
}

const Dash = () => <span className="block w-[18px] text-center text-slate-300">—</span>

/** Editor de um perfil de acesso: matriz módulo > tela > ação. Só o MASTER salva. */
export default function AccessProfileForm() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const copyFrom = params.get('copiar')
  const { currentChurch, isMaster } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSystem, setIsSystem] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [congs, setCongs] = useState<string[]>([...CONGREGATIONS])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState<MusicianDetailResponse[]>([])

  const readOnly = !isMaster
  const isNew = !id

  useEffect(() => {
    if (!currentChurch) return
    const sourceId = id || copyFrom
    setLoading(true)
    Promise.all([
      sourceId ? getAccessProfile(sourceId) : Promise.resolve(null),
      id ? listMusicians(currentChurch.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([p, m]) => {
        if (p) {
          setName(id ? p.name : `${p.name} (cópia)`)
          setDescription(p.description || '')
          setIsActive(id ? p.is_active : true)
          setIsSystem(id ? p.is_system : false)
          setSelected(new Set(p.permissions))
          setCongs(p.congregations.length ? p.congregations : [...CONGREGATIONS])
        }
        setPeople(m.filter((x) => (x.access_profiles || []).some((ap) => ap.id === id)))
      })
      .catch((err) => {
        console.error(err)
        toast({ title: 'Perfil não encontrado', variant: 'destructive' })
        navigate('/perfis-acesso')
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChurch?.id, id, copyFrom])

  const setKeys = (keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (on) next.add(k)
        else next.delete(k)
      }
      // Marcar uma ação liga o Consultar da tela; desligar o Consultar desliga a tela toda
      if (on) return new Set(withImpliedView([...next]))
      for (const k of keys) {
        if (k.endsWith('.ver')) {
          const base = k.slice(0, -3)
          for (const x of [...next]) if (x.startsWith(base)) next.delete(x)
        }
      }
      return next
    })
  }

  // Coluna de um módulo: todas as chaves daquela ação nas telas que a têm
  const columnKeys = (mod: AccessModule, action: string) =>
    mod.screens
      .filter(
        (s) =>
          (STANDARD_ACTIONS as string[]).includes(action) && s.actions.includes(action as never),
      )
      .map((s) => `${mod.key}.${s.key}.${action}`)

  const q = search.trim().toLowerCase()
  const matches = (mod: AccessModule, s: AccessScreen) =>
    !q ||
    s.label.toLowerCase().includes(q) ||
    mod.label.toLowerCase().includes(q) ||
    (s.specials || []).some((x) => x.label.toLowerCase().includes(q))

  // Prévia do menu: telas com Consultar; "só ver" quando nada mais está marcado
  const preview = useMemo(
    () =>
      ACCESS_MODULES.map((mod) => ({
        mod,
        items: mod.screens
          .filter((s) => selected.has(`${mod.key}.${s.key}.ver`))
          .map((s) => ({
            label: s.label,
            onlyView: screenKeys(mod, s).every((k) => k.endsWith('.ver') || !selected.has(k)),
          })),
      })).filter((g) => g.items.length > 0),
    [selected],
  )

  const handleSave = async () => {
    if (!currentChurch) return
    if (name.trim().length < 2) {
      toast({ title: 'Dê um nome ao perfil', variant: 'destructive' })
      return
    }
    if (congs.length === 0) {
      toast({ title: 'Escolha ao menos uma congregação', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const all = CONGREGATIONS.every((c) => congs.includes(c))
      await saveAccessProfile(id || null, {
        church_id: currentChurch.id,
        name: name.trim(),
        description: description.trim(),
        permissions: withImpliedView([...selected]),
        congregations: all ? [] : congs,
        is_active: isActive,
      })
      toast({
        title: 'Perfil salvo',
        description: id
          ? 'Quem tem este perfil já recebe os novos acessos (no próximo carregamento da página).'
          : 'Agora é só dar o perfil às pessoas em Equipe do louvor.',
      })
      navigate('/perfis-acesso')
    } catch (err) {
      console.error(err)
      toast({
        title: 'Não foi possível salvar o perfil',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[480px] w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            to="/perfis-acesso"
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Perfis de acesso
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {isNew ? 'Novo perfil' : `Perfil: ${name}`}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {readOnly
              ? 'Só o Master altera os perfis. Aqui você vê o que este perfil libera.'
              : 'Marque o que quem tem este perfil pode consultar, criar, alterar e excluir.'}
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            {!isNew && (
              <Button
                variant="outline"
                className="gap-2 rounded-xl"
                onClick={() => navigate(`/perfis-acesso/novo?copiar=${id}`)}
              >
                <Copy className="h-4 w-4" />
                Duplicar
              </Button>
            )}
            <Button variant="outline" className="rounded-xl" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 rounded-xl bg-teal-700 font-semibold text-white hover:bg-teal-800"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Salvar perfil
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ap-name">Descrição *</Label>
              <Input
                id="ap-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
                placeholder="Ex.: Tesouraria Diamante"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-desc">Observação</Label>
              <Input
                id="ap-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly}
                placeholder="Para quem é este perfil"
                className="rounded-xl"
              />
            </div>
            {isSystem && (
              <p className="text-xs text-slate-500 sm:col-span-2">
                Perfil padrão do sistema: veio das funções antigas. Você pode mudar o que ele libera
                ou desativá-lo, mas não excluí-lo.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar permissões"
                className="h-9 rounded-xl pl-9"
              />
            </div>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">Atalhos:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  onClick={() =>
                    setSelected(
                      new Set(ACCESS_MODULES.flatMap(moduleKeys).filter((k) => k.endsWith('.ver'))),
                    )
                  }
                >
                  Só consultar tudo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  onClick={() => setSelected(new Set())}
                >
                  Limpar
                </Button>
              </div>
            )}
          </div>

          {/* Cabeçalho das colunas (só em telas largas; no celular cada tela vira um cartão) */}
          <div className="hidden grid-cols-[minmax(0,1fr)_repeat(4,64px)_minmax(150px,190px)] gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 md:grid">
            <span>Módulo / tela</span>
            {STANDARD_ACTIONS.map((a) => (
              <span key={a} className="text-center">
                {ACTION_LABELS[a]}
              </span>
            ))}
            <span>Especial</span>
          </div>

          {ACCESS_MODULES.map((mod) => {
            const screens = mod.screens.filter((s) => matches(mod, s))
            if (screens.length === 0) return null
            const open = !collapsed.has(mod.key) || !!q
            const all = moduleKeys(mod)
            return (
              <div key={mod.key} className="border-b border-slate-100 last:border-b-0">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-slate-50/60 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_repeat(4,64px)_minmax(150px,190px)]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev)
                          if (next.has(mod.key)) next.delete(mod.key)
                          else next.add(mod.key)
                          return next
                        })
                      }
                      className="text-slate-500 hover:text-slate-800"
                      aria-label={open ? 'Recolher' : 'Expandir'}
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <Tick
                      state={groupState(all, selected)}
                      onChange={(on) => setKeys(all, on)}
                      disabled={readOnly}
                      label={`Tudo em ${mod.label}`}
                    />
                    <span className="text-sm font-bold text-slate-900">{mod.label}</span>
                    {mod.scoped && (
                      <span className="hidden rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline">
                        por congregação
                      </span>
                    )}
                  </div>
                  {STANDARD_ACTIONS.map((a) => {
                    const keys = columnKeys(mod, a)
                    return (
                      <div key={a} className="hidden justify-center md:flex">
                        {keys.length ? (
                          <Tick
                            state={groupState(keys, selected)}
                            onChange={(on) => setKeys(keys, on)}
                            disabled={readOnly}
                            label={`${ACTION_LABELS[a]} em ${mod.label}`}
                          />
                        ) : (
                          <Dash />
                        )}
                      </div>
                    )
                  })}
                  <span className="hidden md:block" />
                </div>

                {open &&
                  screens.map((s) => {
                    const base = `${mod.key}.${s.key}`
                    return (
                      <div
                        key={s.key}
                        className="grid gap-2 border-t border-slate-100 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_repeat(4,64px)_minmax(150px,190px)] md:items-center"
                      >
                        <span className="pl-6 text-sm text-slate-800 md:pl-12">{s.label}</span>
                        {/* No celular: as ações aparecem com o nome ao lado */}
                        <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6 md:contents">
                          {STANDARD_ACTIONS.map((a) => {
                            const k = `${base}.${a}`
                            const has = s.actions.includes(a)
                            return (
                              <label
                                key={a}
                                className={cn(
                                  'flex items-center gap-1.5 text-xs text-slate-600 md:justify-center',
                                  !has && 'max-md:hidden',
                                )}
                              >
                                {has ? (
                                  <Tick
                                    state={selected.has(k) ? 'on' : 'off'}
                                    onChange={(on) => setKeys([k], on)}
                                    disabled={readOnly}
                                    label={`${ACTION_LABELS[a]}: ${s.label}`}
                                  />
                                ) : (
                                  <Dash />
                                )}
                                <span className="md:hidden">{ACTION_LABELS[a]}</span>
                              </label>
                            )
                          })}
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 md:flex-col">
                            {(s.specials || []).map((sp) => {
                              const k = `${base}.${sp.key}`
                              return (
                                <label
                                  key={sp.key}
                                  className="flex items-center gap-1.5 text-xs text-slate-600"
                                >
                                  <Tick
                                    state={selected.has(k) ? 'on' : 'off'}
                                    onChange={(on) => setKeys([k], on)}
                                    disabled={readOnly}
                                    label={`${sp.label}: ${s.label}`}
                                  />
                                  {sp.label}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )
          })}

          <div className="grid items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-slate-400 md:grid-cols-[minmax(0,1fr)_auto]">
            <span className="pl-6 text-sm md:pl-12">Perfis de acesso</span>
            <span className="flex items-center gap-1 pl-6 text-xs">
              <Lock className="h-3.5 w-3.5" />
              só o Master
            </span>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-sm font-bold text-slate-900">Congregações liberadas</p>
            <div className="mt-3 space-y-2">
              {CONGREGATIONS.map((c) => (
                <label
                  key={c}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                >
                  <Tick
                    state={congs.includes(c) ? 'on' : 'off'}
                    onChange={(on) =>
                      setCongs((prev) => (on ? [...prev, c] : prev.filter((x) => x !== c)))
                    }
                    disabled={readOnly}
                    label={c}
                  />
                  {c}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Vale para membresia, eventos e financeiro: o que é de outra congregação fica invisível
              para este perfil.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-sm font-bold text-slate-900">
              Prévia do menu{' '}
              <span className="text-xs font-normal text-slate-400">o que a pessoa vai ver</span>
            </p>
            <div className="mt-3 space-y-3 rounded-xl bg-slate-900 p-3 text-xs text-slate-200">
              <p>Início</p>
              {preview.length === 0 && <p className="text-slate-500">Nada além do início</p>}
              {preview.map((g) => (
                <div key={g.mod.key} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {g.mod.label}
                  </p>
                  {g.items.map((it) => (
                    <p key={it.label} className="flex justify-between gap-2">
                      <span>{it.label}</span>
                      {it.onlyView && <span className="text-[10px] text-slate-500">só ver</span>}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {!isNew && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-sm font-bold text-slate-900">
                Quem tem este perfil{' '}
                <span className="text-xs font-normal text-slate-400">
                  {people.length} pessoa{people.length === 1 ? '' : 's'}
                </span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {people.map((p) => (
                  <li key={p.id} className="text-sm text-slate-800">
                    {isMaster ? (
                      <Link to={`/musicians/${p.id}/edit`} className="hover:text-teal-800">
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                  </li>
                ))}
                {people.length === 0 && <li className="text-xs text-slate-400">Ninguém ainda</li>}
              </ul>
            </div>
          )}

          <div className="flex gap-2 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Quem dá perfis às pessoas só consegue dar perfis com acessos que ela mesma tem.
              Ninguém dá mais do que tem, e só o Master altera os perfis.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
