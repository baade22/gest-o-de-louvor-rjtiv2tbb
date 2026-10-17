import React, { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  /** Botão vermelho para ações que apagam algo. */
  destructive?: boolean
  onConfirm: () => Promise<unknown> | unknown
  /** Conteúdo extra abaixo da descrição (ex.: lista de consequências). */
  children?: React.ReactNode
}

/**
 * Confirmação padrão do app, no lugar do window.confirm do navegador.
 * Mantém o diálogo aberto com o botão girando até a ação terminar.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Não deu certo',
        description: err?.message || 'Tente de novo em instantes.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent className="rounded-xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold text-slate-900">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-sm text-slate-600">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={busy} className="rounded-lg">
            Cancelar
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className={
              destructive
                ? 'rounded-lg bg-red-600 text-white hover:bg-red-700'
                : 'rounded-lg bg-teal-700 text-white hover:bg-teal-800'
            }
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'children'>

/**
 * Atalho para trocar `if (!window.confirm(...)) return` pelo diálogo do app:
 * `confirm({ title, onConfirm })` abre o diálogo e `dialog` vai no JSX.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false)
  // Mantém o último conteúdo durante a animação de fechar
  const [options, setOptions] = useState<ConfirmOptions | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next)
    setOpen(true)
  }, [])

  const dialog = options ? <ConfirmDialog {...options} open={open} onOpenChange={setOpen} /> : null

  return { confirm, dialog }
}
