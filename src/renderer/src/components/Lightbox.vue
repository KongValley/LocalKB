<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { store } from '../store'

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') store.lightboxSrc = null
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="store.lightboxSrc" class="kb-lightbox" @click="store.lightboxSrc = null">
    <img :src="store.lightboxSrc" alt="图片预览" />
  </div>
</template>
