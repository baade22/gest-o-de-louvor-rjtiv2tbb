import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBankRaw, listBankRaw, type BankRawFetch } from '@/services/finance'
import type { FinAccount } from '@/types/finance'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { shortDate } from './shared'

const when = (s: string) => {
  const d = new Date(s.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** O que o banco devolveu em cada busca do conector (pedido sem token e resposta crua). */
export function BankRawDialog({
  churchId,
  account,
  onClose,
}: {
  churchId: string
  account: FinAccount
  onClose: () => void
}) {
  const [items, setItems] = useState<BankRawFetch[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<BankRawFetch | null>(null)
  const [loadingOne, setLoadingOne] = useState('')

  useEffect(() => {
    let alive = true
    listBankRaw(churchId, account.id)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setError('Não foi possível carregar as buscas.'))
    return () => {
      alive = false
    }
  }, [churchId, account.id])

  const show = async (it: BankRawFetch) => {
    setError('')
    setLoadingOne(it.id)
    try {
      setOpen(await getBankRaw(churchId, it.id))
    } catch (err) {
      const e = err as { status?: number; response?: { message?: string } }
      setError(
        `Não foi possível abrir esta busca${e?.status ? ` (código ${e.status})` : ''}.` +
          (e?.response?.message ? ` ${e.response.message}` : ''),
      )
    } finally {
      setLoadingOne('')
    }
  }

  const download = (it: BankRawFetch) => {
    const blob = new Blob([JSON.stringify(it, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resposta-${it.provider.toLowerCase()}-${it.created.slice(0, 16).replace(/[ :]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Resposta do banco</DialogTitle>
          <DialogDescription>
            {account.name}: o que o banco devolveu em cada busca do conector (as 40 mais recentes).
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
        {!items && !error && (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}
        {items && items.length === 0 && (
          <p className="py-6 text-sm text-slate-500">
            Nenhuma busca guardada ainda. A próxima busca do conector já fica aqui.
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {items.map((it) => (
              <li
                key={it.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 px-3 py-2 text-sm',
                  open?.id === it.id && 'bg-teal-50',
                )}
              >
                <span className="font-semibold tabular-nums text-slate-800">
                  {when(it.created)}
                </span>
                <span className="text-xs text-slate-500">
                  período {shortDate(it.start_date, true)} a {shortDate(it.end_date, true)} ·{' '}
                  {it.lines_count} movimento(s)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-8 rounded-lg"
                  onClick={() => show(it)}
                  disabled={loadingOne === it.id}
                >
                  {loadingOne === it.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Ver
                </Button>
              </li>
            ))}
          </ul>
        )}
        {open && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">
                Busca de {when(open.created)}
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-8 gap-1.5 rounded-lg"
                onClick={() => download(open)}
              >
                <Download className="h-3.5 w-3.5" /> Baixar .json
              </Button>
            </div>
            <pre className="max-h-[50vh] overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {JSON.stringify({ pedido: open.request, resposta: open.response }, null, 2)}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
