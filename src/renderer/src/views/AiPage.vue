<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { openNote } from '../note'
import { fileNameOf, store } from '../store'

interface ChatMsg {
  role: 'user' | 'assistant' | 'error'
  text: string
  sources?: string[]
}

const router = useRouter()
const messages = ref<ChatMsg[]>([])
const input = ref('')
const loading = ref(false)
const showSettings = ref(false)
const savedTip = ref(false)
const scrollEl = ref<HTMLDivElement | null>(null)
const form = reactive({ baseURL: '', apiKey: '', model: '' })

const needKey = computed(() => form.apiKey.trim() === '')

/** sources 是全局笔记 id（`${vaultId}/${relPath}`） */
function sourceTitle(id: string): string {
  return store.notes.find((n) => n.id === id)?.title ?? fileNameOf(id)
}

async function scrollToBottom(): Promise<void> {
  await nextTick()
  const el = scrollEl.value
  if (el) el.scrollTop = el.scrollHeight
}

async function send(): Promise<void> {
  const q = input.value.trim()
  if (!q || loading.value) return
  messages.value.push({ role: 'user', text: q })
  input.value = ''
  loading.value = true
  await scrollToBottom()
  try {
    const r = await window.kb.aiAsk(q)
    if (r.ok) messages.value.push({ role: 'assistant', text: r.answer, sources: r.sources })
    else messages.value.push({ role: 'error', text: r.error })
  } catch (e) {
    messages.value.push({ role: 'error', text: e instanceof Error ? e.message : String(e) })
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

async function openSource(id: string): Promise<void> {
  await openNote(id)
  await router.push('/notes')
}

async function saveSettings(): Promise<void> {
  const r = await window.kb.settingsSet({
    ai: { baseURL: form.baseURL, apiKey: form.apiKey, model: form.model }
  })
  if (r.ok) {
    savedTip.value = true
    window.setTimeout(() => {
      savedTip.value = false
    }, 3000)
  } else {
    window.alert(r.error)
  }
}

onMounted(async () => {
  const r = await window.kb.settingsGet()
  if (r.ok) {
    form.baseURL = r.settings.ai.baseURL
    form.apiKey = r.settings.ai.apiKey
    form.model = r.settings.ai.model
  }
})
</script>

<template>
  <div class="kb-page kb-chat-page">
    <div class="kb-page-head">
      <h1 class="kb-page-title">AI 问答</h1>
      <span v-if="savedTip" class="kb-page-sub">已保存</span>
      <span class="spacer"></span>
      <button class="btn" @click="showSettings = !showSettings">设置</button>
    </div>

    <div v-if="showSettings" class="card" style="margin-bottom: 10px">
      <div style="display: flex; flex-direction: column; gap: 8px; max-width: 520px">
        <label class="kb-page-sub">
          Base URL
          <input v-model="form.baseURL" class="input" placeholder="https://api.deepseek.com" />
        </label>
        <label class="kb-page-sub">
          API Key
          <input v-model="form.apiKey" class="input" type="password" placeholder="sk-…" />
        </label>
        <label class="kb-page-sub">
          模型
          <input v-model="form.model" class="input" placeholder="deepseek-chat" />
        </label>
        <div>
          <button class="btn btn-accent" @click="saveSettings">保存</button>
        </div>
      </div>
    </div>

    <div v-if="needKey" class="banner">请先设置 API Key</div>

    <div class="kb-chat">
      <div ref="scrollEl" class="kb-chat-scroll">
        <div v-for="(m, i) in messages" :key="i" class="bubble" :class="m.role">
          {{ m.text }}
          <div
            v-if="m.sources && m.sources.length"
            class="srcs"
            style="display: flex; flex-wrap: wrap; gap: 6px"
          >
            <button v-for="id in m.sources" :key="id" class="chip" @click="openSource(id)">
              {{ sourceTitle(id) }}
            </button>
          </div>
        </div>
        <div v-if="!messages.length" class="empty">向知识库提问，回答只取自你的笔记</div>
      </div>
      <div style="display: flex; gap: 8px; padding-top: 10px">
        <input v-model="input" class="input" placeholder="问点什么…" @keydown.enter="send" />
        <button class="btn btn-accent" style="flex: none" :disabled="loading" @click="send">
          {{ loading ? '思考中…' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-chat-page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
