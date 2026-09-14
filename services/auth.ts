import { request, setTokens, clearTokens, getAccessToken } from '@/api/request'
import { syncHolidaySettings } from '@/services/holidays'
import { fetchUserPrefs } from '@/services/prefs'
import { setFontSize } from '@/services/theme'

export const DEFAULT_NICKNAME = '微信用户'
const STORAGE_USER_ID = 'dk_user_id'
const LOGIN_PAGE = '/pages/login/login'
const PUBLIC_PROFILE_PROMPT_PREFIX = 'dk_public_profile_prompt_at:'
const PUBLIC_PROFILE_PROMPT_INTERVAL = 7 * 24 * 60 * 60 * 1000

let validatingSession: Promise<boolean> | null = null
let redirectingToLogin = false

export interface DayKeepUser {
  id: string | number
  nickname: string
  avatarUrl: string
  phone?: string
  createdAt?: string
}

export function isLoggedIn(): boolean {
  return !!getAccessToken()
}

export function getCachedUserId(): string | number | '' {
  try {
    return uni.getStorageSync(STORAGE_USER_ID) || ''
  } catch {
    return ''
  }
}

function cacheUserId(userId: string | number) {
  try {
    uni.setStorageSync(STORAGE_USER_ID, String(userId))
  } catch {
    /* ignore */
  }
}

export function displayNickname(user: DayKeepUser | null | undefined): string {
  const n = user?.nickname?.trim()
  return n || DEFAULT_NICKNAME
}

export function hasCompleteProfile(user: DayKeepUser | null | undefined): boolean {
  const nickname = user?.nickname?.trim()
  return !!user?.avatarUrl && !!nickname && nickname !== DEFAULT_NICKNAME
}

/** 登录后判断是否需要优先引导用户设置头像和昵称。 */
export async function needsInitialProfileSetup(): Promise<boolean> {
  if (!isLoggedIn()) return false
  try {
    const user = await fetchMe()
    return !hasCompleteProfile(user)
  } catch {
    // 资料检查失败不阻塞登录主流程。
    return false
  }
}

/**
 * 在共同记录、分享等“资料会被别人看到”的场景轻量提醒。
 * 返回 true 表示继续当前操作；用户选择去设置时返回 false。
 */
export async function confirmProfileForSocialAction(action: 'share' | 'collaborate'): Promise<boolean> {
  try {
    const user = await fetchMe()
    if (hasCompleteProfile(user)) return true
  } catch {
    // 资料检查失败不额外阻断原操作，后续接口仍会正常校验登录状态。
    return true
  }

  return new Promise((resolve) => {
    uni.showModal({
      title: action === 'share' ? '分享前完善一下资料？' : '一起记之前，先介绍自己',
      content: action === 'share'
        ? '设置头像和昵称，朋友打开分享时更容易认出你。'
        : '设置头像和昵称，对方加入后就知道是谁在和 TA 一起记录。',
      confirmText: '去设置',
      cancelText: '暂时继续',
      success: (result) => {
        if (result.confirm) {
          uni.navigateTo({ url: '/subpackages/mine/edit' })
          resolve(false)
          return
        }
        resolve(true)
      },
      fail: () => resolve(true),
    })
  })
}

/**
 * 公开发布前低频提醒完善资料。返回 false 表示已跳转资料页，本次暂不发布。
 */
export async function confirmProfileForPublicPublish(): Promise<boolean> {
  let user: DayKeepUser
  try {
    user = await fetchMe()
    if (hasCompleteProfile(user)) return true
  } catch {
    return true
  }

  const promptKey = `${PUBLIC_PROFILE_PROMPT_PREFIX}${user.id}`
  try {
    const promptedAt = Number(uni.getStorageSync(promptKey) || 0)
    if (promptedAt && Date.now() - promptedAt < PUBLIC_PROFILE_PROMPT_INTERVAL) return true
  } catch {
    // 本地记录不可用时仍可展示一次提醒。
  }

  return new Promise((resolve) => {
    uni.showModal({
      title: '公开发布前，介绍一下自己？',
      content: '设置头像和昵称，大家看到这条记录时更容易认出你。',
      confirmText: '去设置',
      cancelText: '继续发布',
      confirmColor: '#2f6f6a',
      success: ({ confirm }) => {
        try { uni.setStorageSync(promptKey, Date.now()) } catch { /* ignore */ }
        if (confirm) {
          uni.navigateTo({ url: '/subpackages/mine/edit' })
          resolve(false)
          return
        }
        resolve(true)
      },
      fail: () => resolve(true),
    })
  })
}

/** 登录后同步偏好设置 */
async function postLoginSync() {
  await syncHolidaySettings().catch(() => undefined)
  await fetchUserPrefs()
    .then((prefs) => {
      const fontSize =
        prefs.fontSize === 'small' || prefs.fontSize === 'medium' || prefs.fontSize === 'large'
          ? prefs.fontSize
          : 'standard'
      setFontSize(fontSize)
    })
    .catch(() => undefined)
}

/** 微信登录：小程序走 jscode2session；App 走开放平台 OAuth */
export async function wxLogin(): Promise<{ userId: number }> {
  const code = await new Promise<string>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (r) => (r.code ? resolve(r.code) : reject(new Error('wx.login 无 code'))),
      fail: (e) => reject(e),
    })
  })

  // 小程序必须传 mp；只有 App 才走开放平台凭证。
  // ESLint 不解析条件编译，会把这个初始值当成「赋了值却没被读取」，
  // 但 APP-PLUS 之外的平台读的正是这个 'mp'。
  // eslint-disable-next-line no-useless-assignment
  let platform: 'mp' | 'app' = 'mp'
  // #ifdef APP-PLUS
  platform = 'app'
  // #endif

  const data = await request<{ userId: number; accessToken: string; refreshToken: string }>({
    url: '/api/auth/wx-login',
    method: 'POST',
    data: { code, platform },
    skipAuth: true,
  })
  setTokens(data.accessToken, data.refreshToken)
  cacheUserId(data.userId)
  await postLoginSync()
  return { userId: data.userId }
}

/** 发送短信验证码 */
export async function sendSmsCode(phone: string): Promise<void> {
  await request<{ msg: string }>({
    url: '/api/auth/sms-send',
    method: 'POST',
    data: { phone },
    skipAuth: true,
  })
}

/** 手机号验证码登录 */
export async function phoneLogin(phone: string, code: string): Promise<{ userId: number }> {
  const data = await request<{ userId: number; accessToken: string; refreshToken: string }>({
    url: '/api/auth/sms-login',
    method: 'POST',
    data: { phone, code },
    skipAuth: true,
  })
  setTokens(data.accessToken, data.refreshToken)
  cacheUserId(data.userId)
  await postLoginSync()
  return { userId: data.userId }
}

/**
 * 开发者一键登录（仅本地/测试联调用）。
 * 后端 /api/auth/dev-login 在生产或未开启 ALLOW_DEV_LOGIN 时返回 404，
 * 因此这里不做额外环境判断也不会在生产环境登录成功。
 */
export async function devLogin(phone?: string): Promise<{ userId: number }> {
  const data = await request<{ userId: number; accessToken: string; refreshToken: string }>({
    url: '/api/auth/dev-login',
    method: 'POST',
    data: phone ? { phone } : {},
    skipAuth: true,
  })
  setTokens(data.accessToken, data.refreshToken)
  cacheUserId(data.userId)
  await postLoginSync()
  return { userId: data.userId }
}

/** 探测后端是否开放开发者登录，用于决定登录页是否展示入口 */
export async function isDevLoginAvailable(): Promise<boolean> {
  try {
    await request<{ phones: string[] }>({
      url: '/api/auth/dev-login',
      method: 'GET',
      skipAuth: true,
    })
    return true
  } catch {
    return false
  }
}

export async function fetchMe(): Promise<DayKeepUser> {
  const me = await request<DayKeepUser>({ url: '/api/auth/me' })
  if (me?.id != null) cacheUserId(me.id)
  return me
}

export async function updateMe(payload: {
  nickname?: string
  avatarUrl?: string
}): Promise<DayKeepUser> {
  return request<DayKeepUser>({
    url: '/api/auth/me',
    method: 'PATCH',
    data: payload,
  })
}

export async function bindPhoneWithWechatCode(code: string): Promise<DayKeepUser> {
  return request<DayKeepUser>({
    url: '/api/auth/bind-phone',
    method: 'POST',
    data: { code },
  })
}

export async function logout() {
  try {
    // 先通知服务端作废会话，再清本地；失败也清本地，避免卡在半登录态
    if (getAccessToken()) {
      await request({ url: '/api/auth/logout', method: 'POST' }).catch(() => undefined)
    }
  } catch {
    /* ignore */
  }
  clearTokens()
  try {
    uni.removeStorageSync(STORAGE_USER_ID)
  } catch {
    /* ignore */
  }
}

export function isSessionBoundaryError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || '')
  return message.includes('未登录')
}

export function isOfficeNetworkError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || '')
  return message.includes('403') || message.includes('办公网') || message.includes('网关拒绝')
}

/** 只有服务端明确判定未登录时才退出；403/网关故障不能清除有效会话。 */
export async function redirectToLoginForSessionError(error: unknown): Promise<boolean> {
  if (!isSessionBoundaryError(error)) return false
  if (redirectingToLogin) return true

  redirectingToLogin = true
  await logout()
  uni.reLaunch({
    url: LOGIN_PAGE,
    complete: () => {
      setTimeout(() => {
        uni.showToast({
          title: '登录状态已失效，请重新登录',
          icon: 'none',
          duration: 2500,
        })
        redirectingToLogin = false
      }, 80)
    },
  })
  return true
}

/** App 回到前台时探活，不能只凭本地 token 判断为已登录。 */
export async function validateForegroundSession(): Promise<boolean> {
  if (!isLoggedIn()) return false
  if (validatingSession) return validatingSession

  validatingSession = (async () => {
    try {
      await fetchMe()
      return true
    } catch (error) {
      if (await redirectToLoginForSessionError(error)) return false
      if (isOfficeNetworkError(error)) {
        uni.showToast({ title: '暂时无法验证登录状态，请检查网络', icon: 'none', duration: 2500 })
        return false
      }
      return true
    } finally {
      validatingSession = null
    }
  })()
  return validatingSession
}
