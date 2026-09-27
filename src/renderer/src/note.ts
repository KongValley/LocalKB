import type Vditor from 'vditor'
import type { EditorMode, GraphData } from '../../preload/api'
import { buildExportHtml, renderStaticHtml } from './export'
import {
  activeNote,
  defaultVault,
  dirOfRel,
  fileNameOf,
  markSaved,
  refreshPrivacy,
  setAutosaveHook,
  splitNodeId,
  store,
  syncState
} from './store'
import { vaultUrl } from './vault-url'

/** 笔记生命周期唯一入口：打开 / 保存 / 新建 / 重命名 / 删除 / 每日笔记 */

const AUTOSAVE_DELAY_MS = 800

let editorRef: Vditor | null = null
let saveTimer: number | null = null

export function setEditor(v: Vditor | null): void {
  editorRef = v
  if (v && v.getValue() !== store.openContent) v.setValue(store.openContent)
}

export function cancelPendingSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

export function scheduleAutoSave(): void {
  if (!store.activeId) return
  cancelPendingSave()
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void flush()
  }, AUTOSAVE_DELAY_MS)
}

setAutosaveHook(scheduleAutoSave)

/** 立即落盘（Ctrl+S / 切笔记 / 关闭窗口前） */
export async function flush(): Promise<boolean> {
  cancelPendingSave()
  const id = store.activeId
  if (!id) return true
  const content = editorRef?.getValue() ?? store.openContent
  if (content === store.savedContent) {
    store.openContent = content
    if (store.dirty) markSaved(content)
    return true
  }
  store.saving = true
  try {
    const r = await window.kb.noteWrite(id, content)
    if (!r.ok) {
      alert(`保存失败：${r.error}`)
      return false
    }
    store.openContent = content
    markSaved(content)
    return true
  } finally {
    store.saving = false
  }
}

function applyDocument(id: string, content: string): void {
  store.activeId = id
  store.openContent = content
  store.savedContent = content
  store.dirty = false
  store.charCount = content.length
  store.lineCount = content === '' ? 1 : content.split('\n').length
  editorRef?.setValue(content)
  syncState()
}

export async function openNote(id: string, opts: { force?: boolean } = {}): Promise<boolean> {
  cancelPendingSave()
  if (!opts.force && id === store.activeId && store.openContent === store.savedContent) return true
  if (store.dirty) {
    const ok = await flush()
    if (!ok) return false
  }
  const r = await window.kb.noteRead(id)
  if (!r.ok) {
    alert(`打开失败：${r.error}`)
    return false
  }
  applyDocument(id, r.content)
  return true
}

/** 外部改动（文件监听）后重载当前笔记；内容未变则不动编辑器，避免光标跳动 */
export async function reloadActive(): Promise<void> {
  const id = store.activeId
  if (!id || store.dirty) return
  const r = await window.kb.noteRead(id)
  if (!r.ok) return
  if (r.content === store.savedContent) return
  applyDocument(id, r.content)
}

export function closeActive(): void {
  cancelPendingSave()
  store.activeId = null
  store.openContent = ''
  store.savedContent = ''
  store.dirty = false
  store.charCount = 0
  store.lineCount = 1
  editorRef?.setValue('')
  syncState()
}

/** 新建笔记：默认落在当前筛选根，否则默认根 */
export async function createNote(target?: { vaultId?: string; dir?: string }): Promise<string | null> {
  if (store.dirty) await flush()
  const vaultId =
    target?.vaultId ?? store.activeFolder?.vaultId ?? defaultVault()?.id ?? null
  if (!vaultId) {
    alert('请先添加知识库目录')
    return null
  }
  const dir = target?.dir ?? (target?.vaultId ? '' : (store.activeFolder?.dir ?? ''))
  const r = await window.kb.noteCreate(vaultId, dir, '未命名笔记')
  if (!r.ok) {
    alert(`新建失败：${r.error}`)
    return null
  }
  await openNote(r.id)
  return r.id
}

export async function renameActive(newTitle: string): Promise<boolean> {
  const id = store.activeId
  if (!id) return false
  const title = newTitle.trim().replace(/[\\/:*?"<>|]/g, ' ')
  if (!title) return false
  const note = activeNote()
  // 隐私笔记：改的是密码负载里的原始路径（密文文件名保持不透明）
  const { rel } = note?.private && note.originalRel ? { rel: note.originalRel } : splitNodeId(id)
  const dir = dirOfRel(rel)
  const target = dir ? `${dir}/${title}.md` : `${title}.md`
  if (target === rel) return true
  if (store.dirty) await flush()
  const r = await window.kb.noteRenameMove(id, target)
  if (!r.ok) {
    alert(`重命名失败：${r.error}`)
    return false
  }
  store.activeId = r.id
  syncState()
  return true
}

export async function deleteActive(): Promise<boolean> {
  const id = store.activeId
  if (!id) return false
  cancelPendingSave()
  const r = await window.kb.noteDelete(id)
  if (!r.ok) {
    alert(`移入回收站失败：${r.error}`)
    return false
  }
  closeActive()
  return true
}

export async function daily(): Promise<string | null> {
  const r = await window.kb.daily()
  if (!r.ok) {
    alert(`打开每日笔记失败：${r.error}`)
    return null
  }
  await openNote(r.id)
  return r.id
}

export async function rescan(): Promise<void> {
  const r = await window.kb.scan()
  if (!r.ok) {
    store.vaultReady = false
    return
  }
  store.notes = r.notes
  store.tags = r.tags
  store.folders = r.folders
  store.vaults = r.vaults
  store.defaultVaultId = r.defaultVaultId
  store.graph = null
  store.vaultReady = r.vaults.length > 0
  await refreshPrivacy()
  if (store.activeId && !store.dirty && !store.notes.some((n) => n.id === store.activeId)) {
    closeActive()
  }
}

export async function ensureGraph(): Promise<GraphData | null> {
  if (store.graph) return store.graph
  const r = await window.kb.graph()
  if (!r.ok) return null
  store.graph = { nodes: r.nodes, links: r.links }
  return store.graph
}

export function setMode(mode: EditorMode): void {
  if (mode === store.mode) return
  store.openContent = editorRef?.getValue() ?? store.openContent
  store.mode = mode
}

/** 浅色 → 深色 → 护眼 → 浅色 */
export function toggleTheme(): void {
  store.theme = store.theme === 'light' ? 'dark' : store.theme === 'dark' ? 'eye' : 'light'
}

function currentMarkdown(): string {
  return editorRef?.getValue() ?? store.openContent
}

export async function exportHtmlDoc(): Promise<void> {
  const id = store.activeId
  if (!id) return
  const name = fileNameOf(splitNodeId(id).rel)
  const r = await window.api.savePathDialog({ defaultName: `${name}.html`, kind: 'html' })
  if (r.canceled) return
  // HTML 保持相对路径（便携）
  const html = buildExportHtml(name, await renderStaticHtml(currentMarkdown()))
  const w = await window.api.exportHtml(r.path, html)
  if (!w.ok) alert(`导出失败：${w.error}`)
}

export async function exportPdfDoc(): Promise<void> {
  const id = store.activeId
  if (!id) return
  const { vaultId, rel } = splitNodeId(id)
  const name = fileNameOf(rel)
  const r = await window.api.savePathDialog({ defaultName: `${name}.pdf`, kind: 'pdf' })
  if (r.canceled) return
  const body = await renderStaticHtml(currentMarkdown())
  const html = buildExportHtml(name, rewriteLocalImages(body, dirOfRel(rel), vaultId))
  const w = await window.api.exportPdf(r.path, html)
  if (!w.ok) alert(`导出失败：${w.error}`)
}

/** 导出 PDF 前把相对 assets/… 图片改写为 kbvault:// 绝对地址（打印窗口可加载） */
export function rewriteLocalImages(bodyHtml: string, noteDir: string, vaultId: string): string {
  const host = document.createElement('div')
  host.innerHTML = bodyHtml
  for (const img of host.querySelectorAll('img')) {
    const url = vaultUrl(img.getAttribute('src') ?? '', noteDir, vaultId)
    if (url) img.setAttribute('src', url)
  }
  return host.innerHTML
}
