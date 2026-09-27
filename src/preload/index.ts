import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { KbApi, MdApi, MenuAction } from './api'

const api: MdApi = {
  openMarkdownDialog: () => ipcRenderer.invoke('dialog:open-markdown'),
  savePathDialog: (opts) => ipcRenderer.invoke('dialog:save-path', opts),
  confirmDiscard: () => ipcRenderer.invoke('dialog:confirm-discard'),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content) => ipcRenderer.invoke('file:write', { path, content }),
  exportHtml: (path, html) => ipcRenderer.invoke('file:export-html', { path, html }),
  exportPdf: (path, html) => ipcRenderer.invoke('file:export-pdf', { path, html }),
  syncState: (s) => ipcRenderer.send('app:sync-state', s),
  onMenuAction: (cb) => {
    ipcRenderer.on('menu:action', (_e, payload) => cb(payload as MenuAction))
  }
}

const kb: KbApi = {
  settingsGet: () => ipcRenderer.invoke('kb:settings-get'),
  settingsSet: (patch) => ipcRenderer.invoke('kb:settings-set', patch),
  vaultAdd: () => ipcRenderer.invoke('kb:vault-add'),
  vaultRemove: (vaultId) => ipcRenderer.invoke('kb:vault-remove', vaultId),
  vaultSetDefault: (vaultId) => ipcRenderer.invoke('kb:vault-set-default', vaultId),
  vaultRename: (vaultId, name) => ipcRenderer.invoke('kb:vault-rename', { vaultId, name }),
  vaultRetryManaged: () => ipcRenderer.invoke('kb:vault-retry-managed'),
  vaultReveal: (vaultId) => ipcRenderer.invoke('kb:vault-reveal', vaultId),
  dataDirGet: () => ipcRenderer.invoke('kb:data-dir-get'),
  dataDirPick: () => ipcRenderer.invoke('kb:data-dir-pick'),
  dataDirSet: (dir) => ipcRenderer.invoke('kb:data-dir-set', dir),
  appRestart: () => ipcRenderer.send('kb:app-restart'),
  scan: () => ipcRenderer.invoke('kb:scan'),
  noteRead: (id) => ipcRenderer.invoke('kb:note-read', id),
  noteWrite: (id, content) => ipcRenderer.invoke('kb:note-write', { id, content }),
  noteCreate: (vaultId, dir, title) => ipcRenderer.invoke('kb:note-create', { vaultId, dir, title }),
  noteRenameMove: (id, newRel) => ipcRenderer.invoke('kb:note-rename-move', { id, newRel }),
  noteDelete: (id) => ipcRenderer.invoke('kb:note-delete', id),
  folderCreate: (vaultId, dirPath) => ipcRenderer.invoke('kb:folder-create', { vaultId, dirPath }),
  folderRename: (vaultId, oldDir, newDir) =>
    ipcRenderer.invoke('kb:folder-rename', { vaultId, oldDir, newDir }),
  folderDelete: (vaultId, dirPath) => ipcRenderer.invoke('kb:folder-delete', { vaultId, dirPath }),
  trashList: () => ipcRenderer.invoke('kb:trash-list'),
  trashRestore: (vaultId, trashedRel) =>
    ipcRenderer.invoke('kb:trash-restore', { vaultId, trashedRel }),
  trashPurge: (vaultId, target) => ipcRenderer.invoke('kb:trash-purge', { vaultId, target }),
  search: (query) => ipcRenderer.invoke('kb:search', query),
  graph: () => ipcRenderer.invoke('kb:graph'),
  todos: () => ipcRenderer.invoke('kb:todos'),
  todoToggle: (id, line, done) => ipcRenderer.invoke('kb:todo-toggle', { id, line, done }),
  daily: () => ipcRenderer.invoke('kb:daily'),
  imageSave: (id, name, dataBase64) => ipcRenderer.invoke('kb:image-save', { id, name, dataBase64 }),
  aiAsk: (query) => ipcRenderer.invoke('kb:ai-ask', query),
  onKbEvent: (cb) => {
    const listener = (_e: IpcRendererEvent, payload: { type: 'index'; source: 'op' | 'watch' }): void =>
      cb(payload)
    ipcRenderer.on('kb:event', listener)
    return () => {
      ipcRenderer.removeListener('kb:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('kb', kb)
