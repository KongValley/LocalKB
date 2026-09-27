/** 笔记内相对图片/附件 → kbvault:// 可加载地址（渲染显示与 PDF 导出共用） */

/** src 若不是相对路径（协议、根路径）则返回 null；解析基准为当前笔记所在目录 */
export function toVaultRel(src: string, noteDir: string): string | null {
  const s = src.trim()
  if (!s) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null // http:、data:、kbvault:、C: …
  if (s.startsWith('//') || s.startsWith('/')) return null
  const parts = (noteDir ? `${noteDir}/${s}` : s).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      out.pop()
      continue
    }
    out.push(p)
  }
  return out.join('/') || null
}

/** 三段式：kbvault://vault/<vaultId>/<enc(根内相对路径)> */
export function vaultUrl(src: string, noteDir: string, vaultId: string): string | null {
  const rel = toVaultRel(src, noteDir)
  return rel ? `kbvault://vault/${vaultId}/${encodeURIComponent(rel)}` : null
}
