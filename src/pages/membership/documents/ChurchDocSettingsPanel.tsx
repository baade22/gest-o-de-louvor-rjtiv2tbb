import React, { useEffect, useState } from 'react'
import type { Church } from '@/types'
import { saveChurchDocSettings, type ChurchDocSettings } from '@/services/churchDocs'
import { ChevronDown, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'

const FIELDS: Array<[keyof ChurchDocSettings, string, string]> = [
  ['doc_signer_name', 'Quem assina', 'Ex: Pr. João da Silva'],
  ['doc_signer_title', 'Cargo de quem assina', 'Ex: Pastor Presidente'],
  ['doc_city', 'Cidade', 'Ex: Camaragibe - PE'],
  ['doc_address', 'Endereço da igreja', 'Rua, número, bairro'],
  ['doc_cnpj', 'CNPJ', '00.000.000/0000-00'],
]

/** Dados da igreja que saem em todos os documentos; salvos uma vez para todos. */
export function ChurchDocSettingsPanel({
  church,
  onSaved,
}: {
  church: Church
  onSaved: (c: Church) => void
}) {
  const { toast } = useToast()
  const missing = !church.doc_signer_name || !church.doc_city
  const [open, setOpen] = useState(missing)
  const [form, setForm] = useState<ChurchDocSettings>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      doc_signer_name: church.doc_signer_name || '',
      doc_signer_title: church.doc_signer_title || '',
      doc_city: church.doc_city || '',
      doc_address: church.doc_address || '',
      doc_cnpj: church.doc_cnpj || '',
    })
  }, [church])

  const save = async () => {
    setSaving(true)
    try {
      onSaved(await saveChurchDocSettings(church.id, form))
      toast({ title: 'Dados da igreja salvos', description: 'Valem para todos os documentos.' })
      setOpen(false)
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Só o pastor/administrador principal pode editar os dados da igreja.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-800">Dados da igreja nos documentos</span>
        {missing && (
          <span className="text-[11px] font-semibold rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
            preencha uma vez
          </span>
        )}
        <ChevronDown className={`h-4 w-4 ml-auto text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            {FIELDS.map(([key, label, placeholder]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`doc-${key}`} className="text-xs font-semibold text-slate-700">
                  {label}
                </Label>
                <Input
                  id={`doc-${key}`}
                  value={form[key] || ''}
                  placeholder={placeholder}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="rounded-xl h-9"
                />
              </div>
            ))}
          </div>
          <Button size="sm" onClick={save} disabled={saving} className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800">
            <Save className="h-3.5 w-3.5" />
            Salvar dados da igreja
          </Button>
        </div>
      )}
    </div>
  )
}
