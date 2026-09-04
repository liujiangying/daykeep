<template>
  <view class="page" :style="pageStyle">
    <view class="topbar" :style="{ height: navHeight + 'px', paddingTop: statusBarHeight + 'px' }">
      <view class="back-button" role="button" aria-label="返回" @tap="goBack"><view class="back-icon" /></view>
    </view>
    <view class="page-title">
      <text>{{ pageTitle }}</text>
      <text>{{ pageSubtitle }}</text>
    </view>

    <view class="name-section">
      <text class="section-label">空间名称</text>
      <view class="name-field">
        <input v-model="name" class="name-input" maxlength="24" :placeholder="spaceNamePlaceholder" placeholder-class="name-placeholder" confirm-type="done" />
        <text class="name-count">{{ name.length }}/24</text>
      </view>
    </view>

    <view class="preview-section">
      <text class="section-label">邀请卡预览</text>
      <view class="invite-card">
        <view class="invite-cover" @tap="onCoverTap">
          <image v-if="coverImage" class="cover-image" :src="coverImage" mode="aspectFill" />
          <template v-else><view class="glow one" /><view class="glow two" /></template>
          <view class="cover-shade" />
          <text class="cover-action">{{ coverImage ? '更换共同封面' : '＋ 添加共同封面' }}</text>
        </view>
        <view class="invite-pad">
          <text class="invite-title">{{ previewTitle }}</text>
          <text class="invite-copy">邀请你加入，一起记录在乎的人和事</text>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <text class="action-hint">{{ moveEntryId ? '创建后，这个日子将在空间内共同可见' : inviteAfterCreate ? '创建后再选择微信好友发送邀请' : '创建后即可开始记录' }}</text>
      <button class="submit" :disabled="saving" :loading="saving" @tap="submit">{{ moveEntryId ? '创建并放入' : inviteAfterCreate ? '创建并去邀请' : '创建时光空间' }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { createSpace, type SpaceType } from '@/services/spaces'
import { setPreferredSpaceId } from '@/services/spacePreference'
import { uploadSpaceCover } from '@/subpackages/shared/services/upload'
import { moveEntryToSpace } from '@/services/entries'

const { pageStyle } = useThemePage()
const name = ref('')
const type = ref<Exclude<SpaceType, 'personal'>>('pair')
const keywordsText = ref('雨天白堤、咖啡探店、每年都去')
const coverImage = ref('')
const saving = ref(false)
const inviteAfterCreate = ref(false)
const moveEntryId = ref('')
const navHeight = ref(64)
const statusBarHeight = ref(20)
const pageTitle = computed(() => type.value === 'group' ? '创建家庭/朋友空间' : '邀请一个人一起记录')
const pageSubtitle = computed(() => type.value === 'group' ? '给大家一个共同记录的地方' : '先为你们的共同空间取个名字')
const spaceNamePlaceholder = computed(() => type.value === 'group' ? '例如：我们的家庭时光' : '例如：我和 L 的时光')
const previewTitle = computed(() => name.value.trim() || (type.value === 'group' ? '我们的共同空间' : '我和 TA 的时光'))

function goBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/timeline/index' })
}

function parseKeywords() {
  return keywordsText.value
    .split(/[#,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  // 不在这里截断个数：服务端 normalizeKeywords 统一截到 8。
  // 客户端截 6、服务端截 8 时，第 7、8 个关键词会被悄悄吞掉。
}

function chooseCover() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: ({ tempFilePaths }) => {
      coverImage.value = tempFilePaths[0] || ''
    },
  })
}

function onCoverTap() {
  if (!coverImage.value) {
    chooseCover()
    return
  }
  uni.showActionSheet({
    itemList: ['更换共同封面', '使用默认封面'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) chooseCover()
      else coverImage.value = ''
    },
  })
}

async function submit() {
  if (saving.value) return
  const finalName = name.value.trim()
  if (!finalName) {
    uni.showToast({ title: '先给圈子起个名字', icon: 'none' })
    return
  }
  saving.value = true
  try {
    const coverUrl = coverImage.value ? await uploadSpaceCover(coverImage.value) : ''
    const space = await createSpace({
      name: finalName,
      type: type.value,
      keywords: parseKeywords(),
      coverUrl,
    })
    setPreferredSpaceId(space.id)
    if (moveEntryId.value) {
      await moveEntryToSpace(moveEntryId.value, space.id)
      uni.redirectTo({
        url: `/subpackages/day/detail?id=${encodeURIComponent(moveEntryId.value)}`,
      })
      return
    }
    uni.showToast({ title: '已创建', icon: 'success' })
    if (inviteAfterCreate.value) {
      // 进入圈子后由原生 open-type="share" 发送微信邀请卡，
      // 不复制无法在微信会话中直接打开的小程序内部路径。
      uni.redirectTo({ url: `/subpackages/space/detail?spaceId=${encodeURIComponent(space.id)}&invite=1` })
      return
    }
    setTimeout(() => {
      uni.redirectTo({ url: `/subpackages/space/detail?spaceId=${encodeURIComponent(space.id)}` })
    }, 250)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '创建失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

onLoad((query: Record<string, string> = {}) => {
  try {
    const system = uni.getSystemInfoSync()
    statusBarHeight.value = system.statusBarHeight || 20
    navHeight.value = statusBarHeight.value + 44
    // #ifdef MP-WEIXIN
    const menu = uni.getMenuButtonBoundingClientRect()
    if (menu?.bottom) navHeight.value = menu.bottom + Math.max(8, menu.top - (system.statusBarHeight || 20))
    // #endif
  } catch { /* use safe default */ }
  type.value = query.type === 'group' ? 'group' : 'pair'
  inviteAfterCreate.value = query.invite === '1' || query.onboarding === '1'
  moveEntryId.value = String(query.moveEntryId || '').trim()
  if (type.value === 'group') {
    keywordsText.value = '家庭日常、朋友聚会、每年都去'
  }
})
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:0 32rpx calc(58rpx + env(safe-area-inset-bottom));background:var(--dk-bg,#f5f7f6);color:var(--dk-ink,#1c2423);box-sizing:border-box}
.topbar{display:flex;align-items:center;box-sizing:border-box}.back-button{display:flex;width:88rpx;height:88rpx;margin-left:-20rpx;align-items:center;justify-content:center;border:0;background:transparent;box-sizing:border-box}.back-button:active{opacity:.5}.back-icon{width:22rpx;height:22rpx;border-left:4rpx solid var(--dk-ink,#1c2423);border-bottom:4rpx solid var(--dk-ink,#1c2423);transform:rotate(45deg);box-sizing:border-box}
.page-title{padding:6rpx 8rpx 42rpx}.page-title text:first-child{display:block;font-size:46rpx;font-weight:800;letter-spacing:-.035em;line-height:1.25}.page-title text:last-child{display:block;margin-top:10rpx;color:var(--dk-muted,#6b736f);font-size:25rpx;line-height:1.45}
.section-label{display:block;margin:0 6rpx 14rpx;color:var(--dk-muted,#6b736f);font-size:23rpx;font-weight:650}
.name-field{display:flex;height:112rpx;align-items:center;gap:16rpx;padding:0 28rpx;border:1rpx solid rgba(47,111,106,.08);border-radius:28rpx;background:var(--dk-surface,#fff);box-shadow:0 10rpx 30rpx rgba(28,54,49,.04);box-sizing:border-box}
.name-input{min-width:0;height:100%;flex:1;color:var(--dk-ink);font-size:27rpx;font-weight:400}.name-placeholder{color:#9aa29f;font-size:27rpx;font-weight:400}.name-count{flex-shrink:0;color:var(--dk-muted);font-size:20rpx;opacity:.65}
.preview-section{margin-top:42rpx}.invite-card{overflow:hidden;border:1rpx solid rgba(47,111,106,.08);border-radius:32rpx;background:var(--dk-surface,#fff);box-shadow:0 18rpx 46rpx rgba(28,54,49,.055)}
.invite-cover{position:relative;height:300rpx;overflow:hidden;background:linear-gradient(145deg,#b5d5cd 0%,#dae6df 50%,#ecd8b1 100%)}.cover-image{position:absolute;inset:0;width:100%;height:100%}.cover-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,27,24,.02),rgba(12,27,24,.16))}.glow{position:absolute;border-radius:50%;filter:blur(10rpx)}.glow.one{width:280rpx;height:280rpx;top:-90rpx;left:-50rpx;background:rgba(255,255,255,.46)}.glow.two{width:310rpx;height:310rpx;right:-70rpx;bottom:-130rpx;background:rgba(255,239,204,.54)}
.cover-action{position:absolute;right:20rpx;bottom:18rpx;padding:10rpx 16rpx;border-radius:999rpx;color:#fff;background:rgba(20,38,35,.5);backdrop-filter:blur(8rpx);font-size:21rpx;font-weight:650}
.invite-pad{padding:28rpx 30rpx 30rpx;text-align:left}.invite-title{display:block;overflow:hidden;color:var(--dk-ink);font-size:31rpx;font-weight:780;text-overflow:ellipsis;white-space:nowrap}.invite-copy{display:block;margin-top:9rpx;color:var(--dk-muted,#6b736f);font-size:23rpx;line-height:1.45}
.action-bar{margin-top:34rpx}.action-hint{display:block;margin-bottom:12rpx;color:var(--dk-muted);font-size:21rpx;text-align:center}
.submit{width:100%;height:84rpx;margin:0;border:0;border-radius:24rpx;background:var(--dk-brand,#2f6f6a);color:#fff;font-size:29rpx;font-weight:760;line-height:84rpx}
.submit::after { border: 0; }
.submit[disabled] { opacity: .55; }
</style>
