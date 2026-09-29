<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HeaderBar from './components/HeaderBar.vue'
import Lightbox from './components/Lightbox.vue'
import QuickOpen from './components/QuickOpen.vue'
import SideBar from './components/SideBar.vue'
import { openNote, setMode, toggleTheme } from './note'
import { store } from './store'

const route = useRoute()
const router = useRouter()
const isWelcome = computed(() => route.name === 'welcome')

/* ── 全局快捷键：Ctrl/Cmd+P(K) 快速打开 · Ctrl+=/-/0 字号 · Esc 关浮层 ── */

const quickOpenVisible = ref(false)

function onKeydown(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod && (key === 'p' || key === 'k')) {
    e.preventDefault()
    quickOpenVisible.value = !quickOpenVisible.value
    return
  }
  if (mod && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    store.editorFontSize = Math.min(24, store.editorFontSize + 1)
    return
  }
  if (mod && e.key === '-') {
    e.preventDefault()
    store.editorFontSize = Math.max(12, store.editorFontSize - 1)
    return
  }
  if (mod && e.key === '0') {
    e.preventDefault()
    store.editorFontSize = 15
    return
  }
  if (e.key === 'Escape') {
    if (store.lightboxSrc) store.lightboxSrc = null
    else if (quickOpenVisible.value) quickOpenVisible.value = false
  }
}

async function onQuickOpen(id: string): Promise<void> {
  quickOpenVisible.value = false
  if (await openNote(id)) await router.push('/notes')
}

/* ── 只读容器内 kbvault 图片点击 → 放大层（编辑区不拦截，避免影响图片操作） ── */

function onDocClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (target.tagName !== 'IMG') return
  const img = target as HTMLImageElement
  if (!img.src.startsWith('kbvault://')) return
  if (!img.closest('.vditor-preview, .bubble, .kb-md')) return
  // 捕获阶段拦下：阻断 vditor 自带查看器（旋转/关闭），统一走 .kb-lightbox
  e.preventDefault()
  e.stopPropagation()
  store.lightboxSrc = img.src
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocClick, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocClick, true)
})
</script>

<template>
  <div class="kb-shell">
    <SideBar v-if="!isWelcome" />
    <div class="kb-main">
      <HeaderBar v-if="!isWelcome" @mode="setMode" @toggle-theme="toggleTheme" />
      <router-view />
    </div>
    <QuickOpen :visible="quickOpenVisible" @close="quickOpenVisible = false" @open="onQuickOpen" />
    <Lightbox />
  </div>
</template>
