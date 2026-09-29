import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('LouvorFlow Agent ZIP Asset Verification', () => {
  beforeAll(async () => {
    // Executa buildZipScript para garantir compilação do Agent e regeneração do ZIP antes dos testes
    await import('../buildZipScript.mjs')
  })
  it('confirma existência e integridade do LouvorFlow-Agent-0.0.15.zip em public/', () => {
    const publicZip = path.resolve(process.cwd(), 'public/LouvorFlow-Agent-0.0.15.zip')
    expect(fs.existsSync(publicZip), 'LouvorFlow-Agent-0.0.15.zip deve existir em public/').toBe(
      true,
    )

    const stat = fs.statSync(publicZip)
    expect(stat.size).toBeGreaterThan(5000)

    const buf = fs.readFileSync(publicZip)
    // Assinatura PKZip: 0x04034b50 -> 'PK\x03\x04'
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4b) // 'K'
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)

    // Encontra EOCD
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

    // Valida arquivos essenciais
    expect(entries).toContain('package.json')
    expect(entries).toContain('README.md')
    expect(entries).toContain('README-INSTALACAO.md')
    expect(entries).toContain('agent.config.example.json')
    expect(entries).toContain('tsconfig.json')
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

    // Valida que NÃO contém node_modules nem agent.config.json com tokens reais
    expect(entries.some((e) => e.includes('node_modules'))).toBe(false)
    expect(entries.some((e) => e === 'agent.config.json')).toBe(false)
  })
})
