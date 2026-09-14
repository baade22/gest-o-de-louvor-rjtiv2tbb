import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { EventMember } from '@/types'
import {
  CalendarCheck2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Music2,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

export default function MyScales() {
  const { currentMember, currentChurch } = useAuth()
  const { toast } = useToast()

  const [scales, setScales] = useState<EventMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<
    'TODAS' | 'PENDENTES' | 'CONFIRMADAS' | 'RECUSADAS'
  >('TODAS')

  // Modal recusa
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [selectedScale, setSelectedScale] = useState<EventMember | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchMyScales = async () => {
    if (!currentMember || !currentChurch) return
    setIsLoading(true)
    try {
      const records = await pb.collection('event_members').getFullList<EventMember>({
        filter: `church_id = "${currentChurch.id}" && member_id = "${currentMember.id}"`,
        expand: 'event_id,role_id',
        sort: '-created',
      })
      setScales(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao buscar escalas',
        description: 'Não foi possível carregar suas escalas.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMyScales()
  }, [currentMember, currentChurch])

  const handleConfirm = async (scaleId: string) => {
    try {
      setIsUpdating(true)
      await pb.collection('event_members').update(scaleId, {
        status: 'CONFIRMADO',
        response_at: new Date().toISOString(),
      })
      toast({
        title: 'Escala confirmada!',
        description: 'Sua presença no louvor foi confirmada.',
      })
      fetchMyScales()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a escala.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleOpenDecline = (scale: EventMember) => {
    setSelectedScale(scale)
    setDeclineReason('')
    setDeclineModalOpen(true)
  }

  const handleDeclineConfirm = async () => {
    if (!selectedScale) return
    try {
      setIsUpdating(true)
      await pb.collection('event_members').update(selectedScale.id, {
        status: 'RECUSADO',
        response_at: new Date().toISOString(),
        decline_reason: declineReason || 'Sem motivo informado',
      })
      toast({
        title: 'Escala recusada',
        description: 'A liderança foi notificada com sua justificativa.',
      })
      setDeclineModalOpen(false)
      fetchMyScales()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a recusa.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const filteredScales = scales.filter((scale) => {
    if (activeFilter === 'PENDENTES') return scale.status === 'PENDENTE'
    if (activeFilter === 'CONFIRMADAS') return scale.status === 'CONFIRMADO'
    if (activeFilter === 'RECUSADAS') return scale.status === 'RECUSADO'
    return true
  })

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Minhas Escalas
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Acompanhe suas convocações, confirme sua participação e consulte os repertórios.
        </p>
      </div>

      {/* Tabs Filter */}
      <Tabs
        value={activeFilter}
        onValueChange={(v) =>
          setActiveFilter(v as 'TODAS' | 'PENDENTES' | 'CONFIRMADAS' | 'RECUSADAS')
        }
      >
        <TabsList className="grid grid-cols-4 rounded-xl bg-slate-100 p-1 h-11">
          <TabsTrigger value="TODAS" className="rounded-lg text-xs font-bold">
            Todas ({scales.length})
          </TabsTrigger>
          <TabsTrigger value="PENDENTES" className="rounded-lg text-xs font-bold">
            Pendentes ({scales.filter((s) => s.status === 'PENDENTE').length})
          </TabsTrigger>
          <TabsTrigger value="CONFIRMADAS" className="rounded-lg text-xs font-bold">
            Confirmadas ({scales.filter((s) => s.status === 'CONFIRMADO').length})
          </TabsTrigger>
          <TabsTrigger value="RECUSADAS" className="rounded-lg text-xs font-bold">
            Recusadas ({scales.filter((s) => s.status === 'RECUSADO').length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Scales List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredScales.length === 0 ? (
        <div className="bg-white rounded-2xl border-dashed border-2 border-slate-200 p-12 text-center">
          <CalendarCheck2 className="mx-auto h-12 w-12 text-slate-400 mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            Nenhuma escala encontrada nesta categoria
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Assim que a liderança escalar você para um culto ou ensaio, os convites aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredScales.map((scale) => {
            const ev = scale.expand?.event_id
            const role = scale.expand?.role_id

            return (
              <div
                key={scale.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs hover:border-teal-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {ev?.title || 'Culto de Louvor'}
                    </h3>
                    {role && (
                      <Badge
                        style={{
                          backgroundColor: role.color ? `${role.color}15` : undefined,
                          borderColor: role.color ? `${role.color}40` : undefined,
                          color: role.color || undefined,
                        }}
                        className="text-xs font-semibold"
                      >
                        {role.name}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                    {ev?.date && (
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <Calendar className="h-3.5 w-3.5 text-teal-700" />
                        {formatDateDisplay(ev.date)}
                      </span>
                    )}
                    {ev?.start_time && (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {ev.start_time}
                        {ev.end_time ? ` às ${ev.end_time}` : ''}
                      </span>
                    )}
                  </p>

                  {scale.notes && (
                    <p className="text-xs text-slate-500 italic mt-1">Obs: {scale.notes}</p>
                  )}

                  {scale.status === 'RECUSADO' && scale.decline_reason && (
                    <p className="text-xs text-red-600 italic mt-1">
                      Justificativa: "{scale.decline_reason}"
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center shrink-0">
                  {scale.status === 'PENDENTE' ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(scale.id)}
                        disabled={isUpdating}
                        className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs gap-1.5 h-9 px-3"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDecline(scale)}
                        disabled={isUpdating}
                        className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-semibold text-xs gap-1.5 h-9 px-3"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Recusar
                      </Button>
                    </>
                  ) : scale.status === 'CONFIRMADO' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs px-2.5 py-1">
                      Confirmado
                    </Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800 border-red-200 text-xs px-2.5 py-1">
                      Recusado
                    </Badge>
                  )}

                  {ev && (
                    <Link to={`/events/${ev.id}/escala`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 gap-1 h-9"
                      >
                        <span>Repertório</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL: Justificativa de Recusa */}
      <Dialog open={declineModalOpen} onOpenChange={setDeclineModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Recusar Escala</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informe a justificativa da ausência para que o líder do ministério possa buscar um
              substituto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="my-reason" className="text-xs font-semibold text-slate-700">
              Motivo do Não Comparecimento
            </Label>
            <Textarea
              id="my-reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Ex: Viagem, compromisso pessoal, motivo de saúde..."
              className="rounded-xl border-slate-200 min-h-[90px]"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeclineModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleDeclineConfirm}
              disabled={isUpdating}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
