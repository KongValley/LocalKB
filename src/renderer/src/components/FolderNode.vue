<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DirNode } from '../folders'

const props = defineProps<{ node: DirNode; depth: number; vaultId: string }>()

const route = useRoute()
const router = useRouter()

const expanded = ref(true)
const mode = ref<'idle' | 'create' | 'rename'>('idle')
const draft = ref('')
const confirming = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
let confirmTimer: number | null = null

const active = computed(
  () =>
    route.path === '/notes' &&
    route.query.vault === props.vaultId &&
    route.query.dir === props.node.rel
)
const hasChildren = computed(() => props.node.children.length > 0)

function open(): void {
  void router.push({ path: '/notes', query: { vault: props.vaultId, dir: props.node.rel } })
}

function focusInput(): void {
  void nextTick(() => inputEl.value?.focus())
}

function startCreate(): void {
  mode.value = 'create'
  draft.value = ''
  focusInput()
}

function startRename(): void {
  mode.value = 'rename'
  draft.value = props.node.name
  focusInput()
}

function cancel(): void {
  if (mode.value === 'idle') return
  mode.value = 'idle'
}

async function commit(): Promise<void> {
  if (mode.value === 'idle') return
  const name = draft.value.replace(/[\\/:*?"<>|]/g, ' ').trim()
  const current = mode.value
  mode.value = 'idle'
  if (!name) return
  if (current === 'create') {
    const rel = props.node.rel ? `${props.node.rel}/${name}` : name
    const r = await window.kb.folderCreate(props.vaultId, rel)
    if (!r.ok) alert(`新建文件夹失败：${r.error}`)
    else expanded.value = true
    return
  }
  const oldRel = props.node.rel
  const parent = oldRel.includes('/') ? oldRel.slice(0, oldRel.lastIndexOf('/')) : ''
  const newRel = parent ? `${parent}/${name}` : name
  const r = await window.kb.folderRename(props.vaultId, oldRel, newRel)
  if (!r.ok) alert(`重命名失败：${r.error}`)
}

function askDelete(): void {
  if (confirming.value) {
    confirming.value = false
    if (confirmTimer) clearTimeout(confirmTimer)
    void window.kb.folderDelete(props.vaultId, props.node.rel).then((r) => {
      if (!r.ok) alert(`删除失败：${r.error}`)
    })
    return
  }
  confirming.value = true
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = window.setTimeout(() => {
    confirming.value = false
  }, 3000)
}

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})
</script>

<template>
  <div class="kb-tree">
    <div class="kb-tree-row" :class="{ active }" :style="{ paddingLeft: `${8 + depth * 12}px` }">
      <span v-if="hasChildren" class="caret" @click.stop="expanded = !expanded">
        {{ expanded ? '▾' : '▸' }}
      </span>
      <span v-else class="caret-space"></span>
      <span class="name" :title="node.rel" @click="open">{{ node.name }}</span>
      <span class="acts">
        <button class="mini-btn" title="新建子文件夹" @click.stop="startCreate">✚</button>
        <button class="mini-btn" title="重命名" @click.stop="startRename">✎</button>
        <button
          class="mini-btn"
          :title="confirming ? '再次点击确认删除' : '删除到回收站'"
          @click.stop="askDelete"
        >
          {{ confirming ? '确认?' : '✕' }}
        </button>
      </span>
    </div>

    <div
      v-if="mode !== 'idle'"
      class="kb-tree-row"
      :style="{ paddingLeft: `${8 + (depth + 1) * 12}px` }"
    >
      <input
        ref="inputEl"
        v-model="draft"
        class="input"
        :placeholder="mode === 'create' ? '子文件夹名' : '新名称'"
        @keydown.enter="commit"
        @keydown.esc="cancel"
        @blur="cancel"
      />
    </div>

    <template v-if="expanded">
      <FolderNode
        v-for="child in node.children"
        :key="child.rel"
        :node="child"
        :depth="depth + 1"
        :vault-id="vaultId"
      />
    </template>
  </div>
</template>
