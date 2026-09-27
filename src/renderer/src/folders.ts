import type { FolderEntry, NoteMeta, VaultInfo } from '../../preload/api'

export interface DirNode {
  name: string
  rel: string
  children: DirNode[]
}

/** 单根内：由文件夹列表 ∪ 笔记目录推导目录树（空文件夹也要显示） */
export function buildDirTree(folders: string[], notes: NoteMeta[]): DirNode[] {
  const root: DirNode = { name: '', rel: '', children: [] }
  const byRel = new Map<string, DirNode>([['', root]])
  const ensure = (rel: string): DirNode => {
    const hit = byRel.get(rel)
    if (hit) return hit
    const i = rel.lastIndexOf('/')
    const parent = ensure(i < 0 ? '' : rel.slice(0, i))
    const node: DirNode = { name: rel.slice(i + 1), rel, children: [] }
    parent.children.push(node)
    byRel.set(rel, node)
    return node
  }
  for (const dir of folders) {
    if (dir) ensure(dir)
  }
  for (const n of notes) {
    if (n.dir) ensure(n.dir)
  }
  const sortRec = (nodes: DirNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(root.children)
  return root.children
}

export interface RootNode {
  id: string
  name: string
  isDefault: boolean
  dirs: DirNode[]
}

/** 跨根：顶层=知识库根（默认根排最前，其余按名称 zh） */
export function buildRootsTree(
  vaults: VaultInfo[],
  folders: FolderEntry[],
  notes: NoteMeta[],
  defaultVaultId: string | null
): RootNode[] {
  return vaults
    .map((v) => ({
      id: v.id,
      name: v.name,
      isDefault: v.id === defaultVaultId,
      dirs: buildDirTree(
        folders.filter((f) => f.vaultId === v.id).map((f) => f.dir),
        notes.filter((n) => n.vaultId === v.id)
      )
    }))
    .sort((a, b) =>
      a.isDefault === b.isDefault ? a.name.localeCompare(b.name, 'zh') : a.isDefault ? -1 : 1
    )
}
