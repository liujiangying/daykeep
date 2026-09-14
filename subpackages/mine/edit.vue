<template>
  <view class="page" :style="pageStyle">
    <view class="topbar" :style="{ height: navHeight + 'px', paddingTop: statusBarHeight + 'px' }">
      <view class="back-button" role="button" aria-label="返回" @tap="goBack"><view class="back-icon" /></view>
      <text class="topbar-title">编辑资料</text>
    </view>
    <view class="intro">
      <text class="intro-title">{{ fromLogin ? '先介绍一下自己' : '设置你的个人资料' }}</text>
      <text class="intro-desc">选择微信头像并确认昵称，让圈内的人知道你是谁</text>
    </view>

    <view class="profile-card">
      <view class="avatar-area">
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="avatar-picker"
          open-type="chooseAvatar"
          :disabled="uploading"
          @chooseavatar="onChooseAvatar"
        >
          <image v-if="avatarUrl" class="avatar-img" :src="avatarUrl" mode="aspectFill" />
          <view v-else class="avatar-ph" :style="{ backgroundColor: tokens.brandSoft }">
            <text class="avatar-letter" :style="{ color: tokens.brand }">{{ letter }}</text>
          </view>
          <view class="avatar-edit" :style="{ backgroundColor: tokens.brand }">
            <text class="avatar-edit-icon">＋</text>
          </view>
        </button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view class="avatar-picker" @tap="chooseAvatar">
          <image v-if="avatarUrl" class="avatar-img" :src="avatarUrl" mode="aspectFill" />
          <view v-else class="avatar-ph" :style="{ backgroundColor: tokens.brandSoft }">
            <text class="avatar-letter" :style="{ color: tokens.brand }">{{ letter }}</text>
          </view>
          <view class="avatar-edit" :style="{ backgroundColor: tokens.brand }">
            <text class="avatar-edit-icon">＋</text>
          </view>
        </view>
        <!-- #endif -->
        <text class="avatar-title">{{ avatarUrl ? '更换头像' : '选择微信头像' }}</text>
        <text class="avatar-sub" @tap="chooseAvatar">也可拍照或从相册选择</text>
      </view>

      <view class="divider" />

      <view class="field">
        <text class="field-label">昵称</text>
        <view class="input-wrap">
          <input
            v-model="nickname"
            class="input"
            type="nickname"
            placeholder="填写你的昵称"
            maxlength="20"
          />
          <text class="input-count">{{ nickname.length }}/20</text>
        </view>
        <text class="field-tip">昵称和头像仅用于你主动参与的记录与分享</text>
      </view>

      <view class="divider mood-divider" />

      <view class="field mood-field">
        <text class="field-label">今日心情</text>
        <text class="field-tip mood-tip">选择后，时光圈成员可以看到你今天的状态</text>
        <view class="mood-options">
          <view v-for="item in moodOptions" :key="item.value" class="mood-option" :class="{ on: currentMood === item.value }" @tap="currentMood = item.value">
            <MoodIcon :mood="item.value" size="picker" />
            <text>{{ item.label }}</text>
          </view>
          <view v-if="customMoodIcon" class="mood-option on">
            <MoodIcon :mood="currentMood" size="picker" />
            <text>自定义</text>
          </view>
        </view>
      </view>
    </view>

    <view class="btn-wrap">
      <button
        class="btn"
        :style="primaryBtnStyle"
        :loading="saving"
        :disabled="saving"
        @tap="onSave"
      >保存</button>
      <text v-if="fromLogin" class="later" @tap="finishOnboarding">稍后再设置</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  isLoggedIn,
  fetchMe,
  updateMe,
  DEFAULT_NICKNAME,
  displayNickname,
} from '@/services/auth'
import { uploadAvatar } from '@/subpackages/shared/services/upload'
import { useThemePage } from '@/composables/useThemePage'
import { getTokens } from '@/services/theme'
import { getMyMoodWeek, updateMyMood, type SpaceMood } from '@/services/spaces'
import { normalizeMoodWeek, shanghaiDateKey } from '@/utils/mood'
import { MOOD_OPTIONS, moodIconForValue } from '@/shared/mood'
import MoodIcon from '@/components/MoodIcon.vue'

const { themeId, pageStyle } = useThemePage()
const tokens = computed(() => getTokens(themeId.value))

const nickname = ref(DEFAULT_NICKNAME)
const avatarUrl = ref('')
const saving = ref(false)
const uploading = ref(false)
const fromLogin = ref(false)
const nextPage = ref('')
const navHeight = ref(64)
const statusBarHeight = ref(20)
const currentMood = ref<SpaceMood>('')
const initialMood = ref<SpaceMood>('')
const moodOptions = MOOD_OPTIONS
const customMoodIcon = computed(() => currentMood.value.startsWith('custom:') ? moodIconForValue(currentMood.value) : '')

const letter = computed(() => (nickname.value.trim() || DEFAULT_NICKNAME)[0])

const primaryBtnStyle = computed(() => ({
  backgroundColor: tokens.value.brand,
  color: '#ffffff',
}))

async function loadProfile() {
  try {
    const [me, week] = await Promise.all([
      fetchMe(),
      getMyMoodWeek().catch(() => []),
    ])
    const currentName = displayNickname(me)
    nickname.value = currentName === DEFAULT_NICKNAME ? '' : currentName
    avatarUrl.value = me.avatarUrl || ''
    const todayMood = normalizeMoodWeek(week).find((day) => day.date === shanghaiDateKey())?.mood || ''
    currentMood.value = todayMood
    initialMood.value = todayMood
  } catch {
    if (!isLoggedIn()) {
      uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
      uni.navigateBack()
      return
    }
    nickname.value = DEFAULT_NICKNAME
  }
}

onLoad((options) => {
  fromLogin.value = options?.fromLogin === '1'
  const rawNext = String(options?.next || '')
  try {
    const decoded = decodeURIComponent(rawNext)
    if (/^\/(?:pages|subpackages)\/[A-Za-z0-9_/?=&.-]+$/.test(decoded)) nextPage.value = decoded
  } catch { /* use fallback */ }
  try {
    const system = uni.getSystemInfoSync()
    statusBarHeight.value = system.statusBarHeight || 20
    navHeight.value = statusBarHeight.value + 44
    // #ifdef MP-WEIXIN
    const menu = uni.getMenuButtonBoundingClientRect()
    if (menu?.bottom) navHeight.value = menu.bottom + Math.max(8, menu.top - (system.statusBarHeight || 20))
    // #endif
  } catch { /* use safe default */ }
})

onMounted(() => {
  void loadProfile()
})

async function uploadSelectedAvatar(path: string) {
  if (!path || uploading.value) return
  uploading.value = true
  uni.showLoading({ title: '正在保存头像…', mask: true })
  try {
    avatarUrl.value = await uploadAvatar(path)
    uni.showToast({ title: '头像已选好', icon: 'success' })
  } catch (e: any) {
    uni.showToast({ title: e?.message || '头像上传失败', icon: 'none' })
  } finally {
    uni.hideLoading()
    uploading.value = false
  }
}

function onChooseAvatar(event: any) {
  void uploadSelectedAvatar(event?.detail?.avatarUrl || '')
}

async function chooseAvatar() {
  if (uploading.value) return
  try {
    const res = await uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    })
    const path = res.tempFilePaths?.[0]
    if (!path) return
    await uploadSelectedAvatar(path)
  } catch (e: any) {
    const message = String(e?.errMsg || e?.message || '')
    if (!/cancel/i.test(message)) {
      uni.showToast({ title: e?.message || '选择头像失败', icon: 'none' })
    }
  }
}

function finishOnboarding() {
  const target = nextPage.value || '/pages/timeline/index'
  if (target === '/pages/timeline/index') {
    uni.switchTab({
      url: target,
      fail: () => uni.reLaunch({ url: target }),
    })
    return
  }
  uni.reLaunch({ url: target })
}

function goBack() {
  if (fromLogin.value) {
    finishOnboarding()
    return
  }
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/mine/index' }) })
}

async function onSave() {
  if (saving.value) return
  const name = nickname.value.trim()
  if (!name) {
    uni.showToast({ title: '请先填写昵称', icon: 'none' })
    return
  }
  if (!avatarUrl.value) {
    uni.showToast({ title: '请选择一个头像', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await updateMe({
      nickname: name,
      avatarUrl: avatarUrl.value,
    })
    if (currentMood.value && currentMood.value !== initialMood.value) {
      try {
        await updateMyMood(currentMood.value)
        initialMood.value = currentMood.value
      } catch (e: any) {
        uni.showToast({ title: e?.message || '资料已保存，心情保存失败', icon: 'none', duration: 2500 })
        return
      }
    }
    nickname.value = name
    uni.showToast({ title: '已保存', icon: 'success' })
    if (fromLogin.value) {
      setTimeout(finishOnboarding, 500)
    } else {
      setTimeout(() => uni.navigateBack(), 400)
    }
  } catch (e: any) {
    if (!isLoggedIn()) {
      uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
      uni.navigateBack()
      return
    }
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 0 32rpx 80rpx;
  background-color: var(--dk-bg, #f2f4f3);
  color: var(--dk-ink, #1c2423);
  box-sizing: border-box;
}
.topbar{position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box}.topbar-title{font-size:28rpx;font-weight:600}.back-button{position:absolute;left:-20rpx;bottom:0;display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;border:0;background:transparent;box-sizing:border-box}.back-button:active{opacity:.5}.back-icon{width:22rpx;height:22rpx;border-left:4rpx solid var(--dk-ink,#1c2423);border-bottom:4rpx solid var(--dk-ink,#1c2423);transform:rotate(45deg);box-sizing:border-box}

.intro {
  padding: 28rpx 12rpx 32rpx;
}
.intro-title {
  display: block;
  font-size: var(--dk-fs-title, 34rpx);
  line-height: 1.4;
  font-weight: 650;
}
.intro-desc {
  display: block;
  margin-top: 8rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  line-height: 1.6;
  color: var(--dk-muted, #6b736f);
}

.profile-card {
  padding: 40rpx 32rpx 34rpx;
  background: var(--dk-card, #fffefb);
  border: 1rpx solid var(--dk-line, #e2e6e4);
  border-radius: 28rpx;
  box-shadow: 0 10rpx 30rpx rgba(35, 53, 50, 0.045);
}
.avatar-area {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.avatar-picker {
  position: relative;
  width: 152rpx;
  height: 152rpx;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 50%;
  overflow: visible;
  background: transparent;
  line-height: normal;
  &::after {
    border: 0;
  }
}
.avatar-img,
.avatar-ph {
  width: 152rpx;
  height: 152rpx;
  border-radius: 50%;
  border: 6rpx solid var(--dk-card, #fffefb);
  box-shadow: 0 8rpx 24rpx rgba(35, 53, 50, 0.1);
  box-sizing: border-box;
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
.avatar-edit {
  position: absolute;
  right: -2rpx;
  bottom: 2rpx;
  width: 46rpx;
  height: 46rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 5rpx solid var(--dk-card, #fffefb);
  border-radius: 50%;
  box-sizing: border-box;
}
.avatar-edit-icon {
  color: #fff;
  font-size: 26rpx;
  line-height: 1;
  transform: translateY(-1rpx);
}
.avatar-title {
  margin-top: 20rpx;
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 600;
  color: var(--dk-ink, #1c2423);
}
.avatar-sub {
  margin-top: 6rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
}
.divider {
  height: 1rpx;
  margin: 36rpx 0 30rpx;
  background: var(--dk-line, #e2e6e4);
}
.mood-divider{margin-top:30rpx}
.mood-tip{margin-top:-4rpx}
.mood-options{display:flex;gap:10rpx;margin-top:22rpx;overflow-x:auto}.mood-option{display:flex;width:106rpx;height:94rpx;flex:0 0 106rpx;align-items:center;justify-content:center;gap:6rpx;border:1rpx solid var(--dk-line);border-radius:18rpx;color:var(--dk-muted);background:var(--dk-bg);font-size:19rpx;flex-direction:column;box-sizing:border-box}.mood-option.on{border-color:var(--dk-brand);color:var(--dk-brand);background:var(--dk-brand-soft);font-weight:700}.mood-icon{font-size:30rpx;line-height:1}
.field-label {
  display: block;
  margin-bottom: 14rpx;
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 600;
}
.input-wrap {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 22rpx;
  background: var(--dk-bg, #f2f4f3);
  border: 1rpx solid transparent;
  border-radius: 16rpx;
  box-sizing: border-box;
}
.input-wrap:focus-within {
  border-color: var(--dk-brand, #247f76);
}
.field-tip {
  display: block;
  margin-top: 12rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  line-height: 1.6;
  color: var(--dk-muted, #6b736f);
}

.input {
  flex: 1;
  min-width: 0;
  height: 86rpx;
  padding: 0;
  font-size: var(--dk-fs-body, 28rpx);
  background: transparent;
  color: var(--dk-ink, #1c2423);
}
.input-count {
  margin-left: 16rpx;
  font-size: 22rpx;
  color: var(--dk-muted, #6b736f);
  opacity: 0.72;
}

.btn-wrap {
  margin-top: 32rpx;
}
.btn {
  height: 92rpx;
  line-height: 92rpx;
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 600;
  border-radius: 18rpx;
  border: none;
  margin: 0;
  &::after {
    border: none;
  }
}
.later {
  display: block;
  padding: 28rpx 0 8rpx;
  text-align: center;
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-muted, #6b736f);
}
</style>
