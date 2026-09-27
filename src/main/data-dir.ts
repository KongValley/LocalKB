import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathsConflict } from './settings'

/**
 * 自定义应用数据目录：pointer 固定存放在 OS 级默认 userData
 * （`app.getPath('userData')` 被 setPath 改写后仍可寻址），重启后生效。
 */

export function defaultUserDataDir(): string {
  return join(app.getPath('appData'), app.getName())
}

export function pointerFile(): string {
  return join(defaultUserDataDir(), 'kb-data-dir.json')
}

export function readPointer(): string | null {
  try {
    const raw = JSON.parse(readFileSync(pointerFile(), 'utf-8')) as { dataDir?: unknown }
    return typeof raw.dataDir === 'string' && raw.dataDir ? raw.dataDir : null
  } catch {
    return null
  }
}

function writePointer(dir: string | null): void {
  const file = pointerFile()
  if (!dir) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(defaultUserDataDir(), { recursive: true })
  writeFileSync(file, JSON.stringify({ dataDir: dir }, null, 2), 'utf-8')
}

/** app ready 之前调用；pointer 失效则回退默认并清理 */
export function applyCustomDataDir(): void {
  const dir = readPointer()
  if (!dir) return
  try {
    if (!isAbsolute(dir)) throw new Error(`必须是绝对路径：${dir}`)
    mkdirSync(dir, { recursive: true })
    if (!statSync(dir).isDirectory()) throw new Error(`不是目录：${dir}`)
    app.setPath('userData', dir)
  } catch (e) {
    console.warn('kb: 自定义数据目录不可用，回退默认目录', dir, e)
    try {
      writePointer(null)
    } catch {
      /* 清理失败忽略 */
    }
  }
}

export function effectiveDataDir(): string {
  return app.getPath('userData')
}

/** 设置（或清除）自定义数据目录；不搬缓存，只把 kb-settings.json 复制过去 */
export function setDataDir(dir: string | null, forbiddenRoots: string[]): void {
  if (!dir) {
    writePointer(null)
    return
  }
  const d = dir.trim()
  if (!d || !isAbsolute(d)) throw new Error(`请提供绝对路径：${dir}`)
  for (const root of forbiddenRoots) {
    if (pathsConflict(root, d)) throw new Error('数据目录不能位于知识库目录内')
  }
  mkdirSync(d, { recursive: true })
  const src = join(app.getPath('userData'), 'kb-settings.json')
  const dst = join(d, 'kb-settings.json')
  if (existsSync(src) && !existsSync(dst)) copyFileSync(src, dst)
  writePointer(d)
}
