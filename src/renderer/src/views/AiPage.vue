<script lang="ts">
// 会话状态放模块级：切路由（组件卸载）不丢；跨重启经 localStorage 恢复
import { ref, watch } from 'vue'
const STORAGE_KEY = 'kb:ai-messages'
const KEEP = 40

interface ChatMsg {
  role: 'user' | 'assistant' | 'error'
  text: string
  /** assistant 成功气泡的 Markdown 渲染结果；空则回退纯文本 */
  html?: string
  sources?: string[]
  /** 流式接收中：纯文本展示 + 打字点 */
  streaming?: boolean
}

const messages = ref<ChatMsg[]>([])

function persist(): void {
  if (messages.value.length === 0) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  const slim = messages.value
    .filter((m) => !m.streaming)
    .slice(-KEEP)
    .map(({ role, text, html, sources }) => ({ role, text, html, sources }))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch {
    /* 存储满则放弃 */
  }
}

function restore(): void {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(raw)) {
      messages.value = raw.filter(
        (m): m is ChatMsg => !!m && typeof m.text === 'string' && typeof m.role === 'string'
      )
    }
  } catch {
    /* 坏数据静默丢弃 */
  }
}
restore()
watch(messages, persist, { deep: true })

// 流式增量订阅（模块级一次性；仅发送期间挂回调）
let chunkBound = false
let onDelta: ((delta: string) => void) | null = null
function initChunk(): void {
  if (chunkBound) return
  chunkBound = true
  window.kb.onAiChunk((delta) => onDelta?.(delta))
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { renderStaticHtml } from '../export'
import { openNote } from '../note'
import { fileNameOf, store } from '../store'

const router = useRouter()
const input = ref('')
const loading = ref(false)
const showSettings = ref(false)
const savedTip = ref(false)
const scrollEl = ref<HTMLDivElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const copiedIdx = ref(-1)
const confirmingClear = ref(false)
const form = reactive({ baseURL: '', apiKey: '', model: '' })

const SUGGESTIONS = ['这篇笔记讲了什么', '帮我总结未完成的待办', '标签都有哪些用法'] as const

const needKey = computed(() => form.apiKey.trim() === '')

let clearTimer: number | null = null
let copiedTimer: number | null = null

/** sources 是全局笔记 id（`${vaultId}/${relPath}`） */
function sourceTitle(id: string): string {
  return store.notes.find((n) => n.id === id)?.title ?? fileNameOf(id)
}

async function scrollToBottom(): Promise<void> {
  await nextTick()
  const el = scrollEl.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 仅当用户接近底部才自动跟随，避免流式中拽走上翻视线 */
function scrollToBottomIfNear(): void {
  const el = scrollEl.value
  if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 80) el.scrollTop = el.scrollHeight
}

function autoGrow(): void {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

/** 多轮历史：取最近的 user/assistant（排除流式中与错误），最近 6 条、每条 500 字 */
function historyFor(): { role: 'user' | 'assistant'; content: string }[] {
  return messages.value
    .filter((m) => !m.streaming && (m.role === 'user' || m.role === 'assistant') && m.text)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }))
    .slice(-6)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 500) }))
}

async function send(): Promise<void> {
  const q = input.value.trim()
  if (!q || loading.value) return
  input.value = ''
  autoGrow()
  await doSend(q)
}

function useSuggestion(s: string): void {
  input.value = s
  void send()
}

async function doSend(q: string): Promise<void> {
  if (loading.value) return
  initChunk()
  const history = historyFor()
  messages.value.push({ role: 'user', text: q })
  messages.value.push({ role: 'assistant', text: '', streaming: true })
  const cur = messages.value[messages.value.length - 1]
  loading.value = true
  onDelta = (delta) => {
    cur.text += delta
    scrollToBottomIfNear()
  }
  await scrollToBottom()
  try {
    const r = await window.kb.aiAsk(q, history)
    cur.streaming = false
    if (!r.ok) {
      if (!cur.text) messages.value.splice(messages.value.indexOf(cur), 1)
      messages.value.push({ role: 'error', text: r.error })
    } else {
      cur.sources = r.sources
      try {
        cur.html = await renderStaticHtml(cur.text)
      } catch {
        /* 渲染失败回退纯文本 */
      }
    }
  } catch (e) {
    cur.streaming = false
    if (!cur.text) messages.value.splice(messages.value.indexOf(cur), 1)
    messages.value.push({ role: 'error', text: e instanceof Error ? e.message : String(e) })
  } finally {
    onDelta = null
    loading.value = false
    await scrollToBottom()
  }
}

async function onStop(): Promise<void> {
  await window.kb.aiStop()
}

/** 重新生成：截掉最后一条 user 之后的消息并重发 */
async function regenerate(): Promise<void> {
  if (loading.value) return
  const lastUser = [...messages.value].reverse().find((m) => m.role === 'user')
  if (!lastUser) return
  const q = lastUser.text
  messages.value = messages.value.slice(0, messages.value.indexOf(lastUser))
  await doSend(q)
}

async function copyText(i: number, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copiedIdx.value = i
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copiedIdx.value = -1
  }, 1500)
}

/** 清空对话：两段确认（首次变文案，3 秒回退） */
function onClearClick(): void {
  if (confirmingClear.value) {
    confirmingClear.value = false
    if (clearTimer) clearTimeout(clearTimer)
    messages.value = []
    localStorage.removeItem('kb:ai-messages')
    return
  }
  confirmingClear.value = true
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = window.setTimeout(() => {
    confirmingClear.value = false
  }, 3000)
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
  initChunk()
  const r = await window.kb.settingsGet()
  if (r.ok) {
    form.baseURL = r.settings.ai.baseURL
    form.apiKey = r.settings.ai.apiKey
    form.model = r.settings.ai.model
  }
})

onBeforeUnmount(() => {
  if (clearTimer) clearTimeout(clearTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="kb-page kb-chat-page">
    <div class="kb-page-head">
      <h1 class="kb-page-title">AI 问答</h1>
      <span v-if="savedTip" class="kb-page-sub">已保存</span>
      <span class="spacer"></span>
      <button class="btn" :class="{ confirming: confirmingClear }" @click="onClearClick">
        {{ confirmingClear ? '确认清空?' : '清空对话' }}
      </button>
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
        <template v-if="messages.length">
          <div
            v-for="(m, i) in messages"
            :key="i"
            class="bubble"
            :class="[m.role, m.html && m.role === 'assistant' ? 'kb-md' : '']"
          >
            <span v-if="m.streaming && !m.text" class="kb-typing"><i /><i /><i /></span>
            <template v-else>
              <div v-if="m.html && m.role === 'assistant'" v-html="m.html"></div>
              <template v-else>
                {{ m.text }}
                <span v-if="m.streaming" class="kb-typing"><i /><i /><i /></span>
              </template>
            </template>

            <details
              v-if="m.role === 'assistant' && !m.streaming && m.sources && m.sources.length"
              class="srcs-fold"
            >
              <summary>引用 {{ m.sources.length }} 篇</summary>
              <div class="srcs" style="display: flex; flex-wrap: wrap; gap: 6px">
                <button v-for="id in m.sources" :key="id" class="chip" @click="openSource(id)">
                  {{ sourceTitle(id) }}
                </button>
              </div>
            </details>

            <div v-if="m.role === 'assistant' && !m.streaming" class="acts">
              <button class="mini" @click="copyText(i, m.text)">
                {{ copiedIdx === i ? '已复制' : '复制' }}
              </button>
              <button v-if="i === messages.length - 1" class="mini" :disabled="loading" @click="regenerate">
                ↻ 重新生成
              </button>
            </div>
          </div>
        </template>

        <div v-else-if="!needKey" class="kb-suggest">
          <div class="t">向知识库提问，回答只取自你的笔记。试试：</div>
          <div class="chips">
            <button v-for="s in SUGGESTIONS" :key="s" class="chip" @click="useSuggestion(s)">
              {{ s }}
            </button>
          </div>
        </div>
        <div v-else class="empty">向知识库提问，回答只取自你的笔记</div>
      </div>

      <div class="kb-chat-input">
        <textarea
          ref="inputEl"
          v-model="input"
          class="input"
          rows="1"
          placeholder="问点什么…（Enter 发送，Shift+Enter 换行）"
          @keydown.enter.exact.prevent="send"
        ></textarea>
        <button class="btn btn-accent send-btn" @click="loading ? onStop() : send()">
          {{ loading ? '停止' : '发送' }}
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

.kb-chat-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding-top: 10px;
}

.kb-chat-input .input {
  flex: 1;
  resize: none;
  min-height: 34px;
  max-height: 120px;
  line-height: 1.5;
  font: inherit;
}

.send-btn {
  flex: none;
  min-width: 64px;
  height: 34px;
}

.confirming {
  color: #d64545;
  border-color: #d64545;
}

.kb-suggest .t {
  color: var(--fg-dim);
  font-size: 12.5px;
  margin-bottom: 8px;
}

.kb-suggest .chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
