import React, { useState } from 'react'
import { updateAssembly } from '@/services/assemblies'
import {
  ASSEMBLY_KIND_LABELS,
  QUORUM_LABELS,
  type AssemblyKind,
  type QuorumRule,
} from '@/lib/assemblies'
import { PERSON_STATUS_LABELS, PERSON_STATUS_ORDER } from '@/lib/membership'
import type { PersonStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'
import { Field, Panel, inputClass, selectClass, toPbDate, ymd, type AssemblyCtx } from './common'

export default function AssemblySetup({ ctx }: { ctx: AssemblyCtx }) {
  const { assembly: a, canEdit, reload } = ctx
  const { toast } = useToast()
  const [f, setF] = useState({
    title: a.title,
    kind: (a.kind || 'ORDINARIA') as AssemblyKind,
    date: ymd(a.date),
    place: a.place || '',
    first_call: a.first_call || '',
    second_call: a.second_call || '',
    call_date: ymd(a.call_date),
    call_means: a.call_means || '',
    agenda: a.agenda || '',
    voter_statuses: (a.voter_statuses?.length ? a.voter_statuses : ['MEMBRO']) as PersonStatus[],
    voter_min_age: a.voter_min_age || 0,
    quorum_first: (a.quorum_first || 'MAIORIA_ABSOLUTA') as QuorumRule,
    quorum_second: (a.quorum_second || 'QUALQUER') as QuorumRule,
    quorum_min: a.quorum_min || 0,
    statute_note: a.statute_note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  const save = async (status?: 'CONVOCADA') => {
    setSaving(true)
    try {
      await updateAssembly(a.id, {
        ...f,
        title: f.title.trim() || a.title,
        date: toPbDate(f.date),
        call_date: toPbDate(f.call_date),
        ...(status ? { status } : {}),
      })
      await reload()
      toast({ title: status ? 'Assembleia marcada como convocada' : 'Convocação salva' })
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

  const needsMin = f.quorum_first === 'NUMERO' || f.quorum_second === 'NUMERO'

  return (
    <div className="space-y-4">
      <Panel
        title="Data, local e edital"
        description="O edital precisa sair no prazo que o estatuto pede antes da assembleia (o cartório confere)."
      >
        <fieldset disabled={!canEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="a-title" label="Nome" className="sm:col-span-2">
            <Input
              id="a-title"
              value={f.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="a-kind" label="Tipo">
            <select
              id="a-kind"
              value={f.kind}
              onChange={(e) => set('kind', e.target.value as AssemblyKind)}
              className={selectClass}
            >
              {(Object.keys(ASSEMBLY_KIND_LABELS) as AssemblyKind[]).map((k) => (
                <option key={k} value={k}>
                  {ASSEMBLY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="a-date" label="Data da assembleia">
            <Input
              id="a-date"
              type="date"
              value={f.date}
              onChange={(e) => set('date', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="a-first" label="1ª convocação (hora)">
            <Input
              id="a-first"
              type="time"
              value={f.first_call}
              onChange={(e) => set('first_call', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="a-second" label="2ª convocação (hora)">
            <Input
              id="a-second"
              type="time"
              value={f.second_call}
              onChange={(e) => set('second_call', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="a-place" label="Local" className="sm:col-span-2">
            <Input
              id="a-place"
              value={f.place}
              onChange={(e) => set('place', e.target.value)}
              placeholder="Ex: templo sede, Estrada de Aldeia, km 12, Camaragibe/PE"
              className={inputClass}
            />
          </Field>
          <Field id="a-call-date" label="Data do edital">
            <Input
              id="a-call-date"
              type="date"
              value={f.call_date}
              onChange={(e) => set('call_date', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="a-call-means" label="Como foi divulgado">
            <Input
              id="a-call-means"
              value={f.call_means}
              onChange={(e) => set('call_means', e.target.value)}
              placeholder="afixado no mural e lido nos cultos"
              className={inputClass}
            />
          </Field>
          <Field
            id="a-agenda"
            label="Ordem do dia (uma linha por ponto)"
            hint="Em branco, o edital e a ata usam os pontos da aba Pauta e cargos."
            className="sm:col-span-2"
          >
            <Textarea
              id="a-agenda"
              value={f.agenda}
              onChange={(e) => set('agenda', e.target.value)}
              rows={4}
              className={inputClass}
            />
          </Field>
        </fieldset>
      </Panel>

      <Panel
        title="Quem vota e quórum (conforme o estatuto)"
        description="O sistema usa isto para dizer se a assembleia pode ser instalada."
      >
        <fieldset disabled={!canEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <p className="text-xs font-semibold text-slate-700">Situações que votam</p>
            <div className="flex flex-wrap gap-3">
              {PERSON_STATUS_ORDER.filter((s) => s !== 'FALECIDO').map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={f.voter_statuses.includes(s)}
                    onCheckedChange={(v) =>
                      set(
                        'voter_statuses',
                        v
                          ? [...f.voter_statuses, s]
                          : f.voter_statuses.filter((x) => x !== s),
                      )
                    }
                  />
                  {PERSON_STATUS_LABELS[s]}
                </label>
              ))}
            </div>
          </div>
          <Field id="a-age" label="Idade mínima para votar (0 = sem limite)">
            <Input
              id="a-age"
              type="number"
              min={0}
              value={f.voter_min_age}
              onChange={(e) => set('voter_min_age', Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <div />
          <Field id="a-q1" label="Quórum na 1ª convocação">
            <select
              id="a-q1"
              value={f.quorum_first}
              onChange={(e) => set('quorum_first', e.target.value as QuorumRule)}
              className={selectClass}
            >
              {(Object.keys(QUORUM_LABELS) as QuorumRule[]).map((k) => (
                <option key={k} value={k}>
                  {QUORUM_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="a-q2" label="Quórum na 2ª convocação">
            <select
              id="a-q2"
              value={f.quorum_second}
              onChange={(e) => set('quorum_second', e.target.value as QuorumRule)}
              className={selectClass}
            >
              {(Object.keys(QUORUM_LABELS) as QuorumRule[]).map((k) => (
                <option key={k} value={k}>
                  {QUORUM_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          {needsMin && (
            <Field id="a-qmin" label="Número mínimo de presentes">
              <Input
                id="a-qmin"
                type="number"
                min={0}
                value={f.quorum_min}
                onChange={(e) => set('quorum_min', Number(e.target.value) || 0)}
                className={inputClass}
              />
            </Field>
          )}
          <Field
            id="a-statute"
            label="Artigo do estatuto (opcional)"
            hint="Ex: art. 15 do estatuto. Sai na ata ao lado do quórum."
            className="sm:col-span-2"
          >
            <Input
              id="a-statute"
              value={f.statute_note}
              onChange={(e) => set('statute_note', e.target.value)}
              className={inputClass}
            />
          </Field>
        </fieldset>
      </Panel>

      {canEdit && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => save()}
            className="rounded-xl"
          >
            Salvar
          </Button>
          {(a.status === 'RASCUNHO' || !a.status) && (
            <Button
              disabled={saving || !f.date || !f.call_date}
              onClick={() => save('CONVOCADA')}
              className="rounded-xl bg-teal-700 hover:bg-teal-800"
            >
              Salvar e marcar como convocada
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
