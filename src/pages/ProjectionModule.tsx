import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Tv, ArrowLeft, CalendarDays, Clock, Download, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { EventItem, EventTask, MediaAsset } from '@/types'
import { listEventTasks, updateTaskStatus } from '@/services/tasks'
import { listEventMedia, updateMediaStatus, getMediaFileUrl } from '@/services/media'
import { useToast } from '@/hooks/use-toast'

export default function ProjectionModule() {
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const [backendAllowed, setBackendAllowed] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null)
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [medias, setMedias] = useState<MediaAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadData = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const evs = await pb.collection('events').getFullList<EventItem>({
        filter: `church_id = "${currentChurch.id}" && date >= "${today}"`,
        sort: 'date',
        batch: 1,
      })

      if (evs.length > 0) {
        const ev = evs[0]
        setNextEvent(ev)

        const [tList, mList] = await Promise.all([
          listEventTasks(currentChurch.id, ev.id, 'PROJECAO'),
          listEventMedia(currentChurch.id, ev.id),
        ])
        setTasks(tList)
        setMedias(mList)
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const churchId = currentChurch?.id || ''
        const res = await pb.send<{ allowed: boolean; message?: string }>(
          `/backend/v1/modules/access?module=projection&church_id=${churchId}`,
          { method: 'GET' },
        )
        setBackendAllowed(res.allowed)
        if (res.allowed) {
          loadData()
        }
      } catch (err: any) {
        setBackendAllowed(false)
        setErrorMsg(err.data?.message || err.message || 'Acesso negado pelo backend')
        setIsLoading(false)
      }
    }
    checkBackend()
  }, [currentChurch?.id])

  if (backendAllowed === false) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-red-600">Acesso Bloqueado pelo Servidor</h2>
        <p className="text-sm text-slate-600">{errorMsg}</p>
        <Link to="/dashboard">
          <Button variant="outline">Voltar ao Início</Button>
        </Link>
      </div>
    )
  }

  const handleDownload = (item: MediaAsset) => {
    const url = getMediaFileUrl(item)
    if (!url) return
    window.open(url, '_blank')
    toast({
      title: 'Download iniciado',
      description: 'Lembre-se de clicar em [Marcar como baixada] para registrar no sistema.',
    })
  }

  const handleMarkDownloaded = async (id: string) => {
    try {
      await updateMediaStatus(id, 'BAIXADA')
      toast({ title: 'Mídia marcada como BAIXADA!' })
      if (nextEvent) {
        const mList = await listEventMedia(currentChurch.id, nextEvent.id)
        setMedias(mList)
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleMarkImported = async (id: string) => {
    try {
      await updateMediaStatus(id, 'IMPORTADA_HOLYRICS', 'IMPORTADO_MANUALMENTE')
      toast({ title: 'Marcado como importado no Holyrics!' })
      if (nextEvent) {
        const mList = await listEventMedia(currentChurch.id, nextEvent.id)
        setMedias(mList)
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Início
        </Link>
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          Módulo Técnico • Projeção & Telão
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
          <Tv className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Operação de Projeção
          </h1>
          <p className="text-sm text-slate-500">
            Mídias para download, roteiro e integração com o software de projeção externa
            (Holyrics).
          </p>
        </div>
      </div>

      {nextEvent ? (
        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200 p-5 bg-white shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">
                  Próximo Culto
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{nextEvent.title}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <CalendarDays className="h-3.5 w-3.5 text-purple-600" />
                    {nextEvent.date.slice(0, 10)}
                  </span>
                  {nextEvent.start_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {nextEvent.start_time}
                    </span>
                  )}
                </p>
              </div>

              <Link to={`/events/${nextEvent.id}/escala?tab=projecao`}>
                <Button
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs"
                >
                  Ver no Centro Operacional
                </Button>
              </Link>
            </div>
          </Card>

          {/* Mídias Pendentes de Download / Importação */}
          <Card className="rounded-2xl border-slate-200 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                Mídias do Próximo Culto ({medias.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Baixe os vídeos e marque após inserir no Holyrics
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {medias.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Nenhuma mídia associada a este culto.
                </p>
              ) : (
                <div className="space-y-3">
                  {medias.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {m.name}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {m.category}
                          </Badge>
                          <Badge
                            className={`text-[10px] ${
                              m.status === 'IMPORTADA_HOLYRICS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.status === 'BAIXADA'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {m.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(m)}
                          className="text-xs rounded-xl gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Baixar
                        </Button>

                        {m.status === 'ENVIADA' || m.status === 'RECEBIDA' ? (
                          <Button
                            size="sm"
                            onClick={() => handleMarkDownloaded(m.id)}
                            className="text-xs rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Marcar Baixada
                          </Button>
                        ) : null}

                        {m.status === 'BAIXADA' ? (
                          <Button
                            size="sm"
                            onClick={() => handleMarkImported(m.id)}
                            className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Importado no Holyrics
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="rounded-2xl border-slate-200 p-8 text-center text-slate-400">
          Nenhum culto futuro agendado.
        </Card>
      )}
    </div>
  )
}
