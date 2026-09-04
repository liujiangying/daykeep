<template>
  <view class="page" :style="pageStyle">
    <view class="intro"><text class="title">给你的小提示</text><text class="desc">{{ scopeDesc }}</text></view>
    <view v-if="loading && !insights.length" class="state">正在翻一翻最近的记录…</view>
    <view v-else-if="!insights.length" class="empty-card"><text class="empty-icon">✦</text><text class="empty-title">小提示正在慢慢形成</text><text class="empty-copy">再留下一些记录、约定和心情，值得在乎的小事会在合适的时候抵达。</text></view>
    <view v-else class="list">
      <view v-for="item in sortedInsights" :key="item.id" class="insight" :class="item.type">
        <view class="insight-head"><text class="kind">{{ kindLabel(item.type) }}</text><text class="dismiss" @tap="dismiss(item.id)">不再显示</text></view>
        <text class="insight-title">{{ item.title }}</text><text class="content">{{ item.content }}</text>
        <view v-if="item.actionType !== 'none'" class="actions"><button @tap="act(item)">{{ item.actionType === 'diary' ? '写一句话' : '创建约定' }}</button></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { dismissInsight, listInsights, type Insight } from '@/services/insights'
import { useThemePage } from '@/composables/useThemePage'
const { pageStyle } = useThemePage()
const insights = ref<Insight[]>([])
const loading = ref(false)
const spaceId = ref<string | null>(null)
const spaceName = ref('')
const insightPriority = { anniversary: 0, care: 1, preference: 2 } as const
const sortedInsights = computed(() => [...insights.value].sort((a, b) => insightPriority[a.type] - insightPriority[b.type]))
const scopeDesc = computed(() => spaceId.value ? `只根据「${spaceName.value || '当前空间'}」里的记录生成` : '只根据你的个人记录生成')
function kindLabel(type: Insight['type']) { return type === 'anniversary' ? '重要日子' : type === 'care' ? '关怀提醒' : '在乎线索' }
async function load() { loading.value = true; try { insights.value = await listInsights(spaceId.value) } catch (error:any) { uni.showToast({title:error?.message||'加载失败',icon:'none'}) } finally { loading.value = false } }
function act(item: Insight) {
  const owner = item.actionPayload?.spaceId ? `ownerType=space&spaceId=${encodeURIComponent(item.actionPayload.spaceId)}` : 'ownerType=personal'
  if (item.actionType === 'diary') uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&from=insight&mode=text&${owner}` })
  else uni.navigateTo({ url: `/subpackages/notes/edit?type=anniversary&entryKind=commitment&from=insight&${owner}` })
}
async function dismiss(id:string) { try { await dismissInsight(id); insights.value = insights.value.filter((item)=>item.id!==id) } catch(error:any){uni.showToast({title:error?.message||'操作失败',icon:'none'})} }
onLoad((query) => {
  spaceId.value = query?.spaceId ? String(query.spaceId) : null
  spaceName.value = query?.spaceName ? decodeURIComponent(String(query.spaceName)) : ''
})
onShow(()=>{void load()})
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:34rpx 32rpx calc(60rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:var(--dk-bg);color:var(--dk-ink)}.intro{padding:8rpx 4rpx 32rpx}.title{display:block;font-size:46rpx;font-weight:800}.desc{display:block;margin-top:8rpx;color:var(--dk-muted);font-size:25rpx}.state{padding:130rpx 24rpx;color:var(--dk-muted);font-size:25rpx;line-height:1.7;text-align:center}.empty-card{display:flex;align-items:center;padding:72rpx 38rpx;border:1rpx solid var(--dk-line);border-radius:28rpx;background:var(--dk-surface);flex-direction:column;text-align:center}.empty-icon{color:var(--dk-brand);font-size:48rpx}.empty-title{margin-top:18rpx;font-size:30rpx;font-weight:750}.empty-copy{margin-top:12rpx;color:var(--dk-muted);font-size:24rpx;line-height:1.7}.insight{margin-bottom:22rpx;padding:30rpx;border:1rpx solid var(--dk-line);border-radius:28rpx;background:var(--dk-surface);box-shadow:0 12rpx 34rpx rgba(35,63,57,.05)}.insight.anniversary{border-color:rgba(176,137,72,.18);background:linear-gradient(135deg,#fff9f1,#fef3e2)}.insight.care{background:linear-gradient(145deg,#fff9f5,var(--dk-surface))}.insight-head{display:flex;align-items:center;justify-content:space-between}.kind{color:var(--dk-ink);font-size:25rpx;font-weight:750}.anniversary .kind{color:#8b6b2a}.dismiss{color:var(--dk-muted);font-size:21rpx}.insight-title{display:block;margin-top:22rpx;font-size:31rpx;font-weight:780;line-height:1.4}.content{display:block;margin-top:12rpx;color:#5c625f;font-size:25rpx;line-height:1.7;white-space:pre-wrap}.actions{display:flex;margin-top:24rpx}.actions button{height:70rpx;margin:0;padding:0 28rpx;border:0;border-radius:18rpx;color:#fff;background:var(--dk-brand);font-size:24rpx;font-weight:700;line-height:70rpx}.actions button::after{border:0}
</style>
