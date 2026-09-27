import {
  createNote,
  daily,
  exportHtmlDoc,
  exportPdfDoc,
  flush,
  rescan,
  setMode,
  toggleTheme
} from './note'
import router from './router'
import { store } from './store'

declare global {
  interface Window {
    __mdSnapshot?: () => { dirty: boolean; noteTitle: string; markdown: string }
    __mdSave?: () => Promise<{ ok: boolean }>
  }
}

/** 添加知识库目录（菜单 / 关于页 / 欢迎页共用） */
export async function addVault(): Promise<boolean> {
  const r = await window.kb.vaultAdd()
  if ('ok' in r && r.ok === false) {
    alert(`添加知识库目录失败：${r.error}`)
    return false
  }
  if ('canceled' in r && r.canceled) return false
  await rescan()
  await router.push('/notes')
  return true
}

export function wireIpc(): void {
  window.api.onMenuAction((a) => {
    switch (a.type) {
      case 'kb:new-note':
        void createNote().then(() => router.push('/notes'))
        return
      case 'kb:daily':
        void daily().then((id) => {
          if (id) void router.push('/notes')
        })
        return
      case 'kb:goto-search':
        void router.push('/search')
        return
      case 'kb:rescan':
        void rescan()
        return
      case 'kb:change-vault':
        void addVault()
        return
      case 'kb:toggle-side':
        store.sideCollapsed = !store.sideCollapsed
        return
      case 'file:save':
        void flush()
        return
      case 'export:html':
        void exportHtmlDoc()
        return
      case 'export:pdf':
        void exportPdfDoc()
        return
      case 'view:mode':
        return setMode(a.mode)
      case 'view:toggle-theme':
        return toggleTheme()
    }
  })

  window.__mdSnapshot = () => ({
    dirty: store.dirty,
    noteTitle: store.activeId ?? '',
    markdown: store.openContent
  })
  window.__mdSave = async () => ({ ok: await flush() })
}
