import React, { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { Song } from '@/types'
import {
  ArrowLeft,
  Music2,
  Clock,
  RotateCcw,
  Minus,
  Plus,
  Type,
  Youtube,
  Edit,
  ChevronDown,
  ChevronUp,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { transposeCifraText, transposeNote } from '@/lib/transposition'
import { useToast } from '@/hooks/use-toast'

// Extrai ID do vídeo do YouTube para embed seguro em iframe youtube-nocookie.com
function getYouTubeEmbedUrl(url?: string): string | null {
  if (!url) return null
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)
    if (match && match[2] && match[2].length === 11) {
      return `https://www.youtube-nocookie.com/embed/${match[2]}`
    }
    return null
  } catch {
    return null
  }
}
export default function SongDetail() {
  const { id } = useParams<{ id: string }>()
  const { canManageContent } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [song, setSong] = useState<Song | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Controles de visualização em ensaio
  const [semitones, setSemitones] = useState(0) // de -11 a +11
  const [fontSize, setFontSize] = useState<number>(15) // em px: 13 a 22
  const [showNotes, setShowNotes] = useState(true)
  const [showVideo, setShowVideo] = useState(false)
  const [activeTab, setActiveTab] = useState<'chords' | 'lyrics'>('chords')

  useEffect(() => {
    if (!id) return
    const fetchSong = async () => {
      setIsLoading(true)
      try {
        const data = await pb.collection('songs').getOne<Song>(id)
        setSong(data)
        // Se a música só tem letra e não tem cifra, chaveia para a aba de letra
        if (!data.chords && data.lyrics) {
          setActiveTab('lyrics')
        }
      } catch (err) {
        console.error(err)
        toast({
          title: 'Música não encontrada',
          description: 'A música solicitada não foi localizada.',
          variant: 'destructive',
        })
        navigate('/songs')
      } finally {
        setIsLoading(false)
      }
    }
    fetchSong()
  }, [id])

  // Tom calculado com base no offset de semitons
  const currentKey = useMemo(() => {
    if (!song?.key) return ''
    if (semitones === 0) return song.key
    return transposeNote(song.key, semitones)
  }, [song?.key, semitones])

  // Cifra transposta em memória instantaneamente (sem tocar no banco)
  const transposedChords = useMemo(() => {
    if (!song?.chords) return ''
    if (semitones === 0) return song.chords
    return transposeCifraText(song.chords, semitones)
  }, [song?.chords, semitones])

  const embedUrl = useMemo(() => {
    return getYouTubeEmbedUrl(song?.youtube_url)
  }, [song?.youtube_url])

  const handleTranspose = (delta: number) => {
    setSemitones((prev) => {
      const next = prev + delta
      if (next > 11) return 11
      if (next < -11) return -11
      return next
    })
  }

  const handleResetTranspose = () => {
    setSemitones(0)
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (!song) return null

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-16">
      {/* Back button & Admin Actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/songs"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Repertório
        </Link>

        {canManageContent && (
          <Link to={`/songs/${song.id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 hover:bg-slate-50 text-xs font-semibold gap-1.5"
            >
              <Edit className="h-3.5 w-3.5" />
              Editar Música
            </Button>
          </Link>
        )}
      </div>

      {/* Song Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {song.title}
            </h1>
            <p className="text-sm font-medium text-slate-600 mt-1">
              {song.artist}
              {song.composer && (
                <span className="text-slate-400 font-normal"> • Comp: {song.composer}</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 font-bold text-sm">
              <span className="text-xs font-medium text-teal-600">Tom Orig:</span>
              <span>{song.key}</span>
            </div>

            {song.bpm && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>{song.bpm} BPM</span>
              </div>
            )}

            {embedUrl && (
              <Button
                variant={showVideo ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowVideo(!showVideo)}
                className="h-8 rounded-xl text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Youtube className="h-3.5 w-3.5" />
                {showVideo ? 'Fechar Vídeo' : 'Ver no YouTube'}
              </Button>
            )}
          </div>
        </div>

        {/* YouTube Video Player (compatível iframe youtube-nocookie.com) */}
        {showVideo && embedUrl && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900 shadow-inner">
              <iframe
                src={embedUrl}
                title={`Vídeo de ${song.title}`}
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}
      </div>

      {/* Observações / Arranjo ministerial (se houver) */}
      {song.notes && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center justify-between w-full text-left text-xs font-bold text-amber-900 uppercase tracking-wider"
          >
            <span>Observações de Arranjo & Dinâmica</span>
            {showNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showNotes && (
            <p className="mt-2 text-xs sm:text-sm text-amber-800 leading-relaxed whitespace-pre-line">
              {song.notes}
            </p>
          )}
        </div>
      )}

      {/* CONTROLES DE TRANSPOSIÇÃO E FONTE (Otimizados para celular e ensaios) */}
      <div className="sticky top-16 lg:top-0 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Stepper de Transposição */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
            Transposição:
          </span>

          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
            <Button
              variant="ghost"
              size="icon"
              disabled={semitones <= -11}
              onClick={() => handleTranspose(-1)}
              aria-label="Diminuir meio tom"
              className="h-8 w-8 rounded-lg hover:bg-white text-slate-700"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>

            <div className="px-3 min-w-[90px] text-center">
              <span className="text-xs font-bold text-teal-800">
                Tom: <strong className="text-sm font-extrabold">{currentKey}</strong>
              </span>
              {semitones !== 0 && (
                <span className="text-[10px] text-slate-500 block leading-none">
                  {semitones > 0 ? `+${semitones}` : semitones} semitons
                </span>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              disabled={semitones >= 11}
              onClick={() => handleTranspose(1)}
              aria-label="Aumentar meio tom"
              className="h-8 w-8 rounded-lg hover:bg-white text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {semitones !== 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResetTranspose}
              aria-label="Restaurar tom original"
              title="Restaurar tom original"
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Stepper de Tamanho de Fonte (A- / A+) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
            <Button
              variant="ghost"
              size="sm"
              disabled={fontSize <= 12}
              onClick={() => setFontSize((s) => Math.max(12, s - 1))}
              aria-label="Diminuir tamanho da fonte"
              className="h-8 px-2 text-xs font-bold rounded-lg hover:bg-white text-slate-700"
            >
              A−
            </Button>
            <span className="px-2 text-xs font-medium text-slate-500">{fontSize}px</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={fontSize >= 24}
              onClick={() => setFontSize((s) => Math.min(24, s + 1))}
              aria-label="Aumentar tamanho da fonte"
              className="h-8 px-2 text-xs font-bold rounded-lg hover:bg-white text-slate-700"
            >
              A+
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs Cifra vs Letra */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'chords' | 'lyrics')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="chords" className="rounded-lg text-xs font-bold py-2">
            Cifra & Acordes ({currentKey})
          </TabsTrigger>
          <TabsTrigger value="lyrics" className="rounded-lg text-xs font-bold py-2">
            Letra Completa
          </TabsTrigger>
        </TabsList>

        {/* Conteúdo da Cifra */}
        <TabsContent value="chords" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-xs overflow-x-auto">
            {transposedChords ? (
              <pre
                style={{ fontSize: `${fontSize}px` }}
                className="font-mono text-slate-900 leading-relaxed whitespace-pre font-normal select-text selection:bg-teal-100"
              >
                {transposedChords}
              </pre>
            ) : (
              <div className="py-12 text-center text-slate-400">
                <Music2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">Nenhuma cifra cadastrada para esta música.</p>
                {canManageContent && (
                  <Link to={`/songs/${song.id}/edit`}>
                    <Button variant="link" size="sm" className="text-teal-700 text-xs mt-1">
                      Adicionar cifra agora
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Conteúdo da Letra */}
        <TabsContent value="lyrics" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-xs">
            {song.lyrics ? (
              <div
                style={{ fontSize: `${fontSize}px` }}
                className="text-slate-800 leading-loose whitespace-pre-line font-medium"
              >
                {song.lyrics}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400">
                <p className="text-sm font-medium">Nenhuma letra cadastrada para esta música.</p>
                {canManageContent && (
                  <Link to={`/songs/${song.id}/edit`}>
                    <Button variant="link" size="sm" className="text-teal-700 text-xs mt-1">
                      Adicionar letra
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
