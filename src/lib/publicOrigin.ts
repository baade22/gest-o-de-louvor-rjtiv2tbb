// Endereço público dos links que a gente copia e divulga (site da igreja, inscrições,
// convites, check-in). Quem abre o LouvorFlow pelo preview do Skip
// (…--preview.goskip.app) ou pelo endereço técnico (….goskip.app) não deve espalhar esse
// link: usamos o domínio oficial. Em qualquer outro endereço (domínio próprio, localhost)
// vale o próprio endereço da página.

const OFFICIAL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || 'https://gestao.ibmaldeia.com.br'

export function publicOrigin(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  let host = ''
  try {
    host = new URL(origin).hostname
  } catch (_) {
    return OFFICIAL.replace(/\/+$/, '')
  }
  if (/\.goskip\.(app|dev)$/i.test(host)) return OFFICIAL.replace(/\/+$/, '')
  return origin
}
