<script setup lang="ts">
import type { EditorMode } from '../../../preload/api'
import { activeTitle, activeVaultName, store } from '../store'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ mode: [m: EditorMode]; 'toggle-theme': [] }>()
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
    <button @click="emit('toggle-theme')">
      <AppIcon :name="store.theme === 'dark' ? 'sun' : 'moon'" :size="14" />
      {{ store.theme === 'dark' ? '浅色' : '深色' }}
    </button>
  </header>
</template>
