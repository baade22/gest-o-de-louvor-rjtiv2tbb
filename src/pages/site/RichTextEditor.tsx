// Campo de texto do painel do site com barra de formatação e prévia de como fica no site.

import { useRef, useState, type ReactNode } from 'react'
import {
  AArrowDown,
  AArrowUp,
  Bold,
  Eye,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  PencilLine,
  Strikethrough,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  TextQuote,
  Underline,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  RICH_COLORS,
  formatAt,
  setBlockFormat,
  setLineKind,
  toggleWrap,
  type Edit,
  type RichAlign,
  type RichColor,
} from '@/lib/richText'
import { safeLink } from '@/lib/site'
import { RichText } from './RichText'

const COLOR_NAMES: Record<RichColor, string> = {
  azul: 'Azul',
  cinza: 'Cinza',
  vermelho: 'Vermelho',
  verde: 'Verde',
  dourado: 'Dourado',
}

function Tool({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // mantém a seleção do texto ao clicar no botão
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40',
        active && 'bg-teal-50 text-teal-800 ring-1 ring-teal-200',
      )}
    >
      {children}
    </button>
  )
}

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />

export function RichTextEditor({
  value,
  onChange,
  rows = 5,
  maxLength,
  placeholder,
  disabled,
  compact,
  defaultAlign = 'left',
  previewClassName,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  maxLength?: number
  placeholder?: string
  disabled?: boolean
  /** Sem títulos e listas (para textos curtos). */
  compact?: boolean
  /** Alinhamento dos parágrafos sem marca (documentos usam justificado). */
  defaultAlign?: RichAlign
  /** Classes da prévia (cor, tamanho e fonte do lugar onde o texto sai). */
  previewClassName?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)
  const [panel, setPanel] = useState<'' | 'link' | 'color'>('')
  const [link, setLink] = useState('')
  const [cursor, setCursor] = useState(0)
  const cur = formatAt(value, cursor, defaultAlign)

  const apply = (fn: (v: string, s: number, e: number) => Edit) => {
    const el = ref.current
    const s = el ? el.selectionStart : value.length
    const e = el ? el.selectionEnd : value.length
    const r = fn(value, s, e)
    if (maxLength && r.value.length > maxLength) return
    onChange(r.value)
    setCursor(r.start)
    requestAnimationFrame(() => {
      const t = ref.current
      if (!t) return
      t.focus()
      t.setSelectionRange(r.start, r.end)
    })
  }
  const wrap = (open: string, close = open) => apply((v, s, e) => toggleWrap(v, s, e, open, close))
  const align = (a: RichAlign) =>
    apply((v, s, e) => setBlockFormat(v, s, e, { align: a }, defaultAlign))
  const size = (dir: 1 | -1) =>
    apply((v, s, e) => {
      const now = formatAt(v, s, defaultAlign).size
      const next =
        dir === 1 ? (now === 'small' ? 'normal' : 'large') : now === 'large' ? 'normal' : 'small'
      return setBlockFormat(v, s, e, { size: next }, defaultAlign)
    })
  const addLink = () => {
    const href = safeLink(link)
    if (!href) return
    apply((v, s, e) => {
      const label = v.slice(s, e).trim() || 'clique aqui'
      const ins = `[${label}](${href})`
      return { value: v.slice(0, s) + ins + v.slice(e), start: s + ins.length, end: s + ins.length }
    })
    setLink('')
    setPanel('')
  }
  const length = value.length

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-input bg-background',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-slate-50/80 px-1.5 py-1">
        <Tool label="Negrito" onClick={() => wrap('**')} disabled={disabled || preview}>
          <Bold className="h-4 w-4" />
        </Tool>
        <Tool label="Itálico" onClick={() => wrap('*')} disabled={disabled || preview}>
          <Italic className="h-4 w-4" />
        </Tool>
        <Tool label="Sublinhado" onClick={() => wrap('__')} disabled={disabled || preview}>
          <Underline className="h-4 w-4" />
        </Tool>
        <Tool label="Riscado" onClick={() => wrap('~~')} disabled={disabled || preview}>
          <Strikethrough className="h-4 w-4" />
        </Tool>
        <Tool label="Marca-texto" onClick={() => wrap('==')} disabled={disabled || preview}>
          <Highlighter className="h-4 w-4" />
        </Tool>
        <Tool
          label="Cor do texto"
          active={panel === 'color'}
          onClick={() => setPanel(panel === 'color' ? '' : 'color')}
          disabled={disabled || preview}
        >
          <Palette className="h-4 w-4" />
        </Tool>
        <Tool
          label="Link"
          active={panel === 'link'}
          onClick={() => setPanel(panel === 'link' ? '' : 'link')}
          disabled={disabled || preview}
        >
          <Link2 className="h-4 w-4" />
        </Tool>
        <Sep />
        <Tool
          label="Alinhar à esquerda"
          active={cur.align === 'left'}
          onClick={() => align('left')}
          disabled={disabled || preview}
        >
          <TextAlignStart className="h-4 w-4" />
        </Tool>
        <Tool
          label="Centralizar"
          active={cur.align === 'center'}
          onClick={() => align('center')}
          disabled={disabled || preview}
        >
          <TextAlignCenter className="h-4 w-4" />
        </Tool>
        <Tool
          label="Alinhar à direita"
          active={cur.align === 'right'}
          onClick={() => align('right')}
          disabled={disabled || preview}
        >
          <TextAlignEnd className="h-4 w-4" />
        </Tool>
        <Tool
          label="Justificar"
          active={cur.align === 'justify'}
          onClick={() => align('justify')}
          disabled={disabled || preview}
        >
          <TextAlignJustify className="h-4 w-4" />
        </Tool>
        <Sep />
        <Tool
          label="Letra maior"
          active={cur.size === 'large'}
          onClick={() => size(1)}
          disabled={disabled || preview}
        >
          <AArrowUp className="h-4 w-4" />
        </Tool>
        <Tool
          label="Letra menor"
          active={cur.size === 'small'}
          onClick={() => size(-1)}
          disabled={disabled || preview}
        >
          <AArrowDown className="h-4 w-4" />
        </Tool>
        {!compact && (
          <>
            <Sep />
            <Tool
              label="Título"
              onClick={() => apply((v, s, e) => setLineKind(v, s, e, 'h'))}
              disabled={disabled || preview}
            >
              <Heading1 className="h-4 w-4" />
            </Tool>
            <Tool
              label="Subtítulo"
              onClick={() => apply((v, s, e) => setLineKind(v, s, e, 'h3'))}
              disabled={disabled || preview}
            >
              <Heading2 className="h-4 w-4" />
            </Tool>
            <Tool
              label="Lista"
              onClick={() => apply((v, s, e) => setLineKind(v, s, e, 'ul'))}
              disabled={disabled || preview}
            >
              <List className="h-4 w-4" />
            </Tool>
            <Tool
              label="Lista numerada"
              onClick={() => apply((v, s, e) => setLineKind(v, s, e, 'ol'))}
              disabled={disabled || preview}
            >
              <ListOrdered className="h-4 w-4" />
            </Tool>
            <Tool
              label="Citação"
              onClick={() => apply((v, s, e) => setLineKind(v, s, e, 'quote'))}
              disabled={disabled || preview}
            >
              <TextQuote className="h-4 w-4" />
            </Tool>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setPreview(!preview)
            setPanel('')
          }}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-50"
        >
          {preview ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? 'Escrever' : 'Ver como fica'}
        </button>
      </div>

      {panel === 'color' && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
          <span className="text-slate-500">Selecione o texto e escolha a cor:</span>
          {(Object.keys(RICH_COLORS) as RichColor[]).map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                wrap(`{${c}}`, '{/}')
                setPanel('')
              }}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold hover:bg-slate-50"
              style={{ color: RICH_COLORS[c] }}
            >
              <span className="h-3 w-3 rounded-full" style={{ background: RICH_COLORS[c] }} />
              {COLOR_NAMES[c]}
            </button>
          ))}
        </div>
      )}
      {panel === 'link' && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addLink()
              }
            }}
            placeholder="https://... ou /igreja/agenda"
            className="h-8 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={addLink}
            disabled={!safeLink(link)}
            className="h-8 shrink-0 rounded-md bg-teal-700 px-3 text-xs font-semibold text-white disabled:opacity-40"
          >
            Pôr link
          </button>
        </div>
      )}

      {preview ? (
        <div className="site-c min-h-[80px] bg-[#f1f3f6] p-3">
          <div
            className={cn(
              'rounded-2xl bg-white p-4 text-[15px] font-medium leading-relaxed text-[#2e3a4e]',
              previewClassName,
            )}
          >
            {value.trim() ? (
              <RichText text={value} defaultAlign={defaultAlign} />
            ) : (
              <p className="text-slate-400">Nada escrito ainda.</p>
            )}
          </div>
        </div>
      ) : (
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setCursor(e.target.selectionStart)
          }}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          className="rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      )}
      <div className="flex justify-between gap-2 border-t bg-slate-50/60 px-3 py-1 text-[11px] text-slate-500">
        <span>Sem selecionar nada, o alinhamento e o tamanho valem para o texto todo.</span>
        {maxLength ? (
          <span
            className={cn('shrink-0', length > maxLength * 0.9 && 'font-semibold text-amber-700')}
          >
            {length}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  )
}
