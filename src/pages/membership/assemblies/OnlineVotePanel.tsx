import React, { useCallback, useEffect, useState } from 'react'
import {
  listOnlineBallots,
  listOnlineVoters,
  saveItem,
  updateAssembly,
  updateCandidate,
  type OnlineVoter,
} from '@/services/assemblies'
import { countBallots, newVoteKey, onlineResultPatches, type OnlineCounts } from '@/lib/assemblies'
import { Link } from 'react-router-dom'
import { Copy, Download, ExternalLink, Lock, Printer, RefreshCw, Unlock } from 'lucide-react'
import { onlineVoterRows, votersCsv } from './onlineVoters'
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
  const [voters, setVoters] = useState<OnlineVoter[]>([])
  const [counts, setCounts] = useState<OnlineCounts>({ SIM: 0, NAO: 0, ABSTENCAO: 0 })
  const [busy, setBusy] = useState(false)

  const link = a.vote_key ? `${window.location.origin}/votar/${a.vote_key}` : ''

  const load = useCallback(async () => {
    if (!a.vote_key) return
    // Quem só vê a assembleia não lê os dados pessoais dos votantes: cada lista falha sozinha
    const [v, b] = await Promise.allSettled([listOnlineVoters(a.id), listOnlineBallots(a.id)])
    if (v.status === 'fulfilled') setVoters(v.value)
    if (b.status === 'fulfilled') setCounts(countBallots(b.value))
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
  const rows = onlineVoterRows(voters, peopleById)
  const downloadCsv = () => {
    const blob = new Blob(['\ufeff' + votersCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = `votantes-${a.title.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`
    el.click()
    URL.revokeObjectURL(url)
  }
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
      description="Quem receber o link vota, uma vez por CPF, informando nome completo, CPF e data de nascimento. Quem tem ficha na igreja entra sozinho na lista de presença. O voto é secreto: o sistema guarda quem votou (nome, CPF, horário e IP, para a ata), mas não em quê."
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
              Desmarcado, qualquer pessoa com o link vota; quem tem ficha entra sozinho na lista de
              presença.
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
              {rows.some((r) => !r.cpf) && (
                <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {rows.filter((r) => !r.cpf).length} votaram antes de o sistema guardar CPF e IP.
                  Peça que abram o link de novo e preencham os dados: o voto não muda, só os dados
                  são completados.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadCsv}
                  className="rounded-xl gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  Baixar planilha (CSV)
                </Button>
                <Link to={`/membros/assembleias/${a.id}/documentos?doc=votantes`}>
                  <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
                    <Printer className="h-4 w-4" />
                    Lista para a ata
                  </Button>
                </Link>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-2">Nome</th>
                      <th className="py-1 pr-2">CPF</th>
                      <th className="py-1 pr-2">Horário</th>
                      <th className="py-1">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id} className="text-slate-700">
                        <td className="py-1.5 pr-2">{r.name}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{r.cpf || '—'}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{r.when}</td>
                        <td className="py-1.5 whitespace-nowrap">{r.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </Panel>
  )
}
