<template>
  <view class="page" :style="pageStyle">
    <view class="intro">
      <text class="eyebrow">帮助与反馈</text>
      <text class="title">告诉我们你的使用感受</text>
      <text class="desc">问题、建议和使用感受都会被认真阅读。请不要填写随手记正文、密码等敏感信息。</text>
    </view>

    <view class="card">
      <view class="field">
        <text class="label">反馈类型</text>
        <view class="category-row">
          <view
            v-for="item in categories"
            :key="item.id"
            class="category"
            :class="{ active: category === item.id }"
            @tap="category = item.id"
          >{{ item.label }}</view>
        </view>
      </view>

      <view class="field">
        <text class="label">具体说明</text>
        <textarea
          v-model="content"
          class="textarea"
          maxlength="2000"
          placeholder="发生了什么？如果方便，请描述操作步骤和出现的时间。"
          placeholder-class="placeholder"
        />
        <text class="count">{{ content.length }}/2000</text>
      </view>

      <view class="field no-border">
        <text class="label">联系方式 <text class="optional">选填</text></text>
        <input
          v-model="contact"
          class="input"
          maxlength="128"
          placeholder="微信号或邮箱，仅在需要补充信息时联系你"
          placeholder-class="placeholder"
        />
      </view>

      <view class="field no-border attachment-field">
        <view class="attachment-heading"><text class="label">问题截图 <text class="optional">选填，最多 3 张</text></text><text class="hint">单张不超过 5MB</text></view>
        <view class="images">
          <view v-for="(image, index) in images" :key="image" class="image-item">
            <image :src="image" mode="aspectFill" />
            <view class="remove" @tap="removeImage(index)">×</view>
          </view>
          <view v-if="images.length < 3" class="image-add" @tap="chooseImages"><text class="plus">＋</text><text>添加截图</text></view>
        </view>
      </view>
    </view>

    <view class="environment" :class="{ testing: isTesting }">
      <text class="environment-dot"></text>
      <view><text>{{ environmentLabel }}</text><text class="environment-desc">{{ environmentDescription }}</text></view>
    </view>

    <button class="submit" :disabled="submitting" @tap="submit">
      {{ submitting ? '正在提交…' : '提交反馈' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { submitFeedback, type FeedbackCategory } from '@/subpackages/shared/api/feedback'
import { API_BASE } from '@/api/request'
import { useThemePage } from '@/composables/useThemePage'
import { uploadFeedbackImage } from '@/subpackages/shared/services/upload'

const { pageStyle } = useThemePage()

const categories: Array<{ id: FeedbackCategory; label: string }> = [
  { id: 'bug', label: '功能异常' },
  { id: 'suggestion', label: '使用建议' },
  { id: 'account', label: '下载与账号' },
  { id: 'other', label: '其他' },
]

const category = ref<FeedbackCategory>('bug')
const content = ref('')
const contact = ref('')
const images = ref<string[]>([])
const submitting = ref(false)
const isTesting = !API_BASE || /localhost|127\.0\.0\.1/.test(API_BASE)
const environmentLabel = computed(() => (isTesting ? '测试环境反馈' : '正式环境反馈'))
const environmentDescription = computed(() =>
  isTesting ? '仅用于体验与验收，不会进入正式反馈池。' : '反馈会进入官方问题处理队列。',
)

function getClientMeta() {
  try {
    const system = uni.getSystemInfoSync()
    return {
      platform: system.platform || 'unknown',
      appVersion: system.version || '',
      system: system.system || '',
      page: '/subpackages/feedback/index',
    }
  } catch {
    return { page: '/subpackages/feedback/index' }
  }
}

async function chooseImages() {
  try {
    const remaining = 3 - images.value.length
    const result = await uni.chooseImage({ count: remaining, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    const selected = result.tempFilePaths || []
    images.value = images.value.concat(selected).slice(0, 3)
  } catch (error: any) {
    if (!String(error?.errMsg || '').includes('cancel')) uni.showToast({ title: '选择图片失败', icon: 'none' })
  }
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

async function submit() {
  const text = content.value.trim()
  if (text.length < 5) {
    uni.showToast({ title: '请至少填写 5 个字', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  uni.showLoading({ title: images.value.length ? '正在上传截图…' : '正在提交…', mask: true })
  try {
    const imageUrls: string[] = []
    for (const image of images.value) imageUrls.push(await uploadFeedbackImage(image))
    uni.showLoading({ title: '正在提交…', mask: true })
    const result = await submitFeedback({
      category: category.value,
      content: text,
      contact: contact.value.trim(),
      source: 'mini-program',
      imageUrls,
      clientMeta: getClientMeta(),
    })
    uni.showModal({
      title: '已收到反馈',
      content: `感谢你的反馈。编号 #${result.id}${result.environment === 'testing' ? '（测试环境）' : ''}`,
      showCancel: false,
      success: () => uni.navigateBack(),
    })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '提交失败，请稍后重试', icon: 'none' })
  } finally {
    submitting.value = false
    uni.hideLoading()
  }
}
</script>

<style lang="scss" scoped>
.page { min-height:100vh; padding:44rpx 40rpx 80rpx; background:var(--dk-bg,#f7f5f1); color:var(--dk-ink,#1c2423); box-sizing:border-box; }
.intro { padding:8rpx 4rpx 38rpx; }.eyebrow { display:block; color:var(--dk-brand,#2f6f6a); font-size:24rpx; font-weight:700; letter-spacing:3rpx; }.title { display:block; margin-top:14rpx; font-size:44rpx; font-weight:650; letter-spacing:.01em; }.desc { display:block; margin-top:16rpx; color:var(--dk-muted,#6b736f); font-size:25rpx; line-height:1.7; }
.card { padding:0 24rpx; border:1rpx solid var(--dk-line,#e2e6e4); border-radius:24rpx; background:var(--dk-surface,#fffefb); }.field { position:relative; padding:28rpx 0; border-bottom:1rpx solid var(--dk-line,#e2e6e4); }.field.no-border { border:0; }.label { display:block; margin-bottom:18rpx; font-size:27rpx; font-weight:600; }.optional { color:var(--dk-muted,#6b736f); font-size:22rpx; font-weight:400; }.category-row { display:flex; flex-wrap:wrap; gap:12rpx; }.category { padding:13rpx 18rpx; border:1rpx solid var(--dk-line,#e2e6e4); border-radius:999rpx; color:var(--dk-muted,#6b736f); font-size:24rpx; }.category.active { border-color:var(--dk-brand,#2f6f6a); color:#fff; background:var(--dk-brand,#2f6f6a); }.textarea { width:100%; height:230rpx; padding:0 0 28rpx; color:var(--dk-ink,#1c2423); font-size:27rpx; line-height:1.6; box-sizing:border-box; }.input { height:58rpx; color:var(--dk-ink,#1c2423); font-size:26rpx; }.placeholder { color:#a5afab; }.count { position:absolute; right:0; bottom:24rpx; color:var(--dk-muted,#6b736f); font-size:21rpx; }.attachment-field { padding-top:0; }.attachment-heading { display:flex; justify-content:space-between; align-items:baseline; }.attachment-heading .label { margin:0 0 16rpx; }.hint { color:var(--dk-muted,#6b736f); font-size:21rpx; }.images { display:flex; flex-wrap:wrap; gap:14rpx; }.image-item,.image-add { position:relative; width:132rpx; height:132rpx; overflow:hidden; border-radius:14rpx; }.image-item image { width:100%; height:100%; }.remove { position:absolute; top:6rpx; right:6rpx; display:flex; width:34rpx; height:34rpx; align-items:center; justify-content:center; border-radius:50%; color:#fff; background:rgba(24,34,32,.7); font-size:28rpx; line-height:1; }.image-add { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4rpx; border:1rpx dashed #bfc9c5; color:#77827d; font-size:20rpx; }.plus { font-size:36rpx; line-height:1; }
.environment { display:flex; gap:14rpx; align-items:flex-start; margin:24rpx 4rpx 40rpx; color:var(--dk-muted,#6b736f); font-size:23rpx; }.environment-dot { width:12rpx; height:12rpx; margin-top:10rpx; flex-shrink:0; border-radius:50%; background:var(--dk-brand,#2f6f6a); }.environment.testing .environment-dot { background:#bb852d; }.environment text { display:block; }.environment-desc { margin-top:4rpx; color:#87918d; font-size:22rpx; }.submit { width:100%; height:92rpx; border-radius:16rpx; color:#fff; background:var(--dk-brand,#2f6f6a); font-size:30rpx; line-height:92rpx; }.submit[disabled] { opacity:.62; }.submit::after { border:0; }
</style>
