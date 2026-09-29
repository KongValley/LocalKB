import type { AiSettings, Err } from '../preload/api'
import { buildIndex, readNote } from './vault'

/**
 * AI 问答（OpenAI 兼容接口，主进程直连、非流式）。
 * RAG：标题/文件名命中 +10、H1 行命中 +5、正文行命中 +1；每篇取其最高分，跨根合并取前 8。
 */

const MAX_NOTES = 8
const MAX_CONTEXT = 4000
const TIMEOUT_MS = 60_000
const SYSTEM_PROMPT = '你是知识库助手，只用用户笔记回答；答完末尾列出引用笔记标题。'

interface Root {
  id: string
  path: string
}

interface Picked {
  id: string
  title: string
  lines: string[]
}

function pickNotes(roots: Root[], query: string): Picked[] {
  const q = query.trim().toLowerCase()
  const scored: { picked: Picked; score: number; mtimeMs: number }[] = []

  for (const root of roots) {
    let index
    try {
      index = buildIndex(root.path, root.id)
    } catch {
      continue
    }
    for (const n of index.notes) {
      let content = ''
      try {
        content = readNote(root.path, n.relPath)
      } catch {
        continue
      }
      if (q.length < 2) {
        scored.push({
          picked: { id: n.id, title: n.title, lines: [n.snippet] },
          score: 0,
          mtimeMs: n.mtimeMs
        })
        continue
      }
      let titleScore = 0
      if (n.name.toLowerCase().includes(q)) titleScore += 10
      if (n.title.toLowerCase().includes(q)) titleScore += 10

      let bestLine = 0
      const matched: string[] = []
      for (const line of content.split('\n')) {
        const t = line.trim()
        if (!t || !t.toLowerCase().includes(q)) continue
        bestLine = Math.max(bestLine, /^#\s+/.test(line) ? 5 : 1)
        if (matched.length < 3) matched.push(t.slice(0, 200))
      }
      const score = titleScore + bestLine
      if (score > 0) {
        scored.push({
          picked: { id: n.id, title: n.title, lines: matched },
          score,
          mtimeMs: n.mtimeMs
        })
      }
    }
  }

  const sorted =
    q.length < 2
      ? scored.sort((a, b) => b.mtimeMs - a.mtimeMs)
      : scored.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs)
  return sorted.slice(0, MAX_NOTES).map((s) => s.picked)
}

function buildContext(picked: Picked[]): string {
  const parts: string[] = []
  let total = 0
  for (const p of picked) {
    const body = p.lines.filter(Boolean).join('\n')
    const chunk = `## ${p.title}\n${body}`
    if (total + chunk.length > MAX_CONTEXT) {
      const rest = MAX_CONTEXT - total
      if (rest > 0) parts.push(chunk.slice(0, rest))
      break
    }
    parts.push(chunk)
    total += chunk.length + 2
  }
  return parts.join('\n\n')
}

/** baseURL 归一化：去尾斜杠；已含 /chat/completions 或 /v1 则不拼 */
export function chatEndpoint(baseURL: string): string {
  const base = (baseURL.trim() || 'https://api.openai.com').replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(base)) return base
  if (/\/v1$/.test(base)) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

const HISTORY_TURNS = 6
const HISTORY_CLIP = 500

/** 裁剪多轮历史：最近 6 条、每条 500 字 */
export function clipHistory(history: ChatTurn[]): ChatTurn[] {
  return history
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, HISTORY_CLIP) }))
}

/**
 * 多轮流式问答：SSE 逐段 onDelta；externalAbort（用户停止）→ { ok:true, stopped:true }，
 * 已流出文本由渲染层持有。服务器不支持流式（非 event-stream）时整段兜底一次 onDelta。
 */
export async function askKbAi(
  roots: Root[],
  ai: AiSettings,
  query: string,
  history: ChatTurn[],
  onDelta: (delta: string) => void,
  externalAbort: AbortSignal
): Promise<{ ok: true; sources: string[]; stopped?: boolean } | Err> {
  if (!ai.apiKey.trim()) return { ok: false, error: '请先在设置里填写 API Key' }
  if (!ai.model.trim()) return { ok: false, error: '请先在设置里填写模型名称' }

  const picked = pickNotes(roots, query)
  const sources = picked.map((p) => p.id)
  const context = buildContext(picked)

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...clipHistory(history),
    { role: 'user', content: `笔记：\n${context}\n问题：${query}` }
  ]

  const ctrl = new AbortController()
  const onOuterAbort = (): void => ctrl.abort()
  externalAbort.addEventListener('abort', onOuterAbort)
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(chatEndpoint(ai.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey.trim()}`
      },
      body: JSON.stringify({ model: ai.model.trim(), stream: true, messages }),
      signal: ctrl.signal
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `请求失败（HTTP ${res.status}）：${text.slice(0, 300)}` }
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) {
      // 服务器不支持流式：整段兜底
      const text = await res.text()
      let answer = text
      try {
        const body = JSON.parse(text) as {
          choices?: { message?: { content?: unknown } }[]
        }
        const content = body.choices?.[0]?.message?.content
        if (typeof content === 'string' && content.trim()) answer = content
      } catch {
        /* 非 JSON 响应：按原文返回 */
      }
      onDelta(answer)
      return { ok: true, sources }
    }
    if (!res.body) return { ok: false, error: 'AI 请求失败：响应无内容流' }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let sawDone = false
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const frames = buf.split('\n\n')
      buf = frames.pop() ?? ''
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          if (payload === '[DONE]') {
            sawDone = true
            continue
          }
          try {
            const j = JSON.parse(payload) as { choices?: { delta?: { content?: unknown } }[] }
            const c = j.choices?.[0]?.delta?.content
            if (typeof c === 'string' && c) onDelta(c)
          } catch {
            /* 跳过坏帧 */
          }
        }
      }
      if (sawDone) break
    }
    return { ok: true, sources }
  } catch (e) {
    const err = e as Error
    if (err?.name === 'AbortError') {
      if (externalAbort.aborted) return { ok: true, sources: [], stopped: true }
      return { ok: false, error: '请求超时（60 秒）' }
    }
    return { ok: false, error: `AI 请求失败：${String(err?.message ?? e)}` }
  } finally {
    clearTimeout(timer)
    externalAbort.removeEventListener('abort', onOuterAbort)
  }
}
