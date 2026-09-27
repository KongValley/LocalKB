<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { GraphData } from '../../../preload/api'
import { openNote } from '../note'
import { splitNodeId, store, vaultNameById } from '../store'

interface EChartsInstance {
  setOption(o: unknown): void
  dispose(): void
  resize(): void
  on(ev: string, cb: (p: { data?: { id?: string } }) => void): void
}
interface EChartsLib {
  init(el: HTMLElement): EChartsInstance
}
declare global {
  interface Window {
    echarts?: EChartsLib
  }
}

const ECHARTS_SCRIPT_ID = 'kb-echarts'
const ECHARTS_REL = 'vditor-assets/dist/js/echarts/echarts.min.js'
const ECHARTS_WAIT_MS = 5000

const router = useRouter()
const graph = ref<GraphData | null>(null)
const showIsolated = ref(true)
const colorByVault = ref(false)
const errMsg = ref<string | null>(null)
const elRef = ref<HTMLDivElement | null>(null)

let chart: EChartsInstance | null = null
let chartEl: HTMLElement | null = null
let echartsPromise: Promise<EChartsLib> | null = null

interface RenderNode {
  id: string
  name: string
  symbolSize: number
  category: number
}
interface RenderLink {
  source: string
  target: string
}
interface RenderView {
  nodes: RenderNode[]
  links: RenderLink[]
  categories: { name: string }[]
}

const hasData = computed(() => (graph.value?.nodes.length ?? 0) > 0)

const view = computed<RenderView>(() => {
  const raw = graph.value
  if (!raw) return { nodes: [], links: [], categories: [{ name: '全部' }] }
  const kept = showIsolated.value ? raw.nodes : raw.nodes.filter((n) => n.size > 0)
  const ids = new Set(kept.map((n) => n.id))
  const links: RenderLink[] = raw.links.filter((l) => ids.has(l.source) && ids.has(l.target))
  const size = (n: number): number => 8 + Math.min(24, 3 * n)
  if (!colorByVault.value) {
    return {
      nodes: kept.map((n) => ({ id: n.id, name: n.name, symbolSize: size(n.size), category: 0 })),
      links,
      categories: [{ name: '全部' }]
    }
  }
  const vaultIds = [...new Set(kept.map((n) => splitNodeId(n.id).vaultId))]
  return {
    nodes: kept.map((n) => ({
      id: n.id,
      name: n.name,
      symbolSize: size(n.size),
      category: Math.max(0, vaultIds.indexOf(splitNodeId(n.id).vaultId))
    })),
    links,
    categories: vaultIds.map((id) => ({ name: vaultNameById(id) }))
  }
})

async function load(): Promise<void> {
  const r = await window.kb.graph()
  if ('ok' in r && r.ok) graph.value = { nodes: r.nodes, links: r.links }
}

function waitForEcharts(): Promise<EChartsLib> {
  return new Promise<EChartsLib>((resolve, reject) => {
    const started = Date.now()
    const tick = (): void => {
      const lib = window.echarts
      if (lib) {
        resolve(lib)
        return
      }
      if (Date.now() - started > ECHARTS_WAIT_MS) {
        reject(new Error('未找到 echarts 资源'))
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

function ensureEcharts(): Promise<EChartsLib> {
  if (echartsPromise) return echartsPromise
  echartsPromise = new Promise<EChartsLib>((resolve, reject) => {
    const existing = document.getElementById(ECHARTS_SCRIPT_ID)
    if (existing) {
      void waitForEcharts().then(resolve, reject)
      return
    }
    const s = document.createElement('script')
    s.id = ECHARTS_SCRIPT_ID
    s.src = new URL(ECHARTS_REL, location.href).toString()
    s.onload = () => {
      const lib = window.echarts
      if (lib) resolve(lib)
      else reject(new Error('未找到 echarts 资源'))
    }
    s.onerror = () => reject(new Error('未找到 echarts 资源'))
    document.head.appendChild(s)
  })
  return echartsPromise
}

function renderChart(): void {
  const el = elRef.value
  const lib = window.echarts
  if (!el || !lib) return
  if (chart && chartEl !== el) {
    chart.dispose()
    chart = null
  }
  if (!chart) {
    chart = lib.init(el)
    chartEl = el
    chart.on('click', (p) => {
      const id = p.data?.id
      if (id)
        void openNote(id).then((ok) => {
          if (ok) void router.push('/notes')
        })
    })
  }
  const v = view.value
  chart.setOption({
    tooltip: {},
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        label: { show: true, fontSize: 11 },
        force: { repulsion: 300, edgeLength: 100 },
        data: v.nodes,
        links: v.links,
        categories: v.categories
      }
    ]
  })
}

async function draw(): Promise<void> {
  await nextTick()
  if (errMsg.value) return
  if (!elRef.value) {
    if (chart) {
      chart.dispose()
      chart = null
      chartEl = null
    }
    return
  }
  try {
    await ensureEcharts()
  } catch {
    echartsPromise = null
    errMsg.value = '未找到 echarts 资源'
    return
  }
  renderChart()
}

async function refresh(): Promise<void> {
  errMsg.value = null
  await load()
  await draw()
}

function onResize(): void {
  chart?.resize()
}

onMounted(async () => {
  window.addEventListener('resize', onResize)
  await load()
  await draw()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
  chart = null
  chartEl = null
})

watch(
  () => store.notes.length,
  () => {
    void load().then(draw)
  }
)

watch(view, () => {
  void draw()
})
</script>

<template>
  <div class="kb-col" style="flex: 1; display: flex; flex-direction: column; min-height: 0">
    <div class="kb-graph-toolbar">
      <button class="btn" @click="refresh">刷新</button>
      <label><input v-model="showIsolated" type="checkbox" /> 含孤立节点</label>
      <label><input v-model="colorByVault" type="checkbox" /> 按知识库着色</label>
    </div>
    <div v-if="errMsg" class="empty">{{ errMsg }}</div>
    <div v-else-if="hasData" id="kb-graph" ref="elRef"></div>
    <div v-else class="empty">还没有笔记</div>
  </div>
</template>
