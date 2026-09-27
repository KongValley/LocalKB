import { reactive, watch } from 'vue'
import type {
  AppTheme,
  EditorMode,
  FolderEntry,
  GraphData,
  NoteMeta,
  TagCount,
  VaultInfo
} from '../../preload/api'

export const store = reactive({
  vaultReady: false,
  vaults: [] as VaultInfo[],
  defaultVaultId: null as string | null,
  notes: [] as NoteMeta[],
  tags: [] as TagCount[],
  folders: [] as FolderEntry[],
  activeId: null as string | null,
  openContent: '' as string,
  savedContent: '' as string,
  saving: false,
  dirty: false,
  activeFolder: null as { vaultId: string; dir: string } | null,
  graph: null as GraphData | null,
  sideCollapsed: false,
  mode: (localStorage.getItem('md:mode') as EditorMode | null) ?? 'sv',
  theme: readStoredTheme(),
  charCount: 0,
  lineCount: 1
})

function readStoredTheme(): AppTheme {
  const raw = localStorage.getItem('md:theme')
  return raw === 'dark' || raw === 'eye' || raw === 'light' ? raw : 'light'
}

/** note.ts 注入的自动保存调度（避免 store ↔ note 循环依赖） */
let autosaveHook: (() => void) | null = null

export function setAutosaveHook(fn: () => void): void {
  autosaveHook = fn
}

/* ── 根 / id 工具 ── */

export function splitNodeId(id: string): { vaultId: string; rel: string } {
  const i = id.indexOf('/')
  if (i <= 0 || i === id.length - 1) throw new Error(`非法笔记标识：${id}`)
  return { vaultId: id.slice(0, i), rel: id.slice(i + 1) }
}

export function vaultById(vaultId: string): VaultInfo | null {
  return store.vaults.find((v) => v.id === vaultId) ?? null
}

export function vaultNameById(vaultId: string): string {
  return vaultById(vaultId)?.name ?? '知识库'
}

export function defaultVault(): VaultInfo | null {
  return store.vaults.find((v) => v.id === store.defaultVaultId) ?? store.vaults[0] ?? null
}

export function vaultNameOf(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i < 0 ? path : path.slice(i + 1)
}

export function fileNameOf(rel: string): string {
  return rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, '')
}

export function dirOfRel(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

/* ── 当前笔记 ── */

export function activeNote(): NoteMeta | null {
  return store.notes.find((n) => n.id === store.activeId) ?? null
}

export function activeTitle(): string {
  const note = activeNote()
  if (note) return note.title
  return store.activeId ? fileNameOf(store.activeId) : ''
}

export function activeVaultName(): string {
  if (store.activeId) {
    try {
      return vaultNameById(splitNodeId(store.activeId).vaultId)
    } catch {
      /* 落到默认 */
    }
  }
  return defaultVault()?.name ?? '知识库'
}

export function syncState(): void {
  window.api.syncState({ dirty: store.dirty, noteTitle: activeTitle() || '未选择笔记' })
}

export function onEditorInput(value: string): void {
  store.openContent = value
  store.dirty = value !== store.savedContent
  store.lineCount = value === '' ? 1 : value.split('\n').length
  syncState()
  autosaveHook?.()
}

export function markSaved(content: string): void {
  store.savedContent = content
  store.dirty = false
  syncState()
}

watch(
  () => store.mode,
  (m) => localStorage.setItem('md:mode', m)
)

watch(
  () => store.theme,
  (t) => {
    localStorage.setItem('md:theme', t)
    document.documentElement.dataset.theme = t
  }
)

document.documentElement.dataset.theme = store.theme
