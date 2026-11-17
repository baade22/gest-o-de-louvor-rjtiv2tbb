// Leitor mínimo de "Java serialization" (o formato dos arquivos .mufl que o Holyrics exporta).
// Lê objetos, strings, arrays, referências e blocos de dados; devolve objetos JS simples
// ({ $class, ...campos }). Não executa nada: só interpreta bytes.

const STREAM_MAGIC = 0xaced
const TC_NULL = 0x70
const TC_REFERENCE = 0x71
const TC_CLASSDESC = 0x72
const TC_OBJECT = 0x73
const TC_STRING = 0x74
const TC_ARRAY = 0x75
const TC_CLASS = 0x76
const TC_BLOCKDATA = 0x77
const TC_ENDBLOCKDATA = 0x78
const TC_RESET = 0x79
const TC_BLOCKDATALONG = 0x7a
const TC_LONGSTRING = 0x7c
const TC_ENUM = 0x7e
const BASE_HANDLE = 0x7e0000

const SC_WRITE_METHOD = 0x01
const SC_SERIALIZABLE = 0x02
const SC_EXTERNALIZABLE = 0x04
const SC_BLOCK_DATA = 0x08

interface FieldDesc {
  type: string
  name: string
}

interface ClassDesc {
  name: string
  flags: number
  fields: FieldDesc[]
  superDesc: ClassDesc | null
}

export type JavaValue =
  | null
  | string
  | number
  | boolean
  | bigint
  | JavaValue[]
  | { [key: string]: JavaValue }

/** Bloco de dados escrito por writeObject (ex.: o tamanho do ArrayList). */
export interface JavaBlock {
  $block: Uint8Array
}

export class JavaReader {
  private pos = 0
  private handles: unknown[] = []
  private view: DataView
  private utf8 = new TextDecoder('utf-8')

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  /** Lê o primeiro objeto do arquivo. */
  readStream(): unknown {
    if (this.u16() !== STREAM_MAGIC)
      throw new Error('Arquivo não é do Holyrics (cabeçalho inválido).')
    this.u16() // versão
    return this.content()
  }

  private need(n: number) {
    if (this.pos + n > this.bytes.length) throw new Error('Arquivo incompleto.')
  }
  private u8() {
    this.need(1)
    return this.bytes[this.pos++]
  }
  private u16() {
    this.need(2)
    const v = this.view.getUint16(this.pos)
    this.pos += 2
    return v
  }
  private i32() {
    this.need(4)
    const v = this.view.getInt32(this.pos)
    this.pos += 4
    return v
  }
  private raw(n: number) {
    this.need(n)
    const b = this.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return b
  }
  /** "Modified UTF-8" do Java: igual ao UTF-8 menos o zero (C0 80), que a gente troca. */
  private text(n: number) {
    const b = this.raw(n)
    return this.utf8.decode(b).split(String.fromCharCode(0)).join('')
  }
  private utf() {
    return this.text(this.u16())
  }
  private newHandle(v: unknown) {
    this.handles.push(v)
    return this.handles.length - 1
  }

  private content(): unknown {
    const tc = this.u8()
    switch (tc) {
      case TC_NULL:
        return null
      case TC_REFERENCE: {
        const h = this.i32() - BASE_HANDLE
        if (h < 0 || h >= this.handles.length) throw new Error('Referência inválida no arquivo.')
        return this.handles[h]
      }
      case TC_STRING: {
        const s = this.utf()
        this.newHandle(s)
        return s
      }
      case TC_LONGSTRING: {
        const hi = this.i32()
        const lo = this.i32()
        if (hi !== 0) throw new Error('Texto grande demais no arquivo.')
        const s = this.text(lo >>> 0)
        this.newHandle(s)
        return s
      }
      case TC_CLASSDESC:
        this.pos--
        return this.classDesc()
      case TC_CLASS: {
        const d = this.classDesc()
        this.newHandle(d)
        return d
      }
      case TC_OBJECT:
        return this.object()
      case TC_ARRAY:
        return this.array()
      case TC_ENUM: {
        this.classDesc()
        const out: { $enum: unknown } = { $enum: null }
        this.newHandle(out)
        out.$enum = this.content()
        return out
      }
      case TC_BLOCKDATA:
        return { $block: this.raw(this.u8()) } as JavaBlock
      case TC_BLOCKDATALONG:
        return { $block: this.raw(this.i32()) } as JavaBlock
      case TC_ENDBLOCKDATA:
        return END
      case TC_RESET:
        this.handles = []
        return this.content()
      default:
        throw new Error(`Formato desconhecido no arquivo (0x${tc.toString(16)}).`)
    }
  }

  private classDesc(): ClassDesc | null {
    const tc = this.u8()
    if (tc === TC_NULL) return null
    if (tc === TC_REFERENCE) {
      const h = this.i32() - BASE_HANDLE
      return this.handles[h] as ClassDesc
    }
    if (tc !== TC_CLASSDESC) throw new Error('Descrição de classe esperada no arquivo.')
    const name = this.utf()
    this.raw(8) // serialVersionUID
    const desc: ClassDesc = { name, flags: 0, fields: [], superDesc: null }
    this.newHandle(desc)
    desc.flags = this.u8()
    const count = this.u16()
    for (let i = 0; i < count; i++) {
      const type = String.fromCharCode(this.u8())
      const fname = this.utf()
      if (type === 'L' || type === '[') this.content() // nome da classe do campo
      desc.fields.push({ type, name: fname })
    }
    this.annotations()
    desc.superDesc = this.classDesc()
    return desc
  }

  /** Pula/coleta o que vem até TC_ENDBLOCKDATA. */
  private annotations(): unknown[] {
    const out: unknown[] = []
    for (;;) {
      const v = this.content()
      if (v === END) return out
      out.push(v)
    }
  }

  private primitive(type: string): JavaValue {
    switch (type) {
      case 'B': {
        const b = this.u8()
        return b > 127 ? b - 256 : b
      }
      case 'C':
        return String.fromCharCode(this.u16())
      case 'D': {
        this.need(8)
        const v = this.view.getFloat64(this.pos)
        this.pos += 8
        return v
      }
      case 'F': {
        this.need(4)
        const v = this.view.getFloat32(this.pos)
        this.pos += 4
        return v
      }
      case 'I':
        return this.i32()
      case 'J': {
        this.need(8)
        const v = this.view.getBigInt64(this.pos)
        this.pos += 8
        return v
      }
      case 'S': {
        this.need(2)
        const v = this.view.getInt16(this.pos)
        this.pos += 2
        return v
      }
      case 'Z':
        return this.u8() !== 0
      default:
        throw new Error(`Tipo de campo desconhecido: ${type}`)
    }
  }

  private object() {
    const desc = this.classDesc()
    if (!desc) throw new Error('Objeto sem classe no arquivo.')
    const obj: Record<string, unknown> = { $class: desc.name }
    this.newHandle(obj)
    // Da superclasse para a subclasse
    const chain: ClassDesc[] = []
    for (let d: ClassDesc | null = desc; d; d = d.superDesc) chain.unshift(d)
    for (const d of chain) {
      if (d.flags & SC_EXTERNALIZABLE) {
        if (!(d.flags & SC_BLOCK_DATA)) throw new Error('Formato antigo não suportado.')
        obj.$extra = this.annotations()
        continue
      }
      if (!(d.flags & SC_SERIALIZABLE)) continue
      for (const f of d.fields) {
        obj[f.name] = f.type === 'L' || f.type === '[' ? this.content() : this.primitive(f.type)
      }
      if (d.flags & SC_WRITE_METHOD) {
        const extra = this.annotations()
        if (d.name === 'java.util.ArrayList' || d.name === 'java.util.LinkedList') {
          obj.$items = extra.filter((x) => !(x && typeof x === 'object' && '$block' in x))
        } else if (extra.length) {
          obj.$extra = extra
        }
      }
    }
    return obj
  }

  private array() {
    const desc = this.classDesc()
    const len = this.i32()
    const out: unknown[] = []
    this.newHandle(out)
    const elem = desc?.name.charAt(1) || 'L'
    for (let i = 0; i < len; i++) {
      out.push(elem === 'L' || elem === '[' ? this.content() : this.primitive(elem))
    }
    return out
  }
}

const END = Symbol('end')

export function readJavaObject(bytes: Uint8Array): unknown {
  return new JavaReader(bytes).readStream()
}
