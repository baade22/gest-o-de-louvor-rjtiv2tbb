import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// Garante compilação do TypeScript do Agent antes de empacotar no ZIP
try {
  execSync('npx tsc -p agent/tsconfig.json', { stdio: 'inherit' })
  console.log('[Agent Build] TypeScript do Agent compilado com sucesso para agent/dist/')
} catch (err) {
  console.error('[Agent Build] Erro ao compilar TypeScript do Agent:', err.message)
}

function createCrc32Table() {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  return table
}

const CRC32_TABLE = createCrc32Table()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)

  const dosDate = ((year - 1980) << 9) | (month << 5) | day
  const dosTime = (hours << 11) | (minutes << 5) | seconds

  return { dosTime, dosDate }
}

function buildZip(fileEntries) {
  const localFileChunks = []
  const centralDirChunks = []
  let offset = 0
  const date = new Date(2025, 0, 1, 12, 0, 0)
  const { dosTime, dosDate } = dosDateTime(date)

  for (const entry of fileEntries) {
    const relativeName = entry.path.replace(/\\/g, '/')
    const nameBuf = Buffer.from(relativeName, 'utf-8')
    const rawData = entry.data
    const uncompressedSize = rawData.length
    const fileCrc = crc32(rawData)
    const compressedData = zlib.deflateRawSync(rawData)
    const compressedSize = compressedData.length

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(fileCrc, 14)
    localHeader.writeUInt32LE(compressedSize, 18)
    localHeader.writeUInt32LE(uncompressedSize, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localFileChunks.push(localHeader, nameBuf, compressedData)

    // Central directory header (46 bytes + name)
    const cdHeader = Buffer.alloc(46)
    cdHeader.writeUInt32LE(0x02014b50, 0)
    cdHeader.writeUInt16LE(20, 4)
    cdHeader.writeUInt16LE(20, 6)
    cdHeader.writeUInt16LE(0, 8)
    cdHeader.writeUInt16LE(8, 10)
    cdHeader.writeUInt16LE(dosTime, 12)
    cdHeader.writeUInt16LE(dosDate, 14)
    cdHeader.writeUInt32LE(fileCrc, 16)
    cdHeader.writeUInt32LE(compressedSize, 20)
    cdHeader.writeUInt32LE(uncompressedSize, 24)
    cdHeader.writeUInt16LE(nameBuf.length, 28)
    cdHeader.writeUInt16LE(0, 30)
    cdHeader.writeUInt16LE(0, 32)
    cdHeader.writeUInt16LE(0, 34)
    cdHeader.writeUInt16LE(0, 36)
    cdHeader.writeUInt32LE(0, 38)
    cdHeader.writeUInt32LE(offset, 42)

    centralDirChunks.push(cdHeader, nameBuf)

    offset += localHeader.length + nameBuf.length + compressedData.length
  }

  const centralDirStart = offset
  const centralDirBuf = Buffer.concat(centralDirChunks)
  const centralDirLength = centralDirBuf.length

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(fileEntries.length, 8)
  eocd.writeUInt16LE(fileEntries.length, 10)
  eocd.writeUInt32LE(centralDirLength, 12)
  eocd.writeUInt32LE(centralDirStart, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localFileChunks, centralDirBuf, eocd])
}

function collectFiles(dir, baseDir = '') {
  const results = []
  const list = fs.readdirSync(dir)
  for (const item of list) {
    const fullPath = path.join(dir, item)
    const relPath = path.join(baseDir, item)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      if (item === 'node_modules' || item === '.git') continue
      results.push(...collectFiles(fullPath, relPath))
    } else {
      if (item === 'agent.config.json' || item.endsWith('.log')) continue
      results.push({
        path: relPath.replace(/\\/g, '/'),
        data: fs.readFileSync(fullPath),
      })
    }
  }
  return results
}

const agentDir = path.resolve(process.cwd(), 'agent')
const files = collectFiles(agentDir)
const zipBuf = buildZip(files)
const outPublic = path.resolve(process.cwd(), 'public/LouvorFlow-Agent-0.0.15.zip')
fs.writeFileSync(outPublic, zipBuf)
console.log(
  `[ZIP Prebuild] LouvorFlow-Agent-0.0.15.zip gerado com sucesso em ${outPublic} (${zipBuf.length} bytes, ${files.length} arquivos)`,
)
