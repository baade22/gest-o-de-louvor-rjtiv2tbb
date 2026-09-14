import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { Song } from '@/types'
import {
  Music2,
  Search,
  Plus,
  Play,
  Clock,
  MoreVertical,
  SlidersHorizontal,
  ChevronRight,
  Trash2,
  Edit,
  Youtube,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { AVAILABLE_KEYS } from '@/lib/transposition'

export default function SongsList() {
  const { currentChurch, canManageContent } = useAuth()
  const { toast } = useToast()

  const [songs, setSongs] = useState<Song[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string>('ALL')

  const fetchSongs = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const records = await pb.collection('songs').getFullList<Song>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: '-created',
      })
      setSongs(records)
    } catch (err) {
      console.error('Erro ao buscar músicas:', err)
      toast({
        title: 'Erro ao carregar repertório',
        description: 'Não foi possível buscar as músicas da igreja.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSongs()
  }, [currentChurch])

  const handleDeleteSong = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Tem certeza que deseja excluir esta música da biblioteca?')) return
    try {
      await pb.collection('songs').delete(id)
      toast({
        title: 'Música removida',
        description: 'A música foi excluída com sucesso.',
      })
      setSongs((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a música.',
        variant: 'destructive',
      })
    }
  }

  const filteredSongs = songs.filter((song) => {
    const matchesSearch =
      song.title.toLowerCase().includes(search.toLowerCase()) ||
      song.artist.toLowerCase().includes(search.toLowerCase()) ||
      (song.composer && song.composer.toLowerCase().includes(search.toLowerCase()))

    const matchesKey = selectedKey === 'ALL' || song.key === selectedKey

    return matchesSearch && matchesKey
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Biblioteca de Músicas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Músicas, cifras, letras e tons da {currentChurch?.name}
          </p>
        </div>

        {canManageContent && (
          <Link to="/songs/new">
            <Button className="h-10 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Nova Música
            </Button>
          </Link>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, artista ou compositor..."
            className="pl-10 h-10 rounded-xl border-slate-200 focus-visible:ring-teal-700 bg-white"
          />
        </div>

        <div className="w-full sm:w-48">
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white">
              <SelectValue placeholder="Filtrar por tom" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os Tons</SelectItem>
              {AVAILABLE_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  Tom: {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Songs List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredSongs.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-12 text-center">
          <Music2 className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-lg font-bold text-slate-900">
            {search || selectedKey !== 'ALL'
              ? 'Nenhuma música encontrada'
              : 'Nenhuma música na biblioteca'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {search || selectedKey !== 'ALL'
              ? 'Tente ajustar os filtros de busca para encontrar o que procura.'
              : 'Comece adicionando os hinos e cânticos que sua equipe de louvor costuma ministrar.'}
          </p>
          {canManageContent && !search && selectedKey === 'ALL' && (
            <Link to="/songs/new" className="mt-5 inline-block">
              <Button className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold">
                Cadastrar Primeira Música
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredSongs.map((song) => (
            <div
              key={song.id}
              className="group bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:border-teal-300 hover:shadow-md transition-all flex items-center justify-between gap-4 cursor-pointer"
              onClick={() => (window.location.href = `/songs/${song.id}`)}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-12 w-12 rounded-xl bg-teal-50 text-teal-800 font-bold flex flex-col items-center justify-center shrink-0 border border-teal-100 group-hover:bg-teal-700 group-hover:text-white transition-colors">
                  <span className="text-sm leading-none font-black">{song.key}</span>
                  <span className="text-[9px] uppercase font-semibold mt-0.5 opacity-80">tom</span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-teal-800 transition-colors truncate">
                      {song.title}
                    </h3>
                    {song.youtube_url && (
                      <span title="Possui vídeo no YouTube" className="inline-flex">
                        <Youtube className="h-4 w-4 text-red-500 shrink-0" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                    {song.artist} {song.composer ? `• Comp: ${song.composer}` : ''}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                    {song.bpm && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {song.bpm} BPM
                      </span>
                    )}
                    {song.chords && (
                      <span className="flex items-center gap-1 text-teal-700 font-medium">
                        <FileText className="h-3.5 w-3.5" />
                        Cifra disponível
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/songs/${song.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hidden sm:inline-flex"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-slate-200 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-200 text-xs font-semibold"
                  >
                    Ver Cifra
                  </Button>
                </Link>

                {canManageContent && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Mais opções"
                        className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          window.location.href = `/songs/${song.id}/edit`
                        }}
                        className="gap-2 text-xs"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar Música
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => handleDeleteSong(song.id, e)}
                        className="gap-2 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir Música
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-teal-700 transition-colors sm:hidden" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
