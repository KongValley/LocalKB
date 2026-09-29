<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { addVault } from '../ipc'
import { rescan } from '../note'
import { store } from '../store'

const APP_NAME = '知识库'
const appVersion = __APP_VERSION__

const router = useRouter()
const dataDir = ref<string | null>(null)
const effectiveDir = ref('')
const dataMsg = ref('')
const pendingRestart = ref(false)
const confirmingRemove = ref<string | null>(null)
const renaming = ref<string | null>(null)
const nameDraft = ref('')
let confirmTimer: number | null = null

async function loadDataDir(): Promise<void> {
  const r = await window.kb.dataDirGet()
  if ('ok' in r && r.ok) {
    dataDir.value = r.dataDir
    effectiveDir.value = r.effectiveDir
  }
}

onMounted(() => {
  void loadDataDir()
})

function goHelp(): void {
  void router.push('/help')
}

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})

/* ── 知识库目录 ── */

async function onAdd(): Promise<void> {
  await addVault()
}

async function reveal(vaultId: string): Promise<void> {
  const r = await window.kb.vaultReveal(vaultId)
  if ('ok' in r && r.ok === false) alert(`打开目录失败：${r.error}`)
}

async function setDefault(vaultId: string): Promise<void> {
  const r = await window.kb.vaultSetDefault(vaultId)
  if ('ok' in r && r.ok === false) {
    alert(`设为默认失败：${r.error}`)
    return
  }
  await rescan()
}

function startRename(vaultId: string, name: string): void {
  renaming.value = vaultId
  nameDraft.value = name
}

async function commitRename(): Promise<void> {
  const vaultId = renaming.value
  if (!vaultId) return
  renaming.value = null
  const name = nameDraft.value.trim()
  if (!name) return
  const r = await window.kb.vaultRename(vaultId, name)
  if ('ok' in r && r.ok === false) {
    alert(`重命名失败：${r.error}`)
    return
  }
  await rescan()
}

async function askRemove(vaultId: string): Promise<void> {
  if (confirmingRemove.value === vaultId) {
    confirmingRemove.value = null
    if (confirmTimer) clearTimeout(confirmTimer)
    const r = await window.kb.vaultRemove(vaultId)
    if ('ok' in r && r.ok === false) {
      alert(`移除失败：${r.error}`)
      return
    }
    await rescan()
    return
  }
  confirmingRemove.value = vaultId
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = window.setTimeout(() => {
    confirmingRemove.value = null
  }, 3000)
}

/* ── 应用数据目录 ── */

async function pickDataDir(): Promise<void> {
  dataMsg.value = ''
  const picked = await window.kb.dataDirPick()
  if ('ok' in picked && picked.ok === false) {
    dataMsg.value = picked.error
    return
  }
  if (!('dir' in picked)) return
  const r = await window.kb.dataDirSet(picked.dir)
  if ('ok' in r && r.ok === false) {
    dataMsg.value = r.error
    return
  }
  dataMsg.value = `已设置为 ${picked.dir}，重启后生效`
  pendingRestart.value = true
  await loadDataDir()
}

async function resetDataDir(): Promise<void> {
  dataMsg.value = ''
  const r = await window.kb.dataDirSet(null)
  if ('ok' in r && r.ok === false) {
    dataMsg.value = r.error
    return
  }
  dataMsg.value = '已恢复默认数据目录，重启后生效'
  pendingRestart.value = true
  await loadDataDir()
}

function restart(): void {
  window.kb.appRestart()
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="关于" />

    <div class="card about-card">
      <img class="about-logo" :src="'logo.svg'" :alt="APP_NAME" />
      <div class="about-name">{{ APP_NAME }}</div>
      <div class="kb-page-sub">版本 {{ appVersion }}</div>
      <p class="about-desc">基于 Electron + Vue 3 + Vditor 的本地知识库</p>
    </div>

    <div class="card about-block">
      <div class="about-row">
        <span class="about-label">知识库目录</span>
        <span class="kb-page-sub">共 {{ store.vaults.length }} 个</span>
        <span class="spacer"></span>
        <button class="btn btn-accent" @click="onAdd">添加知识库目录</button>
      </div>

      <div v-for="v in store.vaults" :key="v.id" class="vault-row">
        <span class="vault-name">
          <template v-if="renaming === v.id">
            <input
              v-model="nameDraft"
              class="input"
              style="max-width: 180px"
              @keydown.enter="commitRename"
              @keydown.esc="renaming = null"
              @blur="commitRename"
            />
          </template>
          <template v-else>
            <span class="about-label">{{ v.name }}</span>
            <span v-if="v.id === store.defaultVaultId" class="badge">默认</span>
          </template>
        </span>
        <span class="kb-page-sub vault-path" :title="v.path">{{ v.path }}</span>
        <span class="spacer"></span>
        <button class="btn" @click="startRename(v.id, v.name)">重命名</button>
        <button v-if="v.id !== store.defaultVaultId" class="btn" @click="setDefault(v.id)">
          设为默认
        </button>
        <button class="btn" @click="reveal(v.id)">打开目录</button>
        <button class="btn" :class="{ 'btn-danger': confirmingRemove === v.id }" @click="askRemove(v.id)">
          {{ confirmingRemove === v.id ? '确认移除?' : '移除' }}
        </button>
      </div>
      <div v-if="!store.vaults.length" class="empty" style="padding: 12px 0">
        尚未添加知识库目录
      </div>
      <div class="kb-page-sub" style="margin-top: 8px">
        移除只注销目录，不会删除磁盘上的任何文件。
      </div>
    </div>

    <div class="card about-block">
      <div class="about-row">
        <span class="about-label">应用数据目录</span>
        <span class="kb-page-sub" :title="effectiveDir">{{ effectiveDir }}</span>
      </div>
      <div class="about-row">
        <span class="kb-page-sub">
          自定义位置：{{ dataDir ?? '未设置（使用系统默认位置）' }}；自定义后重启生效，仅迁移配置。
        </span>
        <span class="spacer"></span>
        <button class="btn" @click="pickDataDir">更换…</button>
        <button v-if="dataDir" class="btn" @click="resetDataDir">恢复默认</button>
        <button v-if="pendingRestart" class="btn btn-accent" @click="restart">立即重启</button>
      </div>
      <div v-if="dataMsg" class="kb-page-sub">{{ dataMsg }}</div>
    </div>

    <div class="card about-block">
      <div class="about-row">
        <span class="about-label">索引</span>
        <span class="kb-page-sub">已扫描笔记 {{ store.notes.length }} 篇</span>
        <span class="spacer"></span>
        <button class="btn" @click="rescan">重新扫描</button>
      </div>
    </div>

    <div class="card about-block">
      <div class="about-row">
        <span class="about-label">使用说明</span>
        <span class="kb-page-sub">功能与快捷键速查</span>
        <span class="spacer"></span>
        <button class="btn" @click="goHelp">打开使用说明</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.about-logo {
  width: 48px;
  height: 48px;
  margin-bottom: 4px;
}

.about-name {
  font-size: 17px;
  font-weight: 600;
}

.about-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--fg-dim);
}

.about-block {
  margin-bottom: 12px;
}

.about-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.about-label {
  font-size: 13px;
  font-weight: 600;
}

.vault-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}

.vault-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  max-width: 40%;
}

.vault-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
