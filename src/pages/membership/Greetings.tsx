import React, { useCallback, useEffect, useState } from 'react'
import type { Church } from '@/types'
import type { Celebration, CelebrationKind } from '@/lib/membership'
import { GREETING_FIELDS, DEFAULT_GREETINGS, greetedToday, greetingTemplate, renderGreeting } from '@/lib/greetings'
import { waLink } from '@/lib/whatsapp'
import { getChurchForDocs } from '@/services/churchDocs'
import { listContactsOn, registerGreeting, saveGreetings } from '@/services/greetings'
import { Check, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from './shared'

const key = (c: Celebration) => `${c.person.id}-${c.kind}`

/** Igreja com os modelos de mensagem e quem já recebeu os parabéns hoje. */
export function useGreetings(churchId: string | undefined, todayYMD: string) {
  const [church, setChurch] = useState<Church | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!churchId) return
    getChurchForDocs(churchId)
      .then(setChurch)
      .catch(() => setChurch(null))
    listContactsOn(churchId, todayYMD)
      .then((events) => setSent(greetedToday(events, todayYMD)))
      .catch(() => setSent(new Set()))
  }, [churchId, todayYMD])

  const message = useCallback(
    (c: Celebration) => renderGreeting(greetingTemplate(c.kind, church), c, church?.name || ''),
    [church],
  )

  const markSent = useCallback(
    (c: Celebration) => {
      if (!churchId || sent.has(key(c))) return
      setSent((s) => new Set(s).add(key(c)))
      registerGreeting(churchId, c, todayYMD, message(c)).catch(() => {})
    },
    [churchId, todayYMD, sent, message],
  )

  return { church, setChurch, message, isSent: (c: Celebration) => sent.has(key(c)), markSent }
}

/** Abre o WhatsApp com a mensagem pronta e registra na linha do tempo da pessoa. */
export function GreetButton({
  c,
  message,
  sent,
  onSend,
  compact = false,
}: {
  c: Celebration
  message: string
  sent: boolean
  onSend: (c: Celebration) => void
  compact?: boolean
}) {
  const href = waLink(c.person.phone, message)
  if (!href) return null
  const label = sent ? 'Enviado' : 'Parabenizar'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onSend(c)}
      aria-label={`${sent ? 'Parabéns já enviado para' : 'Parabenizar'} ${c.person.name} pelo WhatsApp`}
      title={message}
      className="shrink-0"
    >
      {compact ? (
        <span
          className={`h-8 w-8 grid place-items-center rounded-lg ${
            sent ? 'text-slate-400 hover:bg-slate-50' : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {sent ? <Check className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className={`rounded-xl text-xs gap-1.5 ${sent ? 'text-slate-500 border-slate-200' : ''}`}
        >
          {sent ? (
            <Check className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
          )}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      )}
    </a>
  )
}

const KINDS: Array<{ kind: CelebrationKind; label: string; field: 'greeting_birthday' | 'greeting_wedding'; years: number }> = [
  { kind: 'NASCIMENTO', label: 'Aniversário', field: 'greeting_birthday', years: 36 },
  { kind: 'CASAMENTO', label: 'Aniversário de casamento', field: 'greeting_wedding', years: 12 },
]

export function GreetingSettingsDialog({
  open,
  onOpenChange,
  church,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  church: Church
  onSaved: (church: Church) => void
}) {
  const { toast } = useToast()
  const [texts, setTexts] = useState({ greeting_birthday: '', greeting_wedding: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTexts({
        greeting_birthday: greetingTemplate('NASCIMENTO', church),
        greeting_wedding: greetingTemplate('CASAMENTO', church),
      })
    }
  }, [open, church])

  const save = async () => {
    setSaving(true)
    try {
      // Igual ao padrão fica vazio, para acompanhar melhorias futuras do texto padrão
      const updated = await saveGreetings(church.id, {
        greeting_birthday: texts.greeting_birthday.trim() === DEFAULT_GREETINGS.NASCIMENTO ? '' : texts.greeting_birthday.trim(),
        greeting_wedding: texts.greeting_wedding.trim() === DEFAULT_GREETINGS.CASAMENTO ? '' : texts.greeting_wedding.trim(),
      })
      onSaved(updated)
      toast({ title: 'Mensagens salvas' })
      onOpenChange(false)
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: errorMessage(err, 'Tente novamente.'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mensagens de parabéns</DialogTitle>
          <DialogDescription>
            O texto já vai pronto no WhatsApp; dá para mudar antes de enviar. Toque num campo para incluir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {KINDS.map(({ kind, label, field, years }) => (
            <div key={kind} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor={`greet-${kind}`} className="text-xs font-semibold text-slate-700">
                  {label}
                </Label>
                <button
                  type="button"
                  className="ml-auto text-[11px] text-slate-500 underline"
                  onClick={() => setTexts((t) => ({ ...t, [field]: DEFAULT_GREETINGS[kind] }))}
                >
                  voltar ao padrão
                </button>
              </div>
              <Textarea
                id={`greet-${kind}`}
                value={texts[field]}
                maxLength={1000}
                onChange={(e) => setTexts((t) => ({ ...t, [field]: e.target.value }))}
                className="rounded-xl border-slate-200 min-h-20"
              />
              <div className="flex flex-wrap gap-1">
                {GREETING_FIELDS.map((f) => (
                  <button
                    key={f.token}
                    type="button"
                    title={f.label}
                    onClick={() => setTexts((t) => ({ ...t, [field]: `${t[field]} ${f.token}`.trim() }))}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-mono text-slate-600 hover:border-teal-300"
                  >
                    {f.token}
                  </button>
                ))}
              </div>
              <p className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-900 whitespace-pre-line">
                {renderGreeting(texts[field] || DEFAULT_GREETINGS[kind], { person: { name: 'Maria Souza' }, years }, church.name)}
              </p>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl bg-teal-700 hover:bg-teal-800" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
