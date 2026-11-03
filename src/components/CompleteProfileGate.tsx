import React, { useEffect, useState } from 'react'
import { Loader2, UserRoundCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { getMyProfile, saveMyProfile, type MyProfile } from '@/services/meProfile'

const EMPTY: MyProfile = {
  name: '',
  birth_date: '',
  phone: '',
  gender: '',
  marital_status: '',
  zip_code: '',
  address: '',
  neighborhood: '',
  city: '',
  state: '',
  congregation: '',
}

const selectClass =
  'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Quem entrou por convite (ou já tinha conta sem ficha completa) precisa completar o cadastro
 * em Membros antes de usar o sistema: nome completo, nascimento e celular são obrigatórios.
 */
export function CompleteProfileGate({ children }: { children: React.ReactNode }) {
  const { currentChurch, user } = useAuth()
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState<MyProfile>(EMPTY)
  const [saving, setSaving] = useState(false)

  const churchId = currentChurch?.id
  useEffect(() => {
    let alive = true
    setPending(false)
    if (!churchId || !user) return
    getMyProfile(churchId)
      .then((res) => {
        if (!alive || !res.pending) return
        const p = res.profile || EMPTY
        setForm({ ...EMPTY, ...p, name: p.name || user.name || '' })
        setPending(true)
      })
      .catch((err) => console.error('Erro ao conferir o cadastro:', err))
    return () => {
      alive = false
    }
  }, [churchId, user])

  if (!pending || !churchId) return <>{children}</>

  const set = (k: keyof MyProfile, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await saveMyProfile(churchId, form)
      toast({ title: 'Cadastro completo', description: 'Obrigado! Já pode usar o sistema.' })
      setPending(false)
    } catch (err: any) {
      toast({
        title: 'Não foi possível salvar',
        description: err?.response?.message || err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
          <UserRoundCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Complete o seu cadastro</h1>
          <p className="text-sm text-slate-500">
            Antes de começar, preencha os seus dados. Eles ficam na sua ficha de membro da{' '}
            {currentChurch?.name}.
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <div className="space-y-1.5">
          <Label htmlFor="cp-name">Nome completo *</Label>
          <Input
            id="cp-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Nome e sobrenome"
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cp-birth">Data de nascimento *</Label>
            <Input
              id="cp-birth"
              type="date"
              value={form.birth_date}
              onChange={(e) => set('birth_date', e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-phone">Celular / WhatsApp *</Label>
            <Input
              id="cp-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="(81) 99999-9999"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-gender">Sexo</Label>
            <select
              id="cp-gender"
              className={selectClass}
              value={form.gender}
              onChange={(e) => set('gender', e.target.value)}
            >
              <option value="">—</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-marital">Estado civil</Label>
            <select
              id="cp-marital"
              className={selectClass}
              value={form.marital_status}
              onChange={(e) => set('marital_status', e.target.value)}
            >
              <option value="">—</option>
              <option value="SOLTEIRO">Solteiro(a)</option>
              <option value="CASADO">Casado(a)</option>
              <option value="UNIAO_ESTAVEL">União estável</option>
              <option value="DIVORCIADO">Divorciado(a)</option>
              <option value="VIUVO">Viúvo(a)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-6">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cp-zip">CEP</Label>
            <Input
              id="cp-zip"
              inputMode="numeric"
              value={form.zip_code}
              onChange={(e) => set('zip_code', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-4">
            <Label htmlFor="cp-address">Endereço</Label>
            <Input
              id="cp-address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Rua, número, complemento"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cp-neigh">Bairro</Label>
            <Input
              id="cp-neigh"
              value={form.neighborhood}
              onChange={(e) => set('neighborhood', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="cp-city">Cidade</Label>
            <Input id="cp-city" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="cp-state">UF</Label>
            <Input
              id="cp-state"
              maxLength={2}
              value={form.state}
              onChange={(e) => set('state', e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-6">
            <Label htmlFor="cp-congregation">Congregação</Label>
            <Input
              id="cp-congregation"
              list="cp-congregation-options"
              value={form.congregation}
              onChange={(e) => set('congregation', e.target.value)}
            />
            <datalist id="cp-congregation-options">
              <option value="Aldeia" />
              <option value="Diamante" />
            </datalist>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar e continuar
          </Button>
        </div>
      </form>
    </div>
  )
}
