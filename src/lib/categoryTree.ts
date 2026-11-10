// Plano de contas em árvore (grupos totalizadores e categorias), como no Eklesia.

/** Linhas na ordem da árvore (pai, depois os filhos), com a profundidade de cada uma. */
export function treeOrder<T extends { id: string; name: string; parent_id?: string }>(
  rows: T[],
): { row: T; depth: number }[] {
  const ids = new Set(rows.map((r) => r.id))
  const kids = new Map<string, T[]>()
  for (const r of rows) {
    const p = r.parent_id && ids.has(r.parent_id) ? r.parent_id : ''
    kids.set(p, [...(kids.get(p) || []), r])
  }
  const out: { row: T; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (parent: string, depth: number) => {
    const list = (kids.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    for (const r of list) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      out.push({ row: r, depth })
      walk(r.id, depth + 1)
    }
  }
  walk('', 0)
  // Sobra só o que estiver numa volta (não deveria acontecer): vai no primeiro nível
  for (const r of rows) if (!seen.has(r.id)) out.push({ row: r, depth: 0 })
  return out
}
