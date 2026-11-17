// Bíblia do site/app da igreja: livros, referência ("Jo 3:16") e leitura dos arquivos estáticos
// em public/biblia/blivre (Bíblia Livre, CC BY 4.0 Brasil; ver LEIA-ME.txt na pasta).

export interface BibleBook {
  /** código do arquivo (eBible) */
  code: string
  /** código USFM usado pelo Bible.com */
  usfm: string
  name: string
  abbr: string
  chapters: number
  /** true = Novo Testamento */
  nt: boolean
}

const B = (code: string, usfm: string, name: string, abbr: string, chapters: number, nt = false) => ({
  code,
  usfm,
  name,
  abbr,
  chapters,
  nt,
})

export const BIBLE_BOOKS: BibleBook[] = [
  B('GEN', 'GEN', 'Gênesis', 'Gn', 50),
  B('EXO', 'EXO', 'Êxodo', 'Êx', 40),
  B('LEV', 'LEV', 'Levítico', 'Lv', 27),
  B('NUM', 'NUM', 'Números', 'Nm', 36),
  B('DEU', 'DEU', 'Deuteronômio', 'Dt', 34),
  B('JOS', 'JOS', 'Josué', 'Js', 24),
  B('JDG', 'JDG', 'Juízes', 'Jz', 21),
  B('RUT', 'RUT', 'Rute', 'Rt', 4),
  B('1SA', '1SA', '1 Samuel', '1Sm', 31),
  B('2SA', '2SA', '2 Samuel', '2Sm', 24),
  B('1KI', '1KI', '1 Reis', '1Rs', 22),
  B('2KI', '2KI', '2 Reis', '2Rs', 25),
  B('1CH', '1CH', '1 Crônicas', '1Cr', 29),
  B('2CH', '2CH', '2 Crônicas', '2Cr', 36),
  B('EZR', 'EZR', 'Esdras', 'Ed', 10),
  B('NEH', 'NEH', 'Neemias', 'Ne', 13),
  B('EST', 'EST', 'Ester', 'Et', 10),
  B('JOB', 'JOB', 'Jó', 'Jó', 42),
  B('PSA', 'PSA', 'Salmos', 'Sl', 150),
  B('PRO', 'PRO', 'Provérbios', 'Pv', 31),
  B('ECC', 'ECC', 'Eclesiastes', 'Ec', 12),
  B('SOL', 'SNG', 'Cânticos', 'Ct', 8),
  B('ISA', 'ISA', 'Isaías', 'Is', 66),
  B('JER', 'JER', 'Jeremias', 'Jr', 52),
  B('LAM', 'LAM', 'Lamentações', 'Lm', 5),
  B('EZE', 'EZK', 'Ezequiel', 'Ez', 48),
  B('DAN', 'DAN', 'Daniel', 'Dn', 12),
  B('HOS', 'HOS', 'Oseias', 'Os', 14),
  B('JOE', 'JOL', 'Joel', 'Jl', 3),
  B('AMO', 'AMO', 'Amós', 'Am', 9),
  B('OBA', 'OBA', 'Obadias', 'Ob', 1),
  B('JON', 'JON', 'Jonas', 'Jn', 4),
  B('MIC', 'MIC', 'Miqueias', 'Mq', 7),
  B('NAH', 'NAM', 'Naum', 'Na', 3),
  B('HAB', 'HAB', 'Habacuque', 'Hc', 3),
  B('ZEP', 'ZEP', 'Sofonias', 'Sf', 3),
  B('HAG', 'HAG', 'Ageu', 'Ag', 2),
  B('ZEC', 'ZEC', 'Zacarias', 'Zc', 14),
  B('MAL', 'MAL', 'Malaquias', 'Ml', 4),
  B('MAT', 'MAT', 'Mateus', 'Mt', 28, true),
  B('MAR', 'MRK', 'Marcos', 'Mc', 16, true),
  B('LUK', 'LUK', 'Lucas', 'Lc', 24, true),
  B('JOH', 'JHN', 'João', 'Jo', 21, true),
  B('ACT', 'ACT', 'Atos', 'At', 28, true),
  B('ROM', 'ROM', 'Romanos', 'Rm', 16, true),
  B('1CO', '1CO', '1 Coríntios', '1Co', 16, true),
  B('2CO', '2CO', '2 Coríntios', '2Co', 13, true),
  B('GAL', 'GAL', 'Gálatas', 'Gl', 6, true),
  B('EPH', 'EPH', 'Efésios', 'Ef', 6, true),
  B('PHI', 'PHP', 'Filipenses', 'Fp', 4, true),
  B('COL', 'COL', 'Colossenses', 'Cl', 4, true),
  B('1TH', '1TH', '1 Tessalonicenses', '1Ts', 5, true),
  B('2TH', '2TH', '2 Tessalonicenses', '2Ts', 3, true),
  B('1TI', '1TI', '1 Timóteo', '1Tm', 6, true),
  B('2TI', '2TI', '2 Timóteo', '2Tm', 4, true),
  B('TIT', 'TIT', 'Tito', 'Tt', 3, true),
  B('PHM', 'PHM', 'Filemom', 'Fm', 1, true),
  B('HEB', 'HEB', 'Hebreus', 'Hb', 13, true),
  B('JAM', 'JAS', 'Tiago', 'Tg', 5, true),
  B('1PE', '1PE', '1 Pedro', '1Pe', 5, true),
  B('2PE', '2PE', '2 Pedro', '2Pe', 3, true),
  B('1JO', '1JN', '1 João', '1Jo', 5, true),
  B('2JO', '2JN', '2 João', '2Jo', 1, true),
  B('3JO', '3JN', '3 João', '3Jo', 1, true),
  B('JUD', 'JUD', 'Judas', 'Jd', 1, true),
  B('REV', 'REV', 'Apocalipse', 'Ap', 22, true),
]

export const BIBLE_CREDIT =
  'Bíblia Livre (BLIVRE), © Diego Santos, Mario Sérgio e Marco Teles, fevereiro de 2018. ' +
  'Licença Creative Commons Atribuição 4.0 Brasil.'

/** Outras versões, abertas no Bible.com (o texto delas tem dono e não pode ir para o app). */
export const OTHER_VERSIONS = [
  { id: 129, label: 'NVI' },
  { id: 1608, label: 'ARA' },
  { id: 212, label: 'ARC' },
  { id: 1840, label: 'NAA' },
  { id: 1930, label: 'NVT' },
]

export function bibleComUrl(versionId: number, book: BibleBook, chapter: number): string {
  return `https://www.bible.com/pt/bible/${versionId}/${book.usfm}.${chapter}`
}

/** Sem acento, minúsculo e sem espaço: "1 Coríntios" -> "1corintios". */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function findBook(codeOrName: string): BibleBook | undefined {
  const k = fold(codeOrName)
  if (!k) return undefined
  // Com acento primeiro: "jo" é João e "jó" é Jó.
  const lower = codeOrName.toLowerCase().replace(/\s+/g, '')
  const exact = (s: string) => s.toLowerCase().replace(/\s+/g, '') === lower
  return (
    BIBLE_BOOKS.find((b) => exact(b.abbr) || exact(b.name)) ||
    BIBLE_BOOKS.find((b) => fold(b.code) === k || fold(b.abbr) === k || fold(b.name) === k) ||
    // começo do nome: "gen", "apoc", "1cor"
    (k.length >= 2 ? BIBLE_BOOKS.find((b) => fold(b.name).startsWith(k)) : undefined)
  )
}

export interface BibleRef {
  book: BibleBook
  chapter: number
  verse?: number
}

/** "Jo 3:16", "joão 3 16", "Sl 23", "1 Co 13.4", "apocalipse" -> referência; senão null. */
export function parseRef(input: string): BibleRef | null {
  const m = /^\s*([1-3]?\s*[^\d\s:.,]+(?:\s+[^\d\s:.,]+)*)\s*(?:(\d+)(?:\s*[:.,\s]\s*(\d+))?)?\s*$/.exec(
    input,
  )
  if (!m) return null
  const book = findBook(m[1])
  if (!book) return null
  const chapter = m[2] ? Number(m[2]) : 1
  if (chapter < 1 || chapter > book.chapters) return null
  const verse = m[3] ? Number(m[3]) : undefined
  return { book, chapter, verse: verse && verse > 0 ? verse : undefined }
}

/** Divide o versículo em trechos normais e [acréscimos da tradução]. */
export function verseParts(text: string): { text: string; added: boolean }[] {
  const out: { text: string; added: boolean }[] = []
  const re = /\[([^\]]*)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), added: false })
    out.push({ text: m[1], added: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), added: false })
  return out
}

const cache = new Map<string, Promise<string[][]>>()

/** Capítulos do livro (lista de versículos). Fica em memória depois da primeira leitura. */
export function loadBook(code: string): Promise<string[][]> {
  let p = cache.get(code)
  if (!p) {
    p = fetch(`/biblia/blivre/${code}.json`).then((r) => {
      if (!r.ok) throw new Error('Não foi possível abrir o livro.')
      return r.json() as Promise<string[][]>
    })
    p.catch(() => cache.delete(code))
    cache.set(code, p)
  }
  return p
}

export interface SearchHit {
  book: BibleBook
  chapter: number
  verse: number
  text: string
}

/** Busca palavra(s) em toda a Bíblia (todas as palavras precisam aparecer no versículo). */
export async function searchBible(query: string, limit = 100): Promise<SearchHit[]> {
  const words = query
    .split(/\s+/)
    .map((w) => fold(w))
    .filter((w) => w.length >= 2)
  if (!words.length) return []
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  // A frase exata vem primeiro; depois os versículos que têm todas as palavras
  const phrase = norm(query.trim()).replace(/\s+/g, ' ')
  const books = await Promise.all(BIBLE_BOOKS.map((b) => loadBook(b.code).then((c) => [b, c] as const)))
  const exact: SearchHit[] = []
  const loose: SearchHit[] = []
  for (const [book, chapters] of books) {
    for (let c = 0; c < chapters.length; c++) {
      for (let v = 0; v < chapters[c].length; v++) {
        const t = norm(chapters[c][v].replace(/[[\]]/g, ''))
        if (!words.every((w) => t.includes(w))) continue
        const hit = { book, chapter: c + 1, verse: v + 1, text: chapters[c][v] }
        if (t.includes(phrase)) exact.push(hit)
        else loose.push(hit)
      }
    }
  }
  return exact.concat(loose).slice(0, limit)
}
