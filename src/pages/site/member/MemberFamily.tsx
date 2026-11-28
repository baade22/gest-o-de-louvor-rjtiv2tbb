// Minha família: os vínculos da ficha (Membros) e o pedido para incluir um familiar, que vai
// para a secretaria aprovar como os cadastros do QR. Ao aprovar, o vínculo é criado sozinho.

import { useState } from 'react'
import { Clock, Loader2, Plus, UsersRound, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { familyLine, formatPhoneInput, MEMBER_STATUS_LABEL } from '@/lib/memberArea'
import { RELATION_KIND_LABELS } from '@/lib/membership'
import type { RelationKind } from '@/types'
import { memberError, requestFamilyMember } from '@/services/member'
import { useSite } from '../siteContext'
import { Avatar, BackTitle, Label, Spinner, useMemberMe } from './memberParts'

const inputCls =
  'h-[50px] w-full rounded-2xl border-[1.5px] border-[var(--c-line)] bg-white px-4 text-[15.5px] font-semibold outline-none focus:border-[var(--c-blue)] focus:shadow-[0_0_0_4px_var(--c-sky)]'

export default function MemberFamily() {
  const { slug } = useSite()
  const { toast } = useToast()
  const { me, loading, reload } = useMemberMe()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    kind: 'FILHO',
    birth_date: '',
    gender: '',
    phone: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (loading || !me) return <Spinner />
  const p = me.profile

  const send = async () => {
    setError('')
    if (form.name.trim().split(/\s+/).length < 2) return setError('Informe o nome completo.')
    setBusy(true)
    try {
      await requestFamilyMember(slug, form)
      toast({
        title: 'Pedido enviado',
        description: 'A secretaria confere e inclui na sua família.',
      })
      setOpen(false)
      setForm({ name: '', kind: 'FILHO', birth_date: '', gender: '', phone: '' })
      reload()
    } catch (err) {
      setError(memberError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pt-2 lg:pt-10">
      <BackTitle>Minha família</BackTitle>

      <div className="c-card mt-2 divide-y divide-[#eef1f5] py-1">
        <div className="flex items-center gap-3.5 px-4 py-3">
          <Avatar name={p.name} />
          <span className="flex-1">
            <b className="block text-[15px] font-bold">{p.name}</b>
            <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
              Você{MEMBER_STATUS_LABEL[p.status] ? ` · ${MEMBER_STATUS_LABEL[p.status]}` : ''}
            </span>
          </span>
        </div>
        {me.family.map((f, i) => (
          <div key={f.id} className="flex items-center gap-3.5 px-4 py-3">
            <Avatar name={f.name} tone={i + 1} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[15px] font-bold">{f.name}</b>
              <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
                {familyLine(f)}
                {f.has_app ? ' · usa o app' : ''}
              </span>
            </span>
          </div>
        ))}
        {me.pending_family.map((f) => (
          <div key={f.name} className="flex items-center gap-3.5 px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fcf3e1] text-[#b7791f]">
              <Clock className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[15px] font-bold">{f.name}</b>
              <span className="block text-[12.5px] font-medium text-[var(--c-gray)]">
                {RELATION_KIND_LABELS[f.kind as RelationKind] || 'Familiar'} · esperando a
                secretaria
              </span>
            </span>
          </div>
        ))}
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[var(--c-line)] bg-white text-[14px] font-extrabold text-[var(--c-navy)]"
        >
          <Plus className="h-[18px] w-[18px]" /> Adicionar familiar
        </button>
      ) : (
        <div className="c-card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <b className="text-[16px] font-extrabold">Novo familiar</b>
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)}>
              <X className="h-5 w-5 text-[var(--c-gray)]" />
            </button>
          </div>
          <input
            placeholder="Nome completo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className={inputCls}
              aria-label="Parentesco"
            >
              {(Object.keys(RELATION_KIND_LABELS) as RelationKind[]).map((k) => (
                <option key={k} value={k}>
                  {RELATION_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className={inputCls}
              aria-label="Sexo"
            >
              <option value="">Sexo</option>
              <option value="F">Feminino</option>
              <option value="M">Masculino</option>
            </select>
          </div>
          <label className="block">
            <span className="mx-1 mb-1.5 block text-[12.5px] font-bold text-[var(--c-gray)]">
              Nascimento
            </span>
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              className={inputCls}
            />
          </label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="Celular (se tiver)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
            className={inputCls}
          />
          {error && <p className="text-[13px] font-bold text-[#c0392b]">{error}</p>}
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] text-[15px] font-extrabold text-[var(--sp-text)] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Enviar para a secretaria
          </button>
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--c-sky)] px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[var(--c-navy)]">
        <UsersRound className="mt-px h-[18px] w-[18px] shrink-0" />
        Um familiar novo entra como pedido para a secretaria aprovar, como o cadastro pelo QR.
        Adultos entram no app com o próprio celular.
      </div>

      <Label>Para que serve</Label>
      <div className="c-card space-y-2 p-4 text-[13.5px] font-semibold">
        <p>✓ A secretaria vê a família certa na ficha</p>
        <p>✓ Em breve: inscrever a família num evento com um toque</p>
      </div>
    </div>
  )
}
