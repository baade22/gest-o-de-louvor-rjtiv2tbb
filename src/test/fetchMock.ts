import { vi } from 'vitest'

// O HolyricsClient lê o corpo com res.text(). Este wrapper completa mocks de fetch
// que só definem json(), para que se comportem como uma Response real.
export function withTextBody(impl: (...args: any[]) => any) {
  return vi.fn(async (...args: any[]) => {
    const res = await impl(...args)
    if (!res || typeof res.text === 'function' || typeof res.json !== 'function') return res
    return { ...res, text: async () => JSON.stringify(await res.json()) }
  })
}
