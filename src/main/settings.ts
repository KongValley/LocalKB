import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { AiSettings, KbSettings, VaultInfo } from '../preload/api'
import {
  MANAGED_ROOT_ID,
  MANAGED_VAULT_NAME,
  needsMigration,
  newVaultId,
  normalizeSettings,
  pathsConflict
} from './settings-model'

export {
  DEFAULT_AI,
  MANAGED_VAULT_NAME,
  needsMigration,
  newVaultId,
  normalizeSettings,
  pathsConflict
} from './settings-model'

const FILE = (): string => join(app.getPath('userData'), 'kb-settings.json')

let cache: KbSettings | null = null

/* ── API Key：以系统凭据加密落盘（Windows DPAPI / macOS Keychain / Linux SecretService） ──
   落盘字段为 `ai.apiKeyEnc`（base64），内存 cache 中始终是明文，供 Authorization 与设置页回显。

   注意：Windows 上（Chromium OSCrypt）AES 密钥载体是 `userData/Local State`；该文件缺失时
   safeStorage 会退化为**进程内临时密钥**，密文无法被下次启动解密 —— 因此以它的存在作为加密可用前提，
   否则改存明文（下次启动密钥载体就绪后会自动迁移为密文）。 */

function encryptionAvailable(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    return existsSync(join(app.getPath('userData'), 'Local State'))
  } catch {
    return false
  }
}

/** 加密并自检可解回；失败返回 null（调用方回退明文） */
function encryptSecret(plain: string): string | null {
  try {
    const enc = safeStorage.encryptString(plain).toString('base64')
    if (safeStorage.decryptString(Buffer.from(enc, 'base64')) !== plain) return null
    return enc
  } catch (e) {
    console.warn('kb: API Key 加密失败，改以明文保存', e)
    return null
  }
}

function decryptSecret(enc: string): string {
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch (e) {
    console.warn('kb: API Key 解密失败，请在设置页重新输入', e)
    return ''
  }
}

/** 落盘视图：加密可用时只写 apiKeyEnc，不写明文 apiKey */
function fileViewOf(settings: KbSettings): Record<string, unknown> {
  const base = {
    defaultVaultId: settings.defaultVaultId,
    vaults: settings.vaults,
    privacy: settings.privacy
  }
  const key = settings.ai.apiKey.trim()
  if (!key) {
    return { ...base, ai: { baseURL: settings.ai.baseURL, model: settings.ai.model, apiKeyEnc: '' } }
  }
  if (!encryptionAvailable()) {
    console.warn('kb: safeStorage/密钥载体不可用，API Key 以明文保存（下次启动会自动改为密文）')
    return { ...base, ai: settings.ai }
  }
  const enc = encryptSecret(key)
  if (!enc) {
    console.warn('kb: API Key 加密自检失败，改以明文保存')
    return { ...base, ai: settings.ai }
  }
  return { ...base, ai: { baseURL: settings.ai.baseURL, model: settings.ai.model, apiKeyEnc: enc } }
}

/** 从原始文件对象里读出密文与明文两种形态的 Key（只读，不做转化） */
function readSecret(raw: unknown): { enc: string | null; plain: string | null } {
  if (raw === null || typeof raw !== 'object' || !('ai' in raw)) return { enc: null, plain: null }
  const ai = raw.ai
  if (ai === null || typeof ai !== 'object') return { enc: null, plain: null }
  const enc = 'apiKeyEnc' in ai && typeof ai.apiKeyEnc === 'string' && ai.apiKeyEnc ? ai.apiKeyEnc : null
  const plain = 'apiKey' in ai && typeof ai.apiKey === 'string' && ai.apiKey ? ai.apiKey : null
  return { enc, plain }
}

export function getSettings(): KbSettings {
  if (cache) return cache
  let raw: unknown = null
  try {
    raw = JSON.parse(readFileSync(FILE(), 'utf-8'))
  } catch {
    raw = null
  }
  cache = normalizeSettings(raw)
  const secret = readSecret(raw)
  if (secret.enc) {
    cache = { ...cache, ai: { ...cache.ai, apiKey: decryptSecret(secret.enc) } }
  }
  // 旧结构（v1 vaultPath / 缺 vaults）或旧明文 Key → 首次加载即落盘为 v2 密文形态
  if (needsMigration(raw) || (secret.plain !== null && encryptionAvailable())) {
    try {
      writeFileSync(FILE(), JSON.stringify(fileViewOf(cache), null, 2), 'utf-8')
    } catch (e) {
      console.warn('kb: settings 迁移写盘失败', e)
    }
  }
  return cache
}

export function saveSettings(settings: KbSettings): KbSettings {
  cache = normalizeSettings(settings)
  writeFileSync(FILE(), JSON.stringify(fileViewOf(cache), null, 2), 'utf-8')
  return cache
}

export function savePartial(patch: { ai?: Partial<AiSettings> }): KbSettings {
  const current = getSettings()
  return saveSettings({
    defaultVaultId: current.defaultVaultId,
    vaults: current.vaults,
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    privacy: current.privacy
  })
}

/* ── 根注册表 ── */

function mutate(patch: (next: KbSettings) => void): KbSettings {
  const s = getSettings()
  const next: KbSettings = {
    defaultVaultId: s.defaultVaultId,
    vaults: s.vaults.map((v) => ({ ...v })),
    ai: { ...s.ai },
    privacy: s.privacy
  }
  patch(next)
  return saveSettings(next)
}

export function getRoots(): VaultInfo[] {
  return getSettings().vaults
}

export function findRoot(id: string): VaultInfo | null {
  return getSettings().vaults.find((v) => v.id === id) ?? null
}

export function defaultRoot(): VaultInfo | null {
  const s = getSettings()
  return s.vaults.find((v) => v.id === s.defaultVaultId) ?? s.vaults[0] ?? null
}

export function addRoot(path: string): VaultInfo {
  const p = (path ?? '').trim()
  if (!p || !isAbsolute(p)) throw new Error(`请提供绝对路径：${path}`)
  for (const v of getSettings().vaults) {
    if (pathsConflict(v.path, p)) throw new Error(`不能与已有知识库目录嵌套：${v.path}`)
  }
  mkdirSync(p, { recursive: true })
  const root: VaultInfo = { id: newVaultId(), path: p, name: basename(p) || MANAGED_VAULT_NAME }
  mutate((next) => {
    next.vaults.push(root)
    if (!next.defaultVaultId) next.defaultVaultId = root.id
  })
  return getSettings().vaults.find((v) => v.id === root.id) ?? root
}

export function removeRoot(id: string): void {
  if (!findRoot(id)) throw new Error('知识库目录不存在')
  mutate((next) => {
    next.vaults = next.vaults.filter((v) => v.id !== id)
    if (next.defaultVaultId === id) next.defaultVaultId = next.vaults[0]?.id ?? null
  })
}

export function setDefaultRoot(id: string): void {
  if (!findRoot(id)) throw new Error('知识库目录不存在')
  mutate((next) => {
    next.defaultVaultId = id
  })
}

export function renameRoot(id: string, name: string): void {
  const n = (name ?? '').trim()
  if (!n) throw new Error('名称不能为空')
  if (!findRoot(id)) throw new Error('知识库目录不存在')
  mutate((next) => {
    const hit = next.vaults.find((v) => v.id === id)
    if (hit) hit.name = n
  })
}

/** 首启托管根：Documents/知识库，失败回退 userData/vault，再失败保持空（页面降级） */
export function ensureManagedRoot(): VaultInfo | null {
  const s = getSettings()
  if (s.vaults.length > 0) return defaultRoot()
  const candidates = [
    join(app.getPath('documents'), MANAGED_VAULT_NAME),
    join(app.getPath('userData'), 'vault')
  ]
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true })
      const root: VaultInfo = { id: MANAGED_ROOT_ID, path: dir, name: MANAGED_VAULT_NAME }
      saveSettings({ defaultVaultId: root.id, vaults: [root], ai: s.ai, privacy: s.privacy })
      return root
    } catch (e) {
      console.warn('kb: 无法创建默认知识库目录', dir, e)
    }
  }
  return null
}
