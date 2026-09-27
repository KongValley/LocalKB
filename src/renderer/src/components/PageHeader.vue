<script setup lang="ts">
defineProps<{ title: string; sub?: string }>()
</script>

<template>
  <div class="kb-page-head">
    <h1 class="kb-page-title">{{ title }}</h1>
    <span v-if="sub" class="kb-page-sub">{{ sub }}</span>
    <span class="spacer"></span>
    <slot />
  </div>
</template>
