<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { NoteMeta, TodoItem } from '../../../preload/api'
import PageHeader from '../components/PageHeader.vue'
import { openNote, rescan } from '../note'
import { store } from '../store'

interface TodoGroup {
  note: NoteMeta
  todos: TodoItem[]
}

const router = useRouter()

/** 待办直接取自索引（kb:scan 已附带 todos），无需额外 IPC */
const groups = computed<TodoGroup[]>(() =>
  store.notes.filter((n) => n.todos.length).map((n) => ({ note: n, todos: n.todos }))
)

const total = computed(() => groups.value.reduce((sum, g) => sum + g.todos.length, 0))
const openCount = computed(() =>
  groups.value.reduce((sum, g) => sum + g.todos.filter((t) => !t.done).length, 0)
)

function openCountOf(g: TodoGroup): number {
  return g.todos.filter((t) => !t.done).length
}

async function open(id: string): Promise<void> {
  await openNote(id)
  await router.push('/notes')
}

async function onToggle(id: string, line: number, ev: Event): Promise<void> {
  const box = ev.target as HTMLInputElement
  const r = await window.kb.todoToggle(id, line, box.checked)
  if ('ok' in r && r.ok === false) {
    alert(`更新待办失败：${r.error}`)
    box.checked = !box.checked
    return
  }
  await rescan()
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="待办" :sub="`共 ${total} 条，未完成 ${openCount} 条`" />

    <section v-for="g in groups" :key="g.note.id" class="card todo-group">
      <div class="todo-group-head">
        <span class="todo-group-title">{{ g.note.title }}</span>
        <span class="kb-page-sub">{{ g.todos.length }} 条 · 未完成 {{ openCountOf(g) }} 条</span>
      </div>
      <div v-for="t in g.todos" :key="`${g.note.id}:${t.line}`" class="todo-row">
        <input
          type="checkbox"
          :checked="t.done"
          @change="onToggle(g.note.id, t.line, $event)"
        />
        <span class="txt" :class="{ done: t.done }">{{ t.text }}</span>
        <button class="chip" @click="open(g.note.id)">{{ g.note.title }}</button>
      </div>
    </section>

    <div v-if="!groups.length" class="empty">没有待办事项，在笔记里写 - [ ] 任务 即可</div>
  </div>
</template>

<style scoped>
.todo-group {
  margin-bottom: 12px;
  padding: 10px 12px;
}

.todo-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 8px;
}

.todo-group-title {
  font-weight: 600;
  font-size: 13.5px;
}

.todo-group .todo-row:last-child {
  border-bottom: none;
}
</style>
