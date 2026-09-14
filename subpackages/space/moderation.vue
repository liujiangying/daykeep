<template>
  <view class="page" :style="pageStyle">
    <view class="intro">
      <text class="intro-kicker">官方体验圈</text>
      <text class="intro-title">管理中心</text>
      <text class="intro-copy">维护公开内容与成员权限。</text>
    </view>

    <view v-if="isManager" class="management-tabs">
      <view class="management-tab" :class="{ active: activeSection === 'content' }" @tap="activeSection = 'content'">
        <text>内容管理</text>
        <text v-if="reports.length" class="management-tab-count">{{ reports.length }}</text>
      </view>
      <view class="management-tab" :class="{ active: activeSection === 'members' }" @tap="activeSection = 'members'">
        <text>成员管理</text>
        <text v-if="members.length" class="management-tab-count neutral">{{ members.length }}</text>
      </view>
    </view>
    <view v-else class="management-tabs single">
      <view class="management-tab active">
        <text>内容管理</text>
        <text v-if="reports.length" class="management-tab-count">{{ reports.length }}</text>
      </view>
    </view>

    <view v-if="isManager && activeSection === 'members'" class="member-admin-section">
      <view class="member-admin-heading">
        <view class="member-admin-heading-copy">
          <text class="member-admin-title">成员管理</text>
          <text class="member-admin-copy">{{ adminCount }} 位管理员 · {{ members.length }} 位成员</text>
        </view>
      </view>

      <view class="member-admin-body">
        <view class="member-search">
          <text class="member-search-icon">⌕</text>
          <input v-model="memberKeyword" maxlength="30" confirm-type="search" placeholder="搜索成员昵称" placeholder-class="member-search-placeholder" />
          <text v-if="memberKeyword" class="member-search-clear" @tap.stop="memberKeyword = ''">×</text>
        </view>

        <view v-if="visibleMembers.length" class="member-admin-list">
          <view v-for="member in visibleMembers" :key="member.userId" class="member-admin-row">
            <image v-if="member.avatarUrl" class="member-admin-avatar" :src="member.avatarUrl" mode="aspectFill" />
            <text v-else class="member-admin-avatar fallback">{{ member.nickname.slice(0, 1) || '人' }}</text>
            <view class="member-admin-info">
              <text>{{ member.nickname }}</text>
              <text>{{ member.role === 'owner' ? '创建者 · 主管理员' : member.role === 'admin' ? '管理员' : '普通成员' }}</text>
            </view>
            <text v-if="member.role === 'owner'" class="member-owner-mark">主管理员</text>
            <button v-else :class="{ active: member.role === 'admin' }" @tap="toggleAdmin(member)">{{ member.role === 'admin' ? '取消管理员' : '设为管理员' }}</button>
          </view>
        </view>
        <view v-else class="member-search-empty">没有找到“{{ memberKeyword }}”</view>
        <text v-if="hiddenMemberCount" class="member-list-hint">还有 {{ hiddenMemberCount }} 位成员，搜索昵称可以快速找到</text>
      </view>
    </view>

    <template v-else>
      <view v-if="blockedMembers.length" class="blocked-section">
        <text class="blocked-title">暂停发布</text>
        <view v-for="member in blockedMembers" :key="member.userId" class="blocked-row">
          <image v-if="member.avatarUrl" class="blocked-avatar" :src="member.avatarUrl" mode="aspectFill" />
          <text v-else class="blocked-avatar fallback">{{ member.nickname.slice(0, 1) }}</text>
          <view class="blocked-copy"><text>{{ member.nickname }}</text><text>{{ member.reason || '等待管理员复核' }}</text></view>
          <button @tap="restorePosting(member)">恢复发布</button>
        </view>
      </view>

      <view v-if="loading" class="state">正在加载…</view>
      <view v-else-if="!reports.length" class="empty">
        <text class="empty-mark">✓</text>
        <text class="empty-title">暂时没有待处理举报</text>
        <text class="empty-copy">体验圈现在很平静</text>
      </view>
      <view v-else class="report-list">
        <view v-for="report in reports" :key="report.id" class="report-card">
          <view class="report-head">
            <view><text class="report-author">{{ report.authorName }}</text><text class="report-time">{{ formatTime(report.createdAt) }}</text></view>
            <text class="report-state">待处理</text>
          </view>
          <text class="report-title">{{ report.title || firstLine(report.body) || '一条公开记录' }}</text>
          <text v-if="report.body" class="report-body">{{ report.body }}</text>
          <view class="reason"><text>举报原因</text><text>{{ report.reason }}</text></view>
          <view class="actions">
            <button class="keep" @tap="keepContent(report)">保留内容</button>
            <button class="handle" @tap="handleReport(report)">处理</button>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import {
  dismissPublicContentReport,
  getSpace,
  hidePublicEntry,
  listOfficialSpaceMembers,
  listPublicBlockedMembers,
  listPublicContentReports,
  setPublicPostingBlocked,
  setOfficialSpaceMemberRole,
  type Space,
  type SpaceMember,
  type PublicBlockedMember,
  type PublicContentReport,
} from '@/services/spaces'

const { pageStyle } = useThemePage()
const spaceId = ref('')
const reports = ref<PublicContentReport[]>([])
const blockedMembers = ref<PublicBlockedMember[]>([])
const space = ref<Space | null>(null)
const members = ref<SpaceMember[]>([])
const loading = ref(true)
const busy = ref(false)
const activeSection = ref<'content' | 'members'>('content')
const memberKeyword = ref('')
const isManager = computed(() => space.value?.currentUserRole === 'owner' || space.value?.currentUserRole === 'admin')
const adminCount = computed(() => members.value.filter((member) => member.role === 'owner' || member.role === 'admin').length)
const sortedMembers = computed(() => [...members.value].sort((a, b) => {
  const roleRank = { owner: 0, admin: 1, member: 2 }
  const rankDiff = roleRank[a.role] - roleRank[b.role]
  return rankDiff || a.nickname.localeCompare(b.nickname, 'zh-CN')
}))
const matchedMembers = computed(() => {
  const keyword = memberKeyword.value.trim().toLocaleLowerCase()
  if (!keyword) return sortedMembers.value
  return sortedMembers.value.filter((member) => member.nickname.toLocaleLowerCase().includes(keyword))
})
const visibleMembers = computed(() => memberKeyword.value.trim() ? matchedMembers.value : matchedMembers.value.slice(0, 20))
const hiddenMemberCount = computed(() => memberKeyword.value.trim() ? 0 : Math.max(0, matchedMembers.value.length - visibleMembers.value.length))

function firstLine(value: string) {
  return String(value || '').trim().split(/\n/)[0]?.slice(0, 36) || ''
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function load() {
  if (!spaceId.value) return
  loading.value = true
  try {
    space.value = await getSpace(spaceId.value)
    const [pendingReports, blocked, allMembers] = await Promise.all([
      listPublicContentReports(spaceId.value),
      listPublicBlockedMembers(spaceId.value),
      isManager.value ? listOfficialSpaceMembers(spaceId.value) : Promise.resolve([]),
    ])
    reports.value = pendingReports
    blockedMembers.value = blocked
    members.value = allMembers
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function toggleAdmin(member: SpaceMember) {
  if (!isManager.value || busy.value || member.role === 'owner') return
  const makeAdmin = member.role !== 'admin'
  uni.showModal({
    title: makeAdmin ? `将 ${member.nickname} 设为管理员？` : `取消 ${member.nickname} 的管理员？`,
    content: makeAdmin
      ? '管理员可以查看举报、隐藏违规内容并限制成员公开发布。'
      : '取消后，对方将恢复为普通成员。',
    confirmText: makeAdmin ? '确认设置' : '确认取消',
    success: async ({ confirm }) => {
      if (!confirm || busy.value) return
      busy.value = true
      try {
        const role = makeAdmin ? 'admin' : 'member'
        await setOfficialSpaceMemberRole(spaceId.value, member.userId, role)
        member.role = role
        uni.showToast({ title: makeAdmin ? '已设为管理员' : '已取消管理员', icon: 'success' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '设置失败', icon: 'none' })
      } finally {
        busy.value = false
      }
    },
  })
}

async function restorePosting(member: PublicBlockedMember) {
  if (busy.value) return
  busy.value = true
  try {
    await setPublicPostingBlocked(spaceId.value, member.userId, false)
    blockedMembers.value = blockedMembers.value.filter((item) => item.userId !== member.userId)
    uni.showToast({ title: '已恢复发布', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '恢复失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function keepContent(report: PublicContentReport) {
  if (busy.value) return
  busy.value = true
  try {
    await dismissPublicContentReport(spaceId.value, report.id)
    reports.value = reports.value.filter((item) => item.id !== report.id)
    uni.showToast({ title: '已保留内容', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '处理失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

function handleReport(report: PublicContentReport) {
  if (busy.value) return
  uni.showActionSheet({
    title: `处理 ${report.authorName} 的内容`,
    itemList: ['隐藏这条内容', '隐藏内容并暂停作者发布'],
    success: ({ tapIndex }) => {
      uni.showModal({
        title: tapIndex === 1 ? '隐藏并暂停发布？' : '隐藏这条内容？',
        content: tapIndex === 1 ? '内容会被移除，作者也将暂时不能继续公开发布。' : '内容会立即从体验圈移除。',
        confirmText: '确认处理',
        confirmColor: '#b64d46',
        success: async ({ confirm }) => {
          if (!confirm || busy.value) return
          busy.value = true
          try {
            await hidePublicEntry(spaceId.value, report.entryId)
            if (tapIndex === 1) await setPublicPostingBlocked(spaceId.value, report.authorUserId, true, '公开内容需管理员复核')
            reports.value = reports.value.filter((item) => item.entryId !== report.entryId)
            uni.showToast({ title: '已处理', icon: 'success' })
          } catch (error: any) {
            uni.showToast({ title: error?.message || '处理失败', icon: 'none' })
          } finally {
            busy.value = false
          }
        },
      })
    },
  })
}

onLoad((query: Record<string, string> = {}) => {
  spaceId.value = String(query.spaceId || '')
})
onShow(() => { void load() })
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:30rpx 30rpx calc(48rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:var(--dk-bg);color:var(--dk-ink)}
.intro{padding:34rpx 30rpx;border:1rpx solid rgba(47,111,106,.12);border-radius:30rpx;background:linear-gradient(145deg,var(--dk-feature-brand-soft,#e4f0ee),var(--dk-surface));box-shadow:0 12rpx 34rpx rgba(28,49,45,.06)}.intro-kicker{color:var(--dk-feature-brand,#2f6f6a);font-size:20rpx;font-weight:750}.intro-title{display:block;margin-top:10rpx;font-size:38rpx;font-weight:800}.intro-copy{display:block;margin-top:10rpx;color:var(--dk-muted);font-size:22rpx;line-height:1.6}
.management-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8rpx;margin-top:22rpx;padding:7rpx;border:1rpx solid var(--dk-line);border-radius:22rpx;background:var(--dk-surface)}.management-tabs.single{grid-template-columns:1fr}.management-tab{position:relative;display:flex;height:66rpx;align-items:center;justify-content:center;gap:9rpx;border-radius:17rpx;color:var(--dk-muted);font-size:22rpx;font-weight:650}.management-tab.active{color:var(--dk-feature-brand);background:var(--dk-feature-brand-soft);box-shadow:0 4rpx 12rpx rgba(31,66,61,.05)}.management-tab-count{display:flex;min-width:30rpx;height:30rpx;padding:0 7rpx;align-items:center;justify-content:center;border-radius:999rpx;color:#fff;background:#a85f57;font-size:16rpx;box-sizing:border-box}.management-tab-count.neutral{color:var(--dk-feature-brand);background:rgba(47,111,106,.11)}
.member-admin-section{margin-top:16rpx;overflow:hidden;border:1rpx solid var(--dk-line);border-radius:26rpx;background:var(--dk-surface)}.member-admin-heading{display:flex;min-height:100rpx;padding:0 24rpx;align-items:center}.member-admin-heading-copy{display:flex;min-width:0;flex-direction:column}.member-admin-title{font-size:25rpx;font-weight:750}.member-admin-copy{margin-top:5rpx;color:var(--dk-muted);font-size:19rpx}.member-admin-body{padding:0 24rpx 22rpx;border-top:1rpx solid var(--dk-line)}.member-search{display:flex;height:68rpx;margin:20rpx 0 8rpx;padding:0 20rpx;align-items:center;border-radius:19rpx;background:var(--dk-bg)}.member-search-icon{margin-right:12rpx;color:var(--dk-muted);font-size:28rpx}.member-search input{height:68rpx;min-width:0;flex:1;color:var(--dk-ink);font-size:22rpx}.member-search-placeholder{color:var(--dk-muted)}.member-search-clear{display:flex;width:38rpx;height:38rpx;align-items:center;justify-content:center;border-radius:50%;color:var(--dk-muted);background:var(--dk-line);font-size:27rpx;line-height:38rpx}.member-admin-list{margin-top:6rpx}.member-admin-row{display:flex;align-items:center;gap:12rpx;padding:15rpx 0;border-top:1rpx solid var(--dk-line)}.member-admin-row:first-child{border-top:0}.member-admin-avatar{display:flex;width:52rpx;height:52rpx;flex-shrink:0;align-items:center;justify-content:center;overflow:hidden;border-radius:50%;color:var(--dk-feature-brand);background:var(--dk-feature-brand-soft);font-size:20rpx}.member-admin-info{display:flex;min-width:0;flex:1;flex-direction:column}.member-admin-info text:first-child{overflow:hidden;font-size:22rpx;font-weight:680;text-overflow:ellipsis;white-space:nowrap}.member-admin-info text:last-child{margin-top:3rpx;color:var(--dk-muted);font-size:18rpx}.member-owner-mark{flex-shrink:0;padding:7rpx 11rpx;border-radius:999rpx;color:var(--dk-muted);background:var(--dk-bg);font-size:17rpx}.member-admin-row button{width:auto;height:54rpx;flex-shrink:0;margin:0;padding:0 14rpx;border:1rpx solid rgba(47,111,106,.18);border-radius:16rpx;color:var(--dk-feature-brand);background:transparent;font-size:18rpx;line-height:52rpx}.member-admin-row button.active{border-color:transparent;color:var(--dk-muted);background:var(--dk-bg)}.member-admin-row button::after{border:0}.member-search-empty{padding:44rpx 10rpx;text-align:center;color:var(--dk-muted);font-size:21rpx}.member-list-hint{display:block;padding:15rpx 0 1rpx;text-align:center;color:var(--dk-muted);font-size:18rpx}
.state,.empty{padding:120rpx 20rpx;text-align:center;color:var(--dk-muted)}.empty-mark{display:flex;width:72rpx;height:72rpx;margin:0 auto 18rpx;align-items:center;justify-content:center;border-radius:50%;color:var(--dk-feature-brand);background:var(--dk-feature-brand-soft);font-size:28rpx}.empty-title{display:block;color:var(--dk-ink);font-size:28rpx;font-weight:720}.empty-copy{display:block;margin-top:8rpx;font-size:21rpx}
.blocked-section{margin-top:22rpx;padding:24rpx;border:1rpx solid var(--dk-line);border-radius:26rpx;background:var(--dk-surface)}.blocked-title{display:block;margin-bottom:14rpx;font-size:25rpx;font-weight:750}.blocked-row{display:flex;align-items:center;gap:12rpx;padding:14rpx 0;border-top:1rpx solid var(--dk-line)}.blocked-row:first-of-type{border-top:0}.blocked-avatar{display:flex;width:48rpx;height:48rpx;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%;color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);font-size:20rpx}.blocked-copy{display:flex;min-width:0;flex:1;flex-direction:column}.blocked-copy text:first-child{font-size:22rpx;font-weight:700}.blocked-copy text:last-child{margin-top:3rpx;overflow:hidden;color:var(--dk-muted);font-size:18rpx;text-overflow:ellipsis;white-space:nowrap}.blocked-row button{width:auto;height:54rpx;margin:0;padding:0 16rpx;border:0;border-radius:16rpx;color:var(--dk-feature-brand);background:var(--dk-feature-brand-soft);font-size:19rpx;line-height:54rpx}.blocked-row button::after{border:0}
.report-list{margin-top:22rpx}.report-card{margin-bottom:18rpx;padding:26rpx;border:1rpx solid var(--dk-line);border-radius:26rpx;background:var(--dk-surface);box-shadow:0 8rpx 24rpx rgba(24,42,39,.04)}.report-head{display:flex;align-items:flex-start;justify-content:space-between}.report-head view{display:flex;flex-direction:column}.report-author{font-size:23rpx;font-weight:700}.report-time{margin-top:4rpx;color:var(--dk-muted);font-size:18rpx}.report-state{padding:5rpx 10rpx;border-radius:999rpx;color:#a85f57;background:rgba(178,103,93,.1);font-size:17rpx;font-weight:700}.report-title{display:block;margin-top:20rpx;font-size:28rpx;font-weight:760;line-height:1.45}.report-body{display:-webkit-box;margin-top:8rpx;overflow:hidden;color:var(--dk-muted);font-size:22rpx;line-height:1.55;-webkit-box-orient:vertical;-webkit-line-clamp:3}.reason{display:flex;margin-top:20rpx;padding:16rpx;border-radius:17rpx;background:var(--dk-bg);flex-direction:column;gap:5rpx}.reason text:first-child{color:var(--dk-muted);font-size:17rpx}.reason text:last-child{font-size:21rpx}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12rpx;margin-top:18rpx}.actions button{height:64rpx;margin:0;border:0;border-radius:18rpx;font-size:21rpx;line-height:64rpx}.actions button::after{border:0}.keep{color:var(--dk-feature-brand);background:var(--dk-feature-brand-soft)}.handle{color:#fff;background:#a85f57}
</style>
