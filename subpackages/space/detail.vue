<template>
  <view class="page" :style="pageStyle">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!space" class="state">
      <text class="state-text">{{ loadError || '时光圈不存在' }}</text>
      <button class="invite retry" @tap="loadSpace">重新加载</button>
    </view>
    <template v-else>
      <view v-if="space.dissolvedAt" class="dissolved-state">
        <view class="dissolved-cover">
          <image v-if="space.coverUrl" :src="space.coverUrl" mode="aspectFill" />
          <view v-else class="dissolved-cover-fallback" />
          <view class="dissolved-cover-shade" />
          <view class="dissolved-mark">已解除</view>
        </view>
        <view class="dissolved-copy">
          <text class="dissolved-space-name">{{ space.name }}</text>
          <text class="dissolved-title">{{ dissolutionText.title }}</text>
          <text class="dissolved-desc">{{ dissolutionText.desc }}</text>
          <text class="dissolved-note">恢复期内共同记录会安全保留；到期后空间及其中内容将被永久删除。</text>
        </view>
        <button v-if="isDissolver" class="restore-space" :loading="restoring" :disabled="restoring" @tap="restoreCurrentSpace">恢复这个空间</button>
      </view>

      <template v-else>
      <view class="hero">
        <view class="hero-cover" @tap="onCoverTap">
          <template v-if="space.coverUrl">
            <image class="hero-cover-subject" :src="space.coverUrl" mode="aspectFill" />
          </template>
          <view v-else class="hero-cover-fallback" />
          <text v-if="isOwner" class="hero-cover-action">{{ coverUpdating ? '上传中…' : (space.coverUrl ? '更换封面' : '＋ 添加共同封面') }}</text>
        </view>
        <view class="hero-top">
          <view class="hero-copy">
            <view class="space-title-row">
              <text class="title">{{ space.name }}</text>
              <view v-if="isOwner" class="rename-entry" role="button" aria-label="修改时光圈名称" @tap.stop="openNameEditor">
                <image src="/static/actions/write.png" mode="aspectFit" />
              </view>
            </view>
            <text class="subtitle">{{ space.isOfficial ? `${space.memberCount || 1} 位成员 · 共同 ${space.recordCount} 条回忆 · ${space.commitmentCount} 个约定` : `共同 ${space.recordCount} 条回忆 · ${space.commitmentCount} 个约定 · 第 ${togetherDays} 天` }}</text>
          </view>
          <text class="detail-mark">{{ space.isOfficial ? '官方公开' : '时光圈' }}</text>
        </view>
        <view v-if="space.keywords.length" class="tags">
          <text v-for="tag in space.keywords" :key="tag" class="tag">#{{ tag }}</text>
        </view>
        <scroll-view scroll-x class="hero-members-scroll" :show-scrollbar="false">
          <view class="hero-members">
            <view v-for="member in space.members || []" :key="member.id" class="hero-person" @tap="onMemberTap(member)">
              <view class="hero-avatar">
                <image v-if="member.avatarUrl" :src="member.avatarUrl" mode="aspectFill" />
                <text v-else>{{ member.nickname.slice(0, 1) || '人' }}</text>
                <view v-if="member.mood" class="hero-mood">
                  <MoodIcon :mood="member.mood" size="badge" />
                </view>
              </view>
              <text class="hero-person-name">{{ String(member.userId) === myUserId ? '我' : member.nickname }}</text>
              <text class="hero-person-role">{{ space.isOfficial && (member.role === 'owner' || member.role === 'admin') ? '管理员' : member.role === 'owner' ? '创建者' : (member.mood ? moodLabel(member.mood) : '成员') }}</text>
            </view>
            <view v-if="publicMemberOverflow" class="hero-person">
              <view class="hero-avatar public-member-overflow">+{{ publicMemberOverflow }}</view>
              <text class="hero-person-name">更多成员</text>
              <text class="hero-person-role">已加入</text>
            </view>
            <button v-if="isOwner && !space.isOfficial && shareInvite" class="hero-person hero-invite-person" open-type="share" hover-class="invite-hover">
              <view class="hero-avatar hero-add">+</view>
              <text class="hero-person-name">邀请加入</text>
              <text class="hero-person-role">微信卡片</text>
            </button>
            <button v-else-if="isOwner && !space.isOfficial" class="hero-person hero-invite-person" :disabled="inviting" @tap="prepareInvite">
              <view class="hero-avatar hero-add">{{ inviting ? '…' : '+' }}</view>
              <text class="hero-person-name">{{ inviting ? '准备中' : '邀请加入' }}</text>
              <text class="hero-person-role">微信卡片</text>
            </button>
          </view>
        </scroll-view>
      </view>

      <view class="section feature-rows">
        <text class="section-title feature-title">圈子功能</text>
        <view class="feature-row" @tap="createCommitment"><text class="row-title">发起约定</text></view>
        <view class="feature-row" @tap="openQuiz"><text class="row-title">默契测试</text></view>
        <view class="feature-row" @tap="weeklyReview"><text class="row-title">本周回顾</text></view>
        <view class="feature-row" @tap="openAnnualAlbum"><text class="row-title">年度时光册</text></view>
      </view>

      <view class="section timeline-preview-section">
        <view class="section-heading">
          <text class="section-title preview-title">最近留下</text>
          <button v-if="records.length > 3" class="section-more" @tap="openFullTimeline">查看全部 <text>›</text></button>
        </view>
        <view v-if="recentRecords.length" class="record-list">
          <view v-for="record in recentRecords" :key="record.id" class="record-row" @tap="openRecord(record)">
            <image v-if="record.images?.[0]" class="record-cover" :src="record.images[0]" mode="aspectFill" />
            <view class="record-copy">
              <text class="record-title">{{ recordTitle(record) }}</text>
              <view class="record-meta-row"><text class="record-kind">{{ recordKindLabel(record) }}</text><text class="record-meta">{{ record.eventDate }}</text></view>
            </view>
            <text class="record-go">›</text>
          </view>
        </view>
        <view v-else class="preview-empty"><text class="preview-empty-mark">✦</text><text class="preview-empty-title">还没有共同内容</text><text class="preview-empty-desc">从一条回忆，或一次未来的约定开始。</text></view>
      </view>

      <view class="section">
        <view class="map-heading">
          <view>
            <text class="section-title map-title">圈子地图</text>
            <text v-if="mapPoints.length" class="map-summary">{{ mapPoints.length }} 个共同去过的地方</text>
          </view>
          <text v-if="mapPoints.length" class="map-hint">可缩放 · 点标记查看</text>
        </view>
        <view v-if="mapPoints.length" class="circle-map-wrap">
          <map
            class="circle-map"
            :latitude="mapCenter.latitude"
            :longitude="mapCenter.longitude"
            :scale="mapScale"
            :markers="mapMarkers"
            :include-points="mapIncludePoints"
            :enable-zoom="true"
            :enable-scroll="true"
            :show-location="false"
            @markertap="onMapMarkerTap"
          />
        </view>
        <view v-else class="map-empty">
          <view class="map-empty-mark"><text>⌖</text></view>
          <text class="map-empty-title">还没有共同足迹</text>
          <text class="map-empty-desc">保存带定位的共同记录后，这里会慢慢亮起来。</text>
        </view>
        <text v-if="legacyLocationCount" class="map-legacy-note">另有 {{ legacyLocationCount }} 条旧记录只有地点名称，重新选择地点后即可显示。</text>
      </view>

      <template v-if="space.isOfficial">
        <view v-if="isOfficialModerator" class="management-entry" @tap="openOfficialModeration">
          <view class="management-entry-copy">
            <text class="management-entry-title">管理中心</text>
            <text class="management-entry-desc">{{ isOwner ? '内容与成员管理' : '处理举报与管理公开内容' }}</text>
          </view>
          <text class="management-entry-arrow">›</text>
        </view>
        <button v-if="!isOwner" class="leave-official" @tap="leaveOfficialSpace">退出官方体验圈</button>
      </template>
      <button v-else class="dissolve-space" @tap="dissolveCurrentSpace">解除共同记录空间</button>
      </template>
    </template>

    <view v-if="nameEditorOpen" class="name-editor-mask" @tap="closeNameEditor">
      <view class="name-editor-sheet" @tap.stop>
        <view class="name-editor-head">
          <view><text class="name-editor-title">修改时光圈名称</text><text class="name-editor-sub">成员看到的空间名称会同步更新</text></view>
          <text class="name-editor-close" @tap="closeNameEditor">×</text>
        </view>
        <view class="name-editor-field">
          <input
            v-model="spaceNameDraft"
            class="name-editor-input"
            maxlength="24"
            :focus="nameEditorOpen"
            placeholder="给时光圈取个名字"
            confirm-type="done"
            @confirm="saveSpaceName"
          />
          <text class="name-editor-count">{{ spaceNameDraft.length }}/24</text>
        </view>
        <button class="name-editor-save" :disabled="!canSaveSpaceName || nameUpdating" :loading="nameUpdating" @tap="saveSpaceName">保存</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { dissolveSpace, getSpace, inviteSpaceMember, leaveSpace, removeSpaceMember, restoreSpace, setOfficialSpaceMemberRole, updateSpace, type Space, type SpaceMember, type SpaceMood } from '@/services/spaces'
import { listEntries, type Entry } from '@/services/entries'
import { displayDiaryBody } from '@/services/systemEntries'
import { getCachedUserId } from '@/services/auth'
import { uploadSpaceCover } from '@/subpackages/shared/services/upload'
import { hasValidCoords } from '@/subpackages/shared/services/location'
import { spaceDissolutionLines } from '@/utils/spaceLifecycle'
import { moodLabelForValue } from '@/shared/mood'
import MoodIcon from '@/components/MoodIcon.vue'
import { setPreferredSpaceId, setTimelineEntryAnchor } from '@/services/spacePreference'
import { trackProductEvent } from '@/services/analytics'

const { pageStyle } = useThemePage()
const loading = ref(true)
const spaceId = ref('')
const space = ref<Space | null>(null)
const loadError = ref('')
const inviting = ref(false)
const coverUpdating = ref(false)
const restoring = ref(false)
const nameEditorOpen = ref(false)
const spaceNameDraft = ref('')
const nameUpdating = ref(false)
const shareInvite = ref<{ inviteCode: string; inviteUrl: string; expiresAt?: string } | null>(null)
const inviteOnReady = ref(false)
const reviewOnReady = ref(false)
const records = ref<Entry[]>([])
const myUserId = computed(() => String(getCachedUserId() || ''))
const isOwner = computed(() => String(space.value?.ownerId || '') === myUserId.value)
const isOfficialModerator = computed(() => !!space.value?.isOfficial && (isOwner.value || space.value.currentUserRole === 'admin'))
const publicMemberOverflow = computed(() => {
  if (!space.value?.isOfficial) return 0
  const shown = Math.min(space.value.members?.length || 0, 3)
  return Math.max(0, Number(space.value.memberCount || shown) - shown)
})
const isDissolver = computed(() => String(space.value?.dissolvedByUserId || '') === myUserId.value)
const dissolutionText = computed(() => spaceDissolutionLines(space.value || {}))
const canSaveSpaceName = computed(() => {
  const name = spaceNameDraft.value.trim()
  return !!name && name !== space.value?.name
})

const togetherDays = computed(() => {
  const created = new Date(space.value?.createdAt || '')
  if (Number.isNaN(created.getTime())) return 1
  return Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000) + 1)
})
const recentRecords = computed(() => records.value.slice(0, 3))

interface CircleMapPoint {
  markerId: number
  latitude: number
  longitude: number
  location: string
  entries: Entry[]
}

const mapPoints = computed<CircleMapPoint[]>(() => {
  const grouped = new Map<string, Omit<CircleMapPoint, 'markerId'>>()
  records.value.forEach((entry) => {
    if (!hasValidCoords(entry.locationLat ?? undefined, entry.locationLng ?? undefined)) return
    const latitude = Number(entry.locationLat)
    const longitude = Number(entry.locationLng)
    // 同一位置的多条记录只展示一个标记，避免图钉完全重叠。
    const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`
    const existing = grouped.get(key)
    if (existing) {
      existing.entries.push(entry)
      return
    }
    grouped.set(key, {
      latitude,
      longitude,
      location: entry.location?.trim() || '共同足迹',
      entries: [entry],
    })
  })
  return [...grouped.values()].map((point, index) => ({ ...point, markerId: index + 1 }))
})

const mapCenter = computed(() => {
  if (!mapPoints.value.length) return { latitude: 39.9042, longitude: 116.4074 }
  const total = mapPoints.value.reduce(
    (sum, point) => ({ latitude: sum.latitude + point.latitude, longitude: sum.longitude + point.longitude }),
    { latitude: 0, longitude: 0 },
  )
  return {
    latitude: total.latitude / mapPoints.value.length,
    longitude: total.longitude / mapPoints.value.length,
  }
})

const mapScale = computed(() => mapPoints.value.length === 1 ? 15 : 11)
const mapIncludePoints = computed(() => mapPoints.value.map(({ latitude, longitude }) => ({ latitude, longitude })))
const mapMarkers = computed(() => mapPoints.value.map((point) => ({
  id: point.markerId,
  latitude: point.latitude,
  longitude: point.longitude,
  iconPath: '/static/map-pin.png',
  width: 28,
  height: 36,
  callout: {
    content: point.entries.length > 1 ? `${point.location} · ${point.entries.length} 条` : point.location,
    color: '#24312f',
    fontSize: 11,
    borderRadius: 7,
    bgColor: '#ffffff',
    padding: 6,
    display: 'ALWAYS',
    textAlign: 'center',
  },
})))
const legacyLocationCount = computed(() => records.value.filter((entry) => (
  !!entry.location?.trim() && !hasValidCoords(entry.locationLat ?? undefined, entry.locationLng ?? undefined)
)).length)

function moodLabel(mood: SpaceMood) {
  return moodLabelForValue(mood)
}

function onMemberTap(member: SpaceMember) {
  if (space.value?.isOfficial) {
    if (isOwner.value && member.userId !== myUserId.value) manageOfficialMember(member)
    return
  }
  manageMember(member.userId, member.nickname)
}

function manageOfficialMember(member: SpaceMember) {
  const makeAdmin = member.role !== 'admin'
  uni.showModal({
    title: makeAdmin ? `设为管理员？` : `取消管理员？`,
    content: makeAdmin
      ? `${member.nickname} 将可以查看举报、隐藏违规内容并限制成员公开发布。`
      : `${member.nickname} 将恢复为普通成员，不再拥有内容管理权限。`,
    confirmText: makeAdmin ? '设为管理员' : '取消管理员',
    success: async ({ confirm }) => {
      if (!confirm) return
      try {
        await setOfficialSpaceMemberRole(spaceId.value, member.userId, makeAdmin ? 'admin' : 'member')
        await loadSpace()
        uni.showToast({ title: makeAdmin ? '已设为管理员' : '已取消管理员', icon: 'success' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '设置失败', icon: 'none' })
      }
    },
  })
}

function openNameEditor() {
  if (!isOwner.value || !space.value) return
  spaceNameDraft.value = space.value.name
  nameEditorOpen.value = true
}

function closeNameEditor() {
  if (nameUpdating.value) return
  nameEditorOpen.value = false
}

async function saveSpaceName() {
  if (!canSaveSpaceName.value || nameUpdating.value) return
  const name = spaceNameDraft.value.trim()
  if (!name) {
    uni.showToast({ title: '请输入时光圈名称', icon: 'none' })
    return
  }
  nameUpdating.value = true
  try {
    space.value = await updateSpace(spaceId.value, { name })
    spaceNameDraft.value = space.value.name
    nameEditorOpen.value = false
    uni.showToast({ title: '名称已更新', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '名称更新失败', icon: 'none' })
  } finally {
    nameUpdating.value = false
  }
}

function chooseSpaceCover() {
  if (coverUpdating.value) return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async ({ tempFilePaths }) => {
      const image = tempFilePaths[0]
      if (!image) return
      coverUpdating.value = true
      uni.showLoading({ title: '正在更新封面' })
      try {
        const coverUrl = await uploadSpaceCover(image)
        space.value = await updateSpace(spaceId.value, { coverUrl })
        uni.hideLoading()
        uni.showToast({ title: '封面已更新', icon: 'success' })
      } catch (error: any) {
        uni.hideLoading()
        uni.showToast({ title: error?.message || '封面更新失败', icon: 'none' })
      } finally {
        coverUpdating.value = false
      }
    },
  })
}

function clearSpaceCover() {
  uni.showModal({
    title: '恢复默认封面？',
    content: '当前共同封面会被移除，时光圈将恢复主题渐变封面。',
    confirmText: '恢复默认',
    success: async ({ confirm }) => {
      if (!confirm || coverUpdating.value) return
      coverUpdating.value = true
      try {
        space.value = await updateSpace(spaceId.value, { coverUrl: '' })
        uni.showToast({ title: '已恢复默认封面', icon: 'success' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '操作失败', icon: 'none' })
      } finally {
        coverUpdating.value = false
      }
    },
  })
}

function onCoverTap() {
  if (!isOwner.value || coverUpdating.value) return
  if (!space.value?.coverUrl) {
    chooseSpaceCover()
    return
  }
  uni.showActionSheet({
    itemList: ['更换共同封面', '恢复默认封面'],
    success: ({ tapIndex }) => tapIndex === 0 ? chooseSpaceCover() : clearSpaceCover(),
  })
}

function manageMember(userId: string, nickname: string) {
  if (!isOwner.value || userId === myUserId.value) return
  uni.showModal({ title: `移除 ${nickname}？`, content: '移除后对方将不能再查看圈内内容；已经共同留下的记录会保留。', confirmText: '移除', confirmColor: '#c94c4c', success: async ({ confirm }) => {
    if (!confirm) return
    try { await removeSpaceMember(spaceId.value, userId); await loadSpace(); uni.showToast({ title: '成员已移除', icon: 'success' }) }
    catch (error: any) { uni.showToast({ title: error?.message || '移除失败', icon: 'none' }) }
  } })
}

function dissolveCurrentSpace() {
  uni.showModal({
    title: '解除共同记录空间？',
    content: '任一成员都可以解除。解除后双方将不能继续查看或记录，7 天内仅你可以恢复；到期后空间及其中内容将被永久删除。',
    confirmText: '确认解除',
    confirmColor: '#c94c4c',
    success: async ({ confirm }) => {
      if (!confirm) return
      try {
        space.value = await dissolveSpace(spaceId.value)
        records.value = []
        shareInvite.value = null
        uni.showToast({ title: '空间已解除', icon: 'success' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '解除失败', icon: 'none' })
      }
    },
  })
}

async function restoreCurrentSpace() {
  if (restoring.value) return
  restoring.value = true
  try {
    space.value = await restoreSpace(spaceId.value)
    uni.showToast({ title: '空间已恢复', icon: 'success' })
    await loadSpace()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '恢复失败', icon: 'none' })
  } finally {
    restoring.value = false
  }
}

async function loadSpace() {
  if (!spaceId.value) {
    loadError.value = '缺少时光圈 ID'
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const loadedSpace = await getSpace(spaceId.value)
    space.value = loadedSpace
    records.value = []
    if (loadedSpace.dissolvedAt) {
      inviteOnReady.value = false
      reviewOnReady.value = false
      shareInvite.value = null
      return
    }
    const loadedEntries = await listEntries({ ownerType: 'space', spaceId: spaceId.value, pageSize: loadedSpace.isOfficial ? 50 : 100 })
    records.value = loadedEntries.list
    if (isOwner.value && !loadedSpace.isOfficial) void prepareInvite(inviteOnReady.value)
    inviteOnReady.value = false
    if (reviewOnReady.value) {
      reviewOnReady.value = false
      weeklyReview()
    }
  } catch (error: any) {
    // 加载失败要如实暴露，不能再退回假数据让用户以为进了圈子。
    space.value = null
    loadError.value = error?.message || '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function createCommitment() {
  uni.navigateTo({
    url: `/subpackages/notes/edit?type=anniversary&from=timeline&entryKind=commitment&ownerType=space&spaceId=${encodeURIComponent(spaceId.value)}`,
  })
}

function openOfficialModeration() {
  uni.navigateTo({ url: `/subpackages/space/moderation?spaceId=${encodeURIComponent(spaceId.value)}` })
}

function leaveOfficialSpace() {
  uni.showModal({
    title: '退出官方体验圈？',
    content: '退出后将不再看到体验圈内容；你自己公开留下的记录仍会保留。之后可以随时重新加入。',
    cancelText: '继续体验',
    confirmText: '退出',
    success: async ({ confirm }) => {
      if (!confirm) return
      try {
        await leaveSpace(spaceId.value)
        void trackProductEvent('official_space_left', { source: 'official_detail' })
        setPreferredSpaceId(null)
        uni.showToast({ title: '已退出体验圈', icon: 'success' })
        setTimeout(() => uni.switchTab({ url: '/pages/timeline/index' }), 300)
      } catch (error: any) {
        uni.showToast({ title: error?.message || '退出失败，请稍后再试', icon: 'none' })
      }
    },
  })
}

function openQuiz() {
  uni.navigateTo({ url: `/subpackages/quiz/index?spaceId=${encodeURIComponent(spaceId.value)}` })
}

async function prepareInvite(showFailure = true) {
  if (shareInvite.value) return
  if (inviting.value) return
  inviting.value = true
  try {
    shareInvite.value = await inviteSpaceMember(spaceId.value)
  } catch (error: any) {
    if (showFailure) uni.showToast({ title: error?.message || '邀请卡准备失败，请重试', icon: 'none' })
  } finally {
    inviting.value = false
  }
}

function weeklyReview() {
  uni.navigateTo({
    url: `/subpackages/review/weekly?ownerType=space&spaceId=${encodeURIComponent(spaceId.value)}`,
  })
}

function openAnnualAlbum() {
  uni.navigateTo({ url: `/subpackages/space/album?spaceId=${encodeURIComponent(spaceId.value)}` })
}

function recordTitle(item: Entry) {
  return item.type === 'diary' ? displayDiaryBody(item.body || '').split(/\n/)[0]?.slice(0, 30) || '共同回忆' : item.title
}

function recordKind(item: Entry) {
  if (item.isCapsule || item.entryKind === 'capsule') return 'capsule'
  if (item.entryKind === 'commitment') return 'commitment'
  if (item.type === 'anniversary') return 'day'
  if (item.type === 'todo') return 'todo'
  return 'memory'
}

function recordKindLabel(item: Entry) {
  const labels = { capsule: '时间胶囊', commitment: '共同约定', day: '好日子', todo: '待办', memory: '共同回忆' }
  return labels[recordKind(item)]
}

function openFullTimeline() {
  setPreferredSpaceId(spaceId.value)
  setTimelineEntryAnchor('past')
  uni.switchTab({ url: '/pages/timeline/index' })
}

function openRecord(item: Entry) {
  if (item.isCapsule && !item.capsuleUnlocked) uni.navigateTo({ url: `/subpackages/capsule/locked?id=${encodeURIComponent(item.id)}` })
  else if (item.type !== 'diary' && item.entryKind === 'commitment') uni.navigateTo({ url: `/subpackages/commitment/detail?id=${encodeURIComponent(item.id)}` })
  else uni.navigateTo({ url: `/subpackages/notes/edit?id=${encodeURIComponent(item.id)}` })
}

function onMapMarkerTap(event: { detail?: { markerId?: number | string } }) {
  const markerId = Number(event.detail?.markerId)
  const point = mapPoints.value.find((item) => item.markerId === markerId)
  if (!point) return
  if (point.entries.length === 1) {
    openRecord(point.entries[0])
    return
  }
  const available = point.entries.slice(0, 6)
  uni.showActionSheet({
    title: point.location,
    itemList: available.map((entry) => recordTitle(entry)),
    success: ({ tapIndex }) => {
      const entry = available[tapIndex]
      if (entry) openRecord(entry)
    },
  })
}

onLoad((query: any) => {
  spaceId.value = String(query?.spaceId || query?.id || '').trim()
  inviteOnReady.value = query?.invite === '1'
  reviewOnReady.value = query?.review === '1'
  void loadSpace()
})

onShareAppMessage(() => {
  const invitation = shareInvite.value
  if (!invitation) {
    return { title: '只我们｜世界很大，这里只我们', path: '/pages/timeline/index' }
  }
  const spaceName = space.value?.name?.trim() || '一个时光圈'
  const shareCard: { title: string; path: string; imageUrl?: string } = {
    title: `邀请你加入「${spaceName}」｜把我们的生活留在这里`,
    path: `/subpackages/space/join?code=${encodeURIComponent(invitation.inviteCode)}`,
  }
  if (space.value?.coverUrl) shareCard.imageUrl = space.value.coverUrl
  return shareCard
})
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 32rpx; background: var(--dk-bg); color: var(--dk-ink); }
.leave-official{width:auto;height:62rpx;margin:8rpx auto 24rpx;padding:0 24rpx;border:0;color:var(--dk-muted);background:transparent;font-size:21rpx;line-height:62rpx}.leave-official::after{border:0}.management-entry{display:flex;min-height:100rpx;margin:16rpx 0 28rpx;padding:20rpx 24rpx;align-items:center;border:1rpx solid var(--dk-line);border-radius:24rpx;background:var(--dk-surface);box-sizing:border-box}.management-entry-copy{display:flex;min-width:0;flex:1;flex-direction:column}.management-entry-title{color:var(--dk-ink);font-size:25rpx;font-weight:700}.management-entry-desc{margin-top:6rpx;color:var(--dk-muted);font-size:20rpx}.management-entry-arrow{flex-shrink:0;color:var(--dk-muted);font-size:36rpx;font-weight:300}.public-member-overflow{font-size:20rpx}
.state { padding: 120rpx 0; text-align: center; color: var(--dk-muted); font-size: var(--dk-fs-body, 30rpx); }
.state-text { display: block; }
.retry { margin: 24rpx auto 0; }
.hero,.section { margin-bottom: 24rpx; padding: 28rpx; border:1rpx solid var(--dk-line); border-radius: 28rpx; background: var(--dk-surface); box-shadow: 0 8rpx 24rpx rgba(24,42,39,.04); }
.hero { overflow: hidden; }
.hero-cover { position:relative;width:calc(100% + 56rpx);height:340rpx;margin:-28rpx -28rpx 26rpx;overflow:hidden;background:linear-gradient(145deg,#b5d5cd,#dae6df 50%,#ecd8b1)}.hero-cover image,.hero-cover-fallback{display:block;width:100%;height:100%}.hero-cover-fallback{background:radial-gradient(circle at 18% 15%,rgba(255,255,255,.52),transparent 34%),radial-gradient(circle at 88% 90%,rgba(255,231,184,.55),transparent 40%),linear-gradient(145deg,#b5d5cd,#dae6df 50%,#ecd8b1)}.hero-cover-action{position:absolute;z-index:2;right:20rpx;bottom:18rpx;padding:9rpx 16rpx;border-radius:999rpx;color:#fff;background:rgba(20,38,35,.52);font-size:21rpx;font-weight:650}
.hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.hero-copy { min-width:0;flex:1; }
.space-title-row { display:flex;min-width:0;align-items:center;gap:8rpx; }
.title { display:block;min-width:0;overflow:hidden;flex:0 1 auto;font-size:var(--dk-fs-title,36rpx);font-weight:750;line-height:1.25;text-overflow:ellipsis;white-space:nowrap; }
.rename-entry { display:flex;width:52rpx;height:52rpx;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%; }
.rename-entry image { width:30rpx;height:30rpx;opacity:.84; }
.rename-entry:active { background:var(--dk-brand-soft); }
.subtitle { display: block; margin-top: 10rpx; color: var(--dk-muted); font-size: var(--dk-fs-meta, 25rpx); }
.detail-mark{flex-shrink:0;padding:8rpx 14rpx;border-radius:999rpx;color:var(--dk-brand);background:var(--dk-brand-soft);font-size:21rpx;font-weight:700}
.invite { flex-shrink: 0; height: 62rpx; margin: 0; padding: 0 24rpx; border: 0; border-radius: 999rpx; background: var(--dk-brand-soft); color: var(--dk-brand); font-size: 25rpx; line-height: 62rpx; }
.invite-hover { opacity: .78; }
.invite::after { border: 0; }
.tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 24rpx; }
.tag { padding: 7rpx 14rpx; border-radius: 999rpx; background: var(--dk-brand-soft); color: var(--dk-brand); font-size: 23rpx; }
.hero-members-scroll{width:100%;margin-top:28rpx;white-space:nowrap}.hero-members{display:inline-flex;align-items:flex-start;gap:24rpx;min-width:100%;padding:2rpx 2rpx 4rpx}.hero-person{display:flex;width:92rpx;min-width:92rpx;margin:0;padding:0;flex-direction:column;align-items:center;border:0;background:transparent;line-height:normal}.hero-person::after{border:0}.hero-avatar{position:relative;display:flex;width:72rpx;height:72rpx;align-items:center;justify-content:center;overflow:visible;border:3rpx solid var(--dk-surface);border-radius:50%;color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);font-size:24rpx;font-weight:750;box-shadow:0 5rpx 15rpx rgba(26,50,46,.09)}.hero-avatar image{width:100%;height:100%;overflow:hidden;border-radius:50%}.hero-mood{position:absolute;right:-8rpx;bottom:-5rpx;display:flex;width:30rpx;height:30rpx;align-items:center;justify-content:center;border:3rpx solid var(--dk-surface);border-radius:50%;background:var(--dk-surface);font-size:18rpx}.hero-person-name{display:block;width:100%;margin-top:9rpx;overflow:hidden;color:var(--dk-ink);font-size:20rpx;font-weight:650;text-align:center;text-overflow:ellipsis;white-space:nowrap}.hero-person-role{display:block;width:100%;margin-top:3rpx;overflow:hidden;color:var(--dk-muted);font-size:17rpx;text-align:center;text-overflow:ellipsis;white-space:nowrap}.hero-add{border-style:dashed;background:transparent;font-size:34rpx;font-weight:400}.hero-invite-person{height:auto!important;line-height:normal!important}
.section-title { display: block; margin-bottom: 18rpx; color: var(--dk-muted); font-size: var(--dk-fs-meta, 25rpx); font-weight: 650; }
.dissolve-space{height:72rpx;margin:34rpx auto 12rpx;border:0;color:#b64949;background:transparent;font-size:24rpx;line-height:72rpx}.dissolve-space::after{border:0}
.dissolved-state{overflow:hidden;margin-top:18rpx;border:1rpx solid var(--dk-line);border-radius:30rpx;background:var(--dk-surface);box-shadow:0 14rpx 40rpx rgba(24,42,39,.06)}
.dissolved-cover{position:relative;height:280rpx;overflow:hidden}.dissolved-cover image,.dissolved-cover-fallback,.dissolved-cover-shade{position:absolute;inset:0;width:100%;height:100%}.dissolved-cover-fallback{background:radial-gradient(circle at 20% 18%,rgba(255,255,255,.55),transparent 34%),linear-gradient(145deg,#b5d5cd,#e9d9b9)}.dissolved-cover-shade{background:rgba(28,36,35,.25)}.dissolved-mark{position:absolute;right:24rpx;bottom:22rpx;padding:9rpx 18rpx;border-radius:999rpx;color:#fff;background:rgba(28,36,35,.6);font-size:22rpx;font-weight:700}
.dissolved-copy{padding:36rpx 30rpx 28rpx;text-align:center}.dissolved-space-name{display:block;color:var(--dk-muted);font-size:24rpx}.dissolved-title{display:block;margin-top:18rpx;color:var(--dk-ink);font-size:31rpx;font-weight:750;line-height:1.45}.dissolved-desc{display:block;margin-top:10rpx;color:#b2675d;font-size:25rpx;line-height:1.5}.dissolved-note{display:block;margin-top:26rpx;color:var(--dk-muted);font-size:22rpx;line-height:1.65}.restore-space{height:82rpx;margin:0 30rpx 32rpx;border:0;border-radius:22rpx;color:#fff;background:var(--dk-brand);font-size:27rpx;font-weight:700;line-height:82rpx}.restore-space::after{border:0}
.feature-rows{padding-top:24rpx;padding-bottom:8rpx}.feature-title{margin-bottom:4rpx}.feature-row{position:relative;display:flex;align-items:center;min-height:92rpx;padding-right:34rpx;border-top:1rpx solid var(--dk-line)}.feature-title+.feature-row{border-top:0}.feature-row::after{position:absolute;right:5rpx;width:13rpx;height:13rpx;border-top:2rpx solid var(--dk-muted);border-right:2rpx solid var(--dk-muted);content:'';transform:rotate(45deg);opacity:.8}
.row-title { display: block; font-size: var(--dk-fs-body, 30rpx); font-weight: 500; }
.timeline-preview-section{padding-top:24rpx;padding-bottom:12rpx}.section-heading{display:flex;margin-bottom:6rpx;align-items:center;justify-content:space-between;gap:20rpx}.preview-title{margin-bottom:0;color:var(--dk-ink);font-size:28rpx}.section-more{height:52rpx;margin:0;padding:0 4rpx;border:0;color:var(--dk-brand);background:transparent;font-size:22rpx;line-height:52rpx}.section-more::after{border:0}.section-more text{margin-left:3rpx;font-size:28rpx}.record-row { display: flex; align-items: center; gap: 16rpx; min-height: 104rpx; padding: 17rpx 0; border-top: 1rpx solid var(--dk-line); }
.record-row:first-child { border-top: 0; }
.record-cover { width: 76rpx; height: 76rpx; flex-shrink: 0; border-radius: 17rpx; }
.record-copy { flex: 1; min-width: 0; }
.record-title { display: block; overflow: hidden; color: var(--dk-ink); font-size: var(--dk-fs-label, 28rpx); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.record-meta-row{display:flex;margin-top:8rpx;align-items:center;gap:10rpx}.record-kind{padding:3rpx 9rpx;border-radius:999rpx;color:var(--dk-brand);background:var(--dk-brand-soft);font-size:18rpx}.record-meta { color: var(--dk-muted); font-size: 20rpx; }
.record-go { color: var(--dk-muted); font-size: 34rpx; }
.preview-empty{display:flex;padding:42rpx 20rpx 46rpx;align-items:center;flex-direction:column}.preview-empty-mark{display:flex;width:52rpx;height:52rpx;align-items:center;justify-content:center;border-radius:50%;color:var(--dk-brand);background:var(--dk-brand-soft);font-size:24rpx}.preview-empty-title{display:block;margin-top:13rpx;color:var(--dk-ink);font-size:25rpx;font-weight:700}.preview-empty-desc{display:block;margin-top:7rpx;color:var(--dk-muted);font-size:21rpx;text-align:center}
.map-heading{display:flex;margin-bottom:18rpx;align-items:flex-end;justify-content:space-between;gap:20rpx}.map-title{margin-bottom:0;color:var(--dk-ink);font-size:28rpx}.map-summary{display:block;margin-top:5rpx;color:var(--dk-muted);font-size:21rpx}.map-hint{flex-shrink:0;color:var(--dk-muted);font-size:20rpx}.circle-map-wrap{height:330rpx;overflow:hidden;border:1rpx solid var(--dk-line);border-radius:22rpx;background:var(--dk-bg-soft)}.circle-map{display:block;width:100%;height:330rpx}.map-empty{display:flex;height:240rpx;padding:24rpx;align-items:center;justify-content:center;flex-direction:column;border:1rpx dashed rgba(47,111,106,.18);border-radius:22rpx;background:linear-gradient(145deg,rgba(232,241,238,.72),rgba(247,241,232,.62));box-sizing:border-box}.map-empty-mark{display:flex;width:58rpx;height:58rpx;align-items:center;justify-content:center;border-radius:50%;color:var(--dk-brand);background:rgba(255,255,255,.76);font-size:34rpx}.map-empty-title{display:block;margin-top:14rpx;color:var(--dk-ink);font-size:26rpx;font-weight:700}.map-empty-desc{display:block;margin-top:7rpx;color:var(--dk-muted);font-size:21rpx;text-align:center}.map-legacy-note{display:block;margin-top:13rpx;color:var(--dk-muted);font-size:20rpx;line-height:1.5}
.name-editor-mask { position:fixed;inset:0;z-index:120;display:flex;align-items:flex-end;background:rgba(20,29,27,.4); }
.name-editor-sheet { width:100%;padding:30rpx 32rpx calc(30rpx + env(safe-area-inset-bottom));border-radius:34rpx 34rpx 0 0;background:var(--dk-surface);box-shadow:0 -18rpx 54rpx rgba(19,37,34,.12);box-sizing:border-box; }
.name-editor-head { display:flex;align-items:flex-start;justify-content:space-between;gap:24rpx; }
.name-editor-title { display:block;color:var(--dk-ink);font-size:31rpx;font-weight:750; }
.name-editor-sub { display:block;margin-top:7rpx;color:var(--dk-muted);font-size:22rpx; }
.name-editor-close { display:flex;width:48rpx;height:48rpx;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%;color:var(--dk-muted);background:var(--dk-bg-soft);font-size:32rpx;line-height:48rpx; }
.name-editor-field { display:flex;height:94rpx;margin-top:26rpx;padding:0 22rpx;align-items:center;gap:16rpx;border:2rpx solid rgba(47,111,106,.16);border-radius:22rpx;background:var(--dk-bg-soft);box-sizing:border-box; }
.name-editor-input { min-width:0;height:90rpx;flex:1;color:var(--dk-ink);font-size:29rpx;line-height:90rpx; }
.name-editor-count { flex-shrink:0;color:var(--dk-muted);font-size:20rpx; }
.name-editor-save { height:82rpx;margin-top:22rpx;border:0;border-radius:22rpx;color:#fff;background:var(--dk-brand);font-size:28rpx;font-weight:700;line-height:82rpx; }
.name-editor-save::after { border:0; }.name-editor-save[disabled] { color:rgba(255,255,255,.72);background:rgba(47,111,106,.46); }
</style>
