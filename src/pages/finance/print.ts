// Impressão das folhas do Financeiro (relatórios e informes), sem o resto da página,
// e download das planilhas.

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Imprime só a folha (ou as folhas), num iframe com os estilos da página. */
export function printSheet(sheet: HTMLElement, title: string) {
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
      '<style>@page{size:A4;margin:14mm}body{background:#fff}</style></head>' +
      `<body>${sheet.outerHTML}</body></html>`,
  )
  doc.close()
  const go = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }
  // Espera as folhas de estilo externas carregarem antes de imprimir.
  setTimeout(go, 400)
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
