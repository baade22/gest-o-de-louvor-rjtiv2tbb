// Como pôr o app da igreja na tela de início (iPhone: Safari › Compartilhar › Tela de Início;
// Android: botão "Instalar" do Chrome, quando o navegador oferece).

import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Share, SquarePlus } from 'lucide-react'
import { isIos, isStandalone } from '@/lib/site'
import { useSite } from './siteContext'
import { Card, SectionTitle } from './siteParts'
import { SiteLogo } from './PublicSiteLayout'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function SiteInstall() {
  const { site } = useSite()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())
  const ios = isIos()

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const r = await prompt.userChoice
    if (r.outcome === 'accepted') setInstalled(true)
    setPrompt(null)
  }

  return (
    <div className="space-y-5 px-4 pt-5 lg:px-8 lg:pt-10">
      <SectionTitle>Ter a igreja no celular</SectionTitle>
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="flex flex-col items-center gap-2 p-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--sp)]">
            <SiteLogo site={site} className="h-12 w-12" />
          </span>
          <p className="text-lg font-semibold">{site.short_name || site.title}</p>
          <p className="text-sm text-slate-500">
            Fica um ícone na tela de início, abre em tela cheia como um aplicativo. Não precisa
            baixar nada da loja e não ocupa espaço.
          </p>
        </Card>

        {installed ? (
          <Card className="flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" />
            <span className="font-semibold">Pronto! O app já está na sua tela de início.</span>
          </Card>
        ) : prompt ? (
          <button
            type="button"
            onClick={install}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sa)] px-4 py-3.5 font-semibold text-[var(--sa-text)]"
          >
            <Download className="h-5 w-5" /> Instalar o app
          </button>
        ) : null}

        {!installed && (
          <Card className="space-y-4">
            <p className="font-semibold">{ios ? 'No iPhone (Safari)' : 'Passo a passo'}</p>
            <Step n={1}>
              {ios ? (
                <>
                  Toque em <b>Compartilhar</b>{' '}
                  <Share className="inline h-4 w-4 align-[-2px] text-sky-600" /> na barra do Safari
                </>
              ) : (
                <>
                  Abra o menu do navegador (<b>⋮</b> no Chrome do Android ou{' '}
                  <Share className="inline h-4 w-4 align-[-2px] text-sky-600" /> no Safari do
                  iPhone)
                </>
              )}
            </Step>
            <Step n={2}>
              Escolha <b>Adicionar à Tela de Início</b>{' '}
              <SquarePlus className="inline h-4 w-4 align-[-2px]" />
              {!ios && ' ou "Instalar app"'}
            </Step>
            <Step n={3}>
              Toque em <b>Adicionar</b>. Depois é só abrir pelo ícone.
            </Step>
            {ios && (
              <p className="text-xs text-slate-500">
                Se abriu este link pelo Instagram ou WhatsApp, toque em ••• e escolha “Abrir no
                Safari” primeiro.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-100 font-bold text-[var(--sp)]">
        {n}
      </span>
      <span className="pt-1.5">{children}</span>
    </div>
  )
}
