import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { explainBalanceDiff, type DiffGroup, type DiffKind } from '@/lib/balanceDiff'
import { listStatement } from '@/services/finance'
import type { FinAccount, FinBankLine, FinTransaction } from '@/types/finance'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { shortDate } from './shared'

const TITLES: Record<DiffKind, string> = {
  IGNORADO: 'Movimentos ignorados',
  SEM_EXTRATO: 'Lançamentos sem movimento no extrato',
  ANTES: 'Antes do primeiro movimento do extrato',
  PENDENTE: 'Movimentos ainda a conciliar',
  EXTRATO: 'Movimentos só de visualização',
  CONCILIADO: 'Conciliados com valor ou data diferente',
}

const HINTS: Record<DiffKind, string> = {
  IGNORADO:
    'O banco movimentou e o LouvorFlow não lançou. Se o movimento é real (tarifa, rendimento, transferência, pagamento), desfaça o "ignorar" e lance.',
  SEM_EXTRATO:
    'Estão no LouvorFlow nesta conta, mas não aparecem no extrato do banco: lançamento repetido, na conta errada, ou dinheiro que não passou pelo banco.',
  ANTES:
    'O extrato mostra quanto o banco tinha antes do primeiro movimento carregado. Se o LouvorFlow tinha outro valor, ajuste o saldo inicial da conta em Cadastros ou lance o que falta antes dessa data.',
  PENDENTE: 'Ainda não foram conciliados: concilie para o LouvorFlow acompanhar o banco.',
  EXTRATO:
    'Entraram antes do início da conciliação (ou numa conta só para ver o extrato) e não são conferidos com os lançamentos.',
  CONCILIADO:
    'O movimento foi ligado a um lançamento de outro valor, ou o lançamento está com data fora do período.',
}

export function BalanceDiffDialog({
  churchId,
  account,
  ledger,
  bankCents,
  day,
  onClose,
}: {
  churchId: string
  account: FinAccount
  ledger: FinTransaction[]
  bankCents: number
  day: string
  onClose: () => void
}) {
  const [lines, setLines] = useState<FinBankLine[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<DiffKind | ''>('')

  useEffect(() => {
    let alive = true
    listStatement(churchId, account.id, '2000-01-01', day)
      .then((ls) => alive && setLines(ls))
      .catch(() => alive && setError('Não foi possível carregar o extrato.'))
    return () => {
      alive = false
    }
  }, [churchId, account.id, day])

  const result = useMemo(
    () => (lines ? explainBalanceDiff(account, ledger, lines, bankCents, day) : null),
    [account, ledger, lines, bankCents, day],
  )
  // Abre o grupo que mais pesa
  useEffect(() => {
    if (!result || open) return
    const top = [...result.groups].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))[0]
    if (top) setOpen(top.kind)
  }, [result, open])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>De onde vem a diferença</DialogTitle>
          <DialogDescription>
            {account.name}, em {shortDate(day, true)}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
        {!result && !error && (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o extrato e os lançamentos…
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center">
              <div>
                <div className="text-xs text-slate-500">No banco</div>
                <div className="font-bold tabular-nums">{formatCents(result.bank_cents)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">No LouvorFlow</div>
                <div className="font-bold tabular-nums">{formatCents(result.system_cents)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Diferença</div>
                <div
                  className={cn(
                    'font-bold tabular-nums',
                    result.diff_cents === 0 ? 'text-emerald-700' : 'text-amber-700',
                  )}
                >
                  {formatCents(result.diff_cents)}
                </div>
              </div>
            </div>

            {result.diff_cents === 0 && result.groups.length === 0 && (
              <p className="text-sm text-emerald-700">Tudo batendo.</p>
            )}

            <p className="text-xs text-slate-500">
              Valor positivo: o banco tem mais que o LouvorFlow. Negativo: o LouvorFlow tem a mais.
              As partes abaixo somam a diferença.
            </p>

            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {result.groups.map((g) => (
                <GroupRow
                  key={g.kind}
                  group={g}
                  open={open === g.kind}
                  onToggle={() => setOpen(open === g.kind ? '' : g.kind)}
                  firstDay={result.first_day}
                  bankBefore={result.bank_before_cents}
                  systemBefore={result.system_before_cents}
                  opening={account.opening_balance_cents || 0}
                />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function GroupRow({
  group,
  open,
  onToggle,
  firstDay,
  bankBefore,
  systemBefore,
  opening,
}: {
  group: DiffGroup
  open: boolean
  onToggle: () => void
  firstDay: string
  bankBefore: number
  systemBefore: number
  opening: number
}) {
  const shown = group.items.slice(0, 200)
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {TITLES[group.kind]}
            {group.kind === 'ANTES' && firstDay ? ` (${shortDate(firstDay, true)})` : ''}
          </span>
          {group.kind !== 'ANTES' && (
            <span className="block text-xs text-slate-500">
              {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
            </span>
          )}
        </span>
        <span
          className={cn(
            'shrink-0 font-semibold tabular-nums',
            group.cents === 0 ? 'text-slate-500' : 'text-amber-700',
          )}
        >
          {formatCents(group.cents)}
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 pl-9">
          <p className="text-xs text-slate-600">{HINTS[group.kind]}</p>
          {group.kind === 'ANTES' ? (
            <div className="space-y-1 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700">
              {firstDay ? (
                <>
                  <div>
                    Banco antes de {shortDate(firstDay, true)}:{' '}
                    <b className="tabular-nums">{formatCents(bankBefore)}</b>
                  </div>
                  <div>
                    LouvorFlow antes dessa data:{' '}
                    <b className="tabular-nums">{formatCents(systemBefore)}</b> (saldo inicial{' '}
                    {formatCents(opening)} mais os lançamentos anteriores)
                  </div>
                  {group.cents !== 0 && (
                    <div>
                      Se não falta lançamento antes dessa data, o saldo inicial certo é{' '}
                      <b className="tabular-nums">{formatCents(opening + group.cents)}</b>.{' '}
                      <Link
                        to="/financeiro/cadastros"
                        className="font-semibold text-teal-700 underline"
                      >
                        Abrir Cadastros
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <div>Não há movimentos do extrato até esta data para comparar.</div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {shown.map((it, i) => (
                <li
                  key={(it.line_id || it.transaction_id || '') + i}
                  className="flex items-start gap-2 px-2.5 py-1.5 text-xs"
                >
                  <span className="w-12 shrink-0 tabular-nums text-slate-500">
                    {shortDate(it.date)}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-slate-700">
                    {it.description}
                    {group.kind === 'CONCILIADO' &&
                      it.system_cents !== undefined &&
                      it.bank_cents !== undefined &&
                      it.system_cents !== it.bank_cents && (
                        <span className="block text-slate-500">
                          Banco {formatCents(it.bank_cents)}, lançamento{' '}
                          {formatCents(it.system_cents)}
                        </span>
                      )}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-slate-800">
                    {formatCents(it.cents)}
                  </span>
                </li>
              ))}
              {group.items.length > shown.length && (
                <li className="px-2.5 py-1.5 text-xs text-slate-500">
                  E mais {group.items.length - shown.length}.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
