import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { VaultInfo } from '../preload/api'
import {
  DEFAULT_KDF,
  PRIVATE_EXT,
  decryptPrivate,
  encryptPrivate,
  isPrivateFile,
  passwordVerifier,
  verifierMatches,
  type KdfParams,
  type PrivatePayload
} from './crypto'
import { getRoots, getSettings, saveSettings } from './settings'
import { baseName, normalizeRel, resolveInside, toPosix } from './vault'

/**
 * 隐私空间：每个知识库根目录下的 `.private/`，内含 AES-256-GCM 加密的 `<不透明 id>.kbp`。
 * 密码只在解锁后驻留主进程内存（锁定/退出即丢），磁盘只有密文。
 */

export const PRIVATE_DIR = '.private'

let unlockedPassword: string | null = null

export interface PrivateEntry {
  vaultId: string
  /** 隐私空间内的真实相对路径（'.private/<id>.kbp'） */
  relPath: string
  /** 解密出的原始相对路径（展示用） */
  originalRel: string
  content: string
  mtimeMs: number
  size: number
}

export function isPrivateRel(rel: string): boolean {
  return rel === PRIVATE_DIR || rel.startsWith(`${PRIVATE_DIR}/`)
}

export function privacyConfigured(): boolean {
  return getSettings().privacy !== null
}

export function isUnlocked(): boolean {
  return unlockedPassword !== null
}

/** 解锁所需密码（已解锁时直接返回内存中的密码） */
export function currentPassword(): string {
  if (!unlockedPassword) throw new Error('隐私空间未解锁')
  return unlockedPassword
}

export function lockPrivate(): void {
  unlockedPassword = null
}

/** 校验密码；成功则记住（= 解锁） */
export function unlockPrivate(password: string): boolean {
  const privacy = getSettings().privacy
  if (!privacy) throw new Error('尚未设置隐私空间密码')
  const ok = verifierMatches(
    password,
    Buffer.from(privacy.salt, 'base64'),
    privacy.kdf,
    Buffer.from(privacy.verifier, 'base64')
  )
  if (ok) unlockedPassword = password
  return ok
}

export function setupPrivacy(password: string): void {
  const s = getSettings()
  if (s.privacy) throw new Error('隐私空间密码已存在，请使用「修改密码」')
  const salt = randomBytes(16)
  saveSettings({
    ...s,
    privacy: {
      salt: salt.toString('base64'),
      verifier: passwordVerifier(password, salt, DEFAULT_KDF).toString('base64'),
      kdf: DEFAULT_KDF
    }
  })
  unlockedPassword = password
}

/** 隐私空间内全部密文文件（根内相对路径，按根分组前） */
export function listPrivateRels(rootPath: string): string[] {
  const dir = join(rootPath, PRIVATE_DIR)
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(PRIVATE_EXT))
    .map((e) => `${PRIVATE_DIR}/${e.name}`)
}

/** 解密全库隐私文件；单个文件损坏只跳过并告警，不阻断整体 */
export function readPrivateEntries(): PrivateEntry[] {
  const password = currentPassword()
  const out: PrivateEntry[] = []
  for (const root of getRoots()) {
    for (const relPath of listPrivateRels(root.path)) {
      try {
        const abs = resolveInside(root.path, relPath)
        const st = statSync(abs)
        const payload = decryptPrivate(readFileSync(abs), password)
        out.push({
          vaultId: root.id,
          relPath,
          originalRel: payload.relPath,
          content: payload.content,
          mtimeMs: st.mtimeMs,
          size: st.size
        })
      } catch (e) {
        console.warn('kb: 隐私文件解密失败，已跳过', root.path, relPath, e)
      }
    }
  }
  return out
}

function newPrivateRel(rootPath: string): string {
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
  const rel = `${PRIVATE_DIR}/${id}${PRIVATE_EXT}`
  mkdirSync(join(rootPath, PRIVATE_DIR), { recursive: true })
  return rel
}

/** 把普通笔记移入隐私空间：加密落盘后删除明文，返回隐私空间内的相对路径 */
export function moveIntoPrivacy(root: { path: string }, rel: string, originalRel: string, content: string): string {
  const target = newPrivateRel(root.path)
  writeFileSync(join(root.path, target), encryptPrivate({ relPath: originalRel, content }, currentPassword()))
  rmSync(resolveInside(root.path, rel), { force: true })
  return target
}

/** 移出隐私空间：按原名写回普通笔记（重名 ~N），删除密文，返回新相对路径 */
export function moveOutOfPrivacy(root: { path: string }, rel: string, newRel: string): string {
  const payload = decryptPrivate(readFileSync(resolveInside(root.path, rel)), currentPassword())
  const abs = resolveInside(root.path, newRel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, payload.content, 'utf-8')
  rmSync(resolveInside(root.path, rel), { force: true })
  return newRel
}

/** 隐私空间内改名/换目录：只改密码负载里的原始路径，密文文件本身不移动 */
export function renamePrivateNote(root: { path: string }, rel: string, newOriginalRel: string): void {
  const abs = resolveInside(root.path, rel)
  const payload = decryptPrivate(readFileSync(abs), currentPassword())
  writeFileSync(abs, encryptPrivate({ ...payload, relPath: newOriginalRel }, currentPassword()))
}

/** 读取隐私笔记的完整负载（正文 + 原始路径） */
export function readPrivatePayload(root: { path: string }, rel: string): PrivatePayload {
  return decryptPrivate(readFileSync(resolveInside(root.path, rel)), currentPassword())
}

/** 全部根的隐私文件总数（无需解锁，只看文件） */
export function countPrivateFiles(): number {
  return getRoots().reduce((sum, root) => sum + listPrivateRels(root.path).length, 0)
}

/** 写回隐私笔记正文（原路径不变） */
export function writePrivateNote(root: { path: string }, rel: string, content: string): void {
  const abs = resolveInside(root.path, rel)
  const payload = decryptPrivate(readFileSync(abs), currentPassword())
  writeFileSync(abs, encryptPrivate({ ...payload, content }, currentPassword()))
}

/** 修改密码：两阶段重加密（先写 .new，再统一改名），最后更新校验值 */
export function changePrivacyPassword(oldPassword: string, newPassword: string): number {
  if (!unlockPrivate(oldPassword)) throw new Error('原密码不正确')
  const pending: { abs: string; next: string }[] = []
  try {
    for (const root of getRoots()) {
      for (const rel of listPrivateRels(root.path)) {
        const abs = resolveInside(root.path, rel)
        const payload = decryptPrivate(readFileSync(abs), oldPassword)
        const next = `${abs}.new`
        writeFileSync(next, encryptPrivate(payload, newPassword))
        pending.push({ abs, next })
      }
    }
    for (const p of pending) renameSync(p.next, p.abs)
  } catch (e) {
    for (const p of pending) rmSync(p.next, { force: true })
    throw e
  }
  const s = getSettings()
  const salt = randomBytes(16)
  saveSettings({
    ...s,
    privacy: {
      salt: salt.toString('base64'),
      verifier: passwordVerifier(newPassword, salt, DEFAULT_KDF).toString('base64'),
      kdf: DEFAULT_KDF
    }
  })
  unlockedPassword = newPassword
  return pending.length
}

/* 类型收敛：供 kb-ipc 校验 id 形态时复用 */
export type { KdfParams, PrivatePayload }
