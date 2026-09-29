<script setup lang="ts">
import { store } from '../store'
</script>

<template>
  <footer class="bar status-bar">
    <span>{{ store.charCount }} 字符</span>
    <span>{{ store.lineCount }} 行</span>
    <span>约 {{ Math.max(1, Math.round(store.charCount / 400)) }} 分钟</span>
    <span>{{ store.saving ? '保存中…' : store.dirty ? '未保存' : '已保存' }}</span>
    <span>{{ store.mode === 'sv' ? '分栏预览' : '所见即所得' }}</span>
    <span
      class="font-size"
      title="编辑器字号（点击复位 15px，Ctrl+= / Ctrl+- / Ctrl+0）"
      @click="store.editorFontSize = 15"
    >
      {{ store.editorFontSize }}px
    </span>
    <span class="spacer"></span>
    <span class="path" :title="store.activeId ?? ''">{{ store.activeId ?? '未打开笔记' }}</span>
  </footer>
</template>

<style scoped>
.font-size {
  cursor: pointer;
}

.font-size:hover {
  color: var(--accent);
}
</style>
