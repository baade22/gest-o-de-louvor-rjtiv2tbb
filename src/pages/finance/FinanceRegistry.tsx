import React, { useCallback, useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { centsToInput, formatCents, parseMoneyToCents } from '@/lib/money'
import {
  listRegistry,
  saveRegistry,
  seedDefaultCategories,
  toPbDate,
  type RegistryCollection,
} from '@/services/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ACCOUNT_KIND_LABELS,
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  errorMessage,
  primaryButtonClass,
  useFinanceAccess,
} from './shared'

type Row = Record<string, any> & { id: string; name: string; is_active: boolean }

interface Field {
  key: string
  label: string
  type?: 'text' | 'money' | 'date' | 'select' | 'switch'
  options?: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
  /** Só aparece na criação (ex.: saldo inicial e tipo de categoria não mudam depois). */
  createOnly?: boolean
  hint?: string
}

interface TabConfig {
  key: RegistryCollection
  label: string
  singular: string
  /** Gênero da palavra, para "Nova conta" x "Novo fornecedor". */
  male?: boolean
  empty: string
  fields: Field[]
  defaults?: Record<string, unknown>
  summary: (row: Row) => string
  group?: (row: Row) => string
}

const TABS: TabConfig[] = [
  {
    key: 'fin_accounts',
    label: 'Contas',
    singular: 'conta',
    empty: 'Cadastre o caixa (dinheiro) e cada conta bancária da igreja.',
    defaults: { kind: 'BANCO' },
    fields: [
      {
        key: 'name',
        label: 'Nome',
        required: true,
        placeholder: 'Ex.: Banco do Brasil · Movimento',
      },
      {
        key: 'kind',
        label: 'Tipo',
        type: 'select',
        options: Object.entries(ACCOUNT_KIND_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'congregation',
        label: 'Congregação',
        placeholder: 'Ex.: Aldeia',
        hint: 'Deixe em branco se a conta é da igreja toda. O painel filtra por congregação.',
      },
      { key: 'bank_name', label: 'Banco', placeholder: 'Ex.: Banco do Brasil' },
      { key: 'agency', label: 'Agência' },
      { key: 'account_number', label: 'Conta' },
      {
        key: 'opening_balance_cents',
        label: 'Saldo inicial (R$)',
        type: 'money',
        createOnly: true,
        hint: 'Quanto havia na conta no dia em que você começou a usar o LouvorFlow.',
      },
      { key: 'opening_date', label: 'Data do saldo inicial', type: 'date', createOnly: true },
    ],
    summary: (r) =>
      [
        ACCOUNT_KIND_LABELS[r.kind as keyof typeof ACCOUNT_KIND_LABELS],
        r.congregation,
        r.bank_name,
        r.account_number,
      ]
        .filter(Boolean)
        .join(' · ') + ` · saldo inicial ${formatCents(r.opening_balance_cents || 0)}`,
  },
  {
    key: 'fin_categories',
    label: 'Categorias',
    singular: 'categoria',
    empty:
      'As categorias dizem de onde vem e para onde vai o dinheiro (Dízimo, Energia, Aluguel...).',
    defaults: { direction: 'SAIDA', is_contribution: false },
    fields: [
      { key: 'name', label: 'Nome', required: true },
      {
        key: 'direction',
        label: 'Tipo',
        type: 'select',
        createOnly: true,
        options: [
          { value: 'ENTRADA', label: 'Entrada' },
          { value: 'SAIDA', label: 'Saída' },
        ],
      },
      {
        key: 'is_contribution',
        label: 'É contribuição (pede pessoa ou anônimo)',
        type: 'switch',
        hint: 'Use para dízimo, ofertas e missões.',
      },
    ],
    group: (r) => (r.direction === 'ENTRADA' ? 'Entradas' : 'Saídas'),
    summary: (r) => (r.is_contribution ? 'Contribuição: pessoa ou anônimo' : ''),
  },
  {
    key: 'fin_cost_centers',
    label: 'Centros de custo',
    singular: 'centro de custo',
    male: true,
    empty:
      'Opcional. Sem centros de custo, tudo fica em “Geral”. O campo só aparece nos lançamentos quando houver dois ou mais.',
    fields: [{ key: 'name', label: 'Nome', required: true, placeholder: 'Ex.: Missões' }],
    summary: () => '',
  },
  {
    key: 'fin_suppliers',
    label: 'Fornecedores',
    singular: 'fornecedor',
    male: true,
    empty: 'Quem recebe pagamentos da igreja. Também dá para cadastrar direto no lançamento.',
    fields: [
      { key: 'name', label: 'Nome', required: true },
      { key: 'document', label: 'CPF ou CNPJ' },
      { key: 'pix_key', label: 'Chave PIX' },
      { key: 'phone', label: 'Telefone' },
    ],
    summary: (r) =>
      [r.document, r.pix_key && `PIX ${r.pix_key}`, r.phone].filter(Boolean).join(' · '),
  },
  {
    key: 'people',
    label: 'Pessoas',
    singular: 'pessoa',
    empty: 'Membros e congregados que contribuem. Também dá para cadastrar direto no lançamento.',
    fields: [
      { key: 'name', label: 'Nome', required: true },
      { key: 'phone', label: 'Telefone / WhatsApp' },
      { key: 'email', label: 'E-mail' },
      { key: 'document', label: 'CPF (para o informe de IR)' },
    ],
    summary: (r) => [r.phone, r.email].filter(Boolean).join(' · '),
  },
]

function RegistryTab({
  config,
  churchId,
  canEdit,
}: {
  config: TabConfig
  churchId: string
  canEdit: boolean
}) {
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [values, setValues] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listRegistry<Row>(config.key, churchId))
    } catch (err) {
      console.error(err)
      toast({ title: `Erro ao carregar ${config.label.toLowerCase()}`, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [config.key, config.label, churchId, toast])

  useEffect(() => {
    load()
  }, [load])

  const openForm = (row: Row | null) => {
    setEditing(row)
    const initial: Record<string, any> = { ...(config.defaults || {}) }
    for (const f of config.fields) {
      const v = row?.[f.key]
      if (f.type === 'money') initial[f.key] = row ? centsToInput(v || 0) : ''
      else if (f.type === 'date') initial[f.key] = v ? String(v).slice(0, 10) : ''
      else if (f.type === 'switch') initial[f.key] = row ? Boolean(v) : Boolean(initial[f.key])
      else initial[f.key] = row ? v || '' : initial[f.key] || ''
    }
    setValues(initial)
    setDialogOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const data: Record<string, unknown> = {}
    for (const f of config.fields) {
      if (editing && f.createOnly) continue
      const v = values[f.key]
      if (f.required && !String(v || '').trim()) {
        toast({ title: `Preencha: ${f.label}`, variant: 'destructive' })
        return
      }
      if (f.type === 'money') {
        const cents = String(v || '').trim() ? parseMoneyToCents(String(v)) : 0
        if (cents === null) {
          toast({ title: `Valor inválido em ${f.label}`, variant: 'destructive' })
          return
        }
        data[f.key] = cents
      } else if (f.type === 'date') {
        data[f.key] = v ? toPbDate(v) : ''
      } else if (f.type === 'switch') {
        data[f.key] = Boolean(v)
      } else {
        data[f.key] = typeof v === 'string' ? v.trim() : v
      }
    }
    setSaving(true)
    try {
      await saveRegistry(config.key, churchId, data, editing?.id)
      toast({ title: editing ? 'Alterações salvas' : `Cadastro salvo: ${String(data.name)}` })
      setDialogOpen(false)
      load()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleArchive = async (row: Row) => {
    try {
      await saveRegistry(config.key, churchId, { is_active: !row.is_active }, row.id)
      load()
    } catch (err) {
      toast({
        title: 'Não foi possível alterar',
        description: errorMessage(err, ''),
        variant: 'destructive',
      })
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await seedDefaultCategories(churchId)
      toast({ title: 'Plano de contas criado', description: 'Edite ou arquive o que não usar.' })
      load()
    } catch (err) {
      toast({
        title: 'Não foi possível criar',
        description: errorMessage(err, ''),
        variant: 'destructive',
      })
    } finally {
      setSeeding(false)
    }
  }

  const visible = rows.filter((r) => showArchived || r.is_active)
  const archivedCount = rows.length - rows.filter((r) => r.is_active).length
  const groups = config.group
    ? Array.from(new Set(visible.map(config.group)))
        .sort()
        .map((g) => ({
          name: g,
          rows: visible.filter((r) => config.group!(r) === g),
        }))
    : [{ name: '', rows: visible }]

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-slate-500">{config.empty}</p>
        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            Mostrar arquivados ({archivedCount})
          </label>
        )}
        {canEdit && (
          <Button onClick={() => openForm(null)} className={cn(primaryButtonClass, 'h-9')}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-slate-500">Nada cadastrado ainda.</p>
          {canEdit && config.key === 'fin_categories' && (
            <Button
              onClick={handleSeed}
              disabled={seeding}
              variant="outline"
              className="mt-4 gap-2 rounded-lg"
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Usar plano de contas sugerido
            </Button>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.name}>
            {group.name && (
              <div className="bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {group.name}
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {group.rows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    !row.is_active && 'opacity-60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">
                      {row.name}
                      {!row.is_active && (
                        <span className="ml-2 text-xs font-medium text-slate-400">arquivado</span>
                      )}
                    </div>
                    {config.summary(row) && (
                      <div className="truncate text-xs text-slate-500">{config.summary(row)}</div>
                    )}
                  </div>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Editar"
                        onClick={() => openForm(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={row.is_active ? 'Arquivar' : 'Reativar'}
                        title={row.is_active ? 'Arquivar' : 'Reativar'}
                        onClick={() => toggleArchive(row)}
                      >
                        {row.is_active ? (
                          <Archive className="h-4 w-4" />
                        ) : (
                          <ArchiveRestore className="h-4 w-4" />
                        )}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Editar ${config.singular}`
                : `${config.male ? 'Novo' : 'Nova'} ${config.singular}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3.5">
            {config.fields
              .filter((f) => !(editing && f.createOnly))
              .map((f) => (
                <div key={f.key} className="space-y-1.5">
                  {f.type === 'switch' ? (
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                      <span>
                        <span className="block text-sm font-semibold text-slate-700">
                          {f.label}
                        </span>
                        {f.hint && <span className="block text-xs text-slate-500">{f.hint}</span>}
                      </span>
                      <Switch
                        checked={Boolean(values[f.key])}
                        onCheckedChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                      />
                    </label>
                  ) : (
                    <>
                      <Label className="text-xs font-semibold text-slate-600">{f.label}</Label>
                      {f.type === 'select' ? (
                        <Select
                          value={values[f.key]}
                          onValueChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                        >
                          <SelectTrigger className="h-10 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {f.options?.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={f.type === 'date' ? 'date' : 'text'}
                          inputMode={f.type === 'money' ? 'decimal' : undefined}
                          placeholder={f.placeholder || (f.type === 'money' ? '0,00' : undefined)}
                          value={values[f.key] ?? ''}
                          onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                          className="h-10 rounded-lg"
                        />
                      )}
                      {f.hint && <p className="text-xs text-slate-500">{f.hint}</p>}
                    </>
                  )}
                </div>
              ))}
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className={cn(primaryButtonClass, 'h-9')}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function FinanceRegistry() {
  const { currentChurch } = useAuth()
  const { canEdit } = useFinanceAccess()
  const [tab, setTab] = useState<string>(TABS[0].key)
  if (!currentChurch) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cadastros do financeiro"
        subtitle="Contas, categorias, fornecedores e pessoas"
      />
      {!canEdit && <ReadOnlyNotice />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <RegistryTab config={t} churchId={currentChurch.id} canEdit={canEdit} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
