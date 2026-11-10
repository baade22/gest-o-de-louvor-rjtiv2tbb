import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
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
  TrendingUp,
  Scale,
  Wallet,
  UserSearch,
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
  formatDoc,
  payersReport,
  revenueReport,
  toCsv,
  type AccountingOptions,
  type ReportRow,
} from '@/lib/financeReports'
import {
  listAccounts,
  listApprovedCounts,
  listBills,
  getFinSettings,
  listCategoryTree,
  listPeople,
  listReportTransactions,
  listSigners,
  listSuppliers,
} from '@/services/finance'
import pb from '@/lib/pocketbase/client'
import { cashFlowReport, monthsBetween, treeTotals, type TreeLine } from '@/lib/treeReports'
import type {
  FinAccount,
  FinBill,
  FinCategory,
  FinCount,
  FinSettings,
  FinSigner,
  FinSupplier,
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
import { useReconcileStarts } from './useReconcileStarts'
import { realizedFilter } from '@/lib/realizedBalance'
import {
  Band,
  Params,
  RecordCount,
  Section,
  SheetHeader,
  Table,
  Totals,
  cellClass,
  headClass,
  indent,
  numClass,
  num,
  pct,
  totalRowClass,
  treeName,
} from './reportParts'

type ReportKey =
  | 'dre'
  | 'cashflow'
  | 'contributions'
  | 'payers'
  | 'counts'
  | 'trial'
  | 'ledger'
  | 'availability'
  | 'bills'
  | 'revenue'

const REPORTS: { key: ReportKey; title: string; hint: string; icon: typeof FileText }[] = [
  {
    key: 'dre',
    title: 'D.R.E. (resultado)',
    hint: 'Plano de contas mês a mês',
    icon: Landmark,
  },
  {
    key: 'cashflow',
    title: 'Fluxo de caixa',
    hint: 'Saldo inicial, movimento por dia e saldo final',
    icon: ArrowLeftRight,
  },
  {
    key: 'contributions',
    title: 'Contribuições',
    hint: 'Por pessoa, categoria e forma',
    icon: HandCoins,
  },
  {
    key: 'payers',
    title: 'Créditos por pagador',
    hint: 'Entradas por nome e CPF/CNPJ de quem pagou',
    icon: UserSearch,
  },
  { key: 'counts', title: 'Fechamento do culto', hint: 'Contagens aprovadas', icon: Calculator },
  {
    key: 'trial',
    title: 'Balancete',
    hint: 'Entradas, saídas e saldo pelo plano de contas',
    icon: Scale,
  },
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
  {
    key: 'revenue',
    title: 'Declaração de faturamento',
    hint: 'Receita mês a mês, para banco e cadastros',
    icon: TrendingUp,
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

const LEVELS = ['1', '2', '3', '4']
type Detail = 'SINTETICO' | 'ANALITICO'
type Nature = 'TODAS' | 'ENTRADA' | 'SAIDA'

// ---- Página ----

interface Built {
  title: string
  body: React.ReactNode
  csv: (string | number)[][]
  /** Folha deitada (muitas colunas). */
  landscape?: boolean
  /** O que vai em "Parâmetros aplicados", além do período e da congregação. */
  params?: string[]
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
  /** Contas escolhidas (null = todas da congregação). */
  const [chosenAccounts, setChosenAccounts] = useState<string[] | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [chosenSigners, setChosenSigners] = useState<string[] | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [tree, setTree] = useState<FinCategory[]>([])
  const [suppliers, setSuppliers] = useState<FinSupplier[]>([])
  const [levels, setLevels] = useState('3')
  const [detail, setDetail] = useState<Detail>('SINTETICO')
  const [nature, setNature] = useState<Nature>('TODAS')
  const [showAccounts, setShowAccounts] = useState(true)
  const [showTransfers, setShowTransfers] = useState(false)
  const [onlyContributions, setOnlyContributions] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [signers, setSigners] = useState<FinSigner[]>([])
  const [settings, setSettings] = useState<FinSettings | null>(null)
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
      listCategoryTree(churchId),
      listPeople(churchId),
      listSigners(churchId),
      listBills(churchId),
      getFinSettings(churchId).catch(() => null),
      listSuppliers(churchId).catch(() => [] as FinSupplier[]),
    ])
      .then(([acc, cat, ppl, sig, bl, st, sup]) => {
        setSettings(st)
        setAccounts(acc)
        setTree(cat)
        setSuppliers(sup)
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

  // Saldo de conta bancária: só o que foi conciliado com o extrato (igual a Saldos e extratos)
  const starts = useReconcileStarts(churchId, accounts)
  const realized = useMemo(() => realizedFilter(starts), [starts])
  /** Categorias que recebem lançamento (sem os grupos do plano de contas). */
  const categories = useMemo(() => tree.filter((c) => !c.is_group), [tree])
  const congregations = useMemo(
    () => [...new Set(accounts.map((a) => a.congregation || '').filter(Boolean))].sort(),
    [accounts],
  )
  const congregationAccounts = useMemo(
    () =>
      congregation === ALL
        ? accounts
        : accounts.filter((a) => (a.congregation || '') === congregation),
    [accounts, congregation],
  )
  /** Contas que dá para escolher: as ativas, mais as inativas já escolhidas. */
  const pickableAccounts = useMemo(
    () =>
      congregationAccounts.filter(
        (a) => a.is_active !== false || (chosenAccounts ?? []).includes(a.id),
      ),
    [congregationAccounts, chosenAccounts],
  )
  const scopedAccounts = useMemo(
    () =>
      chosenAccounts === null
        ? congregationAccounts
        : congregationAccounts.filter((a) => chosenAccounts.includes(a.id)),
    [congregationAccounts, chosenAccounts],
  )
  const accountSet = useMemo(
    () =>
      congregation === ALL && chosenAccounts === null
        ? null
        : new Set(scopedAccounts.map((a) => a.id)),
    [congregation, chosenAccounts, scopedAccounts],
  )
  const accountsLabel =
    chosenAccounts === null
      ? 'Todas as contas'
      : scopedAccounts.length
        ? scopedAccounts.map((a) => a.name).join(', ')
        : 'Nenhuma conta'
  const activeSigners = signers.filter((s) => s.is_active !== false)
  const signerIds = chosenSigners ?? activeSigners.map((s) => s.id)
  const shownSigners = signers.filter((s) => signerIds.includes(s.id))

  const logoUrl = currentChurch?.logo
    ? `${pb.baseURL.replace(/\/$/, '')}/api/files/churches/${currentChurch.id}/${currentChurch.logo}`
    : undefined
  const scopeLabel = congregation === ALL ? 'Todas as congregações' : congregation
  const period = periodLabel(from, to)

  const built = useMemo<Built>(() => {
    const money = formatCents
    switch (report) {
      case 'dre': {
        const months = monthsBetween(from, to)
        const r = treeTotals(tree, txs, {
          from,
          to,
          columns: months.length,
          column: (t) => months.indexOf(t.date.slice(0, 7)),
          accounts: accountSet,
          levels: Number(levels),
        })
        const result = months.map((_, i) => r.incomeValues[i] - r.expenseValues[i])
        const sumOf = (v: number[]) => v.reduce((s, x) => s + x, 0)
        const head = months.map((m) => `${m.slice(5)}/${m.slice(0, 4)}`)
        const signed = (l: TreeLine) => (l.direction === 'SAIDA' ? -1 : 1)
        const lineRow = (l: TreeLine) => (
          <tr key={l.id} className={cn('border-b border-slate-200', l.isGroup && 'font-bold')}>
            <td className={cellClass} style={indent(l.depth)}>
              {treeName(l)}
            </td>
            {l.values.map((v, i) => (
              <td key={i} className={cn(cellClass, numClass)}>
                {num(signed(l) * v)}
              </td>
            ))}
            <td className={cn(cellClass, numClass, 'font-bold')}>{num(signed(l) * l.total)}</td>
          </tr>
        )
        const totalRow = (label: string, values: number[], red = false) => (
          <tr className={totalRowClass}>
            <td className="px-1.5 py-1 uppercase">{label}</td>
            {values.map((v, i) => (
              <td key={i} className={cn('px-1.5 py-1', numClass, red && v < 0 && 'text-red-700')}>
                {num(v)}
              </td>
            ))}
            <td className={cn('px-1.5 py-1', numClass, red && sumOf(values) < 0 && 'text-red-700')}>
              {num(sumOf(values))}
            </td>
          </tr>
        )
        const csvLine = (l: TreeLine) => [
          `${'  '.repeat(l.depth)}${treeName(l)}`,
          ...l.values.map((v) => centsToText(signed(l) * v)),
          centsToText(signed(l) * l.total),
        ]
        return {
          title: 'D.R.E. - Demonstração do Resultado do Exercício',
          landscape: months.length > 3,
          params: [`Agrupado até o nível ${levels}`],
          csv: [
            ['Plano de contas', ...head, 'Total'],
            ...r.income.map(csvLine),
            [
              'Total das entradas',
              ...r.incomeValues.map((v) => centsToText(v)),
              centsToText(sumOf(r.incomeValues)),
            ],
            ...r.expense.map(csvLine),
            [
              'Total das saídas',
              ...r.expenseValues.map((v) => centsToText(-v)),
              centsToText(-sumOf(r.expenseValues)),
            ],
            ['Resultado', ...result.map((v) => centsToText(v)), centsToText(sumOf(result))],
          ],
          body: (
            <>
              <table
                className={cn(
                  'w-full border-collapse',
                  months.length > 8 ? 'text-[9.5px]' : 'text-[11px]',
                )}
              >
                <thead>
                  <tr>
                    <th className={cn(headClass, 'text-left')}>Plano de contas</th>
                    {head.map((h) => (
                      <th key={h} className={cn(headClass, 'text-right')}>
                        {h}
                      </th>
                    ))}
                    <th className={cn(headClass, 'text-right')}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.income.map(lineRow)}
                  {totalRow('Total das entradas', r.incomeValues)}
                  {r.expense.map(lineRow)}
                  {totalRow(
                    'Total das saídas',
                    r.expenseValues.map((v) => -v),
                  )}
                  {totalRow('Resultado', result, true)}
                </tbody>
              </table>
              <RecordCount count={r.records} />
            </>
          ),
        }
      }
      case 'cashflow': {
        const r = cashFlowReport(
          scopedAccounts,
          txs,
          from,
          to,
          {
            categories: new Map(tree.map((c) => [c.id, c.name])),
            people: new Map(people.map((p) => [p.id, p.name])),
            suppliers: new Map(suppliers.map((p) => [p.id, p.name])),
          },
          showTransfers,
          realized,
        )
        const balances = (title: string, rows: typeof r.opening, total: number) => (
          <>
            <Band>{title}</Band>
            <Table
              head={['Código', 'Conta', 'Saldo']}
              align={['l', 'l', 'r']}
              rows={rows.map((o) => [o.code, o.name, num(o.cents)])}
              foot={['', 'Totais', num(total)]}
            />
          </>
        )
        return {
          title: 'Fluxo de Caixa',
          landscape: true,
          params: [showTransfers ? 'Com transferências entre as contas' : ''].filter(Boolean),
          csv: [
            ['Data', 'Conta', 'Fornecedor/contribuinte', 'Categoria', 'Histórico', 'Valor'],
            ...r.days.flatMap((d) =>
              d.lines.map((l) => [
                shortDate(l.date, true),
                l.accountName,
                l.who,
                l.category,
                l.description,
                centsToText(l.cents),
              ]),
            ),
          ],
          body: (
            <>
              {balances('Saldo inicial das contas', r.opening, r.openingTotal)}
              <Band>Movimentação do período</Band>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {['Data', 'Conta', 'Fornecedor/contribuinte', 'Categoria', 'Histórico'].map(
                      (h) => (
                        <th key={h} className={cn(headClass, 'text-left')}>
                          {h}
                        </th>
                      ),
                    )}
                    <th className={cn(headClass, 'text-right')}>Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.days.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-3 text-center text-slate-500">
                        Nada no período.
                      </td>
                    </tr>
                  )}
                  {r.days.map((d) => (
                    <Fragment key={d.date}>
                      {d.lines.map((l) => (
                        <tr key={l.id} className="border-b border-slate-200">
                          <td className={cn(cellClass, 'whitespace-nowrap')}>
                            {shortDate(l.date, true)}
                          </td>
                          <td className={cellClass}>{l.accountName}</td>
                          <td className={cellClass}>{l.who}</td>
                          <td className={cellClass}>{l.category}</td>
                          <td className={cellClass}>{l.description}</td>
                          <td className={cn(cellClass, numClass)}>{num(l.cents)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={5} className="px-1.5 py-[3px] text-right uppercase">
                          Movimento do dia ({shortDate(d.date, true)})
                        </td>
                        <td className={cn('px-1.5 py-[3px]', numClass)}>{num(d.subtotal)}</td>
                      </tr>
                      <tr className="border-b border-slate-400 bg-slate-100 font-bold">
                        <td colSpan={5} className="px-1.5 py-[3px] text-right uppercase">
                          Saldo das contas em {shortDate(d.date, true)}
                        </td>
                        <td className={cn('px-1.5 py-[3px]', numClass)}>{num(d.balance)}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  {(
                    [
                      ['Total de entradas', r.income],
                      ['Total de saídas', -r.expense],
                      ['Resultado do período', r.income - r.expense],
                    ] as const
                  ).map(([label, v]) => (
                    <tr key={label} className={totalRowClass}>
                      <td colSpan={5} className="px-1.5 py-1 text-right uppercase">
                        {label}
                      </td>
                      <td className={cn('px-1.5 py-1', numClass)}>{num(v)}</td>
                    </tr>
                  ))}
                </tfoot>
              </table>
              <RecordCount count={r.records} />
              {balances('Saldo final das contas', r.closing, r.closingTotal)}
            </>
          ),
        }
      }
      case 'revenue': {
        const r = revenueReport(txs, categories, from, to, accountSet)
        const who = settings?.legal_name || currentChurch?.name || 'a igreja'
        const where = [settings?.address, settings?.city].filter(Boolean).join(', ')
        const city = settings?.city ? `${settings.city}, ` : ''
        const longDate = new Intl.DateTimeFormat('pt-BR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${today()}T12:00:00Z`))
        return {
          title: 'Declaração de Faturamento',
          csv: [
            ['Mês', 'Contribuições (dízimos e ofertas)', 'Outras receitas', 'Total'],
            ...r.months.map((x) => [
              monthLabel(x.month),
              centsToText(x.contributions),
              centsToText(x.other),
              centsToText(x.total),
            ]),
            ['Total', centsToText(r.contributions), centsToText(r.other), centsToText(r.total)],
            ['Média mensal', '', '', centsToText(r.average)],
          ],
          body: (
            <>
              <p className="mb-5 text-justify text-[13.5px] leading-relaxed text-slate-800">
                Declaramos, para os devidos fins, que <b>{who}</b>
                {settings?.cnpj ? (
                  <>
                    , inscrita no CNPJ sob o nº <b>{settings.cnpj}</b>
                  </>
                ) : null}
                {where ? `, com sede em ${where}` : ''}, teve no período de{' '}
                <b>{periodLabel(from, to)}</b> a receita bruta mensal abaixo, num total de{' '}
                <b>{money(r.total)}</b> e média mensal de <b>{money(r.average)}</b>.
              </p>
              <Table
                head={['Mês', 'Contribuições', 'Outras receitas', 'Total']}
                align={['l', 'r', 'r', 'r']}
                rows={r.months.map((x) => [
                  monthLabel(x.month),
                  money(x.contributions),
                  money(x.other),
                  money(x.total),
                ])}
                foot={['Total', money(r.contributions), money(r.other), money(r.total)]}
              />
              <p className="mt-3 text-[12px] text-slate-500">
                Contribuições são os dízimos e ofertas. Transferências entre contas da igreja não
                entram.
                {!settings?.cnpj &&
                  ' Para o CNPJ e o endereço aparecerem aqui, preencha os dados da igreja em Cadastros.'}
              </p>
              <p className="mt-8 text-[13.5px] text-slate-800">
                {city}
                {longDate}.
              </p>
            </>
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
      case 'payers': {
        const contribution = onlyContributions
          ? new Set(categories.filter((c) => c.is_contribution).map((c) => c.id))
          : null
        const r = payersReport(txs, people, from, to, accountSet, contribution)
        return {
          title: 'Créditos por Pagador',
          params: [onlyContributions ? 'Só categorias de contribuição' : 'Todas as entradas'],
          csv: [
            ['Nome', 'CPF/CNPJ', 'Cadastro', 'Lançamentos', 'Último crédito', 'Valor'],
            ...r.rows.map((x) => [
              x.label,
              formatDoc(x.doc),
              x.personId ? 'Membros' : x.key === 'none' ? '' : 'Sem cadastro',
              x.count,
              shortDate(x.last, true),
              centsToText(x.cents),
            ]),
          ],
          body: (
            <>
              <Totals
                items={[
                  { label: 'Total de entradas', value: money(r.total), strong: true },
                  {
                    label: 'Pagadores',
                    value: String(r.rows.filter((x) => x.key !== 'none').length),
                  },
                  { label: 'Com cadastro', value: String(r.registered) },
                  { label: 'Não identificado', value: money(r.unknown) },
                ]}
              />
              <Table
                head={['Nome', 'CPF/CNPJ', 'Cadastro', 'Lanç.', 'Último', 'Valor', '%']}
                align={['l', 'l', 'l', 'r', 'r', 'r', 'r']}
                rows={r.rows.map((x) => [
                  x.label,
                  formatDoc(x.doc),
                  x.personId ? 'Membros' : x.key === 'none' ? '' : 'Sem cadastro',
                  x.count,
                  shortDate(x.last, true),
                  num(x.cents),
                  pct(x.pct),
                ])}
                foot={['Total', '', '', String(r.records), '', num(r.total), '']}
                count={r.rows.length}
              />
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
        const r = treeTotals(tree, txs, {
          from,
          to,
          columns: 2,
          column: (t) => (t.type === 'ENTRADA' ? 0 : 1),
          accounts: accountSet,
          levels: Number(levels),
        })
        const lines = [
          ...(nature !== 'SAIDA' ? r.income : []),
          ...(nature !== 'ENTRADA' ? r.expense : []),
        ]
        const totalIn = nature === 'SAIDA' ? 0 : r.incomeValues[0]
        const totalOut = nature === 'ENTRADA' ? 0 : r.expenseValues[1]
        const records = lines.filter((l) => l.depth === 0).reduce((s, l) => s + l.count, 0)
        const whoOf = (t: TreeLine['items'][number]) =>
          (t.person_id && people.find((p) => p.id === t.person_id)?.name) ||
          (t.supplier_id && suppliers.find((p) => p.id === t.supplier_id)?.name) ||
          ''
        const list = accountMovements(scopedAccounts, txs, from, to, realized).filter(
          (m) => m.opening || m.income || m.expense || m.transfersIn || m.transfersOut || m.closing,
        )
        const sum = (f: (m: (typeof list)[number]) => number) => list.reduce((s, m) => s + f(m), 0)
        const net = (m: (typeof list)[number]) => m.transfersIn - m.transfersOut
        const accName = new Map(accounts.map((a) => [a.id, a.name]))
        const transfers = txs.filter(
          (t) =>
            t.type === 'TRANSFERENCIA' &&
            t.status !== 'ESTORNADO' &&
            t.date.slice(0, 10) >= from &&
            t.date.slice(0, 10) <= to &&
            (!accountSet ||
              accountSet.has(t.account_id) ||
              (!!t.to_account_id && accountSet.has(t.to_account_id))),
        )
        const analytic = detail === 'ANALITICO'
        return {
          title: analytic ? 'Balancete Analítico' : 'Balancete Sintético',
          params: [
            nature === 'TODAS' ? 'Entradas e saídas' : nature === 'ENTRADA' ? 'Entradas' : 'Saídas',
            `Agrupado até o nível ${levels}`,
          ],
          csv: [
            ['Plano de contas', 'Data', 'Histórico', 'Entrada', 'Saída', 'Saldo'],
            ...lines.flatMap((l) => [
              [
                `${'  '.repeat(l.depth)}${treeName(l)}`,
                '',
                '',
                centsToText(l.values[0]),
                centsToText(l.values[1]),
                centsToText(l.values[0] - l.values[1]),
              ],
              ...(analytic
                ? l.items.map((t) => [
                    '',
                    shortDate(t.date, true),
                    t.description || whoOf(t),
                    t.type === 'ENTRADA' ? centsToText(t.amount_cents) : '',
                    t.type === 'ENTRADA' ? '' : centsToText(t.amount_cents),
                    '',
                  ])
                : []),
            ]),
            [
              'Total geral',
              '',
              '',
              centsToText(totalIn),
              centsToText(totalOut),
              centsToText(totalIn - totalOut),
            ],
          ],
          body: (
            <>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className={cn(headClass, 'text-left')}>
                      {analytic ? 'Plano de contas / lançamento' : 'Plano de contas'}
                    </th>
                    {analytic && <th className={cn(headClass, 'text-left')}>Data</th>}
                    <th className={cn(headClass, 'text-right')}>Entrada</th>
                    <th className={cn(headClass, 'text-right')}>Saída</th>
                    <th className={cn(headClass, 'text-right')}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                        Nada no período.
                      </td>
                    </tr>
                  )}
                  {lines.map((l) => (
                    <Fragment key={l.id}>
                      <tr
                        className={cn(
                          'border-b border-slate-200',
                          (l.isGroup || analytic) && 'font-bold',
                          analytic && 'bg-slate-50',
                        )}
                      >
                        <td
                          className={cellClass}
                          style={indent(l.depth)}
                          colSpan={analytic ? 2 : 1}
                        >
                          {treeName(l)}
                        </td>
                        <td className={cn(cellClass, numClass)}>{num(l.values[0])}</td>
                        <td className={cn(cellClass, numClass)}>{num(l.values[1])}</td>
                        <td className={cn(cellClass, numClass)}>
                          {num(l.values[0] - l.values[1])}
                        </td>
                      </tr>
                      {analytic &&
                        l.items.map((t) => (
                          <tr key={t.id} className="border-b border-slate-100 text-slate-700">
                            <td className={cellClass} style={indent(l.depth + 1)}>
                              {[t.description, whoOf(t)].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className={cn(cellClass, 'whitespace-nowrap')}>
                              {shortDate(t.date, true)}
                            </td>
                            <td className={cn(cellClass, numClass)}>
                              {t.type === 'ENTRADA' ? num(t.amount_cents) : ''}
                            </td>
                            <td className={cn(cellClass, numClass)}>
                              {t.type === 'ENTRADA' ? '' : num(t.amount_cents)}
                            </td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={totalRowClass}>
                    <td className="px-1.5 py-1 uppercase" colSpan={analytic ? 2 : 1}>
                      Total geral
                    </td>
                    <td className={cn('px-1.5 py-1', numClass)}>{num(totalIn)}</td>
                    <td className={cn('px-1.5 py-1', numClass)}>{num(totalOut)}</td>
                    <td className={cn('px-1.5 py-1', numClass)}>{num(totalIn - totalOut)}</td>
                  </tr>
                </tfoot>
              </table>
              <RecordCount count={records} />
              {showAccounts && (
                <div className="break-inside-avoid">
                  <Band>Saldos iniciais e finais das contas</Band>
                  <Table
                    head={[
                      'Conta',
                      'Saldo inicial',
                      'Entradas',
                      'Saídas',
                      'Transf.',
                      'Saldo final',
                    ]}
                    align={['l', 'r', 'r', 'r', 'r', 'r']}
                    rows={list.map((m) => [
                      m.congregation ? `${m.name} (${m.congregation})` : m.name,
                      num(m.opening),
                      num(m.income),
                      num(m.expense),
                      num(net(m)),
                      num(m.closing),
                    ])}
                    foot={[
                      'Totais',
                      num(sum((m) => m.opening)),
                      num(sum((m) => m.income)),
                      num(sum((m) => m.expense)),
                      num(sum(net)),
                      num(sum((m) => m.closing)),
                    ]}
                  />
                </div>
              )}
              {showTransfers && (
                <div className="break-inside-avoid">
                  <Band>Transferências</Band>
                  <Table
                    head={['Data', 'De', 'Para', 'Histórico', 'Valor']}
                    align={['l', 'l', 'l', 'l', 'r']}
                    rows={transfers.map((t) => [
                      shortDate(t.date, true),
                      accName.get(t.account_id) || '',
                      accName.get(t.to_account_id || '') || '',
                      t.description || '',
                      num(t.amount_cents),
                    ])}
                    count={transfers.length}
                  />
                </div>
              )}
            </>
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
        const r = availabilityReport(scopedAccounts, txs, to, realized)
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
    settings,
    currentChurch?.name,
    accounts,
    categories,
    tree,
    suppliers,
    people,
    counts,
    bills,
    scopedAccounts,
    accountSet,
    from,
    to,
    categoryId,
    levels,
    detail,
    nature,
    showAccounts,
    onlyContributions,
    showTransfers,
    realized,
  ])

  const setMonth = (ym: string) => {
    const b = monthBounds(ym)
    setFrom(b.from)
    setTo(b.to)
  }
  const thisMonth = today().slice(0, 7)
  // Últimos 12 meses fechados (o que banco e cadastros costumam pedir)
  const last12 = () => {
    setFrom(monthBounds(shiftMonth(thisMonth, -12)).from)
    setTo(monthBounds(shiftMonth(thisMonth, -1)).to)
  }
  const presets = [
    ...(report === 'revenue' ? [{ label: 'Últimos 12 meses', apply: last12 }] : []),
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <nav className={cn(cardClass, 'h-fit overflow-hidden')} aria-label="Relatórios">
          {REPORTS.map((r) => {
            const Icon = r.icon
            const active = r.key === report
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setReport(r.key)
                  if (r.key === 'revenue' && r.key !== report) last12()
                }}
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
                  <Select
                    value={congregation}
                    onValueChange={(v) => {
                      setCongregation(v)
                      setChosenAccounts(null)
                    }}
                  >
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
              {(report === 'dre' || report === 'trial') && (
                <div className="flex flex-col gap-1.5">
                  <Label>Agrupar até o nível</Label>
                  <Select value={levels} onValueChange={setLevels}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          Nível {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {report === 'trial' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Natureza</Label>
                    <Select value={nature} onValueChange={(v) => setNature(v as Nature)}>
                      <SelectTrigger className="w-[170px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODAS">Entradas e saídas</SelectItem>
                        <SelectItem value="ENTRADA">Só entradas</SelectItem>
                        <SelectItem value="SAIDA">Só saídas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Detalhes</Label>
                    <Select value={detail} onValueChange={(v) => setDetail(v as Detail)}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SINTETICO">Sintético</SelectItem>
                        <SelectItem value="ANALITICO">Analítico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {report === 'payers' && (
                <label className="flex items-center gap-2 pb-1 text-sm text-slate-700">
                  <Checkbox
                    checked={onlyContributions}
                    onCheckedChange={(on) => setOnlyContributions(on === true)}
                  />
                  Só dízimos e ofertas (categorias de contribuição)
                </label>
              )}
              {(report === 'trial' || report === 'cashflow') && (
                <div className="flex flex-col gap-2 pb-1 text-sm text-slate-700">
                  {report === 'trial' && (
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={showAccounts}
                        onCheckedChange={(on) => setShowAccounts(on === true)}
                      />
                      Listar saldos iniciais e finais das contas
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={showTransfers}
                      onCheckedChange={(on) => setShowTransfers(on === true)}
                    />
                    Listar transferências
                  </label>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Contas</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[220px] justify-between font-normal">
                      <span className="truncate">{accountsLabel}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md border-b border-slate-100 px-2 py-2 hover:bg-slate-50">
                      <Checkbox
                        checked={chosenAccounts === null}
                        onCheckedChange={(on) => setChosenAccounts(on ? null : [])}
                      />
                      <span className="text-sm font-medium text-slate-900">Todas as contas</span>
                    </label>
                    {pickableAccounts.map((a) => {
                      const ids = chosenAccounts ?? congregationAccounts.map((c) => c.id)
                      return (
                        <label
                          key={a.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 hover:bg-slate-50"
                        >
                          <Checkbox
                            checked={ids.includes(a.id)}
                            onCheckedChange={(on) => {
                              const next = on ? [...ids, a.id] : ids.filter((id) => id !== a.id)
                              const all = congregationAccounts.every((c) => next.includes(c.id))
                              setChosenAccounts(all ? null : next)
                            }}
                          />
                          <span className="text-sm">
                            <span className="font-medium text-slate-900">{a.name}</span>
                            {a.congregation && (
                              <span className="text-slate-500"> · {a.congregation}</span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </PopoverContent>
                </Popover>
              </div>
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
                  onClick={() =>
                    sheetRef.current &&
                    printSheet(sheetRef.current, built.title, {
                      landscape: built.landscape,
                      footer: built.title,
                    })
                  }
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
              <div
                ref={sheetRef}
                data-sheet
                className={cn(
                  'mx-auto bg-white font-[Arial,Helvetica,sans-serif] text-black',
                  built.landscape ? 'max-w-5xl' : 'max-w-3xl',
                )}
              >
                <SheetHeader
                  church={settings?.legal_name || currentChurch?.name || ''}
                  title={built.title}
                  logoUrl={logoUrl}
                />
                {built.body}
                <Params
                  items={[
                    report === 'availability'
                      ? `Data: ${shortDate(to, true)}`
                      : `Período: ${shortDate(from, true)} a ${shortDate(to, true)}`,
                    `Congregação: ${scopeLabel}`,
                    chosenAccounts !== null && `Contas: ${accountsLabel}`,
                    ...(built.params || []),
                  ]}
                />
                {shownSigners.length > 0 && (
                  <div className="mt-14 grid break-inside-avoid grid-cols-2 gap-x-10 gap-y-12">
                    {shownSigners.map((s) => (
                      <div key={s.id} className="border-t border-black pt-1 text-center">
                        <p className="text-[12px] font-semibold">{s.name}</p>
                        {s.title && <p className="text-[10px] text-slate-600">{s.title}</p>}
                        {s.document && <p className="text-[10px] text-slate-600">{s.document}</p>}
                      </div>
                    ))}
                  </div>
                )}
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
