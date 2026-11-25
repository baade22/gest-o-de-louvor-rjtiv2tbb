// Mostra o texto formatado do site (negrito, alinhamento, listas...). Ver src/lib/richText.ts.

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  RICH_COLORS,
  parseInline,
  parseRich,
  type RichAlign,
  type RichBlock,
  type RichInline,
  type RichSize,
} from '@/lib/richText'
import { SmartLink } from './siteParts'

const ALIGN: Record<RichAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify hyphens-auto',
}
const SIZE: Record<RichSize, string> = {
  normal: '',
  large: 'text-[1.18em]',
  small: 'text-[0.86em]',
}

function Inline({ nodes }: { nodes: RichInline[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return n.v
      case 'br':
        return <br key={i} />
      case 'b':
        return (
          <strong key={i} className="font-extrabold">
            <Inline nodes={n.c} />
          </strong>
        )
      case 'i':
        return (
          <em key={i}>
            <Inline nodes={n.c} />
          </em>
        )
      case 'u':
        return (
          <u key={i} className="underline-offset-2">
            <Inline nodes={n.c} />
          </u>
        )
      case 's':
        return (
          <s key={i}>
            <Inline nodes={n.c} />
          </s>
        )
      case 'mark':
        return (
          <mark key={i} className="rounded bg-yellow-200/80 px-0.5 text-inherit">
            <Inline nodes={n.c} />
          </mark>
        )
      case 'a':
        return (
          <SmartLink key={i} href={n.href} className="font-bold underline underline-offset-2">
            <Inline nodes={n.c} />
          </SmartLink>
        )
      case 'color':
        return (
          <span key={i} style={{ color: RICH_COLORS[n.color] }}>
            <Inline nodes={n.c} />
          </span>
        )
      default:
        return null
    }
  })
}

function Block({ b }: { b: RichBlock }) {
  const cls = cn(ALIGN[b.align], SIZE[b.size])
  switch (b.kind) {
    case 'h':
      return (
        <h2 className={cn('pt-2 text-[20px] font-extrabold tracking-tight lg:text-2xl', cls)}>
          <Inline nodes={parseInline(b.text)} />
        </h2>
      )
    case 'h3':
      return (
        <h3 className={cn('pt-1 text-[17px] font-extrabold tracking-tight lg:text-xl', cls)}>
          <Inline nodes={parseInline(b.text)} />
        </h3>
      )
    case 'quote':
      return (
        <blockquote className={cn('border-l-4 border-[var(--c-ring,#cbd5e1)] pl-4 italic', cls)}>
          <Inline nodes={parseInline(b.text)} />
        </blockquote>
      )
    case 'ul':
    case 'ol': {
      const List = b.kind === 'ul' ? 'ul' : 'ol'
      return (
        <List
          start={b.kind === 'ol' ? b.start : undefined}
          className={cn(
            'space-y-1 pl-5',
            b.kind === 'ul' ? 'list-disc' : 'list-decimal',
            b.align === 'center' && 'list-inside pl-0',
            cls,
          )}
        >
          {b.items.map((it, j) => (
            <li key={j}>
              <Inline nodes={parseInline(it)} />
            </li>
          ))}
        </List>
      )
    }
    default:
      return (
        <p className={cls}>
          <Inline nodes={parseInline(b.text)} />
        </p>
      )
  }
}

/** Texto formatado. `className` vai no contêiner (cor, tamanho base e espaço entre parágrafos). */
export function RichText({
  text,
  className,
  defaultAlign,
}: {
  text: string
  className?: string
  /** Alinhamento dos parágrafos sem marca (padrão: esquerda). */
  defaultAlign?: RichAlign
}) {
  const blocks = parseRich(text, defaultAlign)
  if (!blocks.length) return null
  return (
    <div lang="pt-BR" className={cn('space-y-3', className)}>
      {blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </div>
  )
}
