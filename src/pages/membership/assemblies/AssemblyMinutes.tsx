import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { finalizeAssembly, reopenAssembly } from '@/services/assemblies'
import { ataProblems, buildSnapshot, electedList } from '@/lib/assemblies'
import { AlertTriangle, CheckCircle2, FileText, Lock, Printer, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'
import { Panel, type AssemblyCtx } from './common'
import AtaTextEditor from './AtaTextEditor'

const CHECKLIST = [
  'Requerimento assinado pelo presidente, com firma reconhecida',
  'Edital de convocação',
  'Ata assinada pelo presidente e pelo secretário (2 vias)',
  'Lista de presença assinada',
  'Termo de posse assinado pelos empossados, com firmas reconhecidas',
  'Cópia do RG e do CPF de cada eleito (só para conferência)',
  'Comprovante de inscrição no CNPJ',
  'Atas de eleição e posse anteriores, se alguma ainda não foi registrada',
]

export default function AssemblyMinutes({ ctx }: { ctx: AssemblyCtx }) {
  const { assembly, locked, canAta, reload } = ctx
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState(false)
  const live = useMemo(
    () =>
      buildSnapshot({
        church: ctx.church,
        assembly: ctx.assembly,
        items: ctx.items,
        candidates: ctx.candidates,
        attendees: ctx.attendees,
        people: ctx.people,
      }),
    [ctx],
  )
  const snap = locked && assembly.minutes ? assembly.minutes : live
  const problems = locked ? [] : ataProblems(live)
  const elected = electedList(snap)

  const finalize = () =>
    confirm({
      title: 'Finalizar a ata?',
      description:
        'Os dados da ata ficam congelados como estão agora (inclusive a qualificação dos eleitos). Pauta, presença e votos não mudam mais, a não ser que alguém com permissão reabra.',
      confirmLabel: 'Finalizar',
      onConfirm: async () => {
        setBusy(true)
        try {
          await finalizeAssembly(assembly.id, live)
          await reload()
          toast({ title: 'Ata finalizada' })
        } catch (err) {
          toast({
            title: 'Não foi possível finalizar',
            description: errorMessage(err, 'Tente de novo.'),
            variant: 'destructive',
          })
        } finally {
          setBusy(false)
        }
      },
    })

  const reopen = () =>
    confirm({
      title: 'Reabrir a assembleia?',
      description:
        'Use só para corrigir algo antes de levar ao cartório. A ata volta a ser montada com os dados atuais.',
      confirmLabel: 'Reabrir',
      destructive: true,
      onConfirm: async () => {
        try {
          await reopenAssembly(assembly.id)
          await reload()
        } catch (err) {
          toast({
            title: 'Não foi possível reabrir',
            description: errorMessage(err, 'Tente de novo.'),
            variant: 'destructive',
          })
        }
      },
    })

  return (
    <div className="space-y-4">
      {dialog}
      <Panel
        title={locked ? 'Ata finalizada' : 'Antes de finalizar'}
        description={
          locked
            ? 'Os documentos abaixo saem com os dados congelados no momento da finalização.'
            : 'O que falta para o cartório aceitar. Os documentos já podem ser vistos como rascunho.'
        }
        actions={
          locked
            ? canAta && (
                <Button variant="outline" onClick={reopen} className="rounded-xl gap-1.5">
                  <Unlock className="h-4 w-4" />
                  Reabrir
                </Button>
              )
            : canAta && (
                <Button
                  onClick={finalize}
                  disabled={busy || problems.length > 0}
                  className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
                >
                  <Lock className="h-4 w-4" />
                  Finalizar ata
                </Button>
              )
        }
      >
        {locked ? (
          <p className="text-sm text-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Pronta para imprimir, assinar e levar ao cartório.
          </p>
        ) : problems.length === 0 ? (
          <p className="text-sm text-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Tudo certo para finalizar.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {problems.map((p) => (
              <li key={p} className="text-sm text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        )}
        {!locked && !canAta && (
          <p className="text-xs text-slate-500">
            Finalizar a ata pede a permissão "Finalizar a ata e reabrir" (Perfis de acesso).
          </p>
        )}
      </Panel>

      {elected.length > 0 && (
        <Panel title="Eleitos e reconduzidos" description="Como sai a qualificação de cada um.">
          <ul className="space-y-2">
            {elected.map((e) => (
              <li key={`${e.office}-${e.person.id}`} className="text-sm">
                <p className="font-semibold text-slate-900">
                  {e.office}:{' '}
                  <Link to={`/membros/${e.person.id}/editar`} className="hover:underline">
                    {e.person.name}
                  </Link>
                </p>
                <p className="text-slate-600 text-xs">{e.person.qualification}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <AtaTextEditor ctx={ctx} live={snap} />

      <Panel title="Documentos" description="Abrem numa folha A4: Imprimir ou salvar PDF.">
        <div className="flex flex-wrap gap-2">
          {[
            ['edital', 'Edital de convocação'],
            ['presenca', 'Lista de presença'],
            ['votantes', 'Votantes on-line'],
            ['ata', 'Ata'],
            ['posse', 'Termo de posse'],
            ['requerimento', 'Requerimento ao cartório'],
          ].map(([k, label]) => (
            <Button key={k} asChild variant="outline" className="rounded-xl gap-1.5">
              <Link to={`/membros/assembleias/${assembly.id}/documentos?doc=${k}`}>
                {k === 'ata' ? <FileText className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </Panel>

      <Panel
        title="O que levar ao cartório (RCPJ)"
        description="Código de Normas do TJPE, arts. 892 a 904."
      >
        <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
          {CHECKLIST.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          Confirme com o cartório onde o estatuto está registrado se pedem algo a mais (visto de
          advogado na ata, assinatura eletrônica).
        </p>
      </Panel>
    </div>
  )
}
