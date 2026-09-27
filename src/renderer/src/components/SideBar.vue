<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { buildRootsTree } from '../folders'
import AppIcon from './AppIcon.vue'
import { createNote, rescan } from '../note'
import { store } from '../store'
import FolderNode from './FolderNode.vue'

const route = useRoute()
const router = useRouter()

const NAV: { path: string; icon: string; label: string }[] = [
  { path: '/', icon: 'home', label: '首页' },
  { path: '/notes', icon: 'note', label: '笔记' },
  { path: '/search', icon: 'search', label: '搜索' },
  { path: '/daily', icon: 'calendar', label: '每日笔记' },
  { path: '/tags', icon: 'tag', label: '标签' },
  { path: '/todos', icon: 'todo', label: '待办' },
  { path: '/graph', icon: 'graph', label: '知识图谱' },
  { path: '/ai', icon: 'ai', label: 'AI 问答' },
  { path: '/about', icon: 'info', label: '关于' }
]

const roots = computed(() =>
  buildRootsTree(store.vaults, store.folders, store.notes, store.defaultVaultId)
)
const firstVaultId = computed(() => store.defaultVaultId ?? store.vaults[0]?.id ?? '')
const collapsedRoots = reactive<Record<string, boolean>>({})

const newFolder = ref<{ vaultId: string; dir: string } | null>(null)
const folderDraft = ref('')
const folderInput = ref<HTMLInputElement | null>(null)
const confirmingRemoval = ref<string | null>(null)
let confirmTimer: number | null = null

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  if (path === '/tags') return route.path.startsWith('/tags')
  return route.path === path
}

function isRootActive(vaultId: string): boolean {
  return route.path === '/notes' && route.query.vault === vaultId && !route.query.dir
}

async function onNewNote(): Promise<void> {
  const id = await createNote()
  if (id) await router.push('/notes')
}

function openRoot(vaultId: string): void {
  void router.push({ path: '/notes', query: { vault: vaultId } })
}

async function newNoteInRoot(vaultId: string): Promise<void> {
  const id = await createNote({ vaultId, dir: '' })
  if (id) await router.push('/notes')
}

/* ── 新建文件夹（根级） ── */

function startNewFolder(vaultId: string, dir = ''): void {
  if (!vaultId) return
  newFolder.value = { vaultId, dir }
  folderDraft.value = ''
  void nextTick(() => folderInput.value?.focus())
}

function setFolderInput(el: unknown): void {
  folderInput.value = (el as HTMLInputElement | null) ?? null
}

async function commitFolder(): Promise<void> {
  const target = newFolder.value
  if (!target) return
  const name = folderDraft.value.replace(/[\\/:*?"<>|]/g, ' ').trim()
  newFolder.value = null
  if (!name) return
  const dirPath = target.dir ? `${target.dir}/${name}` : name
  const r = await window.kb.folderCreate(target.vaultId, dirPath)
  if (!r.ok) alert(`新建文件夹失败：${r.error}`)
}

/* ── 根操作 ── */

async function setDefault(vaultId: string): Promise<void> {
  const r = await window.kb.vaultSetDefault(vaultId)
  if ('ok' in r && r.ok === false) {
    alert(`设为默认失败：${r.error}`)
    return
  }
  await rescan()
}

async function askRemove(vaultId: string): Promise<void> {
  if (confirmingRemoval.value === vaultId) {
    confirmingRemoval.value = null
    if (confirmTimer) clearTimeout(confirmTimer)
    const r = await window.kb.vaultRemove(vaultId)
    if ('ok' in r && r.ok === false) {
      alert(`移除失败：${r.error}`)
      return
    }
    await rescan()
    return
  }
  confirmingRemoval.value = vaultId
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = window.setTimeout(() => {
    confirmingRemoval.value = null
  }, 3000)
}

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})
</script>

<template>
  <aside class="kb-side" :class="{ collapsed: store.sideCollapsed }">
    <div class="kb-side-head">
      <span v-if="!store.sideCollapsed" class="kb-side-title">知识库</span>
      <button class="btn btn-accent" title="新建笔记" @click="onNewNote">
        <AppIcon v-if="store.sideCollapsed" name="plus" :size="14" />
        <template v-else>新建笔记</template>
      </button>
      <button
        class="btn"
        title="在默认库新建文件夹"
        :disabled="!firstVaultId"
        @click="startNewFolder(firstVaultId)"
      >
        <AppIcon name="folderPlus" :size="14" />
      </button>
    </div>

    <div class="kb-side-body">
      <button
        v-for="item in NAV"
        :key="item.path"
        class="kb-nav-item"
        :class="{ active: isActive(item.path) }"
        :title="item.label"
        @click="router.push(item.path)"
      >
        <span class="ico"><AppIcon :name="item.icon" :size="16" /></span>
        <span v-if="!store.sideCollapsed">{{ item.label }}</span>
      </button>

      <div v-if="!store.sideCollapsed" class="kb-side-section">知识库目录</div>

      <div v-for="root in roots" :key="root.id" class="kb-tree">
        <div class="kb-tree-row root-row" :class="{ active: isRootActive(root.id) }">
          <span class="caret" @click.stop="collapsedRoots[root.id] = !collapsedRoots[root.id]">
            <AppIcon :name="collapsedRoots[root.id] ? 'chevronRight' : 'chevronDown'" :size="12" />
          </span>
          <span class="ico"><AppIcon name="book" :size="16" /></span>
          <span class="name" :title="root.id" @click="openRoot(root.id)">{{ root.name }}</span>
          <span v-if="root.isDefault && !store.sideCollapsed" class="badge">默认</span>
          <span class="acts">
            <button class="mini-btn" title="在根目录新建笔记" @click.stop="newNoteInRoot(root.id)">
              <AppIcon name="plus" :size="13" />
            </button>
            <button class="mini-btn" title="新建文件夹" @click.stop="startNewFolder(root.id)">
              <AppIcon name="folderPlus" :size="13" />
            </button>
            <button
              v-if="!root.isDefault"
              class="mini-btn"
              title="设为默认库"
              @click.stop="setDefault(root.id)"
            >
              <AppIcon name="star" :size="13" />
            </button>
            <button
              class="mini-btn"
              :title="confirmingRemoval === root.id ? '再次点击确认移除' : '移除（不删除磁盘文件）'"
              @click.stop="askRemove(root.id)"
            >
              <template v-if="confirmingRemoval === root.id">确认?</template>
              <AppIcon v-else name="close" :size="13" />
            </button>
          </span>
        </div>

        <div v-if="newFolder && newFolder.vaultId === root.id" class="kb-tree-row">
          <input
            :ref="setFolderInput"
            v-model="folderDraft"
            class="input"
            placeholder="文件夹名，回车确认"
            @keydown.enter="commitFolder"
            @keydown.esc="newFolder = null"
            @blur="commitFolder"
          />
        </div>

        <template v-if="!collapsedRoots[root.id]">
          <FolderNode
            v-for="node in root.dirs"
            :key="`${root.id}/${node.rel}`"
            :node="node"
            :depth="1"
            :vault-id="root.id"
          />
        </template>
      </div>

      <div v-if="!roots.length && !store.sideCollapsed" class="empty" style="padding: 12px 6px">
        尚未添加知识库目录
      </div>
    </div>

    <div class="kb-side-foot">
      <button
        class="kb-nav-item"
        :class="{ active: route.path === '/private' }"
        :title="store.privacy.unlocked ? '隐私空间（已解锁）' : '隐私空间（已锁定）'"
        @click="router.push('/private')"
      >
        <span class="ico">
          <AppIcon :name="store.privacy.unlocked ? 'unlock' : 'lock'" :size="16" />
        </span>
        <template v-if="!store.sideCollapsed">
          隐私空间{{ store.privacy.count ? `（${store.privacy.count}）` : '' }}
        </template>
      </button>
      <button
        class="kb-nav-item"
        :class="{ active: route.path === '/trash' }"
        title="回收站"
        @click="router.push('/trash')"
      >
        <span class="ico"><AppIcon name="trash" :size="16" /></span>
        <span v-if="!store.sideCollapsed">回收站</span>
      </button>
    </div>
  </aside>
</template>
