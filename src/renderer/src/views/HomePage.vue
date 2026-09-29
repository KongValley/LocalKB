<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { NoteMeta } from '../../../preload/api'
import AppIcon from '../components/AppIcon.vue'
import NoteListCard from '../components/NoteListCard.vue'
import PageHeader from '../components/PageHeader.vue'
import { createNote, daily, openNote, rescan } from '../note'
import { defaultVault, store } from '../store'

const router = useRouter()

const noteCount = computed<number>(() => store.notes.length)
const tagCount = computed<number>(() => store.tags.length)
const openTodoCount = computed<number>(() =>
  store.notes.reduce((sum, n) => sum + n.todos.filter((t) => !t.done).length, 0)
)

const recent = computed<NoteMeta[]>(() =>
  [...store.notes].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 8)
)

/** 未完成待办（按笔记 mtime 倒序，前 5） */
const undone = computed(() =>
  store.notes
    .flatMap((n) => n.todos.filter((t) => !t.done).map((t) => ({ ...t, note: n })))
    .sort((a, b) => b.note.mtimeMs - a.note.mtimeMs)
    .slice(0, 5)
)

const WELCOME_MD = `# 欢迎使用知识库

这是一篇示例笔记，可以直接修改或删除。你的知识库就是磁盘上的普通 .md 文件，随时可用任何编辑器打开。

## 快速上手

- 按 \`Ctrl+P\` 快速打开任意笔记
- 写 \`#标签\` 给笔记分类，「标签」页自动汇总
- 写 \`- [ ] 待办事项\`，首页和「待办」页会帮你追踪
- 用 \`[[另一篇笔记]]\` 建立双链，「知识图谱」自动连线
- 「隐私空间」里的笔记用密码加密落盘
- 顶部菜单可切换分栏预览 / 所见即所得，\`Ctrl+=\` \`Ctrl+-\` 调字号
`

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

/** 复用全局快捷键通道打开快速面板（不引第二套状态） */
function onQuickOpen(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }))
}

async function onTodoToggle(item: { line: number; note: NoteMeta }): Promise<void> {
  const r = await window.kb.todoToggle(item.note.id, item.line, true)
  if (!r.ok) {
    alert(`更新待办失败：${r.error}`)
    return
  }
  await rescan()
}

/** 空库引导：默认根创建示例笔记并打开 */
async function onCreateWelcome(): Promise<void> {
  const vault = defaultVault()
  if (!vault) {
    alert('请先添加知识库目录')
    return
  }
  const r = await window.kb.noteCreate(vault.id, '', '欢迎使用知识库')
  if (!r.ok) {
    alert(`创建失败：${r.error}`)
    return
  }
  const w = await window.kb.noteWrite(r.id, WELCOME_MD)
  if (!w.ok) {
    alert(`写入失败：${w.error}`)
    return
  }
  await onOpen(r.id)
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="首页" sub="知识库概览" />

    <div v-if="store.notes.length === 0" class="card" style="margin-bottom: 12px">
      <div class="kb-empty-guide">
        <div>
          <div class="t">知识库还是空的</div>
          <div class="s">创建一篇示例笔记，快速了解标签、待办、双链和 AI 问答的用法。</div>
        </div>
        <button class="btn btn-accent" @click="onCreateWelcome">创建示例笔记</button>
      </div>
    </div>

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

    <div class="kb-page-sub">未完成待办</div>
    <div v-if="undone.length" class="card">
      <div v-for="t in undone" :key="`${t.note.id}:${t.line}`" class="todo-row">
        <input type="checkbox" :checked="false" @change="onTodoToggle(t)" />
        <span class="txt" @click="onOpen(t.note.id)">{{ t.text }}</span>
        <button class="chip" @click="onOpen(t.note.id)">{{ t.note.title }}</button>
      </div>
    </div>
    <div v-else class="empty">没有未完成待办 🎉</div>

    <div class="kb-page-sub">快捷操作</div>
    <div class="kb-cards">
      <div class="card kb-stat click" @click="onNewNote">
        <div class="n"><AppIcon name="plus" :size="26" /></div>
        <div class="l">新建笔记</div>
      </div>
      <div class="card kb-stat click" @click="onDaily">
        <div class="n"><AppIcon name="calendar" :size="26" /></div>
        <div class="l">每日笔记</div>
      </div>
      <div class="card kb-stat click" @click="router.push('/search')">
        <div class="n"><AppIcon name="search" :size="26" /></div>
        <div class="l">搜索</div>
      </div>
      <div class="card kb-stat click" @click="onQuickOpen">
        <div class="n"><AppIcon name="search" :size="26" /></div>
        <div class="l">快速打开</div>
        <div class="kb-count">Ctrl+P</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-empty-guide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.kb-empty-guide .t {
  font-weight: 600;
}

.kb-empty-guide .s {
  color: var(--fg-dim);
  font-size: 12px;
  margin-top: 2px;
}
</style>
