# 知识库（LocalKB）

基于 Electron 的本地中文知识库桌面应用：笔记就是磁盘上的普通 `.md` 文件，可被任意编辑器/同步工具直接读写；应用负责索引、双链、标签、待办、图谱与 AI 问答。

- 技术栈：Electron 44 + electron-vite 5 + Vue 3.5 + vue-router 4 + Vditor 4 + TypeScript 5.9
- 打包：electron-builder 26（Windows NSIS，产物 `知识库-Setup-<version>.exe`，可自定义安装目录）
- 全部第三方运行时资源（Vditor / Mermaid / KaTeX / ECharts 等）随包离线提供，无需联网

## 功能

| 模块 | 说明 |
| --- | --- |
| 首页 | 笔记/标签/待办统计、最近编辑、快捷操作 |
| 笔记 | 左侧笔记列表（标题本地过滤、按修改时间倒序、按文件夹筛选）+ 右侧 Vditor 编辑器（分栏预览 / 所见即所得切换） |
| 搜索 | 全文打分检索（标题/文件名 +10、H1 +5、正文行 +1），结果按行高亮 |
| 每日笔记 | 一键生成/打开 `daily/YYYY-MM-DD.md` |
| 标签 | 内联 `#标签` 的标签云与标签详情 |
| 待办 | 汇总 `- [ ]` / `- [x]`，勾选直接回写原文件对应行 |
| 知识图谱 | 基于 `[[双链]]` 的力导向图（ECharts），可按知识库着色、含孤立节点开关 |
| AI 问答 | OpenAI 兼容接口（DeepSeek / 通义 / Kimi / 智谱 / OpenAI），主进程直连、非流式，RAG 取关键词命中的前 8 篇笔记作为上下文 |
| 回收站 | 删除先进 `.trash/`（保留原相对路径，重名加 `~N`），支持还原、彻底删除、清空 |
| 编辑器 | 800ms 防抖自动保存、`Ctrl/Cmd+S` 立即保存、切换笔记前强制落盘、保存中/未保存状态指示 |
| 图片 | 粘贴/拖入图片自动存入 `<库>/assets/<时间戳>-<安全名>`，正文写相对路径；渲染时经 `kbvault://` 协议按库加载 |
| 导出 | HTML（保持相对路径，便携）/ PDF（图片改写为 `kbvault://` 绝对地址） |
| 关闭保护 | 有未保存修改时弹出「保存并退出 / 不保存退出 / 取消」 |
| 版本更新 | 启动后自动检查 GitHub Releases（electron-updater），新版本后台下载完成后提示「重启安装」；菜单「文件 → 检查更新…」可手动检查 |
| 隐私空间 | 把任意笔记「移入隐私空间」即以 **AES-256-GCM 加密存储**（scrypt 派生密钥，每文件随机盐/IV，文件名不透明）；锁定后不出现在列表/搜索/图谱/待办里，也不会发给 AI；解锁需密码，密码不落盘 |
| 主题 | 浅色 / 深色 / **护眼**（暖绿纸感、降低蓝光与对比，编辑器与预览区同步染色）；顶栏按钮或菜单「视图 → 切换主题」循环切换，选择本地持久化 |

## 多知识库与存储位置

- **知识库根**：首启自动创建「文档/知识库」作为默认根，开箱即用；可在「关于」页或侧栏随时**添加**任意本地文件夹为新的知识库根（互为嵌套的目录会被拒绝）。
  - 侧栏根行悬停：✚ 根目录新建笔记、📁 新建文件夹、⭐ 设为默认库、✕ 移除（**只注销目录，绝不删除磁盘文件**）。
  - 索引 / 搜索 / 图谱 / 待办 / 回收站跨根聚合；每日笔记写入默认根。
  - `[[双链]]` 只在**同一知识库内**解析，跨库同名笔记不会互相连边。
- **应用数据目录**：默认位于系统用户数据目录（`%APPDATA%\knowledge-base`）。可在「关于 → 应用数据目录」改到自定义位置：
  - 指针文件固定写在系统默认用户数据目录的 `kb-data-dir.json`，启动前据此重定向；
  - **重启后生效**，只迁移配置（`kb-settings.json`），不搬缓存；
  - 数据目录不允许位于任何知识库目录内。

### 知识库目录结构

```text
知识库/                 ← 一个知识库根
├── 笔记.md             ← 任意层级的普通 Markdown 文件（目录即分类）
├── 子目录/…
├── assets/             ← 粘贴/拖入的图片附件
├── daily/              ← 每日笔记 YYYY-MM-DD.md
├── .trash/             ← 回收站（保留原相对路径）
└── （. 开头目录、node_modules 不参与索引）
```

### 配置文件

```jsonc
// <userData>/kb-settings.json
{
  "defaultVaultId": "default",
  "vaults": [{ "id": "default", "path": "C:/Users/you/Documents/知识库", "name": "知识库" }],
  "ai": { "baseURL": "https://api.openai.com", "apiKeyEnc": "<系统凭据加密后的 base64>", "model": "" }
}
```

旧版单根配置（`vaultPath`）在首次加载时自动迁移为 `vaults` 并落盘；旧版明文 `apiKey` 也会在首次加载时改写成密文 `apiKeyEnc`（详见「隐私与本地存储」）。页面输入框为密码框。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + N` | 新建笔记 |
| `Ctrl/Cmd + D` | 生成/打开今日笔记 |
| `Ctrl/Cmd + Shift + F` | 发起搜索 |
| `Ctrl/Cmd + S` | 立即保存当前笔记 |

菜单另含：导出为 HTML / PDF、重新扫描知识库、添加知识库目录、侧栏开合、源码分栏/所见即所得、切换主题。

## 开发

```bash
npm install          # 安装依赖 + postinstall 同步 Vditor 离线资产到 src/renderer/public/vditor-assets
npm run dev          # 开发模式（热更新）
npm run typecheck    # vue-tsc 双 tsconfig 类型检查
npm run build        # 类型检查 + 构建到 out/
npm start            # 预览构建产物
```

打包 Windows 安装包（国内网络建议显式带镜像环境变量）：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npm run build:win    # → dist/知识库-Setup-<version>.exe
```

## 目录结构

```text
src/
├── main/                  # 主进程
│   ├── index.ts           # 启动顺序：registerSchemesAsPrivileged → applyCustomDataDir → 窗口/IPC/菜单；kbvault 协议
│   ├── vault.ts           # 知识库纯业务层（扫描/解析/索引/图谱/搜索/回收站/附件，不依赖 electron）
│   ├── kb-ipc.ts          # 全部 kb:* IPC 渠道 + 多根文件监听 + 跨根合并
│   ├── settings-model.ts  # 配置纯逻辑（v1→v2 迁移、路径冲突、根 id）
│   ├── settings.ts        # 配置读写与知识库根注册表（唯一持久化源头）
│   ├── data-dir.ts        # 自定义应用数据目录（pointer + 启动前重定向）
│   ├── ai.ts              # OpenAI 兼容问答 + RAG
│   ├── menu.ts / ipc.ts   # 应用菜单 / 通用文件-对话框渠道
│   └── …
├── preload/               # 上下文隔离桥
│   ├── api.ts             # 主进程 ↔ 渲染进程的唯一类型契约（NoteMeta / KbApi / 渠道签名）
│   └── index.ts           # window.api / window.kb 暴露
└── renderer/src/          # 渲染进程（Vue 3）
    ├── note.ts            # 笔记生命周期唯一入口（打开/落盘/新建/改名/删除/每日）
    ├── store.ts           # 全局响应式状态（无 Pinia）
    ├── components/        # SideBar / FolderNode / EditorPane / MdEditor / StatusBar …
    └── views/             # 首页 / 笔记 / 搜索 / 每日 / 标签 / 待办 / 图谱 / AI / 关于 / 回收站 / 欢迎
```

### 数据模型要点

- 笔记身份是**全局 id**`"<vaultId>/<库内相对路径>"`（如 `default/子目录/笔记.md`），`relPath` 仅用于展示；渲染进程一切身份判断都用 id。
- 图片协议：`kbvault://vault/<vaultId>/<encodeURIComponent(库内相对路径)>`（无 `vaultId` 的老式 URL 视为 `default` 根）。
- 主进程写操作成功后广播 `kb:event {type:'index', source:'op'|'watch'}`，渲染进程据此重扫；文件监听为每根一套 `fs.watch(recursive)`，不可用时降级为根 + 一级子目录。

## 隐私与本地存储

| 面 | 说明 |
| --- | --- |
| 隐私空间笔记 | 仅存在于库内 `.private/` 的密文文件（`.kbp`）：正文、原文件名都在密文里；密码只驻留内存，忘记即无法恢复（无后门）。锁定时对索引/搜索/图谱/待办/AI 全部不可见；解锁后才参与并在卡片上带锁标 |
| AI API Key | 以**系统凭据加密**落盘（Windows DPAPI / macOS Keychain / Linux SecretService），`kb-settings.json` 中只有密文字段 `ai.apiKeyEnc`，不再保存明文；设置页输入框为密码框。换系统账户/换机器后旧密文不可解密，会提示重新输入（不影响启动）。系统不支持加密、或系统密钥载体尚未就绪（Windows 首次运行的 `Local State`）时会回退明文保存并在控制台告警，**下次启动会自动迁移为密文**。 |
| 笔记与附件 | 就是你自己选的库目录里的明文 `.md` 与 `assets/` 文件——**不做加密**（免迁移、外部可编辑器编辑是核心特性）。隐私由操作系统文件权限与磁盘加密（BitLocker / FileVault）承担。 |
| 网络行为 | 应用无遥测、无统计上报；隐私空间的笔记**永远不进入 AI 问答上下文**（即使已解锁）。唯一出网行为是「AI 问答」：把问题与至多 8 篇命中笔记的片段（标题 + 命中行，≤4000 字）发往**你在设置里填写的 baseURL**。未配置 API Key 时不会发生任何请求。 |
| 导出 PDF | 打印用临时 HTML 写在系统临时目录，打印完成后立即删除。 |
| 数据目录指针 | `kb-data-dir.json` 只保存你选择的数据目录路径，不含任何内容。 |
| 缓存 | Electron/Chromium 标准缓存位于应用数据目录（含渲染过程中的页面缓存），与常见桌面应用一致；介意时可手动清空该目录下的 `Cache`/`GPUCache`。 |
| 导出文件 | 导出 HTML 保持相对图片路径（便携）；导出 PDF 会把图片改为 `kbvault://` 绝对地址以便打印窗口加载。 |

## 已知边界

- `[[双链]]` 不解析跨知识库目标；不渲染为可点击元素，导航通过图谱节点、搜索、编辑器顶部「链接提及」条完成。
- 移除知识库根只注销注册表，磁盘文件保持不变。
- 数据目录切换不迁移缓存文件，只复制配置文件。
