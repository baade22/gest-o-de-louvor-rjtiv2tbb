import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { EventItem } from '@/types'
import { Calendar, ArrowLeft, Save, Clock } from 'lucide-react'
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

export default function EventForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const { currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '19:00',
    end_time: '21:00',
    description: '',
    status: 'Planejado' as 'Planejado' | 'Confirmado' | 'Realizado' | 'Cancelado',
  })

  useEffect(() => {
    if (isEditing && id) {
      const fetchEvent = async () => {
        try {
          const ev = await pb.collection('events').getOne<EventItem>(id)
          // extrai YYYY-MM-DD
          const rawDate = ev.date ? ev.date.split(' ')[0].split('T')[0] : ''
          setFormData({
            title: ev.title || '',
            date: rawDate || new Date().toISOString().split('T')[0],
            start_time: ev.start_time || '',
            end_time: ev.end_time || '',
            description: ev.description || '',
            status: ev.status || 'Planejado',
          })
        } catch (err) {
          console.error(err)
          toast({
            title: 'Erro ao carregar evento',
            description: 'Não foi possível buscar as informações.',
            variant: 'destructive',
          })
          navigate('/events')
        } finally {
          setIsLoading(false)
        }
      }
      fetchEvent()
    }
  }, [id, isEditing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return

    if (!formData.title.trim() || !formData.date) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe o nome do evento e a data.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        church_id: currentChurch.id,
        title: formData.title.trim(),
        date: `${formData.date} 00:00:00.000Z`,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        description: formData.description.trim() || null,
        status: formData.status,
      }

      let eventId = id
      if (isEditing && id) {
        await pb.collection('events').update(id, payload)
        toast({
          title: 'Culto atualizado!',
          description: 'Os dados do culto foram alterados com sucesso.',
        })
      } else {
        const created = await pb.collection('events').create(payload)
        eventId = created.id
        toast({
          title: 'Culto agendado com sucesso!',
          description: 'Agora monte o repertório e escale os músicos da equipe.',
        })
      }

      navigate(`/events/${eventId}/escala`)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o evento no banco de dados.',
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Eventos
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditing ? 'Editar Culto / Evento' : 'Agendar Novo Culto ou Ensaio'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cadastre os horários e informações para planejar repertórios e escalas.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-semibold text-slate-700">
              Nome do Evento / Culto <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ex: Culto de Celebração, Vigília de Louvor, Ensaio Geral..."
              className="rounded-xl border-slate-200"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="date" className="text-xs font-semibold text-slate-700">
                Data do Culto <span className="text-red-500">*</span>
              </Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="start_time" className="text-xs font-semibold text-slate-700">
                Horário de Início
              </Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="end_time" className="text-xs font-semibold text-slate-700">
                Horário de Término
              </Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status" className="text-xs font-semibold text-slate-700">
              Status do Culto
            </Label>
            <Select
              value={formData.status}
              onValueChange={(val) =>
                setFormData({
                  ...formData,
                  status: val as 'Planejado' | 'Confirmado' | 'Realizado' | 'Cancelado',
                })
              }
            >
              <SelectTrigger className="rounded-xl border-slate-200">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Planejado">Planejado (Em organização)</SelectItem>
                <SelectItem value="Confirmado">Confirmado (Escala aberta)</SelectItem>
                <SelectItem value="Realizado">Realizado (Finalizado)</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-semibold text-slate-700">
              Descrição / Observações Gerais
            </Label>
            <Textarea
              id="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Culto de ceia do Senhor, trazer instrumentos afinados às 18:30..."
              className="rounded-xl border-slate-200 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Link to="/events">
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
              {isSubmitting
                ? 'Salvando...'
                : isEditing
                  ? 'Salvar Alterações'
                  : 'Salvar e Montar Repertório'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
