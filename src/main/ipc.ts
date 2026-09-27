import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type SaveKind = 'md' | 'html' | 'pdf'

const SAVE_FILTERS: Record<SaveKind, { name: string; extensions: string[] }[]> = {
  md: [{ name: 'Markdown 文档', extensions: ['md'] }],
  html: [{ name: 'HTML 文件', extensions: ['html'] }],
  pdf: [{ name: 'PDF 文件', extensions: ['pdf'] }]
}

export function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('dialog:open-markdown', async () => {
    const r = await dialog.showOpenDialog(win, {
      filters: [
        { name: 'Markdown 文档', extensions: ['md', 'markdown', 'mkd', 'txt'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (r.canceled || r.filePaths.length === 0) return { canceled: true }
    const path = r.filePaths[0]
    try {
      const content = readFileSync(path, 'utf-8')
      return { canceled: false, path, content }
    } catch (e) {
      return { canceled: false, path, content: '', error: String((e as Error)?.message ?? e) }
    }
  })

  ipcMain.handle('dialog:save-path', async (_e, opts: { defaultName: string; kind: SaveKind }) => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: opts.defaultName,
      filters: SAVE_FILTERS[opts.kind] ?? SAVE_FILTERS.md
    })
    return r.canceled || !r.filePath ? { canceled: true } : { canceled: false, path: r.filePath }
  })

  ipcMain.handle('dialog:confirm-discard', async () => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['放弃修改', '取消'],
      defaultId: 1,
      cancelId: 1,
      message: '当前文档有未保存的修改，继续将丢失这些修改。'
    })
    return response === 0
  })

  ipcMain.handle('file:read', (_e, path: string) => {
    try {
      return { ok: true, content: readFileSync(path, 'utf-8') }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  })

  ipcMain.handle('file:write', (_e, { path, content }: { path: string; content: string }) => {
    try {
      writeFileSync(path, content, 'utf-8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  })

  ipcMain.handle('file:export-html', (_e, { path, html }: { path: string; html: string }) => {
    try {
      writeFileSync(path, html, 'utf-8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  })

  ipcMain.handle('file:export-pdf', async (_e, { path, html }: { path: string; html: string }) => {
    const tmp = join(
      app.getPath('temp'),
      `kb-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
    )
    writeFileSync(tmp, html, 'utf-8')
    const printWin = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: { sandbox: true, contextIsolation: true }
    })
    try {
      await printWin.loadFile(tmp)
      const data = await printWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      writeFileSync(path, data)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    } finally {
      printWin.close()
      rmSync(tmp, { force: true })
    }
  })

  ipcMain.on('app:sync-state', (_e, { dirty, noteTitle }: { dirty: boolean; noteTitle: string }) => {
    win.setTitle(`${noteTitle}${dirty ? ' •' : ''} - 知识库`)
  })
}
