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
  color: var(--dk-ink, #1c2423);
  background-color: var(--dk-bg, #f2f4f3);
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

  /* ===== 统一令牌：圆角 / 间距 / 动效（静态，全主题一致）=====
   * 主题相关令牌（阴影 / 危险色 / 纪念金 / 骨架色）由 services/theme.ts 注入。
   * 圆角阶梯吸收全站原有 12/14/16/18/20/22/24/30/32 等散乱取值：
   *   sm 12 标签、输入框、缩略图；md 18 按钮、列表行；lg 24 卡片；xl 32 大卡与弹层；pill 胶囊 */
  --dk-radius-sm: 12rpx;
  --dk-radius-md: 18rpx;
  --dk-radius-lg: 24rpx;
  --dk-radius-xl: 32rpx;
  --dk-radius-pill: 999rpx;

  /* 4rpx 基网格间距阶梯：1 元素内微间距 → 6 分区间大留白 */
  --dk-space-1: 8rpx;
  --dk-space-2: 16rpx;
  --dk-space-3: 24rpx;
  --dk-space-4: 32rpx;
  --dk-space-5: 48rpx;
  --dk-space-6: 64rpx;

  /* 动效节奏：按压等即时反馈用 fast，入场/面板过渡用 base；入场统一 ease-out */
  --dk-motion-fast: 140ms;
  --dk-motion-base: 240ms;
  --dk-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
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
  border: 1rpx solid var(--dk-danger-soft, #ead6d3);
  border-radius: var(--dk-radius-md, 16rpx);
  color: var(--dk-danger, #b64d46);
  background: transparent;
  font-size: var(--dk-fs-meta, 25rpx);
  font-weight: 500;
  line-height: 78rpx;
  transition: transform var(--dk-motion-fast, 140ms) var(--dk-ease-out), opacity var(--dk-motion-fast, 140ms) var(--dk-ease-out);
}

.danger-action::after {
  border: 0;
}

.danger-action--compact {
  display: inline-flex;
  width: auto;
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: var(--dk-radius-pill, 999rpx);
  font-size: 21rpx;
  line-height: 50rpx;
}

/* ─────────────── 统一交互基建 ─────────────── */

/* 按压态：可点元素加 hover-class="dk-press" 即获得「物理按压」反馈。
 * 注意 .dk-press 会覆盖元素自身 transform，依赖 transform 定位的元素
 * 请改用自带 transition 的基类（.dk-btn 等）或页面内自定义按压样式。 */
.dk-press {
  transform: scale(0.97);
  opacity: 0.75;
  transition: transform var(--dk-motion-fast, 140ms) var(--dk-ease-out), opacity var(--dk-motion-fast, 140ms) var(--dk-ease-out);
}

/* 按钮基类：主操作 --primary / 描边 --ghost / 柔和 --soft / 危险 --danger。
 * 自带 transition，配合 hover-class="dk-press" 按下与回弹都平滑。 */
.dk-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin: 0;
  padding: 0 var(--dk-space-4, 32rpx);
  border: 0;
  border-radius: var(--dk-radius-md, 18rpx);
  font-size: var(--dk-fs-label, 30rpx);
  font-weight: 600;
  line-height: 1;
  transition: transform var(--dk-motion-fast, 140ms) var(--dk-ease-out), opacity var(--dk-motion-fast, 140ms) var(--dk-ease-out), background-color var(--dk-motion-fast, 140ms) linear;
}

.dk-btn::after {
  border: 0;
}

.dk-btn--primary {
  background: var(--dk-brand, #2f6f6a);
  color: #fffeff;
}

.dk-btn--ghost {
  border: 1rpx solid var(--dk-line, #e2e6e4);
  background: transparent;
  color: var(--dk-ink, #1c2423);
}

.dk-btn--soft {
  background: var(--dk-brand-soft, #e4f0ee);
  color: var(--dk-brand, #2f6f6a);
}

.dk-btn--danger {
  background: var(--dk-danger-soft, #f3e5e3);
  color: var(--dk-danger, #b64d46);
}

/* 骨架屏：任意 view 加 .dk-skeleton 即获得微光扫过占位；
 * 结构化骨架用 components/DkSkeleton.vue 组合。 */
@keyframes dk-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.dk-skeleton {
  position: relative;
  overflow: hidden;
  background: var(--dk-skeleton-bg, #e7ecea);
}

.dk-skeleton::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--dk-skeleton-sheen, rgba(255, 255, 255, 0.65)), transparent);
  animation: dk-shimmer 1.6s infinite;
}

/* 入场动效：首屏内容交错淡入上移。用法：
 * <view class="dk-fade-up" :style="{ animationDelay: `${Math.min(i, 5) * 50}ms` }" /> */
@keyframes dk-fade-up {
  from { opacity: 0; transform: translateY(20rpx); }
  to { opacity: 1; transform: translateY(0); }
}

.dk-fade-up {
  animation: dk-fade-up var(--dk-motion-base, 240ms) var(--dk-ease-out) backwards;
}

/* 遮罩与底部弹层入场：配合 v-if 挂载即播放 */
@keyframes dk-fade {
  from { opacity: 0; }
}

.dk-mask-in {
  animation: dk-fade var(--dk-motion-fast, 140ms) ease-out backwards;
}

@keyframes dk-sheet-up {
  from { transform: translateY(20%); opacity: .7; }
}

.dk-sheet-up {
  animation: dk-sheet-up var(--dk-motion-base, 240ms) var(--dk-ease-out) backwards;
}

/* 底部安全区：固定操作条统一内边距 */
.dk-safe-bottom {
  padding-bottom: calc(env(safe-area-inset-bottom) + 24rpx);
}

/* 隐形扩大触控热区：小尺寸可点元素（× 关闭、清除等）加此类，
 * 视觉不变，命中区域向外扩一圈，对齐 88rpx 触控标准。 */
.dk-hit {
  position: relative;
}
.dk-hit::before {
  content: '';
  position: absolute;
  top: -16rpx;
  right: -16rpx;
  bottom: -16rpx;
  left: -16rpx;
}
</style>
