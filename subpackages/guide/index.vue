<template>
  <view class="page" :style="pageStyle">
    <view class="hero-card">
      <text class="eyebrow">使用指南</text>
      <text class="title">把我们的生活，留在这里</text>
      <text class="desc">记录今天，约好未来，也把一些话留给以后。</text>
    </view>

    <view class="section-head">
      <text class="section-title">从一件小事开始</text>
      <text class="section-desc">不需要一次做完所有事</text>
    </view>
    <view class="feature-list">
      <view class="feature-row">
        <view class="feature-copy">
          <text class="feature-title">记录此刻</text>
          <text class="feature-desc">一句话、一张照片，都能成为回忆</text>
        </view>
      </view>
      <view class="feature-row">
        <view class="feature-copy">
          <text class="feature-title">约定未来</text>
          <text class="feature-desc">记下一个日子，到时各自收到提醒</text>
        </view>
      </view>
      <view class="feature-row">
        <view class="feature-copy">
          <text class="feature-title">留给以后</text>
          <text class="feature-desc">把此刻封存，到期再一起打开</text>
        </view>
      </view>
      <view class="feature-row">
        <view class="feature-copy">
          <text class="feature-title">一起记录</text>
          <text class="feature-desc">邀请在乎的人，共享同一个空间</text>
        </view>
      </view>
    </view>

    <view class="guide-note">
      <view><text class="note-dot" /><text>内容保存在哪个空间，就只在那个空间展示</text></view>
      <view><text class="note-dot" /><text>共同约定会同步，提醒由每位成员独立开启</text></view>
    </view>

    <button class="primary" @tap="goTimeline">开始记录</button>
  </view>
</template>

<script setup lang="ts">
import { useThemePage } from '@/composables/useThemePage'
const { pageStyle } = useThemePage()
function goTimeline() { uni.switchTab({ url: '/pages/timeline/index' }) }
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 32rpx 32rpx calc(44rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: var(--dk-bg, #f2f4f3);
  color: var(--dk-ink, #1c2423);
}
.hero-card {
  position: relative;
  overflow: hidden;
  padding: 42rpx 36rpx 40rpx;
  border: 1rpx solid rgba(47,111,106,.11);
  border-radius: 38rpx;
  background: radial-gradient(circle at 92% 12%,rgba(255,235,190,.72),transparent 35%),linear-gradient(145deg,#edf7f4,#fffaf0);
  box-shadow: 0 18rpx 48rpx rgba(28,54,49,.065);
}
.eyebrow { display:block;color:var(--dk-brand,#2f6f6a);font-size:21rpx;font-weight:750;letter-spacing:.12em; }
.title { display:block;max-width:560rpx;margin-top:14rpx;font-size:44rpx;font-weight:800;letter-spacing:-.035em;line-height:1.22; }
.desc { display:block;max-width:540rpx;margin-top:16rpx;color:#5c6864;font-size:24rpx;line-height:1.6; }
.section-head { display:flex;align-items:flex-end;justify-content:space-between;gap:24rpx;padding:38rpx 6rpx 16rpx; }
.section-title { font-size:31rpx;font-weight:750; }
.section-desc { color:var(--dk-muted,#6b736f);font-size:20rpx;text-align:right; }
.feature-list { overflow:hidden;padding:0 26rpx;border:1rpx solid rgba(47,111,106,.075);border-radius:28rpx;background:rgba(255,255,255,.82);box-shadow:0 10rpx 30rpx rgba(31,61,57,.035); }
.feature-row { display:flex;min-height:116rpx;align-items:center;border-top:1rpx solid var(--dk-line,rgba(28,36,35,.08)); }
.feature-row:first-child { border-top:0; }
.feature-copy { min-width:0;flex:1; }
.feature-title { display:block;font-size:27rpx;font-weight:720; }
.feature-desc { display:block;margin-top:7rpx;color:var(--dk-muted,#6b736f);font-size:21rpx;line-height:1.45; }
.guide-note { margin-top:18rpx;padding:20rpx 22rpx;border-radius:22rpx;background:rgba(228,240,238,.68);color:var(--dk-muted,#6b736f);font-size:21rpx;line-height:1.5; }
.guide-note view { display:flex;align-items:flex-start;gap:12rpx; }
.guide-note view + view { margin-top:10rpx; }
.note-dot { width:7rpx;height:7rpx;flex-shrink:0;margin-top:12rpx;border-radius:50%;background:var(--dk-feature-brand,#2f6f6a); }
.primary { width:100%;height:88rpx;margin-top:24rpx;border:0;border-radius:24rpx;background:var(--dk-brand,#2f6f6a);color:#fff;font-size:29rpx;font-weight:700;line-height:88rpx; }
.primary::after { border:0; }
</style>
