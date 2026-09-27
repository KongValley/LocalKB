import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(root, 'node_modules', 'vditor', 'dist')
const targetRoot = join(root, 'src', 'renderer', 'public', 'vditor-assets', 'dist')
// dist/js: lute/i18n/icons/highlight/mermaid 等运行时资源；dist/css/content-theme: 明暗内容主题
const PARTS = ['js', 'css']

if (!existsSync(sourceRoot)) {
  console.error(`未找到 vditor 资源目录：${sourceRoot}`)
  process.exit(1)
}

for (const part of PARTS) {
  const source = join(sourceRoot, part)
  if (!existsSync(source)) {
    console.error(`未找到 vditor 资源子目录：${source}`)
    process.exit(1)
  }
  const target = join(targetRoot, part)
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, { recursive: true })
}
console.log('vditor assets synced')
