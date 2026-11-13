/**
 * Download de vídeo/áudio do YouTube no computador do Holyrics (Agent 0.0.50).
 *
 * Usa o yt-dlp (programa livre, baixado do GitHub oficial na primeira vez) e,
 * quando disponível, o ffmpeg para juntar vídeo+áudio em MP4 e converter áudio em MP3.
 * Sem ffmpeg o vídeo vem em arquivo único (qualidade menor) e o áudio em M4A.
 *
 * Segurança: só aceita link de vídeo do YouTube. O Agent remonta a URL a partir do id
 * (11 caracteres) e roda o yt-dlp sem shell, com "--" antes da URL.
 */
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']

/** Extrai o id do vídeo de um link do YouTube. Retorna null se não for link de vídeo. */
export function parseYoutubeVideoId(raw: string): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  let id = ''
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] || ''
  } else if (YT_HOSTS.includes(host)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || ''
    else {
      const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/)
      if (m) id = m[1]
    }
  }
  return YT_ID.test(id) ? id : null
}

export function canonicalYoutubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

export type YoutubeFormat = 'VIDEO' | 'AUDIO'

/** Argumentos do yt-dlp para cada formato (sem a URL). */
export function buildYtDlpArgs(opts: {
  format: YoutubeFormat
  outputTemplate: string
  /** Há ffmpeg (na pasta ffmpegDir ou no PATH). */
  ffmpeg: boolean
  ffmpegDir?: string | null
  maxFileSize?: string
}): string[] {
  const args = [
    '--no-playlist',
    '--no-progress',
    '--newline',
    '--no-mtime',
    '--no-part',
    '--no-config',
    '--max-filesize',
    opts.maxFileSize || '2G',
    '-o',
    opts.outputTemplate,
    '--print',
    'after_move:%(title)j',
  ]
  if (opts.ffmpegDir) args.push('--ffmpeg-location', opts.ffmpegDir)
  if (opts.format === 'AUDIO') {
    if (opts.ffmpeg) {
      args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0')
    } else {
      args.push('-f', 'ba[ext=m4a]/ba')
    }
  } else if (opts.ffmpeg) {
    // H.264 + AAC em MP4 é o que o Holyrics toca sem surpresa. Até 1080p.
    args.push(
      '-f',
      'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b',
      '--merge-output-format',
      'mp4',
    )
  } else {
    args.push('-f', 'b[ext=mp4]/b')
  }
  return args
}

/** Último título impresso pelo yt-dlp (--print after_move:%(title)j). */
export function parseTitleFromOutput(stdout: string): string {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (l.startsWith('"') && l.endsWith('"')) {
      try {
        return String(JSON.parse(l))
      } catch {}
    }
  }
  return ''
}

/** Mensagem curta em português para os erros mais comuns do yt-dlp. */
export function explainYtDlpError(stderr: string): {
  code: string
  message: string
} {
  const s = String(stderr || '')
  if (/Sign in to confirm|not a bot|HTTP Error 403|HTTP Error 429/i.test(s))
    return {
      code: 'YOUTUBE_BLOCKED',
      message: 'O YouTube pediu para confirmar que não é robô. Tente de novo mais tarde.',
    }
  if (/Private video|Video unavailable|This video is unavailable|has been removed/i.test(s))
    return {
      code: 'YOUTUBE_UNAVAILABLE',
      message: 'O vídeo é privado ou não está mais disponível.',
    }
  if (/age|inappropriate/i.test(s) && /confirm your age|age-restricted/i.test(s))
    return {
      code: 'YOUTUBE_AGE_RESTRICTED',
      message: 'O vídeo tem restrição de idade e não pode ser baixado sem login.',
    }
  if (/File is larger than max-filesize|max-filesize/i.test(s))
    return { code: 'YOUTUBE_TOO_LARGE', message: 'O arquivo passa de 2 GB.' }
  if (/live event|is live|premieres in/i.test(s))
    return {
      code: 'YOUTUBE_LIVE',
      message: 'Transmissão ao vivo ou estreia ainda não pode ser baixada.',
    }
  const last = s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /ERROR/i.test(l))
    .pop()
  return {
    code: 'YOUTUBE_DOWNLOAD_FAILED',
    message: last || 'O yt-dlp não conseguiu baixar o vídeo.',
  }
}

// ---------------------------------------------------------------------------
// Ferramentas (yt-dlp e ffmpeg) na pasta tools/ do Agent
// ---------------------------------------------------------------------------

const YTDLP_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/'
const FFMPEG_BASE = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/'
const UPDATE_EVERY_MS = 7 * 24 * 60 * 60 * 1000

export function toolsDir(): string {
  return path.join(process.cwd(), 'tools')
}

function ytDlpAssetName(): string | null {
  if (process.platform === 'win32') return 'yt-dlp.exe'
  if (process.platform === 'darwin') return 'yt-dlp_macos'
  if (process.platform === 'linux')
    return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
  return null
}

function ffmpegAssetName(): string | null {
  if (process.platform === 'win32' && process.arch === 'x64')
    return 'ffmpeg-master-latest-win64-gpl.zip'
  if (process.platform === 'linux' && process.arch === 'x64')
    return 'ffmpeg-master-latest-linux64-gpl.tar.xz'
  if (process.platform === 'linux' && process.arch === 'arm64')
    return 'ffmpeg-master-latest-linuxarm64-gpl.tar.xz'
  return null
}

async function downloadToFile(url: string, dest: string, timeoutMs = 10 * 60 * 1000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${url}`)
    const tmp = `${dest}.download`
    await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp))
    fs.renameSync(tmp, dest)
  } finally {
    clearTimeout(timer)
  }
}

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let child
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        windowsHide: true,
        shell: false,
      })
    } catch (err: any) {
      resolve({
        code: -1,
        stdout: '',
        stderr: String(err?.message || err),
        timedOut: false,
      })
      return
    }
    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {}
    }, opts.timeoutMs || 60000)
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
      if (stdout.length > 200000) stdout = stdout.slice(-100000)
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 200000) stderr = stderr.slice(-100000)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        code: -1,
        stdout,
        stderr: stderr + String(err?.message || err),
        timedOut,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

/** Caminho do yt-dlp. Baixa na primeira vez e atualiza toda semana (o YouTube muda muito). */
export async function ensureYtDlp(configured?: string): Promise<string> {
  if (configured && fs.existsSync(configured)) return configured
  const asset = ytDlpAssetName()
  if (!asset) throw new Error(`Sistema ${process.platform} sem yt-dlp disponível.`)
  const dir = toolsDir()
  fs.mkdirSync(dir, { recursive: true })
  const bin = path.join(dir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  if (!fs.existsSync(bin)) {
    console.log('[Agent YouTube] Baixando o yt-dlp (só na primeira vez)...')
    await downloadToFile(YTDLP_BASE + asset, bin)
    if (process.platform !== 'win32') fs.chmodSync(bin, 0o755)
    return bin
  }
  const age = Date.now() - fs.statSync(bin).mtimeMs
  if (age > UPDATE_EVERY_MS) {
    console.log('[Agent YouTube] Atualizando o yt-dlp...')
    const upd = await run(bin, ['-U'], { timeoutMs: 120000 })
    if (upd.code !== 0) {
      // Se a atualização interna falhar, baixa de novo.
      try {
        await downloadToFile(YTDLP_BASE + asset, bin)
        if (process.platform !== 'win32') fs.chmodSync(bin, 0o755)
      } catch (err: any) {
        console.log(`[Agent YouTube] Não deu para atualizar o yt-dlp: ${err.message}`)
      }
    }
    try {
      const now = new Date()
      fs.utimesSync(bin, now, now)
    } catch {}
  }
  return bin
}

function findFile(dir: string, name: string, depth = 4): string | null {
  if (depth < 0 || !fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full
    if (entry.isDirectory()) {
      const found = findFile(full, name, depth - 1)
      if (found) return found
    }
  }
  return null
}

/**
 * Pasta do ffmpeg (para --ffmpeg-location), ou null se não houver.
 * Procura em tools/, no caminho configurado, no PATH e por último tenta baixar.
 */
export async function ensureFfmpeg(configured?: string): Promise<string | null> {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  if (configured) {
    const p =
      fs.existsSync(configured) && fs.statSync(configured).isDirectory()
        ? path.join(configured, exe)
        : configured
    if (fs.existsSync(p)) return path.dirname(p)
  }
  const dir = toolsDir()
  if (fs.existsSync(path.join(dir, exe))) return dir

  const onPath = await run(exe, ['-version'], { timeoutMs: 15000 })
  if (onPath.code === 0) {
    // ffmpeg no PATH: yt-dlp acha sozinho.
    return 'PATH'
  }

  const asset = ffmpegAssetName()
  if (!asset) return null
  fs.mkdirSync(dir, { recursive: true })
  const archive = path.join(dir, asset)
  const extractDir = path.join(dir, 'ffmpeg-extract')
  try {
    console.log('[Agent YouTube] Baixando o ffmpeg (só na primeira vez, ~100 MB)...')
    await downloadToFile(FFMPEG_BASE + asset, archive, 20 * 60 * 1000)
    fs.rmSync(extractDir, { recursive: true, force: true })
    fs.mkdirSync(extractDir, { recursive: true })
    // tar vem no Windows 10+ e abre .zip; no Linux abre .tar.xz
    const tarArgs = asset.endsWith('.zip')
      ? ['-xf', archive, '-C', extractDir]
      : ['-xJf', archive, '-C', extractDir]
    const res = await run('tar', tarArgs, { timeoutMs: 10 * 60 * 1000 })
    if (res.code !== 0) throw new Error(res.stderr.slice(0, 300) || 'falha ao extrair')
    for (const name of [exe, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe']) {
      const found = findFile(extractDir, name)
      if (found) {
        fs.copyFileSync(found, path.join(dir, name))
        if (process.platform !== 'win32') fs.chmodSync(path.join(dir, name), 0o755)
      }
    }
    return fs.existsSync(path.join(dir, exe)) ? dir : null
  } catch (err: any) {
    console.log(
      `[Agent YouTube] Sem ffmpeg (${err.message}). Vídeo em qualidade menor e áudio em M4A.`,
    )
    return null
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
    fs.rmSync(archive, { force: true })
  }
}
