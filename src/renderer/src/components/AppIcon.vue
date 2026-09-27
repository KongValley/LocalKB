<script setup lang="ts">
import { computed } from 'vue'
import { ICONS } from '../icons'

const props = withDefaults(defineProps<{ name: string; size?: number; title?: string }>(), {
  size: 16
})

const def = computed(() => ICONS[props.name])
const style = computed(() =>
  def.value?.accent ? { '--icon-accent': def.value.accent } : undefined
)
</script>

<template>
  <svg
    v-if="def"
    class="app-icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    :style="style"
    :aria-label="props.title"
    :role="props.title ? 'img' : undefined"
    :aria-hidden="props.title ? undefined : 'true'"
  >
    <path
      v-for="(p, i) in def.paths"
      :key="i"
      :d="p.d"
      :class="p.tone === 'accent' ? 'ac' : 'fg'"
    />
  </svg>
</template>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: -0.16em;
  flex: none;
}

.app-icon .fg {
  fill: currentColor;
}

.app-icon .ac {
  fill: var(--icon-accent, var(--accent));
}
</style>
