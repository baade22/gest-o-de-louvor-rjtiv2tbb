// Texto com formatação simples (negrito, itálico, lista, título e links) para a página do
// evento e as mensagens. Monta elementos React a partir de parseRichText, sem HTML cru.

import React, { useRef, useState } from 'react'
import { Bold, Eye, Heading2, Italic, List, Pencil } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { parseRichText, type RichSpan } from '@/lib/eventPage'

function Spans({ spans, linkColor }: { spans: RichSpan[]; linkColor?: string }) {
  return (
    <>
      {spans.map((s, i) => {
        let node: React.ReactNode = s.text
        if (s.href)
          node = (
            <a
              href={s.href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline break-all"
              style={linkColor ? { color: linkColor } : undefined}
            >
              {s.text}
            </a>
          )
        if (s.italic) node = <em>{node}</em>
        if (s.bold) node = <strong className="font-semibold text-slate-900">{node}</strong>
        return <React.Fragment key={i}>{node}</React.Fragment>
      })}
    </>
  )
}

export function RichTextView({
  text,
  className,
  linkColor,
}: {
  text: string
  className?: string
  linkColor?: string
}) {
  const blocks = parseRichText(text)
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-slate-700', className)}>
      {blocks.map((b, i) =>
        b.type === 'heading' ? (
          <h3 key={i} className="text-base font-bold text-slate-900">
            <Spans spans={b.spans} linkColor={linkColor} />
          </h3>
        ) : b.type === 'list' ? (
          <ul key={i} className="list-disc pl-5 space-y-0.5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Spans spans={item} linkColor={linkColor} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((line, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                <Spans spans={line} linkColor={linkColor} />
              </React.Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  )
}

const toolClass =
  'h-8 min-w-8 px-2 inline-flex items-center justify-center gap-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'

/**
 * Caixa de texto com barra de formatação. `fields` mostra botões que inserem {nome},
 * {evento}... onde está o cursor.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  maxLength,
  placeholder,
  fields,
  minHeight = 'min-h-32',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  maxLength?: number
  placeholder?: string
  fields?: Array<{ key: string; label: string }>
  minHeight?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  const edit = (fn: (sel: string) => { text: string; cursor?: number }, lineStart = false) => {
    const el = ref.current
    if (!el) return
    let start = el.selectionStart
    const end = el.selectionEnd
    if (lineStart) start = value.lastIndexOf('\n', start - 1) + 1
    const { text, cursor } = fn(value.slice(start, end))
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(maxLength ? next.slice(0, maxLength) : next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + (cursor ?? text.length)
      el.setSelectionRange(pos, pos)
    })
  }
  const wrap = (mark: string, sample: string) =>
    edit((sel) => ({
      text: `${mark}${sel || sample}${mark}`,
      cursor: sel ? undefined : mark.length + sample.length,
    }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-teal-600/30">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-1.5 py-1">
        <button
          type="button"
          className={toolClass}
          onClick={() => wrap('**', 'negrito')}
          aria-label="Negrito"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolClass}
          onClick={() => wrap('*', 'itálico')}
          aria-label="Itálico"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolClass}
          onClick={() => edit((sel) => ({ text: `## ${sel.replace(/^#{1,3}\s+/, '')}` }), true)}
          aria-label="Título"
        >
          <Heading2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolClass}
          onClick={() =>
            edit(
              (sel) => ({
                text: (sel || '')
                  .split('\n')
                  .map((l) => (l.startsWith('- ') ? l : `- ${l}`))
                  .join('\n'),
              }),
              true,
            )
          }
          aria-label="Lista"
        >
          <List className="h-4 w-4" />
        </button>
        {fields && <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />}
        {fields?.map((f) => (
          <button
            key={f.key}
            type="button"
            className={cn(toolClass, 'border border-slate-200 bg-slate-50 font-mono text-[11px]')}
            title={`Insere: ${f.label}`}
            onClick={() => edit(() => ({ text: `{${f.key}}` }))}
          >
            {`{${f.key}}`}
          </button>
        ))}
        <button
          type="button"
          className={cn(toolClass, 'ml-auto')}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? 'Editar' : 'Ver como fica'}
        </button>
      </div>
      {preview ? (
        <div className={cn('px-3 py-2.5', minHeight)}>
          {value.trim() ? (
            <RichTextView text={value} />
          ) : (
            <p className="text-sm text-slate-400">Nada escrito ainda.</p>
          )}
        </div>
      ) : (
        <Textarea
          id={id}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          className={cn(
            'border-0 rounded-t-none rounded-b-xl shadow-none focus-visible:ring-0',
            minHeight,
          )}
        />
      )}
    </div>
  )
}
