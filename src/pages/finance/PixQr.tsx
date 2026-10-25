// QR Code do PIX (desenhado em SVG no navegador) e o cartaz para imprimir com a chave da igreja.

import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { normalizePixKey, type PixKeyType } from '@/lib/pix'
import { cn } from '@/lib/utils'

/** Caminho SVG dos módulos escuros do QR. */
function qrPath(text: string) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  return { n, d }
}

export function PixQr({
  payload,
  className,
  label = 'QR Code do PIX',
}: {
  payload: string
  className?: string
  label?: string
}) {
  const { n, d } = useMemo(() => qrPath(payload), [payload])
  const m = 4
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-m} ${-m} ${n + 2 * m} ${n + 2 * m}`}
      shapeRendering="crispEdges"
      className={cn('bg-white', className)}
    >
      <rect x={-m} y={-m} width={n + 2 * m} height={n + 2 * m} fill="#fff" />
      <path d={d} fill="#0f172a" />
    </svg>
  )
}

const KEY_LABELS: Record<PixKeyType, string> = {
  CPF_CNPJ: 'CNPJ/CPF',
  TELEFONE: 'Telefone',
  EMAIL: 'E-mail',
  ALEATORIA: 'Chave aleatória',
}

/** Chave como as pessoas leem: CNPJ e telefone com máscara. */
export function displayPixKey(key: string, type?: PixKeyType) {
  const k = normalizePixKey(key, type)
  if (/^\d{14}$/.test(k)) return k.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (/^\d{11}$/.test(k)) return k.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (/^\+55\d{10,11}$/.test(k)) return k.replace(/^\+55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')
  return k
}

/** Cartaz A4 com o QR sem valor: cada um digita quanto quer dar. */
export function PixPosterSheet({
  churchName,
  payload,
  pixKey,
  keyType,
  receiver,
}: {
  churchName: string
  payload: string
  pixKey: string
  keyType?: PixKeyType
  receiver: string
}) {
  return (
    <article className="mx-auto flex max-w-xl flex-col items-center bg-white px-6 py-10 text-center text-slate-900">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        {churchName}
      </p>
      <h2 className="mt-3 text-3xl font-bold">Dízimos e ofertas por PIX</h2>
      <p className="mt-2 text-sm text-slate-600">
        Aponte a câmera do aplicativo do banco para o código e digite o valor.
      </p>
      <PixQr payload={payload} className="mt-8 h-72 w-72" />
      <dl className="mt-8 space-y-1 text-sm">
        <div>
          <dt className="inline text-slate-500">{keyType ? KEY_LABELS[keyType] : 'Chave'}: </dt>
          <dd className="inline font-semibold">{displayPixKey(pixKey, keyType)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Recebedor: </dt>
          <dd className="inline font-semibold">{receiver}</dd>
        </div>
      </dl>
      <p className="mt-10 max-w-sm text-xs text-slate-500">
        Quer o recibo no seu nome? Faça o PIX da sua conta pessoal: a tesouraria identifica pelo
        extrato do banco.
      </p>
    </article>
  )
}

export const PIX_KEY_OPTIONS = (Object.keys(KEY_LABELS) as PixKeyType[]).map((value) => ({
  value,
  label: KEY_LABELS[value],
}))
