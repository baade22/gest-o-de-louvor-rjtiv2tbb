import { useEffect, useState } from 'react'
import { listReconcileStarts } from '@/services/finance'
import type { ReconcileStarts } from '@/lib/realizedBalance'
import type { FinAccount } from '@/types/finance'

/** Início da conciliação de cada conta bancária (para o saldo só do que foi conciliado). */
export function useReconcileStarts(
  churchId: string | undefined,
  accounts: Pick<FinAccount, 'id' | 'kind'>[],
  reloadKey: unknown = 0,
) {
  const [starts, setStarts] = useState<ReconcileStarts>({})
  const ids = accounts
    .filter((a) => a.kind !== 'CAIXA')
    .map((a) => a.id)
    .sort()
    .join(',')
  useEffect(() => {
    if (!churchId || !ids) return
    let alive = true
    listReconcileStarts(churchId, ids.split(','))
      .then((s) => alive && setStarts(s))
      .catch((err) => console.error('Erro ao carregar o início da conciliação:', err))
    return () => {
      alive = false
    }
  }, [churchId, ids, reloadKey])
  return starts
}
