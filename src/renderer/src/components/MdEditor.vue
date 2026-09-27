<script lang="ts">
export const VDITOR_CDN = new URL('vditor-assets', location.href).toString().replace(/\/+$/, '')
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import type { AppTheme, EditorMode } from '../../../preload/api'
import { dirOfRel, splitNodeId, store } from '../store'
import { vaultUrl } from '../vault-url'

const props = defineProps<{ mode: EditorMode; theme: AppTheme; initialValue: string }>()
const emit = defineEmits<{
  input: [value: string]
  ready: [v: Vditor | null]
  count: [len: number]
}>()

const host = ref<HTMLDivElement | null>(null)
let vditor: Vditor | null = null
let observer: MutationObserver | null = null

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** 笔记内相对图片（assets/…）→ kbvault:// 才能显示（按当前笔记所属根） */
function fixImages(): void {
  const el = host.value
  if (!el) return
  let vaultId = store.defaultVaultId ?? ''
  let noteDir = ''
  if (store.activeId) {
    try {
      const s = splitNodeId(store.activeId)
      vaultId = s.vaultId
      noteDir = dirOfRel(s.rel)
    } catch {
      /* 保持默认根 */
    }
  }
  if (!vaultId) return
  for (const img of el.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    if (!src || src.startsWith('kbvault:')) continue
    const url = vaultUrl(src, noteDir, vaultId)
    if (url) img.setAttribute('src', url)
  }
}

onMounted(() => {
  const vd = new Vditor(host.value!, {
    mode: props.mode,
    theme: props.theme === 'dark' ? 'dark' : 'classic',
    value: props.initialValue,
    height: '100%',
    cdn: VDITOR_CDN,
    cache: { enable: false },
    toolbar: [
      'headings',
      'bold',
      'italic',
      'strike',
      'quote',
      'line',
      '|',
      'list',
      'ordered-list',
      'check',
      'table',
      '|',
      'code',
      'inline-code',
      'link',
      '|',
      'undo',
      'redo'
    ],
    toolbarConfig: { pin: true },
    counter: { enable: true, type: 'markdown', after: (len) => emit('count', len) },
    preview: { delay: 300, theme: { current: props.theme === 'dark' ? 'dark' : 'light' } },
    link: { isOpen: false },
    upload: {
      // 粘贴/拖入图片 → 落该笔记所属根的 assets；vditor 4 只把 handler 返回值当错误提示，须自行插入 Markdown
      handler: async (files: File[]): Promise<null> => {
        const id = store.activeId
        if (!id) {
          alert('请先打开一篇笔记再粘贴图片')
          return null
        }
        const parts: string[] = []
        for (const f of files) {
          try {
            const r = await window.kb.imageSave(
              id,
              f.name || 'image.png',
              toBase64(await f.arrayBuffer())
            )
            if (r.ok) parts.push(r.markdown)
            else alert(`图片保存失败：${r.error}`)
          } catch (e) {
            alert(`图片保存失败：${String((e as Error)?.message ?? e)}`)
          }
        }
        if (parts.length) vd.insertValue(parts.join('\n'))
        return null
      }
    },
    after() {
      observer = new MutationObserver(() => fixImages())
      observer.observe(host.value!, { subtree: true, childList: true })
      fixImages()
      emit('ready', vd)
    },
    input: (value) => emit('input', value)
  })
  vditor = vd
})

watch(
  () => props.theme,
  (t) => vditor?.setTheme(t === 'dark' ? 'dark' : 'classic', t === 'dark' ? 'dark' : 'light')
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  emit('ready', null)
  vditor?.destroy()
  vditor = null
})

defineExpose({ getValue: (): string => vditor?.getValue() ?? '' })
</script>

<template>
  <div ref="host" class="md-editor-host"></div>
</template>

<style scoped>
.md-editor-host {
  height: 100%;
  overflow: hidden;
}

.md-editor-host :deep(.vditor) {
  border: none;
  border-radius: 0;
}
</style>
