import { describe, expect, it, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  getWhatsAppStatus,
  saveWhatsAppAuto,
  connectWhatsApp,
  disconnectWhatsApp,
  sendWhatsAppTest,
  listWhatsAppMessages,
  retryWhatsAppMessage,
  cancelWhatsAppMessage,
} from './whatsapp'

vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    send: vi.fn(),
  },
}))

describe('WhatsApp service API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getWhatsAppStatus chama POST /backend/v1/whatsapp com action status', async () => {
    vi.mocked(pb.send).mockResolvedValueOnce({
      configured: true,
      state: 'close',
      phone: '',
      profile_name: '',
      last_error: '',
      auto: {
        ESCALA: false,
        LEMBRETE_ESCALA: false,
        INSCRICAO: false,
        PAGAMENTO: false,
        ANIVERSARIO: false,
        CASAMENTO: false,
      },
      queue: { fila: 0, erro: 0 },
    })

    const res = await getWhatsAppStatus('church-123')
    expect(pb.send).toHaveBeenCalledWith('/backend/v1/whatsapp', {
      method: 'POST',
      body: { church_id: 'church-123', action: 'status' },
    })
    expect(res.state).toBe('close')
  })

  it('saveWhatsAppAuto faz POST com church_id, action save e novo mapa auto', async () => {
    const autoPayload = {
      ESCALA: true,
      LEMBRETE_ESCALA: true,
      INSCRICAO: false,
      PAGAMENTO: false,
      ANIVERSARIO: true,
      CASAMENTO: false,
    }

    vi.mocked(pb.send).mockResolvedValueOnce({
      auto: autoPayload,
    })

    const res = await saveWhatsAppAuto('church-123', autoPayload)
    expect(pb.send).toHaveBeenCalledWith('/backend/v1/whatsapp', {
      method: 'POST',
      body: { church_id: 'church-123', action: 'save', auto: autoPayload },
    })
    expect(res.auto.ESCALA).toBe(true)
    expect(res.auto.ANIVERSARIO).toBe(true)
  })

  it('permite múltiplos salvamentos subsequentes sem erro', async () => {
    const firstPayload = {
      ESCALA: true,
      LEMBRETE_ESCALA: false,
      INSCRICAO: false,
      PAGAMENTO: false,
      ANIVERSARIO: false,
      CASAMENTO: false,
    }
    const secondPayload = {
      ESCALA: true,
      LEMBRETE_ESCALA: true,
      INSCRICAO: false,
      PAGAMENTO: false,
      ANIVERSARIO: false,
      CASAMENTO: false,
    }

    vi.mocked(pb.send).mockResolvedValueOnce({ auto: firstPayload })
    vi.mocked(pb.send).mockResolvedValueOnce({ auto: secondPayload })

    const res1 = await saveWhatsAppAuto('church-123', firstPayload)
    const res2 = await saveWhatsAppAuto('church-123', secondPayload)

    expect(res1.auto.ESCALA).toBe(true)
    expect(res1.auto.LEMBRETE_ESCALA).toBe(false)
    expect(res2.auto.LEMBRETE_ESCALA).toBe(true)
    expect(pb.send).toHaveBeenCalledTimes(2)
  })

  it('connectWhatsApp e disconnectWhatsApp chamam actions corretas', async () => {
    vi.mocked(pb.send).mockResolvedValueOnce({
      state: 'connecting',
      qr: 'data:image/png;base64,...',
    })
    vi.mocked(pb.send).mockResolvedValueOnce({ state: 'close' })

    const conn = await connectWhatsApp('church-123')
    expect(conn.state).toBe('connecting')

    const disconn = await disconnectWhatsApp('church-123')
    expect(disconn.state).toBe('close')
  })

  it('sendWhatsAppTest, list, retry e cancel chamam os endpoints esperados', async () => {
    vi.mocked(pb.send).mockResolvedValueOnce({ id: 'msg-1' })
    const testRes = await sendWhatsAppTest('church-123', '5511999998888')
    expect(testRes.id).toBe('msg-1')

    vi.mocked(pb.send).mockResolvedValueOnce({
      items: [],
      has_more: false,
      queue: { fila: 0, erro: 0 },
    })
    const listRes = await listWhatsAppMessages('church-123', { page: 1, status: 'FILA' })
    expect(listRes.items).toEqual([])

    vi.mocked(pb.send).mockResolvedValueOnce({ id: 'msg-1', status: 'FILA' })
    const retryRes = await retryWhatsAppMessage('church-123', 'msg-1')
    expect(retryRes.status).toBe('FILA')

    vi.mocked(pb.send).mockResolvedValueOnce({ id: 'msg-1', status: 'CANCELADO' })
    const cancelRes = await cancelWhatsAppMessage('church-123', 'msg-1')
    expect(cancelRes.status).toBe('CANCELADO')
  })
})
