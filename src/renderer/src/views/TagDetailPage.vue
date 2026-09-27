<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NoteListCard from '../components/NoteListCard.vue'
import PageHeader from '../components/PageHeader.vue'
import { openNote } from '../note'
import { store } from '../store'
import type { NoteMeta } from '../../../preload/api'

const route = useRoute()
const router = useRouter()

const tag = String(route.params.tag ?? '')

const notes = computed<NoteMeta[]>(() => store.notes.filter((n) => n.tags.includes(tag)))
const vaultCount = computed<number>(() => new Set(notes.value.map((n) => n.vaultId)).size)

async function onOpen(id: string): Promise<void> {
  await openNote(id)
  await router.push('/notes')
}
</script>

<template>
  <div class="kb-page">
    <PageHeader :title="'#' + tag" :sub="`${notes.length} 篇笔记 · 覆盖 ${vaultCount} 个知识库`">
      <button class="btn" @click="router.push('/tags')">返回</button>
    </PageHeader>
    <div v-if="notes.length" class="kb-cards">
      <NoteListCard v-for="n in notes" :key="n.id" :note="n" @open="onOpen" />
    </div>
    <div v-else class="empty">没有使用该标签的笔记</div>
  </div>
</template>
