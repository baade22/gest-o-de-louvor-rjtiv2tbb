import React, { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Lock, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { shiftMonth } from '@/lib/financeSummary'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { FinAccountKind, FinBillDocumentType, FinPaymentMethod } from '@/types/finance'

/**
 * Quem vê o Financeiro: MASTER, ADMIN, quem tem a função FINANCEIRO e o conselho fiscal (AUDITOR).
 * Quem lança e edita: MASTER e FINANCEIRO (ADMIN e conselho fiscal só acompanham).
 * Quem audita (aprova ou registra ressalva): MASTER e conselho fiscal.
 */
export function useFinanceAccess() {
  const { isMaster, isAdmin, operationalRoles } = useAuth()
  const isTreasurer = operationalRoles.includes('FINANCEIRO')
  const isAuditor = operationalRoles.includes('AUDITOR')
  return {
    canView: isMaster || isAdmin || isTreasurer || isAuditor,
    canEdit: isMaster || isTreasurer,
    canAudit: isMaster || isAuditor,
  }
}

export const ACCOUNT_KIND_LABELS: Record<FinAccountKind, string> = {
  CAIXA: 'Caixa (dinheiro)',
  BANCO: 'Conta bancária',
  APLICACAO: 'Aplicação',
  OUTRA: 'Outra',
}

export const PAYMENT_METHOD_LABELS: Record<FinPaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto',
  CHEQUE: 'Cheque',
  OUTRO: 'Outro',
}

export const DOCUMENT_TYPE_LABELS: Record<FinBillDocumentType, string> = {
  BOLETO: 'Boleto',
  NOTA_FISCAL: 'Nota fiscal',
  RECIBO: 'Recibo',
  FATURA: 'Fatura',
  CONTRATO: 'Contrato',
  OUTRO: 'Outro',
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

/** "2026-10" → "Outubro de 2026" */
export const monthLabel = (ym: string) => {
  const name = MONTHS[Number(ym.slice(5, 7)) - 1] || ''
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${ym.slice(0, 4)}`
}
export const monthShort = (ym: string) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]

/** "2026-10-12 12:00:00.000Z" → "12/10" (ou "12/10/2026" com o ano) */
export function shortDate(date: string, withYear = false) {
  const [y, m, d] = (date || '').slice(0, 10).split('-')
  if (!d) return ''
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`
}

export function MonthSwitcher({
  value,
  onChange,
}: {
  value: string
  onChange: (ym: string) => void
}) {
  return (
    <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-white shadow-xs">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(value, -1))}
        className="grid h-full w-9 place-items-center text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[132px] text-center text-sm font-semibold text-slate-800">
        {monthLabel(value)}
      </span>
      <button
        type="button"
        aria-label="Próximo mês"
        onClick={() => onChange(shiftMonth(value, 1))}
        className="grid h-full w-9 place-items-center text-slate-500 hover:text-slate-900"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function ReadOnlyNotice() {
  const { operationalRoles } = useAuth()
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <Lock className="h-4 w-4 shrink-0 text-slate-400" />
      {operationalRoles.includes('AUDITOR')
        ? 'Você acompanha o financeiro como conselho fiscal. Aprovações e ressalvas ficam em Auditoria.'
        : 'Você acompanha o financeiro em modo leitura. Para lançar, peça a função Financeiro a um administrador.'}
    </div>
  )
}

export const cardClass = 'rounded-xl border border-slate-200 bg-white shadow-xs'
export const primaryButtonClass =
  'h-10 gap-2 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800'

export interface PickerOption {
  id: string
  label: string
  hint?: string
}

/**
 * Lista com busca (pessoas, fornecedores). Quando a busca não encontra ninguém e `onCreate`
 * existe, oferece cadastrar o nome digitado ali mesmo.
 */
export function SearchPicker({
  value,
  options,
  onChange,
  placeholder,
  onCreate,
  createLabel = 'Cadastrar',
}: {
  value: string
  options: PickerOption[]
  onChange: (id: string) => void
  placeholder: string
  onCreate?: (name: string) => Promise<string>
  createLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const selected = options.find((o) => o.id === value)
  const term = search.trim()
  const exact = options.some((o) => o.label.toLowerCase() === term.toLowerCase())

  const handleCreate = async () => {
    if (!onCreate || !term) return
    setCreating(true)
    try {
      const id = await onCreate(term)
      onChange(id)
      setOpen(false)
      setSearch('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="h-10 w-full justify-between rounded-lg border-slate-200 font-normal"
        >
          <span className={cn('truncate', !selected && 'text-slate-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Digite para buscar…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {onCreate && term ? 'Ninguém com esse nome.' : 'Nada encontrado.'}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.label} ${o.hint || ''} ${o.id}`}
                  onSelect={() => {
                    onChange(o.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('h-4 w-4', o.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto text-xs text-slate-400">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && term && !exact && (
              <CommandGroup>
                <CommandItem
                  value={`__create__ ${term}`}
                  onSelect={handleCreate}
                  disabled={creating}
                >
                  <Plus className="h-4 w-4" />
                  {createLabel} “{term}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Mensagem de erro do PocketBase em português, quando der para entender. */
export function errorMessage(err: unknown, fallback: string) {
  const e = err as { status?: number; message?: string }
  if (e?.status === 403 || e?.status === 404) return 'Você não tem permissão para fazer isso.'
  if (e?.status === 400) return 'Confira os campos e tente de novo.'
  return fallback
}
