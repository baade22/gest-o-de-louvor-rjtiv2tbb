// Site e App da igreja (migração 0098): rotas públicas (hook site_public.js), rotas do painel
// (site_admin.js) e as coleções site_* lidas/gravadas direto pelo SDK (regras admin.site.* e
// admin.oracao.*).

import pb from '@/lib/pocketbase/client'
import type { ServiceTime, SiteSections } from '@/lib/site'

// ---------- Público ----------

export interface PublicAgendaItem {
  kind: 'EVENTO' | 'CULTO'
  id: string
  title: string
  date: string
  end_date: string
  time: string
  location: string
  description: string
  cover_url: string
  color: string
  url: string
  signup_open: boolean
  price: number | null
}

export interface PublicSite {
  slug: string
  church_name: string
  title: string
  short_name: string
  tagline: string
  about: string
  primary_color: string
  accent_color: string
  logo_url: string
  icon_url: string
  address: string
  maps_url: string
  phone: string
  whatsapp: string
  email: string
  instagram: string
  facebook: string
  youtube: string
  footer_text: string
  service_times: ServiceTime[]
  sections: SiteSections
  highlights: {
    id: string
    title: string
    subtitle: string
    image_url: string
    button_label: string
    link: string
  }[]
  notices: { id: string; title: string; body: string }[]
  pages: { title: string; slug: string }[]
  agenda: PublicAgendaItem[]
  campaigns: { id: string; name: string; description: string; color: string; end_date: string }[]
  pix: { key: string; key_type: string; name: string; city: string } | null
  signup_url: string
}

export interface SiteVideo {
  id: string
  title: string
  duration: string
  when: string
  kind: 'CULTO' | 'VIDEO'
  live: boolean
}

export interface SiteVideos {
  items: SiteVideo[]
  live: SiteVideo | null
  live_url: string
  channel_url: string
}

const q = (slug?: string) => (slug ? `?slug=${encodeURIComponent(slug)}` : '')

export const getPublicSite = (slug?: string) =>
  pb.send<PublicSite>(`/backend/v1/public/site${q(slug)}`, { method: 'GET' })

export const getPublicPage = (page: string, slug?: string) =>
  pb.send<{ title: string; slug: string; body: string }>(
    `/backend/v1/public/site/page?page=${encodeURIComponent(page)}${slug ? `&slug=${encodeURIComponent(slug)}` : ''}`,
    { method: 'GET' },
  )

export const getSiteVideos = (slug?: string) =>
  pb.send<SiteVideos>(`/backend/v1/public/site/videos${q(slug)}`, { method: 'GET' })

export function siteManifestUrl(slug?: string): string {
  const params = new URLSearchParams()
  if (slug) params.set('slug', slug)
  params.set('origin', window.location.origin)
  return `${pb.baseURL.replace(/\/$/, '')}/backend/v1/public/site/manifest?${params.toString()}`
}

export const sendPrayer = (body: {
  slug?: string
  kind: 'ORACAO' | 'CONTATO'
  name: string
  contact: string
  wants_contact: boolean
  message: string
  consent: boolean
  website: string
}) =>
  pb.send<{ ok: boolean }>('/backend/v1/public/site/prayer', {
    method: 'POST',
    body,
  })

/** Endereço completo de um arquivo (/api/files/...) devolvido pelas rotas públicas. */
export function siteFileUrl(path?: string): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${pb.baseURL.replace(/\/$/, '')}${path}`
}

// ---------- Painel ----------

export interface SiteSettings {
  id: string
  church_id: string
  published: boolean
  slug: string
  title: string
  short_name: string
  tagline: string
  about: string
  primary_color: string
  accent_color: string
  logo: string
  app_icon: string
  address: string
  maps_url: string
  phone: string
  whatsapp: string
  email: string
  instagram: string
  facebook: string
  youtube: string
  youtube_channel_id: string
  service_times: ServiceTime[] | null
  sections: Partial<SiteSections> | null
  signup_link_id: string
  footer_text: string
  collectionId: string
  collectionName: string
}

export interface SiteHighlight {
  id: string
  church_id: string
  title: string
  subtitle: string
  image: string
  button_label: string
  link: string
  church_event_id: string
  starts_on: string
  ends_on: string
  order: number
  active: boolean
  collectionId: string
  collectionName: string
}

export interface SiteNotice {
  id: string
  church_id: string
  title: string
  body: string
  starts_on: string
  ends_on: string
  order: number
  active: boolean
}

export interface SitePage {
  id: string
  church_id: string
  title: string
  slug: string
  body: string
  order: number
  active: boolean
}

export type PrayerStatus = 'NOVO' | 'ACOMPANHANDO' | 'CONCLUIDO'

export interface SitePrayer {
  id: string
  church_id: string
  kind: 'ORACAO' | 'CONTATO'
  name: string
  contact: string
  wants_contact: boolean
  message: string
  status: PrayerStatus
  note: string
  created: string
}

export interface SiteOptions {
  events: {
    id: string
    title: string
    starts_on: string
    ends_on: string
    start_time: string
    has_link: boolean
    registration_open: boolean
    show_on_site: boolean
  }[]
  signup_links: { id: string; title: string; active: boolean }[]
  pix_configured: boolean
  campaigns: { id: string; name: string }[]
}

export async function getSiteSettings(churchId: string): Promise<SiteSettings | null> {
  const list = await pb.collection('site_settings').getList<SiteSettings>(1, 1, {
    filter: pb.filter('church_id = {:c}', { c: churchId }),
  })
  return list.items[0] || null
}

export async function saveSiteSettings(
  churchId: string,
  id: string | null,
  data: FormData | Record<string, unknown>,
): Promise<SiteSettings> {
  if (id) return pb.collection('site_settings').update<SiteSettings>(id, data)
  if (data instanceof FormData) data.set('church_id', churchId)
  else data = { ...data, church_id: churchId }
  return pb.collection('site_settings').create<SiteSettings>(data)
}

export function siteSettingsFileUrl(rec: SiteSettings, field: 'logo' | 'app_icon'): string {
  return rec[field] ? pb.files.getURL(rec, rec[field]) : ''
}

export const listHighlights = (churchId: string) =>
  pb.collection('site_highlights').getFullList<SiteHighlight>({
    filter: pb.filter('church_id = {:c}', { c: churchId }),
    sort: 'order,created',
  })

export function highlightImageUrl(h: SiteHighlight): string {
  return h.image ? pb.files.getURL(h, h.image, { thumb: '640x0' }) : ''
}

export async function saveHighlight(churchId: string, id: string | null, data: FormData) {
  if (id) return pb.collection('site_highlights').update<SiteHighlight>(id, data)
  data.set('church_id', churchId)
  return pb.collection('site_highlights').create<SiteHighlight>(data)
}

export const deleteHighlight = (id: string) => pb.collection('site_highlights').delete(id)

export const listNotices = (churchId: string) =>
  pb.collection('site_notices').getFullList<SiteNotice>({
    filter: pb.filter('church_id = {:c}', { c: churchId }),
    sort: 'order,-created',
  })

export async function saveNotice(churchId: string, id: string | null, data: Partial<SiteNotice>) {
  if (id) return pb.collection('site_notices').update<SiteNotice>(id, data)
  return pb.collection('site_notices').create<SiteNotice>({ ...data, church_id: churchId })
}

export const deleteNotice = (id: string) => pb.collection('site_notices').delete(id)

export const listPages = (churchId: string) =>
  pb.collection('site_pages').getFullList<SitePage>({
    filter: pb.filter('church_id = {:c}', { c: churchId }),
    sort: 'order,title',
  })

export async function savePage(churchId: string, id: string | null, data: Partial<SitePage>) {
  if (id) return pb.collection('site_pages').update<SitePage>(id, data)
  return pb.collection('site_pages').create<SitePage>({ ...data, church_id: churchId })
}

export const deletePage = (id: string) => pb.collection('site_pages').delete(id)

export const getSiteOptions = (churchId: string) =>
  pb.send<SiteOptions>('/backend/v1/site/options', {
    method: 'POST',
    body: { church_id: churchId },
  })

export const setEventOnSite = (churchId: string, eventId: string, show: boolean) =>
  pb.send<{ ok: boolean }>('/backend/v1/site/event', {
    method: 'POST',
    body: { church_id: churchId, event_id: eventId, show },
  })

export const listPrayers = (churchId: string, status: PrayerStatus | 'TODOS') =>
  pb.collection('site_prayer_requests').getList<SitePrayer>(1, 200, {
    filter:
      status === 'TODOS'
        ? pb.filter('church_id = {:c}', { c: churchId })
        : pb.filter('church_id = {:c} && status = {:s}', { c: churchId, s: status }),
    sort: '-created',
  })

export const updatePrayer = (id: string, data: Partial<Pick<SitePrayer, 'status' | 'note'>>) =>
  pb.collection('site_prayer_requests').update<SitePrayer>(id, data)

export const deletePrayer = (id: string) => pb.collection('site_prayer_requests').delete(id)

export const countNewPrayers = async (churchId: string) => {
  const r = await pb.collection('site_prayer_requests').getList(1, 1, {
    filter: pb.filter("church_id = {:c} && status = 'NOVO'", { c: churchId }),
    fields: 'id',
  })
  return r.totalItems
}
