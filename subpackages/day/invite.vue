<template>
  <view class="invite-page">
    <view class="glow glow-one" />
    <view class="glow glow-two" />

    <view v-if="loading" class="state-card">
      <view class="loading-dot" />
      <text>正在打开邀请…</text>
    </view>

    <view v-else-if="errorText" class="state-card error-card">
      <text class="state-mark">×</text>
      <text class="state-title">这份邀请暂时无法打开</text>
      <text class="state-copy">{{ errorText }}</text>
      <button class="ghost-button" @tap="goHome">回到首页</button>
    </view>

    <view v-else-if="invite" class="invite-wrap">
      <view class="eyebrow">共同记录邀请</view>
      <view class="invite-card">
        <view class="inviter-row">
          <image
            v-if="invite.inviterAvatar"
            class="avatar"
            :src="invite.inviterAvatar"
            mode="aspectFill"
          />
          <view v-else class="avatar avatar-placeholder">
            <text>{{ invite.inviterNickname.slice(0, 1) || '友' }}</text>
          </view>
          <view class="inviter-copy">
            <text class="inviter-name">{{ invite.inviterNickname }}</text>
            <text class="inviter-action">邀请你一起记住这个日子</text>
          </view>
        </view>

        <view class="day-card">
          <text class="day-label">一起记</text>
          <text class="day-title">{{ invite.title }}</text>
          <text class="day-date">{{ eventDateLabel }}</text>
          <view class="day-rule" />
          <text class="day-copy">以后关于这个日子的照片和心情，都可以一起留在这里。</text>
          <text v-if="invite.spaceName" class="space-copy">接受后将加入「{{ invite.spaceName }}」，这个日子会同步到空间的日子与提醒。</text>
        </view>

        <view class="meta-row">
          <text>{{ invite.memberCount }} 人已加入</text>
          <text v-if="expiryLabel">{{ expiryLabel }}</text>
        </view>
      </view>

      <button
        class="join-button"
        :loading="joining"
        :disabled="joining || isFull"
        @tap="handlePrimary"
      >{{ primaryLabel }}</button>
      <text class="privacy-copy">只有你确认接受后才会加入；提醒由每位成员单独开启</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { request } from '@/api/request'
import { isLoggedIn } from '@/services/auth'

const POST_LOGIN_REDIRECT_KEY = 'dk_post_login_redirect'

interface InvitePreview {
  entryId: string
  title: string
  eventDate: string
  inviterNickname: string
  inviterAvatar: string
  expiresAt: string | null
  memberCount: number
  maxMembers: number | null
  viewerRole: '' | 'owner' | 'partner'
  spaceId: string
  spaceName: string
}

const inviteCode = ref('')
const invite = ref<InvitePreview | null>(null)
const loading = ref(true)
const joining = ref(false)
const errorText = ref('')
let lastLoadedWithAuth = false
let loadingInvite = false

const eventDateLabel = computed(() => {
  const match = invite.value?.eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return invite.value?.eventDate || ''
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
})

const expiryLabel = computed(() => {
  if (!invite.value?.expiresAt) return ''
  const date = new Date(invite.value.expiresAt)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日前有效`
})

const isMember = computed(() => invite.value?.viewerRole === 'owner' || invite.value?.viewerRole === 'partner')
const isFull = computed(() => (
  !isMember.value
  && !!invite.value?.maxMembers
  && invite.value.memberCount >= invite.value.maxMembers
))
const primaryLabel = computed(() => {
  if (isMember.value) return '进入共同记录'
  if (isFull.value) return '共同记录已满员'
  return isLoggedIn() ? '接受邀请，一起记录' : '登录并接受邀请'
})

function decode(value: unknown) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

async function loadInvite() {
  if (!inviteCode.value || loadingInvite) return
  loadingInvite = true
  const authenticated = isLoggedIn()
  loading.value = true
  errorText.value = ''
  try {
    invite.value = await request<InvitePreview>({
      url: `/api/entries/collaborate/invite/${encodeURIComponent(inviteCode.value)}`,
      skipAuth: !authenticated,
    })
    lastLoadedWithAuth = authenticated
  } catch (error: any) {
    invite.value = null
    errorText.value = error?.message || '邀请已失效，请让对方重新发送'
  } finally {
    loadingInvite = false
    loading.value = false
  }
}

function enterCollaboration() {
  if (!invite.value) return
  uni.redirectTo({
    url: `/subpackages/day/collaborate?entryId=${encodeURIComponent(invite.value.entryId)}&title=${encodeURIComponent(invite.value.title)}`,
  })
}

async function handlePrimary() {
  if (!invite.value || joining.value || isFull.value) return
  if (isMember.value) {
    enterCollaboration()
    return
  }
  if (!isLoggedIn()) {
    uni.setStorageSync(
      POST_LOGIN_REDIRECT_KEY,
      `/subpackages/day/invite?code=${encodeURIComponent(inviteCode.value)}`,
    )
    uni.reLaunch({ url: '/pages/login/login' })
    return
  }

  joining.value = true
  try {
    await request({
      url: '/api/entries/collaborate/join',
      method: 'POST',
      data: { inviteCode: inviteCode.value },
    })
    uni.showToast({ title: '已加入共同好日子', icon: 'success' })
    setTimeout(enterCollaboration, 500)
  } catch (error: any) {
    const message = String(error?.message || '加入失败')
    if (message.includes('已经在共同记录') || message.includes('不能邀请自己')) {
      enterCollaboration()
      return
    }
    uni.showToast({ title: message, icon: 'none' })
    await loadInvite()
  } finally {
    joining.value = false
  }
}

function goHome() {
  uni.switchTab({ url: '/pages/timeline/index' })
}

onLoad((query: any) => {
  inviteCode.value = decode(query?.code).trim()
  if (!inviteCode.value) {
    loading.value = false
    errorText.value = '邀请链接缺少必要信息'
    return
  }
  void loadInvite()
})

onShow(() => {
  if (inviteCode.value && isLoggedIn() && !lastLoadedWithAuth) void loadInvite()
})
</script>

<style scoped lang="scss">
.invite-page {
  position: relative;
  min-height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  padding: 82rpx 34rpx calc(54rpx + env(safe-area-inset-bottom));
  color: #18302d;
  background: linear-gradient(160deg, #edf6f3 0%, #f8f4ec 56%, #eef5f2 100%);
}
.glow { position: absolute; border-radius: 50%; filter: blur(8rpx); pointer-events: none; }
.glow-one { width: 420rpx; height: 420rpx; top: -180rpx; right: -150rpx; background: rgba(73,142,132,.18); }
.glow-two { width: 360rpx; height: 360rpx; bottom: -150rpx; left: -130rpx; background: rgba(220,181,112,.16); }
.invite-wrap { position: relative; z-index: 1; max-width: 680rpx; margin: 0 auto; }
.eyebrow { margin: 0 0 22rpx 8rpx; color: #39766f; font-size: 24rpx; font-weight: 650; letter-spacing: 5rpx; }
.invite-card { padding: 34rpx; border: 1rpx solid rgba(47,111,106,.14); border-radius: 34rpx; background: rgba(255,255,255,.9); box-shadow: 0 24rpx 70rpx rgba(36,73,68,.12); }
.inviter-row { display: flex; align-items: center; gap: 20rpx; }
.avatar { width: 86rpx; height: 86rpx; flex: 0 0 auto; border: 5rpx solid #fff; border-radius: 50%; box-shadow: 0 6rpx 20rpx rgba(33,71,66,.13); }
.avatar-placeholder { display: flex; align-items: center; justify-content: center; color: var(--dk-feature-brand,#2f6f6a); background: var(--dk-feature-brand-soft,#e4f0ee); font-size: 34rpx; }
.inviter-copy { min-width: 0; }
.inviter-name,.inviter-action { display: block; }
.inviter-name { font-size: 30rpx; font-weight: 700; }
.inviter-action { margin-top: 6rpx; color: #71817d; font-size: 23rpx; }
.day-card { margin-top: 32rpx; padding: 46rpx 34rpx; border-radius: 28rpx; color: #f8f5e9; text-align: center; background: linear-gradient(145deg, #245e58 0%, #173f3b 100%); box-shadow: inset 0 1rpx rgba(255,255,255,.16); }
.day-label,.day-title,.day-date,.day-copy,.space-copy { display: block; }
.day-label { color: #b8d6cf; font-size: 21rpx; letter-spacing: 7rpx; }
.day-title { margin-top: 24rpx; font-size: 43rpx; line-height: 1.35; font-weight: 720; }
.day-date { margin-top: 13rpx; color: #d3e2dd; font-size: 24rpx; }
.day-rule { width: 54rpx; height: 2rpx; margin: 30rpx auto; background: rgba(255,255,255,.35); }
.day-copy { color: rgba(255,255,255,.76); font-size: 23rpx; line-height: 1.7; }
.space-copy { margin-top: 18rpx; padding-top: 16rpx; border-top: 1rpx solid rgba(255,255,255,.18); color: rgba(255,255,255,.9); font-size: 22rpx; line-height: 1.6; }
.meta-row { display: flex; justify-content: space-between; gap: 20rpx; margin-top: 26rpx; color: #788682; font-size: 21rpx; }
.join-button,.ghost-button { border: 0; border-radius: 999rpx; font-weight: 700; }
.join-button { height: 92rpx; margin-top: 34rpx; color: #fff; background: #2f6f6a; font-size: 29rpx; line-height: 92rpx; box-shadow: 0 14rpx 32rpx rgba(47,111,106,.2); }
.join-button::after,.ghost-button::after { border: 0; }
.join-button[disabled] { color: #8d9996; background: #dce5e2; box-shadow: none; }
.privacy-copy { display: block; margin-top: 20rpx; color: #87938f; font-size: 20rpx; text-align: center; }
.state-card { position: relative; z-index: 1; display: flex; min-height: 440rpx; flex-direction: column; align-items: center; justify-content: center; padding: 42rpx; border-radius: 32rpx; background: rgba(255,255,255,.88); color: #657570; text-align: center; }
.loading-dot { width: 28rpx; height: 28rpx; margin-bottom: 22rpx; border: 5rpx solid #c8d9d5; border-top-color: #2f6f6a; border-radius: 50%; animation: spin .8s linear infinite; }
.state-mark { display: flex; width: 72rpx; height: 72rpx; align-items: center; justify-content: center; border-radius: 50%; color: #9a6a5e; background: #f2e7e2; font-size: 38rpx; }
.state-title { margin-top: 24rpx; color: #263d39; font-size: 30rpx; font-weight: 700; }
.state-copy { margin-top: 12rpx; font-size: 23rpx; line-height: 1.6; }
.ghost-button { width: 260rpx; height: 76rpx; margin-top: 32rpx; color: #2f6f6a; background: #e0efeb; font-size: 25rpx; line-height: 76rpx; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
