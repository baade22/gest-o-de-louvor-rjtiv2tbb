import { useEffect } from 'react'

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap'

/** Carrega a letra Manrope só nas telas públicas da igreja (o painel continua com a letra dele). */
export function useSiteFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return
    const link = Object.assign(document.createElement('link'), {
      rel: 'stylesheet',
      href: FONT_HREF,
    })
    document.head.appendChild(link)
  }, [])
}
