<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import type { GraphLink } from '../../../preload/api'
import {
  deleteActive,
  ensureGraph,
  exportHtmlDoc,
  exportPdfDoc,
  openNote,
  renameActive,
  rescan,
  setEditor
} from '../note'
import AppIcon from './AppIcon.vue'
import { activeNote, fileNameOf, onEditorInput, store } from '../store'
import MdEditor from './MdEditor.vue'
import StatusBar from './StatusBar.vue'

const router = useRouter()
const titleDraft = ref('')

watch(
  () => store.activeId,
  (id) => {
    const note = activeNote()
    titleDraft.value = id ? (note?.name ?? fileNameOf(id)) : ''
  },
  { immediate: true }
)

const isPrivate = computed(() => activeNote()?.private === true)

async function togglePrivacy(moveIn: boolean): Promise<void> {
  const id = store.activeId
  if (!id) return
  if (moveIn && !store.privacy.configured) {
    alert('请先在「隐私空间」页设置密码')
    await router.push('/private')
    return
  }
  if (moveIn && !store.privacy.unlocked) {
    alert('请先在「隐私空间」页解锁')
    await router.push('/private')
    return
  }
  const r = moveIn ? await window.kb.privacyEnter(id) : await window.kb.privacyLeave(id)
  if (!r.ok) {
    alert(`${moveIn ? '移入' : '移出'}隐私空间失败：${r.error}`)
    return
  }
  await rescan()
  await openNote(r.id)
}

// 索引事件会把 store.graph 置空；有打开的笔记时按需重拉（提及条数据源）
watchEffect(() => {
  if (store.activeId && !store.graph) void ensureGraph()
})

const outLinks = computed<GraphLink[]>(() => {
  const g = store.graph
  if (!g || !store.activeId) return []
  return g.links.filter((l) => l.source === store.activeId)
})

const inLinks = computed<GraphLink[]>(() => {
  const g = store.graph
  if (!g || !store.activeId) return []
  return g.links.filter((l) => l.target === store.activeId)
})

function labelOf(id: string): string {
  return store.notes.find((n) => n.id === id)?.title ?? fileNameOf(id)
}

function onCount(n: number): void {
  store.charCount = n
}

async function commitTitle(): Promise<void> {
  const cur = store.activeId ? fileNameOf(store.activeId) : ''
  if (!store.activeId || titleDraft.value.trim() === cur) return
  const ok = await renameActive(titleDraft.value)
  if (!ok) titleDraft.value = cur
}

async function open(target: string): Promise<void> {
  const ok = await openNote(target)
  if (ok) await router.push('/notes')
}

async function moveToTrash(): Promise<void> {
  await deleteActive()
}
</script>

<template>
  <div class="kb-editor-col">
    <div v-if="store.activeId" class="kb-editor-head">
      <input
        v-model="titleDraft"
        class="kb-title-input"
        title="重命名笔记文件（回车确认）"
        @keydown.enter="commitTitle"
        @blur="commitTitle"
      />
      <span v-if="isPrivate" class="kb-page-sub privacy-badge">
        <AppIcon name="lock" :size="12" />
        隐私空间
      </span>
      <span v-if="store.saving" class="dot saving" title="保存中"></span>
      <span v-else-if="store.dirty" class="dot dirty" title="未保存"></span>
      <button
        class="btn"
        :class="{ off: !store.editorOutlineVisible }"
        title="收起/展开右侧大纲"
        @click="store.editorOutlineVisible = !store.editorOutlineVisible"
      >
        大纲
      </button>
      <button
        v-if="store.mode === 'sv'"
        class="btn"
        :class="{ off: !store.editorPreviewVisible }"
        title="收起/展开右侧渲染预览"
        @click="store.editorPreviewVisible = !store.editorPreviewVisible"
      >
        预览
      </button>
      <button class="btn" @click="exportHtmlDoc()">导出 HTML</button>
      <button class="btn" @click="exportPdfDoc()">导出 PDF</button>
      <button v-if="isPrivate" class="btn" @click="togglePrivacy(false)">移出隐私空间</button>
      <button v-else class="btn" @click="togglePrivacy(true)">移入隐私空间</button>
      <button class="btn" @click="moveToTrash()">移入回收站</button>
    </div>

    <div v-if="outLinks.length || inLinks.length" class="mention-bar">
      <template v-if="outLinks.length">
        <span class="label">链接》{{ outLinks.length }}</span>
        <button
          v-for="l in outLinks"
          :key="`out-${l.target}`"
          class="chip"
          :title="l.target"
          @click="open(l.target)"
        >
          {{ labelOf(l.target) }}
        </button>
      </template>
      <template v-if="inLinks.length">
        <span class="label">被引》{{ inLinks.length }}</span>
        <button
          v-for="l in inLinks"
          :key="`in-${l.source}`"
          class="chip"
          :title="l.source"
          @click="open(l.source)"
        >
          {{ labelOf(l.source) }}
        </button>
      </template>
    </div>

    <div v-if="store.activeId" class="editor-slot">
      <MdEditor
        :key="store.mode"
        :mode="store.mode"
        :theme="store.theme"
        :initial-value="store.openContent"
        @input="onEditorInput"
        @ready="setEditor"
        @count="onCount"
      />
    </div>
    <div v-else class="kb-editor-blank">
      <div class="empty">选择或新建一篇笔记</div>
    </div>

    <StatusBar v-if="store.activeId" />
  </div>
</template>

<style scoped>
.privacy-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #c26a00;
}

.btn.off {
  color: var(--fg-dim);
  border-color: var(--border);
  opacity: 0.7;
}
</style>
