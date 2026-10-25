// Andamento das campanhas (reforma, missões, congresso) a partir dos lançamentos ligados a elas.
// Lançamentos estornados nunca entram. Entradas somam o arrecadado; saídas, o gasto.

import type { FinCampaign, FinTransaction } from '@/types/finance'

type Tx = Pick<FinTransaction, 'type' | 'amount_cents' | 'status' | 'date'> &
  Partial<Pick<FinTransaction, 'campaign_id' | 'person_id' | 'is_anonymous'>>
type Campaign = Pick<FinCampaign, 'id'> & Partial<Pick<FinCampaign, 'goal_cents' | 'end_date'>>

export interface CampaignProgress {
  raised: number
  spent: number
  /** raised - spent */
  balance: number
  /** Pessoas diferentes que contribuíram com nome. */
  participants: number
  /** Entradas sem nome. */
  anonymousCount: number
  entries: number
  /** 0 a 100 (pode passar de 100 quando a meta é batida); null sem meta. */
  pct: number | null
  /** Dias até o término (0 no último dia, negativo depois); null sem término. */
  daysLeft: number | null
}

const DAY = 86400000
const dayNumber = (ymd: string) => Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`) / DAY

export function campaignProgress(campaign: Campaign, txs: Tx[], today: string): CampaignProgress {
  let raised = 0
  let spent = 0
  let entries = 0
  let anonymousCount = 0
  const people = new Set<string>()
  for (const tx of txs) {
    if (tx.campaign_id !== campaign.id || tx.status === 'ESTORNADO') continue
    if (tx.type === 'ENTRADA') {
      raised += tx.amount_cents
      entries += 1
      if (tx.person_id && !tx.is_anonymous) people.add(tx.person_id)
      else anonymousCount += 1
    } else if (tx.type === 'SAIDA') spent += tx.amount_cents
  }
  const goal = campaign.goal_cents || 0
  return {
    raised,
    spent,
    balance: raised - spent,
    participants: people.size,
    anonymousCount,
    entries,
    pct: goal > 0 ? (raised / goal) * 100 : null,
    daysLeft: campaign.end_date ? dayNumber(campaign.end_date) - dayNumber(today) : null,
  }
}
