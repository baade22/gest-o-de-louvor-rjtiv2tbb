import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { Song } from '@/types'
import { Music2, ArrowLeft, Save, Youtube, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { AVAILABLE_KEYS } from '@/lib/transposition'

export default function SongForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const { currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    composer: '',
    key: 'G',
    bpm: '',
    youtube_url: '',
    lyrics: '',
    chords: '',
    notes: '',
  })

  useEffect(() => {
    if (isEditing && id) {
      const fetchSong = async () => {
        try {
          const song = await pb.collection('songs').getOne<Song>(id)
          setFormData({
            title: song.title || '',
            artist: song.artist || '',
            composer: song.composer || '',
            key: song.key || 'G',
            bpm: song.bpm ? String(song.bpm) : '',
            youtube_url: song.youtube_url || '',
            lyrics: song.lyrics || '',
            chords: song.chords || '',
            notes: song.notes || '',
          })
        } catch (err) {
          console.error(err)
          toast({
            title: 'Erro ao carregar música',
            description: 'Não foi possível encontrar os dados desta música.',
            variant: 'destructive',
          })
          navigate('/songs')
        } finally {
          setIsLoading(false)
        }
      }
      fetchSong()
    }
  }, [id, isEditing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return

    if (!formData.title.trim() || !formData.artist.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, informe ao menos o título e o artista/ministério.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        church_id: currentChurch.id,
        title: formData.title.trim(),
        artist: formData.artist.trim(),
        composer: formData.composer.trim() || null,
        key: formData.key,
        bpm: formData.bpm ? parseInt(formData.bpm, 10) : null,
        youtube_url: formData.youtube_url.trim() || null,
        lyrics: formData.lyrics || null,
        chords: formData.chords || null,
        notes: formData.notes.trim() || null,
      }

      let songId = id
      if (isEditing && id) {
        await pb.collection('songs').update(id, payload)
        toast({
          title: 'Música atualizada',
          description: 'As alterações foram salvas no repertório.',
        })
      } else {
        const created = await pb.collection('songs').create(payload)
        songId = created.id
        toast({
          title: 'Música cadastrada!',
          description: 'A nova música já está disponível no acervo da igreja.',
        })
      }

      navigate(`/songs/${songId}`)
    } catch (err) {
      console.error('Erro ao salvar música:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Ocorreu um erro ao persistir as informações.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/songs"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Músicas
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditing ? 'Editar Música' : 'Nova Música para o Repertório'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Preencha os dados da música, tom de referência, letra e cifra para os ensaios.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title" className="text-xs font-semibold text-slate-700">
                Título da Música <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Bondade de Deus, Oceanos, Graça Sublime..."
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="artist" className="text-xs font-semibold text-slate-700">
                Artista / Ministério de Louvor <span className="text-red-500">*</span>
              </Label>
              <Input
                id="artist"
                value={formData.artist}
                onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                placeholder="Ex: Isaías Saad, Fernandinho, Hillsong..."
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="composer" className="text-xs font-semibold text-slate-700">
                Compositor (opcional)
              </Label>
              <Input
                id="composer"
                value={formData.composer}
                onChange={(e) => setFormData({ ...formData, composer: e.target.value })}
                placeholder="Ex: Chris Tomlin, Ed Cash..."
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key" className="text-xs font-semibold text-slate-700">
                Tom Original / Referência <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.key}
                onValueChange={(val) => setFormData({ ...formData, key: val })}
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Selecione o tom" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bpm" className="text-xs font-semibold text-slate-700">
                BPM (Andamento)
              </Label>
              <Input
                id="bpm"
                type="number"
                min="30"
                max="250"
                value={formData.bpm}
                onChange={(e) => setFormData({ ...formData, bpm: e.target.value })}
                placeholder="Ex: 72"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label
                htmlFor="youtube"
                className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <Youtube className="h-4 w-4 text-red-500" />
                Link do YouTube (Versão de referência)
              </Label>
              <Input
                id="youtube"
                type="url"
                value={formData.youtube_url}
                onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
                className="rounded-xl border-slate-200"
              />
              <p className="text-[11px] text-slate-400">
                Insira o link para reprodução direta no player integrado durante os ensaios.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Cifra */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="chords" className="text-xs font-semibold text-slate-700">
                  Cifra Musical (com acordes)
                </Label>
                <span className="text-[10px] text-teal-700 font-medium">
                  Aceita transposição ao vivo
                </span>
              </div>
              <Textarea
                id="chords"
                rows={14}
                value={formData.chords}
                onChange={(e) => setFormData({ ...formData, chords: e.target.value })}
                placeholder={`[Intro] G  D  Em  C\n\nG               D\nTeu amor não falha...\nEm              C\nNunca me abandona...`}
                className="font-mono text-xs rounded-xl border-slate-200 leading-relaxed"
              />
            </div>

            {/* Letra */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="lyrics" className="text-xs font-semibold text-slate-700">
                  Letra Completa
                </Label>
                <span className="text-[10px] text-slate-400">Para vocal e projeção</span>
              </div>
              <Textarea
                id="lyrics"
                rows={14}
                value={formData.lyrics}
                onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
                placeholder="Insira as estrofes, refrão e ponte..."
                className="text-xs rounded-xl border-slate-200 leading-relaxed"
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
              Observações & Arranjo (opcional)
            </Label>
            <Textarea
              id="notes"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Ex: Começar suave no piano, bateria entra no refrão 2, ministração espontânea na ponte..."
              className="text-xs rounded-xl border-slate-200"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Link to="/songs">
              <Button type="button" variant="outline" className="rounded-xl">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2"
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Cadastrar Música'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
