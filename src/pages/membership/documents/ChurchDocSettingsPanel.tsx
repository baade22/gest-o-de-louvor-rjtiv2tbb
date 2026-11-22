import React, { useEffect, useState } from 'react'
import type { Church } from '@/types'
import {
  churchDocLogo,
  saveChurchDocSettings,
  uploadChurchLogo,
  uploadErrorDetail,
  type ChurchDocSettings,
} from '@/services/churchDocs'
import { ChevronDown, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'

const FIELDS: Array<[keyof ChurchDocSettings, string, string]> = [
  [
    'doc_legal_name',
    'Nome completo da igreja (como no estatuto)',
    'Ex: Igreja Batista Missionária em Aldeia',
  ],
  ['doc_signer_name', 'Quem assina', 'Ex: Pr. João da Silva'],
  ['doc_signer_title', 'Cargo de quem assina', 'Ex: Pastor Presidente'],
  ['doc_city', 'Cidade', 'Ex: Camaragibe - PE'],
  ['doc_address', 'Endereço da igreja', 'Rua, número, bairro'],
  ['doc_cnpj', 'CNPJ', '00.000.000/0000-00'],
  [
    'doc_statute_registry',
    'Registro do estatuto (sai na ata de assembleia)',
    'Ex: registrado em 20/11/2006 no Cartório de Registro de Pessoas Jurídicas de Camaragibe sob o nº 2774, fls. 225v',
  ],
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
  const [logoUrl, setLogoUrl] = useState('')
  useEffect(() => {
    churchDocLogo(church).then(setLogoUrl)
  }, [church])

  useEffect(() => {
    setForm({
      doc_signer_name: church.doc_signer_name || '',
      doc_signer_title: church.doc_signer_title || '',
      doc_city: church.doc_city || '',
      doc_address: church.doc_address || '',
      doc_cnpj: church.doc_cnpj || '',
      doc_legal_name: church.doc_legal_name || '',
      doc_statute_registry: church.doc_statute_registry || '',
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
        description: errorMessage(
          err,
          'Só o pastor/administrador principal pode editar os dados da igreja.',
        ),
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
        <ChevronDown
          className={`h-4 w-4 ml-auto text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map(([key, label, placeholder]) => (
              <div
                key={key}
                className={`space-y-1 ${key === 'doc_statute_registry' || key === 'doc_legal_name' ? 'sm:col-span-2' : ''}`}
              >
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
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo da igreja"
                className="h-14 w-14 object-contain rounded-lg border border-slate-200 bg-white"
              />
            ) : (
              <div className="h-14 w-14 rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center justify-center text-center">
                sem logo
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="doc-logo" className="text-xs font-semibold text-slate-700">
                Logo nos documentos (PNG ou JPG)
              </Label>
              <Input
                id="doc-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={saving}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setSaving(true)
                  try {
                    onSaved(await uploadChurchLogo(church.id, file))
                    toast({ title: 'Logo salvo' })
                  } catch (err) {
                    toast({
                      title: 'Não foi possível salvar o logo',
                      description:
                        uploadErrorDetail(err) ||
                        errorMessage(err, 'Use uma imagem PNG ou JPG de até 5 MB.'),
                      variant: 'destructive',
                    })
                  } finally {
                    setSaving(false)
                    e.target.value = ''
                  }
                }}
                className="rounded-xl h-9 text-xs"
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={save}
            disabled={saving}
            className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
          >
            <Save className="h-3.5 w-3.5" />
            Salvar dados da igreja
          </Button>
        </div>
      )}
    </div>
  )
}
