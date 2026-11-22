import React, { useState } from 'react'
import { updateAssembly } from '@/services/assemblies'
import { ataParagraphs, ataText, type AtaSnapshot } from '@/lib/assemblies'
import { Pencil, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'
import { Panel, type AssemblyCtx } from './common'

/** Editar o texto da ata à mão. Vazio, a ata volta a ser montada sozinha. */
export default function AtaTextEditor({ ctx, live }: { ctx: AssemblyCtx; live: AtaSnapshot }) {
  const { assembly: a, locked, canEdit, canAta, reload } = ctx
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const custom = !!a.minutes_text?.trim()
  const can = !locked && (canEdit || canAta)

  const start = () => {
    setText(ataText(live).join('\n\n'))
    setEditing(true)
  }

  const save = async (value: string, ok: string) => {
    setSaving(true)
    try {
      await updateAssembly(a.id, { minutes_text: value })
      await reload()
      setEditing(false)
      toast({ title: ok })
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const reset = () =>
    confirm({
      title: 'Voltar ao texto automático?',
      description:
        'As mudanças feitas à mão no texto da ata são apagadas e a ata volta a ser montada com os dados da convocação, presença e votação.',
      confirmLabel: 'Voltar ao automático',
      destructive: true,
      onConfirm: () => save('', 'Texto automático restaurado'),
    })

  return (
    <Panel
      title="Texto da ata"
      description={
        custom
          ? 'A ata está usando o texto editado à mão. Mudanças na pauta, presença ou votação não entram sozinhas: ajuste o texto ou volte ao automático.'
          : 'A ata é montada sozinha com os dados da assembleia. Se precisar, edite o texto antes de imprimir.'
      }
      actions={
        can && !editing ? (
          <div className="flex flex-wrap gap-2">
            {custom && (
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={saving}
                className="rounded-xl gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Voltar ao automático
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={start} className="rounded-xl gap-1.5">
              <Pencil className="h-4 w-4" />
              Editar texto da ata
            </Button>
          </div>
        ) : null
      }
    >
      {dialog}
      {editing ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Deixe uma linha em branco entre um parágrafo e outro. O timbre, a data e as assinaturas
            continuam saindo sozinhos.
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={22}
            className="rounded-xl border-slate-200 font-serif text-sm leading-relaxed"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => setText(ataParagraphs(live).join('\n\n'))}
              disabled={saving}
              className="rounded-xl gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              Recomeçar do automático
            </Button>
            <Button
              onClick={() => save(text.trim(), 'Texto da ata salvo')}
              disabled={saving || !text.trim()}
              className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
            >
              <Save className="h-4 w-4" />
              Salvar texto
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2 font-serif text-sm text-slate-800 text-justify">
          {ataText(live).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </Panel>
  )
}
