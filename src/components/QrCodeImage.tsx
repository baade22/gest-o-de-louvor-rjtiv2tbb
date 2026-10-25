import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** QR code de um link, gerado no navegador. */
export function QrCodeImage({
  url,
  size = 160,
  alt = 'QR code',
}: {
  url: string
  size?: number
  alt?: string
}) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { width: size * 2, margin: 1 })
      .then(setSrc)
      .catch(() => setSrc(''))
  }, [url, size])
  if (!src) return <div style={{ width: size, height: size }} className="bg-slate-100 rounded-lg" />
  return <img src={src} width={size} height={size} alt={alt} className="rounded-lg" />
}

/** Baixa o QR code em PNG grande, bom para imprimir ou pôr no telão. */
export async function downloadQrPng(url: string, title: string) {
  const data = await QRCode.toDataURL(url, { width: 1024, margin: 2 })
  const a = document.createElement('a')
  a.href = data
  a.download = `qr-${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')}.png`
  a.click()
}
