import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

export function buildMenu(win: BrowserWindow): Menu {
  const send = (payload: unknown): void => win.webContents.send('menu:action', payload)

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建笔记', accelerator: 'CmdOrCtrl+N', click: () => send({ type: 'kb:new-note' }) },
        {
          label: '生成/打开今日笔记',
          accelerator: 'CmdOrCtrl+D',
          click: () => send({ type: 'kb:daily' })
        },
        {
          label: '发起搜索',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => send({ type: 'kb:goto-search' })
        },
        { type: 'separator' },
        { label: '立即保存', accelerator: 'CmdOrCtrl+S', click: () => send({ type: 'file:save' }) },
        {
          label: '导出',
          submenu: [
            { label: '导出为 HTML', click: () => send({ type: 'export:html' }) },
            { label: '导出为 PDF', click: () => send({ type: 'export:pdf' }) }
          ]
        },
        { type: 'separator' },
        { label: '重新扫描知识库', click: () => send({ type: 'kb:rescan' }) },
        { label: '添加知识库目录…', click: () => send({ type: 'kb:change-vault' }) },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '源码分栏', click: () => send({ type: 'view:mode', mode: 'sv' }) },
        { label: '所见即所得', click: () => send({ type: 'view:mode', mode: 'wysiwyg' }) },
        { label: '切换主题', click: () => send({ type: 'view:toggle-theme' }) },
        { label: '侧栏', click: () => send({ type: 'kb:toggle-side' }) },
        { type: 'separator' },
        { label: '重新加载', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [{ label: '最小化', role: 'minimize' }]
    }
  ]

  return Menu.buildFromTemplate(template)
}
