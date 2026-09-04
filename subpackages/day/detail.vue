<template>
  <view class="page" :style="pageStyle">
    <template v-if="day">
      <view class="poster">
        <image class="poster-bg" :src="background" mode="aspectFill" />
        <view class="poster-shade" />
        <view class="poster-copy">
          <text class="poster-title">{{ day.title }}</text>
          <text class="poster-status">{{ statusText }}</text>
          <text class="poster-number">{{ count }}</text>
          <view class="poster-rule" />
          <text class="poster-date">{{ datePrefix }}{{ dateText }}</text>
          <text v-if="day.calendarLabel" class="poster-calendar">{{ day.calendarLabel }}</text>
        </view>
      </view>

      <view v-if="!isHoliday && isSpaceDay" class="collab-card space-day-card" @tap="goCollaborate">
        <view class="collab-left">
          <view class="collab-avatars">
            <view v-for="member in spaceMembersPreview" :key="member.userId" class="collab-avatar space-member">
              <image v-if="member.avatarUrl" :src="member.avatarUrl" mode="aspectFill" />
              <text v-else>{{ member.nickname?.slice(0,1) || '人' }}</text>
            </view>
            <view v-if="spaceMemberOverflow" class="collab-avatar overflow"><text>+{{ spaceMemberOverflow }}</text></view>
          </view>
          <view class="collab-text">
            <text class="collab-kicker">共同好日子</text>
            <text class="collab-title">{{ currentSpace?.name || '共同空间' }}</text>
            <text class="collab-sub">成员各自开启提醒，一起记住这个日子</text>
          </view>
        </view>
        <text class="collab-arrow">›</text>
      </view>

      <view v-else-if="!isHoliday && isLegacyCollaborative" class="collab-card legacy-card" @tap="goCollaborate">
        <view class="collab-left">
          <view class="collab-avatars">
            <view v-if="collabInfo" class="collab-avatar owner">
              <image v-if="userAvatar" :src="userAvatar" mode="aspectFill" />
              <text v-else>我</text>
            </view>
            <view v-if="collabInfo?.hasPartner" class="collab-avatar partner">
              <image v-if="partnerAvatar" :src="partnerAvatar" mode="aspectFill" />
              <text v-else>{{ partnerNickname?.slice(0,1) || 'TA' }}</text>
            </view>
            <view v-if="!collabInfo?.hasPartner" class="collab-avatar add">
              <text>+</text>
            </view>
          </view>
          <view class="collab-text">
            <text class="collab-kicker">共同好日子</text>
            <text class="collab-title">你和 {{ partnerNickname }} 一起记录</text>
            <text class="collab-sub">已共同留下 {{ collabInfo?.momentCount || 0 }} 条回忆，可分别开启提醒</text>
          </view>
        </view>
        <text class="collab-arrow">›</text>
      </view>

      <view v-else-if="!isHoliday && !isBuiltInDay" class="collab-card transfer-card" @tap="chooseTargetSpace">
        <view class="collab-left">
          <view class="collab-avatars">
            <view class="collab-avatar owner"><image v-if="userAvatar" :src="userAvatar" mode="aspectFill" /><text v-else>我</text></view>
            <view class="collab-avatar add"><text>+</text></view>
          </view>
          <view class="collab-text">
            <text class="collab-title">放进共同空间，一起记录</text>
            <text class="collab-sub">圈内成员都能看到，也能继续写下回忆</text>
          </view>
        </view>
        <text class="collab-arrow">›</text>
      </view>

      <view class="actions">
        <button class="action" hover-class="action-hover" @tap.stop="recordMood">
          <view class="action-icon"><image src="../../static/actions/record.png" mode="aspectFit" /></view>
          <text>写随手记</text>
        </button>
        <button class="action" hover-class="action-hover" :loading="savingPoster" @tap="savePoster">
          <view class="action-icon"><image src="../../static/actions/save.png" mode="aspectFit" /></view>
          <text>保存图片</text>
        </button>
        <button class="action" hover-class="action-hover" @tap="handleShare">
          <view class="action-icon"><image src="../../static/actions/share.png" mode="aspectFit" /></view>
          <text>分享</text>
        </button>
        <button v-if="isHoliday || canEditDay" class="action" hover-class="action-hover" @tap="editDay">
          <view class="action-icon"><image src="../../static/actions/edit.png" mode="aspectFit" /></view>
          <text>编辑</text>
        </button>
      </view>

      <text class="hint">{{ isHoliday ? '节日名称和日期由历法自动计算，可更换背景。' : canEditDay ? '点击编辑可修改日期、提醒和背景。' : '这个共同好日子由创建者管理，你可以继续写下共同回忆。' }}</text>

      <canvas canvas-id="dayPosterCanvas" class="export-canvas" />

      <view v-if="showShareSheet" class="share-sheet-mask" @tap="showShareSheet = false">
        <view class="share-sheet" @tap.stop>
          <view class="share-sheet-group">
            <!-- #ifdef MP-WEIXIN -->
            <button
              class="share-sheet-action"
              open-type="share"
              @tap="shareDayCard"
            >
              分享日子卡片
            </button>
            <!-- #endif -->
            <!-- #ifndef MP-WEIXIN -->
            <button
              class="share-sheet-action"
              @tap="shareToSystem"
            >
              分享日子卡片
            </button>
            <!-- #endif -->
          </view>
          <button class="share-sheet-cancel" @tap="showShareSheet = false">取消</button>
        </view>
      </view>

      <view v-if="showEditor && (isHoliday || canEditDay)" class="sheet-mask" @tap="showEditor = false">
        <view class="sheet" @tap.stop>
          <view class="sheet-head">
            <view>
              <text class="sheet-title">{{ isHoliday ? '更换节日背景' : '换个背景' }}</text>
              <text class="sheet-subtitle">{{ isHoliday ? '节日日期由历法自动计算，仅支持更换背景' : '选择模板，或上传一张自己的照片' }}</text>
            </view>
            <text class="sheet-close" @tap="showEditor = false">关闭</text>
          </view>
          <view class="editor-preview">
            <image :src="previewBackground" mode="aspectFill" />
            <view class="editor-preview-shade" />
            <text>{{ day.title }}</text>
          </view>
          <text class="section-label">选择模板</text>
          <scroll-view class="preset-scroll" scroll-x>
            <view class="preset-list">
              <view
                v-for="(poster, index) in DEFAULT_POSTERS"
                :key="poster"
                class="preset-card"
                :class="{ selected: draftPresetIndex === index }"
                @tap="selectPreset(index)"
              >
                <image :src="poster" mode="aspectFill" />
                <text>{{ POSTER_NAMES[index] }}</text>
              </view>
            </view>
          </scroll-view>
          <button class="upload-button" @tap="chooseCustomBackground">从相册选择或拍照</button>
          <button class="confirm-button" :disabled="!hasBackgroundDraft" @tap="confirmBackground">应用此背景</button>
          <button v-if="!isHoliday" class="more-edit-button" @tap="openFullEditor">编辑日期与提醒</button>
          <button v-if="!isHoliday" class="quick-delete-button danger-action" @tap="removeDay">删除这个日子</button>
          <text class="sheet-hint">{{ isHoliday ? '背景随时可以更换，节日名称和日期由系统计算。' : '背景会用于日子海报，之后也能随时更换。' }}</text>
        </view>
      </view>
    </template>
    <view v-else-if="loading && showLoadingHint" class="state">正在准备这个日子…</view>
    <view v-else-if="!loading" class="state">没有找到这个日子</view>
    <view v-else class="loading-placeholder" />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { useEntriesStore } from '@/stores/entries'
import {
  compressBackgroundImage,
  entryBackgroundUrl,
  deleteEntry,
  getEntry,
  moveEntryToSpace,
  updateEntry,
  uploadEntryBackground,
} from '@/services/entries'
import { uploadEntryImage } from '@/subpackages/shared/services/upload'
import { confirmProfileForSocialAction, fetchMe, getCachedUserId } from '@/services/auth'
import { request } from '@/api/request'
import { listHolidayOccurrences } from '@/services/holidays'
import { daysUntil, normalizeRepeatRule, type RepeatRule } from '@/utils/countdown'
import { formatAnnualDateLabel } from '@/utils/lunar'
import {
  DEFAULT_POSTERS,
  defaultPosterFor,
  getHolidayPoster,
  setHolidayPoster,
  setHolidayPosterPreset,
  syncHolidayPosters,
} from '@/services/posters'
import { getSpace, listSpaces, type Space, type SpaceMember } from '@/services/spaces'

type DayView = {
  id: string
  title: string
  body: string
  date: string
  backgroundUrl: string
  calendar: 'solar' | 'lunar'
  repeatRule: RepeatRule
  calendarLabel?: string
  userId?: string
  ownerType: 'personal' | 'space'
  spaceId?: string | null
}

const { pageStyle } = useThemePage()
const loading = ref(false)
const showLoadingHint = ref(false)
const day = ref<DayView | null>(null)
const entriesStore = useEntriesStore()
const entryId = ref('')
const holidayId = ref('')
const savingPoster = ref(false)
const posterPath = ref('')
const showEditor = ref(false)
const showShareSheet = ref(false)
const draftPresetIndex = ref<number | null>(null)
const draftCustomPath = ref('')
const currentSpace = ref<Space | null>(null)
const transferOnReady = ref(false)
let loadingHintTimer: ReturnType<typeof setTimeout> | null = null

// 共同记录
interface CollabInfo {
  collaborators: { userId: string; nickname: string; avatarUrl: string; role: string }[]
  momentCount: number
  hasPartner: boolean
}
const collabInfo = ref<CollabInfo | null>(null)
const currentUserId = ref('')
const userAvatar = computed(() => {
  const me = collabInfo.value?.collaborators?.find(c => String(c.userId) === currentUserId.value)
  return me?.avatarUrl || ''
})
const partnerAvatar = computed(() => {
  const other = collabInfo.value?.collaborators?.find(c => String(c.userId) !== currentUserId.value)
  return other?.avatarUrl || ''
})
const partnerNickname = computed(() => {
  const other = collabInfo.value?.collaborators?.find(c => String(c.userId) !== currentUserId.value)
  return other?.nickname || 'TA'
})
const isLegacyCollaborative = computed(() => !isSpaceDay.value && Boolean(collabInfo.value?.hasPartner || collabInfo.value?.momentCount))
const isSpaceDay = computed(() => day.value?.ownerType === 'space' && Boolean(day.value.spaceId))
const canEditDay = computed(() => String(day.value?.userId || '') === String(currentUserId.value || getCachedUserId() || ''))
const spaceMembersPreview = computed<SpaceMember[]>(() => (currentSpace.value?.members || []).slice(0, 4))
const spaceMemberOverflow = computed(() => Math.max(0, (currentSpace.value?.members?.length || 0) - spaceMembersPreview.value.length))

async function loadCollabInfo() {
  if (!entryId.value || holidayId.value) {
    collabInfo.value = null
    return
  }
  currentUserId.value = String(getCachedUserId() || '')
  if (!currentUserId.value) {
    const me = await fetchMe().catch(() => null)
    if (me?.id != null) currentUserId.value = String(me.id)
  }
  try {
    const data = await request<CollabInfo>({ url: `/api/entries/${entryId.value}/collaborate` })
    collabInfo.value = data
  } catch {
    collabInfo.value = null
  }
}

async function loadCurrentSpace() {
  currentSpace.value = null
  if (!day.value?.spaceId) return
  try { currentSpace.value = await getSpace(day.value.spaceId) }
  catch { currentSpace.value = null }
}

async function goCollaborate() {
  await openCollaborate(false)
}

async function openCollaborate(autoInvite: boolean) {
  if (!entryId.value) return
  if (!(await confirmProfileForSocialAction('collaborate'))) return
  const inviteQuery = autoInvite ? '&invite=1' : ''
  uni.navigateTo({ url: `/subpackages/day/collaborate?entryId=${entryId.value}&title=${encodeURIComponent(day.value?.title || '')}${inviteQuery}` })
}

const isHoliday = computed(() => !!holidayId.value)
const isBuiltInDay = computed(() => {
  const body = day.value?.body || ''
  return body.includes('__dk_seed:wechat_release__') || body.includes('__dk_seed:year_progress__')
})
const POSTER_NAMES = ['雾山', '晴野', '夜雨', '树影'] as const
const background = computed(
  () => day.value?.backgroundUrl || defaultPosterFor(day.value?.id || 'daykeep'),
)
const previewBackground = computed(
  () => draftCustomPath.value || (draftPresetIndex.value == null ? background.value : DEFAULT_POSTERS[draftPresetIndex.value]),
)
const hasBackgroundDraft = computed(
  () => draftPresetIndex.value != null || !!draftCustomPath.value,
)

function parseDate(value: string) {
  const [year, month, date] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, date)
}

function rawDays(date: string) {
  const target = parseDate(date)
  const now = new Date()
  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((targetDay - today) / 86400000)
}

const delta = computed(() => {
  if (!day.value) return 0
  if (isHoliday.value) return rawDays(day.value.date)
  return daysUntil(day.value.date, day.value.repeatRule, new Date(), day.value.calendar)
})
const count = computed(() => Math.abs(delta.value))
const statusText = computed(() => {
  if (delta.value === 0) return '就是今天'
  return delta.value < 0 ? '已经走过' : '还有'
})
const datePrefix = computed(() => day.value?.repeatRule === 'yearly' ? '每年：' : '起始日：')
const dateText = computed(() => {
  if (!day.value) return ''
  if (day.value.repeatRule === 'yearly') {
    return formatAnnualDateLabel(day.value.date, day.value.calendar)
  }
  const value = parseDate(day.value.date)
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日 ${weekdays[value.getDay()]}`
})

async function loadDay() {
  loading.value = true
  showLoadingHint.value = false
  if (loadingHintTimer) clearTimeout(loadingHintTimer)
  loadingHintTimer = setTimeout(() => {
    if (loading.value && !day.value) showLoadingHint.value = true
  }, 450)
  try {
    if (holidayId.value) {
      await syncHolidayPosters()
      const holiday = listHolidayOccurrences().find((item) => item.id === holidayId.value)
      day.value = holiday
        ? {
            id: `holiday:${holiday.id}`,
            title: holiday.name,
            body: '',
            date: holiday.date,
            backgroundUrl: getHolidayPoster(holiday.id),
            calendar: 'solar',
            repeatRule: 'none',
            calendarLabel: holiday.calendarLabel,
            ownerType: 'personal',
            spaceId: null,
          }
        : null
    } else if (entryId.value) {
      const entry = await getEntry(entryId.value)
      day.value = {
        id: entry.id,
        title: entry.title,
        body: entry.body || '',
        date: entry.eventDate,
        backgroundUrl: entryBackgroundUrl(entry),
        calendar: entry.calendar === 'lunar' ? 'lunar' : 'solar',
        repeatRule: normalizeRepeatRule(entry),
        calendarLabel: entry.calendar === 'lunar' ? '农历纪念日' : '',
        userId: entry.userId,
        ownerType: entry.ownerType === 'space' ? 'space' : 'personal',
        spaceId: entry.spaceId || null,
      }
    }
    if (day.value) {
      uni.setNavigationBarTitle({ title: day.value.title })
      await Promise.all([loadCollabInfo(), loadCurrentSpace()])
      if (transferOnReady.value && !isHoliday.value && !isBuiltInDay.value && !isSpaceDay.value && !isLegacyCollaborative.value) {
        transferOnReady.value = false
        setTimeout(() => void chooseTargetSpace(), 120)
      }
    }
  } catch (error: any) {
    if (error?.message === '未登录') {
      // 详情页可能由本地缓存打开；远端读取发现登录态失效时，
      // 清空旧页面栈进入登录页，避免旧详情导航栏与登录内容混层。
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' })
  } finally {
    if (loadingHintTimer) {
      clearTimeout(loadingHintTimer)
      loadingHintTimer = null
    }
    showLoadingHint.value = false
    loading.value = false
  }
}

function recordMood() {
  if (!day.value) return
  const title = encodeURIComponent(day.value.title)
  const date = encodeURIComponent(day.value.date)
  // 在跳转前生成本次写作会话的幂等键。即使真机上连续点击导致编辑页被打开两次，
  // 两个页面保存时也会被服务端识别为同一次记录。
  const requestId = `mood_${entryId.value}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  uni.navigateTo({
    url: `/subpackages/notes/edit?type=diary&sourceTitle=${title}&sourceDate=${date}&clientRequestId=${encodeURIComponent(requestId)}&ownerType=${isSpaceDay.value ? 'space' : 'personal'}${day.value.spaceId ? `&spaceId=${encodeURIComponent(day.value.spaceId)}` : ''}`,
  })
}

async function handleShare() {
  if (!(await confirmProfileForSocialAction('share'))) return
  showShareSheet.value = true
}

function shareDayCard() {
  // 微信小程序必须由带 open-type="share" 的按钮直接触发分享。
  setTimeout(() => {
    showShareSheet.value = false
  }, 300)
}

function shareToSystem() {
  showShareSheet.value = false
  // #ifdef APP-PLUS
  const text = `${day.value?.title || '纪念日'} — 只我们`
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制到剪贴板', icon: 'success' }),
  })
  // #endif
}

async function chooseTargetSpace() {
  if (!entryId.value || isBuiltInDay.value || isLegacyCollaborative.value) return
  let spaces: Space[] = []
  try { spaces = (await listSpaces()).filter((space) => !space.dissolvedAt) }
  catch (error: any) {
    uni.showToast({ title: error?.message || '空间加载失败', icon: 'none' })
    return
  }
  if (!spaces.length) {
    uni.navigateTo({ url: `/subpackages/space/create?moveEntryId=${encodeURIComponent(entryId.value)}` })
    return
  }
  uni.showActionSheet({
    itemList: [...spaces.map((space) => space.name), '创建新时光圈'],
    success: ({ tapIndex }) => {
      if (tapIndex === spaces.length) {
        uni.navigateTo({ url: `/subpackages/space/create?moveEntryId=${encodeURIComponent(entryId.value)}` })
        return
      }
      const target = spaces[tapIndex]
      if (target) void confirmMoveToSpace(target)
    },
  })
}

async function confirmMoveToSpace(target: Space) {
  const result = await uni.showModal({
    title: `放进「${target.name}」？`,
    content: '放入后，圈内成员都能看到并共同记录这个日子；每个人仍可单独设置提醒。',
    confirmText: '确认放入',
    cancelText: '取消',
  })
  if (!result.confirm || !entryId.value) return
  try {
    uni.showLoading({ title: '正在放入…', mask: true })
    await moveEntryToSpace(entryId.value, target.id)
    await loadDay()
    uni.hideLoading()
    uni.showToast({ title: '已放进共同空间', icon: 'success' })
  } catch (error: any) {
    uni.hideLoading()
    uni.showToast({ title: error?.message || '放入失败', icon: 'none' })
  }
}

function chooseImage(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: (result) => resolve(result.tempFilePaths[0] || ''),
      fail: reject,
    })
  })
}

async function chooseCustomBackground() {
  try {
    const filePath = await chooseImage()
    if (!filePath) return
    draftCustomPath.value = filePath
    draftPresetIndex.value = null
  } catch (error: any) {
    if (!String(error?.errMsg || '').includes('cancel')) {
      uni.showToast({ title: error?.message || '选择图片失败', icon: 'none' })
    }
  }
}

function selectPreset(index: number) {
  draftPresetIndex.value = index
  draftCustomPath.value = ''
}

async function confirmBackground() {
  if (!day.value || !hasBackgroundDraft.value) return
  try {
    uni.showLoading({ title: '正在保存背景…', mask: true })
    if (draftPresetIndex.value != null) {
      const index = draftPresetIndex.value
      if (isHoliday.value) await setHolidayPosterPreset(holidayId.value, index)
      else await updateEntry(entryId.value, { backgroundUrl: `builtin:${index}` })
      day.value.backgroundUrl = DEFAULT_POSTERS[index]
    } else {
      const filePath = draftCustomPath.value
      if (isHoliday.value) {
        const compressed = await compressBackgroundImage(filePath)
        const url = await uploadEntryImage(compressed)
        await setHolidayPoster(holidayId.value, url)
        day.value.backgroundUrl = url
      } else {
        const updated = await uploadEntryBackground(entryId.value, filePath)
        day.value.backgroundUrl = entryBackgroundUrl(updated)
      }
    }
    posterPath.value = ''
    showEditor.value = false
    draftPresetIndex.value = null
    draftCustomPath.value = ''
    uni.showToast({ title: '背景已更新', icon: 'success' })
  } catch (error: any) {
    if (!String(error?.errMsg || '').includes('cancel')) {
      uni.showToast({ title: error?.message || '背景更新失败', icon: 'none' })
    }
  } finally {
    uni.hideLoading()
  }
}

function editDay() {
  draftPresetIndex.value = null
  draftCustomPath.value = ''
  showEditor.value = true
}

function openFullEditor() {
  showEditor.value = false
  // 删除后需要越过详情页回到好日子，避免详情页 onShow 再读取已删除的 id。
  uni.navigateTo({ url: `/subpackages/notes/edit?id=${entryId.value}&from=day-detail` })
}

function removeDay() {
  if (!entryId.value || isHoliday.value) return
  uni.showModal({
    title: '删除这个日子？',
    content: '删除后无法恢复。',
    confirmText: '删除',
    confirmColor: '#D9534F',
    success: async (result) => {
      if (!result.confirm) return
      try {
        uni.showLoading({ title: '正在删除…', mask: true })
        await deleteEntry(entryId.value)
        entriesStore.optimisticRemove(entryId.value)
        entriesStore.invalidate(day.value?.ownerType || 'personal', day.value?.spaceId || null)
        showEditor.value = false
        uni.showToast({ title: '已删除', icon: 'success' })
        // 删除的是好日子，应回到对应空间的好日子列表，而不是时光首页。
        const spaceQuery = day.value?.ownerType === 'space' && day.value.spaceId
          ? `?spaceId=${encodeURIComponent(day.value.spaceId)}`
          : ''
        uni.reLaunch({ url: `/subpackages/good-days/index${spaceQuery}` })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '删除失败，请稍后重试', icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    },
  })
}

function getDrawablePath(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const readInfo = (path: string) => uni.getImageInfo({
      src: path,
      success: (result) => resolve(result.path),
      fail: reject,
    })
    // Canvas 只能稳定绘制本地临时文件；远程 COS 图在部分真机上虽能显示，
    // 但会导致 getImageInfo/canvas 导出失败。
    if (/^https?:\/\//.test(src)) {
      uni.downloadFile({
        url: src,
        success: (result) => result.statusCode === 200 && result.tempFilePath
          ? readInfo(result.tempFilePath)
          : reject(new Error('背景图片下载失败')),
        fail: reject,
      })
      return
    }
    readInfo(src)
  })
}

async function renderPoster(): Promise<string> {
  if (!day.value) return Promise.reject(new Error('暂无海报数据'))
  // Canvas 必须等当前页数据与节点都完成首轮渲染后再创建，
  // 否则微信开发者工具会报“Expected updated data”。
  await nextTick()
  return getDrawablePath(background.value).then(
    (imagePath) =>
      new Promise((resolve, reject) => {
        const width = 750
        const height = 1000
        const context = uni.createCanvasContext('dayPosterCanvas')
        context.drawImage(imagePath, 0, 0, width, height)
        context.setFillStyle('rgba(12, 22, 22, 0.30)')
        context.fillRect(0, 0, width, height)
        context.setTextAlign('center')
        context.setFillStyle('#ffffff')
        context.setFontSize(42)
        context.fillText(day.value!.title, width / 2, 225)
        context.setFontSize(28)
        context.fillText(statusText.value, width / 2, 330)
        context.setFontSize(180)
        context.fillText(String(count.value), width / 2, 540)
        context.setFillStyle('rgba(255,255,255,.72)')
        context.fillRect(285, 605, 180, 2)
        context.setFillStyle('#ffffff')
        context.setFontSize(25)
        context.fillText(`${datePrefix.value}${dateText.value}`, width / 2, 675)
        if (day.value!.calendarLabel) {
          context.setFontSize(22)
          context.fillText(day.value!.calendarLabel!, width / 2, 720)
        }
        context.setFontSize(20)
        context.fillText('只我们', width / 2, 930)
        context.draw(false, () => {
          // 给原生 canvas 一帧完成落盘，避免少数真机出现空文件。
          setTimeout(() => {
            uni.canvasToTempFilePath({
              canvasId: 'dayPosterCanvas',
              width,
              height,
              destWidth: 1500,
              destHeight: 2000,
              fileType: 'jpg',
              quality: 0.92,
              success: (result) => {
                if (!result.tempFilePath) return reject(new Error('海报生成失败'))
                posterPath.value = result.tempFilePath
                resolve(result.tempFilePath)
              },
              fail: reject,
            })
          }, 80)
        })
      }),
  )
}

async function savePoster() {
  if (savingPoster.value) return
  savingPoster.value = true
  try {
    const path = posterPath.value || (await renderPoster())
    await saveToAlbum(path)
    uni.showToast({ title: '已保存到相册', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败，请稍后重试', icon: 'none' })
  } finally {
    savingPoster.value = false
  }
}

function saveToAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: async (error: any) => {
        const message = String(error?.errMsg || '')
        if (!/auth deny|authorize no response|permission denied/i.test(message)) {
          reject(error)
          return
        }
        const modal = await uni.showModal({
          title: '需要相册权限',
          content: '允许保存到相册后，才能保存这张日子海报。',
          confirmText: '去设置',
        })
        if (!modal.confirm) return reject(new Error('未允许保存到相册'))
        const settings = await uni.openSetting()
        if (!settings.authSetting?.['scope.writePhotosAlbum']) {
          reject(new Error('未允许保存到相册'))
          return
        }
        uni.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject })
      },
    })
  })
}

onLoad((query: any) => {
  const decode = (value: unknown) => {
    const raw = String(value || '')
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  entryId.value = decode(query?.id)
  holidayId.value = decode(query?.holiday)
  transferOnReady.value = query?.transfer === '1'
})

onShow(() => {
  void loadDay()
})

onUnload(() => {
  if (loadingHintTimer) clearTimeout(loadingHintTimer)
})

onShareAppMessage(() => ({
  title: day.value ? `${day.value.title} · ${statusText.value}${count.value}` : '只我们',
  path: isHoliday.value
    ? `/subpackages/day/share?holiday=${encodeURIComponent(holidayId.value)}`
    : `/subpackages/day/share?id=${encodeURIComponent(entryId.value)}`,
  imageUrl: posterPath.value || background.value,
}))
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(52rpx + env(safe-area-inset-bottom));
  background: var(--dk-bg, #f2f4f3);
  color: var(--dk-ink, #1c2423);
}
/* 共同记录卡片 */
.collab-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 254, 251, 0.08) 42%),
    var(--dk-surface, #fffefb);
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
  margin: 20rpx 0;
  box-shadow:
    0 16rpx 36rpx rgba(47, 111, 106, 0.07),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
}
.collab-left {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 20rpx;
}
.collab-avatars {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}
.collab-avatar {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: var(--dk-feature-brand, #2f6f6a);
  &.owner { background: var(--dk-feature-brand-soft, #e4f0ee); }
  &.partner { background: var(--dk-feature-brand-soft, #e4f0ee); margin-left: -12rpx; }
  &.add { background: #f0f0f0; border: 2rpx dashed #ccc; color: #999; margin-left: -12rpx; font-size: 28rpx; }
  &.space-member { margin-left: -12rpx; border: 3rpx solid var(--dk-surface, #fff); background: var(--dk-feature-brand-soft, #e4f0ee); color: var(--dk-feature-brand, #2f6f6a); }
  &.space-member:first-child { margin-left: 0; }
  &.overflow { margin-left: -12rpx; border: 3rpx solid var(--dk-surface, #fff); background: #eef2f0; color: var(--dk-muted, #6b736f); font-size: 19rpx; }
  image { width: 100%; height: 100%; }
}
.collab-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4rpx;
}
.collab-kicker { color: var(--dk-brand, #2f6f6a); font-size: 20rpx; font-weight: 700; }
.collab-title {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}
.collab-sub {
  overflow: hidden;
  font-size: 22rpx;
  color: #999;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collab-arrow {
  flex-shrink: 0;
  margin-left: 12rpx;
  font-size: 32rpx;
  color: #ccc;
}
.space-day-card { border: 1rpx solid rgba(47, 111, 106, .15); background: linear-gradient(135deg, var(--dk-surface, #fff), var(--dk-brand-soft, #e7f1ee)); }
.legacy-card { background: #faf9f6; }
.legacy-card .collab-kicker { color: #8b7660; }
.transfer-card { border: 1rpx dashed rgba(47, 111, 106, .28); box-shadow: none; }
.state {
  padding-top: 35vh;
  text-align: center;
  color: var(--dk-muted, #6b736f);
}
.loading-placeholder {
  min-height: 100vh;
}
.poster {
  position: relative;
  height: 920rpx;
  overflow: hidden;
  border-radius: 28rpx;
  background: #17312f;
  box-shadow: 0 18rpx 52rpx rgba(20, 33, 31, 0.16);
}
.poster-bg,
.poster-shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.poster-shade {
  background: linear-gradient(180deg, rgba(10, 18, 18, 0.18), rgba(10, 18, 18, 0.31));
}
.poster-copy {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 120rpx 44rpx 64rpx;
  color: #fff;
  text-align: center;
  text-shadow: 0 2rpx 14rpx rgba(0, 0, 0, 0.35);
}
.poster-title {
  max-width: 100%;
  font-size: 42rpx;
  font-weight: 500;
}
.poster-status {
  margin-top: 90rpx;
  font-size: 27rpx;
  letter-spacing: 0.18em;
  opacity: 0.92;
}
.poster-number {
  margin-top: 8rpx;
  font-size: 190rpx;
  font-weight: 300;
  line-height: 1.08;
  letter-spacing: -0.04em;
}
.poster-rule {
  width: 150rpx;
  height: 2rpx;
  margin: 38rpx 0 28rpx;
  background: rgba(255, 255, 255, 0.65);
}
.poster-date,
.poster-calendar {
  font-size: 24rpx;
  opacity: 0.95;
}
.poster-calendar {
  margin-top: 12rpx;
  font-size: 22rpx;
  opacity: 0.78;
}
.actions {
  display: flex;
  gap: 14rpx;
  margin-top: 28rpx;
  padding: 0 8rpx;
}
.action {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  height: 72rpx;
  padding: 0 9rpx;
  color: var(--dk-ink, #1c2423);
  font-family: inherit;
  font-size: 22rpx;
  font-weight: 400;
  line-height: 1.3;
  border: 2rpx solid rgba(47, 111, 106, 0.24);
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(4rpx);
  transition: transform 160ms ease, background 160ms ease;
}
.action::after {
  border: 0;
}
.action-hover {
  background: rgba(255, 255, 255, 0.22);
  transform: translateY(-2rpx) scale(0.97);
}
.action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 30rpx;
  width: 30rpx;
  height: 30rpx;
  margin-right: 5rpx;
  opacity: 0.84;
}
.action-icon image {
  width: 30rpx;
  height: 30rpx;
}
.hint {
  display: block;
  margin-top: 18rpx;
  color: var(--dk-muted, #6b736f);
  font-size: 21rpx;
  text-align: center;
}
.export-canvas {
  position: fixed;
  left: -2000px;
  top: 0;
  width: 750px;
  height: 1000px;
}
.share-sheet-mask {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgba(16, 24, 23, .38);
}
.share-sheet {
  width: 100%;
  padding: 0 0 env(safe-area-inset-bottom);
  border-radius: 24rpx 24rpx 0 0;
  background: var(--dk-bg-soft, #f1f2f2);
  box-sizing: border-box;
  overflow: hidden;
}
.share-sheet-group {
  overflow: hidden;
  border-radius: 24rpx 24rpx 0 0;
  background: var(--dk-surface, #fff);
}
.share-sheet-action,
.share-sheet-cancel {
  width: 100%;
  height: 102rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: var(--dk-ink, #1c2423);
  background: var(--dk-surface, #fff);
  font-size: 30rpx;
  font-weight: 400;
  line-height: 102rpx;
}
.share-sheet-action::after,
.share-sheet-cancel::after {
  border: 0;
}
.share-sheet-action + .share-sheet-action {
  border-top: 1rpx solid var(--dk-line, #e3e7e5);
}
.share-sheet-cancel {
  margin-top: 12rpx;
}
.sheet-mask {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgba(15, 22, 21, 0.42);
}
.sheet {
  width: 100%;
  padding: 36rpx 30rpx calc(34rpx + env(safe-area-inset-bottom));
  border-radius: 36rpx 36rpx 0 0;
  background: var(--dk-surface, #fff);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.sheet-title {
  display: block;
  font-size: 31rpx;
  font-weight: 600;
}
.sheet-subtitle {
  display: block;
  margin-top: 7rpx;
  color: var(--dk-muted, #6b736f);
  font-size: 21rpx;
}
.sheet-close {
  padding: 10rpx 0 10rpx 24rpx;
  color: var(--dk-brand, #2f7f78);
  font-size: 26rpx;
}
.editor-preview {
  position: relative;
  height: 164rpx;
  overflow: hidden;
  border-radius: 20rpx;
  background: #dfe6e3;
}
.editor-preview image,
.editor-preview-shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.editor-preview-shade {
  background: rgba(12, 25, 23, 0.28);
}
.editor-preview text {
  position: absolute;
  left: 26rpx;
  bottom: 24rpx;
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.25);
}
.section-label {
  display: block;
  margin: 28rpx 0 16rpx;
  color: var(--dk-ink, #1c2423);
  font-size: 25rpx;
  font-weight: 600;
}
.preset-scroll {
  width: calc(100% + 60rpx);
  margin-left: -30rpx;
  white-space: nowrap;
}
.preset-list {
  display: flex;
  gap: 16rpx;
  padding: 0 30rpx 4rpx;
}
.preset-card {
  flex: 0 0 178rpx;
}
.preset-card image {
  display: block;
  width: 178rpx;
  height: 220rpx;
  border: 2rpx solid transparent;
  border-radius: 16rpx;
  background: #e8ecea;
}
.preset-card.selected image {
  border-color: var(--dk-brand, #2f7f78);
  box-shadow: 0 0 0 4rpx var(--dk-brand-soft, #e4f0ee);
}
.preset-card.selected text {
  color: var(--dk-brand, #2f7f78);
  font-weight: 600;
}
.preset-card text {
  display: block;
  margin-top: 9rpx;
  color: var(--dk-muted, #6b736f);
  font-size: 21rpx;
  text-align: center;
}
.upload-button {
  margin-top: 28rpx;
  border-radius: 16rpx;
  color: #fff;
  background: var(--dk-brand, #2f7f78);
  font-size: 27rpx;
}
.upload-button::after {
  border: 0;
}
.confirm-button {
  margin-top: 16rpx;
  border-radius: 16rpx;
  color: var(--dk-brand, #2f7f78);
  background: var(--dk-brand-soft, #e4f0ee);
  font-size: 27rpx;
}
.confirm-button[disabled] {
  color: var(--dk-muted, #6b736f);
  background: var(--dk-bg-soft, #eef2f1);
}
.confirm-button::after {
  border: 0;
}
.more-edit-button {
  margin-top: 16rpx;
  border-radius: 16rpx;
  color: var(--dk-ink, #1c2423);
  background: var(--dk-bg-soft, #eef2f1);
  font-size: 26rpx;
}
.more-edit-button::after {
  border: 0;
}
.quick-delete-button {
  margin-top: 12rpx;
}
.sheet-hint {
  display: block;
  margin-top: 20rpx;
  color: var(--dk-muted, #6b736f);
  font-size: 21rpx;
  text-align: center;
}
</style>
