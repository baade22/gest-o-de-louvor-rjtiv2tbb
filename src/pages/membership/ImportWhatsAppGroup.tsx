import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { CONGREGATIONS, PERSON_STATUS_LABELS } from '@/lib/membership'
import {
  getGroupParticipants,
  importGroupParticipants,
  listImportGroups,
  type GroupParticipants,
  type ImportCan,
  type ImportGroup,
  type ImportItem,
  type ImportResult,
} from '@/services/whatsappGroupImport'
import { ArrowLeft, CheckCircle2, EyeOff, Loader2, MessageCircle, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from './shared'

type Choice = 'VISITANTE' | 'CONGREGADO' | `p:${string}`

interface Row {
  phone: string
  wa_name: string
  checked: boolean
  name: string
  choice: Choice
}

export default function ImportWhatsAppGroup() {
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const churchId = currentChurch?.id || ''

  const [groups, setGroups] = useState<ImportGroup[]>([])
  const [can, setCan] = useState<ImportCan>({ novo: false, alterar: false })
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [groupsError, setGroupsError] = useState('')
  const [groupId, setGroupId] = useState('')
  const [data, setData] = useState<GroupParticipants | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [congregation, setCongregation] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    if (!churchId) return
    setLoadingGroups(true)
    listImportGroups(churchId)
      .then((r) => {
        setGroups(r.items)
        setCan(r.can)
      })
      .catch((err) => setGroupsError(errorMessage(err, 'Não consegui ler os grupos do WhatsApp.')))
      .finally(() => setLoadingGroups(false))
  }, [churchId])

  const loadParticipants = async (id: string) => {
    setGroupId(id)
    setData(null)
    setRows([])
    setResult(null)
    setLoadError('')
    if (!id) return
    setLoading(true)
    try {
      const r = await getGroupParticipants(churchId, id)
      setData(r)
      setCan(r.can)
      setRows(
        r.unregistered.map((u) => ({
          phone: u.phone,
          wa_name: u.wa_name,
          checked: false,
          name: u.wa_name,
          choice: 'VISITANTE',
        })),
      )
    } catch (err) {
      setLoadError(errorMessage(err, 'Não consegui ler os participantes do grupo.'))
    } finally {
      setLoading(false)
    }
  }

  const group = groups.find((g) => g.id === groupId)
  const selected = rows.filter((r) => r.checked)
  // Uma ficha sem celular só pode receber um número
  const linkedIds = useMemo(
    () => new Set(rows.filter((r) => r.choice.startsWith('p:')).map((r) => r.choice.slice(2))),
    [rows],
  )
  const missingName = selected.some((r) => !r.choice.startsWith('p:') && r.name.trim().length < 2)

  const update = (phone: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.phone === phone ? { ...r, ...patch } : r)))

  const doImport = async () => {
    if (!group || !selected.length) return
    setSaving(true)
    try {
      const items: ImportItem[] = selected.map((r) =>
        r.choice.startsWith('p:')
          ? { phone: r.phone, name: r.name, person_id: r.choice.slice(2) }
          : {
              phone: r.phone,
              name: r.name.trim(),
              status: r.choice as 'VISITANTE' | 'CONGREGADO',
              congregation: congregation || undefined,
            },
      )
      const res = await importGroupParticipants(churchId, group.id, group.name, items)
      toast({
        title: 'Importação concluída',
        description: `${res.created} ficha(s) nova(s), ${res.linked} celular(es) colocado(s) em fichas.`,
      })
      await loadParticipants(group.id)
      setResult(res)
    } catch (err) {
      toast({
        title: 'Não foi possível importar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const canImport = can.novo || can.alterar

  return (
    <div className="space-y-6 pb-24">
      <div>
        <Link
          to="/membros"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Membros
        </Link>
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Importar de um grupo do WhatsApp
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Compara quem está no grupo com as fichas da Membresia. Só lê o grupo, não manda mensagem a
          ninguém.
        </p>
      </div>

      <Card className="p-4 sm:p-5 rounded-2xl border-slate-200 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Grupo</p>
        {loadingGroups ? (
          <Skeleton className="h-10 w-full rounded-xl" />
        ) : groupsError ? (
          <p className="text-sm text-red-600">{groupsError}</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-slate-500">
            O número da igreja não está em nenhum grupo. Adicione o número ao grupo e volte aqui.
          </p>
        ) : (
          <Select value={groupId} onValueChange={loadParticipants}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Escolha o grupo" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                  {g.size ? ` (${g.size})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Card>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {result && result.skipped.length > 0 && (
        <Card className="p-4 rounded-2xl border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-semibold">Ficaram de fora:</p>
          <ul className="mt-1 list-disc pl-5">
            {result.skipped.map((s, i) => (
              <li key={i}>
                {s.name}: {s.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="No grupo" value={data.total} />
            <Stat label="Já cadastrados" value={data.registered.length} />
            <Stat label="Sem ficha" value={data.unregistered.length} />
            <Stat label="Número escondido" value={data.hidden} />
          </div>

          {data.hidden > 0 && (
            <p className="flex gap-2 text-sm text-slate-500">
              <EyeOff className="h-4 w-4 shrink-0 mt-0.5" />
              {data.hidden === 1
                ? 'Um participante esconde'
                : `${data.hidden} participantes escondem`}{' '}
              o número no grupo (privacidade do WhatsApp). Esses não dá para importar daqui.
            </p>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Sem ficha na Membresia</h2>
                <p className="text-sm text-slate-500">
                  Marque quem importar. Confira o nome: vem do perfil do WhatsApp.
                </p>
              </div>
              {rows.length > 0 && canImport && (
                <Button
                  variant="outline"
                  className="h-9 rounded-xl"
                  onClick={() =>
                    setRows((rs) =>
                      rs.map((r) => ({ ...r, checked: selected.length !== rows.length })),
                    )
                  }
                >
                  {selected.length === rows.length ? 'Desmarcar todos' : 'Marcar todos'}
                </Button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">Todos os números visíveis já têm ficha.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div
                    key={r.phone}
                    className={`rounded-2xl border p-3 bg-white space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3 ${
                      r.checked ? 'border-teal-300' : 'border-slate-200'
                    }`}
                  >
                    <label className="flex items-center gap-3 sm:w-56 shrink-0">
                      <Checkbox
                        checked={r.checked}
                        disabled={!canImport}
                        onCheckedChange={(v) => update(r.phone, { checked: v === true })}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">
                          {r.phone}
                        </span>
                        {r.wa_name && (
                          <span className="block text-xs text-slate-500">{r.wa_name}</span>
                        )}
                      </span>
                    </label>
                    <Input
                      value={r.name}
                      placeholder="Nome completo"
                      disabled={r.choice.startsWith('p:')}
                      onChange={(ev) => update(r.phone, { name: ev.target.value, checked: true })}
                      className="h-10 rounded-xl sm:flex-1"
                    />
                    <Select
                      value={r.choice}
                      onValueChange={(v) => update(r.phone, { choice: v as Choice, checked: true })}
                    >
                      <SelectTrigger className="h-10 rounded-xl sm:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {can.novo && (
                          <>
                            <SelectItem value="VISITANTE">Nova ficha: Visitante</SelectItem>
                            <SelectItem value="CONGREGADO">Nova ficha: Congregado</SelectItem>
                          </>
                        )}
                        {can.alterar &&
                          data.no_phone_people
                            .filter((p) => r.choice === `p:${p.id}` || !linkedIds.has(p.id))
                            .map((p) => (
                              <SelectItem key={p.id} value={`p:${p.id}`}>
                                É {p.name} ({PERSON_STATUS_LABELS[p.status] || p.status})
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
            {can.alterar && data.no_phone_people.length > 0 && rows.length > 0 && (
              <p className="text-xs text-slate-500">
                Se a pessoa já tem ficha mas sem celular, escolha “É fulano” e o número entra na
                ficha dela.
              </p>
            )}
          </section>

          {data.registered.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">Já cadastrados</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.registered.map((p) => (
                  <Link
                    key={p.person_id}
                    to={`/membros/${p.person_id}`}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:border-teal-300"
                  >
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
                    <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                    <span className="ml-auto text-slate-500 shrink-0">{p.phone}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {selected.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
                {can.novo && (
                  <Select
                    value={congregation || 'NENHUMA'}
                    onValueChange={(v) => setCongregation(v === 'NENHUMA' ? '' : v)}
                  >
                    <SelectTrigger className="h-10 w-48 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NENHUMA">Sem congregação</SelectItem>
                      {CONGREGATIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <span className="text-sm text-slate-600">
                  {missingName ? 'Falta o nome de alguém marcado' : `${selected.length} marcado(s)`}
                </span>
                <Button
                  onClick={doImport}
                  disabled={saving || missingName}
                  className="ml-auto h-10 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Importar
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !loadError && groups.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <MessageCircle className="h-4 w-4" /> Escolha um grupo para ver os participantes.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3 rounded-2xl border-slate-200">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
    </Card>
  )
}
