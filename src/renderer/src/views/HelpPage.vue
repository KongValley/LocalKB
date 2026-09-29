<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import { renderStaticHtml } from '../export'

/** 内置使用说明（随应用版本更新，不可被用户删除；一级标题由 PageHeader 承担） */
const HELP_MD = `## 快速上手

- 笔记就是磁盘上的普通 \`.md\` 文件，放在你添加的知识库目录里；用任何编辑器修改后应用会自动刷新
- 按 **Ctrl+P** 快速打开任意笔记；顶部菜单「文件 → 新建笔记」开始写作
- 首次使用点首页的「创建示例笔记」，一篇示例覆盖标签 / 待办 / 双链等基本用法

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| Ctrl+P / Ctrl+K | 快速打开面板（输入即过滤，↑↓ 选择，Enter 打开） |
| Ctrl+S | 立即保存（平时 800ms 自动保存） |
| Ctrl+N | 新建笔记 |
| Ctrl+D | 生成 / 打开今日笔记 |
| Ctrl+Shift+F | 跳到搜索页 |
| Ctrl+= / Ctrl+- | 增大 / 减小编辑器字号 |
| Ctrl+0 | 字号复位为 15px |
| Esc | 关闭快速打开面板 / 图片放大层 |

## 编辑器

- 顶部可在「分栏源码」与「所见即所得」间切换
- 编辑器标题栏的「大纲」「预览」按钮可收起 / 展开右侧面板，状态会被记住
- 粘贴或拖入图片会自动保存到笔记所在目录的 \`assets/\` 并插入引用
- 点击预览区的图片可放大查看，Esc 关闭

## 笔记语法

- \`#标签\`：写在正文任意位置，「标签」页自动汇总
- \`- [ ] 待办事项\`：进入「待办」页与首页待办卡，勾选即回写文件
- \`[[另一篇笔记]]\`：双链，「知识图谱」页自动连线；「笔记」页编辑器下方显示出链 / 入链

## 各页面

- **搜索**：输入即搜（无需回车），点结果自动跳到命中位置并高亮闪烁
- **每日笔记**：按日期生成一篇当天笔记，用于记录流水
- **标签 / 待办 / 知识图谱**：分别汇总标签、未完成事项、双链关系
- **AI 问答**：基于你的笔记回答（见下节）
- **回收站**：删除的笔记先进入回收站，可恢复或彻底清除
- **隐私空间**：密码加密笔记（见下节）

## AI 问答

- 先在「AI 问答」页点「设置」，填写 Base URL、API Key 与模型名（兼容 OpenAI 接口格式）
- 回答基于笔记内容检索生成，支持多轮对话、逐字流式输出，生成中可「停止」
- 气泡悬停可「复制」「重新生成」；头部「清空对话」清空会话
- 会话在切换页面 / 重启应用后保留

## 隐私空间

- 用密码加密笔记，密文以 \`.kbp\` 存于知识库目录的 \`.private/\` 下（AES-256-GCM）
- 锁定状态下隐私笔记不参与索引、搜索、图谱与 AI 上下文
- 密码只保存在内存中，忘记密码无法找回，请务必牢记

## 数据与安全

- 移除知识库目录只注销注册，**不会删除磁盘上的任何文件**
- 应用数据目录（配置等）可在「关于」页查看与更换
- 「关于」页可手动检查更新；新版本会自动提示下载与安装
`

const html = ref('')

onMounted(async () => {
  try {
    html.value = await renderStaticHtml(HELP_MD)
  } catch {
    /* 渲染失败保留纯文本兜底 */
  }
})
</script>

<template>
  <div class="kb-page">
    <PageHeader title="使用说明" sub="功能与快捷键速查" />
    <div class="card">
      <div v-if="html" class="kb-md help-doc" v-html="html"></div>
      <pre v-else class="help-raw">{{ HELP_MD }}</pre>
    </div>
  </div>
</template>

<style scoped>
.help-doc {
  padding: 16px 20px;
  max-width: 860px;
}

.help-raw {
  padding: 16px;
  margin: 0;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.7;
}
</style>
