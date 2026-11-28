// Carteirinha digital (só para quem é membro). O QR abre /igreja/carteirinha/<código>, que só diz
// se ela vale, de quem é e a situação.

import { Link } from 'react-router-dom'
import { Download, FileText, X } from 'lucide-react'
import QRCode from 'qrcode'
import { QrCodeImage } from '@/components/QrCodeImage'
import { cardCheckPath, MEMBER_STATUS_LABEL } from '@/lib/memberArea'
import { whatsappUrl } from '@/lib/site'
import { siteFileUrl } from '@/services/site'
import { useSite } from '../siteContext'
import { Spinner, useMemberMe } from './memberParts'

function brDate(d: string) {
  return d ? d.slice(0, 10).split('-').reverse().join('/') : '—'
}

export default function MemberCard() {
  const { site, to } = useSite()
  const { me, loading } = useMemberMe()
  if (loading || !me) return <Spinner />
  const p = me.profile
  const card = me.card

  if (!card) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 pt-2 lg:pt-10">
        <h1 className="text-[26px] font-extrabold tracking-tight">Carteirinha</h1>
        <div className="c-card p-5 text-[14px] font-medium text-[var(--c-gray)]">
          A carteirinha é para quem já é membro. Fale com a secretaria se a sua situação estiver
          errada.
        </div>
        <Link to={to('/eu')} className="block text-center font-extrabold text-[var(--c-blue)]">
          Voltar
        </Link>
      </div>
    )
  }

  const checkUrl = `${window.location.origin}${cardCheckPath(card.code)}`
  const logo = site.logo_url ? siteFileUrl(site.logo_url) : ''

  const saveImage = async () => {
    // Imagem simples da carteirinha (nome, situação e QR) para guardar no celular
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1500
    const g = canvas.getContext('2d')
    if (!g) return
    const navy = getComputedStyle(document.querySelector('.site-c') || document.body)
      .getPropertyValue('--c-navy')
      .trim()
    g.fillStyle = navy || '#14223a'
    g.fillRect(0, 0, 1080, 1500)
    g.fillStyle = '#ffffff'
    g.font = '800 44px Manrope, sans-serif'
    g.fillText(card.church_name.toUpperCase().slice(0, 40), 80, 150)
    g.font = '800 84px Manrope, sans-serif'
    g.fillText(p.name.slice(0, 22), 80, 300)
    g.font = '600 46px Manrope, sans-serif'
    g.fillText(
      [MEMBER_STATUS_LABEL[p.status], card.roll_number && `Rol nº ${card.roll_number}`]
        .filter(Boolean)
        .join(' · '),
      80,
      380,
    )
    g.fillText(`Membro desde ${brDate(card.member_since)}`, 80, 450)
    const qr = await QRCode.toDataURL(checkUrl, { width: 640, margin: 2 })
    const img = new Image()
    img.onload = () => {
      g.drawImage(img, 220, 600, 640, 640)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = 'carteirinha.png'
      a.click()
    }
    img.src = qr
  }

  const declaration = site.whatsapp
    ? whatsappUrl(site.whatsapp, `Olá! Sou ${p.name} e preciso de uma declaração de membro.`)
    : ''

  return (
    <div className="-mt-2 min-h-[80vh] bg-[var(--c-navy)] px-4 pb-10 pt-4 lg:mt-6 lg:rounded-3xl">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-3 text-[var(--sp-text)]">
          <Link
            to={to('/eu')}
            aria-label="Fechar"
            className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white/15"
          >
            <X className="h-5 w-5" />
          </Link>
          <h1 className="text-[24px] font-extrabold tracking-tight">Carteirinha</h1>
        </div>
        <div className="overflow-hidden rounded-[28px] bg-white">
          <div className="relative overflow-hidden bg-[radial-gradient(120%_140%_at_100%_0%,color-mix(in_srgb,var(--c-blue)_80%,white)_0%,var(--c-navy)_60%)] p-5 text-white">
            <div className="flex items-center gap-2 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-white/80">
              {logo && (
                <img
                  src={logo}
                  alt=""
                  className="h-7 w-7 rounded-full bg-white object-contain p-0.5"
                />
              )}
              <span className="truncate">{card.church_name}</span>
            </div>
            <p className="mt-5 text-[24px] font-extrabold leading-tight">{p.name}</p>
            <p className="text-[13px] font-semibold text-white/80">
              {[MEMBER_STATUS_LABEL[p.status], card.roll_number && `Rol nº ${card.roll_number}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-5 py-4">
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-gray)]">Membro desde</p>
              <b className="text-[15px]">{brDate(card.member_since)}</b>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-gray)]">Congregação</p>
              <b className="text-[15px]">{p.congregation || '—'}</b>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-gray)]">Nascimento</p>
              <b className="text-[15px]">{brDate(p.birth_date)}</b>
            </div>
          </div>
          <div className="flex justify-center">
            <QrCodeImage url={checkUrl} size={150} alt="QR de verificação da carteirinha" />
          </div>
          <p className="px-6 pb-5 pt-2 text-center text-[12.5px] font-medium text-[var(--c-gray)]">
            O QR confirma na hora se a carteirinha é válida
          </p>
        </div>
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={saveImage}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[13.5px] font-extrabold text-[var(--c-navy)]"
          >
            <Download className="h-4 w-4" /> Salvar imagem
          </button>
          {declaration && (
            <a
              href={declaration}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[13.5px] font-extrabold text-[var(--c-navy)]"
            >
              <FileText className="h-4 w-4" /> Pedir declaração
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
