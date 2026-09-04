<template>
  <view class="page" :style="pageStyle">
    <view v-if="previewLoading" class="loading-card">
      <view class="loading-dot" />
      <text>正在打开邀请卡…</text>
    </view>

    <view v-else-if="preview" class="invite-card">
      <image v-if="preview.coverUrl || preview.firstImage" class="invite-cover" :src="preview.coverUrl || preview.firstImage" mode="aspectFill" />
      <view v-else class="invite-cover fallback-cover" />
      <view class="invite-content">
        <view class="member-stack"><view v-for="member in preview.members" :key="member.nickname" class="preview-avatar"><image v-if="member.avatarUrl" :src="member.avatarUrl" mode="aspectFill" /><text v-else>{{ member.nickname.slice(0,1) }}</text></view></view>
        <text class="invite-title">{{ preview.ownerNickname }} 邀请你加入</text>
        <text class="invite-space">{{ preview.spaceName }} · 已有 {{ preview.recordCount }} 条共同记录</text>
        <text v-if="preview.firstBody" class="first-memory">第一条：{{ preview.firstBody }}</text>
      </view>
    </view>

    <view v-else class="hero invalid-invite">
      <text class="eyebrow">时光圈邀请</text>
      <text class="title">这张邀请卡暂时打不开</text>
      <text class="subtitle">{{ errorText || '请从对方分享的微信邀请卡进入，或者请对方重新发送一张。' }}</text>
    </view>

    <button v-if="preview" class="submit" :disabled="joining" :loading="joining" @tap="submit">加入我们的时光</button>
    <button v-else-if="!previewLoading" class="back-home" @tap="goHome">返回只我们</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { getSpaceInvitePreview, joinSpaceByInvite, type SpaceInvitePreview } from '@/services/spaces'
import { setPreferredSpaceId } from '@/services/spacePreference'
import { isLoggedIn } from '@/services/auth'

const { pageStyle } = useThemePage()
const code = ref('')
const joining = ref(false)
const errorText = ref('')
const preview = ref<SpaceInvitePreview | null>(null)
const previewLoading = ref(false)
const POST_LOGIN_REDIRECT_KEY = 'dk_post_login_redirect'

async function loadPreview() {
  if (!code.value.trim()) return
  previewLoading.value = true
  try { preview.value = await getSpaceInvitePreview(code.value.trim()) }
  catch (error: any) { preview.value = null; errorText.value = error?.message || '邀请卡加载失败' }
  finally { previewLoading.value = false }
}

async function submit() {
  const finalCode = code.value.trim()
  if (joining.value || !finalCode) return
  errorText.value = ''
  if (!isLoggedIn()) {
    uni.setStorageSync(POST_LOGIN_REDIRECT_KEY, `/subpackages/space/join?code=${encodeURIComponent(finalCode)}`)
    uni.reLaunch({ url: '/pages/login/login' })
    return
  }
  joining.value = true
  try {
    const space = await joinSpaceByInvite(finalCode)
    setPreferredSpaceId(space.id)
    uni.showToast({ title: space.alreadyMember ? '你已在这个空间' : '已加入', icon: space.alreadyMember ? 'none' : 'success' })
    setTimeout(() => {
      uni.redirectTo({ url: `/subpackages/space/detail?spaceId=${encodeURIComponent(space.id)}` })
    }, 250)
  } catch (error: any) {
    // 邀请失效或已被使用都在这里如实提示，不再假装加入成功。
    errorText.value = error?.message || '加入失败，请让对方重新发送邀请卡'
    preview.value = null
  } finally {
    joining.value = false
  }
}

onLoad((query: any) => {
  code.value = String(query?.code || query?.inviteCode || '').trim()
  if (code.value) void loadPreview()
})

function goHome() {
  uni.switchTab({ url: '/pages/timeline/index' })
}
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 36rpx 32rpx calc(60rpx + env(safe-area-inset-bottom)); background: var(--dk-bg); color: var(--dk-ink); }
.hero { padding: 8rpx 4rpx 28rpx; }
.invalid-invite { padding-top: 100rpx; text-align: center; }
.eyebrow { display: block; color: var(--dk-brand); font-size: 23rpx; font-weight: 700; letter-spacing: .08em; }
.title { display: block; margin-top: 10rpx; font-size: 44rpx; font-weight: 780; line-height: 1.25; }
.subtitle { display: block; margin-top: 12rpx; color: var(--dk-muted); font-size: 26rpx; line-height: 1.55; }
.submit { width: 100%; height: 86rpx; margin: 34rpx 0 0; border: 0; border-radius: 999rpx; background: var(--dk-brand); color: #fff; font-size: 30rpx; font-weight: 720; line-height: 86rpx; }
.submit::after { border: 0; }
.submit[disabled] { opacity: .55; }
.back-home { width: 100%; height: 86rpx; margin: 28rpx 0 0; border: 1rpx solid var(--dk-line); border-radius: 999rpx; color: var(--dk-brand); background: var(--dk-surface); font-size: 28rpx; line-height: 84rpx; }.back-home::after { border: 0; }
.loading-card { display: flex; min-height: 360rpx; flex-direction: column; align-items: center; justify-content: center; gap: 24rpx; color: var(--dk-muted); font-size: 26rpx; }.loading-dot { width: 18rpx; height: 18rpx; border-radius: 50%; background: var(--dk-brand); box-shadow: 0 0 0 12rpx var(--dk-brand-soft); animation: breathe 1.2s ease-in-out infinite; }@keyframes breathe { 50% { opacity: .35; transform: scale(.85); } }
.invite-card{overflow:hidden;margin-bottom:26rpx;border-radius:30rpx;background:var(--dk-surface);box-shadow:0 18rpx 50rpx rgba(34,61,58,.09)}.invite-cover{display:block;width:100%;height:310rpx}.fallback-cover{background:linear-gradient(135deg,#89aaa4,#315e58 55%,#1b3935)}.invite-content{padding:30rpx;text-align:center}.member-stack{display:flex;justify-content:center;margin-top:-64rpx;margin-bottom:18rpx}.preview-avatar{display:flex;width:76rpx;height:76rpx;margin-left:-12rpx;align-items:center;justify-content:center;overflow:hidden;border:5rpx solid var(--dk-surface);border-radius:50%;color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);font-size:28rpx;font-weight:750}.preview-avatar:first-child{margin-left:0}.preview-avatar image{width:100%;height:100%}.invite-title{display:block;font-size:37rpx;font-weight:780}.invite-space{display:block;margin-top:10rpx;color:var(--dk-muted);font-size:25rpx}.first-memory{display:block;margin-top:20rpx;padding:20rpx;border-radius:18rpx;color:var(--dk-ink);background:var(--dk-bg-soft);font-size:24rpx;line-height:1.6;text-align:left}
</style>
