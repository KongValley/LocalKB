/** 搜索结果跳转后：在编辑器预览/正文里定位首条命中行并闪烁高亮 */

function normalize(text: string): string {
  return text.trim().slice(0, 40)
}

export async function locateText(text: string): Promise<boolean> {
  const needle = normalize(text)
  if (!needle) return false
  // 打开笔记 → vditor 渲染完成有延迟：轮询「存在命中」直到超时。
  // 注意 sv 模式下 DOM 里同时存在休眠的空 .vditor-wysiwyg 与真实 .vditor-preview，必须遍历全部候选。
  const contains = (el: Element): boolean => (el.textContent ?? '').trim().includes(needle)
  for (let waited = 0; waited < 5000; waited += 150) {
    const resets = document.querySelectorAll(
      '.vditor-preview .vditor-reset, .vditor-wysiwyg .vditor-reset'
    )
    for (const reset of resets) {
      // 先匹配直接子元素（标题/段落等整块），失败再遍历全部后代（列表/代码内拆分行）
      const hit =
        Array.from(reset.children).find(contains) ??
        Array.from(reset.querySelectorAll('*')).find(contains)
      if (hit) {
        hit.scrollIntoView({ behavior: 'smooth', block: 'center' })
        hit.classList.add('kb-locate-flash')
        setTimeout(() => hit.classList.remove('kb-locate-flash'), 2000)
        return true
      }
    }
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 150)
    await promise
  }
  return false
}
