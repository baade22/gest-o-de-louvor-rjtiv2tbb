import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Calculator,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FileUser,
  HandCoins,
  Landmark,
  Loader2,
  Printer,
  ReceiptText,
  Scale,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { shiftMonth } from '@/lib/financeSummary'
import { brtDay } from '@/lib/bankStatement'
import {
  accountMovements,
  accountingExport,
  availabilityReport,
  billsReport,
  categoryLedger,
  centsToText,
  contributionsReport,
  dreReport,
  toCsv,
  type AccountingOptions,
  type ReportRow,
} from '@/lib/financeReports'
import {
  listAccounts,
  listApprovedCounts,
  listBills,
  listCategories,
  listPeople,
  listReportTransactions,
  listSigners,
} from '@/services/finance'
import type {
  FinAccount,
  FinBill,
  FinCategory,
  FinCount,
  FinSigner,
  FinTransaction,
  Person,
} from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PageHeader,
  cardClass,
  errorMessage,
  monthLabel,
  primaryButtonClass,
  shortDate,
  useFinanceAccess,
} from './shared'
import { download, printSheet } from './print'

type ReportKey = 'dre' | 'contributions' | 'counts' | 'trial' | 'ledger' | 'availability' | 'bills'

const REPORTS: { key: ReportKey; title: string; hint: string; icon: typeof FileText }[] = [
  { key: 'dre', title: 'DRE (resultado)', hint: 'Entradas e saídas por categoria', icon: Landmark },
  {
    key: 'contributions',
    title: 'Contribuições',
    hint: 'Por pessoa, categoria e forma',
    icon: HandCoins,
  },
  { key: 'counts', title: 'Fechamento do culto', hint: 'Contagens aprovadas', icon: Calculator },
  { key: 'trial', title: 'Balancete', hint: 'Movimento de cada conta', icon: Scale },
  {
    key: 'ledger',
    title: 'Razão por categoria',
    hint: 'Todos os lançamentos de uma categoria',
    icon: BookOpen,
  },
  {
    key: 'availability',
    title: 'Disponibilidades',
    hint: 'Saldo de cada conta numa data',
    icon: Wallet,
  },
  {
    key: 'bills',
    title: 'Contas pagas e recebidas',
    hint: 'Baixas do período e o que ficou aberto',
    icon: ReceiptText,
  },
]

const ALL = '__all__'
const today = () => brtDay(new Date().toISOString())

function monthBounds(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

function periodLabel(from: string, to: string) {
  const ym = from.slice(0, 7)
  const b = monthBounds(ym)
  if (b.from === from && b.to === to) return monthLabel(ym)
  if (from.slice(5) === '01-01' && to.slice(5) === '12-31' && from.slice(0, 4) === to.slice(0, 4))
    return `Ano de ${from.slice(0, 4)}`
  return `${shortDate(from, true)} a ${shortDate(to, true)}`
}

const pct = (value: number) => `${Math.round(value)}%`

// ---- Peças da folha ----

function Table({
  head,
  rows,
  foot,
  align,
}: {
  head: string[]
  rows: (string | number)[][]
  foot?: (string | number)[]
  /** 'r' alinha a coluna à direita. */
  align?: ('l' | 'r')[]
}) {
  const cls = (i: number) => (align?.[i] === 'r' ? 'text-right tabular-nums' : 'text-left')
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-slate-300 text-[11px] uppercase tracking-wide text-slate-500">
          {head.map((h, i) => (
            <th key={i} className={cn('px-2 py-1.5 font-semibold', cls(i))}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={head.length} className="px-2 py-4 text-center text-slate-400">
              Nada no período.
            </td>
          </tr>
        )}
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-slate-100">
            {r.map((v, i) => (
              <td key={i} className={cn('px-2 py-1.5 text-slate-700', cls(i))}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="border-t-2 border-slate-800 font-bold text-slate-900">
            {foot.map((v, i) => (
              <td key={i} className={cn('px-2 py-2', cls(i))}>
                {v}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

function GroupRows({ title, rows, total }: { title: string; rows: ReportRow[]; total: number }) {
  return (
    <>
      <tr className="bg-slate-50 font-semibold text-slate-900">
        <td className="px-2 py-2">{title}</td>
        <td className="px-2 py-2 text-right tabular-nums">{formatCents(total)}</td>
        <td className="px-2 py-2 text-right text-slate-400">{total ? '100%' : ''}</td>
      </tr>
      {rows.length === 0 && (
        <tr>
          <td colSpan={3} className="px-6 py-2 text-slate-400">
            Nada no período.
          </td>
        </tr>
      )}
      {rows.map((r) => (
        <tr key={r.key} className="border-b border-slate-100">
          <td className="px-2 py-1.5 pl-6 text-slate-700">{r.label}</td>
          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
            {formatCents(r.cents)}
          </td>
          <td className="px-2 py-1.5 text-right text-slate-400">{pct(r.pct)}</td>
        </tr>
      ))}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid first:mt-0">
      <h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>
      {children}
    </div>
  )
}

function Totals({ items }: { items: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{t.label}</p>
          <p
            className={cn('tabular-nums text-slate-900', t.strong ? 'font-bold' : 'font-semibold')}
          >
            {t.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ---- Página ----

interface Built {
  title: string
  body: React.ReactNode
  csv: (string | number)[][]
}

export default function FinanceReports() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id
  const { canView } = useFinanceAccess('relatorios')
  const { toast } = useToast()
  const sheetRef = useRef<HTMLDivElement>(null)

  const previous = monthBounds(shiftMonth(today().slice(0, 7), -1))
  const [report, setReport] = useState<ReportKey>('dre')
  const [from, setFrom] = useState(previous.from)
  const [to, setTo] = useState(previous.to)
  const [congregation, setCongregation] = useState(ALL)
  const [categoryId, setCategoryId] = useState('')
  const [chosenSigners, setChosenSigners] = useState<string[] | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [signers, setSigners] = useState<FinSigner[]>([])
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [counts, setCounts] = useState<FinCount[]>([])
  const [bills, setBills] = useState<FinBill[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(true)

  const validPeriod =
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to

  useEffect(() => {
    if (!churchId) return
    setLoading(true)
    Promise.all([
      listAccounts(churchId),
      listCategories(churchId),
      listPeople(churchId),
      listSigners(churchId),
      listBills(churchId),
    ])
      .then(([acc, cat, ppl, sig, bl]) => {
        setAccounts(acc)
        setCategories(cat)
        setPeople(ppl)
        setSigners(sig)
        setBills(bl)
      })
      .catch((err) =>
        toast({
          title: 'Não foi possível carregar os cadastros',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        }),
      )
      .finally(() => setLoading(false))
  }, [churchId, toast])

  useEffect(() => {
    if (!churchId || !validPeriod) return
    let alive = true
    setLoadingData(true)
    Promise.all([listReportTransactions(churchId, to), listApprovedCounts(churchId, from, to)])
      .then(([t, c]) => {
        if (!alive) return
        setTxs(t)
        setCounts(c)
      })
      .catch((err) =>
        toast({
          title: 'Não foi possível carregar os lançamentos',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        }),
      )
      .finally(() => alive && setLoadingData(false))
    return () => {
      alive = false
    }
  }, [churchId, from, to, validPeriod, toast])

  const congregations = useMemo(
    () => [...new Set(accounts.map((a) => a.congregation || '').filter(Boolean))].sort(),
    [accounts],
  )
  const scopedAccounts = useMemo(
    () =>
      congregation === ALL
        ? accounts
        : accounts.filter((a) => (a.congregation || '') === congregation),
    [accounts, congregation],
  )
  const accountSet = useMemo(
    () => (congregation === ALL ? null : new Set(scopedAccounts.map((a) => a.id))),
    [congregation, scopedAccounts],
  )
  const activeSigners = signers.filter((s) => s.is_active !== false)
  const signerIds = chosenSigners ?? activeSigners.map((s) => s.id)
  const shownSigners = signers.filter((s) => signerIds.includes(s.id))

  const scopeLabel = congregation === ALL ? 'Todas as congregações' : congregation
  const period = periodLabel(from, to)

  const built = useMemo<Built>(() => {
    const money = formatCents
    switch (report) {
      case 'dre': {
        const r = dreReport(txs, categories, from, to, accountSet)
        return {
          title: 'Demonstração do Resultado',
          csv: [
            ['Grupo', 'Categoria', 'Valor', '%'],
            ...r.income.map((x) => ['Entradas', x.label, centsToText(x.cents), pct(x.pct)]),
            ...r.expense.map((x) => ['Saídas', x.label, centsToText(x.cents), pct(x.pct)]),
            ['Total', 'Entradas', centsToText(r.totalIncome), ''],
            ['Total', 'Saídas', centsToText(r.totalExpense), ''],
            ['Resultado', '', centsToText(r.result), ''],
          ],
          body: (
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                <GroupRows title="Entradas" rows={r.income} total={r.totalIncome} />
                <GroupRows title="Saídas" rows={r.expense} total={r.totalExpense} />
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800 font-bold text-slate-900">
                  <td className="px-2 py-2">Resultado do período</td>
                  <td
                    className={cn(
                      'px-2 py-2 text-right tabular-nums',
                      r.result < 0 && 'text-red-600',
                    )}
                  >
                    {money(r.result)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          ),
        }
      }
      case 'contributions': {
        const r = contributionsReport(txs, categories, people, from, to, accountSet)
        const rows = (list: ReportRow[]) =>
          list.map((x) => [x.label, x.count, money(x.cents), pct(x.pct)])
        return {
          title: 'Relatório de Contribuições',
          csv: [
            ['Seção', 'Nome', 'Lançamentos', 'Valor'],
            ...r.byCategory.map((x) => ['Categoria', x.label, x.count, centsToText(x.cents)]),
            ...r.byMethod.map((x) => ['Forma', x.label, x.count, centsToText(x.cents)]),
            ...r.byPerson.map((x) => ['Pessoa', x.label, x.count, centsToText(x.cents)]),
            ['Anônimas', '', '', centsToText(r.anonymous)],
            ['Total', '', '', centsToText(r.total)],
          ],
          body: (
            <>
              <Totals
                items={[
                  { label: 'Total', value: money(r.total), strong: true },
                  { label: 'Com nome', value: money(r.nominal) },
                  { label: 'Anônimas', value: money(r.anonymous) },
                  { label: 'Contribuintes', value: String(r.contributors) },
                ]}
              />
              <Section title="Por categoria">
                <Table
                  head={['Categoria', 'Lanç.', 'Valor', '%']}
                  align={['l', 'r', 'r', 'r']}
                  rows={rows(r.byCategory)}
                />
              </Section>
              <Section title="Por forma de pagamento">
                <Table
                  head={['Forma', 'Lanç.', 'Valor', '%']}
                  align={['l', 'r', 'r', 'r']}
                  rows={rows(r.byMethod)}
                />
              </Section>
              <Section title="Por pessoa">
                <Table
                  head={['Pessoa', 'Lanç.', 'Valor', '%']}
                  align={['l', 'r', 'r', 'r']}
                  rows={rows(r.byPerson)}
                  foot={
                    r.anonymous ? ['Anônimas (sem nome)', '', money(r.anonymous), ''] : undefined
                  }
                />
              </Section>
            </>
          ),
        }
      }
      case 'counts': {
        const list = counts.filter((c) => !accountSet || accountSet.has(c.account_id))
        const envelopes = (c: FinCount) =>
          (c.envelopes || []).reduce((s, e) => s + (e.amount_cents || 0), 0)
        const rows = list
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((c) => [
            shortDate(c.date, true),
            c.expand?.event_id?.title || '—',
            c.expand?.account_id?.name || accounts.find((a) => a.id === c.account_id)?.name || '',
            c.cash_cents,
            envelopes(c),
            c.cash_cents + envelopes(c),
            [c.counted_by_name, c.approved_by_name].filter(Boolean).join(' / '),
          ])
        const sum = (i: number) => rows.reduce((s, r) => s + (r[i] as number), 0)
        return {
          title: 'Fechamento dos Cultos',
          csv: [
            ['Data', 'Culto', 'Conta', 'Ofertas soltas', 'Envelopes', 'Total', 'Contou / aprovou'],
            ...rows.map((r) => r.map((v, i) => (i >= 3 && i <= 5 ? centsToText(v as number) : v))),
          ],
          body: (
            <Table
              head={[
                'Data',
                'Culto',
                'Conta',
                'Ofertas soltas',
                'Envelopes',
                'Total',
                'Contou / aprovou',
              ]}
              align={['l', 'l', 'l', 'r', 'r', 'r', 'l']}
              rows={rows.map((r) => r.map((v, i) => (i >= 3 && i <= 5 ? money(v as number) : v)))}
              foot={
                rows.length
                  ? [
                      rows.length === 1 ? '1 contagem' : `${rows.length} contagens`,
                      '',
                      '',
                      money(sum(3)),
                      money(sum(4)),
                      money(sum(5)),
                      '',
                    ]
                  : undefined
              }
            />
          ),
        }
      }
      case 'trial': {
        const list = accountMovements(scopedAccounts, txs, from, to).filter(
          (m) => m.opening || m.income || m.expense || m.transfersIn || m.transfersOut || m.closing,
        )
        const sum = (f: (m: (typeof list)[number]) => number) => list.reduce((s, m) => s + f(m), 0)
        const net = (m: (typeof list)[number]) => m.transfersIn - m.transfersOut
        return {
          title: 'Balancete',
          csv: [
            [
              'Conta',
              'Congregação',
              'Saldo inicial',
              'Entradas',
              'Saídas',
              'Transferências',
              'Saldo final',
            ],
            ...list.map((m) => [
              m.name,
              m.congregation || '',
              centsToText(m.opening),
              centsToText(m.income),
              centsToText(m.expense),
              centsToText(net(m)),
              centsToText(m.closing),
            ]),
          ],
          body: (
            <Table
              head={['Conta', 'Saldo inicial', 'Entradas', 'Saídas', 'Transf.', 'Saldo final']}
              align={['l', 'r', 'r', 'r', 'r', 'r']}
              rows={list.map((m) => [
                m.congregation ? `${m.name} (${m.congregation})` : m.name,
                money(m.opening),
                money(m.income),
                money(m.expense),
                money(net(m)),
                money(m.closing),
              ])}
              foot={[
                'Total',
                money(sum((m) => m.opening)),
                money(sum((m) => m.income)),
                money(sum((m) => m.expense)),
                money(sum(net)),
                money(sum((m) => m.closing)),
              ]}
            />
          ),
        }
      }
      case 'ledger': {
        const category = categories.find((c) => c.id === categoryId)
        if (!category)
          return {
            title: 'Razão por categoria',
            csv: [],
            body: <p className="py-8 text-center text-slate-400">Escolha a categoria acima.</p>,
          }
        const r = categoryLedger(txs, category.id, from, to, accountSet)
        return {
          title: `Razão: ${category.name}`,
          csv: [
            ['Data', 'Histórico', 'Valor', 'Acumulado'],
            ...r.rows.map((x) => [
              shortDate(x.date, true),
              x.description,
              centsToText(x.cents),
              centsToText(x.running),
            ]),
          ],
          body: (
            <Table
              head={['Data', 'Histórico', 'Valor', 'Acumulado']}
              align={['l', 'l', 'r', 'r']}
              rows={r.rows.map((x) => [
                shortDate(x.date, true),
                x.description || '—',
                money(x.cents),
                money(x.running),
              ])}
              foot={[
                r.rows.length === 1 ? '1 lançamento' : `${r.rows.length} lançamentos`,
                '',
                money(r.total),
                '',
              ]}
            />
          ),
        }
      }
      case 'availability': {
        const r = availabilityReport(scopedAccounts, txs, to)
        return {
          title: `Disponibilidades em ${shortDate(to, true)}`,
          csv: [
            ['Congregação', 'Conta', 'Saldo'],
            ...r.groups.flatMap((g) => g.items.map((i) => [g.label, i.name, centsToText(i.cents)])),
            ['Total', '', centsToText(r.total)],
          ],
          body: (
            <>
              {r.groups.map((g) => (
                <Section key={g.label} title={g.label}>
                  <Table
                    head={['Conta', 'Saldo']}
                    align={['l', 'r']}
                    rows={g.items.map((i) => [i.name, money(i.cents)])}
                    foot={r.groups.length > 1 ? ['Subtotal', money(g.total)] : undefined}
                  />
                </Section>
              ))}
              <div className="mt-4 flex justify-between border-t-2 border-slate-800 px-2 pt-2 text-[13px] font-bold">
                <span>Total disponível</span>
                <span className="tabular-nums">{money(r.total)}</span>
              </div>
            </>
          ),
        }
      }
      case 'bills': {
        const scoped = accountSet
          ? bills.filter(
              (b) =>
                (b.paid_account_id && accountSet.has(b.paid_account_id)) ||
                (b.account_id && accountSet.has(b.account_id)),
            )
          : bills
        const r = billsReport(scoped, from, to)
        const who = (b: FinBill) => b.expand?.supplier_id?.name || b.expand?.person_id?.name || ''
        const kind = (b: FinBill) => (b.kind === 'PAGAR' ? 'Pagar' : 'Receber')
        return {
          title: 'Contas Pagas e Recebidas',
          csv: [
            ['Situação', 'Tipo', 'Data', 'Descrição', 'Fornecedor/pessoa', 'Valor'],
            ...r.paid.map((b) => [
              'Baixada',
              kind(b),
              shortDate(b.paid_at!, true),
              b.description,
              who(b),
              centsToText(b.paid_amount_cents || b.amount_cents),
            ]),
            ...r.open.map((b) => [
              'Em aberto',
              kind(b),
              shortDate(b.due_date, true),
              b.description,
              who(b),
              centsToText(b.amount_cents),
            ]),
          ],
          body: (
            <>
              <Totals
                items={[
                  { label: 'Pagas', value: money(r.paidOut), strong: true },
                  { label: 'Recebidas', value: money(r.paidIn), strong: true },
                  { label: 'A pagar em aberto', value: money(r.openOut) },
                  { label: 'A receber em aberto', value: money(r.openIn) },
                ]}
              />
              <Section title="Baixadas no período">
                <Table
                  head={['Pago em', 'Tipo', 'Descrição', 'Fornecedor/pessoa', 'Valor']}
                  align={['l', 'l', 'l', 'l', 'r']}
                  rows={r.paid.map((b) => [
                    shortDate(b.paid_at!, true),
                    kind(b),
                    b.description,
                    who(b) || '—',
                    money(b.paid_amount_cents || b.amount_cents),
                  ])}
                />
              </Section>
              <Section title={`Em aberto com vencimento até ${shortDate(to, true)}`}>
                <Table
                  head={['Vencimento', 'Tipo', 'Descrição', 'Fornecedor/pessoa', 'Valor']}
                  align={['l', 'l', 'l', 'l', 'r']}
                  rows={r.open.map((b) => [
                    shortDate(b.due_date, true),
                    kind(b),
                    b.description,
                    who(b) || '—',
                    money(b.amount_cents),
                  ])}
                />
              </Section>
            </>
          ),
        }
      }
    }
  }, [
    report,
    txs,
    accounts,
    categories,
    people,
    counts,
    bills,
    scopedAccounts,
    accountSet,
    from,
    to,
    categoryId,
  ])

  const setMonth = (ym: string) => {
    const b = monthBounds(ym)
    setFrom(b.from)
    setTo(b.to)
  }
  const thisMonth = today().slice(0, 7)
  const presets = [
    { label: 'Mês passado', apply: () => setMonth(shiftMonth(thisMonth, -1)) },
    { label: 'Este mês', apply: () => setMonth(thisMonth) },
    {
      label: 'Este ano',
      apply: () => {
        setFrom(`${thisMonth.slice(0, 4)}-01-01`)
        setTo(`${thisMonth.slice(0, 4)}-12-31`)
      },
    },
  ]

  const fileBase = `${built.title} ${period}`.replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, '-')

  if (!canView) return null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Relatórios"
        subtitle="Os relatórios que a tesouraria entrega todo mês, prontos para imprimir ou enviar."
      >
        <Button variant="outline" onClick={() => setExportOpen(true)} disabled={!validPeriod}>
          <FileText className="mr-2 h-4 w-4" />
          Exportar para o contador
        </Button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <nav className={cn(cardClass, 'h-fit overflow-hidden')} aria-label="Relatórios">
          {REPORTS.map((r) => {
            const Icon = r.icon
            const active = r.key === report
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setReport(r.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0',
                  active ? 'bg-emerald-50/70' : 'hover:bg-slate-50',
                )}
              >
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                    active ? 'bg-white text-emerald-700 shadow-xs' : 'bg-slate-50 text-slate-500',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{r.title}</span>
                  <span className="block truncate text-xs text-slate-500">{r.hint}</span>
                </span>
              </button>
            )
          })}
          <Link
            to="/financeiro/informes"
            className="flex w-full items-center gap-3 border-t border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500">
              <FileUser className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">Informes anuais</span>
              <span className="block truncate text-xs text-slate-500">
                Total doado por pessoa, para o IR
              </span>
            </span>
          </Link>
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <div className={cn(cardClass, 'flex flex-col gap-4 p-4')}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rep-from">{report === 'availability' ? 'Data' : 'Período'}</Label>
                <div className="flex items-center gap-2">
                  {report !== 'availability' && (
                    <>
                      <Input
                        id="rep-from"
                        type="date"
                        value={from}
                        max={to}
                        onChange={(e) => setFrom(e.target.value)}
                        className="w-[150px]"
                      />
                      <span className="text-sm text-slate-400">a</span>
                    </>
                  )}
                  <Input
                    id={report === 'availability' ? 'rep-from' : 'rep-to'}
                    aria-label={report === 'availability' ? undefined : 'Até'}
                    type="date"
                    value={to}
                    min={report === 'availability' ? undefined : from}
                    onChange={(e) => {
                      setTo(e.target.value)
                      if (report === 'availability' && e.target.value < from)
                        setFrom(e.target.value)
                    }}
                    className="w-[150px]"
                  />
                </div>
              </div>
              {report !== 'availability' && (
                <div className="flex gap-1 pb-0.5">
                  {presets.map((p) => (
                    <Button key={p.label} type="button" variant="ghost" size="sm" onClick={p.apply}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {congregations.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Congregação</Label>
                  <Select value={congregation} onValueChange={setCongregation}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas</SelectItem>
                      {congregations.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {report === 'ledger' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          <span className="ml-1 text-slate-400">
                            ({c.direction === 'ENTRADA' ? 'entrada' : 'saída'})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Quem assina</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[220px] justify-between font-normal">
                      <span className="truncate">
                        {shownSigners.length
                          ? shownSigners.map((s) => s.title || s.name).join(', ')
                          : 'Ninguém'}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    {signers.length === 0 && (
                      <p className="px-2 py-3 text-sm text-slate-500">
                        Cadastre quem assina em Cadastros, aba “Quem assina”.
                      </p>
                    )}
                    {signers.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={signerIds.includes(s.id)}
                          onCheckedChange={(on) =>
                            setChosenSigners(
                              on ? [...signerIds, s.id] : signerIds.filter((id) => id !== s.id),
                            )
                          }
                        />
                        <span className="text-sm">
                          <span className="font-medium text-slate-900">{s.name}</span>
                          {s.title && <span className="text-slate-500"> · {s.title}</span>}
                        </span>
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  disabled={!built.csv.length || loadingData}
                  onClick={() => download(`${fileBase}.csv`, toCsv(built.csv))}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Planilha
                </Button>
                <Button
                  className={primaryButtonClass}
                  disabled={loadingData}
                  onClick={() => sheetRef.current && printSheet(sheetRef.current, built.title)}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir / PDF
                </Button>
              </div>
            </div>
          </div>

          <div className={cn(cardClass, 'overflow-x-auto p-4 sm:p-8')}>
            {loading || (loadingData && validPeriod) ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="mx-auto h-6 w-64" />
                <Skeleton className="mx-auto h-4 w-80" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : !validPeriod ? (
              <p className="py-8 text-center text-slate-400">Confira as datas do período.</p>
            ) : (
              <div ref={sheetRef} className="mx-auto max-w-3xl bg-white text-slate-900">
                <header className="mb-5 text-center">
                  <h2 className="text-lg font-bold">{built.title}</h2>
                  <p className="text-sm text-slate-500">
                    {[currentChurch?.name, report === 'availability' ? null : period, scopeLabel]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </header>
                {built.body}
                {shownSigners.length > 0 && (
                  <div className="mt-16 grid break-inside-avoid grid-cols-2 gap-x-10 gap-y-12">
                    {shownSigners.map((s) => (
                      <div key={s.id} className="border-t border-slate-800 pt-1.5 text-center">
                        <p className="text-sm font-medium">{s.name}</p>
                        {s.title && <p className="text-xs text-slate-500">{s.title}</p>}
                        {s.document && <p className="text-xs text-slate-500">{s.document}</p>}
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-10 text-right text-[10px] text-slate-400">
                  Emitido em {shortDate(today(), true)} pelo LouvorFlow
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AccountingDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        txs={txs}
        accounts={accounts}
        categories={categories}
        accountSet={accountSet}
        from={from}
        to={to}
        fileName={`lancamentos-contabeis-${from}-a-${to}.csv`}
        loading={loadingData}
      />
    </div>
  )
}

function AccountingDialog({
  open,
  onOpenChange,
  txs,
  accounts,
  categories,
  accountSet,
  from,
  to,
  fileName,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  txs: FinTransaction[]
  accounts: FinAccount[]
  categories: FinCategory[]
  accountSet: Set<string> | null
  from: string
  to: string
  fileName: string
  loading: boolean
}) {
  const [opts, setOpts] = useState<AccountingOptions>({
    separator: ';',
    dateFormat: 'DD/MM/AAAA',
    decimal: ',',
    header: true,
  })
  const result = useMemo(() => {
    const scoped = accountSet
      ? txs.filter(
          (t) =>
            accountSet.has(t.account_id) || (!!t.to_account_id && accountSet.has(t.to_account_id)),
        )
      : txs
    return accountingExport(scoped, accounts, categories, from, to, opts)
  }, [txs, accounts, categories, accountSet, from, to, opts])

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: [string, string][],
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar para o contador</DialogTitle>
          <DialogDescription>
            Um arquivo com uma linha por lançamento de {periodLabel(from, to).toLowerCase()}, com a
            conta de débito e a de crédito pelo código contábil.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {field(
            'Separador',
            opts.separator,
            (v) => setOpts({ ...opts, separator: v as AccountingOptions['separator'] }),
            [
              [';', 'Ponto e vírgula (;)'],
              [',', 'Vírgula (,)'],
              ['|', 'Barra (|)'],
              ['\t', 'Tabulação'],
            ],
          )}
          {field(
            'Data',
            opts.dateFormat,
            (v) => setOpts({ ...opts, dateFormat: v as AccountingOptions['dateFormat'] }),
            [
              ['DD/MM/AAAA', 'DD/MM/AAAA'],
              ['AAAA-MM-DD', 'AAAA-MM-DD'],
            ],
          )}
          {field(
            'Decimal',
            opts.decimal,
            (v) => setOpts({ ...opts, decimal: v as AccountingOptions['decimal'] }),
            [
              [',', 'Vírgula (1234,56)'],
              ['.', 'Ponto (1234.56)'],
            ],
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <Checkbox
              checked={opts.header}
              onCheckedChange={(on) => setOpts({ ...opts, header: on === true })}
            />
            Primeira linha com títulos
          </label>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando lançamentos…
            </span>
          ) : (
            <>
              <p>
                <strong>{result.lines}</strong> {result.lines === 1 ? 'lançamento' : 'lançamentos'}{' '}
                no arquivo.
              </p>
              {result.missing.length > 0 && (
                <div className="mt-2 text-amber-700">
                  <p className="font-medium">
                    Sem código contábil (vai o nome no lugar). Cadastre em Cadastros:
                  </p>
                  <ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-5">
                    {result.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            className={primaryButtonClass}
            disabled={loading || !result.lines}
            onClick={() => download(fileName, result.csv)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Baixar arquivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
