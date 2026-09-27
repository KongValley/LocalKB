<script setup lang="ts">
import { useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { store } from '../store'

const router = useRouter()

function openTag(name: string): void {
  void router.push('/tags/' + encodeURIComponent(name))
}
</script>

<template>
  <div class="kb-page">
    <PageHeader title="标签" sub="点击标签查看相关笔记" />
    <div v-if="store.tags.length" class="kb-cards">
      <div
        v-for="tag in store.tags"
        :key="tag.name"
        class="card click"
        :style="{ fontSize: 13 + Math.min(tag.count, 5) + 'px' }"
        @click="openTag(tag.name)"
      >
        <div class="kb-stat">
          <div class="n">#{{ tag.name }}</div>
          <div class="l">{{ tag.count }} 篇</div>
        </div>
      </div>
    </div>
    <div v-else class="empty">还没有标签，在笔记里写 #标签 就会出现在这里</div>
  </div>
</template>
