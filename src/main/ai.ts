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

export async function askKbAi(
  roots: Root[],
  ai: AiSettings,
  query: string
): Promise<{ ok: true; answer: string; sources: string[] } | Err> {
  if (!ai.apiKey.trim()) return { ok: false, error: '请先在设置里填写 API Key' }
  if (!ai.model.trim()) return { ok: false, error: '请先在设置里填写模型名称' }

  const picked = pickNotes(roots, query)
  const sources = picked.map((p) => p.id)
  const context = buildContext(picked)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(chatEndpoint(ai.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: ai.model.trim(),
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `笔记：\n${context}\n问题：${query}` }
        ]
      }),
      signal: controller.signal
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, error: `请求失败（HTTP ${res.status}）：${text.slice(0, 300)}` }
    }
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
    return { ok: true, answer, sources }
  } catch (e) {
    const err = e as Error
    if (err?.name === 'AbortError') return { ok: false, error: '请求超时（60 秒）' }
    return { ok: false, error: `AI 请求失败：${String(err?.message ?? e)}` }
  } finally {
    clearTimeout(timer)
  }
}
