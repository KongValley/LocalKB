<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import NoteListCard from '../components/NoteListCard.vue'
import PageHeader from '../components/PageHeader.vue'
import { openNote, rescan } from '../note'
import { refreshPrivacy, store } from '../store'

const router = useRouter()

const pw1 = ref('')
const pw2 = ref('')
const unlockPw = ref('')
const oldPw = ref('')
const newPw = ref('')
const showChange = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')

const privateNotes = computed(() => store.notes.filter((n) => n.private))

onMounted(() => {
  void refreshPrivacy()
})

function resetMessages(): void {
  error.value = ''
  notice.value = ''
}

async function setup(): Promise<void> {
  resetMessages()
  if (pw1.value.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  if (pw1.value !== pw2.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  busy.value = true
  try {
    const r = await window.kb.privacySetup(pw1.value)
    if (!r.ok) {
      error.value = r.error
      return
    }
    pw1.value = ''
    pw2.value = ''
    notice.value = '隐私空间已启用，当前为解锁状态'
    await refreshPrivacy()
    await rescan()
  } finally {
    busy.value = false
  }
}

async function unlock(): Promise<void> {
  resetMessages()
  busy.value = true
  try {
    const r = await window.kb.privacyUnlock(unlockPw.value)
    if (!r.ok) {
      error.value = r.error
      return
    }
    unlockPw.value = ''
    notice.value = `已解锁（${r.count} 篇隐私笔记）`
    await refreshPrivacy()
    await rescan()
  } finally {
    busy.value = false
  }
}

async function lock(): Promise<void> {
  resetMessages()
  const r = await window.kb.privacyLock()
  if (!r.ok) {
    error.value = r.error
    return
  }
  notice.value = '已锁定，隐私笔记已从列表隐藏'
  await refreshPrivacy()
  await rescan()
}

async function changePassword(): Promise<void> {
  resetMessages()
  if (newPw.value.length < 6) {
    error.value = '新密码至少 6 位'
    return
  }
  busy.value = true
  try {
    const r = await window.kb.privacyChangePassword(oldPw.value, newPw.value)
    if (!r.ok) {
      error.value = r.error
      return
    }
    oldPw.value = ''
    newPw.value = ''
    showChange.value = false
    notice.value = `密码已更新，已用新密码重新加密 ${r.count} 篇隐私笔记`
  } finally {
    busy.value = false
  }
}

async function open(id: string): Promise<void> {
  if (await openNote(id)) await router.push('/notes')
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="隐私空间" sub="选中的笔记将以 AES-256-GCM 加密存储于库内 .private 目录">
      <template v-if="store.privacy.unlocked">
        <button class="btn" @click="showChange = !showChange">修改密码</button>
        <button class="btn" @click="lock()">
          <AppIcon name="lock" :size="13" />
          立即锁定
        </button>
      </template>
    </PageHeader>

    <div v-if="notice" class="card privacy-note">{{ notice }}</div>
    <div v-if="error" class="card privacy-note privacy-error">{{ error }}</div>

    <!-- 未设置密码 -->
    <div v-if="!store.privacy.configured" class="card privacy-panel">
      <div class="privacy-title">
        <AppIcon name="lock" :size="16" />
        启用隐私空间
      </div>
      <p class="kb-page-sub">
        设置一个隐私空间密码：之后把任意笔记「移入隐私空间」，其文件即被加密存储（磁盘上只剩密文，文件名也不再可见）。
        隐私空间的笔记在锁定时不出现在列表 / 搜索 / 图谱里。
      </p>
      <div class="privacy-form">
        <input v-model="pw1" class="input" type="password" placeholder="设置密码（至少 6 位）" />
        <input v-model="pw2" class="input" type="password" placeholder="再输一次" @keydown.enter="setup" />
        <button class="btn btn-accent" :disabled="busy" @click="setup">启用隐私空间</button>
      </div>
      <p class="kb-page-sub privacy-warn">
        ⚠️ 密码不会被保存在任何地方：忘记密码将无法解密这些笔记（应用没有后门可恢复）。
      </p>
    </div>

    <!-- 已设置但未解锁 -->
    <div v-else-if="!store.privacy.unlocked" class="card privacy-panel">
      <div class="privacy-title">
        <AppIcon name="lock" :size="16" />
        隐私空间已锁定
      </div>
      <p class="kb-page-sub">
        输入密码解锁后可查看与编辑隐私笔记（{{ store.privacy.count }} 篇密文文件在库内）。
      </p>
      <div class="privacy-form">
        <input
          v-model="unlockPw"
          class="input"
          type="password"
          placeholder="隐私空间密码"
          @keydown.enter="unlock"
        />
        <button class="btn btn-accent" :disabled="busy" @click="unlock">解锁</button>
      </div>
    </div>

    <!-- 已解锁 -->
    <template v-else>
      <div v-if="showChange" class="card privacy-panel">
        <div class="privacy-title">修改密码</div>
        <p class="kb-page-sub">修改后会用新密码重新加密全部隐私笔记（原密码需正确）。</p>
        <div class="privacy-form">
          <input v-model="oldPw" class="input" type="password" placeholder="原密码" />
          <input v-model="newPw" class="input" type="password" placeholder="新密码（至少 6 位）" />
          <button class="btn btn-accent" :disabled="busy" @click="changePassword">确认修改</button>
        </div>
      </div>

      <div class="card privacy-panel">
        <div class="privacy-title">
          <AppIcon name="unlock" :size="16" />
          已解锁 · 隐私笔记 {{ privateNotes.length }} 篇
        </div>
        <p class="kb-page-sub">
          在「笔记」里选中任意笔记，点编辑栏的「移入隐私空间」即可加密；在下方或编辑栏点「移出隐私空间」可还原为普通笔记。
        </p>
      </div>

      <div v-if="privateNotes.length" class="kb-cards">
        <NoteListCard v-for="n in privateNotes" :key="n.id" :note="n" @open="open" />
      </div>
      <div v-else class="empty">隐私空间还是空的：去「笔记」里把需要保密的笔记移进来</div>
    </template>
  </div>
</template>

<style scoped>
.privacy-panel {
  margin-bottom: 12px;
}

.privacy-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.privacy-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.privacy-form .input {
  max-width: 240px;
}

.privacy-note {
  margin-bottom: 12px;
  font-size: 12.5px;
}

.privacy-error {
  border-color: #d64545;
  color: #d64545;
}

.privacy-warn {
  margin-top: 10px;
  color: #c26a00;
}
</style>
