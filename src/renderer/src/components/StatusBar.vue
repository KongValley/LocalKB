<script setup lang="ts">
import { store } from '../store'
</script>

<template>
  <footer class="bar status-bar">
    <span>{{ store.charCount }} 字符</span>
    <span>{{ store.lineCount }} 行</span>
    <span>{{ store.saving ? '保存中…' : store.dirty ? '未保存' : '已保存' }}</span>
    <span>{{ store.mode === 'sv' ? '分栏预览' : '所见即所得' }}</span>
    <span class="spacer"></span>
    <span class="path" :title="store.activeId ?? ''">{{ store.activeId ?? '未打开笔记' }}</span>
  </footer>
</template>
