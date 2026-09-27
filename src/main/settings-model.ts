import { basename, resolve, sep } from 'node:path'
import type { AiSettings, KbSettings, PrivacyKdf, PrivacySettings, VaultInfo } from '../preload/api'

/**
 * 纯逻辑（不 import electron，可被 node 直跑单测）：
 * settings v1→v2 归一化、路径冲突判定、根 id 生成。
 */

export const DEFAULT_AI: AiSettings = {
  baseURL: 'https://api.openai.com',
  apiKey: '',
  model: ''
}

export const MANAGED_VAULT_NAME = '知识库'
export const MANAGED_ROOT_ID = 'default'
const ID_RE = /^[A-Za-z0-9]+$/

export function newVaultId(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`
}

export function isValidVaultId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id)
}

function normalizeAi(raw: unknown): AiSettings {
  const ai = (raw ?? {}) as Partial<AiSettings>
  return {
    baseURL: typeof ai.baseURL === 'string' && ai.baseURL ? ai.baseURL : DEFAULT_AI.baseURL,
    apiKey: typeof ai.apiKey === 'string' ? ai.apiKey : '',
    model: typeof ai.model === 'string' ? ai.model : ''
  }
}

function normalizeKdf(raw: unknown): PrivacyKdf | null {
  if (raw === null || typeof raw !== 'object') return null
  const N = 'N' in raw && typeof raw.N === 'number' && raw.N > 0 ? raw.N : 0
  const r = 'r' in raw && typeof raw.r === 'number' && raw.r > 0 ? raw.r : 0
  const p = 'p' in raw && typeof raw.p === 'number' && raw.p > 0 ? raw.p : 0
  const keyLen = 'keyLen' in raw && typeof raw.keyLen === 'number' && raw.keyLen > 0 ? raw.keyLen : 0
  return N && r && p && keyLen ? { N, r, p, keyLen } : null
}

function normalizePrivacy(raw: unknown): PrivacySettings | null {
  if (raw === null || typeof raw !== 'object') return null
  if (!('salt' in raw) || !('verifier' in raw) || !('kdf' in raw)) return null
  const { salt, verifier } = raw
  if (typeof salt !== 'string' || !salt || typeof verifier !== 'string' || !verifier) return null
  const kdf = normalizeKdf(raw.kdf)
  return kdf ? { salt, verifier, kdf } : null
}

/** 是否需要在加载时把文件重写为 v2（v1 vaultPath / 缺 vaults / 非法文件） */
export function needsMigration(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return true
  if ('vaultPath' in raw) return true
  if (!('vaults' in raw)) return true
  return !Array.isArray(raw.vaults)
}

/** 任意 raw → v2；v1 的 vaultPath 自动迁移为单根（id='default'） */
export function normalizeSettings(raw: unknown): KbSettings {
  const r = (raw ?? {}) as {
    vaultPath?: unknown
    vaults?: unknown
    defaultVaultId?: unknown
    ai?: unknown
    privacy?: unknown
  }
  const vaults: VaultInfo[] = []
  if (Array.isArray(r.vaults)) {
    for (const item of r.vaults) {
      const v = (item ?? {}) as Partial<VaultInfo>
      if (!isValidVaultId(v.id)) continue
      if (typeof v.path !== 'string' || !v.path) continue
      if (vaults.some((x) => x.id === v.id)) continue
      vaults.push({
        id: v.id,
        path: v.path,
        name: typeof v.name === 'string' && v.name ? v.name : basename(v.path)
      })
    }
  }
  if (vaults.length === 0 && typeof r.vaultPath === 'string' && r.vaultPath) {
    vaults.push({
      id: MANAGED_ROOT_ID,
      path: r.vaultPath,
      name: basename(r.vaultPath) || MANAGED_VAULT_NAME
    })
  }
  const defaultVaultId = vaults.some((v) => v.id === r.defaultVaultId)
    ? (r.defaultVaultId as string)
    : (vaults[0]?.id ?? null)
  return { defaultVaultId, vaults, ai: normalizeAi(r.ai), privacy: normalizePrivacy(r.privacy) }
}

function normPath(p: string): string {
  const abs = resolve(p)
  return process.platform === 'win32' ? abs.toLowerCase() : abs
}

/** 相同或互为祖先/后代 */
export function pathsConflict(a: string, b: string): boolean {
  const na = normPath(a)
  const nb = normPath(b)
  const withSep = (p: string): string => (p.endsWith(sep) ? p : p + sep)
  return na === nb || na.startsWith(withSep(nb)) || nb.startsWith(withSep(na))
}
