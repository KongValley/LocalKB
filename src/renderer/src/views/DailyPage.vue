<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import NoteListCard from '../components/NoteListCard.vue'
import PageHeader from '../components/PageHeader.vue'
import { daily, openNote } from '../note'
import { store } from '../store'
import type { NoteMeta } from '../../../preload/api'

const router = useRouter()
const busy = ref(false)

const recent = computed<NoteMeta[]>(() =>
  store.notes
    .filter((n) => n.dir === 'daily')
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))
    .slice(0, 30)
)

async function openToday(): Promise<void> {
  busy.value = true
  try {
    const id = await daily()
    if (id) await router.push('/notes')
  } finally {
    busy.value = false
  }
}

async function onOpen(id: string): Promise<void> {
  await openNote(id)
  await router.push('/notes')
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="每日笔记" sub="每天一篇，放在 daily/ 目录" />
    <div class="card" style="margin-bottom: 16px">
      <button class="btn btn-accent" :disabled="busy" @click="openToday">
        生成/打开今天的每日笔记
      </button>
    </div>
    <h2 class="kb-page-title" style="margin-bottom: 10px">最近每日笔记</h2>
    <div v-if="recent.length" class="kb-cards">
      <NoteListCard v-for="n in recent" :key="n.id" :note="n" :show-dir="false" @open="onOpen" />
    </div>
    <div v-else class="empty">还没有每日笔记</div>
  </div>
</template>
