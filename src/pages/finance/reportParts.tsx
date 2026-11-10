// Peças das folhas de relatório do Financeiro, no estilo dos PDFs do Eklesia:
// cabeçalho com a igreja e o nome do relatório, tabelas compactas com cabeçalho cinza,
// faixas de total e a linha "Parâmetros aplicados" no fim.

import { cn } from '@/lib/utils'
import type { TreeLine } from '@/lib/treeReports'

export const pct = (value: number) => `${Math.round(value)}%`

const th = 'border-b-2 border-black bg-slate-200 px-1.5 py-1 font-bold uppercase'
const td = 'px-1.5 py-[3px]'
const right = 'text-right tabular-nums whitespace-nowrap'
/** Cabeçalho cinza das tabelas. */
export const headClass = th
export const cellClass = td
export const numClass = right
/** Faixa de total (cinza, em negrito). */
export const totalRowClass = 'border-t border-black bg-slate-100 font-bold'

/** Data e hora de agora, no horário de Brasília. */
function nowBr() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
  const [date, time] = parts.split(/,?\s+/)
  return { date, time }
}

export function SheetHeader({
  church,
  title,
  logoUrl,
}: {
  church: string
  title: string
  logoUrl?: string
}) {
  const { date, time } = nowBr()
  return (
    <header className="mb-3 flex items-center gap-3 border-b-[3px] border-black pb-2">
      {logoUrl && <img src={logoUrl} alt="" className="h-12 w-12 shrink-0 object-contain" />}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold uppercase leading-tight">{church}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      </div>
      <div className="shrink-0 text-right text-[10px] leading-tight text-slate-700">
        <p>Data: {date}</p>
        <p>Hora: {time}</p>
      </div>
    </header>
  )
}

/** Título de bloco: "SALDO INICIAL DAS CONTAS", "MOVIMENTAÇÃO DO PERÍODO"... */
export function Band({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-4 border-b border-black pb-0.5 text-[11px] font-bold uppercase first:mt-0">
      {children}
    </p>
  )
}

export function Params({ items }: { items: (string | false | null | undefined)[] }) {
  const list = items.filter(Boolean)
  if (!list.length) return null
  return (
    <p className="mt-4 break-inside-avoid border-t border-dashed border-slate-500 pt-1.5 text-[10px] text-slate-700">
      <strong>PARÂMETROS APLICADOS:</strong> {list.join(' • ')}
    </p>
  )
}

export function RecordCount({ count }: { count: number }) {
  return <p className="mt-1 text-[10px] font-semibold">Total de Registros: {count}</p>
}

export function Table({
  head,
  rows,
  foot,
  align,
  count,
}: {
  head: string[]
  rows: (string | number)[][]
  foot?: (string | number)[]
  /** 'r' alinha a coluna à direita. */
  align?: ('l' | 'r')[]
  /** Mostra "Total de Registros: N" embaixo. */
  count?: number
}) {
  const cls = (i: number) => (align?.[i] === 'r' ? right : 'text-left')
  return (
    <>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn(th, cls(i))}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-2 py-3 text-center text-slate-500">
                Nada no período.
              </td>
            </tr>
          )}
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-slate-200">
              {r.map((v, i) => (
                <td key={i} className={cn(td, cls(i))}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className={totalRowClass}>
              {foot.map((v, i) => (
                <td key={i} className={cn('px-1.5 py-1', cls(i))}>
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {count !== undefined && <RecordCount count={count} />}
    </>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 break-inside-avoid first:mt-0">
      <Band>{title}</Band>
      {children}
    </div>
  )
}

export function Totals({ items }: { items: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <table className="mb-3 w-full border-collapse text-[11px]">
      <thead>
        <tr>
          {items.map((t) => (
            <th key={t.label} className={cn(th, right)}>
              {t.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-slate-300">
          {items.map((t) => (
            <td key={t.label} className={cn(td, right, t.strong && 'font-bold')}>
              {t.value}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

/** Nome da linha da árvore: "NOME - (código)". Primeiro nível em maiúsculas. */
export function treeName(line: Pick<TreeLine, 'name' | 'code' | 'depth'>) {
  const name = line.depth === 0 ? line.name.toUpperCase() : line.name
  return line.code ? `${name} - (${line.code})` : name
}

/** Recuo de cada nível da árvore. */
export const indent = (depth: number) => ({ paddingLeft: `${6 + depth * 14}px` })

const NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Valor sem "R$", como nas colunas dos relatórios do Eklesia: 1.234,56 e -1.234,56. */
export const num = (cents: number) => NUM.format((cents || 0) / 100)
