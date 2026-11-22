import React, { useEffect, useState } from 'react'
import { saveItem, updateAssembly, updateCandidate } from '@/services/assemblies'
import {
  METHOD_LABELS,
  MAJORITY_LABELS,
  quorumStatus,
  isEligibleVoter,
  tallyItem,
  type AssemblyCandidate,
  type AssemblyItem,
  type CallOpened,
} from '@/lib/assemblies'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'
import { Field, Panel, inputClass, selectClass, type AssemblyCtx } from './common'

function NumberBox({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={inputClass}
      />
    </Field>
  )
}

function ItemVote({
  ctx,
  item,
  presentVoters,
}: {
  ctx: AssemblyCtx
  item: AssemblyItem
  presentVoters: number
}) {
  const { candidates, peopleById, canTally, reload } = ctx
  const { toast } = useToast()
  const mine = candidates.filter((c) => c.item_id === item.id)
  const [v, setV] = useState({
    voters: item.voters || 0,
    votes_yes: item.votes_yes || 0,
    votes_no: item.votes_no || 0,
    votes_abstain: item.votes_abstain || 0,
    votes_blank: item.votes_blank || 0,
    votes_null: item.votes_null || 0,
    approved: !!item.approved,
    result_note: item.result_note || '',
  })
  const [cv, setCv] = useState<Record<string, { votes: number; elected: boolean }>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setCv(Object.fromEntries(mine.map((c) => [c.id, { votes: c.votes || 0, elected: !!c.elected }])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates])

  const merged: AssemblyCandidate[] = mine.map((c) => ({ ...c, ...(cv[c.id] || {}) }))
  const tally = tallyItem({ ...item, ...v }, merged, presentVoters)
  const accl = item.method === 'ACLAMACAO'
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    setV((p) => ({ ...p, [k]: val }))

  const applyTally = () => {
    if (item.kind === 'ELEICAO') {
      setCv((p) =>
        Object.fromEntries(
          Object.entries(p).map(([id, x]) => [id, { ...x, elected: tally.electedIds.includes(id) }]),
        ),
      )
    } else set('approved', tally.approved)
  }

  const save = async () => {
    setSaving(true)
    try {
      const approved =
        item.kind === 'ELEICAO' ? merged.some((c) => c.elected) : v.approved
      await saveItem(ctx.assembly, item.id, { ...v, approved, decided: true })
      for (const c of mine) {
        const now = cv[c.id]
        if (now && (now.votes !== (c.votes || 0) || now.elected !== !!c.elected))
          await updateCandidate(c.id, now)
      }
      await reload()
      toast({ title: `${item.title}: resultado salvo` })
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

  const disabled = !canTally
  return (
    <Panel
      title={item.title}
      description={`${item.method ? METHOD_LABELS[item.method] : ''}${!accl && item.majority ? ` · ${MAJORITY_LABELS[item.majority]}` : ''}${item.kind === 'ELEICAO' && (item.seats || 1) > 1 ? ` · ${item.seats} vagas` : ''}`}
      actions={
        item.decided ? (
          <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-800">
            Resultado salvo
          </span>
        ) : undefined
      }
    >
      {item.kind !== 'DELIBERACAO' && mine.length === 0 && (
        <p className="text-sm text-amber-700">Inclua os candidatos na aba Pauta e cargos.</p>
      )}
      {!accl && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumberBox
            id={`vt-${item.id}`}
            label={`Votantes neste ponto (presentes: ${presentVoters})`}
            value={v.voters}
            onChange={(n) => set('voters', n)}
            disabled={disabled}
          />
          {item.kind !== 'ELEICAO' && (
            <>
              <NumberBox
                id={`y-${item.id}`}
                label="Sim"
                value={v.votes_yes}
                onChange={(n) => set('votes_yes', n)}
                disabled={disabled}
              />
              <NumberBox
                id={`n-${item.id}`}
                label="Não"
                value={v.votes_no}
                onChange={(n) => set('votes_no', n)}
                disabled={disabled}
              />
              <NumberBox
                id={`a-${item.id}`}
                label="Abstenções"
                value={v.votes_abstain}
                onChange={(n) => set('votes_abstain', n)}
                disabled={disabled}
              />
            </>
          )}
          <NumberBox
            id={`b-${item.id}`}
            label="Brancos"
            value={v.votes_blank}
            onChange={(n) => set('votes_blank', n)}
            disabled={disabled}
          />
          <NumberBox
            id={`nu-${item.id}`}
            label="Nulos"
            value={v.votes_null}
            onChange={(n) => set('votes_null', n)}
            disabled={disabled}
          />
        </div>
      )}

      {item.kind !== 'DELIBERACAO' && mine.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {mine.map((c) => {
            const p = peopleById.get(c.person_id)
            const x = cv[c.id] || { votes: 0, elected: false }
            return (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 min-w-0 text-sm truncate">{p?.name || 'Ficha removida'}</span>
                {item.kind === 'ELEICAO' && !accl && (
                  <Input
                    type="number"
                    min={0}
                    aria-label={`Votos de ${p?.name}`}
                    value={x.votes}
                    disabled={disabled}
                    onChange={(e) =>
                      setCv((prev) => ({
                        ...prev,
                        [c.id]: { ...x, votes: Math.max(0, Number(e.target.value) || 0) },
                      }))
                    }
                    className="w-24 rounded-xl"
                  />
                )}
                {item.kind === 'ELEICAO' && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Checkbox
                      checked={x.elected}
                      disabled={disabled}
                      onCheckedChange={(val) =>
                        setCv((prev) => ({ ...prev, [c.id]: { ...x, elected: !!val } }))
                      }
                    />
                    eleito
                  </label>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {item.kind !== 'ELEICAO' && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox
            checked={v.approved}
            disabled={disabled}
            onCheckedChange={(val) => set('approved', !!val)}
          />
          {item.kind === 'REFERENDO' ? 'Recondução aprovada' : 'Proposta aprovada'}
        </label>
      )}

      {!accl && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
          <p className="text-slate-700">
            {item.kind === 'ELEICAO'
              ? `Votos válidos: ${tally.valid}. ${item.majority && item.majority !== 'SIMPLES' ? `Para eleger: ${tally.needed} votos.` : 'Os mais votados ocupam as vagas.'}`
              : `Total: ${tally.total}. Para aprovar: ${tally.needed} votos "sim".`}{' '}
            Pela conta:{' '}
            <strong>
              {item.kind === 'ELEICAO'
                ? tally.tie
                  ? 'empate, a mesa decide pelo critério do estatuto'
                  : tally.electedIds.length
                    ? tally.electedIds
                        .map((id) => peopleById.get(mine.find((c) => c.id === id)?.person_id || '')?.name)
                        .join(', ')
                    : 'ninguém atingiu a maioria'
                : tally.approved
                  ? 'aprovado'
                  : 'não aprovado'}
            </strong>
          </p>
          {tally.problems.map((p) => (
            <p key={p} className="text-amber-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {p}
            </p>
          ))}
          {canTally && (
            <Button variant="outline" size="sm" onClick={applyTally} className="rounded-xl mt-1">
              Usar o resultado da conta
            </Button>
          )}
        </div>
      )}

      <Field id={`note-${item.id}`} label="Observação para a ata (opcional)">
        <Textarea
          id={`note-${item.id}`}
          value={v.result_note}
          disabled={disabled}
          onChange={(e) => set('result_note', e.target.value)}
          rows={2}
          className={inputClass}
        />
      </Field>
      {canTally && (
        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={saving}
            className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
          >
            <CheckCircle2 className="h-4 w-4" />
            Salvar resultado
          </Button>
        </div>
      )}
    </Panel>
  )
}

export default function AssemblyVoting({ ctx }: { ctx: AssemblyCtx }) {
  const { assembly: a, attendees, items, people, peopleById, canTally, reload } = ctx
  const { toast } = useToast()
  const presentVoters = attendees.filter((x) => x.voter).length
  const eligible = people.filter((p) => isEligibleVoter(p, a)).length
  const q = quorumStatus(a, eligible, presentVoters)
  const [m, setM] = useState({
    president_id: a.president_id || '',
    secretary_id: a.secretary_id || '',
    opened_on: (a.opened_on || q.reachedOn || '') as CallOpened | '',
    started_at: a.started_at || '',
    ended_at: a.ended_at || '',
    notes: a.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof m>(k: K, v: (typeof m)[K]) => setM((p) => ({ ...p, [k]: v }))

  // Mesa: quem está presente primeiro; se ninguém, todas as fichas
  const present = attendees.map((x) => peopleById.get(x.person_id)).filter(Boolean)
  const options = (present.length ? present : people)
    .map((p) => p!)
    .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))

  const saveMesa = async () => {
    setSaving(true)
    try {
      await updateAssembly(a.id, {
        ...m,
        ...(a.status === 'RASCUNHO' || a.status === 'CONVOCADA' || !a.status
          ? { status: 'REALIZADA' as const }
          : {}),
      })
      await reload()
      toast({ title: 'Mesa e horários salvos' })
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

  return (
    <div className="space-y-4">
      <Panel
        title="Mesa e abertura"
        description="Quem presidiu e quem secretariou assinam a ata. Salvar marca a assembleia como realizada."
      >
        <fieldset disabled={!canTally} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="m-pres" label="Presidente da assembleia">
            <select
              id="m-pres"
              value={m.president_id}
              onChange={(e) => set('president_id', e.target.value)}
              className={selectClass}
            >
              <option value="">Escolha</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="m-sec" label="Secretário(a)">
            <select
              id="m-sec"
              value={m.secretary_id}
              onChange={(e) => set('secretary_id', e.target.value)}
              className={selectClass}
            >
              <option value="">Escolha</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="m-open" label="Instalada em">
            <select
              id="m-open"
              value={m.opened_on}
              onChange={(e) => set('opened_on', e.target.value as CallOpened | '')}
              className={selectClass}
            >
              <option value="">Escolha</option>
              <option value="PRIMEIRA">1ª convocação</option>
              <option value="SEGUNDA">2ª convocação</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="m-start" label="Início">
              <Input
                id="m-start"
                type="time"
                value={m.started_at}
                onChange={(e) => set('started_at', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="m-end" label="Encerramento">
              <Input
                id="m-end"
                type="time"
                value={m.ended_at}
                onChange={(e) => set('ended_at', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field
            id="m-notes"
            label="Outras ocorrências (opcional, entra na ata antes do encerramento)"
            className="sm:col-span-2"
          >
            <Textarea
              id="m-notes"
              value={m.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>
        </fieldset>
        {canTally && (
          <div className="flex justify-end">
            <Button onClick={saveMesa} disabled={saving} className="rounded-xl bg-teal-700 hover:bg-teal-800">
              Salvar mesa
            </Button>
          </div>
        )}
      </Panel>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Monte a pauta antes de registrar a votação.</p>
      ) : (
        items.map((it) => (
          <ItemVote key={it.id} ctx={ctx} item={it} presentVoters={presentVoters} />
        ))
      )}
    </div>
  )
}
