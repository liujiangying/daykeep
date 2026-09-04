/** 全局主题：深绿色 / 纸感手账 / 极简黑白（默认） */

export type ThemeId = 'teal' | 'paper' | 'mono'

export interface ThemeTokens {
  id: ThemeId
  name: string
  desc: string
  bg: string
  bgSoft: string
  ink: string
  muted: string
  brand: string
  brandSoft: string
  line: string
  accent: string
  surface: string
  navBg: string
  navFront: '#000000' | '#ffffff'
  tabColor: string
  tabSelected: string
  tabBg: string
  tabBorder: 'black' | 'white'
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  teal: {
    id: 'teal',
    name: '深绿色',
    desc: '安静自然',
    bg: '#f2f4f3',
    bgSoft: '#eef2f1',
    ink: '#1c2423',
    muted: '#6b736f',
    brand: '#2f6f6a',
    brandSoft: '#e4f0ee',
    line: '#e2e6e4',
    accent: '#2f6f6a',
    surface: '#fffeff',
    navBg: '#f2f4f3',
    navFront: '#000000',
    tabColor: '#8a857c',
    tabSelected: '#2f6f6a',
    tabBg: '#fffefb',
    tabBorder: 'black',
  },
  paper: {
    id: 'paper',
    name: '纸感手账',
    desc: '墨色纸纹',
    bg: '#f3efe6',
    bgSoft: '#ebe4d6',
    ink: '#2a241c',
    muted: '#7a7164',
    brand: '#8b4518',
    brandSoft: '#efe6d8',
    line: '#ddd4c4',
    accent: '#a63d2f',
    surface: '#faf6ee',
    navBg: '#f3efe6',
    navFront: '#000000',
    tabColor: '#9a9080',
    tabSelected: '#8b4518',
    tabBg: '#faf6ee',
    tabBorder: 'black',
  },
  mono: {
    id: 'mono',
    name: '极简黑白',
    desc: '炭黑细线',
    bg: '#f7f7f5',
    bgSoft: '#eeeeec',
    ink: '#141414',
    muted: '#6e6e6e',
    brand: '#141414',
    brandSoft: '#ebebeb',
    line: '#d8d8d6',
    accent: '#141414',
    surface: '#ffffff',
    navBg: '#f7f7f5',
    navFront: '#000000',
    tabColor: '#8a8a8a',
    tabSelected: '#141414',
    tabBg: '#ffffff',
    tabBorder: 'black',
  },
}

const THEME_KEY = 'dk_theme'
const FONT_SIZE_KEY = 'dk_font_size'

export type FontSizeId = 'small' | 'medium' | 'standard' | 'large'

export const FONT_SIZE_OPTIONS: { id: FontSizeId; label: string; desc: string }[] = [
  { id: 'small', label: '小', desc: '信息更紧凑' },
  { id: 'medium', label: '中', desc: '舒适阅读' },
  { id: 'standard', label: '标准', desc: '推荐使用' },
  { id: 'large', label: '大', desc: '阅读更轻松' },
]

type ThemeListener = (id: ThemeId) => void
const listeners = new Set<ThemeListener>()
type FontSizeListener = (id: FontSizeId) => void
const fontSizeListeners = new Set<FontSizeListener>()

export function onThemeChange(fn: ThemeListener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(id: ThemeId) {
  listeners.forEach((fn) => {
    try {
      fn(id)
    } catch {
      /* ignore */
    }
  })
}

function notifyFontSize(id: FontSizeId) {
  fontSizeListeners.forEach((fn) => {
    try {
      fn(id)
    } catch {
      /* ignore */
    }
  })
}

export function onFontSizeChange(fn: FontSizeListener) {
  fontSizeListeners.add(fn)
  return () => fontSizeListeners.delete(fn)
}

export function getFontSize(): FontSizeId {
  try {
    const value = uni.getStorageSync(FONT_SIZE_KEY) as string
    // 兼容此前已存的 default，迁移为当前的标准字号。
    if (value === 'default') return 'standard'
    if (value === 'small' || value === 'medium' || value === 'standard' || value === 'large') return value
  } catch {
    /* ignore */
  }
  return 'standard'
}

export function setFontSize(id: FontSizeId) {
  uni.setStorageSync(FONT_SIZE_KEY, id)
  notifyFontSize(id)
}

function fontSizeCssVars(id = getFontSize()): Record<string, string> {
  if (id === 'small') {
    return {
      '--dk-fs-display': '40rpx', '--dk-fs-title': '30rpx', '--dk-fs-body': '28rpx',
      '--dk-fs-label': '26rpx', '--dk-fs-meta': '23rpx', '--dk-fs-caption': '21rpx',
      '--dk-fs-num': '38rpx', '--dk-fs-hero': '60rpx',
    }
  }
  if (id === 'medium') {
    return {
      '--dk-fs-display': '43rpx', '--dk-fs-title': '32rpx', '--dk-fs-body': '29rpx',
      '--dk-fs-label': '27rpx', '--dk-fs-meta': '24rpx', '--dk-fs-caption': '22rpx',
      '--dk-fs-num': '41rpx', '--dk-fs-hero': '64rpx',
    }
  }
  if (id === 'large') {
    return {
      '--dk-fs-display': '50rpx',
      '--dk-fs-title': '40rpx',
      '--dk-fs-body': '34rpx',
      '--dk-fs-label': '31rpx',
      '--dk-fs-meta': '28rpx',
      '--dk-fs-caption': '26rpx',
      '--dk-fs-num': '48rpx',
      '--dk-fs-hero': '74rpx',
    }
  }
  return {
    '--dk-fs-display': '46rpx',
    '--dk-fs-title': '36rpx',
    '--dk-fs-body': '32rpx',
    '--dk-fs-label': '30rpx',
    '--dk-fs-meta': '26rpx',
    '--dk-fs-caption': '24rpx',
    '--dk-fs-num': '44rpx',
    '--dk-fs-hero': '68rpx',
  }
}

export function getThemeId(): ThemeId {
  try {
    const v = uni.getStorageSync(THEME_KEY) as string
    // 已下线主题统一迁移到新的默认主题。
    if (v === 'blue' || v === 'sunny') {
      uni.setStorageSync(THEME_KEY, 'mono')
      return 'mono'
    }
    if (v === 'teal' || v === 'paper' || v === 'mono') return v
  } catch {
    /* ignore */
  }
  return 'mono'
}

export function getTokens(id?: ThemeId): ThemeTokens {
  return THEMES[id || getThemeId()]
}

/** 供页面根节点 :style 绑定 */
export function themeCssVars(id?: ThemeId): Record<string, string> {
  const t = getTokens(id)
  // 功能状态通常跟随主题；极简黑白保留青绿色点缀，避免所有状态都退化成脏灰。
  const feature = t.id === 'mono' ? THEMES.teal : t
  return {
    '--dk-bg': t.bg,
    '--dk-bg-soft': t.bgSoft,
    '--dk-ink': t.ink,
    '--dk-muted': t.muted,
    '--dk-brand': t.brand,
    '--dk-brand-soft': t.brandSoft,
    '--dk-feature-brand': feature.brand,
    '--dk-feature-brand-soft': feature.brandSoft,
    '--dk-line': t.line,
    '--dk-accent': t.accent,
    '--dk-surface': t.surface,
    ...fontSizeCssVars(),
    backgroundColor: t.bg,
    color: t.ink,
  }
}

// text 必须与 pages.json 的 tabBar.list 一致：setTabBarItem 会覆盖原有文案，
// 传空串/空格会把文字抹掉。
const TAB_ITEMS = [
  { index: 0, icon: '/static/tab/timeline.png', base: 'timeline', text: '时光' },
  { index: 1, icon: '/static/tab/notes.png', base: 'notes', text: '随手记' },
  { index: 2, icon: '/static/tab/remind.png', base: 'remind', text: '约定' },
  { index: 3, icon: '/static/tab/mine.png', base: 'mine', text: '我的' },
] as const

// 路径必须带前导斜杠：H5 下不带斜杠会按当前页面目录解析成
// /pages/xxx/static/tab/*.png，命中 SPA fallback 返回 HTML，图标空白。
function activeIconPath(base: string, id: ThemeId) {
  if (id === 'paper') return `/static/tab/${base}-active-paper.png`
  if (id === 'mono') return `/static/tab/${base}-active-mono.png`
  return `/static/tab/${base}-active.png`
}

const TAB_PAGE_PATHS = new Set([
  'pages/timeline/index',
  'pages/notes/index',
  'pages/reminders/index',
  'pages/mine/index',
])
let appliedTabTheme: ThemeId | null = null
let tabThemeApplyGeneration = 0

function currentRoute(): string {
  try {
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1] as { route?: string } | undefined
    return (cur?.route || '').replace(/^\//, '')
  } catch {
    return ''
  }
}

export function isTabBarPage(): boolean {
  return TAB_PAGE_PATHS.has(currentRoute())
}

function swallowUniPromise(ret: unknown) {
  if (ret && typeof (ret as { then?: unknown }).then === 'function') {
    ;(ret as Promise<unknown>).catch(() => {
      /* uni 会把 fail 再包装成 Promise，避免 unhandled rejection 刷屏 */
    })
  }
}

/** 仅导航栏颜色（任意页可用） */
export function applyNavChrome(id?: ThemeId) {
  const t = getTokens(id || getThemeId())
  try {
    swallowUniPromise(
      uni.setNavigationBarColor({
        frontColor: t.navFront,
        backgroundColor: t.navBg,
        animation: { duration: 200, timingFunc: 'easeIn' },
        fail: () => {},
      } as any),
    )
  } catch {
    /* ignore */
  }
}

/** 仅 TabBar（必须在 tab 页；非 tab 页调用会报 not TabBar page） */
export function applyTabBarChrome(id?: ThemeId, force = false) {
  if (!isTabBarPage()) return
  const themeId = id || getThemeId()
  // setTabBarStyle/setTabBarItem 都会跨逻辑层调用原生渲染层。
  // 只有原生层全部更新成功后才记录缓存；失败时保留重试机会，避免活动图标残留旧主题。
  if (!force && appliedTabTheme === themeId) return
  const generation = ++tabThemeApplyGeneration
  let pending = TAB_ITEMS.length + 1
  let failed = false
  const settle = (ok: boolean) => {
    failed ||= !ok
    pending -= 1
    if (pending === 0 && generation === tabThemeApplyGeneration) {
      appliedTabTheme = failed ? null : themeId
    }
  }
  const t = getTokens(themeId)
  try {
    swallowUniPromise(
      uni.setTabBarStyle({
        color: t.tabColor,
        selectedColor: t.tabSelected,
        backgroundColor: t.tabBg,
        borderStyle: t.tabBorder,
        success: () => settle(true),
        fail: () => settle(false),
      } as any),
    )
  } catch {
    settle(false)
  }
  for (const item of TAB_ITEMS) {
    try {
      swallowUniPromise(
        uni.setTabBarItem({
          index: item.index,
          text: item.text,
          iconPath: item.icon,
          selectedIconPath: activeIconPath(item.base, themeId),
          success: () => settle(true),
          fail: () => settle(false),
        } as any),
      )
    } catch {
      settle(false)
    }
  }
}

export function applyChrome(id?: ThemeId) {
  applyNavChrome(id)
  applyTabBarChrome(id)
}

export function setTheme(id: ThemeId) {
  uni.setStorageSync(THEME_KEY, id)
  applyNavChrome(id)
  applyTabBarChrome(id, true)
  notify(id)
}

export function initTheme() {
  applyChrome(getThemeId())
}

/** 清除业务缓存，保留主题与字号偏好 */
export function clearAppCache(opts: { keepTheme?: boolean } = {}) {
  const theme = opts.keepTheme !== false ? getThemeId() : null
  const fontSize = getFontSize()
  try {
    uni.removeStorageSync('dk_access_token')
    uni.removeStorageSync('dk_refresh_token')
  } catch {
    /* ignore */
  }
  if (theme) uni.setStorageSync(THEME_KEY, theme)
  uni.setStorageSync(FONT_SIZE_KEY, fontSize)
}
