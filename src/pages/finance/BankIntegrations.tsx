// Integrações > Bancos: credenciais das APIs da Cora e do Bradesco (client ID, segredo,
// certificado e chave privada) e a chave do conector bancário. O servidor guarda tudo cifrado e
// devolve só o resumo; quem fala com o banco continua sendo o conector (bank-sync/), que recebe
// as credenciais junto com cada conta.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Landmark,
  Pencil,
  PlugZap,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  deleteBankSecret,
  getBankSecrets,
  listBankConnections,
  newBankConnectorKey,
  saveBankGithub,
  saveBankSecret,
} from '@/services/finance'
import type {
  BankAuditEntry,
  BankSecretSet,
  BankSecretsInfo,
  FinBankConnection,
  FinBankEnvironment,
  FinBankProvider,
} from '@/types/finance'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const BANKS: Record<FinBankProvider, { name: string; product: string; how: string }> = {
  CORA: {
    name: 'Cora',
    product: 'Integração Direta',
    how: 'No app ou no Cora Web, em Integrações, peça a Integração Direta. A Cora gera o client ID, o certificado (certificate.pem) e a chave privada (private-key.key).',
  },
  BRADESCO: {
    name: 'Bradesco',
    product: 'API Saldos e Extratos',
    how: 'Pelo Portal do Desenvolvedor Bradesco ou com o gerente PJ. O banco libera o client ID e o client secret para o certificado da igreja.',
  },
}
const ENV_LABEL: Record<FinBankEnvironment, string> = {
  PRODUCAO: 'Produção',
  TESTE: 'Teste',
}

const errorText = (err: unknown) =>
  (err as { response?: { message?: string } })?.response?.message ||
  (err as Error)?.message ||
  'Tente de novo.'

const shortDate = (s?: string) =>
  s
    ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : ''

const AUDIT_LABEL: Record<BankAuditEntry['event'], string> = {
  CREDENCIAL_SALVA: 'Credencial salva',
  CREDENCIAL_APAGADA: 'Credencial apagada',
  CHAVE_NOVA: 'Chave nova do conector',
  GITHUB: 'Acesso ao GitHub',
  CONECTOR_LEU: 'Conector buscou',
  CHAVE_INVALIDA: 'Chave do conector errada',
  SENHA_ERRADA: 'Senha errada',
}

/**
 * Pede a senha do LouvorFlow de novo antes de mexer nas credenciais dos bancos.
 * ask() devolve a senha digitada, ou null se a pessoa cancelar.
 */
function usePasswordPrompt() {
  const [pending, setPending] = useState<((v: string | null) => void) | null>(null)
  const [password, setPassword] = useState('')
  const ask = () =>
    new Promise<string | null>((resolve) => {
      setPassword('')
      setPending(() => resolve)
    })
  const finish = (v: string | null) => {
    pending?.(v)
    setPending(null)
    setPassword('')
  }
  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => !o && finish(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-700" /> Confirme a sua senha
          </DialogTitle>
          <DialogDescription>
            Para mexer nas credenciais do banco, digite de novo a sua senha do LouvorFlow. Os
            MASTERs da igreja recebem um aviso por e-mail.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (password) finish(password)
          }}
          className="space-y-4"
        >
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            aria-label="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!password} className="bg-teal-700 hover:bg-teal-800">
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
  return { ask, dialog }
}

/** Lê um arquivo de certificado ou chave; .cer/.der binário vira PEM. */
async function readPem(file: File, kind: 'cert' | 'key') {
  if (file.size > 20000) throw new Error('Arquivo grande demais para um certificado ou chave.')
  if (/\.(pfx|p12)$/i.test(file.name)) {
    throw new Error(
      'Arquivo .pfx/.p12 precisa ser separado em certificado e chave (PEM) antes. Peça ajuda ao Claude.',
    )
  }
  const text = await file.text()
  if (text.includes('-----BEGIN')) return text.trim()
  if (kind === 'cert') {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let bin = ''
    bytes.forEach((b) => (bin += String.fromCharCode(b)))
    const b64 = btoa(bin).replace(/(.{64})/g, '$1\n')
    return `-----BEGIN CERTIFICATE-----\n${b64.trim()}\n-----END CERTIFICATE-----`
  }
  throw new Error('A chave privada precisa ser um arquivo de texto PEM (.key ou .pem).')
}

function PemField({
  id,
  label,
  kind,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  kind: 'cert' | 'key'
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const { toast } = useToast()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-teal-700"
          onClick={() => input.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" /> Escolher arquivo
        </Button>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept={kind === 'cert' ? '.pem,.crt,.cer,.der' : '.key,.pem'}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              onChange(await readPem(file, kind))
            } catch (err) {
              toast({
                title: 'Arquivo não aceito',
                description: errorText(err),
                variant: 'destructive',
              })
            }
          }}
        />
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="h-24 font-mono text-[11px]"
      />
    </div>
  )
}

interface FormState {
  kind: FinBankProvider
  environment: FinBankEnvironment
  credential_key: string
  client_id: string
  client_secret: string
  cert: string
  key: string
}

function CredentialDialog({
  churchId,
  initial,
  editing,
  askPassword,
  onClose,
  onSaved,
}: {
  churchId: string
  initial: FormState
  editing: BankSecretSet | null
  askPassword: () => Promise<string | null>
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))
  const bank = BANKS[form.kind]
  const keep = editing ? 'Em branco mantém o que já está salvo' : ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const password = await askPassword()
    if (!password) return
    setSaving(true)
    try {
      await saveBankSecret(
        churchId,
        {
          kind: form.kind,
          environment: form.environment,
          credential_key: form.credential_key,
          client_id: form.client_id.trim(),
          client_secret: form.client_secret.trim(),
          cert: form.cert.trim(),
          key: form.key.trim(),
        },
        password,
      )
      toast({ title: `Credenciais do ${bank.name} salvas` })
      onSaved()
    } catch (err) {
      toast({
        title: 'Não deu para salvar',
        description: errorText(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {bank.name}: {bank.product}
          </DialogTitle>
          <DialogDescription>{bank.how}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ambiente</Label>
              <Select
                value={form.environment}
                disabled={!!editing}
                onValueChange={(v) => set({ environment: v as FinBankEnvironment })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCAO">Produção</SelectItem>
                  <SelectItem value="TESTE">Teste (sandbox)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-set">Nome do conjunto (opcional)</Label>
              <Input
                id="cred-set"
                value={form.credential_key}
                disabled={!!editing}
                onChange={(e) =>
                  set({
                    credential_key: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9_]/g, '')
                      .slice(0, 30),
                  })
                }
                placeholder="ex.: DIAMANTE"
              />
            </div>
            <p className="col-span-2 -mt-1 text-xs text-slate-500">
              Só preencha o nome se houver mais de uma conta no {bank.name} com credenciais
              diferentes. Use o mesmo nome no campo "Credencial" da conta em Saldos e extratos.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cred-id">Client ID</Label>
            <Input
              id="cred-id"
              value={form.client_id}
              onChange={(e) => set({ client_id: e.target.value })}
              placeholder={keep || 'Client ID fornecido pelo banco'}
              autoComplete="off"
              className="font-mono text-xs"
            />
          </div>
          {form.kind === 'BRADESCO' && (
            <div className="space-y-1.5">
              <Label htmlFor="cred-secret">Client secret</Label>
              <Input
                id="cred-secret"
                type="password"
                value={form.client_secret}
                onChange={(e) => set({ client_secret: e.target.value })}
                placeholder={keep || 'Client secret fornecido pelo banco'}
                autoComplete="new-password"
                className="font-mono text-xs"
              />
            </div>
          )}
          <PemField
            id="cred-cert"
            label="Certificado"
            kind="cert"
            value={form.cert}
            onChange={(v) => set({ cert: v })}
            placeholder={keep || '-----BEGIN CERTIFICATE-----'}
          />
          <PemField
            id="cred-key"
            label="Chave privada"
            kind="key"
            value={form.key}
            onChange={(v) => set({ key: v })}
            placeholder={keep || '-----BEGIN PRIVATE KEY-----'}
          />
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Fica cifrado no servidor e não aparece de novo nesta tela. Só o conector bancário
            recebe, na hora de buscar saldo e extrato.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="bg-teal-700 hover:bg-teal-800">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-slate-100 px-2 py-1.5 text-[11px] text-slate-800">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Copiar ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setDone(true)
              setTimeout(() => setDone(false), 2000)
            } catch {
              /* dá para copiar à mão */
            }
          }}
        >
          {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export function BankIntegrations({ churchId, isMaster }: { churchId: string; isMaster: boolean }) {
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { ask: askPassword, dialog: passwordDialog } = usePasswordPrompt()
  const [info, setInfo] = useState<BankSecretsInfo | null>(null)
  const [connections, setConnections] = useState<FinBankConnection[]>([])
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<{
    form: FormState
    editing: BankSecretSet | null
  } | null>(null)
  const [newKey, setNewKey] = useState('')
  const [github, setGithub] = useState<{ repo: string; token: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [i, c] = await Promise.all([
        getBankSecrets(churchId),
        listBankConnections(churchId).catch((): FinBankConnection[] => []),
      ])
      setInfo(i)
      setConnections(c)
      setError('')
    } catch (err) {
      setError(errorText(err))
    }
  }, [churchId])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Bancos: {error}
      </p>
    )
  }
  if (!info) return null

  const openNew = (kind: FinBankProvider) =>
    setDialog({
      editing: null,
      form: {
        kind,
        environment: 'PRODUCAO',
        credential_key: '',
        client_id: '',
        client_secret: '',
        cert: '',
        key: '',
      },
    })
  const openEdit = (s: BankSecretSet) =>
    setDialog({
      editing: s,
      form: {
        kind: s.kind,
        environment: s.environment,
        credential_key: s.credential_key,
        client_id: '',
        client_secret: '',
        cert: '',
        key: '',
      },
    })
  const remove = (s: BankSecretSet) =>
    confirm({
      title: `Apagar as credenciais do ${BANKS[s.kind].name}?`,
      description:
        'O conector para de buscar saldo e extrato das contas que usam estas credenciais, até você cadastrar de novo.',
      confirmLabel: 'Apagar',
      destructive: true,
      onConfirm: async () => {
        const password = await askPassword()
        if (!password) return
        try {
          await deleteBankSecret(churchId, s.id, password)
          load()
        } catch (err) {
          toast({
            title: 'Não deu para apagar',
            description: errorText(err),
            variant: 'destructive',
          })
        }
      },
    })
  const generateKey = () => {
    const run = async () => {
      const password = await askPassword()
      if (!password) return
      try {
        const res = await newBankConnectorKey(churchId, password)
        setNewKey(res.token)
        load()
      } catch (err) {
        toast({
          title: 'Não deu para gerar',
          description: errorText(err),
          variant: 'destructive',
        })
      }
    }
    if (!info.connector.has_key) return run()
    confirm({
      title: 'Gerar uma chave nova?',
      description:
        'A chave atual deixa de valer na hora. Você vai precisar trocar o segredo BANK_SYNC_TOKEN no GitHub pela nova.',
      confirmLabel: 'Gerar nova',
      destructive: true,
      onConfirm: run,
    })
  }
  const saveGithub = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!github) return
    const password = await askPassword()
    if (!password) return
    try {
      await saveBankGithub(churchId, password, github.repo.trim(), github.token.trim() || undefined)
      setGithub(null)
      toast({
        title: github.repo.trim() ? 'Acesso ao GitHub salvo' : 'Acesso ao GitHub removido',
      })
      load()
    } catch (err) {
      toast({
        title: 'Não deu para salvar',
        description: errorText(err),
        variant: 'destructive',
      })
    }
  }

  const lastSync = connections
    .map((c) => c.last_sync_at || '')
    .filter(Boolean)
    .sort()
    .pop()
  const failing = connections.filter((c) => c.enabled && c.last_status === 'ERRO')
  const serverUrl = pb.baseURL.replace(/\/$/, '')

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Landmark className="h-5 w-5 text-teal-700" /> Bancos (Financeiro)
        </h2>
        <p className="text-sm text-slate-500">
          Saldo e extrato automáticos pela API da Cora e do Bradesco, em{' '}
          <Link to="/financeiro/saldos" className="font-semibold text-teal-700 underline">
            Saldos e extratos
          </Link>
          .
        </p>
      </div>

      {!info.encryption_ready && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            O servidor ainda não tem a chave de cifragem (variável LOUVORFLOW_CREDENTIALS_KEY, com
            32 caracteres). Sem ela as credenciais dos bancos não são salvas.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {(['CORA', 'BRADESCO'] as FinBankProvider[]).map((kind) => {
          const bank = BANKS[kind]
          const sets = info.sets.filter((s) => s.kind === kind)
          const conns = connections.filter((c) => c.provider === kind)
          return (
            <div
              key={kind}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className={
                      kind === 'CORA'
                        ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600'
                        : 'flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700'
                    }
                  >
                    <Landmark className="h-6 w-6" />
                  </div>
                  {sets.length ? (
                    <Badge className="border-emerald-200 bg-emerald-100 text-xs text-emerald-800 hover:bg-emerald-100">
                      Cadastrado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-slate-500">
                      Não configurado
                    </Badge>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{bank.name}</h3>
                  <p className="text-xs font-medium text-slate-400">{bank.product}</p>
                </div>
                {sets.length === 0 && (
                  <p className="text-xs leading-relaxed text-slate-600">{bank.how}</p>
                )}
                {sets.map((s) => (
                  <div
                    key={s.id}
                    className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        {ENV_LABEL[s.environment]}
                        {s.credential_key && ` · ${s.credential_key}`}
                      </span>
                      {isMaster && (
                        <span className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Alterar credenciais"
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600"
                            aria-label="Apagar credenciais"
                            onClick={() => remove(s)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500">
                      Client ID <code className="text-slate-700">{s.summary.client_id}</code>
                      {kind === 'BRADESCO' &&
                        (s.summary.has_secret ? ' · com secret' : ' · sem secret')}
                    </p>
                    {s.summary.cert_fingerprint && (
                      <p className="text-slate-500">
                        Certificado{' '}
                        <code className="text-slate-700">{s.summary.cert_fingerprint}</code>
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">
                      {s.updated_by_name} em {shortDate(s.updated)}
                    </p>
                  </div>
                ))}
                <p className="text-xs text-slate-500">
                  {conns.length
                    ? `${conns.length} conta${conns.length > 1 ? 's' : ''} ligada${conns.length > 1 ? 's' : ''} em Saldos e extratos.`
                    : 'Nenhuma conta ligada ainda em Saldos e extratos.'}
                </p>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                {isMaster ? (
                  <Button
                    onClick={() => openNew(kind)}
                    disabled={!info.encryption_ready}
                    className="w-full gap-1.5 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {sets.length ? 'Cadastrar outro ambiente' : 'Cadastrar credenciais'}
                  </Button>
                ) : (
                  <p className="text-center text-xs text-slate-500">
                    Só o MASTER cadastra as credenciais.
                  </p>
                )}
              </div>
            </div>
          )
        })}

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <PlugZap className="h-6 w-6" />
              </div>
              {info.connector.has_key || info.server_token ? (
                <Badge className="border-emerald-200 bg-emerald-100 text-xs text-emerald-800 hover:bg-emerald-100">
                  Chave gerada
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-slate-500">
                  Sem chave
                </Badge>
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Conector bancário</h3>
              <p className="text-xs font-medium text-slate-400">
                Roda no GitHub,{' '}
                {info.connector.has_github_token || info.server_github
                  ? 'de hora em hora (7h às 22h)'
                  : 'de 2 em 2 horas'}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Os bancos exigem certificado em cada chamada, então quem busca saldo e extrato é o
              conector. Ele usa as credenciais cadastradas aqui.
            </p>
            <div className="space-y-1 text-xs text-slate-500">
              <p>
                Chave:{' '}
                {info.connector.has_key ? (
                  <code className="text-slate-700">{info.connector.key_prefix}••••</code>
                ) : info.server_token ? (
                  'configurada no servidor'
                ) : (
                  'ainda não gerada'
                )}
              </p>
              <p>
                Atualizar agora:{' '}
                {info.connector.github_repo
                  ? info.connector.github_repo
                  : info.server_github
                    ? 'configurado no servidor'
                    : 'na próxima rodada (sem acesso ao GitHub)'}
              </p>
              {lastSync && <p>Última busca: {shortDate(lastSync)}</p>}
              {failing.length > 0 && (
                <p className="text-red-600">
                  {failing.length} conta{failing.length > 1 ? 's' : ''} com erro na última busca.
                </p>
              )}
            </div>
          </div>
          {isMaster ? (
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              <Button
                onClick={generateKey}
                className="w-full gap-1.5 rounded-xl bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {info.connector.has_key ? 'Gerar chave nova' : 'Gerar chave do conector'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setGithub({ repo: info.connector.github_repo, token: '' })}
                disabled={!info.encryption_ready}
                className="w-full rounded-xl text-xs font-semibold"
              >
                Botão "Atualizar agora"
              </Button>
            </div>
          ) : (
            <p className="mt-4 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
              Só o MASTER configura o conector.
            </p>
          )}
        </div>
      </div>

      {isMaster && info.audit && info.audit.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-teal-700" /> Registro de segurança
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Quem mexeu nas credenciais e quando o conector as usou. Algo que você não reconhece?
            Apague as credenciais, gere uma chave nova e peça ao banco um certificado novo.
          </p>
          <ul className="mt-3 divide-y divide-slate-100 text-xs">
            {info.audit.slice(0, 15).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="w-28 shrink-0 tabular-nums text-slate-400">
                  {shortDate(a.created)}
                </span>
                <span
                  className={
                    a.event === 'SENHA_ERRADA' || a.event === 'CHAVE_INVALIDA'
                      ? 'font-semibold text-red-700'
                      : 'font-semibold text-slate-800'
                  }
                >
                  {AUDIT_LABEL[a.event] || a.event}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-500">
                  {[a.user_name, a.detail].filter(Boolean).join(' · ')}
                </span>
                <span className="text-slate-400">{a.ip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialog && (
        <CredentialDialog
          churchId={churchId}
          initial={dialog.form}
          editing={dialog.editing}
          askPassword={askPassword}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            load()
          }}
        />
      )}

      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey('')}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Chave do conector</DialogTitle>
            <DialogDescription>
              Ela aparece só agora. No GitHub, abra o repositório do LouvorFlow em Settings ›
              Secrets and variables › Actions e crie (ou troque) estes dois segredos:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <CopyLine label="LOUVORFLOW_URL" value={serverUrl} />
            <CopyLine label="BANK_SYNC_TOKEN" value={newKey} />
          </div>
          <p className="text-xs text-slate-500">
            Depois, para testar, abra Actions › Conector bancário › Run workflow. As credenciais dos
            bancos não precisam ir para o GitHub: o conector recebe as que estão cadastradas aqui.
          </p>
          <DialogFooter>
            <Button onClick={() => setNewKey('')} className="bg-teal-700 hover:bg-teal-800">
              Já copiei
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!github} onOpenChange={(o) => !o && setGithub(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Botão "Atualizar agora"</DialogTitle>
            <DialogDescription>
              Opcional. Com acesso ao GitHub, o botão em Saldos e extratos roda o conector na hora.
              Com ele, o servidor também roda o conector de hora em hora, das 7h às 22h. Sem ele,
              fica só o agendamento do GitHub, que às vezes atrasa ou pula rodadas.
            </DialogDescription>
          </DialogHeader>
          {github && (
            <form onSubmit={saveGithub} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="gh-repo">Repositório</Label>
                <Input
                  id="gh-repo"
                  value={github.repo}
                  onChange={(e) => setGithub({ ...github, repo: e.target.value })}
                  placeholder="baade22/gest-o-de-louvor-rjtiv2tbb"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gh-token">Token do GitHub</Label>
                <Input
                  id="gh-token"
                  type="password"
                  value={github.token}
                  onChange={(e) => setGithub({ ...github, token: e.target.value })}
                  placeholder={
                    info.connector.has_github_token
                      ? 'Em branco mantém o que já está salvo'
                      : 'github_pat_...'
                  }
                  autoComplete="new-password"
                />
                <p className="text-xs text-slate-500">
                  Token "fine-grained" só deste repositório, com permissão Actions: Read and write.
                  Deixe o repositório em branco para remover.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setGithub(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-teal-700 hover:bg-teal-800">
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
      {passwordDialog}
    </section>
  )
}
