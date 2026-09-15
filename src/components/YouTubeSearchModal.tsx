import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Youtube, Check, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { searchYouTubeVideos, YouTubeSearchResult } from '@/services/youtube'
import { useAuth } from '@/contexts/AuthContext'

interface YouTubeSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuery?: string
  onSelectVideo: (video: YouTubeSearchResult) => void
}

export function YouTubeSearchModal({
  open,
  onOpenChange,
  initialQuery = '',
  onSelectVideo,
}: YouTubeSearchModalProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<YouTubeSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setErrorMessage(null)
      // Se já houver query inicial, não faz busca automática se vazia, mas preenche
    }
  }, [open, initialQuery])

  const { currentChurch } = useAuth()

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      setErrorMessage('Por favor, digite o nome da música e/ou artista para pesquisar.')
      return
    }

    setIsSearching(true)
    setErrorMessage(null)
    setHasSearched(true)

    try {
      const items = await searchYouTubeVideos(trimmed, currentChurch?.id)
      setResults(items)
      if (items.length === 0) {
        setErrorMessage('Nenhum vídeo encontrado para este termo de busca.')
      }
    } catch (err: any) {
      console.error('Erro na pesquisa do YouTube:', err)
      setErrorMessage(err.message || 'Erro ao comunicar com a API do YouTube.')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelect = (video: YouTubeSearchResult) => {
    onSelectVideo(video)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-3 border-b border-slate-100">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
            <Youtube className="h-5 w-5 text-red-600" />
            <span>Pesquisar no YouTube</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Busque o vídeo oficial ou versão de referência via YouTube Data API v3.
          </DialogDescription>

          <form onSubmit={handleSearch} className="flex gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: Bondade de Deus Isaías Saad..."
                className="pl-9 h-10 text-xs rounded-xl"
              />
            </div>
            <Button
              type="submit"
              disabled={isSearching}
              className="h-10 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs gap-1.5"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  Buscar
                </>
              )}
            </Button>
          </form>
        </DialogHeader>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{errorMessage}</p>
                {(errorMessage.includes('YOUTUBE_API_KEY') ||
                  errorMessage.includes('Configurações → Integrações')) && (
                  <p className="text-[11px] text-amber-800">
                    Dica: Configure a chave em{' '}
                    <strong>Configurações → Integrações → YouTube</strong> no painel administrativo
                    para habilitar a busca oficial.
                  </p>
                )}
              </div>
            </div>
          )}

          {isSearching && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl border border-slate-100">
                  <Skeleton className="h-20 w-32 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="space-y-2.5">
              {results.map((video) => (
                <div
                  key={video.videoId}
                  className="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50/20 transition-all bg-white"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="h-16 w-28 object-cover rounded-lg shrink-0 shadow-xs bg-slate-900"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <h4
                        className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: video.title }}
                      />
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium truncate">
                        {video.channelTitle}
                      </p>
                      <a
                        href={video.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-600 mt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>Abrir no YouTube</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSelect(video)}
                    className="w-full sm:w-auto rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs gap-1.5 shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Selecionar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="py-12 text-center text-slate-400">
              <Youtube className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="text-xs font-medium text-slate-600">
                Digite um termo acima e clique em &quot;Buscar&quot;.
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Exibe até 10 resultados oficiais da API do YouTube.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50/50">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
