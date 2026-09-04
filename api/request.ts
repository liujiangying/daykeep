const STORAGE_ACCESS = 'dk_access_token'
const STORAGE_REFRESH = 'dk_refresh_token'
const LOGIN_PAGE = '/pages/login/login'

let _redirecting = false
function redirectToLogin() {
  if (_redirecting) return
  _redirecting = true
  uni.reLaunch({
    url: LOGIN_PAGE,
    complete: () => {
      setTimeout(() => {
        uni.showToast({ title: '登录已失效，请重新登录', icon: 'none', duration: 2500 })
        _redirecting = false
      }, 80)
    },
  })
}

/**
 * 小程序必须配绝对 HTTPS 地址（云端 API）。
 * 优先读 VITE_API_BASE；兼容旧的 VITE_MOBILE_API_BASE。
 * H5 本地可以使用相对地址走 Vite 代理；小程序发布前必须注入 HTTPS API 地址。
 */
const DEFAULT_API_BASE = ''

function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_MOBILE_API_BASE) as
    | string
    | undefined
  // 显式空字符串才视为「未配置」时用默认；避免 undefined 时误打相对路径
  const fromEnv = raw == null || raw === '' ? DEFAULT_API_BASE : raw
  return fromEnv.replace(/\/$/, '')
}

export const API_BASE = resolveApiBase()

export function getAccessToken(): string {
  try {
    return uni.getStorageSync(STORAGE_ACCESS) || ''
  } catch {
    return ''
  }
}
export function getRefreshToken(): string {
  try {
    return uni.getStorageSync(STORAGE_REFRESH) || ''
  } catch {
    return ''
  }
}
export function setTokens(access: string, refresh: string) {
  uni.setStorageSync(STORAGE_ACCESS, access)
  uni.setStorageSync(STORAGE_REFRESH, refresh)
}
export function clearTokens() {
  uni.removeStorageSync(STORAGE_ACCESS)
  uni.removeStorageSync(STORAGE_REFRESH)
}

interface Resp<T> {
  code: number
  msg?: string
  data?: T
}

interface ReqOpts {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: any
  skipAuth?: boolean
  timeout?: number
  _retry?: boolean
}

let refreshing: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const rt = getRefreshToken()
    if (!rt) return false
    try {
      const data = await rawRequest<{ accessToken: string; refreshToken: string }>({
        url: '/api/auth/refresh',
        method: 'POST',
        data: { refreshToken: rt },
        skipAuth: true,
      })
      if (data?.accessToken && data?.refreshToken) {
        setTokens(data.accessToken, data.refreshToken)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

async function rawRequest<T>(opts: ReqOpts): Promise<T> {
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (!opts.skipAuth) {
    const token = getAccessToken()
    if (token) header.Authorization = `Bearer ${token}`
  }

  const res = await new Promise<UniApp.RequestSuccessCallbackResult>((resolve, reject) => {
    uni.request({
      url: API_BASE + opts.url,
      method: (opts.method || 'GET') as UniApp.RequestOptions['method'],
      data: opts.data,
      header,
      timeout: opts.timeout || 20000,
      success: resolve,
      fail: (err) => {
        const msg = (err as { errMsg?: string })?.errMsg || 'network error'
        let userMsg = '网络请求失败，请稍后重试'
        if (msg.includes('timeout')) userMsg = '请求超时，请检查网络后重试'
        else if (msg.includes('abort')) userMsg = '请求已取消'
        else if (msg.includes('fail')) userMsg = '网络连接失败，请检查网络设置'
        // App 端统一 toast 提示网络异常
        uni.showToast({ title: userMsg, icon: 'none', duration: 2000 })
        reject(new Error(userMsg))
      },
    })
  })

  const status = res.statusCode || 0
  const body = res.data as Resp<T>

  if (status === 401 && !opts.skipAuth && !opts._retry) {
    const ok = await doRefresh()
    if (ok) return rawRequest({ ...opts, _retry: true })
    clearTokens()
    // 自动跳转登录页，避免白屏
    redirectToLogin()
    throw new Error('未登录')
  }

  if (status >= 400 || (body && body.code && body.code !== 0)) {
    const gatewayHint =
      status === 403
        ? '网关拒绝访问(403)，请连办公网/VPN 后再试'
        : status === 502 || status === 503
          ? `服务暂时不可用(${status})，请稍后重试`
          : ''
    const fromBody =
      body && typeof body === 'object' && typeof body.msg === 'string' && body.msg ? body.msg : ''
    throw new Error(fromBody || gatewayHint || `请求失败(${status})`)
  }
  // 微信开发者工具的上传压缩器在部分版本中无法解析空值合并运算符（??）。
  // 保持相同语义，同时使用更保守的 ES 语法，避免上传阶段报“非法的文件”。
  return (body && body.data !== undefined && body.data !== null ? body.data : body) as T
}

export async function request<T>(opts: ReqOpts): Promise<T> {
  return rawRequest<T>(opts)
}
