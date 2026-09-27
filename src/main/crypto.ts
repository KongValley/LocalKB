import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  type ScryptOptions
} from 'node:crypto'

/**
 * 隐私空间加密容器（纯逻辑，不 import electron，可 node 直跑单测）。
 *
 * 文件格式：
 *   "KBPRIVATE1\n" + <header JSON> + "\n" + <AES-256-GCM 密文>
 *   header = {"v":1,"kdf":{"N":32768,"r":8,"p":1,"keyLen":32},"salt":b64,"iv":b64,"tag":b64}
 *   密文明文 = JSON { relPath, content }（UTF-8）
 * header 作为 GCM 的 AAD 参与认证，防止篡改盐/IV/参数。
 */

export const PRIVATE_MAGIC = 'KBPRIVATE1'
export const PRIVATE_EXT = '.kbp'

export interface KdfParams {
  N: number
  r: number
  p: number
  keyLen: number
}

export const DEFAULT_KDF: KdfParams = { N: 32768, r: 8, p: 1, keyLen: 32 }

export interface PrivatePayload {
  /** 原始（移入隐私空间前）的库内相对路径，posix 分隔符 */
  relPath: string
  content: string
}

interface Header {
  v: number
  kdf: KdfParams
  salt: string
  iv: string
  tag: string
}

export function deriveKey(password: string, salt: Buffer, kdf: KdfParams): Buffer {
  const options: ScryptOptions = { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 }
  return scryptSync(password.normalize('NFKC'), salt, kdf.keyLen, options)
}

/** 密码校验值（设置里存它，用于快速判断密码是否正确；文件各自用独立盐） */
export function passwordVerifier(password: string, salt: Buffer, kdf: KdfParams): Buffer {
  return deriveKey(`verify:${password}`, salt, kdf)
}

export function verifierMatches(password: string, salt: Buffer, kdf: KdfParams, expected: Buffer): boolean {
  const actual = passwordVerifier(password, salt, kdf)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isPrivateFile(buf: Buffer): boolean {
  return buf.length > PRIVATE_MAGIC.length + 2 && buf.subarray(0, PRIVATE_MAGIC.length).toString('utf-8') === PRIVATE_MAGIC
}

export function encryptPrivate(payload: PrivatePayload, password: string, kdf: KdfParams = DEFAULT_KDF): Buffer {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(password, salt, kdf)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  // GCM 的 AAD 用「不含 tag 的头部规范串」，保证盐/IV/参数不可篡改
  cipher.setAAD(headerAad(kdf, salt, iv))
  // 必须 Buffer 进 Buffer 出：让密文经过字符串编码会破坏非 UTF-8 字节序列
  const out = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), 'utf-8')),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()
  const head = JSON.stringify({
    v: 1,
    kdf,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  } satisfies Header)
  return Buffer.concat([
    Buffer.from(`${PRIVATE_MAGIC}\n${head}\n`, 'utf-8'),
    out
  ])
}

function headerAad(kdf: KdfParams, salt: Buffer, iv: Buffer): Buffer {
  return Buffer.from(
    JSON.stringify({ v: 1, kdf, salt: salt.toString('base64'), iv: iv.toString('base64') }),
    'utf-8'
  )
}

export class PrivateDecryptError extends Error {}

/** 解密；密码错误 / 文件损坏 / 被篡改一律抛 PrivateDecryptError */
export function decryptPrivate(buf: Buffer, password: string): PrivatePayload {
  try {
    if (!isPrivateFile(buf)) throw new Error('不是隐私空间文件')
    const magicEnd = buf.indexOf(0x0a)
    const headerEnd = buf.indexOf(0x0a, magicEnd + 1)
    const header = JSON.parse(buf.subarray(magicEnd + 1, headerEnd).toString('utf-8')) as Header
    const salt = Buffer.from(header.salt, 'base64')
    const iv = Buffer.from(header.iv, 'base64')
    const tag = Buffer.from(header.tag, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, salt, header.kdf), iv)
    decipher.setAAD(headerAad(header.kdf, salt, iv))
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(buf.subarray(headerEnd + 1)), decipher.final()])
    const payload = JSON.parse(plain.toString('utf-8')) as PrivatePayload
    if (typeof payload.relPath !== 'string' || typeof payload.content !== 'string') {
      throw new Error('负载结构不正确')
    }
    return payload
  } catch (e) {
    if (e instanceof PrivateDecryptError) throw e
    throw new PrivateDecryptError('密码错误或隐私文件已损坏')
  }
}
