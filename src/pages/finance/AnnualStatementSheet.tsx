// Folha do informe anual de contribuições de uma pessoa, pronta para imprimir ou salvar em PDF.
// Usada na aba Financeiro da ficha do membro e na tela de informes de todos os contribuintes.

import { formatCents } from '@/lib/money'
import { amountInWords, type AnnualStatement } from '@/lib/memberGiving'
import type { FinSettings, FinSigner } from '@/types/finance'
import { shortDate } from './shared'

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export const DEFAULT_STATEMENT_NOTE =
  'Doações a entidades religiosas não são dedutíveis do imposto de renda da pessoa física. ' +
  'Este informe comprova as doações feitas à igreja no ano.'

const digits = (s?: string) => (s || '').replace(/\D/g, '')

/** "12345678901" → "123.456.789-01"; outro formato fica como foi digitado. */
export function formatCpf(cpf?: string) {
  const d = digits(cpf)
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf || ''
}

export function formatCnpj(cnpj?: string) {
  const d = digits(cnpj)
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : cnpj || ''
}

/** "2026-10-25" → "25 de outubro de 2026" */
const longDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

export function AnnualStatementSheet({
  statement,
  person,
  churchName,
  settings,
  signers,
  issuedOn,
}: {
  statement: AnnualStatement
  person: { name: string; document?: string }
  churchName: string
  settings: FinSettings | null
  signers: FinSigner[]
  /** Data de emissão, YYYY-MM-DD. */
  issuedOn: string
}) {
  const church = settings?.legal_name || churchName
  const cnpj = formatCnpj(settings?.cnpj)
  const cpf = formatCpf(person.document)
  const note = settings?.statement_note?.trim() || DEFAULT_STATEMENT_NOTE
  const months = statement.byMonth.map((cents, i) => ({ label: MONTHS[i], cents }))

  return (
    <article className="mx-auto max-w-3xl break-after-page bg-white text-[13px] leading-relaxed text-slate-900 last:break-after-auto">
      <header className="border-b-2 border-slate-800 pb-3 text-center">
        <h2 className="text-base font-bold uppercase tracking-wide">{church}</h2>
        <p className="text-xs text-slate-600">
          {[cnpj && `CNPJ ${cnpj}`, settings?.address, settings?.city].filter(Boolean).join(' · ')}
        </p>
      </header>

      <div className="mt-5 text-center">
        <h3 className="text-lg font-bold">Informe anual de contribuições</h3>
        <p className="text-sm text-slate-600">Ano-calendário {statement.year}</p>
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-slate-200 px-4 py-3">
        <dt className="text-slate-500">Contribuinte</dt>
        <dd className="font-semibold">{person.name}</dd>
        <dt className="text-slate-500">CPF</dt>
        <dd>{cpf || 'Não informado'}</dd>
      </dl>

      <p className="mt-5 text-justify">
        Declaramos que <b>{person.name}</b>
        {cpf && <>, CPF {cpf},</>} fez à {church}
        {cnpj && <>, CNPJ {cnpj},</>} doações no ano-calendário de {statement.year} no total de{' '}
        <b>{formatCents(statement.total)}</b> ({amountInWords(statement.total)}), conforme os
        registros da tesouraria.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
        <table className="w-full self-start border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-slate-300 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 text-left font-semibold">Tipo</th>
              <th className="px-2 py-1.5 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {statement.byCategory.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-2 py-1.5">{r.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCents(r.cents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 font-bold">
              <td className="px-2 py-1.5">Total</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatCents(statement.total)}
              </td>
            </tr>
          </tfoot>
        </table>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-slate-300 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1 text-left font-semibold">Mês</th>
              <th className="px-2 py-1 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.label} className="border-b border-slate-100">
                <td className="px-2 py-1">{m.label}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {m.cents ? formatCents(m.cents) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-slate-600">{note}</p>

      <p className="mt-8">
        {settings?.city ? `${settings.city}, ` : ''}
        {longDate(issuedOn)}.
      </p>

      {signers.length > 0 && (
        <div className="mt-14 grid break-inside-avoid grid-cols-2 gap-x-10 gap-y-12">
          {signers.map((s) => (
            <div key={s.id} className="border-t border-slate-800 pt-1.5 text-center">
              <p className="text-sm font-medium">{s.name}</p>
              {s.title && <p className="text-xs text-slate-500">{s.title}</p>}
              {s.document && <p className="text-xs text-slate-500">CPF {formatCpf(s.document)}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="mt-10 text-right text-[10px] text-slate-400">
        Emitido em {shortDate(issuedOn, true)} pelo LouvorFlow
      </p>
    </article>
  )
}
