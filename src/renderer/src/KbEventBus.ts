import { reloadActive, rescan } from './note'
import { store } from './store'

/** 主进程 kb:event（写操作 / 文件监听）→ 重扫索引；外部改动时安全重载当前笔记 */
export function wireKbEvents(): void {
  window.kb.onKbEvent((e) => {
    void (async () => {
      if (e.type !== 'index') return
      await rescan()
      if (e.source === 'watch' && store.activeId && !store.dirty) await reloadActive()
    })()
  })
}
