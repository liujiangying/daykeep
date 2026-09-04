<template>
  <view class="page" :style="pageStyle">
    <view v-if="loading" class="state">灵感正在路上…</view>
    <template v-else-if="daily">
      <view class="sheet">
        <view class="kicker">
          <view class="mark">
            <image class="mark-icon" src="../../static/actions/idea.png" mode="aspectFit" />
          </view>
          <view class="kicker-copy">
            <text class="kicker-title">今日灵感</text>
            <text class="kicker-meta">{{ dateLabel }} · {{ scopeLabel }}</text>
          </view>
          <text class="swap" @tap="swapQuestion">换一句</text>
        </view>

        <text class="question">{{ daily.question }}</text>
        <view class="rule" />

        <text class="write-label">我想到的一句</text>
        <textarea
          class="write-input"
          :value="seed"
          maxlength="500"
          :auto-height="true"
          cursor-spacing="160"
          placeholder="先写下此刻想到的…"
          @input="onSeedInput"
        />

        <text v-if="!hasSeed" class="nudge">写完后，可以直接把这一句保存成随手记。</text>
      </view>

      <view v-if="hasSeed" class="actions">
        <button class="primary" @tap="useSeedDirectly">用这一句写随手记</button>
      </view>
    </template>
    <view v-else class="state">今日灵感暂时没有抵达</view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getDailyQuestion, type DailyQuestionState } from '@/services/dailyQuestions'
import { nextDailyQuestion } from '@/subpackages/shared/dailyQuestionBank'
import { useThemePage } from '@/composables/useThemePage'

const INSPIRATION_DRAFT_KEY = 'dk_inspiration_draft'

const { pageStyle } = useThemePage()
const spaceId = ref('')
const spaceName = ref('')
const daily = ref<DailyQuestionState | null>(null)
const seed = ref('')
const loading = ref(true)
const scopeLabel = ref('仅自己')
const hasSeed = computed(() => !!seed.value.trim())
const dateLabel = computed(() => formatCnDate(daily.value?.date || ''))

function formatCnDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return '今天'
  return `${Number(match[2])}月${Number(match[3])}日`
}

async function load() {
  loading.value = true
  try {
    daily.value = await getDailyQuestion(spaceId.value || null)
    seed.value = ''
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' })
  } finally { loading.value = false }
}

function onSeedInput(event: Event) {
  const detail = (event as unknown as { detail?: { value?: string } }).detail
  seed.value = String(detail?.value || '').slice(0, 500)
}

function useSeedDirectly() {
  if (!seed.value.trim()) return
  openDiary(seed.value.trim())
}

function openDiary(body: string) {
  const text = body.trim()
  if (!text) return
  try {
    uni.setStorageSync(INSPIRATION_DRAFT_KEY, {
      body: text.slice(0, 5000),
      tags: ['今日灵感'],
      prompt: daily.value?.question || '',
    })
  } catch {
    /* storage unavailable */
  }
  const params = ['type=diary', 'from=inspiration', 'mode=text']
  if (spaceId.value) {
    params.push('ownerType=space', `spaceId=${encodeURIComponent(spaceId.value)}`)
  } else {
    params.push('ownerType=personal')
  }
  uni.navigateTo({ url: `/subpackages/notes/edit?${params.join('&')}` })
}

function swapQuestion() {
  if (!daily.value) return
  const next = nextDailyQuestion(daily.value.question)
  daily.value.question = next.text
  daily.value.questionKey = next.key
}

onLoad((query: Record<string, string> = {}) => {
  spaceId.value = String(query.spaceId || '')
  try { spaceName.value = decodeURIComponent(String(query.spaceName || '')) } catch { spaceName.value = String(query.spaceName || '') }
  scopeLabel.value = spaceName.value || '仅自己'
  void load()
})
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 28rpx 28rpx calc(48rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background:
    radial-gradient(circle at 8% -8%, rgba(47, 111, 106, 0.16), transparent 42%),
    radial-gradient(circle at 100% 0, rgba(176, 137, 72, 0.16), transparent 36%),
    var(--dk-bg);
  color: var(--dk-ink);
}
.state {
  padding: 180rpx 24rpx;
  color: var(--dk-muted);
  text-align: center;
}

.sheet {
  padding: 36rpx 32rpx 40rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  border-radius: 36rpx;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 250, 240, 0.92));
  box-shadow:
    0 22rpx 48rpx rgba(47, 111, 106, 0.08),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
}

.kicker {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.mark {
  display: flex;
  width: 64rpx;
  height: 64rpx;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 20rpx;
  background: rgba(47, 111, 106, 0.1);
}
.mark-icon { width: 34rpx; height: 34rpx; }
.kicker-copy { min-width: 0; flex: 1; }
.kicker-title {
  display: block;
  color: var(--dk-brand);
  font-size: 22rpx;
  font-weight: 780;
  letter-spacing: 0.12em;
}
.kicker-meta {
  display: block;
  margin-top: 4rpx;
  color: var(--dk-muted);
  font-size: 22rpx;
}
.swap {
  flex-shrink: 0;
  color: var(--dk-brand);
  font-size: 22rpx;
  font-weight: 700;
}

.question {
  display: block;
  margin-top: 36rpx;
  font-size: 44rpx;
  font-weight: 760;
  line-height: 1.42;
  letter-spacing: 0.01em;
}
.rule {
  width: 72rpx;
  height: 6rpx;
  margin: 28rpx 0 32rpx;
  border-radius: 999rpx;
  background: rgba(47, 111, 106, 0.35);
}

.write-label {
  display: block;
  color: var(--dk-muted);
  font-size: 22rpx;
  font-weight: 650;
  letter-spacing: 0.06em;
}
.write-input {
  display: block;
  width: 100%;
  min-height: 120rpx;
  margin-top: 10rpx;
  padding: 0;
  color: var(--dk-ink);
  background: transparent;
  font-size: 32rpx;
  line-height: 1.7;
  box-sizing: border-box;
}
.nudge {
  display: block;
  margin-top: 18rpx;
  color: var(--dk-muted);
  font-size: 24rpx;
  line-height: 1.6;
}
.working {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 22rpx;
  color: var(--dk-muted);
  font-size: 24rpx;
}
.spinner {
  width: 22rpx;
  height: 22rpx;
  border: 3rpx solid rgba(47, 111, 106, 0.18);
  border-top-color: var(--dk-brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.paths { margin-top: 22rpx; }
.paths-kicker {
  display: block;
  margin: 8rpx 8rpx 16rpx;
  color: var(--dk-muted);
  font-size: 22rpx;
  font-weight: 700;
}
.path {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-bottom: 14rpx;
  padding: 26rpx 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.7);
  border-radius: 28rpx;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.62), var(--dk-surface));
  box-shadow: 0 14rpx 32rpx rgba(47, 111, 106, 0.06);
}
.path-index {
  width: 56rpx;
  color: var(--dk-brand);
  font-size: 24rpx;
  font-weight: 780;
  letter-spacing: 0.04em;
}
.path-copy { min-width: 0; flex: 1; }
.path-title { display: block; font-size: 30rpx; font-weight: 760; }
.path-hint { display: block; margin-top: 6rpx; color: var(--dk-muted); font-size: 23rpx; line-height: 1.5; }
.path-go { color: var(--dk-brand); font-size: 36rpx; line-height: 1; }
.refresh {
  display: block;
  padding: 8rpx 8rpx 0;
  color: var(--dk-brand);
  font-size: 23rpx;
  font-weight: 700;
}

.actions { margin-top: 28rpx; }
.primary {
  height: 92rpx;
  padding: 0;
  border: 0;
  border-radius: 999rpx;
  color: #fff;
  background: var(--dk-brand);
  font-size: 28rpx;
  font-weight: 720;
  line-height: 92rpx;
  box-shadow: 0 16rpx 28rpx rgba(47, 111, 106, 0.22);
}
.primary::after { border: 0; }
.secondary {
  display: block;
  margin-top: 20rpx;
  color: var(--dk-brand);
  font-size: 24rpx;
  font-weight: 700;
  text-align: center;
}
</style>
