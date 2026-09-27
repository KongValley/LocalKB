import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

export function getSettings(): KbSettings {
  if (cache) return cache
  let raw: unknown = null
  try {
    raw = JSON.parse(readFileSync(FILE(), 'utf-8'))
  } catch {
    raw = null
  }
  cache = normalizeSettings(raw)
  // 旧结构（v1 的 vaultPath / 缺 vaults）首次加载即落盘为 v2
  if (needsMigration(raw)) {
    try {
      writeFileSync(FILE(), JSON.stringify(cache, null, 2), 'utf-8')
    } catch (e) {
      console.warn('kb: settings 迁移写盘失败', e)
    }
  }
  return cache
}

export function saveSettings(settings: KbSettings): KbSettings {
  cache = normalizeSettings(settings)
  writeFileSync(FILE(), JSON.stringify(cache, null, 2), 'utf-8')
  return cache
}

export function savePartial(patch: { ai?: Partial<AiSettings> }): KbSettings {
  const current = getSettings()
  return saveSettings({
    defaultVaultId: current.defaultVaultId,
    vaults: current.vaults,
    ai: { ...current.ai, ...(patch.ai ?? {}) }
  })
}

/* ── 根注册表 ── */

function mutate(patch: (next: KbSettings) => void): KbSettings {
  const s = getSettings()
  const next: KbSettings = {
    defaultVaultId: s.defaultVaultId,
    vaults: s.vaults.map((v) => ({ ...v })),
    ai: { ...s.ai }
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
      saveSettings({ defaultVaultId: root.id, vaults: [root], ai: s.ai })
      return root
    } catch (e) {
      console.warn('kb: 无法创建默认知识库目录', dir, e)
    }
  }
  return null
}
