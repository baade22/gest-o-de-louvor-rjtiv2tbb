// Página simples do site (Quem somos, Ministérios...): texto com títulos (#) e listas (-).

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { parseBlocks } from '@/lib/site'
import { getPublicPage } from '@/services/site'
import { useSite } from './siteContext'
import { Card, SectionTitle } from './siteParts'

export default function SitePage() {
  const { page = '' } = useParams()
  const { slug } = useSite()
  const [data, setData] = useState<{ title: string; body: string } | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setData(null)
    setMissing(false)
    getPublicPage(page, slug || undefined)
      .then(setData)
      .catch(() => setMissing(true))
  }, [page, slug])

  if (missing) {
    return <p className="px-4 pt-10 text-center text-slate-500">Página não encontrada.</p>
  }
  if (!data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }
  return (
    <div className="space-y-5 px-4 pt-5 lg:px-8 lg:pt-10">
      <SectionTitle>{data.title}</SectionTitle>
      <Card className="space-y-4 p-5 text-[15px] leading-relaxed text-slate-700 lg:p-8 lg:text-base">
        {parseBlocks(data.body).map((b, i) =>
          b.kind === 'h' ? (
            <h3 key={i} className="pt-2 font-serif text-lg font-bold text-slate-900 lg:text-xl">
              {b.text}
            </h3>
          ) : b.kind === 'ul' ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{b.text}</p>
          ),
        )}
      </Card>
    </div>
  )
}
