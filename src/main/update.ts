import { app, dialog, type BrowserWindow } from 'electron'
import updaterPkg from 'electron-updater'

const { autoUpdater } = updaterPkg

/** 版本更新：启动后延迟自动检查一次；菜单「检查更新…」手动检查（所有结果都弹中文对话框） */

let checkedOnce = false
let manualMode = false

interface UpdaterLogger {
  info(m?: unknown): void
  warn(m?: unknown): void
  error(m?: unknown): void
}

const logToConsole: UpdaterLogger = {
  info: (m) => console.info('updater:', m),
  warn: (m) => console.warn('updater:', m),
  error: (m) => console.error('updater:', m)
}

export async function checkForUpdates(userInitiated: boolean): Promise<void> {
  manualMode = userInitiated
  if (!app.isPackaged) {
    if (userInitiated) {
      void dialog.showMessageBox({ type: 'info', message: '开发环境不检查更新' })
    }
    return
  }
  autoUpdater.checkForUpdates().catch((e: unknown) => {
    const message = String((e as Error)?.message ?? e)
    if (userInitiated) {
      void dialog.showMessageBox({ type: 'error', message: `检查更新时发生错误：${message}` })
    } else {
      console.warn('updater: 检查更新失败', message)
    }
  })
}

export function initAutoUpdater(win: BrowserWindow): void {
  autoUpdater.logger = logToConsole
  autoUpdater.autoDownload = true

  autoUpdater.on('update-available', (info) => {
    if (!manualMode) return
    void dialog.showMessageBox(win, {
      type: 'info',
      message: `发现新版本 ${info.version}，正在后台下载…`
    })
  })

  autoUpdater.on('update-not-available', () => {
    if (!manualMode) return
    void dialog.showMessageBox(win, { type: 'info', message: '当前已是最新版本' })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.info('updater: 更新已下载，等待用户确认重启安装', info.version)
    void dialog
      .showMessageBox(win, {
        type: 'question',
        buttons: ['重启安装', '稍后'],
        defaultId: 0,
        cancelId: 1,
        message: `${info.version} 已下载完成，是否重启应用完成安装？`
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on('error', (err) => {
    if (manualMode) {
      void dialog.showMessageBox(win, {
        type: 'error',
        message: `检查更新时发生错误：${err.message}`
      })
    } else {
      console.warn('updater: 检查更新失败', err.message)
    }
  })

  setTimeout(() => {
    if (checkedOnce) return
    checkedOnce = true
    void checkForUpdates(false)
  }, 8000)
}
