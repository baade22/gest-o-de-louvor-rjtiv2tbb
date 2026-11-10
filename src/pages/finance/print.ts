// Impressão das folhas do Financeiro (relatórios e informes), sem o resto da página,
// e download das planilhas.

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const cssText = (text: string) => text.replace(/["\\\n]/g, ' ')

export interface PrintOptions {
  /** Folha deitada (relatórios com muitas colunas). */
  landscape?: boolean
  /** Rodapé de toda página, como nos relatórios do Eklesia: nome à esquerda e "Página X de Y". */
  footer?: string
}

/** Imprime só a folha (ou as folhas), num iframe com os estilos da página. */
export function printSheet(sheet: HTMLElement, title: string, options: PrintOptions = {}) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((el) => el.outerHTML)
    .join('')
  doc.open()
  doc.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${styles}` +
      `<style>${pageCss(options)}</style></head>` +
      `<body>${sheet.outerHTML}</body></html>`,
  )
  doc.close()
  const go = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }
  // Espera as folhas de estilo externas e as imagens (logo) carregarem antes de imprimir.
  setTimeout(() => {
    const images = [...doc.images].filter((img) => !img.complete)
    if (!images.length) return go()
    let left = images.length
    const done = () => --left <= 0 && go()
    for (const img of images) {
      img.addEventListener('load', done)
      img.addEventListener('error', done)
    }
    setTimeout(go, 3000)
  }, 400)
}

function pageCss({ landscape, footer }: PrintOptions) {
  const box = 'font:7.5pt Arial,Helvetica,sans-serif;color:#333'
  const margins = footer
    ? `@bottom-left{content:"${cssText(footer)}";${box}}` +
      `@bottom-center{content:"LouvorFlow - Gestão para igrejas";${box}}` +
      `@bottom-right{content:"Página " counter(page) " de " counter(pages);${box}}`
    : ''
  return (
    `@page{size:A4${landscape ? ' landscape' : ''};margin:${footer ? '10mm 10mm 14mm' : '14mm'};${margins}}` +
    'body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '[data-sheet]{max-width:none!important;margin:0!important;padding:0!important}' +
    'thead{display:table-header-group}tr{break-inside:avoid}'
  )
}

/** Baixa um texto (planilha CSV) como arquivo. */
export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
