<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import HeaderBar from './components/HeaderBar.vue'
import SideBar from './components/SideBar.vue'

const route = useRoute()
const isWelcome = computed(() => route.name === 'welcome')
</script>

<template>
  <div class="kb-shell">
    <SideBar v-if="!isWelcome" />
    <div class="kb-main">
      <HeaderBar v-if="!isWelcome" />
      <router-view />
    </div>
  </div>
</template>
