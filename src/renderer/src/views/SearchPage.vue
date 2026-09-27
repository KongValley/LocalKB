<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { SearchHit } from '../../../preload/api'
import PageHeader from '../components/PageHeader.vue'
import { openNote } from '../note'
import { fileNameOf, store } from '../store'

const router = useRouter()

const query = ref('')
const results = ref<SearchHit[]>([])
const searched = ref(false)
const loading = ref(false)
const error = ref('')

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlight(text: string, q: string): string {
  const safe = escapeHtml(text)
  if (!q) return safe
  const needle = escapeHtml(q).toLowerCase()
  if (!needle) return safe
  const lower = safe.toLowerCase()
  let out = ''
  let from = 0
  for (;;) {
    const i = lower.indexOf(needle, from)
    if (i < 0) break
    out += safe.slice(from, i) + '<b>' + safe.slice(i, i + needle.length) + '</b>'
    from = i + needle.length
    if (from >= safe.length) break
  }
  return out + safe.slice(from)
}

function titleOf(id: string): string {
  const found = store.notes.find((n) => n.id === id)
  if (found) return found.title
  const i = id.indexOf('/')
  return fileNameOf(i < 0 ? id : id.slice(i + 1))
}

async function search(): Promise<void> {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    searched.value = false
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const r = await window.kb.search(q)
    if (r.ok === false) {
      error.value = r.error
      results.value = []
      searched.value = true
      return
    }
    results.value = r.results
    searched.value = true
  } finally {
    loading.value = false
  }
}

async function onOpen(id: string): Promise<void> {
  await openNote(id)
  await router.push('/notes')
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="搜索" />

    <div class="kb-list-search">
      <input
        v-model="query"
        class="input"
        placeholder="输入关键词后回车"
        @keydown.enter="search"
      />
      <button class="btn btn-accent" :disabled="loading" @click="search">搜索</button>
    </div>

    <div v-if="error" class="empty">{{ error }}</div>
    <template v-else-if="results.length">
      <div v-for="hit in results" :key="hit.id" class="card click" @click="onOpen(hit.id)">
        <div class="kb-page-sub">
          {{ titleOf(hit.id) }}
          <span>命中 {{ hit.count }} 处</span>
        </div>
        <div v-for="(l, i) in hit.lines" :key="i" class="note-row">
          <span class="t"><span class="title">第 {{ l.line }} 行</span></span>
          <span class="s" v-html="highlight(l.text, query.trim())"></span>
        </div>
      </div>
    </template>
    <div v-else-if="searched" class="empty">没有找到匹配的笔记</div>
    <div v-else class="empty">输入关键词开始搜索</div>
  </div>
</template>
