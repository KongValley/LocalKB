<script setup lang="ts">
import { computed } from 'vue'
import type { EditorMode } from '../../../preload/api'
import { activeTitle, activeVaultName, store } from '../store'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ mode: [m: EditorMode]; 'toggle-theme': [] }>()

/** 按钮展示「点一下切换到的主题」：浅色→深色→护眼→浅色 */
const themeButton = computed(() => {
  if (store.theme === 'light') return { icon: 'moon', label: '深色' }
  if (store.theme === 'dark') return { icon: 'eye', label: '护眼' }
  return { icon: 'sun', label: '浅色' }
})
</script>

<template>
  <header class="bar header-bar">
    <span class="app-title">{{ activeVaultName() }}</span>
    <span v-if="activeTitle()" class="file-name">
      / {{ activeTitle() }}<span v-if="store.dirty"> ●</span>
    </span>
    <span v-else-if="store.activeId" class="file-name">/ {{ store.activeId }}</span>
    <span class="spacer"></span>
    <span v-if="store.saving" class="file-name">保存中…</span>
    <button :class="{ active: store.mode === 'sv' }" @click="emit('mode', 'sv')">分栏源码</button>
    <button :class="{ active: store.mode === 'wysiwyg' }" @click="emit('mode', 'wysiwyg')">
      所见即所得
    </button>
    <button :title="`当前：${store.theme === 'light' ? '浅色' : store.theme === 'dark' ? '深色' : '护眼'}主题`" @click="emit('toggle-theme')">
      <AppIcon :name="themeButton.icon" :size="14" />
      {{ themeButton.label }}
    </button>
  </header>
</template>
