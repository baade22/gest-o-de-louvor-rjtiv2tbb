import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople } from '@/services/people'
import {
  approveAsNewPerson,
  approveIntoExisting,
  createSignupLink,
  deleteSignup,
  deleteSignupLink,
  listSignupLinks,
  listSignups,
  rejectSignup,
  setSignupLinkActive,
} from '@/services/signups'
import type { Person, PersonSignup, PersonStatus, SignupLink } from '@/types'
import {
  RELATIONSHIP_LABELS,
  SUGGESTED_STATUS,
  findDuplicates,
  signupUrl,
  type DuplicateMatch,
} from '@/lib/signups'
import {
  CONGREGATIONS,
  MARITAL_STATUS_LABELS,
  PERSON_STATUS_LABELS,
  PERSON_STATUS_ORDER,
  ageOn,
} from '@/lib/membership'
import { formatCalendarDateDisplay, getLocalTodayYMD } from '@/lib/dateUtils'
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  Merge,
  Plus,
  QrCode,
  Trash2,
  UserPlus,
  X,
  History,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { QrCodeImage, downloadQrPng } from '@/components/QrCodeImage'
import { StatusBadge, errorMessage } from './shared'

const NONE = '__none__'

function createdOn(signup: PersonSignup): string {
  return formatCalendarDateDisplay(signup.created.slice(0, 10))
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="text-sm">
      <span className="text-slate-500">{label}: </span>
      <span className="text-slate-800">{value}</span>
    </div>
  )
}

function SignupCard({
  signup,
  duplicates,
  onApprove,
  onMerge,
  onReject,
}: {
  signup: PersonSignup
  duplicates: DuplicateMatch[]
  onApprove: () => void
  onMerge: (p: Person) => void
  onReject: () => void
}) {
  const today = getLocalTodayYMD()
  const age = ageOn(signup.birth_date, today)
  const address = [signup.address, signup.neighborhood, signup.city, signup.state]
    .filter(Boolean)
    .join(', ')
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">{signup.name}</h3>
          <p className="text-xs text-slate-500">Enviado em {createdOn(signup)}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="text-[11px] bg-amber-50 text-amber-800 border-amber-200"
          >
            {RELATIONSHIP_LABELS[signup.relationship]}
          </Badge>
          {signup.congregation && (
            <Badge variant="outline" className="text-[11px]">
              {signup.congregation}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
        <Info label="Telefone" value={signup.phone} />
        <Info label="E-mail" value={signup.email} />
        <Info
          label="Nascimento"
          value={
            signup.birth_date
              ? `${formatCalendarDateDisplay(signup.birth_date, 'numeric')}${age !== null ? ` · ${age} anos` : ''}`
              : ''
          }
        />
        <Info
          label="Estado civil"
          value={signup.marital_status ? MARITAL_STATUS_LABELS[signup.marital_status] : ''}
        />
        <Info label="Endereço" value={address} />
        <Info label="Batizado(a)" value={signup.baptized ? 'Sim' : ''} />
        <Info label="Como conheceu" value={signup.how_found} />
      </div>
      {signup.prayer_request && (
        <div className="text-sm bg-violet-50 border border-violet-100 rounded-xl p-3 text-violet-900">
          <span className="font-semibold">Pedido de oração: </span>
          {signup.prayer_request}
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Parece que já tem ficha
          </p>
          {duplicates.map((d) => (
            <div key={d.person.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                to={`/membros/${d.person.id}`}
                className="font-medium text-slate-900 hover:underline"
              >
                {d.person.name}
              </Link>
              <StatusBadge status={d.person.status} />
              <span className="text-xs text-amber-800">mesmo {d.reasons.join(', ')}</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-8 rounded-lg bg-white gap-1.5"
                onClick={() => onMerge(d.person)}
              >
                <Merge className="h-3.5 w-3.5" />
                Juntar com esta ficha
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" className="rounded-xl gap-1.5" onClick={onReject}>
          <X className="h-4 w-4" />
          Recusar
        </Button>
        <Button className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800" onClick={onApprove}>
          <UserPlus className="h-4 w-4" />
          {duplicates.length ? 'Criar ficha nova mesmo assim' : 'Aprovar e criar ficha'}
        </Button>
      </div>
    </div>
  )
}

function LinkCard({
  link,
  onToggle,
  onDelete,
}: {
  link: SignupLink
  onToggle: (active: boolean) => void
  onDelete: () => void
}) {
  const { toast } = useToast()
  const url = signupUrl(link.key)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copiado', description: 'Cole no WhatsApp ou no Instagram da igreja.' })
    } catch {
      toast({ title: 'Não deu para copiar', description: url })
    }
  }
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row gap-5 ${
        link.active ? '' : 'opacity-60'
      }`}
    >
      <div className="self-center sm:self-start">
        <QrCodeImage url={url} alt="QR code do cadastro" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">{link.title}</h3>
            <p className="text-xs text-slate-500">
              {link.congregation ? `Congregação ${link.congregation}` : 'Qualquer congregação'}
            </p>
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs font-medium text-slate-600 shrink-0">
            {link.active ? 'Ativo' : 'Desligado'}
            <Switch checked={link.active} onCheckedChange={onToggle} aria-label="Link ativo" />
          </label>
        </div>
        <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all text-slate-700">
          {url}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="rounded-lg gap-1.5" onClick={copy}>
            <Copy className="h-3.5 w-3.5" />
            Copiar link
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg gap-1.5"
            onClick={() => downloadQrPng(url, `cadastro ${link.title}`)}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar QR code
          </Button>
          <Button size="sm" variant="outline" className="rounded-lg gap-1.5" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir formulário
            </a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-lg gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Apagar
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Signups() {
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [signups, setSignups] = useState<PersonSignup[]>([])
  const [links, setLinks] = useState<SignupLink[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState('pendentes')

  const [newLinkOpen, setNewLinkOpen] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkCongregation, setLinkCongregation] = useState(NONE)

  const [approving, setApproving] = useState<PersonSignup | null>(null)
  const [approveStatus, setApproveStatus] = useState<PersonStatus>('VISITANTE')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!currentChurch) return
    try {
      const [s, l, p] = await Promise.all([
        listSignups(currentChurch.id),
        listSignupLinks(currentChurch.id),
        listPeople(currentChurch.id),
      ])
      setSignups(s)
      setLinks(l)
      setPeople(p)
    } catch (err) {
      toast({
        title: 'Erro ao carregar',
        description: errorMessage(err, 'Não foi possível abrir os cadastros.'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentChurch, toast])

  useEffect(() => {
    load()
  }, [load])

  const pending = useMemo(() => signups.filter((s) => s.status === 'PENDENTE'), [signups])
  const reviewed = useMemo(() => signups.filter((s) => s.status !== 'PENDENTE'), [signups])
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const openApprove = (s: PersonSignup) => {
    setApproveStatus(SUGGESTED_STATUS[s.relationship])
    setApproving(s)
  }

  const approve = async () => {
    if (!approving) return
    setBusy(true)
    try {
      const person = await approveAsNewPerson(approving, approveStatus)
      toast({
        title: 'Ficha criada',
        description: `${person.name} entrou como ${PERSON_STATUS_LABELS[approveStatus]}.`,
      })
      setApproving(null)
      await load()
    } catch (err) {
      toast({
        title: 'Não foi possível aprovar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const merge = (s: PersonSignup, p: Person) =>
    confirm({
      title: `Juntar com a ficha de ${p.name}?`,
      description:
        'Os campos vazios da ficha são preenchidos com o que a pessoa enviou. Nada do que já está na ficha é apagado.',
      confirmLabel: 'Juntar',
      onConfirm: async () => {
        await approveIntoExisting(s, p)
        toast({
          title: 'Ficha atualizada',
          description: `${p.name} foi completada com o cadastro.`,
        })
        await load()
      },
    })

  const reject = (s: PersonSignup) =>
    confirm({
      title: `Recusar o cadastro de ${s.name}?`,
      description: 'Nenhuma ficha é criada. O cadastro fica no histórico até você apagar.',
      confirmLabel: 'Recusar',
      destructive: true,
      onConfirm: async () => {
        await rejectSignup(s.id)
        await load()
      },
    })

  const removeSignup = (s: PersonSignup) =>
    confirm({
      title: 'Apagar do histórico?',
      description: `O cadastro enviado por ${s.name} é apagado. Se virou ficha, a ficha continua.`,
      confirmLabel: 'Apagar',
      destructive: true,
      onConfirm: async () => {
        await deleteSignup(s.id)
        await load()
      },
    })

  const createLink = async () => {
    if (!currentChurch || !linkTitle.trim()) return
    setBusy(true)
    try {
      await createSignupLink(
        currentChurch.id,
        linkTitle.trim(),
        linkCongregation === NONE ? '' : linkCongregation,
      )
      setNewLinkOpen(false)
      setLinkTitle('')
      setLinkCongregation(NONE)
      await load()
    } catch (err) {
      toast({
        title: 'Não foi possível criar o link',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleLink = async (link: SignupLink, active: boolean) => {
    try {
      await setSignupLinkActive(link.id, active)
      await load()
    } catch (err) {
      toast({
        title: 'Erro',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    }
  }

  const removeLink = (link: SignupLink) =>
    confirm({
      title: `Apagar o link "${link.title}"?`,
      description:
        'O QR code impresso para de funcionar. Os cadastros que já chegaram por ele continuam aqui.',
      confirmLabel: 'Apagar link',
      destructive: true,
      onConfirm: async () => {
        await deleteSignupLink(link.id)
        await load()
      },
    })

  const tabs: Array<[string, string, LucideIcon, number]> = [
    ['pendentes', 'Aguardando', Inbox, pending.length],
    ['links', 'Links e QR codes', QrCode, links.length],
    ['historico', 'Já analisados', History, reviewed.length],
  ]

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Cadastros pelo QR code
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            A pessoa preenche a ficha no celular; a ficha só entra no rol depois que você aprova.
          </p>
        </div>
        <Button
          className="sm:ml-auto rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
          onClick={() => setNewLinkOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Novo QR code
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-full min-w-max justify-start gap-1 rounded-none border-b border-slate-200 bg-transparent p-0">
            {tabs.map(([value, label, Icon, count]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-slate-500 data-[state=active]:border-teal-600 data-[state=active]:text-teal-800 data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
                {count > 0 && (
                  <span
                    className={`text-[11px] rounded-full px-1.5 ${
                      value === 'pendentes'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="pendentes" className="mt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-2">
              <Inbox className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="font-semibold text-slate-800">Nenhum cadastro esperando</p>
              <p className="text-sm text-slate-500">
                {links.length === 0
                  ? 'Crie um QR code e coloque no telão, no mural ou no grupo da igreja.'
                  : 'Quando alguém preencher o formulário, aparece aqui.'}
              </p>
              {links.length === 0 && (
                <Button
                  variant="outline"
                  className="rounded-xl mt-2"
                  onClick={() => setNewLinkOpen(true)}
                >
                  Criar QR code
                </Button>
              )}
            </div>
          ) : (
            pending.map((s) => (
              <SignupCard
                key={s.id}
                signup={s}
                duplicates={findDuplicates(s, people)}
                onApprove={() => openApprove(s)}
                onMerge={(p) => merge(s, p)}
                onReject={() => reject(s)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="links" className="mt-4 space-y-4">
          {links.length === 0 && !isLoading && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-2">
              <QrCode className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="font-semibold text-slate-800">Nenhum QR code ainda</p>
              <p className="text-sm text-slate-500">
                Dica: um por congregação, assim a ficha já chega com a congregação certa.
              </p>
            </div>
          )}
          {links.map((l) => (
            <LinkCard
              key={l.id}
              link={l}
              onToggle={(a) => toggleLink(l, a)}
              onDelete={() => removeLink(l)}
            />
          ))}
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
            {reviewed.length === 0 && (
              <p className="p-6 text-sm text-slate-500 text-center">Nada analisado ainda.</p>
            )}
            {reviewed.map((s) => {
              const person = s.person_id ? peopleById.get(s.person_id) : undefined
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      Enviado em {createdOn(s)} · {RELATIONSHIP_LABELS[s.relationship]}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {s.status === 'APROVADO' ? (
                      <Badge
                        variant="outline"
                        className="text-[11px] bg-emerald-50 text-emerald-800 border-emerald-200 gap-1"
                      >
                        <Check className="h-3 w-3" />
                        Aprovado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] bg-slate-100 text-slate-600">
                        Recusado
                      </Badge>
                    )}
                    {person && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                        onClick={() => navigate(`/membros/${person.id}`)}
                      >
                        Ver ficha
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                      aria-label="Apagar do histórico"
                      onClick={() => removeSignup(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={newLinkOpen} onOpenChange={setNewLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo QR code de cadastro</DialogTitle>
            <DialogDescription>
              Quem escanear abre a ficha no celular. Você pode desligar o link quando quiser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="link-title" className="text-xs font-semibold">
                Nome do QR code
              </Label>
              <Input
                id="link-title"
                placeholder="Ex: Mural da Aldeia, Culto de domingo"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                className="rounded-xl"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-cong" className="text-xs font-semibold">
                Congregação
              </Label>
              <Select value={linkCongregation} onValueChange={setLinkCongregation}>
                <SelectTrigger id="link-cong" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>A pessoa escolhe</SelectItem>
                  {CONGREGATIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewLinkOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={createLink}
              disabled={busy || !linkTitle.trim()}
              className="bg-teal-700 hover:bg-teal-800"
            >
              Criar QR code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar {approving?.name}</DialogTitle>
            <DialogDescription>
              Uma ficha nova é criada com os dados enviados. Escolha a situação de entrada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="approve-status" className="text-xs font-semibold">
              Situação
            </Label>
            <Select
              value={approveStatus}
              onValueChange={(v) => setApproveStatus(v as PersonStatus)}
            >
              <SelectTrigger id="approve-status" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_STATUS_ORDER.filter((s) =>
                  ['MEMBRO', 'CONGREGADO', 'VISITANTE'].includes(s),
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {PERSON_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {approving?.relationship === 'MEMBRO' && (
              <p className="text-xs text-slate-500">
                A pessoa disse que já é membro. Confira no rol antes de aprovar como Membro.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>
              Cancelar
            </Button>
            <Button onClick={approve} disabled={busy} className="bg-teal-700 hover:bg-teal-800">
              Criar ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
