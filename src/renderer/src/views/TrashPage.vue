<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { TrashItem } from '../../../preload/api'
import PageHeader from '../components/PageHeader.vue'
import { store, vaultNameById } from '../store'

const items = ref<TrashItem[]>([])
const confirming = ref(false)
let confirmTimer: number | null = null

function clearConfirmTimer(): void {
  if (confirmTimer !== null) {
    window.clearTimeout(confirmTimer)
    confirmTimer = null
  }
}

async function refresh(): Promise<void> {
  const r = await window.kb.trashList()
  if ('ok' in r && r.ok === true) items.value = r.items
}

onMounted(() => {
  void refresh()
})

onBeforeUnmount(() => {
  clearConfirmTimer()
})

/** 两段按钮内联确认（Electron 渲染进程未实现原生 confirm 对话框） */
async function onPurgeAll(): Promise<void> {
  if (!confirming.value) {
    confirming.value = true
    clearConfirmTimer()
    confirmTimer = window.setTimeout(() => {
      confirming.value = false
      confirmTimer = null
    }, 3000)
    return
  }
  clearConfirmTimer()
  confirming.value = false
  let error: string | null = null
  for (const v of store.vaults) {
    const r = await window.kb.trashPurge(v.id, '__ALL__')
    if ('ok' in r && r.ok === false && error === null) error = r.error
  }
  if (error !== null) {
    alert(`清空回收站失败：${error}`)
    return
  }
  await refresh()
}

async function restore(item: TrashItem): Promise<void> {
  const r = await window.kb.trashRestore(item.vaultId, item.trashedRel)
  if ('ok' in r && r.ok === false) {
    alert(`还原失败：${r.error}`)
    return
  }
  await refresh()
}

async function purgeOne(item: TrashItem): Promise<void> {
  const r = await window.kb.trashPurge(item.vaultId, item.trashedRel)
  if ('ok' in r && r.ok === false) {
    alert(`彻底删除失败：${r.error}`)
    return
  }
  await refresh()
}

function baseName(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? rel : rel.slice(i + 1)
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="回收站" sub="删除的笔记与文件夹会先移到这里">
      <button class="btn" :class="{ 'btn-danger': confirming }" @click="onPurgeAll">
        {{ confirming ? '再次点击确认清空（3s）' : '清空回收站' }}
      </button>
    </PageHeader>

    <div class="trash-list">
      <div v-for="it in items" :key="it.id" class="trash-row">
        <span class="name">{{ it.isDir ? '📁 ' : '' }}{{ baseName(it.trashedRel) }}</span>
        <span class="meta">
          {{ vaultNameById(it.vaultId) }} · 原路径：{{ it.originalRel }} ·
          {{ fmtSize(it.size) }} · {{ fmtTime(it.mtimeMs) }}
        </span>
        <button class="btn" @click="restore(it)">还原</button>
        <button class="btn" @click="purgeOne(it)">彻底删除</button>
      </div>
    </div>

    <div v-if="!items.length" class="empty">回收站是空的</div>
  </div>
</template>

<style scoped>
.trash-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.trash-list .trash-row:last-child {
  border-bottom: none;
}
</style>
