export type EditorMode = 'sv' | 'wysiwyg'
export type AppTheme = 'light' | 'dark' | 'eye'

export type MenuAction =
  | { type: 'kb:new-note' }
  | { type: 'kb:daily' }
  | { type: 'kb:goto-search' }
  | { type: 'kb:rescan' }
  | { type: 'kb:change-vault' }
  | { type: 'kb:toggle-side' }
  | { type: 'file:save' }
  | { type: 'export:html' }
  | { type: 'export:pdf' }
  | { type: 'view:mode'; mode: EditorMode }
  | { type: 'view:toggle-theme' }

/* ── 知识库领域模型（主进程 vault.ts 与渲染进程共用） ── */

export interface AiSettings {
  baseURL: string
  apiKey: string
  model: string
}

export interface VaultInfo {
  /** 只允许 [a-zA-Z0-9]，无 '/'（笔记全局 id = `${vaultId}/${relPath}`） */
  id: string
  /** 绝对路径 */
  path: string
  /** 展示名 */
  name: string
}

export interface KbSettings {
  defaultVaultId: string | null
  vaults: VaultInfo[]
  ai: AiSettings
}

export interface TodoItem {
  /** 0-based 行号 */
  line: number
  text: string
  done: boolean
}

export interface NoteMeta {
  /** 全局 id = `${vaultId}/${relPath}` */
  id: string
  vaultId: string
  /** 'a/b/标题.md'（posix 分隔符，根内相对） */
  relPath: string
  /** 首个 '# ' H1；无 → 文件名去扩展 */
  title: string
  /** 文件名去扩展 */
  name: string
  /** 相对目录（'' = 根） */
  dir: string
  mtimeMs: number
  size: number
  tags: string[]
  todos: TodoItem[]
  /** 首个非空正文行，截 120 字 */
  snippet: string
}

export interface TagCount {
  name: string
  count: number
}

export interface FolderEntry {
  vaultId: string
  /** 根内相对目录（posix，'' 不会出现） */
  dir: string
}

export interface GraphNode {
  id: string
  name: string
  dir: string
  size: number
}

export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface SearchHitLine {
  /** 1-based 行号（仅用于展示） */
  line: number
  text: string
}

export interface SearchHit {
  id: string
  vaultId: string
  relPath: string
  count: number
  lines: SearchHitLine[]
}

export interface TodoEntry extends TodoItem {
  id: string
  vaultId: string
  relPath: string
  title: string
}

export interface TrashItem {
  id: string
  vaultId: string
  /** 根内相对路径（含 ~N 重名后缀） */
  trashedRel: string
  /** 去掉重名 ~N 后缀的原相对路径 */
  originalRel: string
  size: number
  mtimeMs: number
  isDir: boolean
}

export interface ScanResult {
  ok: true
  notes: NoteMeta[]
  tags: TagCount[]
  folders: FolderEntry[]
  vaults: VaultInfo[]
  defaultVaultId: string | null
}

export interface VaultListResult {
  ok: true
  vaults: VaultInfo[]
  defaultVaultId: string | null
}

export type Err = { ok: false; error: string }

export interface KbApi {
  settingsGet(): Promise<{ ok: true; settings: KbSettings } | Err>
  settingsSet(patch: { ai?: Partial<AiSettings> }): Promise<{ ok: true; settings: KbSettings } | Err>
  vaultAdd(): Promise<{ canceled: true } | VaultListResult | Err>
  vaultRemove(vaultId: string): Promise<VaultListResult | Err>
  vaultSetDefault(vaultId: string): Promise<VaultListResult | Err>
  vaultRename(vaultId: string, name: string): Promise<VaultListResult | Err>
  vaultRetryManaged(): Promise<VaultListResult | Err>
  vaultReveal(vaultId: string): Promise<{ ok: true } | Err>
  dataDirGet(): Promise<{ ok: true; dataDir: string | null; effectiveDir: string } | Err>
  dataDirPick(): Promise<{ canceled: true } | { ok: true; dir: string } | Err>
  dataDirSet(dir: string | null): Promise<{ ok: true; requiresRestart: true } | Err>
  appRestart(): void
  scan(): Promise<ScanResult | Err>
  noteRead(id: string): Promise<{ ok: true; content: string } | Err>
  noteWrite(id: string, content: string): Promise<{ ok: true; meta: NoteMeta } | Err>
  noteCreate(vaultId: string, dir: string, title: string): Promise<{ ok: true; id: string } | Err>
  noteRenameMove(id: string, newRel: string): Promise<{ ok: true; id: string } | Err>
  noteDelete(id: string): Promise<{ ok: true; trashedRel: string } | Err>
  folderCreate(vaultId: string, dirPath: string): Promise<{ ok: true; relPath: string } | Err>
  folderRename(
    vaultId: string,
    oldDir: string,
    newDir: string
  ): Promise<{ ok: true; relPath: string } | Err>
  folderDelete(vaultId: string, dirPath: string): Promise<{ ok: true; trashedRel: string } | Err>
  trashList(): Promise<{ ok: true; items: TrashItem[] } | Err>
  trashRestore(vaultId: string, trashedRel: string): Promise<{ ok: true; relPath: string } | Err>
  trashPurge(vaultId: string, target: string): Promise<{ ok: true } | Err>
  search(query: string): Promise<{ ok: true; results: SearchHit[] } | Err>
  graph(): Promise<{ ok: true; nodes: GraphNode[]; links: GraphLink[] } | Err>
  todos(): Promise<{ ok: true; items: TodoEntry[] } | Err>
  todoToggle(id: string, line: number, done: boolean): Promise<{ ok: true } | Err>
  daily(): Promise<{ ok: true; id: string } | Err>
  imageSave(id: string, name: string, dataBase64: string): Promise<{ ok: true; markdown: string } | Err>
  aiAsk(query: string): Promise<{ ok: true; answer: string; sources: string[] } | Err>
  onKbEvent(cb: (e: { type: 'index'; source: 'op' | 'watch' }) => void): () => void
}

export interface MdApi {
  openMarkdownDialog(): Promise<
    { canceled: true } | { canceled: false; path: string; content: string; error?: string }
  >
  savePathDialog(opts: {
    defaultName: string
    kind: 'md' | 'html' | 'pdf'
  }): Promise<{ canceled: true } | { canceled: false; path: string }>
  confirmDiscard(): Promise<boolean>
  readFile(path: string): Promise<{ ok: true; content: string } | { ok: false; error: string }>
  writeFile(path: string, content: string): Promise<{ ok: true } | { ok: false; error: string }>
  exportHtml(path: string, html: string): Promise<{ ok: true } | { ok: false; error: string }>
  exportPdf(path: string, html: string): Promise<{ ok: true } | { ok: false; error: string }>
  syncState(s: { dirty: boolean; noteTitle: string }): void
  onMenuAction(cb: (a: MenuAction) => void): void
}

declare global {
  interface Window {
    api: MdApi
    kb: KbApi
  }
}
