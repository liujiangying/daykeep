<template>
  <view class="page" :style="pageStyle">
    <view class="nav" :style="navStyle">
      <view class="nav-inner" :style="navInnerStyle">
        <text v-if="activeSection !== 'root'" class="nav-back" @tap="backToMine">‹</text>
        <text class="brand">{{ minePageTitle }}</text>
      </view>
    </view>
    <view class="nav-spacer" :style="{ height: navTotalHeight + 'px' }" />

    <view class="content">
      <template v-if="activeSection === 'root'">
        <view class="section profile-section">
          <view class="row user-row" :class="{ tap: loggedIn }" @tap="goEditProfile">
            <view class="user-left">
              <view class="avatar-wrap">
                <image v-if="loggedIn && user?.avatarUrl" class="avatar-img" :src="user.avatarUrl" mode="aspectFill" />
                <view v-else class="avatar-ph" :style="{ backgroundColor: tokens.brandSoft }">
                  <text class="avatar-letter" :style="{ color: tokens.brand }">{{ avatarLetter }}</text>
                </view>
                <view v-if="currentTodayMood" class="avatar-mood">
                  <MoodIcon :mood="currentTodayMood" size="badge" />
                </view>
              </view>
              <view class="user-main">
                <text class="name">{{ displayName }}</text>
                <text v-if="profileIncomplete" class="profile-tip">选择头像并确认昵称</text>
                <text v-else-if="loggedIn" class="profile-meta">已陪伴记录 {{ joinedDays }} 天</text>
              </view>
            </view>
            <text v-if="loggedIn" class="arrow">›</text>
          </view>
          <view v-if="!loggedIn" class="actions">
            <button class="btn" :style="primaryBtnStyle" @tap="goLogin">微信登录</button>
          </view>
          <view v-if="loggedIn" class="mood-week">
            <view class="mood-week-head">
              <text class="mood-week-title">本周心情</text><text class="mood-week-summary">{{ moodWeekSummary }}</text>
            </view>
            <view class="mood-week-days">
              <view
                v-for="day in moodWeek"
                :key="day.date"
                class="mood-day"
                :class="{ editable: isTodayMoodDay(day) }"
                @tap="quickEditMood(day)"
              >
                <view class="mood-day-icon">
                  <MoodIcon :mood="day.mood" size="week" :empty="isTodayMoodDay(day) ? '＋' : '·'" />
                </view>
                <text class="mood-day-label">{{ moodDayLabel(day.date) }}</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="featuredInsight" class="section care-note" @tap="showInsight">
          <text class="care-note-spark">✦</text>
          <view class="care-note-copy">
            <text class="care-note-kicker">{{ insightKicker }}</text>
            <text class="care-note-title">{{ insightTitle }}</text>
            <text class="care-note-desc">{{ insightDesc }}</text>
          </view>
          <view class="care-note-action"><text>去看看</text><text>›</text></view>
        </view>

        <view class="root-section-head spaces-head" :class="{ tap: spacesCanFold }" @tap="toggleSpaces">
          <text class="root-section-label">我的空间</text>
          <view class="section-head-right">
            <text>{{ spacesSummary }}</text>
            <text v-if="spacesCanFold" class="fold-arrow" :class="{ open: spacesExpanded }">›</text>
          </view>
        </view>
        <view v-if="spaces.length" class="section mine-menu spaces-menu">
          <view v-for="space in visibleSpaces" :key="space.id" class="row tap" @tap="goSpaceDetail(space.id)">
            <view class="space-cover-thumb"><image v-if="space.coverUrl" :src="space.coverUrl" mode="aspectFill" /></view>
            <view class="row-copy"><view class="space-row-title"><text class="row-title">{{ space.name }}</text><text v-if="space.isOfficial" class="official-space-badge">官方公开</text></view><text class="row-desc" :class="{ 'space-dissolved-desc': space.dissolvedAt }">{{ spaceRowDesc(space) }}</text></view>
            <text class="arrow">›</text>
          </view>
        </view>
        <button v-if="officialExperience && !hasJoinedOfficial" class="join-official-cta" :loading="joiningOfficial" :disabled="joiningOfficial" @tap="joinOfficial">
          <text class="join-official-mark">✦</text>
          <view class="create-space-copy"><text>加入官方体验圈</text><text>公开浏览，随时可以退出</text></view>
          <text class="create-space-arrow">›</text>
        </button>
        <button class="create-space-cta" @tap="goCreateSpace">
          <text class="create-space-plus">＋</text>
          <view class="create-space-copy"><text>创建新时光圈</text><text>邀请家人、朋友一起记录</text></view>
          <text class="create-space-arrow">›</text>
        </button>

        <text class="root-section-label">应用设置</text>
        <view class="section mine-menu">
          <view class="row tap" @tap="openMineSection('data')">
            <view class="row-copy"><text class="row-title">隐私设置</text></view>
            <text class="arrow">›</text>
          </view>
          <view v-if="holidaySettingsVisible" class="row tap" @tap="goHolidays">
            <view class="row-copy"><text class="row-title">好日子设置</text></view>
            <text class="arrow">›</text>
          </view>
          <view class="row tap" @tap="togglePrefs">
            <view class="row-copy"><text class="row-title">个性化设置</text></view>
            <text class="fold-arrow" :class="{ open: prefsExpanded }">›</text>
          </view>
          <view v-if="prefsExpanded" class="prefs-inline">
            <view class="row preference-row tap" @tap="togglePanel('theme')"><text>主题</text><view class="row-right"><text class="muted-r">{{ currentThemeName }}</text><text class="fold-arrow" :class="{ open: openPanel === 'theme' }">›</text></view></view>
            <view v-if="openPanel === 'theme'" class="panel">
              <view v-for="t in themeList" :key="t.id" class="panel-row tap" @tap.stop="pickTheme(t.id)"><text class="panel-name">{{ t.name }}</text><text class="check" :style="{ color: tokens.brand }">{{ themeId === t.id ? '✓' : '' }}</text></view>
            </view>
            <view class="row preference-row tap" @tap="togglePanel('font')"><text>字体大小</text><view class="row-right"><text class="muted-r">{{ currentFontSizeLabel }}</text><text class="fold-arrow" :class="{ open: openPanel === 'font' }">›</text></view></view>
            <view v-if="openPanel === 'font'" class="panel">
              <view v-for="opt in fontSizeOptions" :key="opt.id" class="panel-row tap" @tap.stop="pickFontSize(opt.id)"><text class="panel-name">{{ opt.label }}</text><text class="check" :style="{ color: tokens.brand }">{{ fontSize === opt.id ? '✓' : '' }}</text></view>
            </view>
          </view>
        </view>
        <text class="root-section-label support-label">帮助与支持</text>
        <view class="section support-menu">
          <view class="row tap" @tap="goGuide"><text>使用指南</text><text class="arrow">›</text></view>
          <view class="row tap" @tap="goFeedback"><text>帮助与反馈</text><text class="arrow">›</text></view>
          <view class="row tap" @tap="showAbout"><text>关于我们</text><text class="arrow">›</text></view>
          <!-- #ifdef MP-WEIXIN -->
          <button class="row share-row" open-type="share"><text>分享小程序</text><text class="arrow">›</text></button>
          <!-- #endif -->
        </view>
        <view class="mine-footer">
          <text class="mine-quote">有些生活不必公开，只想留给我们</text>
          <view v-if="loggedIn" class="logout-wrap"><button class="btn ghost" :style="ghostBtnStyle" @tap="doLogout">退出登录</button></view>
        </view>
      </template>

      <view v-else-if="activeSection === 'data'" class="section sub-section">
        <view v-if="loggedIn" class="data-group">
          <text class="sec-title">账号信息</text>
          <view class="data-card">
            <!-- #ifdef MP-WEIXIN -->
            <button v-if="loggedIn && !boundPhone" class="row bind-phone-row" open-type="getPhoneNumber" :disabled="bindingPhone" @getphonenumber="onGetPhoneNumber">
              <text class="row-title">手机号</text>
              <text class="phone-action">{{ bindingPhone ? '绑定中…' : '去绑定 ›' }}</text>
            </button>
            <!-- #endif -->
            <view v-if="loggedIn && boundPhone" class="row phone-bound-row">
              <text class="row-title">手机号</text>
              <text class="phone-status">已绑定</text>
            </view>
          </view>
        </view>

        <view class="data-group">
          <text class="sec-title">谁可以看到</text>
          <view class="data-card privacy-card">
            <view class="privacy-row">
              <text class="privacy-title">个人记录</text>
              <text class="privacy-value">仅自己可见</text>
            </view>
            <view class="privacy-row">
              <text class="privacy-title">时光圈记录</text>
              <text class="privacy-value">仅圈内成员可见</text>
            </view>
            <view class="privacy-row">
              <text class="privacy-title">时间胶囊</text>
              <text class="privacy-value">解锁前保密</text>
            </view>
          </view>
        </view>

        <view class="data-group">
          <text class="sec-title">记录与存储</text>
          <view class="data-card">
            <view class="row tap export-row" @tap="exportData"><view class="row-copy"><text class="row-title">导出我的记录</text><text class="row-desc">导出为 CSV，不包含共同记录和图片</text></view><text class="arrow">›</text></view>
            <view class="row tap" @tap="clearCache"><view class="row-copy"><text class="row-title">清除本地缓存</text><text class="row-desc">不会删除云端记录</text></view><text class="arrow">›</text></view>
          </view>
        </view>
      </view>

    </view>

    <view v-if="moodPickerOpen" class="mood-picker-mask" @tap="closeMoodPicker">
      <view class="mood-picker-sheet" @tap.stop>
        <view class="mood-picker-head">
          <view><text class="mood-picker-title">今日心情</text><text class="mood-picker-sub">选择后，时光圈成员可以看到你今天的状态</text></view>
          <text class="mood-picker-close" @tap="closeMoodPicker">×</text>
        </view>
        <view class="mood-picker-options">
          <view
            v-for="item in moodOptions"
            :key="item.value"
            class="mood-picker-option"
            :class="{ on: currentTodayMood === item.value }"
            @tap="chooseQuickMood(item.value)"
          >
            <MoodIcon class="mood-picker-icon" :mood="item.value" size="picker" />
            <text>{{ item.label }}</text>
          </view>
          <view
            class="mood-picker-option"
            :class="{ on: currentTodayMood.startsWith('custom:') || customMoodEditing }"
            @tap="openCustomMood"
          >
            <MoodIcon class="mood-picker-icon" :mood="currentTodayMood.startsWith('custom:') ? currentTodayMood : ''" size="picker" empty="＋" />
            <text>自定义</text>
          </view>
        </view>
        <view v-if="customMoodEditing" class="custom-mood-wrap">
          <input
            v-model="customMoodInput"
            class="custom-mood-input"
            maxlength="24"
            placeholder="输入 1 个 Emoji"
            confirm-type="done"
            :focus="customMoodEditing"
            @confirm="saveCustomMood"
          />
          <button class="custom-mood-save" @tap="saveCustomMood">使用</button>
        </view>
        <text v-if="customMoodEditing" class="custom-mood-tip">仅支持一个 Emoji 表情，不支持文字或普通符号</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onBackPress, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import {
  isLoggedIn,
  fetchMe,
  logout,
  displayNickname,
  bindPhoneWithWechatCode,
  DEFAULT_NICKNAME,
  type DayKeepUser,
} from '@/services/auth'
import { useThemePage } from '@/composables/useThemePage'
import {
  THEMES,
  setTheme,
  clearAppCache,
  getTokens,
  FONT_SIZE_OPTIONS,
  getFontSize,
  setFontSize,
  type ThemeId,
  type FontSizeId,
} from '@/services/theme'
import { listEntries, type Entry } from '@/services/entries'
import { getMyMoodWeek, getOfficialExperienceSpace, joinOfficialExperienceSpace, listSpaces, updateMyMood, type MoodDay, type Space, type SpaceMood } from '@/services/spaces'
import { displayDiaryBody } from '@/services/systemEntries'
import { fetchUserPrefs, saveUserPrefs } from '@/services/prefs'
import { listInsights, type Insight } from '@/services/insights'
import { spaceDissolutionLines } from '@/utils/spaceLifecycle'
import { getPreferredSpaceId, setPreferredSpaceId } from '@/services/spacePreference'
import { normalizeMoodDate, normalizeMoodWeek, shanghaiDateKey } from '@/utils/mood'
import { encodeCustomMood, MOOD_OPTIONS, moodIconForValue, moodLabelForValue } from '@/shared/mood'
import MoodIcon from '@/components/MoodIcon.vue'
import { trackProductEvent } from '@/services/analytics'

const { themeId, pageStyle, refreshTheme } = useThemePage()

const loggedIn = ref(false)
const user = ref<DayKeepUser | null>(null)
const bindingPhone = ref(false)
const spaces = ref<Space[]>([])
const officialExperience = ref<Space | null>(null)
const joiningOfficial = ref(false)
const hasJoinedOfficial = computed(() => spaces.value.some((space) => space.isOfficial))
const holidaySettingsVisible = ref(!getPreferredSpaceId())
const spacesExpanded = ref(false)
const spacesCanFold = computed(() => spaces.value.length > 3)
const visibleSpaces = computed(() => spacesExpanded.value ? spaces.value : spaces.value.slice(0, 3))
const spacesSummary = computed(() => {
  if (!spaces.value.length) return ''
  if (spacesCanFold.value && !spacesExpanded.value) return `显示 3 / ${spaces.value.length} 个`
  return `${spaces.value.length} 个`
})

function spaceRowDesc(space: Space) {
  if (space.dissolvedAt) {
    const text = spaceDissolutionLines(space)
    return `${text.title} · ${text.desc.replace(/^—\s*/, '')}`
  }
  if (space.isOfficial) return `${space.memberCount || 1} 位体验者 · ${space.recordCount} 条公开记录`
  return `共同 ${space.recordCount} 条回忆 · ${space.commitmentCount} 个约定`
}
const prefsExpanded = ref(false)
const moodWeek = ref<MoodDay[]>([])
const moodSaving = ref(false)
const moodPickerOpen = ref(false)
const customMoodEditing = ref(false)
const customMoodInput = ref('')
const moodOptions = MOOD_OPTIONS
const currentTodayMood = computed<SpaceMood>(() => {
  return moodWeek.value.find((day) => normalizeMoodDate(day.date) === shanghaiDateKey())?.mood || ''
})
const customMoodPreview = computed(() => {
  return currentTodayMood.value.startsWith('custom:') ? moodIconForValue(currentTodayMood.value) : ''
})
const moodWeekSummary = computed(() => {
  const recorded = moodWeek.value.filter((day) => day.mood)
  if (!recorded.length) return '从今天开始记录'
  const counts = new Map<SpaceMood, number>()
  recorded.forEach((day) => counts.set(day.mood, (counts.get(day.mood) || 0) + 1))
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  return `${recorded.length} 天有记录 · ${moodLabelForValue(top) || '有变化'}`
})

function isTodayMoodDay(day: MoodDay) {
  return normalizeMoodDate(day.date) === shanghaiDateKey()
}

function quickEditMood(day: MoodDay) {
  if (!isTodayMoodDay(day) || moodSaving.value) return
  customMoodEditing.value = false
  customMoodInput.value = customMoodPreview.value
  moodPickerOpen.value = true
}

function closeMoodPicker() {
  moodPickerOpen.value = false
  customMoodEditing.value = false
  customMoodInput.value = ''
}

function chooseQuickMood(mood: SpaceMood) {
  closeMoodPicker()
  void saveQuickMood(mood)
}

function openCustomMood() {
  customMoodInput.value = customMoodPreview.value
  customMoodEditing.value = true
}

function saveCustomMood() {
  const mood = encodeCustomMood(customMoodInput.value)
  if (!mood) {
    uni.showToast({ title: '请输入一个 Emoji 表情', icon: 'none' })
    return
  }
  chooseQuickMood(mood)
}

async function saveQuickMood(mood: SpaceMood) {
  if (moodSaving.value) return
  const today = shanghaiDateKey()
  const previous = moodWeek.value.map((day) => ({ ...day }))
  const current = moodWeek.value.find((day) => normalizeMoodDate(day.date) === today)
  if (current?.mood === mood) return
  moodSaving.value = true
  moodWeek.value = normalizeMoodWeek([
    ...moodWeek.value.filter((day) => normalizeMoodDate(day.date) !== today),
    { date: today, mood },
  ])
  try {
    const saved = await updateMyMood(mood)
    const savedDate = normalizeMoodDate(saved.date || '') || today
    moodWeek.value = normalizeMoodWeek([
      ...moodWeek.value.filter((day) => {
        const date = normalizeMoodDate(day.date)
        return date !== today && date !== savedDate
      }),
      { date: savedDate, mood: saved.mood || mood },
    ])
    uni.showToast({ title: '今天的心情已记录', icon: 'none' })
  } catch (error: any) {
    moodWeek.value = previous
    uni.showToast({ title: error?.message || '心情保存失败，请重试', icon: 'none' })
  } finally {
    moodSaving.value = false
  }
}

function moodDayLabel(date: string) {
  const key = normalizeMoodDate(date)
  if (key === shanghaiDateKey()) return '今天'
  const [year, month, day] = key.split('-').map(Number)
  if (!year || !month || !day) return ''
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

const fontSize = ref<FontSizeId>(getFontSize())
const themeList = Object.values(THEMES)
const fontSizeOptions = FONT_SIZE_OPTIONS
/** 展开中的偏好面板：默认全部收起 */
const openPanel = ref<'theme' | 'font' | null>(null)
type MineSection = 'root' | 'data'
const activeSection = ref<MineSection>('root')
const minePageTitle = computed(() => ({
  root: '我的',
  data: '数据与隐私',
})[activeSection.value])

function openMineSection(section: Exclude<MineSection, 'root'>) {
  openPanel.value = null
  activeSection.value = section
}

function backToMine() {
  openPanel.value = null
  activeSection.value = 'root'
}

function togglePrefs() {
  prefsExpanded.value = !prefsExpanded.value
  if (!prefsExpanded.value) openPanel.value = null
}

function toggleSpaces() {
  if (!spacesCanFold.value) return
  spacesExpanded.value = !spacesExpanded.value
}

const tokens = computed(() => getTokens(themeId.value))

const statusBarHeight = ref(20)
const navBarHeight = ref(44)
const navPadRight = ref(96)
const navContentOffset = ref(8)
const navTotalHeight = computed(() => statusBarHeight.value + navBarHeight.value)
const navStyle = computed(() => ({
  paddingTop: `${statusBarHeight.value}px`,
  backgroundColor: tokens.value.bg,
}))
const navInnerStyle = computed(() => ({
  height: `${navBarHeight.value}px`,
  paddingRight: `${navPadRight.value}px`,
  paddingTop: `${navContentOffset.value}px`,
  boxSizing: 'border-box' as const,
}))

const currentThemeName = computed(() => THEMES[themeId.value]?.name || '极简黑白')
const joinedDays = computed(() => {
  const createdAt = user.value?.createdAt
  if (!createdAt) return 1
  const start = new Date(createdAt).getTime()
  if (!Number.isFinite(start)) return 1
  return Math.max(1, Math.floor((Date.now() - start) / 86400000) + 1)
})
const currentFontSizeLabel = computed(
  () => FONT_SIZE_OPTIONS.find((x) => x.id === fontSize.value)?.label || '标准',
)

const displayName = computed(() => {
  if (!loggedIn.value) return '未登录'
  const name = displayNickname(user.value)
  return name === DEFAULT_NICKNAME ? '完善个人资料' : name
})

const profileIncomplete = computed(() => {
  if (!loggedIn.value) return false
  const name = user.value?.nickname?.trim()
  return !user.value?.avatarUrl || !name || name === DEFAULT_NICKNAME
})

const avatarLetter = computed(() => profileIncomplete.value ? '+' : (displayName.value[0] || '微'))
const boundPhone = computed(() => String(user.value?.phone || '').trim())

const primaryBtnStyle = computed(() => {
  const t = tokens.value
  return { backgroundColor: t.brand, color: '#ffffff' }
})

const ghostBtnStyle = computed(() => {
  const t = tokens.value
  return { backgroundColor: t.brandSoft, color: t.brand }
})

function goEditProfile() {
  if (!loggedIn.value) return
  uni.navigateTo({ url: '/subpackages/mine/edit' })
}

async function onGetPhoneNumber(event: { detail?: { code?: string; errMsg?: string } }) {
  const code = String(event.detail?.code || '').trim()
  const errMsg = String(event.detail?.errMsg || '')
  if (!code) {
    if (!/deny|cancel/i.test(errMsg)) uni.showToast({ title: '手机号授权失败，请重试', icon: 'none' })
    return
  }
  if (bindingPhone.value) return
  bindingPhone.value = true
  try {
    user.value = await bindPhoneWithWechatCode(code)
    uni.showToast({ title: '手机号已绑定', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '手机号绑定失败', icon: 'none' })
  } finally {
    bindingPhone.value = false
  }
}

function goHolidays() {
  uni.navigateTo({ url: '/subpackages/holidays/index' })
}

function goGuide() {
  uni.navigateTo({ url: '/subpackages/guide/index' })
}

function goFeedback() {
  uni.navigateTo({ url: '/subpackages/feedback/index' })
}

function goCreateSpace() {
  uni.navigateTo({ url: '/subpackages/space/create' })
}

function goSpaceDetail(id: string) {
  uni.navigateTo({ url: `/subpackages/space/detail?spaceId=${encodeURIComponent(id)}` })
}

async function joinOfficial() {
  if (joiningOfficial.value) return
  joiningOfficial.value = true
  try {
    const joined = await joinOfficialExperienceSpace()
    void trackProductEvent('official_space_joined', { source: 'mine' })
    setPreferredSpaceId(joined.id)
    await load()
    uni.navigateTo({ url: `/subpackages/space/detail?spaceId=${encodeURIComponent(joined.id)}` })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加入失败，请稍后再试', icon: 'none' })
  } finally {
    joiningOfficial.value = false
  }
}

const insightLoading = ref(false)
const insights = ref<Insight[]>([])
const insightSpaceId = ref<string | null>(null)
const loadedInsightScope = ref<string | null>(null)
const loadingInsightScope = ref<string | null>(null)
let insightRequestVersion = 0
const insightSpace = computed(() => spaces.value.find((space) => space.id === insightSpaceId.value) || null)
const insightPriority = { anniversary: 0, care: 1, preference: 2 } as const
const featuredInsight = computed(() => [...insights.value].sort((a, b) => insightPriority[a.type] - insightPriority[b.type])[0])
const insightKicker = computed(() => {
  return insightSpace.value
    ? `从「${insightSpace.value.name}」里，发现一件值得留意的小事`
    : '从你的记录里，发现一件值得留意的小事'
})
const insightTitle = computed(() => featuredInsight.value?.title || '')
const insightDesc = computed(() => featuredInsight.value?.content || '')

async function loadInsight(force = false) {
  const scope = insightSpaceId.value || 'personal'
  if ((insightLoading.value && loadingInsightScope.value === scope) || (insights.value.length && loadedInsightScope.value === scope && !force)) return
  if (loadedInsightScope.value !== scope) insights.value = []
  const requestVersion = ++insightRequestVersion
  insightLoading.value = true
  loadingInsightScope.value = scope
  try {
    const next = await listInsights(insightSpaceId.value)
    if (requestVersion !== insightRequestVersion || (insightSpaceId.value || 'personal') !== scope) return
    insights.value = next
    loadedInsightScope.value = scope
  } catch {
    // 小贴士暂不可用不影响“我的”主页面；用户主动点击时再给明确反馈。
  } finally {
    if (requestVersion === insightRequestVersion) {
      insightLoading.value = false
      loadingInsightScope.value = null
    }
  }
}

async function showInsight() {
  if (!insights.value.length) await loadInsight(true)
  const params = insightSpaceId.value
    ? `?spaceId=${encodeURIComponent(insightSpaceId.value)}&spaceName=${encodeURIComponent(insightSpace.value?.name || '当前空间')}`
    : ''
  uni.navigateTo({ url: `/subpackages/insights/index${params}` })
}

function measureNav() {
  try {
    const sys = uni.getSystemInfoSync()
    statusBarHeight.value = sys.statusBarHeight || 20
    // #ifdef MP-WEIXIN
    const menu = uni.getMenuButtonBoundingClientRect()
    if (menu?.height) {
      navBarHeight.value = menu.height + (menu.top - statusBarHeight.value) * 2
      navPadRight.value = Math.max(96, sys.windowWidth - menu.left + 8)
      navContentOffset.value = Math.max(0, menu.top - statusBarHeight.value)
    }
    // #endif
  } catch {
    /* ignore */
  }
}

function togglePanel(id: 'theme' | 'font') {
  openPanel.value = openPanel.value === id ? null : id
}

async function pickFontSize(id: FontSizeId) {
  setFontSize(id)
  fontSize.value = id
  openPanel.value = null
  try {
    if (loggedIn.value) await saveUserPrefs({ fontSize: id })
    uni.showToast({ title: `字号已设为${FONT_SIZE_OPTIONS.find((x) => x.id === id)?.label || '默认'}`, icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '已在本机保存，云端同步失败', icon: 'none' })
  }
}

function pickTheme(id: ThemeId) {
  setTheme(id)
  refreshTheme(id)
  openPanel.value = null
  uni.showToast({ title: `已切换：${THEMES[id].name}`, icon: 'none' })
}

function goLogin() {
  uni.reLaunch({ url: '/pages/login/login' })
}

async function doLogout() {
  await logout()
  loggedIn.value = false
  user.value = null
  uni.showToast({ title: '已退出', icon: 'none' })
}

function clearCache() {
  uni.showModal({
    title: '清除缓存？',
    content: '将清除登录态，主题与字号设置会保留。',
    success: (r) => {
      if (!r.confirm) return
      clearAppCache({ keepTheme: true })
      loggedIn.value = false
      user.value = null
      uni.showToast({ title: '已清除', icon: 'none' })
    },
  })
}

function showAbout() {
  uni.showModal({
    title: '关于只我们',
    content: '和最在乎的人，一起记录生活。\n\n版本 0.2.0',
    showCancel: false,
  })
}

function csvCell(value: unknown) {
  let text = value == null ? '' : String(value)
  // 防止用表格软件打开时把用户文本当作公式执行
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function cleanBody(body: string) {
  return displayDiaryBody(body || '')
}

function entryTypeLabel(type: Entry['type']) {
  if (type === 'anniversary') return '日期'
  if (type === 'todo') return '待办'
  return '随手记'
}

async function fetchAllEntries() {
  const all: Entry[] = []
  let page = 1
  while (page <= 200) {
    const result = await listEntries({ page, pageSize: 50 })
    all.push(...result.list)
    if (all.length >= result.total || result.list.length < 50) break
    page += 1
  }
  return all
}

function buildCsv(entries: Entry[]) {
  const headers = [
    '类型',
    '标题',
    '内容',
    '日期',
    '记录时间',
    '状态',
    '重复',
    '置顶',
    '开启提醒',
    '提前提醒天数',
    '图片',
    '创建时间',
    '更新时间',
  ]
  const rows = entries.map((item) => [
    entryTypeLabel(item.type),
    item.title,
    cleanBody(item.body || ''),
    item.eventDate,
    item.eventAt || '',
    item.type === 'todo' ? (item.todoStatus === 'done' ? '已完成' : '未完成') : '',
    item.repeatRule || 'none',
    item.pinned ? '是' : '否',
    item.remindEnabled ? '是' : '否',
    item.remindAheadDays,
    (item.images || []).join(' | '),
    item.createdAt || '',
    item.updatedAt || '',
  ])
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

function exportFile(csv: string, filename: string) {
  // #ifdef MP-WEIXIN
  const wxApi = (globalThis as any).wx
  const userPath = wxApi?.env?.USER_DATA_PATH
  if (!userPath) {
    uni.setClipboardData({
      data: csv,
      success: () => uni.showToast({ title: '数据已复制到剪贴板', icon: 'none' }),
    })
    return
  }

  // 文件名用 ASCII，避免部分机型写入失败
  const filePath = `${userPath}/${filename}`
  const fs = uni.getFileSystemManager()

  const copyCsv = () => {
    uni.setClipboardData({
      data: csv,
      success: () =>
        uni.showToast({
          title: '数据已复制，可粘贴到备忘录/表格',
          icon: 'none',
          duration: 2500,
        }),
    })
  }

  const shareCsv = () => {
    if (!wxApi?.shareFileMessage) {
      copyCsv()
      return
    }
    wxApi.shareFileMessage({
      filePath,
      fileName: filename,
      fail: (error: any) => {
        const msg = String(error?.errMsg || '')
        if (msg.includes('cancel')) return
        // 开发者工具 / PC 端不支持该 API
        if (
          msg.includes('开发者工具') ||
          msg.includes('not supported') ||
          msg.includes('暂时不支持')
        ) {
          uni.showModal({
            title: '提示',
            content: '当前环境不支持直接分享文件。可复制数据后粘贴到备忘录或电脑表格；真机可再试「分享文件」。',
            confirmText: '复制数据',
            success: (r) => {
              if (r.confirm) copyCsv()
            },
          })
          return
        }
        uni.showModal({
          title: '分享失败',
          content: '可改为复制全部数据到剪贴板。',
          confirmText: '复制数据',
          success: (r) => {
            if (r.confirm) copyCsv()
          },
        })
      },
    })
  }

  fs.writeFile({
    filePath,
    data: csv,
    encoding: 'utf8',
    success: () => {
      let platform = ''
      try {
        platform = uni.getSystemInfoSync().platform || ''
      } catch {
        /* ignore */
      }
      // 模拟器直接给可操作选项，避免 silent fail
      if (platform === 'devtools' || !wxApi?.shareFileMessage) {
        uni.showActionSheet({
          itemList: ['复制全部数据', '尝试分享文件（需真机）'],
          success: (r) => {
            if (r.tapIndex === 0) copyCsv()
            else shareCsv()
          },
        })
        return
      }
      uni.showActionSheet({
        itemList: ['分享文件给微信好友', '复制全部数据'],
        success: (r) => {
          if (r.tapIndex === 0) shareCsv()
          else copyCsv()
        },
      })
    },
    fail: (err: any) => {
      console.error('[export] writeFile', err)
      uni.showModal({
        title: '生成文件失败',
        content: '是否改为复制数据到剪贴板？',
        confirmText: '复制数据',
        success: (r) => {
          if (r.confirm) copyCsv()
        },
      })
    },
  })
  return
  // #endif

  // #ifndef MP-WEIXIN
  // ESLint 不解析 uni-app 条件编译：上面的 return 只存在于 MP-WEIXIN 分支，
  // 非小程序端这段是唯一出口，并非不可达代码。
  // eslint-disable-next-line no-unreachable
  uni.setClipboardData({
    data: csv,
    success: () => uni.showToast({ title: '数据已复制到剪贴板', icon: 'none' }),
  })
  // #endif
}

async function exportData() {
  if (!loggedIn.value) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  const result = await uni.showModal({
    title: '导出我的记录',
    content: '将导出日期、待办和随手记的文字数据及图片链接，格式为 CSV。暂不包含共同回忆、邀请成员和图片文件本身。',
    confirmText: '继续导出',
    cancelText: '取消',
  })
  if (!result.confirm) return
  uni.showLoading({ title: '正在导出…', mask: true })
  try {
    const entries = await fetchAllEntries()
    const date = new Date()
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    // 真机分享用英文文件名更稳
    exportFile(buildCsv(entries), `daykeep-export-${stamp}.csv`)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '导出失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

async function load() {
  fontSize.value = getFontSize()
  loggedIn.value = isLoggedIn()
  if (!loggedIn.value) {
    user.value = null
    spaces.value = []
    officialExperience.value = null
    holidaySettingsVisible.value = true
    moodWeek.value = []
    insightSpaceId.value = null
    insights.value = []
    loadedInsightScope.value = null
    insightRequestVersion += 1
    insightLoading.value = false
    loadingInsightScope.value = null
    return
  }
  try {
    const [me, spaceResult, week, official] = await Promise.all([
      fetchMe(),
      listSpaces().catch(() => null),
      getMyMoodWeek().catch(() => [] as MoodDay[]),
      getOfficialExperienceSpace().catch(() => null),
    ])
    const spaceList = spaceResult || []
    user.value = me
    spaces.value = spaceList
    officialExperience.value = official
    const preferredSpaceId = getPreferredSpaceId() || null
    insightSpaceId.value = spaceResult
      ? (preferredSpaceId && spaceList.some((space) => space.id === preferredSpaceId) ? preferredSpaceId : null)
      : preferredSpaceId
    if (spaceResult && preferredSpaceId && !insightSpaceId.value) setPreferredSpaceId(null)
    holidaySettingsVisible.value = !insightSpaceId.value
    moodWeek.value = normalizeMoodWeek(week)
    try {
      const prefs = await fetchUserPrefs()
      const cloudFontSize: FontSizeId =
        prefs.fontSize === 'small' || prefs.fontSize === 'medium' || prefs.fontSize === 'large'
          ? prefs.fontSize
          : 'standard'
      if (cloudFontSize !== fontSize.value) setFontSize(cloudFontSize)
      fontSize.value = cloudFontSize
    } catch {
      // 个性化同步失败时继续使用本机设置，不能清空已成功加载的用户与空间。
    }
  } catch {
    loggedIn.value = isLoggedIn()
    if (!loggedIn.value) {
      user.value = null
      spaces.value = []
      officialExperience.value = null
      return
    }
    user.value = { id: '-', nickname: DEFAULT_NICKNAME, avatarUrl: '' }
    spaces.value = []
    insightSpaceId.value = getPreferredSpaceId() || null
    holidaySettingsVisible.value = !insightSpaceId.value
  }
}

onMounted(measureNav)

onShow(() => {
  void load().then(() => {
    if (loggedIn.value) void loadInsight(true)
  })
})

onBackPress(() => {
  if (activeSection.value === 'root') return false
  backToMine()
  return true
})

onShareAppMessage(() => ({
  title: '只我们｜世界很大，这里只我们',
  path: '/pages/timeline/index',
}))

onShareTimeline(() => ({
  title: '只我们｜世界很大，这里只我们',
}))
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: var(--dk-bg, #f2f4f3);
  color: var(--dk-ink, #1c2423);
  display: flex;
  flex-direction: column;
}
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding-left: 32rpx;
  box-sizing: border-box;
}
.nav-inner {
  display: flex;
  align-items: center;
  gap: 12rpx;
  overflow: hidden;
  box-sizing: border-box;
}
.nav-back {
  display: flex;
  width: 40rpx;
  height: 56rpx;
  flex-shrink: 0;
  align-items: center;
  color: var(--dk-ink, #1c2423);
  font-size: 48rpx;
  font-weight: 300;
  line-height: 52rpx;
}
.brand {
  flex-shrink: 0;
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-display, 46rpx);
  font-weight: 600;
  letter-spacing: .02em;
  line-height: 1.2;
}
.content {
  padding: 24rpx 40rpx 120rpx;
  min-height: calc(100vh - 180rpx);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.section {
  margin-bottom: 48rpx;
}
.mine-menu,
.support-menu {
  overflow: hidden;
  margin-top: 0;
  padding: 0 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  border-radius: 24rpx;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 254, 251, 0.08) 42%),
    var(--dk-surface, #fffefb);
  box-shadow:
    0 16rpx 36rpx rgba(47, 111, 106, 0.07),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
}
.care-note {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24rpx;
  overflow: hidden;
  padding: 30rpx 28rpx 28rpx;
  border: 1rpx solid rgba(176,137,72,.14);
  border-radius: 30rpx;
  background: radial-gradient(circle at 92% 12%,rgba(255,255,255,.76),transparent 26%),linear-gradient(138deg,#fff8eb 0%,#f4f5e9 48%,#e6f1ee 100%);
  box-shadow: 0 14rpx 38rpx rgba(82,72,45,.055);
}
.care-note:active { opacity: .78; }
.care-note-spark {
  position: absolute;
  top: 20rpx;
  right: 24rpx;
  color: rgba(176,137,72,.42);
  font-size: 38rpx;
}
.care-note-copy {
  flex: 1;
  min-width: 0;
}
.care-note-kicker {
  display: block;
  color: #8b7445;
  font-size: var(--dk-fs-caption, 23rpx);
  font-weight: 650;
}
.care-note-title {
  display: block;
  margin-top: 13rpx;
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-body, 30rpx);
  font-weight: 700;
  line-height: 1.4;
}
.care-note-desc {
  display: block;
  margin-top: 9rpx;
  color: #626a65;
  font-size: var(--dk-fs-meta, 25rpx);
  line-height: 1.55;
}
.care-note-action {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5rpx;
  padding-bottom: 2rpx;
  color: #1c2423;
  font-size: var(--dk-fs-caption, 23rpx);
  font-weight: 700;
}
.care-note-action text:last-child { font-size: 30rpx; font-weight: 400; line-height: 1; }
.spaces-menu {
  margin-bottom: 16rpx;
}
.spaces-menu .row{justify-content:flex-start;gap:16rpx}
.spaces-menu .row-copy{flex:1}
.spaces-menu .arrow{margin-left:auto}
.space-dissolved-desc{color:#a85f57}
.space-cover-thumb{width:66rpx;height:66rpx;flex-shrink:0;overflow:hidden;border-radius:18rpx;background:radial-gradient(circle at 20% 20%,rgba(255,255,255,.6),transparent 35%),linear-gradient(145deg,#b5d5cd,#ecd8b1)}.space-cover-thumb image{display:block;width:100%;height:100%}
.space-row-title{display:flex;min-width:0;align-items:center;gap:10rpx}.official-space-badge{flex-shrink:0;padding:4rpx 9rpx;border-radius:999rpx;color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);font-size:17rpx;font-weight:700}
.join-official-cta{display:flex;width:100%;min-height:96rpx;margin:0 0 14rpx;padding:18rpx 22rpx;align-items:center;gap:18rpx;border:1rpx solid rgba(47,111,106,.12);border-radius:22rpx;color:var(--dk-ink);background:linear-gradient(135deg,var(--dk-feature-brand-soft,#e4f0ee),rgba(255,255,255,.8));line-height:1.35;text-align:left;box-sizing:border-box}.join-official-cta::after{border:0}.join-official-mark{display:flex;width:54rpx;height:54rpx;flex-shrink:0;align-items:center;justify-content:center;border-radius:18rpx;color:#fff;background:var(--dk-feature-brand,#2f6f6a);font-size:24rpx}
.create-space-cta {
  display: flex;
  width: 100%;
  height: auto;
  min-height: 96rpx;
  margin: 0 0 44rpx;
  padding: 18rpx 22rpx;
  align-items: center;
  gap: 18rpx;
  border: 2rpx dashed rgba(47,111,106,.26);
  border-radius: 22rpx;
  background: rgba(47,111,106,.045);
  color: var(--dk-brand, #2f6f6a);
  line-height: 1.35;
  text-align: left;
  box-sizing: border-box;
}
.create-space-cta::after { border: 0; }
.create-space-cta:active { opacity: .72; }
.create-space-plus { display: flex; width: 54rpx; height: 54rpx; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: var(--dk-brand-soft, #e1efec); font-size: 34rpx; font-weight: 400; line-height: 1; }
.create-space-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.create-space-copy text:first-child { font-size: var(--dk-fs-label, 28rpx); font-weight: 700; }
.create-space-copy text:last-child { margin-top: 4rpx; color: var(--dk-muted, #6b736f); font-size: var(--dk-fs-caption, 23rpx); }
.create-space-arrow { flex-shrink: 0; color: var(--dk-muted, #6b736f); font-size: 30rpx; }

.root-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 4rpx 15rpx;
}
.root-section-head .root-section-label { margin: 0; }
.section-head-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-caption, 23rpx);
}
.fold-arrow {
  display: inline-block;
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-title, 30rpx);
  line-height: 1;
  transform: rotate(0deg);
  transition: transform .18s ease;
}
.fold-arrow.open { transform: rotate(90deg); }
.prefs-inline {
  padding-left: 18rpx;
  background: rgba(47,111,106,.025);
}
.preference-row { padding-right: 2rpx; font-size: var(--dk-fs-body, 30rpx); }
.prefs-inline .panel { padding-right: 8rpx; }
.mine-menu .row:last-child,
.support-menu .row:last-child {
  border-bottom: 0;
}
.support-label {
  margin-top: 2rpx;
}
.profile-section {
  margin-bottom: 44rpx;
  padding: 26rpx 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  border-radius: 26rpx;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(231, 242, 239, 0.18) 48%),
    var(--dk-surface, #fffefb);
  box-shadow:
    0 16rpx 36rpx rgba(47, 111, 106, 0.07),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
}
.root-section-label {
  display: block;
  margin: 0 4rpx 15rpx;
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-caption, 23rpx);
  letter-spacing: .08em;
}
.sub-section {
  padding-top: 0;
}
.data-group {
  margin-bottom: 34rpx;
}
.sec-title {
  display: block;
  margin: 0 8rpx 13rpx;
  font-size: var(--dk-fs-meta, 22rpx);
  letter-spacing: .06em;
  color: var(--dk-muted, #6b736f);
}
.data-card {
  overflow: hidden;
  padding: 0 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  border-radius: 24rpx;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 254, 251, 0.08) 42%),
    var(--dk-surface, #fffefb);
  box-shadow:
    0 16rpx 36rpx rgba(47, 111, 106, 0.07),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
}
.data-card > .row:last-child,
.data-card > .privacy-row:last-child {
  border-bottom: 0;
}
.privacy-row {
  display: flex;
  min-height: 86rpx;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
}
.privacy-title {
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-body, 28rpx);
}
.privacy-value {
  flex-shrink: 0;
  color: var(--dk-brand, #2f6f6a);
  font-size: var(--dk-fs-meta, 22rpx);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink, #1c2423);
}
.export-row {
  align-items: center;
}
.row-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.row-title {
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-body, 28rpx);
}
.row-desc {
  margin-top: 8rpx;
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-meta, 22rpx);
  line-height: 1.4;
}
.share-row {
  width: 100%;
  height: auto;
  line-height: 1.45;
  margin: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  &::after {
    border: none;
  }
}
.bind-phone-row {
  width: 100%;
  height: auto;
  margin: 0;
  border-radius: 0;
  background: transparent;
  line-height: 1.45;
  text-align: left;
  &::after { border: none; }
  &[disabled] { opacity: 0.72; }
}
.phone-action { flex-shrink: 0; color: var(--dk-brand); font-size: var(--dk-fs-meta, 23rpx); font-weight: 650; }
.phone-bound-row { border-bottom: 0; }
.phone-status { flex-shrink:0; color:var(--dk-muted); font-size:var(--dk-fs-meta,22rpx); }
.tap:active {
  opacity: 0.7;
}
.check {
  flex-shrink: 0;
  font-size: var(--dk-fs-title, 30rpx);
}
.arrow {
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-title, 30rpx);
}
.muted-r {
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
}

.user-row {
  border-bottom: none;
  padding-bottom: 8rpx;
}
.user-left {
  display: flex;
  align-items: center;
  gap: 24rpx;
  min-width: 0;
  flex: 1;
}
.avatar-wrap { position: relative; flex-shrink: 0; }
.avatar-mood { position: absolute; right: -5rpx; bottom: -4rpx; display: flex; width: 38rpx; height: 38rpx; align-items: center; justify-content: center; border: 4rpx solid var(--dk-surface, #fff); border-radius: 50%; background: var(--dk-bg-soft); font-size: 21rpx; line-height: 1; box-sizing: border-box; }
.mood-week { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid #e2e7e4; }
.mood-week-head{display:flex;align-items:center;gap:12rpx;min-width:0}.mood-week-title{flex-shrink:0;color:#26302e;font-size:24rpx;font-weight:700}.mood-week-summary{min-width:0;overflow:hidden;color:#79817d;font-size:22rpx;text-overflow:ellipsis;white-space:nowrap}
.mood-week-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6rpx; margin-top: 10rpx; }
.mood-day { display: flex; flex-direction: column; align-items: center; gap: 3rpx; }
.mood-day.editable { cursor: pointer; }
.mood-day.editable:active { opacity: .62; }
.mood-day-icon { display: flex; width: 34rpx; height: 34rpx; align-items: center; justify-content: center; border-radius: 50%; background: #eef2f0; color: #79817d; font-size: 20rpx; }
.mood-day.editable .mood-day-icon { color: #1c2423; background: transparent; }
.mood-day.editable .mood-day-label { color: #1c2423; font-weight: 650; }
.mood-day-label { color: #79817d; font-size: 20rpx; }
.mood-picker-mask{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;background:rgba(18,25,24,.34)}
.mood-picker-sheet{width:100%;padding:30rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));border-radius:30rpx 30rpx 0 0;background:var(--dk-surface,#fff);box-shadow:0 -14rpx 44rpx rgba(31,61,57,.12);box-sizing:border-box}
.mood-picker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20rpx}
.mood-picker-title{display:block;color:var(--dk-ink,#1c2423);font-size:30rpx;font-weight:700;line-height:1.35}
.mood-picker-sub{display:block;margin-top:7rpx;color:var(--dk-muted,#6b736f);font-size:24rpx;line-height:1.45}
.mood-picker-close{display:flex;width:48rpx;height:48rpx;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%;color:var(--dk-muted,#6b736f);background:var(--dk-bg-soft,#f2f4f3);font-size:32rpx;line-height:1}
.mood-picker-options{display:flex;gap:8rpx;margin-top:24rpx}
.mood-picker-option{display:flex;min-width:0;height:104rpx;flex:1;align-items:center;justify-content:center;gap:7rpx;border:1rpx solid transparent;border-radius:16rpx;color:var(--dk-muted,#6b736f);background:var(--dk-bg-soft,#f2f4f3);font-size:21rpx;line-height:1;flex-direction:column;box-sizing:border-box}
.mood-picker-option.on{border-color:rgba(47,111,106,.3);color:var(--dk-brand,#2f6f6a);background:var(--dk-brand-soft,#e6f1ef);font-weight:700}
.mood-picker-icon{font-size:31rpx;line-height:1}
.custom-mood-wrap{display:flex;gap:12rpx;margin-top:20rpx}
.custom-mood-input{height:76rpx;min-width:0;padding:0 22rpx;flex:1;border:1rpx solid var(--dk-line,#e2e6e4);border-radius:16rpx;color:var(--dk-ink,#1c2423);background:var(--dk-bg-soft,#f2f4f3);font-size:28rpx;box-sizing:border-box}
.custom-mood-save{width:116rpx;height:76rpx;padding:0;margin:0;border-radius:16rpx;color:#fff;background:var(--dk-brand,#2f6f6a);font-size:25rpx;font-weight:650;line-height:76rpx;&::after{border:none}}
.custom-mood-tip{display:block;margin-top:10rpx;color:var(--dk-muted,#6b736f);font-size:23rpx;line-height:1.4}
.avatar-img,
.avatar-ph {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  flex-shrink: 0;
}
.avatar-ph {
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-letter {
  font-size: var(--dk-fs-display, 42rpx);
  font-weight: 600;
}
.name {
  display: block;
  font-size: var(--dk-fs-title, 30rpx);
  font-weight: 500;
}
.profile-tip {
  display: block;
  margin-top: 6rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
}
.profile-meta {
  display: block;
  margin-top: 7rpx;
  color: var(--dk-muted, #6b736f);
  font-size: 22rpx;
}
.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}
.btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  font-size: var(--dk-fs-body, 28rpx);
  border-radius: 10rpx;
  border: none;
  margin: 0;
  &::after {
    border: none;
  }
}

.row-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.panel {
  padding: 2rpx 0 8rpx 12rpx;
  margin-bottom: 4rpx;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
}
.panel-row {
  display: flex;
  min-height: 68rpx;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx;
  box-sizing: border-box;
}
.panel-row + .panel-row { border-top: 1rpx solid rgba(226, 230, 228, .7); }
.panel-name {
  display: block;
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink, #1c2423);
  white-space: nowrap;
}

.logout-wrap {
  padding-top: 24rpx;
}
.logout-wrap .btn {
  width: 100%;
}
.mine-footer {
  display: flex;
  margin-top: auto;
  padding-top: 46rpx;
  flex-direction: column;
  text-align: center;
}
.mine-quote {
  color: var(--dk-muted, #6b736f);
  font-size: 22rpx;
  letter-spacing: .03em;
}
</style>
