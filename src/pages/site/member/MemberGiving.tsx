// Minhas contribuições: o que a tesouraria já conferiu no extrato (ou contou no culto) em nome
// da pessoa, e o informe anual para o imposto de renda. Nunca mostra "previsto" nem
// "aguardando"; anônimas não entram. Os dados vêm de GET /backend/v1/member/giving.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileText, Gift, Loader2 } from 'lucide-react'
import { formatCents } from '@/lib/money'
import { annualStatements, givingSummary } from '@/lib/memberGiving'
import { givingLine } from '@/lib/memberArea'
import { getMemberGiving, memberError, type MemberGiving as Giving } from '@/services/member'
import type { FinSettings, FinSigner } from '@/types/finance'
import { AnnualStatementSheet } from '@/pages/finance/AnnualStatementSheet'
import { printSheet } from '@/pages/finance/print'
import { useSite } from '../siteContext'
import { BackTitle, IconCircle, Label, Spinner, useMemberMe } from './memberParts'

const FIRST_ROWS = 12

export default function MemberGiving() {
  const { slug, to } = useSite()
  // Sem sessão volta para o Eu
  const { me } = useMemberMe()
  const [data, setData] = useState<Giving | null>(null)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [printYear, setPrintYear] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!me) return
    let alive = true
    getMemberGiving(slug)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(memberError(err).message))
    return () => {
      alive = false
    }
  }, [me, slug])

  const currentYear = Number((data?.today || '').slice(0, 4)) || new Date().getFullYear()
  const summary = useMemo(
    () => (data ? givingSummary(data.items, data.categories, data.person.id, currentYear) : null),
    [data, currentYear],
  )
  const names = useMemo(() => new Map((data?.categories || []).map((c) => [c.id, c.name])), [data])
  // Informes: anos anteriores com contribuição (o do ano corrente só depois que ele fecha)
  const informYears = (summary?.years || []).filter((y) => y < currentYear)
  const statement = useMemo(
    () =>
      data && printYear
        ? annualStatements(data.items, data.categories, printYear).get(data.person.id) || null
        : null,
    [data, printYear],
  )

  // Imprime (ou salva em PDF) quando a folha do ano escolhido está montada
  useEffect(() => {
    if (!statement || !sheetRef.current || !data) return
    printSheet(sheetRef.current, `Informe ${statement.year} - ${data.person.name}`)
    setPrintYear(null)
  }, [statement, data])

  if (!me || (!data && !error)) return <Spinner />

  if (!data) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-2 lg:pt-10">
        <BackTitle>Minhas contribuições</BackTitle>
        <div className="c-card p-5 text-[14px] font-medium text-[var(--c-gray)]">{error}</div>
      </div>
    )
  }

  const thisYear = data.items.filter((tx) => tx.date.startsWith(String(currentYear)))
  const rows = showAll ? data.items : data.items.slice(0, FIRST_ROWS)

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pt-2 lg:pt-10">
      <BackTitle>Minhas contribuições</BackTitle>

      <div className="mt-2 rounded-3xl bg-[var(--c-navy)] p-[18px] text-[var(--sp-text)]">
        <p className="text-[12.5px] font-bold opacity-75">Confirmadas em {currentYear}</p>
        <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-tight">
          {formatCents(summary?.total || 0)}
        </p>
        <p className="text-[12.5px] font-semibold opacity-75">
          {thisYear.length === 1 ? '1 contribuição' : `${thisYear.length} contribuições`}
          {summary?.previousTotal
            ? ` · ${currentYear - 1}: ${formatCents(summary.previousTotal)}`
            : ''}
        </p>
      </div>

      {data.items.length === 0 ? (
        <div className="c-card space-y-2 p-5 text-center">
          <p className="text-[15px] font-bold">Nada conferido ainda</p>
          <p className="text-[13px] font-medium text-[var(--c-gray)]">
            A contribuição aparece aqui depois que a tesouraria confere no extrato do banco. O Pix
            entra no seu nome quando sai de uma conta no seu CPF.
          </p>
          <Link
            to={to('/contribuir')}
            className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] px-5 text-[14px] font-extrabold text-[var(--sp-text)]"
          >
            <Gift className="h-4 w-4" /> Contribuir
          </Link>
        </div>
      ) : (
        <div className="c-card divide-y divide-[#eef1f5] py-1">
          {rows.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px] font-bold">
                  {[names.get(tx.category_id) || 'Contribuição', tx.campaign]
                    .filter(Boolean)
                    .join(' · ')}
                </b>
                <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
                  {givingLine(tx, currentYear)}
                </span>
              </span>
              <b className="shrink-0 text-[15px] font-extrabold tabular-nums">
                {formatCents(tx.amount_cents)}
              </b>
            </div>
          ))}
          {!showAll && data.items.length > FIRST_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-3 text-center text-[13.5px] font-extrabold text-[var(--c-blue)]"
            >
              Ver todas ({data.items.length})
            </button>
          )}
        </div>
      )}

      <Label>Informe para o imposto de renda</Label>
      {informYears.length ? (
        <div className="c-card divide-y divide-[#eef1f5] py-1">
          {informYears.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setPrintYear(y)}
              className="flex w-full items-center gap-3.5 px-4 py-3 text-left"
            >
              <IconCircle icon={FileText} />
              <span className="min-w-0 flex-1">
                <b className="block text-[15px] font-bold">Informe anual {y}</b>
                <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
                  Salvar em PDF ou imprimir, com CNPJ e assinatura
                </span>
              </span>
              {printYear === y ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin text-[var(--c-gray)]" />
              ) : (
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#b3bbc7]" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="c-card p-4 text-[13px] font-medium text-[var(--c-gray)]">
          O informe de {currentYear} fica pronto aqui quando o ano terminar.
        </div>
      )}

      <p className="px-1 pb-4 text-[12.5px] font-medium leading-snug text-[var(--c-gray)]">
        Só aparece o que a tesouraria já conferiu no extrato do banco ou contou no culto.
        Contribuições anônimas não entram.
      </p>

      {statement && (
        <div className="hidden">
          <div ref={sheetRef}>
            <AnnualStatementSheet
              statement={statement}
              person={{ name: data.person.name, document: data.person.document }}
              churchName={data.church_name}
              settings={data.settings as FinSettings | null}
              signers={data.signers as unknown as FinSigner[]}
              issuedOn={data.today}
            />
          </div>
        </div>
      )}
    </div>
  )
}
