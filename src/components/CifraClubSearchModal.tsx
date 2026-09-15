import React, { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { ExternalLink, Search, CheckCircle, Info } from 'lucide-react'

interface CifraClubSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSongTitle?: string
  initialArtist?: string
  onApplyReference: (data: { cifraClubUrl: string; title?: string; artist?: string }) => void
}

export function CifraClubSearchModal({
  open,
  onOpenChange,
  initialSongTitle = '',
  initialArtist = '',
  onApplyReference,
}: CifraClubSearchModalProps) {
  const [songName, setSongName] = useState(initialSongTitle)
  const [artistName, setArtistName] = useState(initialArtist)
  const [pastedUrl, setPastedUrl] = useState('')
  const [hasOpenedSite, setHasOpenedSite] = useState(false)

  const handleOpenSearchInCifraClub = () => {
    const query = [songName.trim(), artistName.trim()].filter(Boolean).join(' ')
    const targetUrl = query
      ? `https://www.cifraclub.com.br/?q=${encodeURIComponent(query)}`
      : 'https://www.cifraclub.com.br/'

    window.open(targetUrl, '_blank', 'noopener,noreferrer')
    setHasOpenedSite(true)
  }

  const handleConfirm = () => {
    onApplyReference({
      cifraClubUrl: pastedUrl.trim(),
      title: songName.trim() || undefined,
      artist: artistName.trim() || undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
            <span>🔎 Pesquisar no Cifra Club</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Pesquise a música de referência no site oficial do Cifra Club. Em respeito às
            diretrizes, copie o conteúdo e cole diretamente no LouvorFlow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Passo 1: Informações para busca */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
              Passo 1: Buscar no site oficial
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cc-song" className="text-xs font-semibold text-slate-700">
                  Nome da Música
                </Label>
                <Input
                  id="cc-song"
                  value={songName}
                  onChange={(e) => setSongName(e.target.value)}
                  placeholder="Ex: Bondade de Deus"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="cc-artist" className="text-xs font-semibold text-slate-700">
                  Artista / Ministério
                </Label>
                <Input
                  id="cc-artist"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  placeholder="Ex: Isaías Saad"
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={handleOpenSearchInCifraClub}
              className="w-full h-9 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs gap-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir busca no Cifra Club em nova aba
            </Button>
          </div>

          {/* Instruções do fluxo */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
            <div className="space-y-1 leading-relaxed">
              <p className="font-semibold">Como funciona o fluxo:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-amber-800">
                <li>O Cifra Club abrirá em uma nova aba do seu navegador;</li>
                <li>Selecione a versão desejada e copie o texto da cifra/letra;</li>
                <li>Copie a URL da página e cole no campo abaixo para guardar a referência;</li>
                <li>Volte aqui, confirme e cole o texto no campo único de conteúdo!</li>
              </ol>
            </div>
          </div>

          {/* Passo 2: Colar URL de referência */}
          <div className="space-y-2">
            <Label htmlFor="cc-url" className="text-xs font-semibold text-slate-700">
              Passo 2: URL da música no Cifra Club (Referência)
            </Label>
            <Input
              id="cc-url"
              type="url"
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              placeholder="https://www.cifraclub.com.br/isaias-saad/bondade-de-deus/"
              className="h-10 text-xs rounded-xl border-slate-200"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs gap-1.5"
          >
            <CheckCircle className="h-4 w-4" />
            Salvar Referência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
