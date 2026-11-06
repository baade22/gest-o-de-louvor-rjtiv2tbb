import { useEffect, useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { formatCents } from '@/lib/money'
import { listListVoided, unvoidList } from '@/services/finance'
import type { FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { shortDate } from './shared'

/**
 * Aviso para o MASTER: lançamentos estornados pela lista "O que falta conciliar" (que saiu do
 * Painel). Um botão volta todos e religa o extrato e as contas pagas que o estorno desfez.
 */
export function UnvoidBanner({ churchId }: { churchId: string }) {
  const { isMaster } = useAuth()
  const { toast } = useToast()
  const [items, setItems] = useState<FinTransaction[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isMaster) return
    listListVoided(churchId)
      .then(setItems)
      .catch(() => setItems([]))
  }, [churchId, isMaster])

  if (!isMaster || items.length === 0) return null

  const undo = async () => {
    setBusy(true)
    try {
      const r = await unvoidList(churchId)
      const problems = r.failed
      toast({
        title: `${r.restored} de ${r.total} lançamentos voltaram`,
        description:
          `${r.linked} movimentos do extrato religados` +
          (r.bills ? `, ${r.bills} contas pagas de novo` : '') +
          (problems.length ? `. Não voltaram: ${problems.join('; ')}` : '.'),
        variant: r.failed.length ? 'destructive' : undefined,
      })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      toast({
        title: 'Não deu certo',
        description:
          (err as { response?: { message?: string } })?.response?.message ||
          'Tente de novo em instantes.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="font-semibold">
        {items.length}{' '}
        {items.length === 1 ? 'lançamento foi estornado' : 'lançamentos foram estornados'} pela
        lista "O que falta conciliar"
      </div>
      <p className="mt-1 text-xs">
        Essa lista saiu do sistema. Desfazer volta os lançamentos e religa o extrato e as contas
        pagas que o estorno tinha desfeito.
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {items.map((t) => (
          <li key={t.id}>
            {shortDate(t.date, true)} · {t.description || t.type} · {formatCents(t.amount_cents)}
          </li>
        ))}
      </ul>
      <Button onClick={undo} disabled={busy} className="mt-3 h-9 gap-1.5 rounded-lg">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
        Desfazer estornos
      </Button>
    </div>
  )
}
