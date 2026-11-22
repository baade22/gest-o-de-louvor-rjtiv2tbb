import React, { useCallback, useEffect, useState } from 'react'
import {
  listOnlineBallots,
  listOnlineVoters,
  saveItem,
  updateAssembly,
  updateCandidate,
} from '@/services/assemblies'
import { countBallots, newVoteKey, onlineResultPatches, type OnlineCounts } from '@/lib/assemblies'
import { Copy, ExternalLink, Lock, RefreshCw, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '../shared'
import { Panel, type AssemblyCtx } from './common'

/** Link público para os membros votarem na chapa (SIM, NÃO ou ABSTENÇÃO). */
export default function OnlineVotePanel({ ctx }: { ctx: AssemblyCtx }) {
  const { assembly: a, items, candidates, peopleById, canTally, reload } = ctx
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [voters, setVoters] = useState<{ id: string; person_id: string; created: string }[]>([])
  const [counts, setCounts] = useState<OnlineCounts>({ SIM: 0, NAO: 0, ABSTENCAO: 0 })
  const [busy, setBusy] = useState(false)

  const link = a.vote_key ? `${window.location.origin}/votar/${a.vote_key}` : ''

  const load = useCallback(async () => {
    if (!a.vote_key) return
    try {
      const [v, b] = await Promise.all([listOnlineVoters(a.id), listOnlineBallots(a.id)])
      setVoters(v)
      setCounts(countBallots(b))
    } catch {
      /* sem permissão ou coleção ainda não criada: o painel fica sem números */
    }
  }, [a.id, a.vote_key])

  useEffect(() => {
    load()
  }, [load])

  // Enquanto a votação está aberta, os números se atualizam sozinhos
  useEffect(() => {
    if (!a.vote_open) return
    const t = window.setInterval(load, 15000)
    return () => window.clearInterval(t)
  }, [a.vote_open, load])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      await reload()
      await load()
      toast({ title: ok })
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const open = () =>
    run(
      () => updateAssembly(a.id, { vote_key: a.vote_key || newVoteKey(), vote_open: true }),
      'Votação on-line aberta',
    )
  const close = () =>
    run(() => updateAssembly(a.id, { vote_open: false }), 'Votação on-line encerrada')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Link copiado' })
    } catch {
      toast({ title: 'Copie o link no campo acima', variant: 'destructive' })
    }
  }

  const total = counts.SIM + counts.NAO + counts.ABSTENCAO
  const patches = onlineResultPatches(items, candidates, counts)

  const apply = () =>
    confirm({
      title: 'Lançar o resultado nos cargos?',
      description: `Cada cargo da chapa recebe ${counts.SIM} SIM, ${counts.NAO} NÃO e ${counts.ABSTENCAO} abstenções, por escrutínio secreto. Encerre a votação antes, para os números não mudarem depois.`,
      confirmLabel: 'Lançar resultado',
      onConfirm: () =>
        run(async () => {
          for (const p of patches) {
            await saveItem(a, p.item.id, p.patch)
            for (const c of p.candidates)
              await updateCandidate(c.id, { votes: c.votes, elected: c.elected })
          }
        }, 'Resultado lançado nos cargos'),
    })

  return (
    <Panel
      title="Votação on-line da chapa"
      description="Mande o link só para os membros presentes. Cada um informa nome completo, CPF e data de nascimento, e o voto só vale se bater com a ficha. O voto é secreto: o sistema mostra quem votou, mas não em quê."
      actions={
        canTally ? (
          a.vote_open ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={close}
              className="rounded-xl gap-1.5"
            >
              <Lock className="h-4 w-4" />
              Encerrar votação
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={open}
              className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
            >
              <Unlock className="h-4 w-4" />
              {a.vote_key ? 'Reabrir votação' : 'Criar link e abrir votação'}
            </Button>
          )
        ) : null
      }
    >
      {dialog}
      {link && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="rounded-xl text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar link"
              onClick={copy}
              className="rounded-xl shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <a href={link} target="_blank" rel="noreferrer">
              <Button
                variant="outline"
                size="icon"
                aria-label="Abrir link"
                className="rounded-xl shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
          <p
            className={`text-xs font-semibold ${a.vote_open ? 'text-emerald-700' : 'text-slate-500'}`}
          >
            {a.vote_open
              ? 'Votação aberta: o link está recebendo votos.'
              : 'Votação fechada: o link não aceita votos.'}
          </p>
        </div>
      )}

      {canTally && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <Checkbox
            checked={!!a.vote_only_present}
            disabled={busy}
            onCheckedChange={(v) =>
              run(() => updateAssembly(a.id, { vote_only_present: !!v }), 'Regra salva')
            }
            className="mt-0.5"
          />
          <span>
            Só quem já está na lista de presença pode votar.
            <span className="block text-xs text-slate-500">
              Desmarcado, quem vota on-line entra sozinho na lista de presença.
            </span>
          </span>
        </label>
      )}

      {a.vote_key && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {(
              [
                ['Votaram', total],
                ['SIM', counts.SIM],
                ['NÃO', counts.NAO],
                ['Abstenção', counts.ABSTENCAO],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-xl border border-slate-200 py-2">
                <p className="text-xl font-extrabold text-slate-900">{n}</p>
                <p className="text-[11px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={load} className="rounded-xl gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            {canTally && total > 0 && patches.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={apply}
                className="rounded-xl"
              >
                Lançar resultado nos cargos
              </Button>
            )}
          </div>
          {voters.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-700 font-semibold">
                Quem já votou ({voters.length})
              </summary>
              <ul className="mt-2 divide-y divide-slate-100">
                {voters
                  .map((v) => peopleById.get(v.person_id)?.name || 'Pessoa removida')
                  .sort((x, y) => x.localeCompare(y, 'pt-BR'))
                  .map((name, i) => (
                    <li key={i} className="py-1.5 text-slate-700">
                      {name}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  )
}
