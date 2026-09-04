import { ref, onMounted, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  getThemeId,
  themeCssVars,
  applyNavChrome,
  applyTabBarChrome,
  isTabBarPage,
  onThemeChange,
  onFontSizeChange,
  type ThemeId,
} from '@/services/theme'

/**
 * 页面根节点绑定主题 CSS 变量。
 * 页面内容、系统导航栏和 TabBar 使用同一套主题色。
 */
export function useThemePage() {
  const themeId = ref<ThemeId>(getThemeId())
  const pageStyle = ref(themeCssVars(themeId.value))

  function updateStyle(id?: ThemeId) {
    themeId.value = id || getThemeId()
    pageStyle.value = themeCssVars(themeId.value)
  }

  function refresh(id?: ThemeId) {
    updateStyle(id)
    applyNavChrome(themeId.value)
    if (isTabBarPage()) applyTabBarChrome(themeId.value)
  }

  onShow(() => {
    refresh()
  })

  let off: (() => boolean) | undefined
  let offFontSize: (() => boolean) | undefined
  onMounted(() => {
    // 缓存的 Tab 页面保持 mounted，主题变更时同步刷新页面 CSS 变量。
    off = onThemeChange((id) => updateStyle(id))
    offFontSize = onFontSizeChange(() => updateStyle(themeId.value))
  })
  onUnmounted(() => {
    off?.()
    offFontSize?.()
  })

  return { themeId, pageStyle, refreshTheme: refresh }
}
