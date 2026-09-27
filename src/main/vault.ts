import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type {
  GraphData,
  GraphLink,
  GraphNode,
  NoteMeta,
  SearchHit,
  SearchHitLine,
  TagCount,
  TodoEntry,
  TodoItem,
  TrashItem
} from '../preload/api'

/**
 * 知识库纯业务层：不 import electron。
 * 所有扫描 / 解析 / 路径规则集中在此，kb-ipc.ts 与 ai.ts 复用。
 */

export const TRASH_DIR = '.trash'
const MD_EXT = /\.md$/i
const HIDDEN_DIR = /^\./
const SKIP_DIRS: Record<string, true> = { [TRASH_DIR]: true, node_modules: true }

/* ── 路径工具（relPath 一律 posix 分隔符） ── */

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

export function dirOf(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

export function baseName(rel: string): string {
  return rel.slice(rel.lastIndexOf('/') + 1).replace(MD_EXT, '')
}

/* ── 笔记全局 id = `${vaultId}/${relPath}`（vaultId 无 '/'） ── */

export function joinNodeId(vaultId: string, relPath: string): string {
  return `${vaultId}/${relPath}`
}

export function splitNodeId(id: string): { vaultId: string; rel: string } {
  const i = id.indexOf('/')
  if (i <= 0 || i === id.length - 1) throw new Error(`非法笔记标识：${id}`)
  return { vaultId: id.slice(0, i), rel: id.slice(i + 1) }
}

export function normalizeRel(rel: string): string {
  const parts: string[] = []
  for (const seg of toPosix(rel).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length === 0) throw new Error(`非法路径：${rel}`)
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return parts.join('/')
}

/** 把 vault 内相对路径解析为绝对路径，越界即抛错。 */
export function resolveInside(vault: string, rel: string): string {
  const base = resolve(vault)
  const abs = resolve(base, rel)
  if (abs !== base && !abs.startsWith(base + sep)) throw new Error(`路径越出知识库：${rel}`)
  return abs
}

/* ── 解析 ── */

/** 内联 #标签：前一字符为行首或空白 */
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_/-]{1,32})/gu
const TODO_RE = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/
const H1_RE = /^#\s+(.+?)\s*$/
const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gu

function forEachMatch(re: RegExp, text: string, cb: (m: RegExpExecArray) => void): void {
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    cb(m)
    if (m.index === re.lastIndex) re.lastIndex++
  }
}

export function extractTags(content: string): string[] {
  const out = new Set<string>()
  for (const line of content.split('\n')) {
    forEachMatch(TAG_RE, line, (m) => out.add(m[1]))
  }
  return [...out]
}

export function extractTodos(content: string): TodoItem[] {
  const out: TodoItem[] = []
  content.split('\n').forEach((line, i) => {
    const m = TODO_RE.exec(line)
    if (m) out.push({ line: i, text: m[2].trim(), done: m[1].toLowerCase() === 'x' })
  })
  return out
}

export function extractTitle(content: string, fallback: string): string {
  for (const line of content.split('\n')) {
    const m = H1_RE.exec(line)
    if (m) return m[1]
  }
  return fallback
}

export function extractSnippet(content: string): string {
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('#') || t.startsWith('```') || t.startsWith('---') || t.startsWith(':::')) continue
    return t.slice(0, 120)
  }
  return ''
}

/** [[笔记名]] / [[笔记名|别名]] → 目标名列表 */
export function extractLinks(content: string): string[] {
  const out: string[] = []
  forEachMatch(LINK_RE, content, (m) => {
    const t = m[1].trim()
    if (t) out.push(t)
  })
  return out
}

export function parseNote(
  relPath: string,
  content: string,
  st: { mtimeMs: number; size: number },
  vaultId: string
): NoteMeta {
  const name = baseName(relPath)
  return {
    id: joinNodeId(vaultId, relPath),
    vaultId,
    relPath,
    title: extractTitle(content, name),
    name,
    dir: dirOf(relPath),
    mtimeMs: st.mtimeMs,
    size: st.size,
    tags: extractTags(content),
    todos: extractTodos(content),
    snippet: extractSnippet(content)
  }
}

/* ── 扫描与索引 ── */

export function walkNotes(vault: string): string[] {
  const out: string[] = []
  const visit = (dirRel: string): void => {
    let entries
    try {
      entries = readdirSync(join(vault, dirRel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (HIDDEN_DIR.test(e.name) || SKIP_DIRS[e.name]) continue
        visit(rel)
      } else if (e.isFile() && MD_EXT.test(e.name)) {
        out.push(rel)
      }
    }
  }
  visit('')
  return out
}

export interface VaultIndex {
  notes: NoteMeta[]
  tags: TagCount[]
  linksByRel: Map<string, string[]>
}

/** 知识库内全部子目录（排除 .trash / 隐藏目录 / node_modules），文件夹树用 */
export function walkDirs(vault: string): string[] {
  const out: string[] = []
  const visit = (dirRel: string): void => {
    let entries
    try {
      entries = readdirSync(join(vault, dirRel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (HIDDEN_DIR.test(e.name) || SKIP_DIRS[e.name]) continue
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name
      out.push(rel)
      visit(rel)
    }
  }
  visit('')
  return out
}

export function buildIndex(vault: string, vaultId: string): VaultIndex {
  const notes: NoteMeta[] = []
  const linksByRel = new Map<string, string[]>()
  for (const rel of walkNotes(vault)) {
    try {
      const abs = resolveInside(vault, rel)
      const content = readFileSync(abs, 'utf-8')
      notes.push(parseNote(rel, content, statSync(abs), vaultId))
      linksByRel.set(rel, extractLinks(content))
    } catch {
      /* 单篇读取失败不阻断整库索引 */
    }
  }
  const tagMap = new Map<string, number>()
  for (const n of notes) {
    for (const t of n.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1)
  }
  const tags = [...tagMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { notes, tags, linksByRel }
}

export function listTodos(
  vault: string,
  vaultId: string,
  index: VaultIndex = buildIndex(vault, vaultId)
): TodoEntry[] {
  const out: TodoEntry[] = []
  for (const n of index.notes) {
    for (const t of n.todos) {
      out.push({
        ...t,
        id: joinNodeId(vaultId, n.relPath),
        vaultId,
        relPath: n.relPath,
        title: n.title
      })
    }
  }
  return out
}

/* ── 双链图谱 ── */

export function buildGraph(
  vault: string,
  vaultId: string,
  index: VaultIndex = buildIndex(vault, vaultId)
): GraphData {
  const byKey = new Map<string, string[]>()
  for (const n of index.notes) {
    for (const key of new Set([n.name, n.title])) {
      const list = byKey.get(key) ?? []
      list.push(n.relPath)
      byKey.set(key, list)
    }
  }

  const resolveTarget = (raw: string): string | null => {
    const t = raw.trim()
    if (!t) return null
    let asRel = ''
    try {
      asRel = normalizeRel(t)
    } catch {
      return null
    }
    const relCands = [asRel, `${asRel}.md`]
    for (const cand of relCands) {
      const hit = index.notes.find((n) => n.relPath === cand)
      if (hit) return hit.relPath
    }
    const cands = byKey.get(t) ?? byKey.get(asRel) ?? []
    if (cands.length === 0) return null
    return [...cands].sort(
      (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)
    )[0]
  }

  const linkSet = new Map<string, GraphLink>()
  for (const n of index.notes) {
    for (const raw of index.linksByRel.get(n.relPath) ?? []) {
      const targetRel = resolveTarget(raw)
      if (!targetRel || targetRel === n.relPath) continue
      const source = n.id
      const target = joinNodeId(vaultId, targetRel)
      linkSet.set(`${source}\n${target}`, { source, target })
    }
  }
  const links = [...linkSet.values()]

  const degree = new Map<string, number>()
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1)
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1)
  }
  const nodes: GraphNode[] = index.notes.map((n) => ({
    id: n.id,
    name: n.title,
    dir: n.dir,
    size: degree.get(n.id) ?? 0
  }))
  return { nodes, links }
}

/* ── 搜索 ── */

interface ScoredHit {
  hit: SearchHit
  score: number
  mtimeMs: number
}

function searchOne(vault: string, vaultId: string, q: string): ScoredHit[] {
  const scored: ScoredHit[] = []
  for (const rel of walkNotes(vault)) {
    try {
      const abs = resolveInside(vault, rel)
      const content = readFileSync(abs, 'utf-8')
      const mtimeMs = statSync(abs).mtimeMs
      const name = baseName(rel)
      let score = 0
      if (name.toLowerCase().includes(q)) score += 10
      if (extractTitle(content, name).toLowerCase().includes(q)) score += 10
      const lines: SearchHitLine[] = []
      let count = 0
      content.split('\n').forEach((line, idx) => {
        if (!line.toLowerCase().includes(q)) return
        score += /^#\s+/.test(line) ? 5 : 1
        count++
        if (lines.length < 5) lines.push({ line: idx + 1, text: line.trim().slice(0, 200) })
      })
      if (score > 0) {
        scored.push({
          hit: { id: joinNodeId(vaultId, rel), vaultId, relPath: rel, count, lines },
          score,
          mtimeMs
        })
      }
    } catch {
      /* 跳过不可读文件 */
    }
  }
  return scored
}

function rank(scored: ScoredHit[]): SearchHit[] {
  return scored
    .sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs)
    .slice(0, 50)
    .map((s) => s.hit)
}

export function searchVault(vault: string, vaultId: string, query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return rank(searchOne(vault, vaultId, q))
}

/** 跨根合并检索：全局按分数排序取前 50 */
export function searchRoots(roots: { id: string; path: string }[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const all: ScoredHit[] = []
  for (const r of roots) {
    try {
      all.push(...searchOne(r.path, r.id, q))
    } catch {
      /* 跳过不可读根 */
    }
  }
  return rank(all)
}

/* ── 笔记读写 ── */

export function readNote(vault: string, rel: string): string {
  return readFileSync(resolveInside(vault, rel), 'utf-8')
}

export function writeNote(vault: string, vaultId: string, rel: string, content: string): NoteMeta {
  const relNorm = normalizeRel(rel)
  const abs = resolveInside(vault, relNorm)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
  return parseNote(relNorm, content, statSync(abs), vaultId)
}

const INVALID_NAME = /[\\/:*?"<>|]/g

export function safeTitle(title: string): string {
  const t = title
    .replace(INVALID_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
  return t || '未命名笔记'
}

function uniqueNotePath(vault: string, dir: string, base: string): string {
  for (let n = 1; n < 1000; n++) {
    const stem = n === 1 ? base : `${base} (${n})`
    const rel = dir ? `${dir}/${stem}.md` : `${stem}.md`
    if (!existsSync(join(vault, rel))) return rel
  }
  throw new Error(`无法生成不重名文件名：${base}`)
}

export function createNote(vault: string, dir: string, title: string): string {
  const d = dir ? normalizeRel(dir) : ''
  const base = safeTitle(title)
  const rel = uniqueNotePath(vault, d, base)
  const abs = join(vault, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, `# ${base}\n\n`, 'utf-8')
  return rel
}

/** 重名追加 ~N（插在扩展名前） */
function withSuffix(rel: string, n: number): string {
  const dir = dirOf(rel)
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  const suffixed = dot > 0 ? `${name.slice(0, dot)}~${n}${name.slice(dot)}` : `${name}~${n}`
  return dir ? `${dir}/${suffixed}` : suffixed
}

function uniqueRel(baseDir: string, rel: string): string {
  if (!existsSync(join(baseDir, rel))) return rel
  for (let n = 1; n < 1000; n++) {
    const cand = withSuffix(rel, n)
    if (!existsSync(join(baseDir, cand))) return cand
  }
  throw new Error(`无法生成不重名路径：${rel}`)
}

export function stripSuffix(rel: string): string {
  const dir = dirOf(rel)
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  const m = /^(.*)~\d+(\.[^.]*)?$/.exec(name)
  if (!m) return rel
  const stripped = `${m[1]}${m[2] ?? ''}`
  return dir ? `${dir}/${stripped}` : stripped
}

export function renameNote(vault: string, oldRel: string, newRel: string): string {
  const from = normalizeRel(oldRel)
  const to = normalizeRel(newRel)
  const src = resolveInside(vault, from)
  if (!existsSync(src)) throw new Error(`笔记不存在：${oldRel}`)
  if (to === from) return from
  const targetRel = uniqueRel(vault, to)
  const target = resolveInside(vault, targetRel)
  mkdirSync(dirname(target), { recursive: true })
  renameSync(src, target)
  return targetRel
}

export function deleteNote(vault: string, rel: string): string {
  return moveToTrash(vault, rel)
}

/* ── 文件夹 ── */

function assertUserDir(rel: string): string {
  const norm = normalizeRel(rel)
  if (!norm) throw new Error('文件夹名不能为空')
  if (norm.split('/')[0] === TRASH_DIR) throw new Error('不能操作回收站目录')
  return norm
}

export function createFolder(vault: string, dirPath: string): string {
  const rel = assertUserDir(dirPath)
  mkdirSync(resolveInside(vault, rel), { recursive: true })
  return rel
}

export function renameFolder(vault: string, oldDir: string, newDir: string): string {
  const from = assertUserDir(oldDir)
  const to = assertUserDir(newDir)
  if (from === to) return to
  const src = resolveInside(vault, from)
  const dest = resolveInside(vault, to)
  if (!existsSync(src)) throw new Error(`文件夹不存在：${oldDir}`)
  if (existsSync(dest)) throw new Error(`目标已存在：${newDir}`)
  mkdirSync(dirname(dest), { recursive: true })
  renameSync(src, dest)
  return to
}

export function deleteFolder(vault: string, dirPath: string): string {
  return moveToTrash(vault, assertUserDir(dirPath))
}

/* ── 回收站 ── */

export function trashRoot(vault: string): string {
  return join(vault, TRASH_DIR)
}

export function moveToTrash(vault: string, rel: string): string {
  const norm = normalizeRel(rel)
  const src = resolveInside(vault, norm)
  if (!existsSync(src)) throw new Error(`不存在：${rel}`)
  const root = trashRoot(vault)
  const trashedRel = uniqueRel(root, norm)
  const target = join(root, trashedRel)
  mkdirSync(dirname(target), { recursive: true })
  renameSync(src, target)
  return trashedRel
}

function dirSize(abs: string): number {
  let total = 0
  let entries
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const child = join(abs, e.name)
    if (e.isDirectory()) total += dirSize(child)
    else {
      try {
        total += statSync(child).size
      } catch {
        /* 忽略统计失败 */
      }
    }
  }
  return total
}

export function listTrash(vault: string, vaultId: string): TrashItem[] {
  const root = trashRoot(vault)
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const out: TrashItem[] = []
  for (const e of entries) {
    const abs = join(root, e.name)
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    const isDir = st.isDirectory()
    out.push({
      id: joinNodeId(vaultId, e.name),
      vaultId,
      trashedRel: e.name,
      originalRel: stripSuffix(e.name),
      size: isDir ? dirSize(abs) : st.size,
      mtimeMs: st.mtimeMs,
      isDir
    })
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export function restoreTrash(vault: string, trashedRel: string): string {
  const norm = normalizeRel(trashedRel)
  const src = resolveInside(trashRoot(vault), norm)
  if (!existsSync(src)) throw new Error(`回收站中不存在：${trashedRel}`)
  const targetRel = uniqueRel(vault, stripSuffix(norm))
  const target = resolveInside(vault, targetRel)
  mkdirSync(dirname(target), { recursive: true })
  renameSync(src, target)
  return targetRel
}

export function purgeTrash(vault: string, target: string): void {
  const root = trashRoot(vault)
  if (target === '__ALL__') {
    rmSync(root, { recursive: true, force: true })
    return
  }
  rmSync(resolveInside(root, normalizeRel(target)), { recursive: true, force: true })
}

/* ── 每日笔记 ── */

export function todayRel(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `daily/${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.md`
}

export function ensureDaily(vault: string): string {
  const rel = todayRel()
  const abs = resolveInside(vault, rel)
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, `# ${baseName(rel)}\n\n`, 'utf-8')
  }
  return rel
}

/* ── 待办 ── */

export function toggleTodo(vault: string, rel: string, line: number, done: boolean): void {
  const abs = resolveInside(vault, rel)
  const lines = readFileSync(abs, 'utf-8').split('\n')
  const cur = lines[line]
  if (cur === undefined) throw new Error(`行不存在：${line}`)
  const m = /^(\s*[-*]\s+\[)([ xX])(\].*)$/.exec(cur)
  if (!m) throw new Error('该行不是待办事项')
  lines[line] = `${m[1]}${done ? 'x' : ' '}${m[3]}`
  writeFileSync(abs, lines.join('\n'), 'utf-8')
}

/* ── 图片附件 ── */

export function sanitizeFileName(name: string): string {
  const base = (name || '').replace(/.*[\\/]/, '').trim()
  const cleaned = base.replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '')
  return cleaned || 'image.png'
}

/** 落 <vault>/assets/<时间戳>-<安全名>，返回可写进 Markdown 的相对路径 */
export function saveImage(vault: string, name: string, dataBase64: string): string {
  const data = (dataBase64 || '').replace(/^data:[^,]*,/, '')
  if (!data) throw new Error('图片数据为空')
  const rel = `assets/${Date.now()}-${sanitizeFileName(name)}`
  const abs = resolveInside(vault, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, Buffer.from(data, 'base64'))
  return rel
}
