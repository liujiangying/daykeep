<template>
  <view class="login">
    <view class="brand">
      <text class="name">只我们</text>
      <text class="slogan">世界很大，这里只我们</text>
    </view>

    <view class="actions">
      <!-- #ifdef MP-WEIXIN -->
      <!-- 微信一键登录（仅小程序端） -->
      <button
        class="btn primary wx-btn"
        :loading="wxLoading || checking"
        :disabled="wxLoading || phoneLoading || checking"
        @tap="onWxLogin"
      >
        {{ checking ? '正在检查登录状态…' : '微信一键登录' }}
      </button>
      <!-- #endif -->

      <!-- 手机号登录 -->
      <template v-if="showPhoneLogin">
        <!-- #ifdef MP-WEIXIN -->
        <view class="divider">
          <view class="line"></view>
          <text class="divider-text">或</text>
          <view class="line"></view>
        </view>
        <!-- #endif -->

        <view class="phone-form">
          <view class="input-row">
            <text class="prefix">+86</text>
            <input
              v-model="phone"
              class="phone-input"
              type="number"
              maxlength="11"
              placeholder="请输入手机号"
            />
          </view>
          <view class="input-row">
            <input
              v-model="smsCode"
              class="code-input"
              type="number"
              maxlength="6"
              placeholder="短信验证码"
            />
            <button
              class="send-btn"
              :disabled="countdown > 0 || !isPhoneValid"
              @tap="onSendCode"
            >{{ countdown > 0 ? `${countdown}s` : '获取验证码' }}</button>
          </view>
          <button
            class="btn primary"
            :loading="phoneLoading"
            :disabled="!canPhoneLogin || wxLoading"
            @tap="onPhoneLogin"
          >手机号登录</button>
        </view>
      </template>

      <!-- 开发者一键登录：仅在后端开放 dev-login 的本地/测试环境出现 -->
      <template v-if="devAvailable">
        <view class="divider">
          <view class="line"></view>
          <text class="divider-text">开发者调试</text>
          <view class="line"></view>
        </view>
        <view class="dev-row">
          <button
            v-for="p in DEV_PHONES"
            :key="p.phone"
            class="btn dev-btn"
            :loading="devLoading === p.phone"
            :disabled="!!devLoading || wxLoading || phoneLoading"
            @tap="onDevLogin(p.phone)"
          >{{ p.label }}</button>
        </view>
        <text class="dev-hint">仅测试环境可用，正式环境不会出现</text>
      </template>

      <text class="tip">登录即表示同意用户协议与隐私政策</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 登录页：微信一键登录（主路径）
 * - 手机号登录待 SMS 配置就绪后打开 showPhoneLogin
 * - 已登录时 ensureSession 探活，有效直接进首页
 * - 暂时网络/网关异常时保留已有会话
 */
import { onMounted, ref, computed } from 'vue'
import {
  wxLogin,
  phoneLogin,
  sendSmsCode,
  isLoggedIn,
  fetchMe,
  logout,
  devLogin,
  isDevLoginAvailable,
  isTransientAccessError,
  isSessionBoundaryError,
  needsInitialProfileSetup,
} from '@/services/auth'
import { shouldShowOnboarding } from '@/services/onboarding'

const wxLoading = ref(false)
const phoneLoading = ref(false)
const checking = ref(true)

/**
 * 开发者一键登录入口。
 * 生产构建直接不探测；非生产构建也要后端 /api/auth/dev-login 返回 200 才显示，
 * 所以线上/预发即便误打了 dev 包也不会露出这个按钮。
 */
const DEV_PHONES = [
  { phone: '13900000001', label: '测试号 A' },
  { phone: '13900000002', label: '测试号 B' },
]
const devAvailable = ref(false)
const devLoading = ref('')
const phone = ref('')
const smsCode = ref('')
const countdown = ref(0)

/** 小程序端短信通道未配齐先隐藏；App 端始终显示手机号登录 */
let showPhoneLogin = false
// #ifdef APP-PLUS
showPhoneLogin = true
// #endif

const HOME = '/pages/timeline/index'
const POST_LOGIN_REDIRECT_KEY = 'dk_post_login_redirect'

const isPhoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value))
const canPhoneLogin = computed(() => isPhoneValid.value && /^\d{6}$/.test(smsCode.value))

let countdownTimer: ReturnType<typeof setInterval> | null = null

async function goHome() {
  const shouldPromptProfile = await needsInitialProfileSetup()
  const openProfileFirst = (next: string) => {
    uni.reLaunch({
      url: `/subpackages/mine/edit?fromLogin=1&next=${encodeURIComponent(next)}`,
    })
  }
  let redirect = ''
  try {
    const pending = String(uni.getStorageSync(POST_LOGIN_REDIRECT_KEY) || '')
    // 只接受本应用的邀请落地页，避免把本地存储变成任意跳转入口。
    if (/^\/pages\/(?:day\/invite|space\/join)\?code=[A-Za-z0-9_-]+$/.test(pending)) redirect = pending
    uni.removeStorageSync(POST_LOGIN_REDIRECT_KEY)
  } catch {
    /* use home */
  }
  if (redirect) {
    if (shouldPromptProfile) openProfileFirst(redirect)
    else uni.reLaunch({ url: redirect, fail: () => uni.reLaunch({ url: HOME }) })
    return
  }
  if (shouldShowOnboarding()) {
    // 首次使用先让用户选择去向，资料引导由 onboarding 在选择后展示。
    uni.reLaunch({ url: '/pages/onboarding/index' })
    return
  }
  if (shouldPromptProfile) {
    openProfileFirst(HOME)
    return
  }
  uni.switchTab({
    url: HOME,
    fail: () => {
      uni.reLaunch({ url: HOME })
    },
  })
}

/** 本地有 token 不等于会话有效：需向公网 API 探活。 */
async function ensureSession(): Promise<boolean> {
  if (!isLoggedIn()) return false
  try {
    await fetchMe()
    return true
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (isSessionBoundaryError(e)) {
      await logout()
    } else if (isTransientAccessError(e)) {
      uni.showToast({ title: '暂时无法连接服务，请检查网络后重试', icon: 'none', duration: 2500 })
    } else {
      uni.showToast({ title: msg || '登录状态已失效', icon: 'none' })
    }
    return false
  }
}

onMounted(async () => {
  try {
    if (await ensureSession()) await goHome()
  } finally {
    checking.value = false
  }
  // 生产构建不发这次探测请求；即便 PROD 未注入，后端 404 也会让入口保持隐藏
  if (!import.meta.env.PROD) {
    devAvailable.value = await isDevLoginAvailable()
  }
})

async function onDevLogin(phoneNumber: string) {
  if (devLoading.value) return
  devLoading.value = phoneNumber
  try {
    await devLogin(phoneNumber)
    uni.showToast({ title: '登录成功', icon: 'success' })
    await goHome()
  } catch (e: any) {
    uni.showToast({ title: e?.message || '开发者登录失败', icon: 'none' })
  } finally {
    devLoading.value = ''
  }
}

async function onWxLogin() {
  wxLoading.value = true
  try {
    await wxLogin()
    uni.showToast({ title: '登录成功', icon: 'success' })
    await goHome()
  } catch (e: any) {
    const msg = String(e?.message || '微信登录失败')
    uni.showToast({
      title: msg.includes('403') || msg.includes('网关') ? '服务暂时无法访问，请稍后重试' : msg,
      icon: 'none',
    })
  } finally {
    wxLoading.value = false
  }
}

async function onSendCode() {
  if (!isPhoneValid.value || countdown.value > 0) return
  try {
    await sendSmsCode(phone.value)
    uni.showToast({ title: '验证码已发送', icon: 'success' })
    countdown.value = 60
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  } catch (e: any) {
    uni.showToast({ title: e?.message || '发送失败', icon: 'none' })
  }
}

async function onPhoneLogin() {
  if (!canPhoneLogin.value) return
  phoneLoading.value = true
  try {
    await phoneLogin(phone.value, smsCode.value)
    uni.showToast({ title: '登录成功', icon: 'success' })
    await goHome()
  } catch (e: any) {
    const msg = String(e?.message || '登录失败')
    uni.showToast({
      title: msg.includes('403') || msg.includes('网关') ? '服务暂时无法访问，请稍后重试' : msg,
      icon: 'none',
    })
  } finally {
    phoneLoading.value = false
  }
}

</script>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48rpx;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #fff 0%, #f2f4f3 100%);
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 80rpx;
}
.name {
  font-size: var(--dk-fs-hero, 64rpx);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: #1c2423;
}
.slogan {
  font-size: var(--dk-fs-label, 26rpx);
  color: #6b736f;
  margin-top: 20rpx;
}
.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}
.btn {
  width: 100%;
  border-radius: 14rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: var(--dk-fs-body, 28rpx);
  border: none;
}
.btn::after {
  border: none;
}
.btn.primary {
  background: #2f6f6a;
  color: #fff;
}
.btn.primary[disabled] {
  background: #a8c5c3;
  color: #fff;
}
.btn.primary.wx-btn {
  position: relative;
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border: 1rpx solid rgba(105, 123, 125, 0.28);
  border-radius: 24rpx;
  color: #202725;
  background:
    radial-gradient(circle at 18% -70%, rgba(255, 255, 255, 1) 0, rgba(255, 255, 255, 0.78) 34%, transparent 58%),
    linear-gradient(135deg, rgba(249, 252, 252, 0.94), rgba(216, 226, 228, 0.82));
  box-shadow:
    inset 0 2rpx 0 rgba(255, 255, 255, 0.96),
    inset 0 -2rpx 0 rgba(67, 84, 85, 0.16),
    0 18rpx 42rpx rgba(35, 47, 45, 0.17),
    0 4rpx 12rpx rgba(35, 47, 45, 0.1);
  backdrop-filter: blur(24rpx) saturate(135%);
  -webkit-backdrop-filter: blur(24rpx) saturate(135%);
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.btn.primary.wx-btn::before {
  position: absolute;
  top: 8rpx;
  right: 26rpx;
  left: 26rpx;
  height: 1rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.92);
  content: '';
  pointer-events: none;
}
.btn.primary.wx-btn::after {
  position: absolute;
  inset: 3rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.62);
  border-radius: 21rpx;
  content: '';
  pointer-events: none;
}
.btn.primary.wx-btn:active:not([disabled]) {
  transform: translateY(2rpx) scale(0.992);
  background:
    radial-gradient(circle at 18% -70%, rgba(255, 255, 255, 0.92) 0, rgba(255, 255, 255, 0.62) 34%, transparent 58%),
    linear-gradient(135deg, rgba(235, 241, 241, 0.94), rgba(204, 216, 218, 0.84));
  box-shadow:
    inset 0 2rpx 5rpx rgba(60, 72, 70, 0.1),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.76),
    0 7rpx 18rpx rgba(35, 47, 45, 0.1);
}
.btn.primary.wx-btn[disabled] {
  color: #8b9290;
  border-color: rgba(123, 137, 138, 0.18);
  background: linear-gradient(135deg, rgba(247, 249, 249, 0.8), rgba(224, 230, 231, 0.66));
  box-shadow:
    inset 0 1rpx 0 rgba(255, 255, 255, 0.86),
    0 10rpx 24rpx rgba(35, 47, 45, 0.08);
}

/* 分割线 */
.divider {
  display: flex;
  align-items: center;
  width: 100%;
  margin: 16rpx 0;
}
.divider .line {
  flex: 1;
  height: 1rpx;
  background: #e0e3e2;
}
.divider-text {
  padding: 0 24rpx;
  font-size: 24rpx;
  color: #999;
}

/* 开发者登录 */
.dev-row {
  display: flex;
  width: 100%;
  gap: 20rpx;
}
.dev-btn {
  flex: 1;
  background: #f2f4f3;
  color: #2f6f6a;
  border: 1rpx solid #cfdad8;
}
.dev-btn[disabled] {
  color: #9bb0ad;
}
.dev-hint {
  font-size: 22rpx;
  color: #9aa39f;
}

/* 手机号表单 */
.phone-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.input-row {
  display: flex;
  align-items: center;
  height: 88rpx;
  background: #f7f8f7;
  border-radius: 14rpx;
  padding: 0 24rpx;
  border: 1rpx solid #e8ebe9;
}
.prefix {
  font-size: 28rpx;
  color: #333;
  margin-right: 16rpx;
  font-weight: 500;
}
.phone-input {
  flex: 1;
  height: 88rpx;
  font-size: 28rpx;
}
.code-input {
  flex: 1;
  height: 88rpx;
  font-size: 28rpx;
}
.send-btn {
  font-size: 24rpx;
  color: #2f6f6a;
  background: transparent;
  border: none;
  padding: 0 8rpx;
  height: auto;
  line-height: 1.5;
  white-space: nowrap;
}
.send-btn[disabled] {
  color: #aaa;
}
.send-btn::after {
  border: none;
}

.tip {
  font-size: var(--dk-fs-meta, 24rpx);
  color: #999;
  margin-top: 8rpx;
  text-align: center;
  line-height: 1.5;
}
</style>
