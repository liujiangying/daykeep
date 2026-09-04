<template>
  <view class="page" :class="{ 'theme-mono': themeId === 'mono' }" :style="pageStyle">
    <view class="safe-top" :style="{ height: navHeight + 'px' }" />
    <scroll-view scroll-y class="scroll">
      <view class="value-card">
        <text class="value-title">世界很大，这里只我们</text>
        <text class="value-copy">有些生活不必公开，只想留给我们。</text>
        <view class="value-points">
          <view><text>随手记</text><text>写下此刻</text></view>
          <view><text>共同约定</text><text>约好未来</text></view>
          <view><text>时间胶囊</text><text>留给以后</text></view>
        </view>
      </view>

      <view class="section-head">
        <view>
          <text class="section-title">先从哪里开始？</text>
          <text class="section-copy">之后可以随时切换或创建新空间</text>
        </view>
      </view>

      <view class="official-choice" :class="{ joining: joiningOfficial }" @tap="joinOfficial">
        <view class="official-mark">✦</view>
        <view class="choice-copy">
          <view class="official-title-row">
            <text class="choice-title">先去官方体验圈看看</text>
            <text class="official-badge">公开</text>
          </view>
          <text class="choice-desc">看看大家如何记录，再决定要不要创建自己的圈子</text>
        </view>
        <text class="choice-arrow">{{ joiningOfficial ? '…' : '›' }}</text>
      </view>

      <view class="personal-choice" @tap="choose('personal')">
        <view class="choice-copy">
          <text class="choice-title">只属于我</text>
          <text class="choice-desc">安静记录自己的生活</text>
        </view>
        <text class="choice-arrow">›</text>
      </view>

      <view class="shared-choice" @tap="choose('group')">
        <view class="choice-copy">
          <text class="choice-title">和亲友一起</text>
          <text class="choice-desc">创建私密空间，邀请重要的人</text>
        </view>
        <text class="choice-arrow">›</text>
      </view>

      <button class="skip" @tap="skip"><text>先看看再决定</text><text class="skip-arrow">›</text></button>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { completeOnboarding } from '@/services/onboarding'
import { joinOfficialExperienceSpace } from '@/services/spaces'
import { setPreferredSpaceId } from '@/services/spacePreference'
import { trackProductEvent } from '@/services/analytics'

const { pageStyle, themeId } = useThemePage()
const navHeight = ref(64)
const joiningOfficial = ref(false)

function measureNav() {
  try {
    const system = uni.getSystemInfoSync()
    navHeight.value = (system.statusBarHeight || 20) + 44
    // #ifdef MP-WEIXIN
    const menu = uni.getMenuButtonBoundingClientRect()
    if (menu?.bottom) navHeight.value = menu.bottom + Math.max(8, menu.top - (system.statusBarHeight || 20))
    // #endif
  } catch { /* use safe default */ }
}

function enterTimeline() {
  uni.switchTab({ url: '/pages/timeline/index' })
}

function skip() {
  void trackProductEvent('onboarding_skipped')
  completeOnboarding()
  enterTimeline()
}

async function joinOfficial() {
  if (joiningOfficial.value) return
  joiningOfficial.value = true
  try {
    const space = await joinOfficialExperienceSpace()
    void trackProductEvent('official_space_joined', { source: 'onboarding' })
    setPreferredSpaceId(space.id)
    completeOnboarding()
    enterTimeline()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '暂时无法加入，请稍后再试', icon: 'none' })
  } finally {
    joiningOfficial.value = false
  }
}

function choose(kind: 'personal' | 'pair' | 'group') {
  void trackProductEvent(kind === 'personal' ? 'onboarding_personal_selected' : 'onboarding_private_space_selected', { kind })
  completeOnboarding()
  if (kind === 'personal') {
    enterTimeline()
    return
  }
  uni.redirectTo({ url: `/subpackages/space/create?type=${kind}&invite=1&onboarding=1` })
}

onLoad(() => {
  measureNav()
  void trackProductEvent('onboarding_viewed')
})
</script>

<style scoped lang="scss">
.page{display:flex;height:100vh;overflow:hidden;flex-direction:column;background:var(--dk-bg,#f5f7f6);color:var(--dk-ink,#1c2423);box-sizing:border-box}
.safe-top{flex-shrink:0}.scroll{flex:1;height:0;box-sizing:border-box;padding:20rpx 32rpx calc(42rpx + env(safe-area-inset-bottom))}
.value-card{padding:40rpx 36rpx;border:1rpx solid rgba(47,111,106,.12);border-radius:44rpx;background:linear-gradient(145deg,#eef7f4,#fff7ea);box-shadow:0 20rpx 56rpx rgba(28,54,49,.08)}
.value-title{display:block;font-size:50rpx;font-weight:800;letter-spacing:-.04em;line-height:1.2}
.value-copy{display:block;margin-top:16rpx;color:#5c6864;font-size:27rpx;line-height:1.65}
.value-points{display:grid;grid-template-columns:repeat(3,1fr);gap:16rpx;margin-top:32rpx}
.value-points view{min-height:112rpx;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:24rpx;background:rgba(255,255,255,.76)}
.value-points text:first-child{color:var(--dk-brand,#2f6f6a);font-size:26rpx;font-weight:750}.value-points text:last-child{margin-top:6rpx;color:var(--dk-muted,#6b736f);font-size:21rpx}
.section-head{display:flex;align-items:flex-end;justify-content:space-between;padding:36rpx 6rpx 18rpx}.section-title{display:block;font-size:36rpx;font-weight:780;letter-spacing:-.025em}.section-copy{display:block;margin-top:5rpx;color:var(--dk-muted,#6b736f);font-size:21rpx}
.official-choice,.personal-choice{display:flex;align-items:center;gap:20rpx;min-height:118rpx;padding:20rpx 24rpx;border:1rpx solid rgba(47,111,106,.12);border-radius:28rpx;box-shadow:0 10rpx 28rpx rgba(31,61,57,.04);box-sizing:border-box}.official-choice{margin-bottom:16rpx;background:linear-gradient(135deg,var(--dk-brand,#2f6f6a),#214f4b);box-shadow:0 16rpx 36rpx rgba(36,85,80,.18)}.official-choice .choice-title{color:#fff}.official-choice .choice-desc{color:rgba(255,255,255,.7)}.official-choice .choice-arrow{color:#fff}.official-choice.joining{opacity:.72}.official-mark{display:flex;width:66rpx;height:66rpx;flex-shrink:0;align-items:center;justify-content:center;border:1rpx solid rgba(255,255,255,.24);border-radius:22rpx;color:#fff;background:rgba(255,255,255,.12);font-size:26rpx}.official-title-row{display:flex;align-items:center;gap:10rpx}.official-badge{padding:4rpx 10rpx;border-radius:999rpx;color:#fff;background:rgba(255,255,255,.15);font-size:17rpx;font-weight:650}.personal-choice{background:linear-gradient(135deg,var(--dk-brand-soft,#e4f0ee),rgba(255,255,255,.84))}.official-choice:active,.personal-choice:active,.shared-choice:active,.skip:active{opacity:.68}
.choice-copy{min-width:0;flex:1}.choice-title{display:block;color:var(--dk-ink,#1c2423);font-size:28rpx;font-weight:740;line-height:1.35}.choice-desc{display:block;margin-top:5rpx;overflow:hidden;color:var(--dk-muted,#6b736f);font-size:21rpx;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}.choice-arrow{color:var(--dk-brand,#2f6f6a);font-size:34rpx;font-weight:400}
.shared-choice{display:flex;min-width:0;min-height:118rpx;margin-top:16rpx;padding:20rpx 24rpx;align-items:center;gap:20rpx;border:1rpx solid rgba(47,111,106,.09);border-radius:28rpx;background:rgba(255,255,255,.78);box-shadow:0 10rpx 28rpx rgba(31,61,57,.035);box-sizing:border-box}.shared-choice .choice-arrow{font-size:34rpx}
.skip{position:relative;width:100%;height:88rpx;margin:20rpx 0 0;padding:0 64rpx;border:1rpx solid rgba(47,111,106,.18);border-radius:24rpx;color:var(--dk-brand,#2f6f6a);background:rgba(255,255,255,.62);font-size:25rpx;font-weight:650;line-height:88rpx;text-align:center;box-sizing:border-box}.skip::after{border:0}.skip-arrow{position:absolute;right:28rpx;top:0;color:var(--dk-brand,#2f6f6a);font-size:32rpx;font-weight:400;line-height:88rpx}

/* 极简黑白主题：珍珠白玻璃为主，香槟黄只做微量点缀。 */
.theme-mono .personal-choice,
.theme-mono .shared-choice,
.theme-mono .skip {
  overflow: hidden;
  border: 1rpx solid rgba(116, 111, 98, .18);
  box-shadow:
    inset 0 2rpx 0 rgba(255, 255, 255, .96),
    inset 0 -1rpx 0 rgba(76, 70, 58, .08),
    0 14rpx 32rpx rgba(49, 45, 37, .085),
    0 3rpx 9rpx rgba(49, 45, 37, .045);
  backdrop-filter: blur(22rpx) saturate(120%);
  -webkit-backdrop-filter: blur(22rpx) saturate(120%);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.theme-mono .personal-choice,
.theme-mono .shared-choice {
  background:
    radial-gradient(circle at 100% -35%, rgba(235, 190, 74, .13), transparent 45%),
    radial-gradient(circle at 8% -55%, rgba(255, 255, 255, .98), transparent 52%),
    linear-gradient(135deg, rgba(252, 252, 250, .94), rgba(232, 232, 227, .72));
}
.theme-mono .skip {
  color: #34332f;
  background:
    radial-gradient(circle at 86% -80%, rgba(235, 190, 74, .09), transparent 46%),
    linear-gradient(135deg, rgba(250, 250, 248, .9), rgba(230, 230, 226, .68));
}
.theme-mono .personal-choice .choice-arrow,
.theme-mono .shared-choice .choice-arrow { color:#7b725f; }
.theme-mono .skip-arrow { color:#716d63; }
.theme-mono .personal-choice:active,
.theme-mono .shared-choice:active,
.theme-mono .skip:active {
  opacity: 1;
  transform: translateY(2rpx) scale(.992);
  box-shadow:
    inset 0 2rpx 5rpx rgba(66, 61, 50, .1),
    inset 0 1rpx 0 rgba(255, 255, 255, .74),
    0 7rpx 18rpx rgba(49, 45, 37, .07);
}

</style>
