/**
 * Relatórios prontos da membresia: cada um vira uma tabela (colunas + linhas
 * de texto) que a tela mostra, imprime e baixa em CSV.
 */
import type { Person, PersonEvent, PersonStatus } from '@/types'
import {
  MARITAL_STATUS_LABELS,
  MONTH_NAMES,
  PERSON_STATUS_LABELS,
  ageOn,
  celebrationsInMonth,
  filterPeople,
  missingEssentials,
} from '@/lib/membership'
import { formatCalendarDateDisplay, toCalendarYMD } from '@/lib/dateUtils'

export type ReportId =
  | 'membros'
  | 'contatos'
  | 'aniversariantes'
  | 'movimentacao'
  | 'incompletas'
  | 'visitantes'

export interface ReportTable {
  columns: string[]
  rows: string[][]
}

export interface ReportOptions {
  congregation: string
  statuses: PersonStatus[]
  month: number
  year: number
  todayYMD: string
}

export const REPORTS: Array<{ id: ReportId; label: string; hint: string }> = [
  {
    id: 'membros',
    label: 'Rol de membros',
    hint: 'Ficha resumida de cada pessoa, em ordem alfabética.',
  },
  {
    id: 'contatos',
    label: 'Lista de contatos',
    hint: 'Nome, telefone e e-mail, para listas de transmissão.',
  },
  {
    id: 'aniversariantes',
    label: 'Aniversariantes do mês',
    hint: 'Nascimento e casamento, dia a dia.',
  },
  {
    id: 'movimentacao',
    label: 'Entradas e saídas do ano',
    hint: 'Mudanças de situação registradas, com motivo.',
  },
  {
    id: 'visitantes',
    label: 'Visitantes do ano',
    hint: 'Quem foi cadastrado como visitante e a situação hoje.',
  },
  { id: 'incompletas', label: 'Fichas incompletas', hint: 'O que falta preencher em cada ficha.' },
]

const date = (d?: string) => (d ? formatCalendarDateDisplay(d, 'numeric') : '')

function scope(people: Person[], opts: ReportOptions): Person[] {
  return filterPeople(people, { congregation: opts.congregation }).filter((p) =>
    opts.statuses.includes(p.status),
  )
}

export function buildReport(
  id: ReportId,
  people: Person[],
  events: PersonEvent[],
  opts: ReportOptions,
): ReportTable {
  const list = scope(people, opts)
  const byId = new Map(people.map((p) => [p.id, p]))
  switch (id) {
    case 'membros':
      return {
        columns: [
          'Nome',
          'Situação',
          'Congregação',
          'Nº do rol',
          'Telefone',
          'E-mail',
          'Nascimento',
          'Idade',
          'Estado civil',
          'Batismo',
          'Membro desde',
          'Cargo',
          'Endereço',
        ],
        rows: list.map((p) => {
          const age = ageOn(p.birth_date, opts.todayYMD)
          const address = [p.address, p.neighborhood, p.city, p.state].filter(Boolean).join(', ')
          return [
            p.name,
            PERSON_STATUS_LABELS[p.status],
            p.congregation || '',
            p.roll_number || '',
            p.phone || '',
            p.email || '',
            date(p.birth_date),
            age === null ? '' : String(age),
            p.marital_status ? MARITAL_STATUS_LABELS[p.marital_status] : '',
            date(p.baptism_date),
            date(p.admission_date),
            p.church_office || '',
            address,
          ]
        }),
      }
    case 'contatos':
      return {
        columns: ['Nome', 'Telefone', 'E-mail', 'Situação', 'Congregação'],
        rows: list
          .filter((p) => p.phone || p.email)
          .map((p) => [
            p.name,
            p.phone || '',
            p.email || '',
            PERSON_STATUS_LABELS[p.status],
            p.congregation || '',
          ]),
      }
    case 'aniversariantes':
      return {
        columns: ['Dia', 'Nome', 'Tipo', 'Completa', 'Telefone', 'Congregação'],
        rows: celebrationsInMonth(list, opts.month, opts.year).map((c) => [
          String(c.day).padStart(2, '0'),
          c.person.name,
          c.kind === 'NASCIMENTO' ? 'Aniversário' : 'Casamento',
          c.years === null
            ? ''
            : `${c.years} ${c.kind === 'NASCIMENTO' ? 'anos' : c.years === 1 ? 'ano de casados' : 'anos de casados'}`,
          c.person.phone || '',
          c.person.congregation || '',
        ]),
      }
    case 'movimentacao': {
      // Filtra só por congregação: a mudança tira a pessoa da situação de antes
      const allowed = new Set(
        filterPeople(people, { congregation: opts.congregation }).map((p) => p.id),
      )
      return {
        columns: ['Data', 'Nome', 'De', 'Para', 'Motivo', 'Observação'],
        rows: events
          .filter(
            (e) => e.kind === 'SITUACAO' && toCalendarYMD(e.date).startsWith(String(opts.year)),
          )
          .filter(
            (e) =>
              allowed.has(e.person_id) || (!byId.has(e.person_id) && opts.congregation === 'TODAS'),
          )
          .sort((a, b) => toCalendarYMD(a.date).localeCompare(toCalendarYMD(b.date)))
          .map((e) => [
            date(e.date),
            byId.get(e.person_id)?.name || '(ficha apagada)',
            e.from_status ? PERSON_STATUS_LABELS[e.from_status] : '',
            e.to_status ? PERSON_STATUS_LABELS[e.to_status] : '',
            e.title,
            e.description || '',
          ]),
      }
    }
    case 'visitantes': {
      // Visitante no cadastro: quem hoje é visitante ou passou por "Visitante →" no histórico
      const wasVisitor = new Set(
        events
          .filter((e) => e.kind === 'SITUACAO' && e.from_status === 'VISITANTE')
          .map((e) => e.person_id),
      )
      return {
        columns: ['Cadastro', 'Nome', 'Situação hoje', 'Telefone', 'Congregação'],
        rows: filterPeople(people, { congregation: opts.congregation })
          .filter((p) => toCalendarYMD(p.created).startsWith(String(opts.year)))
          .filter((p) => p.status === 'VISITANTE' || wasVisitor.has(p.id))
          .sort((a, b) => a.created.localeCompare(b.created))
          .map((p) => [
            date(p.created),
            p.name,
            PERSON_STATUS_LABELS[p.status],
            p.phone || '',
            p.congregation || '',
          ]),
      }
    }
    case 'incompletas':
      return {
        columns: ['Nome', 'Situação', 'Falta', 'Telefone'],
        rows: list
          .map((p) => [p, missingEssentials(p)] as const)
          .filter(([, missing]) => missing.length > 0)
          .map(([p, missing]) => [
            p.name,
            PERSON_STATUS_LABELS[p.status],
            missing.join(', '),
            p.phone || '',
          ]),
      }
  }
}

export function reportTitle(id: ReportId, opts: ReportOptions): string {
  const base = REPORTS.find((r) => r.id === id)!.label
  if (id === 'aniversariantes')
    return `Aniversariantes de ${MONTH_NAMES[opts.month - 1].toLowerCase()} de ${opts.year}`
  if (id === 'movimentacao') return `Entradas e saídas de ${opts.year}`
  if (id === 'visitantes') return `Visitantes de ${opts.year}`
  return base
}

/**
 * CSV que o Excel em português abre direto: separador ";", BOM para os
 * acentos e aspas quando o texto tem separador, aspas ou quebra de linha.
 */
export function toCSV(table: ReportTable): string {
  const cell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [table.columns, ...table.rows].map((r) => r.map(cell).join(';'))
  return '﻿' + lines.join('\r\n')
}
