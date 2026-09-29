import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('packAgent test verification', () => {
  beforeAll(async () => {
    await import('../buildZipScript.mjs')
  })

  it('garante que o LouvorFlow-Agent-0.0.15.zip foi gerado corretamente em public/', () => {
    const zipPath = path.resolve(process.cwd(), 'public/LouvorFlow-Agent-0.0.15.zip')
    expect(fs.existsSync(zipPath)).toBe(true)
    const stat = fs.statSync(zipPath)
    expect(stat.size).toBeGreaterThan(1000)

    const buf = fs.readFileSync(zipPath)
    // Assinatura PKZip: PK\x03\x04
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)

    // Localizar EOCD
    let eocdOffset = -1
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i
        break
      }
    }
    expect(eocdOffset).toBeGreaterThan(0)

    const totalEntries = buf.readUInt16LE(eocdOffset + 10)
    expect(totalEntries).toBeGreaterThanOrEqual(13)

    const cdOffset = buf.readUInt32LE(eocdOffset + 16)
    let ptr = cdOffset
    const entries: string[] = []

    for (let i = 0; i < totalEntries; i++) {
      if (buf.readUInt32LE(ptr) !== 0x02014b50) break
      const nameLen = buf.readUInt16LE(ptr + 28)
      const extraLen = buf.readUInt16LE(ptr + 30)
      const commentLen = buf.readUInt16LE(ptr + 32)
      const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf-8')
      entries.push(name)
      ptr += 46 + nameLen + extraLen + commentLen
    }

    // Arquivos esperados
    expect(entries).toContain('src/index.ts')
    expect(entries).toContain('src/agent.ts')
    expect(entries).toContain('src/config.ts')
    expect(entries).toContain('src/holyricsClient.ts')
    expect(entries).toContain('src/server.ts')
    expect(entries).toContain('src/types.ts')
    expect(entries).toContain('dist/index.js')
    expect(entries).toContain('dist/agent.js')
    expect(entries).toContain('dist/config.js')
    expect(entries).toContain('dist/holyricsClient.js')
    expect(entries).toContain('dist/server.js')
    expect(entries).toContain('package.json')
    expect(entries).toContain('tsconfig.json')
    expect(entries).toContain('agent.config.example.json')
    expect(entries).toContain('README.md')
    expect(entries).toContain('README-INSTALACAO.md')

    // Garantir que NÃO há arquivos indesejados
    expect(entries.some((e) => e.includes('node_modules'))).toBe(false)
    expect(entries.some((e) => e === 'agent.config.json')).toBe(false)
    expect(entries.some((e) => e.includes('.env'))).toBe(false)
    expect(entries.some((e) => e.endsWith('.log'))).toBe(false)
  })
})
