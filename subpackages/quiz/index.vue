<template>
  <view class="page" :style="pageStyle">
    <view class="hero">
      <text class="title">默契测试</text>
      <text class="subtitle">圈里每个人各自作答，都答完后才揭晓默契度</text>
    </view>

    <view v-if="loadError" class="state">
      <text class="state-text">{{ loadError }}</text>
      <button class="submit" @tap="retry">重新加载</button>
    </view>
    <view v-else-if="!session" class="state"><text class="state-text">准备题目中…</text></view>

    <template v-else-if="result">
      <view class="result-card">
        <text class="score">{{ result.score }}%</text>
        <text class="result-title">这个小圈的默契度</text>
        <text class="summary">{{ result.summary }}</text>
        <button class="submit" :disabled="restarting" :loading="restarting" @tap="restart">再测一次</button>
        <button class="submit ghost" @tap="goBack">回到时光圈</button>
      </view>
    </template>

    <template v-else-if="waitingForOther">
      <view class="result-card">
        <text class="result-title">已提交，等圈里其他人作答</text>
        <text class="summary">{{ waitingCopy }}</text>
        <button class="submit" @tap="goBack">回到时光圈</button>
      </view>
    </template>

    <template v-else>
      <view v-for="(question, index) in session.questions" :key="question.id" class="question-card">
        <text class="q-index">这一轮问题 · {{ index + 1 }}/{{ session.questions.length }}</text>
        <text class="q-title">{{ question.text }}</text>
        <view class="options">
          <button
            v-for="option in question.options"
            :key="option"
            class="option"
            :class="{ on: answers[question.id] === option }"
            @tap="answers[question.id] = option"
          >{{ option }}</button>
        </view>
      </view>
      <button class="submit" :disabled="!canSubmit || submitting" :loading="submitting" @tap="submit">提交我的答案</button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { createQuiz, getCurrentQuiz, submitQuizAnswers, type QuizSession } from '@/subpackages/shared/services/quizzes'
import { getCachedUserId } from '@/services/auth'

const { pageStyle } = useThemePage()
const spaceId = ref('')
const session = ref<QuizSession | null>(null)
const submitting = ref(false)
const restarting = ref(false)
const loadError = ref('')
const answers = reactive<Record<string, string>>({})

const submitted = ref(false)
const myUserId = computed(() => String(getCachedUserId() || ''))
const result = computed(() => session.value?.result || null)
const waitingForOther = computed(() => {
  if (session.value?.status === 'completed') return false
  const answeredByMe = !!myUserId.value && !!session.value?.answeredBy?.includes(myUserId.value)
  return submitted.value || answeredByMe
})
const waitingCopy = computed(() => {
  const remaining = Math.max(0, (session.value?.memberCount || 0) - (session.value?.answeredCount || 0))
  if (remaining <= 0) return '其他人答完后，这里会显示这个小圈的默契度。'
  return `还差 ${remaining} 人。大家都答完后，这里会显示这个小圈的默契度。`
})

const canSubmit = computed(
  () => !!session.value && session.value.questions.every((question) => !!answers[question.id]),
)

function clearAnswers() {
  Object.keys(answers).forEach((key) => delete answers[key])
}

async function load() {
  loadError.value = ''
  if (!spaceId.value) {
    loadError.value = '缺少时光圈信息，请从时光圈内重新进入。'
    return
  }
  try {
    session.value =
      (await getCurrentQuiz(spaceId.value)) ||
      (await createQuiz(spaceId.value))
  } catch (error: any) {
    loadError.value = error?.message || '默契测试加载失败，请稍后重试。'
  }
}

function retry() {
  session.value = null
  submitted.value = false
  clearAnswers()
  void load()
}

async function restart() {
  if (!spaceId.value || restarting.value) return
  restarting.value = true
  try {
    session.value = await createQuiz(spaceId.value)
    submitted.value = false
    clearAnswers()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '发起失败，请重试', icon: 'none' })
  } finally {
    restarting.value = false
  }
}

async function submit() {
  if (!session.value || !canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    session.value = await submitQuizAnswers(session.value, answers)
    submitted.value = true
  } catch (error: any) {
    uni.showToast({ title: error?.message || '提交失败，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

function goBack() {
  uni.navigateBack({ delta: 1 })
}

onLoad((query: any) => {
  spaceId.value = String(query?.spaceId || '').trim()
  void load()
})
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 32rpx; background: var(--dk-bg); color: var(--dk-ink); }
.hero { margin-bottom: 28rpx; padding: 8rpx 2rpx; }.question-card,.result-card { margin-bottom: 24rpx; padding: 28rpx; border:1rpx solid var(--dk-line); border-radius: 28rpx; background: var(--dk-surface); box-shadow: 0 8rpx 24rpx rgba(24,42,39,.04); }
.title { display: block; font-size: 44rpx; font-weight: 760; line-height: 1.25; }
.subtitle { display: block; margin-top: 10rpx; color: var(--dk-muted); font-size: 25rpx; line-height: 1.55; }
.state { padding: 120rpx 0; text-align: center; color: var(--dk-muted); }
.state-text { display: block; padding: 0 32rpx; font-size: 27rpx; line-height: 1.6; }
.q-index { display: block; color: var(--dk-brand); font-size: 22rpx; font-weight: 700; }
.q-title { display: block; margin-top: 8rpx; font-size: 31rpx; font-weight: 700; line-height: 1.45; }
.options { display: grid; gap: 12rpx; margin-top: 22rpx; }
.option { min-height: 72rpx; margin: 0; padding: 0 22rpx; border: 1rpx solid var(--dk-line); border-radius: 18rpx; background: var(--dk-bg-soft); color: var(--dk-ink); font-size: 26rpx; line-height: 72rpx; text-align: left; }
.option.on { border-color: var(--dk-brand); background: var(--dk-brand-soft); color: var(--dk-brand); font-weight: 700; }
.option::after,.submit::after { border: 0; }
.submit { width: 100%; height: 84rpx; margin: 18rpx 0 0; border: 0; border-radius: 999rpx; background: var(--dk-brand); color: #fff; font-size: 29rpx; font-weight: 700; line-height: 84rpx; }
.submit[disabled] { opacity: .5; }
.submit.ghost { background: var(--dk-bg-soft); color: var(--dk-ink); }
.result-card { text-align: center; padding: 48rpx 32rpx; }
.score { display: block; color: var(--dk-brand); font-size: 84rpx; font-weight: 800; line-height: 1; }
.result-title { display: block; margin-top: 12rpx; font-size: 34rpx; font-weight: 750; }
.summary { display: block; margin-top: 16rpx; color: var(--dk-muted); font-size: 26rpx; line-height: 1.6; }
</style>
