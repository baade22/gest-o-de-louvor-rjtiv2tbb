import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { txEffect } from '@/lib/balanceDiff'
import { isRealized, type ReconcileStarts } from '@/lib/realizedBalance'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { voidTransaction } from '@/services/finance'
import type { FinAccount, FinCategory, FinTransaction } from '@/types/finance'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/ConfirmDialog'
import { shortDate } from './shared'

/**
 * De onde vem a diferença entre o saldo conciliado e o previsto: os lançamentos que ainda não
 * valem no saldo (sem movimento do banco ligado, ou com data no futuro).
 */
export function UnreconciledDialog({
  accounts,
  ledger,
  starts,
  categories,
  canEdit,
  onVoided,
  onClose,
}: {
  accounts: FinAccount[]
  ledger: FinTransaction[]
  starts: ReconcileStarts
  categories: FinCategory[]
  canEdit: boolean
  onVoided: (id: string) => void
  onClose: () => void
}) {
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [busy, setBusy] = useState('')
  const today = getLocalTodayYMD()

  const rows = useMemo(() => {
    const out: { tx: FinTransaction; account: FinAccount; effect: number }[] = []
    for (const tx of ledger) {
      for (const account of accounts) {
        const effect = txEffect(tx, account.id)
        if (effect !== 0 && !isRealized(tx, account.id, starts)) out.push({ tx, account, effect })
      }
    }
    return out.sort((a, b) => a.tx.date.localeCompare(b.tx.date))
  }, [accounts, ledger, starts])
  const total = rows.reduce((s, r) => s + r.effect, 0)

  const accName = (id?: string) => accounts.find((a) => a.id === id)?.name || 'outra conta'
  const describe = (tx: FinTransaction, accountId: string) => {
    if (tx.type === 'TRANSFERENCIA') {
      return tx.account_id === accountId
        ? `Transferência para ${accName(tx.to_account_id)}`
        : `Transferência de ${accName(tx.account_id)}`
    }
    return tx.description || categories.find((c) => c.id === tx.category_id)?.name || 'Lançamento'
  }

  const askVoid = (tx: FinTransaction, label: string) =>
    confirm({
      title: 'Estornar este lançamento?',
      description: `${label} de ${formatCents(tx.amount_cents)} (${shortDate(tx.date, true)}) sai dos saldos e fica no histórico como estornado.`,
      confirmLabel: 'Estornar',
      destructive: true,
      onConfirm: async () => {
        setBusy(tx.id)
        try {
          await voidTransaction(tx.id, 'Sem movimento no banco (duplicado)')
          onVoided(tx.id)
          toast({ title: 'Lançamento estornado' })
        } finally {
          setBusy('')
        }
      },
    })

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>O que falta conciliar</DialogTitle>
            <DialogDescription>
              Lançamentos que ainda não valem no saldo: não estão ligados a um movimento do banco ou
              têm data no futuro. Se for duplicado, estorne. Se aconteceu, concilie.
            </DialogDescription>
          </DialogHeader>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nada fora do saldo.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200">
              <ul className="divide-y divide-slate-100">
                {rows.map(({ tx, account, effect }) => {
                  const label = describe(tx, account.id)
                  const future = tx.date.slice(0, 10) > today
                  return (
                    <li
                      key={`${tx.id}-${account.id}`}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <span className="w-12 shrink-0 text-xs tabular-nums text-slate-500">
                        {shortDate(tx.date)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 break-words text-sm font-semibold text-slate-900">
                          {label}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {account.name}
                          {future ? ' · data no futuro' : ' · sem movimento do banco'}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'shrink-0 text-right text-sm font-semibold tabular-nums',
                          effect > 0 ? 'text-emerald-700' : 'text-rose-700',
                        )}
                      >
                        {effect < 0 ? '− ' : '+'}
                        {formatCents(Math.abs(effect))}
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg px-2 text-xs"
                          >
                            <Link to={`/financeiro/conciliacao?conta=${account.id}`}>
                              Conciliar
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg px-2 text-xs text-rose-700 hover:text-rose-800"
                            disabled={busy === tx.id}
                            onClick={() => askVoid(tx, label)}
                          >
                            {busy === tx.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Estornar'
                            )}
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {rows.length > 0 && (
            <div className="flex justify-between px-1 text-sm">
              <span className="text-slate-500">
                {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'} fora do saldo
              </span>
              <span className="font-semibold tabular-nums">
                {total < 0 ? '− ' : '+'}
                {formatCents(Math.abs(total))}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  )
}
