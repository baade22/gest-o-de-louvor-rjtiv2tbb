import { useCallback, useEffect, useState } from 'react'
import {
  listAccounts,
  listCategories,
  listCostCenters,
  listPeople,
  listRecentEvents,
  listSuppliers,
} from '@/services/finance'
import type { FinanceLookups } from './TransactionSheet'

const EMPTY: FinanceLookups = {
  accounts: [],
  categories: [],
  costCenters: [],
  suppliers: [],
  people: [],
  events: [],
}

/** Cadastros que as telas de lançamento usam (contas, categorias, pessoas...). */
export function useFinanceLookups(churchId?: string) {
  const [lookups, setLookups] = useState<FinanceLookups>(EMPTY)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!churchId) return
    const [accounts, categories, costCenters, suppliers, people, events] = await Promise.all([
      listAccounts(churchId),
      listCategories(churchId),
      listCostCenters(churchId),
      listSuppliers(churchId),
      listPeople(churchId),
      listRecentEvents(churchId).then((r) => r.items),
    ])
    setLookups({ accounts, categories, costCenters, suppliers, people, events })
  }, [churchId])

  useEffect(() => {
    setLoading(true)
    reload()
      .catch((err) => console.error('Erro ao carregar cadastros do financeiro:', err))
      .finally(() => setLoading(false))
  }, [reload])

  return { lookups, loading, reload }
}
