<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { NoteMeta } from '../../../preload/api'
import NoteListCard from '../components/NoteListCard.vue'
import PageHeader from '../components/PageHeader.vue'
import { createNote, daily, openNote } from '../note'
import { store } from '../store'

const router = useRouter()

const noteCount = computed<number>(() => store.notes.length)
const tagCount = computed<number>(() => store.tags.length)
const openTodoCount = computed<number>(() =>
  store.notes.reduce((sum, n) => sum + n.todos.filter((t) => !t.done).length, 0)
)

const recent = computed<NoteMeta[]>(() =>
  [...store.notes].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 8)
)

async function onOpen(id: string): Promise<void> {
  await openNote(id)
  await router.push('/notes')
}

async function onNewNote(): Promise<void> {
  const id = await createNote()
  if (id) await router.push('/notes')
}

async function onDaily(): Promise<void> {
  const id = await daily()
  if (id) await router.push('/notes')
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="首页" sub="知识库概览" />

    <div class="kb-cards">
      <div class="card kb-stat">
        <div class="n">{{ noteCount }}</div>
        <div class="l">笔记</div>
      </div>
      <div class="card kb-stat">
        <div class="n">{{ tagCount }}</div>
        <div class="l">标签</div>
      </div>
      <div class="card kb-stat">
        <div class="n">{{ openTodoCount }}</div>
        <div class="l">待办未完成</div>
      </div>
    </div>

    <div class="kb-page-sub">最近编辑</div>
    <div v-if="recent.length" class="kb-cards">
      <NoteListCard v-for="n in recent" :key="n.id" :note="n" @open="onOpen" />
    </div>
    <div v-else class="empty">知识库中还没有笔记</div>

    <div class="kb-page-sub">快捷操作</div>
    <div class="kb-cards">
      <div class="card kb-stat click" @click="onNewNote">
        <div class="n">＋</div>
        <div class="l">新建笔记</div>
      </div>
      <div class="card kb-stat click" @click="onDaily">
        <div class="n">📅</div>
        <div class="l">每日笔记</div>
      </div>
      <div class="card kb-stat click" @click="router.push('/search')">
        <div class="n">🔍</div>
        <div class="l">搜索</div>
      </div>
    </div>
  </div>
</template>
