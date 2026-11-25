import React from 'react'
import { Link } from 'react-router-dom'
import { autoDocBody, customDocBody, type AtaSnapshot } from '@/lib/assemblies'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichText } from '@/pages/site/RichText'
import { Panel, type AssemblyCtx } from './common'

/**
 * Texto da ata: mostra o que vai sair e leva ao editor, que fica na tela de documentos (lá
 * também se editam o edital, o termo de posse e os demais, com a folha mostrando como fica).
 */
export default function AtaTextEditor({ ctx, live }: { ctx: AssemblyCtx; live: AtaSnapshot }) {
  const { assembly: a, locked, canEdit, canAta } = ctx
  const custom = customDocBody('ata', a)
  const can = canAta || (!locked && canEdit)

  return (
    <Panel
      title="Texto da ata"
      description={
        custom
          ? 'A ata está usando o texto editado à mão. Mudanças na pauta, presença ou votação não entram sozinhas: ajuste o texto ou volte ao automático.'
          : 'A ata é montada sozinha com os dados da assembleia. Se precisar, edite o texto antes de imprimir.'
      }
      actions={
        can ? (
          <Button asChild variant="outline" size="sm" className="rounded-xl gap-1.5">
            <Link to={`/membros/assembleias/${a.id}/documentos?doc=ata&editar=1`}>
              <Pencil className="h-4 w-4" />
              Editar documentos
            </Link>
          </Button>
        ) : null
      }
    >
      <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3 font-serif text-sm text-slate-800">
        <RichText
          text={custom || autoDocBody('ata', live, live.president?.name || '')}
          defaultAlign="justify"
          className="space-y-2"
        />
      </div>
    </Panel>
  )
}
