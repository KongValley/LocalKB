import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 打包白名单只含 out/** 与 package.json，故 electron-updater 需内联进主进程产物（其依赖均为纯 JS）
  main: { plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [vue()]
  }
})
