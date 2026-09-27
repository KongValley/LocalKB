import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { wireKbEvents } from '@renderer/KbEventBus'
import { wireIpc } from '@renderer/ipc'
import { rescan } from '@renderer/note'
import router from '@renderer/router'
import { refreshPrivacy, store, syncState } from '@renderer/store'

createApp(App).use(router).mount('#app')
wireIpc()
wireKbEvents()
syncState()
void bootstrap()

async function bootstrap(): Promise<void> {
  const r = await window.kb.settingsGet()
  if (r.ok && r.settings.vaults.length > 0) {
    store.vaultReady = true
    await refreshPrivacy()
    await rescan()
    if (router.currentRoute.value.name === 'welcome') await router.replace('/notes')
    return
  }
  // 托管根创建失败时才进故障恢复页
  await router.replace('/welcome')
}
