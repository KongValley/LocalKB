<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { NoteMeta } from '../../../preload/api'
import AppIcon from './AppIcon.vue'
import { fileNameOf, store, vaultNameById } from '../store'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: []; open: [id: string] }>()

const q = ref('')
const sel = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

/** 子序列匹配：q 的每个字符按顺序出现在文本中即可 */
function subseq(text: string, query: string): boolean {
  let i = 0
  for (const ch of text) {
    if (ch === query[i]) i++
    if (i >= query.length) return true
  }
  return i >= query.length
}

const candidates = computed<NoteMeta[]>(() => {
  const query = q.value.trim().toLowerCase()
  const all = [...store.notes].sort((a, b) => b.mtimeMs - a.mtimeMs)
  if (!query) return all.slice(0, 12)
  return all
    .filter((n) => {
      const title = n.title.toLowerCase()
      return (
        subseq(title, query) ||
        subseq(n.name.toLowerCase(), query) ||
        subseq(n.relPath.toLowerCase(), query)
      )
    })
    .sort((a, b) => Number(subseq(b.title.toLowerCase(), query)) - Number(subseq(a.title.toLowerCase(), query)))
    .slice(0, 12)
})

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    q.value = ''
    sel.value = 0
    await nextTick()
    inputEl.value?.focus()
  }
)

watch(q, () => {
  sel.value = 0
})

function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    sel.value = candidates.value.length ? (sel.value + 1) % candidates.value.length : 0
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    sel.value = candidates.value.length
      ? (sel.value - 1 + candidates.value.length) % candidates.value.length
      : 0
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const hit = candidates.value[sel.value]
    if (hit) emit('open', hit.id)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <div v-if="props.visible" class="quick-open" @mousedown.self="emit('close')">
    <div class="quick-open-card">
      <input
        ref="inputEl"
        v-model="q"
        class="input"
        placeholder="输入名称快速打开笔记，回车确认…"
        @keydown="onKey"
      />
      <div class="quick-open-list">
        <div
          v-for="(n, i) in candidates"
          :key="n.id"
          class="quick-open-item"
          :class="{ active: i === sel }"
          @mousemove="sel = i"
          @click="emit('open', n.id)"
        >
          <AppIcon :name="n.private ? 'lock' : 'note'" :size="14" />
          <span class="title">{{ n.title }}</span>
          <span class="kb-count">{{ vaultNameById(n.vaultId) }}/{{ n.relPath }}</span>
        </div>
        <div v-if="!candidates.length" class="quick-open-empty">没有匹配的笔记</div>
      </div>
    </div>
  </div>
</template>
