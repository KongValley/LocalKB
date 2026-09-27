import Vditor from 'vditor'
import { VDITOR_CDN } from './components/MdEditor.vue'

export async function renderStaticHtml(md: string): Promise<string> {
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:820px;height:600px;visibility:hidden;pointer-events:none;'
  const inner = document.createElement('div')
  host.appendChild(inner)
  document.body.appendChild(host)
  const hasMermaid = /```mermaid/i.test(md)
  try {
    return await new Promise<string>((resolve) => {
      let done = false
      const finish = (html: string): void => {
        if (done) return
        done = true
        resolve(html)
      }
      const vd = new Vditor(inner, {
        mode: 'sv',
        value: md,
        cdn: VDITOR_CDN,
        cache: { enable: false },
        toolbar: [],
        preview: { delay: 0 },
        after() {
          // 只取 .vditor-reset（纯渲染结果），排除 .vditor-preview__action 等 UI chrome
          const snapshot = (): string => {
            const pv = inner.querySelector('.vditor-preview') as HTMLElement | null
            const reset = pv?.querySelector('.vditor-reset') as HTMLElement | null
            return (reset ?? pv)?.innerHTML ?? ''
          }
          const readyToSnapshot = (): boolean => {
            const reset = inner.querySelector('.vditor-preview .vditor-reset')
            if (!reset || !reset.innerHTML.trim()) return false
            if (hasMermaid && !reset.querySelector('svg[id^="mermaid"], svg[aria-roledescription]'))
              return false
            return true
          }
          const poll = setInterval(() => {
            if (!readyToSnapshot()) return
            const html = snapshot()
            clearInterval(poll)
            vd.destroy()
            finish(html)
          }, 100)
          setTimeout(() => {
            clearInterval(poll)
            const html = snapshot()
            vd.destroy()
            finish(html)
          }, 3000)
        }
      })
    })
  } finally {
    host.remove()
  }
}

const EXPORT_CSS = `body{margin:0;background:#fff;color:#1f2328;font:16px/1.7 "Segoe UI","Microsoft YaHei",sans-serif}
.md-doc{max-width:820px;margin:0 auto;padding:40px 24px}
.md-doc img{max-width:100%} .md-doc pre{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto}
.md-doc code{background:#eff1f3;padding:.15em .35em;border-radius:4px;font-family:Consolas,"Courier New",monospace}
.md-doc pre code{background:none;padding:0}
.md-doc blockquote{margin:0;padding:0 12px;border-left:4px solid #dfe2e5;color:#6a737d}
.md-doc table{border-collapse:collapse} .md-doc th,.md-doc td{border:1px solid #dfe2e5;padding:6px 12px}
.md-doc h1,.md-doc h2{border-bottom:1px solid #eaecef;padding-bottom:.3em}
.md-doc svg{max-width:100%}`

export function buildExportHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>
<style>${EXPORT_CSS}</style></head>
<body><article class="md-doc">${bodyHtml}</article></body></html>`
}
