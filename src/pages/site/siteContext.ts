import { useOutletContext } from 'react-router-dom'
import type { PublicSite } from '@/services/site'

export interface SiteCtx {
  site: PublicSite
  /** slug do site (?s=) quando não é o site principal */
  slug: string
  /** monta o link interno mantendo o ?s= */
  to: (path: string) => string
}

export function useSite(): SiteCtx {
  return useOutletContext<SiteCtx>()
}
