import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { Role } from '@/types'
import { Sliders, Plus, Trash2, Edit2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

export default function RolesManagement() {
  const { currentChurch, isAdmin } = useAuth()
  const { toast } = useToast()

  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal de criação / edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#0F766E')
  const [isSaving, setIsSaving] = useState(false)

  const fetchRoles = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const records = await pb.collection('roles').getFullList<Role>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: 'name',
      })
      setRoles(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar funções',
        description: 'Não foi possível carregar as funções da igreja.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRoles()
  }, [currentChurch])

  const handleOpenCreate = () => {
    setEditingRole(null)
    setName('')
    setDescription('')
    setColor('#0F766E')
    setModalOpen(true)
  }

  const handleOpenEdit = (role: Role) => {
    setEditingRole(role)
    setName(role.name)
    setDescription(role.description || '')
    setColor(role.color || '#0F766E')
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch || !name.trim()) return

    setIsSaving(true)
    try {
      if (editingRole) {
        await pb.collection('roles').update(editingRole.id, {
          name: name.trim().toUpperCase(),
          description: description.trim() || null,
          color: color || null,
        })
        toast({
          title: 'Função atualizada',
          description: `"${name}" foi alterada com sucesso.`,
        })
      } else {
        await pb.collection('roles').create({
          church_id: currentChurch.id,
          name: name.trim().toUpperCase(),
          description: description.trim() || null,
          color: color || null,
        })
        toast({
          title: 'Função criada',
          description: `"${name}" adicionada ao ministério.`,
        })
      }

      setModalOpen(false)
      fetchRoles()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar função',
        description: 'Ocorreu um erro ao persistir.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (roleId: string, roleName: string) => {
    if (!window.confirm(`Tem certeza que deseja remover a função "${roleName}"?`)) return

    try {
      await pb.collection('roles').delete(roleId)
      toast({
        title: 'Função removida',
        description: `"${roleName}" foi excluída.`,
      })
      setRoles((prev) => prev.filter((r) => r.id !== roleId))
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir esta função.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Funções & Instrumentos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie os instrumentos e papéis musicais disponíveis na {currentChurch?.name}
          </p>
        </div>

        {isAdmin && (
          <Button
            onClick={handleOpenCreate}
            className="h-10 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nova Função
          </Button>
        )}
      </div>

      {/* Roles Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-12 text-center">
          <Sliders className="mx-auto h-12 w-12 text-slate-400 mb-2" />
          <h3 className="text-base font-bold text-slate-800">Nenhuma função cadastrada</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Adicione os instrumentos como Vocal, Violão, Teclado, Bateria etc.
          </p>
          {isAdmin && (
            <Button
              onClick={handleOpenCreate}
              className="mt-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs"
            >
              Cadastrar Primeira Função
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {roles.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-teal-200 hover:shadow-md transition-all flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: r.color || '#0F766E' }}
                    />
                    <h3 className="text-sm font-bold text-slate-900 tracking-wide">{r.name}</h3>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(r)}
                        aria-label="Editar função"
                        className="h-7 w-7 text-slate-400 hover:text-slate-700"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(r.id, r.name)}
                        aria-label="Excluir função"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">
                  {r.description || 'Função musical ou instrumental do ministério.'}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Escopo da Igreja</span>
                <span className="uppercase text-[10px] font-bold text-teal-700">Ativa</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Criar / Editar Função */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              {editingRole ? 'Editar Função' : 'Nova Função ou Instrumento'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Defina o nome da função (ex: VOCAL, GUITARRA, SOM) para escalar membros.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-name" className="text-xs font-semibold text-slate-700">
                Nome da Função / Instrumento <span className="text-red-500">*</span>
              </Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: VOCAL, GUITARRA, PIANO..."
                className="rounded-xl border-slate-200 uppercase"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-desc" className="text-xs font-semibold text-slate-700">
                Descrição ou Atribuição
              </Label>
              <Input
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Voz principal, harmonização vocal..."
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-color" className="text-xs font-semibold text-slate-700">
                Cor de Identificação
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="role-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-16 p-1 rounded-xl cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-500 uppercase">{color}</span>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !name.trim()}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                {isSaving ? 'Salvando...' : editingRole ? 'Salvar Alterações' : 'Criar Função'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
