<template>
  <view class="page" :style="pageStyle">
    <view v-if="entry && unlocked" class="reader">
      <button v-if="entry.isOwner" class="reader-delete danger-action danger-action--compact" @tap="removeCapsule">
        删除
      </button>
      <swiper class="reader-swiper" :current="readerPage" @change="onReaderChange">
        <swiper-item>
          <view class="cover-page">
            <image class="cover-bg" :src="CAPSULE_COVER_URL" mode="aspectFill" />
            <view class="cover-shade" />
            <view class="cover-content">
              <view class="cover-seal"><text>封</text></view>
              <text class="cover-eyebrow">{{ capsuleScopeLabel }}</text>
              <text class="cover-heading">留给未来的话</text>
              <text class="cover-copy">这段被时间保管的记录，现在已经抵达。</text>
              <view class="cover-dates">
                <view>
                  <text class="cover-date-label">写下</text>
                  <text class="cover-date-value">{{ sealedDate }}</text>
                </view>
                <view class="cover-date-line" />
                <view class="cover-date-right">
                  <text class="cover-date-label">解锁</text>
                  <text class="cover-date-value">{{ unlockDate }}</text>
                </view>
              </view>
              <text class="turn-hint">向左翻阅</text>
            </view>
          </view>
        </swiper-item>

        <swiper-item v-if="revealedBody">
          <scroll-view scroll-y class="letter-page">
            <view class="letter-sheet">
              <text class="letter-eyebrow">那时留下的话</text>
              <view class="letter-rule" />
              <text class="letter-body" user-select>{{ revealedBody }}</text>
              <view class="letter-sign">
                <text>写于</text>
                <text>{{ sealedDate }}</text>
              </view>
            </view>
          </scroll-view>
        </swiper-item>

        <swiper-item v-for="(image, index) in entry.images || []" :key="`${image}-${index}`">
          <view class="photo-page" @tap="previewImage(index)">
            <image class="photo-bg" :src="image" mode="aspectFill" />
            <view class="photo-shade" />
            <image class="photo-main" :src="image" mode="aspectFit" />
            <view class="photo-caption">
              <text>一起封存的画面</text>
              <text>{{ index + 1 }} / {{ entry.images?.length }}</text>
            </view>
          </view>
        </swiper-item>
      </swiper>

      <view class="reader-progress" :class="{ onPaper: !!revealedBody && readerPage === 1 }">
        <view
          v-for="index in readerPageCount"
          :key="index"
          class="progress-dot"
          :class="{ active: readerPage === index - 1 }"
        />
      </view>
    </view>

    <view v-else-if="entry" class="content">
      <image class="locked-bg" :src="CAPSULE_COVER_URL" mode="aspectFill" />
      <view class="locked-shade" />

      <view class="locked-hero">
        <view class="seal">
          <view class="seal-ring" />
          <view class="seal-core">
            <text class="seal-mark">封</text>
          </view>
        </view>
        <text class="locked-kicker">{{ isRandomLocked ? '随机胶囊' : '尚未开启' }}</text>
        <text class="locked-heading">{{ lockedHeadline }}</text>
        <text v-if="countdown" class="locked-countdown">{{ countdown }}</text>
        <view class="locked-rule" />
        <text class="locked-note">{{ lockedNote }}</text>
      </view>

      <button v-if="entry.isOwner" class="capsule-delete" @tap="removeCapsule">删除这颗胶囊</button>
    </view>

    <view v-else-if="!loading" class="empty">
      <text>这颗时间胶囊暂时没有找到</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { deleteEntry, getEntry, type Entry } from '@/services/entries'
import { displayDiaryBody } from '@/services/systemEntries'
import { CAPSULE_COVER_URL } from '@/subpackages/shared/services/brand'
import { useThemePage } from '@/composables/useThemePage'
import { useEntriesStore } from '@/stores/entries'

const { pageStyle } = useThemePage()
const entriesStore = useEntriesStore()
const id = ref('')
const entry = ref<Entry | null>(null)
const loading = ref(true)
const deleting = ref(false)
const readerPage = ref(0)

const unlockTime = computed(() => {
  const value = entry.value?.capsuleUnlockAt
  return value ? new Date(value) : null
})
const isRandomLocked = computed(() => entry.value?.capsuleUnlockMode === 'random' && !entry.value?.capsuleUnlocked)
const unlocked = computed(() =>
  !!entry.value?.capsuleUnlocked ||
  (!!unlockTime.value && unlockTime.value.getTime() <= Date.now()),
)
const capsuleScopeLabel = computed(() => entry.value?.ownerType === 'space' ? '时光圈胶囊' : '时间胶囊')
const lockedHeadline = computed(() =>
  isRandomLocked.value ? '等待惊喜揭晓' : unlockDate.value,
)
const lockedNote = computed(() =>
  entry.value?.ownerType === 'space'
    ? '开启那天，圈内成员可以一起打开'
    : '开启那天，再回来看看当时留下的话',
)
const revealedBody = computed(() => displayDiaryBody(entry.value?.body || '').trim())
const readerPageCount = computed(() =>
  1 + Number(!!revealedBody.value) + (entry.value?.images?.length || 0),
)
const sealedDate = computed(() => {
  const raw = entry.value?.eventAt || entry.value?.createdAt || entry.value?.eventDate
  const date = raw ? new Date(raw.replace(' ', 'T')) : null
  if (!date || Number.isNaN(date.getTime())) return '那一天'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})
const unlockDate = computed(() => {
  if (isRandomLocked.value) return '会在未来某天悄悄抵达'
  const date = unlockTime.value
  if (!date || Number.isNaN(date.getTime())) return '等待约定'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})
const countdown = computed(() => {
  if (isRandomLocked.value) return ''
  const date = unlockTime.value
  if (!date) return ''
  const days = Math.max(1, Math.ceil((date.getTime() - Date.now()) / 86400000))
  if (days >= 365) return `还有约 ${Math.round(days / 365)} 年`
  if (days >= 30) return `还有约 ${Math.round(days / 30)} 个月`
  return `还有 ${days} 天`
})

async function load() {
  if (!id.value) return
  loading.value = true
  try {
    const loaded = await getEntry(id.value)
    entry.value = loaded
    const unlockAt = loaded.capsuleUnlockAt ? new Date(loaded.capsuleUnlockAt).getTime() : NaN
    if (loaded.capsuleUnlocked || (Number.isFinite(unlockAt) && unlockAt <= Date.now())) {
      entriesStore.optimisticUpdate(loaded.id, { ...loaded, capsuleUnlocked: true })
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function onReaderChange(event: any) {
  readerPage.value = Number(event.detail?.current) || 0
}

function previewImage(index: number) {
  const urls = entry.value?.images || []
  if (!urls.length) return
  uni.previewImage({ current: urls[index], urls })
}

function removeCapsule() {
  if (!id.value || deleting.value) return
  uni.showModal({
    title: '删除这颗时间胶囊？',
    content: unlocked.value
      ? '删除后，这段已经解锁的记录将无法恢复。'
      : '删除后，将无法在约定日期查看其中的内容，且无法恢复。',
    cancelText: '保留',
    confirmText: '删除',
    confirmColor: '#b64d46',
    success: async (result) => {
      if (!result.confirm || deleting.value) return
      deleting.value = true
      try {
        await deleteEntry(id.value)
        uni.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => {
          uni.switchTab({ url: '/pages/reminders/index' })
        }, 350)
      } catch (error: any) {
        uni.showToast({ title: error?.message || '删除失败', icon: 'none' })
      } finally {
        deleting.value = false
      }
    },
  })
}

onLoad((query: any) => {
  id.value = String(query?.id || '')
  void load()
})
onShow(() => {
  if (id.value && entry.value) void load()
})
</script>

<style scoped lang="scss">
.page { min-height: 100vh; background: var(--dk-bg); color: var(--dk-ink); }
.reader { position: relative; height: 100vh; overflow: hidden; background: #0d302f; }
.reader-delete { position: absolute; z-index: 8; top: 24rpx; right: 24rpx; width: auto; border-color: rgba(255,255,255,.24); color: rgba(255,255,255,.82); background: rgba(12,37,36,.34); backdrop-filter: blur(10px); }
.reader-swiper { height: 100%; }
.cover-page,.photo-page { position: relative; width: 100%; height: 100%; overflow: hidden; }
.cover-bg,.photo-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.cover-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(6, 27, 27, .12), rgba(5, 23, 23, .26) 45%, rgba(4, 19, 19, .72)); }
.cover-content { position: absolute; inset: 0; display: flex; align-items: center; padding: 80rpx 54rpx calc(100rpx + env(safe-area-inset-bottom)); box-sizing: border-box; flex-direction: column; justify-content: center; color: #fff; text-align: center; }
.cover-seal { display: flex; align-items: center; justify-content: center; width: 88rpx; height: 88rpx; margin-bottom: 32rpx; border: 1rpx solid rgba(255,255,255,.55); border-radius: 50%; background: rgba(255,255,255,.1); backdrop-filter: blur(8px); font-size: 30rpx; font-weight: 650; }
.cover-eyebrow { color: rgba(255,255,255,.72); font-size: 21rpx; font-weight: 600; letter-spacing: .22em; }
.cover-heading { margin-top: 18rpx; font-size: 48rpx; font-weight: 650; letter-spacing: .06em; }
.cover-copy { max-width: 520rpx; margin-top: 22rpx; color: rgba(255,255,255,.76); font-size: 25rpx; line-height: 1.7; }
.cover-dates { display: flex; align-items: center; width: 100%; margin-top: 76rpx; padding: 24rpx 0; border-top: 1rpx solid rgba(255,255,255,.2); border-bottom: 1rpx solid rgba(255,255,255,.2); }
.cover-dates > view { display: flex; min-width: 0; flex: 0 0 42%; flex-direction: column; align-items: flex-start; }
.cover-dates .cover-date-right { align-items: flex-end; text-align: right; }
.cover-date-label { color: rgba(255,255,255,.55); font-size: 19rpx; }
.cover-date-value { margin-top: 7rpx; color: rgba(255,255,255,.9); font-size: 23rpx; }
.cover-date-line { height: 1rpx; margin: 0 16rpx; flex: 1 !important; background: rgba(255,255,255,.3); }
.turn-hint { position: absolute; bottom: calc(52rpx + env(safe-area-inset-bottom)); color: rgba(255,255,255,.6); font-size: 20rpx; letter-spacing: .08em; }
.letter-page { height: 100%; background: #e9ece9; }
.letter-sheet { min-height: calc(100vh - 68rpx); margin: 34rpx 28rpx; padding: 68rpx 44rpx calc(100rpx + env(safe-area-inset-bottom)); box-sizing: border-box; border-radius: 8rpx; background: #fcfbf6; box-shadow: 0 16rpx 44rpx rgba(8, 32, 30, .12); }
.letter-eyebrow { color: #75807a; font-size: 20rpx; letter-spacing: .15em; }
.letter-rule { width: 44rpx; height: 2rpx; margin: 24rpx 0 34rpx; background: var(--dk-brand); }
.letter-body { display: block; color: #252c2a; font-size: 30rpx; line-height: 2; white-space: pre-wrap; word-break: break-word; }
.letter-sign { display: flex; align-items: flex-end; margin-top: 62rpx; color: #89918d; font-size: 20rpx; line-height: 1.7; flex-direction: column; }
.photo-shade { position: absolute; inset: 0; background: rgba(5, 20, 20, .72); backdrop-filter: blur(18px); }
.photo-main { position: absolute; inset: 70rpx 28rpx 126rpx; width: calc(100% - 56rpx); height: calc(100% - 196rpx); }
.photo-caption { position: absolute; right: 38rpx; bottom: calc(58rpx + env(safe-area-inset-bottom)); left: 38rpx; display: flex; justify-content: space-between; color: rgba(255,255,255,.72); font-size: 21rpx; }
.reader-progress { position: absolute; z-index: 4; right: 0; bottom: calc(24rpx + env(safe-area-inset-bottom)); left: 0; display: flex; justify-content: center; gap: 10rpx; pointer-events: none; }
.progress-dot { width: 8rpx; height: 8rpx; border-radius: 50%; background: rgba(255,255,255,.35); transition: width .2s ease; }
.progress-dot.active { width: 24rpx; border-radius: 999rpx; background: rgba(255,255,255,.92); }
.reader-progress.onPaper .progress-dot { background: rgba(47,111,106,.2); }
.reader-progress.onPaper .progress-dot.active { background: var(--dk-brand); }
.content { position: relative; display: flex; align-items: center; justify-content: center; min-height: calc(100vh - 44px); padding: 62rpx 42rpx calc(40rpx + env(safe-area-inset-bottom)); box-sizing: border-box; overflow: hidden; flex-direction: column; text-align: center; }
.locked-bg,.locked-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
.locked-shade { background: linear-gradient(180deg, rgba(5,25,25,.28), rgba(4,22,22,.56)); }
.locked-hero { position: relative; z-index: 2; display: flex; align-items: center; width: 100%; max-width: 560rpx; flex-direction: column; }
.seal { position: relative; width: 124rpx; height: 124rpx; margin-bottom: 42rpx; }
.seal-ring { position: absolute; inset: 0; border: 1rpx solid rgba(255,255,255,.3); border-radius: 50%; }
.seal-ring::before,.seal-ring::after { position: absolute; content: ''; border: 1rpx solid rgba(255,255,255,.24); border-radius: 50%; }
.seal-ring::before { inset: 15rpx; }
.seal-ring::after { inset: 30rpx; }
.seal-core { position: absolute; inset: 35rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,.16); }
.seal-mark { color: rgba(255,255,255,.9); font-size: 25rpx; font-weight: 650; }
.locked-kicker { color: rgba(255,255,255,.58); font-size: 21rpx; font-weight: 600; letter-spacing: .18em; }
.locked-heading { max-width: 560rpx; margin-top: 20rpx; color: #fff; font-size: 46rpx; line-height: 1.35; font-weight: 650; letter-spacing: .04em; }
.locked-countdown { margin-top: 16rpx; color: rgba(255,255,255,.7); font-size: 23rpx; }
.locked-rule { width: 42rpx; height: 2rpx; margin: 42rpx 0 26rpx; background: rgba(217,185,120,.86); box-shadow: 0 0 14rpx rgba(217,185,120,.42); }
.locked-note { color: rgba(255,255,255,.7); font-size: 23rpx; line-height: 1.6; }
.capsule-delete { position: absolute; z-index: 2; bottom: calc(34rpx + env(safe-area-inset-bottom)); width: auto; height: 56rpx; padding: 0 20rpx; border: 0; color: rgba(255,255,255,.48); background: transparent; font-size: 21rpx; line-height: 56rpx; }
.capsule-delete::after { border: 0; }
.empty { display: flex; align-items: center; justify-content: center; min-height: 70vh; color: var(--dk-muted); font-size: 25rpx; }
</style>
