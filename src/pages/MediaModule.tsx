import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Image as ImageIcon, ArrowLeft, ShieldCheck, Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'

export default function MediaModule() {
  const { currentChurch } = useAuth()
  const [backendAllowed, setBackendAllowed] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const churchId = currentChurch?.id || ''
        const res = await pb.send<{ allowed: boolean; message?: string }>(
          `/backend/v1/modules/access?module=media&church_id=${churchId}`,
          { method: 'GET' },
        )
        setBackendAllowed(res.allowed)
      } catch (err: any) {
        setBackendAllowed(false)
        setErrorMsg(err.data?.message || err.message || 'Acesso negado pelo backend')
      }
    }
    checkBackend()
  }, [currentChurch?.id])

  if (backendAllowed === false) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-red-600">Acesso Bloqueado pelo Servidor</h2>
        <p className="text-sm text-slate-600">{errorMsg}</p>
        <Link to="/dashboard">
          <Button variant="outline">Voltar ao Início</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Início
        </Link>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
          Módulo Operacional • Mídias & Artes
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <ImageIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Gestão de Mídias
          </h1>
          <p className="text-sm text-slate-500">
            Painel da equipe de comunicação visual de <strong>{currentChurch?.name}</strong>.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Film className="h-5 w-5 text-emerald-600" />
            Módulo em preparação
          </CardTitle>
          <CardDescription>
            Acesso reservado aos operadores de Mídia, Projeção e perfil MASTER.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-2">
            <p className="font-semibold text-slate-800">Módulo disponível em breve</p>
            <p>
              Neste módulo ficarão disponíveis fundos de vídeo, artes promocionais de eventos,
              vinhetas e avisos da igreja para os cultos.
            </p>
            <div className="flex items-center gap-2 text-emerald-700 font-medium pt-1">
              <ShieldCheck className="h-4 w-4" />
              <span>Validação de permissão (MIDIA / MASTER) confirmada pelo backend.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
