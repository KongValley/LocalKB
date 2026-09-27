<script setup lang="ts">
import type { NoteMeta } from '../../../preload/api'
import { store } from '../store'

const props = defineProps<{ note: NoteMeta; showDir?: boolean }>()
const emit = defineEmits<{ open: [id: string] }>()

function relTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function isActive(): boolean {
  return store.activeId === props.note.id
}
</script>

<template>
  <div class="note-card" :class="{ active: isActive() }" @click="emit('open', note.id)">
    <div class="t">
      <span class="title">{{ note.title }}</span>
      <span v-if="isActive() && store.saving" class="dot saving" title="保存中"></span>
      <span v-else-if="isActive() && store.dirty" class="dot dirty" title="未保存"></span>
    </div>
    <div class="s">{{ note.snippet || '（空笔记）' }}</div>
    <div class="m">
      <span v-if="showDir !== false && note.dir">{{ note.dir }}/</span>
      <span>{{ relTime(note.mtimeMs) }}</span>
      <span v-if="note.tags.length">{{ note.tags.map((t) => `#${t}`).join(' ') }}</span>
    </div>
  </div>
</template>
