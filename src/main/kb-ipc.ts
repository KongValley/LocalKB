import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { existsSync, readdirSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type {
  AiSettings,
  Err,
  FolderEntry,
  GraphData,
  GraphLink,
  NoteMeta,
  TagCount,
  VaultInfo,
  VaultListResult
} from '../preload/api'
import { askKbAi } from './ai'
import { effectiveDataDir, readPointer, setDataDir } from './data-dir'
import {
  changePrivacyPassword,
  countPrivateFiles,
  isPrivateRel,
  isUnlocked,
  lockPrivate,
  moveIntoPrivacy,
  moveOutOfPrivacy,
  privacyConfigured,
  readPrivateEntries,
  readPrivatePayload,
  renamePrivateNote,
  setupPrivacy,
  unlockPrivate,
  writePrivateNote
} from './private-space'
import {
  addRoot,
  defaultRoot,
  ensureManagedRoot,
  findRoot,
  getRoots,
  getSettings,
  removeRoot,
  renameRoot,
  savePartial,
  setDefaultRoot
} from './settings'
import {
  baseName,
  buildGraph,
  buildIndex,
  parseNote,
  type PrivateExtra,
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  ensureDaily,
  joinNodeId,
  listTodos,
  listTrash,
  purgeTrash,
  readNote,
  renameFolder,
  renameNote,
  resolveInside,
  restoreTrash,
  saveImage,
  searchRoots,
  splitNodeId,
  toggleTodo,
  uniqueRel,
  walkDirs,
  writeNote
} from './vault'

const WATCH_DEBOUNCE_MS = 400

let targetWin: BrowserWindow | null = null
const watchers = new Map<string, FSWatcher[]>()
let watchTimer: NodeJS.Timeout | null = null

function fail(e: unknown): Err {
  return { ok: false, error: String((e as Error)?.message ?? e) }
}

function broadcastIndex(source: 'op' | 'watch'): void {
  targetWin?.webContents.send('kb:event', { type: 'index', source })
}

/* ── 根解析 ── */

function rootById(vaultId: string): VaultInfo {
  const root = findRoot(String(vaultId ?? ''))
  if (!root) throw new Error('知识库目录已不存在')
  return root
}

function splitId(id: string): { root: VaultInfo; rel: string } {
  const { vaultId, rel } = splitNodeId(String(id ?? ''))
  return { root: rootById(vaultId), rel }
}

function vaultList(): VaultListResult {
  const s = getSettings()
  return {
    ok: true,
    vaults: s.vaults.map((v) => ({ ...v })),
    defaultVaultId: s.defaultVaultId
  }
}

/* ── 文件监听（每根一套；递归不可用则降级） ── */

function onFsEvent(): void {
  if (watchTimer) clearTimeout(watchTimer)
  watchTimer = setTimeout(() => {
    watchTimer = null
    broadcastIndex('watch')
  }, WATCH_DEBOUNCE_MS)
}

function stopWatchers(): void {
  for (const list of watchers.values()) {
    for (const w of list) {
      try {
        w.close()
      } catch {
        /* 关闭失败忽略 */
      }
    }
  }
  watchers.clear()
}

function startWatchers(roots: VaultInfo[]): void {
  stopWatchers()
  for (const root of roots) {
    if (!existsSync(root.path)) continue
    const list: FSWatcher[] = []
    try {
      list.push(watch(root.path, { recursive: true }, onFsEvent))
    } catch (e) {
      console.warn(`kb: fs.watch 递归监听不可用（${root.name}），降级为根目录 + 一级子目录`, e)
      try {
        list.push(watch(root.path, onFsEvent))
        for (const entry of readdirSync(root.path, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue
          try {
            list.push(watch(join(root.path, entry.name), onFsEvent))
          } catch {
            /* 单个子目录监听失败忽略 */
          }
        }
      } catch (e2) {
        console.warn('kb: 文件监听建立失败', root.path, e2)
      }
    }
    watchers.set(root.id, list)
  }
}

function syncRoots(): VaultInfo[] {
  const roots = getRoots()
  startWatchers(roots)
  return roots
}

/* ── 隐私空间（解锁时才进入索引） ── */

/** 解锁状态下按根分组的内存笔记（解密失败的文件已被跳过并告警） */
function privateExtrasByVault(): Record<string, PrivateExtra[]> {
  if (!isUnlocked()) return {}
  const map: Record<string, PrivateExtra[]> = {}
  for (const e of readPrivateEntries()) {
    const list = map[e.vaultId] ?? []
    list.push({
      relPath: e.relPath,
      originalRel: e.originalRel,
      content: e.content,
      mtimeMs: e.mtimeMs,
      size: e.size
    })
    map[e.vaultId] = list
  }
  return map
}

const privacyCount = (): number => countPrivateFiles()

/* ── 跨根合并 ── */

function mergeIndex(
  roots: VaultInfo[],
  extras = privateExtrasByVault()
): { notes: NoteMeta[]; tags: TagCount[]; folders: FolderEntry[] } {
  const notes: NoteMeta[] = []
  const folders: FolderEntry[] = []
  const tagMap = new Map<string, number>()
  for (const root of roots) {
    if (!existsSync(root.path)) continue
    let index
    try {
      index = buildIndex(root.path, root.id, extras[root.id] ?? [])
    } catch (e) {
      console.warn('kb: 索引失败，跳过该根', root.path, e)
      continue
    }
    notes.push(...index.notes)
    for (const t of index.tags) tagMap.set(t.name, (tagMap.get(t.name) ?? 0) + t.count)
    for (const dir of walkDirs(root.path)) folders.push({ vaultId: root.id, dir })
  }
  const tags = [...tagMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { notes, tags, folders }
}

function mergeGraph(roots: VaultInfo[], extras = privateExtrasByVault()): GraphData {
  const nodes: GraphData['nodes'] = []
  const links: GraphLink[] = []
  for (const root of roots) {
    if (!existsSync(root.path)) continue
    try {
      const g = buildGraph(root.path, root.id, buildIndex(root.path, root.id, extras[root.id] ?? []))
      nodes.push(...g.nodes)
      links.push(...g.links)
    } catch (e) {
      console.warn('kb: 图谱构建失败，跳过该根', root.path, e)
    }
  }
  return { nodes, links }
}

/* ── IPC 注册 ── */

export function registerKbIpc(win: BrowserWindow): void {
  targetWin = win
  ensureManagedRoot()
  syncRoots()

  const handle = <A extends unknown[]>(channel: string, fn: (...args: A) => unknown): void => {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await fn(...(args as A))
      } catch (e) {
        return fail(e)
      }
    })
  }

  /* 设置 */
  handle('kb:settings-get', () => ({ ok: true, settings: getSettings() }))
  handle('kb:settings-set', (patch: { ai?: Partial<AiSettings> }) => ({
    ok: true,
    settings: savePartial(patch ?? {})
  }))

  /* 知识库根 */
  handle('kb:vault-add', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '添加知识库目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || r.filePaths.length === 0) return { canceled: true }
    addRoot(r.filePaths[0])
    syncRoots()
    broadcastIndex('op')
    return vaultList()
  })

  handle('kb:vault-remove', (vaultId: string) => {
    removeRoot(vaultId)
    syncRoots()
    broadcastIndex('op')
    return vaultList()
  })

  handle('kb:vault-set-default', (vaultId: string) => {
    setDefaultRoot(vaultId)
    return vaultList()
  })

  handle('kb:vault-rename', (payload: { vaultId: string; name: string }) => {
    renameRoot(payload?.vaultId, payload?.name ?? '')
    return vaultList()
  })

  handle('kb:vault-retry-managed', () => {
    const root = ensureManagedRoot()
    if (!root) throw new Error('无法创建默认知识库目录，请手动选择')
    syncRoots()
    broadcastIndex('op')
    return vaultList()
  })

  handle('kb:vault-reveal', async (vaultId: string) => {
    const root = rootById(vaultId)
    const err = await shell.openPath(root.path)
    if (err) throw new Error(err)
    return { ok: true }
  })

  /* 应用数据目录 */
  handle('kb:data-dir-get', () => ({
    ok: true,
    dataDir: readPointer(),
    effectiveDir: effectiveDataDir()
  }))

  handle('kb:data-dir-pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '选择应用数据目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || r.filePaths.length === 0) return { canceled: true }
    return { ok: true, dir: r.filePaths[0] }
  })

  handle('kb:data-dir-set', (dir: string | null) => {
    setDataDir(dir, getRoots().map((r) => r.path))
    return { ok: true, requiresRestart: true as const }
  })

  ipcMain.on('kb:app-restart', () => {
    app.relaunch()
    app.exit(0)
  })

  /* 索引 */
  handle('kb:scan', () => {
    const s = getSettings()
    const merged = mergeIndex(s.vaults)
    return {
      ok: true,
      notes: merged.notes,
      tags: merged.tags,
      folders: merged.folders,
      vaults: s.vaults,
      defaultVaultId: s.defaultVaultId
    }
  })

  /* 笔记 */
  handle('kb:note-read', (id: string) => {
    const { root, rel } = splitId(id)
    if (isPrivateRel(rel)) return { ok: true, content: readPrivatePayload(root, rel).content }
    return { ok: true, content: readNote(root.path, rel) }
  })

  handle('kb:note-write', (payload: { id: string; content: string }) => {
    const { root, rel } = splitId(payload?.id)
    const content = String(payload?.content ?? '')
    if (isPrivateRel(rel)) {
      const originalRel = readPrivatePayload(root, rel).relPath
      writePrivateNote(root, rel, content)
      const st = statSync(resolveInside(root.path, rel))
      const meta = parseNote(rel, content, st, root.id)
      broadcastIndex('op')
      return {
        ok: true,
        meta: { ...meta, name: baseName(originalRel), dir: '', private: true, originalRel }
      }
    }
    const meta = writeNote(root.path, root.id, rel, content)
    broadcastIndex('op')
    return { ok: true, meta }
  })

  handle('kb:note-create', (payload: { vaultId: string; dir: string; title: string }) => {
    const root = rootById(payload?.vaultId)
    const rel = createNote(root.path, payload?.dir ?? '', payload?.title ?? '')
    broadcastIndex('op')
    return { ok: true, id: joinNodeId(root.id, rel) }
  })

  handle('kb:note-rename-move', (payload: { id: string; newRel: string }) => {
    const { root, rel } = splitId(payload?.id)
    const newRel = String(payload?.newRel ?? '')
    if (isPrivateRel(rel)) {
      // 隐私笔记改名 = 改密码负载里的原始路径，密文文件不移动
      renamePrivateNote(root, rel, newRel)
      broadcastIndex('op')
      return { ok: true, id: joinNodeId(root.id, rel) }
    }
    const next = renameNote(root.path, rel, newRel)
    broadcastIndex('op')
    return { ok: true, id: joinNodeId(root.id, next) }
  })

  handle('kb:note-delete', (id: string) => {
    const { root, rel } = splitId(id)
    const trashedRel = deleteNote(root.path, rel)
    broadcastIndex('op')
    return { ok: true, trashedRel }
  })

  /* 文件夹 */
  handle('kb:folder-create', (payload: { vaultId: string; dirPath: string }) => {
    const root = rootById(payload?.vaultId)
    const relPath = createFolder(root.path, payload?.dirPath ?? '')
    broadcastIndex('op')
    return { ok: true, relPath }
  })

  handle('kb:folder-rename', (payload: { vaultId: string; oldDir: string; newDir: string }) => {
    const root = rootById(payload?.vaultId)
    const relPath = renameFolder(root.path, payload?.oldDir ?? '', payload?.newDir ?? '')
    broadcastIndex('op')
    return { ok: true, relPath }
  })

  handle('kb:folder-delete', (payload: { vaultId: string; dirPath: string }) => {
    const root = rootById(payload?.vaultId)
    const trashedRel = deleteFolder(root.path, payload?.dirPath ?? '')
    broadcastIndex('op')
    return { ok: true, trashedRel }
  })

  /* 回收站（跨根合并，操作按根） */
  handle('kb:trash-list', () => {
    const items = getRoots().flatMap((root) => {
      try {
        return existsSync(root.path) ? listTrash(root.path, root.id) : []
      } catch (e) {
        console.warn('kb: 回收站列举失败，跳过该根', root.path, e)
        return []
      }
    })
    return { ok: true, items: items.sort((a, b) => b.mtimeMs - a.mtimeMs) }
  })

  handle('kb:trash-restore', (payload: { vaultId: string; trashedRel: string }) => {
    const root = rootById(payload?.vaultId)
    const relPath = restoreTrash(root.path, payload?.trashedRel ?? '')
    broadcastIndex('op')
    return { ok: true, relPath }
  })

  handle('kb:trash-purge', (payload: { vaultId: string; target: string }) => {
    const root = rootById(payload?.vaultId)
    purgeTrash(root.path, payload?.target ?? '')
    broadcastIndex('op')
    return { ok: true }
  })

  /* 检索 / 图谱 / 待办 */
  handle('kb:search', (query: string) => ({
    ok: true,
    results: searchRoots(getRoots(), String(query ?? ''), privateExtrasByVault())
  }))

  handle('kb:graph', () => {
    const g = mergeGraph(getRoots())
    return { ok: true, nodes: g.nodes, links: g.links }
  })

  handle('kb:todos', () => {
    const extras = privateExtrasByVault()
    const items = getRoots().flatMap((root) => {
      try {
        return existsSync(root.path)
          ? listTodos(root.path, root.id, buildIndex(root.path, root.id, extras[root.id] ?? []))
          : []
      } catch (e) {
        console.warn('kb: 待办列举失败，跳过该根', root.path, e)
        return []
      }
    })
    return { ok: true, items }
  })

  handle('kb:todo-toggle', (payload: { id: string; line: number; done: boolean }) => {
    const { root, rel } = splitId(payload?.id)
    toggleTodo(root.path, rel, payload?.line, !!payload?.done)
    broadcastIndex('op')
    return { ok: true }
  })

  /* 每日 / 图片 / AI */
  handle('kb:daily', () => {
    const root = defaultRoot()
    if (!root) throw new Error('尚未设置知识库目录')
    const rel = ensureDaily(root.path)
    broadcastIndex('op')
    return { ok: true, id: joinNodeId(root.id, rel) }
  })

  handle('kb:image-save', (payload: { id: string; name: string; dataBase64: string }) => {
    const { root, rel } = splitId(payload?.id)
    if (isPrivateRel(rel)) throw new Error('隐私空间内的笔记暂不支持插入图片')
    const saved = saveImage(root.path, payload?.name ?? '', payload?.dataBase64 ?? '')
    return { ok: true, markdown: `![](${saved})` }
  })

  /* ── 隐私空间 ── */
  handle('kb:privacy-status', () => ({
    ok: true,
    configured: privacyConfigured(),
    unlocked: isUnlocked(),
    count: privacyCount()
  }))

  handle('kb:privacy-setup', (password: string) => {
    const pw = String(password ?? '')
    if (pw.length < 6) throw new Error('密码至少 6 位')
    setupPrivacy(pw)
    broadcastIndex('op')
    return { ok: true, count: privacyCount() }
  })

  handle('kb:privacy-unlock', (password: string) => {
    if (!unlockPrivate(String(password ?? ''))) return { ok: false, error: '密码不正确' }
    broadcastIndex('op')
    return { ok: true, count: privacyCount() }
  })

  handle('kb:privacy-lock', () => {
    lockPrivate()
    broadcastIndex('op')
    return { ok: true }
  })

  handle('kb:privacy-change-password', (payload: { oldPassword: string; newPassword: string }) => {
    const next = String(payload?.newPassword ?? '')
    if (next.length < 6) throw new Error('新密码至少 6 位')
    const count = changePrivacyPassword(String(payload?.oldPassword ?? ''), next)
    broadcastIndex('op')
    return { ok: true, count }
  })

  handle('kb:privacy-enter', (id: string) => {
    const { root, rel } = splitId(id)
    if (isPrivateRel(rel)) throw new Error('该笔记已在隐私空间内')
    if (!isUnlocked()) throw new Error('请先解锁隐私空间')
    const content = readNote(root.path, rel)
    const target = moveIntoPrivacy(root, rel, rel, content)
    broadcastIndex('op')
    return { ok: true, id: joinNodeId(root.id, target) }
  })

  handle('kb:privacy-leave', (id: string) => {
    const { root, rel } = splitId(id)
    if (!isPrivateRel(rel)) throw new Error('该笔记不在隐私空间内')
    const original = readPrivatePayload(root, rel).relPath
    const target = uniqueRel(root.path, original)
    const next = moveOutOfPrivacy(root, rel, target)
    broadcastIndex('op')
    return { ok: true, id: joinNodeId(root.id, next) }
  })

  let aiAbort: AbortController | null = null
  handle('kb:ai-ask', (payload: { query: string; history: { role: 'user' | 'assistant'; content: string }[] }) => {
    const roots = getRoots().filter((r) => existsSync(r.path))
    if (roots.length === 0) throw new Error('尚未设置知识库目录')
    aiAbort = new AbortController()
    return askKbAi(
      roots,
      getSettings().ai,
      String(payload?.query ?? ''),
      Array.isArray(payload?.history) ? payload.history : [],
      (delta) => win.webContents.send('kb:ai-chunk', delta),
      aiAbort.signal
    ).finally(() => {
      aiAbort = null
    })
  })
  handle('kb:ai-stop', () => {
    aiAbort?.abort()
    return { ok: true }
  })
}
