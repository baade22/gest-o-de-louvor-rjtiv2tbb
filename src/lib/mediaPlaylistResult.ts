// Traduz o resultado do comando SYNC_MEDIA_PLAYLIST (executado pelo LouvorFlow Agent no
// computador do Holyrics) numa mensagem para a tela. Antes o site só dizia "enviada" e o
// resultado real nunca aparecia, então uma falha no Holyrics ficava muda.

export interface MediaSyncCommandStatus {
  status?: string
  result?: any
  error?: string
}

export interface MediaSyncSummary {
  ok: boolean
  title: string
  description: string
}

const ITEM_PROBLEMS = new Set(['FAILED', 'PENDING_LOCAL_FILE', 'MEDIA_NOT_RECOGNIZED'])

function stripRetryNote(text: string): string {
  return String(text || '')
    .replace(/\s*\((O arquivo está salvo em disco|Arquivo preservado em disco)[^)]*\)\.?/g, '')
    .trim()
}

export function describeMediaSyncResult(cmd: MediaSyncCommandStatus): MediaSyncSummary {
  const result = cmd.result && typeof cmd.result === 'object' ? cmd.result : {}
  const items: any[] = Array.isArray(result.items) ? result.items : []
  const added = Number(result.synced_count) || 0
  const already = Number(result.already_present_count) || 0
  const problems = items.filter((it) => ITEM_PROBLEMS.has(String(it?.status || '')))
  const firstProblem = problems[0]
  const problemText = firstProblem
    ? stripRetryNote(firstProblem.error || '') || `Falha em "${firstProblem.name}".`
    : ''

  if (cmd.status === 'FAILED') {
    return {
      ok: false,
      title: 'O Holyrics não montou a playlist',
      description: problemText || stripRetryNote(cmd.error || '') || 'Falha sem detalhes do Agent.',
    }
  }

  const parts: string[] = []
  if (added > 0) parts.push(`${added} mídia(s) colocada(s) na playlist do culto`)
  if (already > 0) parts.push(`${already} já estava(m) lá`)
  const base = parts.length > 0 ? parts.join(', ') + '.' : 'Nenhuma mídia nova para colocar.'

  if (problems.length > 0) {
    return {
      ok: false,
      title: 'Playlist montada em parte',
      description: `${base} ${problems.length} não entrou: ${problemText}`,
    }
  }

  return { ok: true, title: 'Playlist do Holyrics montada', description: base }
}
