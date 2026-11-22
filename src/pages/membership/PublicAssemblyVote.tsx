import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertCircle, Check, Vote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getVoteInfo, submitVote, type VoteInfo } from '@/services/assemblies'
import { dateNumeric, formatCPF, isValidCPF, type OnlineChoice } from '@/lib/assemblies'

const inputClass = 'rounded-xl border-slate-200 h-11 text-base sm:text-sm'

const CHOICES: Array<[OnlineChoice, string, string]> = [
  ['SIM', 'SIM', 'Aprovo a chapa'],
  ['NAO', 'NÃO', 'Não aprovo a chapa'],
  ['ABSTENCAO', 'ABSTENÇÃO', 'Não quero votar nem sim nem não'],
]

/** Página pública: o membro vota na chapa da assembleia (link enviado pela secretaria). */
export default function PublicAssemblyVote() {
  const { key = '' } = useParams<{ key: string }>()
  const [info, setInfo] = useState<VoteInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({ name: '', cpf: '', birth_date: '', website: '' })
  const [choice, setChoice] = useState<OnlineChoice | ''>('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    getVoteInfo(key).then((r) => ('title' in r ? setInfo(r) : setLoadError(r.message)))
  }, [key])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.name.trim().split(/\s+/).length < 2) return setError('Informe o nome completo.')
    if (!isValidCPF(form.cpf)) return setError('Confira o CPF.')
    if (!form.birth_date) return setError('Informe a data de nascimento.')
    if (!choice) return setError('Escolha SIM, NÃO ou ABSTENÇÃO.')
    setSending(true)
    try {
      const r = await submitVote({ key, ...form, choice })
      setConfirmed(!!r.confirmed)
      setDone(r.first_name || 'irmão(ã)')
    } catch (err) {
      const msg = (err as { response?: { message?: string } }).response?.message
      setError(msg || 'Não foi possível registrar o voto. Tente de novo em instantes.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-5">
        {!info && !loadError && <p className="text-center text-slate-500">Carregando...</p>}

        {loadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800 flex gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{loadError}</p>
          </div>
        )}

        {info && (
          <>
            <div className="text-center space-y-1">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-teal-700 text-white flex items-center justify-center">
                <Vote className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-teal-800">{info.church_name}</p>
              <h1 className="text-2xl font-extrabold text-slate-900">{info.title}</h1>
              {info.date && (
                <p className="text-sm text-slate-500">Assembleia de {dateNumeric(info.date)}</p>
              )}
            </div>

            {info.chapa.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h2 className="font-bold text-slate-900">Chapa</h2>
                <dl className="space-y-2">
                  {info.chapa.map((c, i) => (
                    <div key={i} className="flex flex-wrap gap-x-2 text-sm">
                      <dt className="font-semibold text-slate-700">{c.office}:</dt>
                      <dd className="text-slate-900">{c.names.join(', ') || '-'}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {done ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
                <Check className="mx-auto h-8 w-8 text-emerald-700" />
                <p className="text-lg font-bold text-emerald-900">
                  {confirmed ? 'Dados confirmados' : 'Voto registrado'}. Obrigado, {done}!
                </p>
                <p className="text-sm text-emerald-800">
                  {confirmed
                    ? 'Seu voto anterior continua valendo e não foi alterado.'
                    : 'Seu voto é secreto e já foi contado.'}
                </p>
              </div>
            ) : !info.open ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                A votação está encerrada.
              </div>
            ) : (
              <form
                onSubmit={submit}
                className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4"
              >
                <p className="text-sm text-slate-600">
                  Para votar, informe seu nome completo, CPF e data de nascimento. Eles só servem
                  para garantir que cada pessoa vota uma vez e ficam registrados para a ata da
                  assembleia, sem ligação com o seu voto, que é secreto. Já votou antes? Preencha
                  seus dados de novo e escolha qualquer opção: o voto anterior não muda, só
                  completamos seus dados para a ata.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="v-name" className="text-sm font-semibold text-slate-700">
                    Nome completo
                  </Label>
                  <Input
                    id="v-name"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-cpf" className="text-sm font-semibold text-slate-700">
                      CPF
                    </Label>
                    <Input
                      id="v-cpf"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={form.cpf}
                      onChange={(e) => set('cpf', e.target.value)}
                      onBlur={() => set('cpf', formatCPF(form.cpf))}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-birth" className="text-sm font-semibold text-slate-700">
                      Data de nascimento
                    </Label>
                    <Input
                      id="v-birth"
                      type="date"
                      value={form.birth_date}
                      onChange={(e) => set('birth_date', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                {/* Campo invisível contra robôs */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={form.website}
                  onChange={(e) => set('website', e.target.value)}
                  className="hidden"
                />
                <div role="radiogroup" aria-label="Seu voto" className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">Seu voto na chapa</p>
                  {CHOICES.map(([v, label, hint]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={choice === v}
                      onClick={() => setChoice(v)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        choice === v
                          ? 'bg-teal-700 border-teal-700 text-white'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-teal-300'
                      }`}
                    >
                      <span className="font-bold">{label}</span>
                      <span
                        className={`block text-xs ${choice === v ? 'text-teal-50' : 'text-slate-500'}`}
                      >
                        {hint}
                      </span>
                    </button>
                  ))}
                </div>
                {error && (
                  <p
                    role="alert"
                    className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={sending}
                  className="w-full h-12 rounded-xl bg-teal-700 hover:bg-teal-800 text-base"
                >
                  {sending ? 'Enviando...' : 'Confirmar meu voto'}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
