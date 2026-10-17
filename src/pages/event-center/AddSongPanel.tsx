import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, Search } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Input } from '@/components/ui/input'
import type { EventSong, Song } from '@/types'

interface AddSongPanelProps {
  churchId: string
  library: Song[]
  songs: EventSong[]
  onAdd: (song: Song) => Promise<void>
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Busca no acervo e sugere as músicas mais tocadas que ainda não estão no culto. */
export function AddSongPanel({ churchId, library, songs, onAdd }: AddSongPanelProps) {
  const [query, setQuery] = useState('')
  const [popularIds, setPopularIds] = useState<string[]>([])
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    pb.collection('event_songs')
      .getList<EventSong>(1, 300, {
        filter: `church_id = "${churchId}"`,
        sort: '-created',
        fields: 'song_id',
      })
      .then((res) => {
        const counts = new Map<string, number>()
        for (const item of res.items) counts.set(item.song_id, (counts.get(item.song_id) || 0) + 1)
        if (alive)
          setPopularIds([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [churchId])

  const inEvent = useMemo(() => new Set(songs.map((s) => s.song_id)), [songs])

  const results = useMemo(() => {
    const available = library.filter((s) => !inEvent.has(s.id))
    const q = normalize(query.trim())
    if (q) {
      return available
        .filter((s) => normalize(`${s.title} ${s.artist || ''}`).includes(q))
        .slice(0, 8)
    }
    const byId = new Map(available.map((s) => [s.id, s]))
    const popular = popularIds.map((id) => byId.get(id)).filter(Boolean) as Song[]
    return (popular.length ? popular : available).slice(0, 5)
  }, [library, inEvent, query, popularIds])

  const handleAdd = async (song: Song) => {
    setAddingId(song.id)
    try {
      await onAdd(song)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <h3 className="text-sm font-semibold text-slate-900">Adicionar música</h3>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar no acervo…"
          className="h-9 rounded-lg pl-9"
          aria-label="Buscar música no acervo"
        />
      </div>
      <div className="mt-3 text-xs font-medium text-slate-500">
        {query.trim()
          ? `${results.length ? 'Resultados' : 'Nada encontrado'}`
          : popularIds.length
            ? 'Mais tocadas'
            : 'Do acervo'}
      </div>
      <ul className="mt-1 divide-y divide-slate-100">
        {results.map((song) => (
          <li key={song.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{song.title}</div>
              <div className="truncate text-xs text-slate-500">
                {[song.artist, song.key].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleAdd(song)}
              disabled={addingId !== null}
              aria-label={`Adicionar ${song.title}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-50"
            >
              {addingId === song.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {query.trim() && results.length === 0 && (
        <Link
          to="/songs/new"
          className="mt-2 inline-block text-sm font-medium text-teal-700 hover:underline"
        >
          Cadastrar nova música
        </Link>
      )}
    </section>
  )
}
