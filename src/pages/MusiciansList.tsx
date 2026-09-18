import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { listMusicians } from '@/services/musicians'
import type { Role } from '@/types'
import { Users, Search, Plus, Phone, Mail, Edit, Trash2, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'

interface MusicianItem {
  id: string
  church_id: string
  user_id: string
  role: 'ADMIN' | 'LIDER' | 'MUSICO'
  phone?: string
  is_active: boolean
  name: string
  email: string
  roles: Role[]
}

export default function MusiciansList() {
  const { currentChurch, isAdmin } = useAuth()
  const { toast } = useToast()

  const [members, setMembers] = useState<MusicianItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchMusicians = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const data = await listMusicians(currentChurch.id)
      setMembers(
        data.map((m) => ({
          id: m.id,
          church_id: m.church_id,
          user_id: m.user_id,
          role: m.role,
          phone: m.phone,
          is_active: m.is_active,
          name: m.name || 'Músico',
          email: m.email || '',
          roles: m.roles || [],
        })),
      )
    } catch (err: unknown) {
      console.error('Erro ao buscar músicos:', err)
      const errorObj = err as { data?: { message?: string }; message?: string }
      const errorMsg =
        errorObj.data?.message ||
        errorObj.message ||
        'Não foi possível carregar a equipe de música.'
      toast({
        title: 'Erro ao buscar músicos',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMusicians()
  }, [currentChurch])

  const handleDeleteMember = async (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Tem certeza que deseja desvincular este músico da equipe da igreja?'))
      return

    try {
      await pb.collection('church_members').delete(memberId)
      toast({
        title: 'Membro removido',
        description: 'O músico foi desvinculado com sucesso.',
      })
      fetchMusicians()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover o membro.',
        variant: 'destructive',
      })
    }
  }

  const filteredMembers = members.filter((m) => {
    const name = m.name || ''
    const email = m.email || ''
    const phone = m.phone || ''
    const query = search.toLowerCase()
    return (
      name.toLowerCase().includes(query) ||
      email.toLowerCase().includes(query) ||
      phone.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Equipe de Músicos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Músicos, cantores e instrumentistas cadastrados na {currentChurch?.name}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link to="/musicians/new">
              <Button className="h-10 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Novo Músico
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar músico por nome, e-mail ou telefone..."
          className="pl-10 h-10 rounded-xl border-slate-200 focus-visible:ring-teal-700 bg-white"
        />
      </div>

      {/* Musician Cards / Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredMembers.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-lg font-bold text-slate-900">
            {search ? 'Nenhum músico encontrado' : 'Nenhum músico cadastrado ainda'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'Tente buscar com outro termo ou limpe a busca.'
              : 'Cadastre os músicos da sua igreja para começar a compor as escalas.'}
          </p>
          {isAdmin && !search && (
            <Link to="/musicians/new" className="mt-5 inline-block">
              <Button className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold">
                Cadastrar Primeiro Músico
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredMembers.map((member) => {
            const roles = member.roles || []

            return (
              <div
                key={member.id}
                onClick={() => {
                  if (isAdmin) window.location.href = `/musicians/${member.id}/edit`
                }}
                className={`group bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:border-teal-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isAdmin ? 'cursor-pointer' : ''
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-12 w-12 rounded-full bg-teal-50 text-teal-800 font-bold flex items-center justify-center shrink-0 border border-teal-100 text-base">
                    {member.name ? member.name[0].toUpperCase() : 'M'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-teal-800 transition-colors truncate">
                        {member.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${
                          member.is_active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {member.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-semibold bg-slate-100 text-slate-700"
                      >
                        {member.role}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      {member.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          {member.email}
                        </span>
                      )}
                      {member.phone && (
                        <span className="flex items-center gap-1 truncate">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {member.phone}
                        </span>
                      )}
                    </div>

                    {/* Roles tags */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {roles.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">
                          Nenhuma função vinculada
                        </span>
                      ) : (
                        roles.map((r) => (
                          <Badge
                            key={r.id}
                            style={{
                              backgroundColor: r.color ? `${r.color}15` : undefined,
                              borderColor: r.color ? `${r.color}40` : undefined,
                              color: r.color || undefined,
                            }}
                            className="text-[10px] font-semibold"
                          >
                            {r.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Link to={`/musicians/${member.id}/edit`} onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-200 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-200 text-xs font-semibold gap-1.5"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    </Link>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Opções do músico"
                          className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-lg"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            window.location.href = `/musicians/${member.id}/edit`
                          }}
                          className="gap-2 text-xs"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Editar Dados
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDeleteMember(member.id, e)}
                          className="gap-2 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Desvincular Músico
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
