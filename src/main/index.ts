import { app, BrowserWindow, dialog, Menu, net, protocol } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyCustomDataDir } from './data-dir'
import { buildMenu } from './menu'
import { registerIpc } from './ipc'
import { registerKbIpc } from './kb-ipc'
import { findRoot } from './settings'
import { resolveInside } from './vault'

// 必须在 app ready 之前调用：kbvault 自定义协议（笔记内图片等附件）
protocol.registerSchemesAsPrivileged([{ scheme: 'kbvault', privileges: { stream: true } }])

// 同样必须在 app ready 之前：自定义数据目录（pointer 位于 OS 默认 userData 下）
applyCustomDataDir()

let win: BrowserWindow
let forceClose = false

const NOT_FOUND = (): Response => new Response('not found', { status: 404 })

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: '知识库',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.once('ready-to-show', () => win.show())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  win.on('close', async (e) => {
    if (forceClose) return
    e.preventDefault()
    const snap = (await win.webContents.executeJavaScript(
      'window.__mdSnapshot ? window.__mdSnapshot() : null'
    )) as { dirty?: boolean } | null
    if (!snap || !snap.dirty) {
      forceClose = true
      win.close()
      return
    }
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['保存并退出', '不保存退出', '取消'],
      defaultId: 0,
      cancelId: 2,
      message: '当前文档有未保存的修改，是否保存后退出？'
    })
    if (response === 2) return
    if (response === 1) {
      forceClose = true
      win.close()
      return
    }
    const r = (await win.webContents.executeJavaScript(
      'window.__mdSave ? window.__mdSave() : Promise.resolve({ok:false})'
    )) as { ok?: boolean } | null
    if (r?.ok) {
      forceClose = true
      win.close()
    }
  })
}

function registerVaultProtocol(): void {
  protocol.handle('kbvault', async (req) => {
    try {
      const url = new URL(req.url)
      // 先按编码形态切分：新式 kbvault://vault/<vaultId>/<enc(rel)>，老式 kbvault://vault/<enc(rel)> 视为 default 根
      const encoded = url.pathname.replace(/^\/+/, '')
      const slash = encoded.indexOf('/')
      const vaultId = slash > 0 ? encoded.slice(0, slash) : 'default'
      const rel = decodeURIComponent(slash > 0 ? encoded.slice(slash + 1) : encoded)
      if (!rel) return NOT_FOUND()
      const root = findRoot(vaultId)
      if (!root) return NOT_FOUND()
      const abs = resolveInside(root.path, rel)
      if (!existsSync(abs) || !statSync(abs).isFile()) return NOT_FOUND()
      return await net.fetch(pathToFileURL(abs).toString())
    } catch {
      return NOT_FOUND()
    }
  })
}

app.whenReady().then(() => {
  registerVaultProtocol()
  createWindow()
  registerIpc(win)
  registerKbIpc(win)
  Menu.setApplicationMenu(buildMenu(win))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
