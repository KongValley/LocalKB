<script setup lang="ts">
import { computed, ref } from 'vue'
import EditorPane from '../components/EditorPane.vue'
import NoteListCard from '../components/NoteListCard.vue'
import { openNote } from '../note'
import { store } from '../store'

const q = ref('')

/** 当前筛选：{知识库根, 根内目录}（由路由写入 store.activeFolder，null = 全部） */
const f = computed(() => store.activeFolder)

/** 标题搜索为本地过滤（不发 IPC）；选中目录时含其子目录（限同一知识库根） */
const list = computed(() => {
  const kw = q.value.trim().toLowerCase()
  const folder = f.value
  return [...store.notes]
    .filter((n) => {
      if (!folder) return true
      if (n.vaultId !== folder.vaultId) return false
      if (folder.dir === '') return true
      return n.dir === folder.dir || n.dir.startsWith(`${folder.dir}/`)
    })
    .filter(
      (n) =>
        !kw ||
        n.title.toLowerCase().includes(kw) ||
        n.name.toLowerCase().includes(kw) ||
        n.snippet.toLowerCase().includes(kw)
    )
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
})

async function onOpen(id: string): Promise<void> {
  if (store.activeId !== id) await openNote(id)
}
</script>

<template>
  <div class="kb-cols">
    <div class="kb-list">
      <div class="kb-list-search">
        <input v-model="q" class="input" placeholder="搜索笔记标题…" />
      </div>
      <div class="kb-list-scroll">
        <NoteListCard v-for="n in list" :key="n.id" :note="n" @open="onOpen" />
        <div v-if="!list.length" class="empty">
          {{ q ? '没有匹配的笔记' : f ? '这里还没有笔记' : '还没有笔记，点左上角新建' }}
        </div>
      </div>
    </div>
    <EditorPane />
  </div>
</template>
