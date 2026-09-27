<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { addVault } from '../ipc'
import { rescan } from '../note'
import { defaultVault } from '../store'

const router = useRouter()
const busy = ref(false)
const error = ref('')

async function retryManaged(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const r = await window.kb.vaultRetryManaged()
    if ('ok' in r && r.ok === false) {
      error.value = r.error
      return
    }
    await rescan()
    await router.replace('/notes')
  } finally {
    busy.value = false
  }
}

async function choose(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const ok = await addVault()
    if (!ok && !defaultVault()) error.value = '尚未选择知识库目录'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="kb-welcome">
    <div class="card">
      <h1>无法使用默认知识库目录</h1>
      <p>
        应用无法在「文档/知识库」创建目录（可能没有写入权限）。<br />
        可以重试，或手动选择一个本地文件夹作为知识库目录。
      </p>
      <button class="btn btn-accent" :disabled="busy" @click="retryManaged">重试默认目录</button>
      <button class="btn" :disabled="busy" style="margin-left: 8px" @click="choose">
        手动选择目录
      </button>
      <div v-if="error" class="empty" style="padding: 12px 0 0; color: #d64545">{{ error }}</div>
    </div>
  </div>
</template>
