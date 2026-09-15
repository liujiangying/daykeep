<script lang="ts">
import { isLoggedIn, validateForegroundSession } from '@/services/auth'
import { scheduleAllReminders, requestNotificationPermission } from '@/services/localReminder'
import { API_BASE } from '@/api/request'

/** 启动阶段不做复杂跳转，登录页自行处理。 */
export default {
  onLaunch() {
    // #ifdef APP-PLUS
    // 请求通知权限
    requestNotificationPermission()
    // 监听网络状态变化
    uni.onNetworkStatusChange((res) => {
      if (!res.isConnected) {
        uni.showToast({ title: '网络已断开', icon: 'none', duration: 2000 })
      }
    })
    // 监听推送点击事件
    plus.push.addEventListener('click', (msg: any) => {
      try {
        const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload
        if (payload?.type === 'capsule' && payload?.entryId) {
          uni.navigateTo({ url: `/subpackages/notes/edit?id=${payload.entryId}` })
        } else if (payload?.entryId) {
          uni.navigateTo({ url: `/pages/timeline/detail?id=${payload.entryId}` })
        }
      } catch {}
    }, false)
    // #endif
  },
  async onShow() {
    // 本地 token 只代表"曾登录过"。回到前台先向公网 API 探活；短暂网络
    // 明确拒绝时统一回登录页，普通断网则继续保留离线缓存。
    if (isLoggedIn() && await validateForegroundSession()) scheduleAllReminders()

    // #ifdef APP-PLUS
    // App 版本更新检测
    this.checkAppUpdate()
    // #endif
  },
  onHide() {},
  methods: {
    // #ifdef APP-PLUS
    checkAppUpdate() {
      const currentVersion = plus.runtime.version || '0.0.0'
      uni.request({
        url: API_BASE + '/api/app/version',
        method: 'GET',
        success: (res) => {
          const data = (res.data as any)?.data
          if (!data?.version) return
          if (this.compareVersion(data.version, currentVersion) > 0) {
            uni.showModal({
              title: '发现新版本',
              content: data.desc || `新版本 ${data.version} 已发布，是否立即更新？`,
              confirmText: '立即更新',
              cancelText: '稍后再说',
              success: (r) => {
                if (r.confirm && data.downloadUrl) {
                  plus.runtime.openURL(data.downloadUrl)
                }
              },
            })
          }
        },
      })
    },
    compareVersion(v1: string, v2: string): number {
      const a = v1.split('.').map(Number)
      const b = v2.split('.').map(Number)
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] || 0) > (b[i] || 0)) return 1
        if ((a[i] || 0) < (b[i] || 0)) return -1
      }
      return 0
    },
    // #endif
  },
}
</script>

<style lang="scss">
page {
  /* 全站无衬线：可读、统一；不再混用宋体 */
  font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: var(--dk-fs-body, 32rpx);
  line-height: 1.55;
  color: #1c2423;
  background-color: #f2f4f3;
  box-sizing: border-box;

  /* 字号阶梯 → CSS 变量，页面可直接用 */
  --dk-fs-display: 46rpx;
  --dk-fs-title: 36rpx;
  --dk-fs-body: 32rpx;
  --dk-fs-label: 30rpx;
  --dk-fs-meta: 26rpx;
  --dk-fs-caption: 24rpx;
  --dk-fs-num: 44rpx;
  --dk-fs-hero: 68rpx;
}

view,
text,
scroll-view,
button,
input,
textarea,
image {
  box-sizing: border-box;
}

/* 全局危险操作：有明确点击区域，但保持为次级操作，不与主按钮争夺注意力。 */
.danger-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 80rpx;
  margin-left: 0;
  margin-right: 0;
  padding: 0 24rpx;
  border: 1rpx solid #ead6d3;
  border-radius: 16rpx;
  color: #b64d46;
  background: #fffafa;
  font-size: var(--dk-fs-meta, 25rpx);
  font-weight: 500;
  line-height: 78rpx;
}

.danger-action::after {
  border: 0;
}

.danger-action--compact {
  display: inline-flex;
  width: auto;
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  line-height: 50rpx;
}
</style>
