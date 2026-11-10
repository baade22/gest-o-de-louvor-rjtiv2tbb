import { useCallback, useEffect, useState } from 'react'
import {
  listAccounts,
  listCampaigns,
  listCategoryTree,
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
  campaigns: [],
}

/** Cadastros que as telas de lançamento usam (contas, categorias, pessoas...). */
export function useFinanceLookups(churchId?: string) {
  const [lookups, setLookups] = useState<FinanceLookups>(EMPTY)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!churchId) return
    const [accounts, tree, costCenters, suppliers, people, events, campaigns] = await Promise.all([
      listAccounts(churchId),
      listCategoryTree(churchId),
      listCostCenters(churchId),
      listSuppliers(churchId),
      listPeople(churchId),
      listRecentEvents(churchId).then((r) => r.items),
      listCampaigns(churchId).catch(() => []),
    ])
    const categories = tree.filter((c) => !c.is_group)
    const categoryGroups = tree.filter((c) => c.is_group)
    setLookups({
      accounts,
      categories,
      categoryGroups,
      costCenters,
      suppliers,
      people,
      events,
      campaigns,
    })
  }, [churchId])

  useEffect(() => {
    setLoading(true)
    reload()
      .catch((err) => console.error('Erro ao carregar cadastros do financeiro:', err))
      .finally(() => setLoading(false))
  }, [reload])

  return { lookups, loading, reload }
}
