<template>
  <view class="page" :style="pageStyle">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!entry" class="state"><text>{{ errorText || '约定不存在' }}</text><button class="primary" @tap="load">重新加载</button></view>
    <template v-else>
      <view class="page-title">
        <view class="title-line">
          <text class="title">{{ entry.title }}</text>
          <text class="countdown">{{ entry.countdownLabel }}</text>
        </view>
        <text class="date">{{ dateText }}<template v-if="entry.location"> · {{ entry.location }}</template></text>
      </view>

      <view class="participation-card">
        <view class="participation-head">
          <view>
            <text class="eyebrow">{{ space?.isOfficial ? '公开约定' : entry.ownerType === 'space' ? '共同约定' : '个人约定' }}</text>
            <text class="space-name">{{ space?.name || '仅自己' }}</text>
          </view>
          <text v-if="space" class="confirm-progress">{{ confirmationSummary }}</text>
        </view>
        <view v-if="space" class="participant-list">
          <view v-for="member in space.members || []" :key="member.userId" class="participant">
            <view class="avatar-wrap" :class="memberStatusClass(member.userId)">
              <image v-if="member.avatarUrl" class="avatar" :src="member.avatarUrl" mode="aspectFill" />
              <view v-else class="avatar fallback">{{ member.nickname.slice(0,1) }}</view>
              <text class="status-dot">{{ memberStatusMark(member.userId) }}</text>
            </view>
            <text class="participant-name">{{ member.nickname }}</text>
            <text class="participant-state">{{ checkedIn[member.userId] ? '已到场' : memberStatusLabel(member.userId) }}</text>
          </view>
          <view v-if="participantOverflow" class="participant">
            <view class="avatar-wrap"><view class="avatar fallback">+{{ participantOverflow }}</view></view>
            <text class="participant-name">更多成员</text>
            <text class="participant-state">已加入</text>
          </view>
        </view>
        <view v-if="space && myStatus === 'pending'" class="my-response pending">
          <view class="response-prompt"><text class="response-title">你会参加吗？</text><text class="response-hint">回复后，其他成员也能看到</text></view>
          <view class="response-actions">
            <button class="response-btn primary" :loading="responding" @tap="respond('confirmed')">确认参加</button>
            <button class="response-btn secondary" :disabled="responding" @tap="respond('declined')">暂时无法参加</button>
          </view>
        </view>
        <view v-else-if="space" class="my-response answered" @tap="changeMyResponse">
          <view class="response-result">
            <text class="response-mark" :class="myStatus">{{ myStatus === 'confirmed' ? '✓' : '—' }}</text>
            <view><text class="response-title">{{ myStatus === 'confirmed' ? '已确认参加' : '暂时无法参加' }}</text><text class="response-hint">这是你的当前回复</text></view>
          </view>
          <text class="change-response">更改 ›</text>
        </view>
      </view>

      <view class="section reminder-section">
        <view class="reminder-summary">
          <view><text class="reminder-title">{{ myReminderTitle }}</text><text class="reminder-copy" :class="{ error: myReminderUndelivered }">{{ myReminderCopy }}</text></view>
          <button
            class="reminder-setting-button"
            :class="{
              subtle: myReminderEnabled && !myReminderUndelivered && myReminderStatus !== 'sent',
              retry: myReminderUndelivered,
            }"
            @tap="openReminderSettings"
          >{{ myReminderActionLabel }}</button>
        </view>
      </view>

      <view class="section">
        <view class="section-head">
          <view><text class="section-title section-title-main">行程信息</text><text class="section-subtitle">集合与准备事项</text></view>
          <text v-if="isOwner" class="section-action" @tap="editEntry">编辑日期 ›</text>
        </view>
        <view class="info-row" @tap="onLocationRowTap">
          <view>
            <text class="label strong">地点</text>
            <text class="row-hint">{{ entry.location || (isOwner ? '点击选择地点' : '尚未填写地点') }}</text>
          </view>
          <!-- 有坐标才给导航入口：没坐标点进去只会打开一张空地图。 -->
          <text v-if="canNavigate" class="row-action" @tap.stop="navigateToLocation">导航 ›</text>
          <text v-else class="row-arrow">›</text>
        </view>
        <view class="info-row"><view><text class="label strong">交通</text><input v-if="isOwner" :value="transport" class="inline-input" maxlength="120" placeholder="补充交通或集合方式" @input="onTransportInput" /><text v-else class="row-hint">{{ transport || '尚未填写' }}</text></view></view>
        <view class="info-row note"><view><text class="label strong">备注</text><textarea v-if="isOwner" :value="note" class="note-input" maxlength="500" auto-height placeholder="需要准备什么，或者想对大家说的话" @input="onNoteInput" /><text v-else class="row-hint">{{ note || '暂无备注' }}</text></view></view>
      </view>

      <view class="section">
        <view class="section-head"><view><text class="section-title section-title-main">分工清单</text></view><text v-if="isOwner" class="section-action" @tap="addAssignment">添加 ›</text></view>
        <view v-if="!assignments.length" class="empty-copy">暂时没有分工</view>
        <view v-for="item in assignments" :key="item.id" class="task-row" @tap="isOwner && toggleAssignment(item.id)"><view class="check" :class="{ on: item.done }">{{ item.done ? '✓' : '' }}</view><view class="task-copy"><text :class="{ done: item.done }">{{ item.text }}</text><text class="task-assignee">{{ assigneeName(item.assigneeUserId) }}</text></view></view>
      </view>

      <view class="section action-section">
        <button v-if="!hasEventEnded" class="primary" :disabled="!!checkedIn[myUserId]" @tap="checkIn">{{ checkedIn[myUserId] ? '已到场打卡' : '我们到了 · 到场打卡' }}</button>
        <button v-else class="memory" @tap="leaveMemory">活动结束，留下这次美好回忆</button>
      </view>
    </template>

    <view v-if="showReminderScheduleModal" class="modal-mask" @tap="showReminderScheduleModal = false">
      <view class="modal reminder-schedule-modal" @tap.stop>
        <text class="modal-title">{{ reminderModalTitle }}</text>
        <text class="modal-hint" :class="{ error: myReminderUndelivered }">{{ reminderModalHint }}</text>
        <view class="schedule-field">
          <text>提前</text>
          <input v-model="scheduleAheadDraft" type="number" class="schedule-days-input" />
          <text>天</text>
        </view>
        <picker mode="time" :value="scheduleTimeDraft" @change="onScheduleTimeChange">
          <view class="schedule-time-picker">
            <text>提醒时间</text>
            <text>{{ scheduleTimeDraft }} ›</text>
          </view>
        </picker>
        <button class="modal-primary" :loading="savingReminderSchedule" @tap="saveReminderSchedule">{{ reminderModalButtonText }}</button>
        <button v-if="myReminderEnabled && !myReminderUndelivered" class="modal-secondary danger" :disabled="savingReminderSchedule" @tap="disableMyReminder">关闭我的提醒</button>
        <button class="modal-secondary" :disabled="savingReminderSchedule" @tap="showReminderScheduleModal = false">取消</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { checkInCommitment, confirmCommitment, getEntry, updateCommitmentDetails, updateEntry, type ConfirmStatus, type Entry } from '@/services/entries'
import { getSpace, type Space } from '@/services/spaces'
import { getCachedUserId } from '@/services/auth'
import { useThemePage } from '@/composables/useThemePage'
import { hasValidCoords, openLocationOnMap, pickLocationFromMap } from '@/subpackages/shared/services/location'
import { request } from '@/api/request'
import { isUndeliveredReminder, undeliveredReminderCopy } from '@/services/reminderPresentation'

const { pageStyle } = useThemePage()
const entryId = ref('')
const entry = ref<Entry | null>(null)
const space = ref<Space | null>(null)
const loading = ref(true)
const saving = ref(false)
const savingDetails = ref(false)
const responding = ref(false)
const errorText = ref('')
const myReminderEnabled = ref(false)
const myReminderAheadDays = ref(0)
const myReminderTimeMinutes = ref(600)
const myReminderAccepted = ref(false)
const myReminderStatus = ref<NonNullable<Entry['wxSubscribeStatus']>>('none')
const myReminderSentAt = ref<string | null>(null)
const myReminderAttempts = ref(0)
const showReminderScheduleModal = ref(false)
const savingReminderSchedule = ref(false)
const scheduleAheadDraft = ref('0')
const scheduleTimeDraft = ref('10:00')
const assignments = ref<Array<{ id: string; text: string; assigneeUserId?: string; done?: boolean }>>([])
const transport = ref('')
const note = ref('')
let detailsSaveTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedDetails = ''
const myUserId = computed(() => String(getCachedUserId() || ''))
const isOwner = computed(() => String(entry.value?.userId || '') === myUserId.value)
const myStatus = computed(() => entry.value?.commitmentMeta?.confirmStatus?.[myUserId.value] || 'pending')
const checkedIn = computed(() => entry.value?.commitmentMeta?.checkedIn || {})
const confirmationSummary = computed(() => {
  const members = space.value?.members || []
  const total = Number(space.value?.memberCount || members.length)
  const confirmed = Object.values(entry.value?.commitmentMeta?.confirmStatus || {}).filter((status) => status === 'confirmed').length
  return `${confirmed}/${total} 已确认`
})
const participantOverflow = computed(() => {
  if (!space.value?.isOfficial) return 0
  return Math.max(0, Number(space.value.memberCount || 0) - (space.value.members?.length || 0))
})
// 约定当天仍保留到场打卡；自然日结束后才切换为回忆入口。
const hasEventEnded = computed(() => (entry.value?.daysUntil ?? 1) < 0)
const canNavigate = computed(() =>
  !!entry.value?.location && hasValidCoords(entry.value?.locationLat ?? undefined, entry.value?.locationLng ?? undefined),
)
const myReminderUndelivered = computed(() => !!entry.value && isUndeliveredReminder({
  ...entry.value,
  remindEnabled: myReminderEnabled.value,
  remindAheadDays: myReminderAheadDays.value,
  wxSubscribeStatus: myReminderStatus.value,
  wxSubscribeAttempts: myReminderAttempts.value,
}))
const myReminderTitle = computed(() => {
  if (myReminderUndelivered.value) return '提醒未送达'
  if (myReminderStatus.value === 'sent') return '提醒已发送'
  return myReminderEnabled.value ? '提醒已开启' : '是否开启提醒'
})
const myReminderTimeText = computed(() => {
  const minutes = Math.max(0, Math.min(1439, myReminderTimeMinutes.value))
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})
const myReminderCopy = computed(() => {
  if (myReminderUndelivered.value) {
    return undeliveredReminderCopy({ wxSubscribeStatus: myReminderStatus.value })
  }
  if (myReminderStatus.value === 'sent') {
    const sentAt = new Date(myReminderSentAt.value || '')
    if (!Number.isNaN(sentAt.getTime())) {
      const pad = (value: number) => `${value}`.padStart(2, '0')
      return `已提醒 · ${sentAt.getMonth() + 1}月${sentAt.getDate()}日 ${pad(sentAt.getHours())}:${pad(sentAt.getMinutes())}`
    }
    return '已提醒'
  }
  if (myReminderEnabled.value) return `提前 ${myReminderAheadDays.value} 天 · ${myReminderTimeText.value}`
  return '到时间前提醒我'
})
const myReminderActionLabel = computed(() => {
  if (myReminderUndelivered.value || myReminderStatus.value === 'sent') return '再次开启'
  return myReminderEnabled.value ? '调整' : '开启'
})
const reminderNeedsFreshAuthorization = computed(() =>
  myReminderStatus.value === 'sent' || myReminderUndelivered.value,
)
const reminderModalTitle = computed(() => {
  if (myReminderUndelivered.value) return '重新开启提醒'
  if (myReminderStatus.value === 'sent') return '再次开启提醒'
  return myReminderEnabled.value ? '调整我的提醒' : '开启我的提醒'
})
const reminderModalHint = computed(() => {
  if (myReminderUndelivered.value) return `${myReminderCopy.value}。重新选择时间并完成微信授权，即可继续收到提醒。`
  if (myReminderStatus.value === 'sent') return '本次提醒已经发送。再次开启后，下一个周期会按新时间提醒你。'
  return '只设置你自己的提醒时间，不影响其他成员。'
})
const reminderModalButtonText = computed(() => {
  if (myReminderUndelivered.value) return '重新开启提醒'
  if (myReminderStatus.value === 'sent') return '再次开启'
  return myReminderEnabled.value ? '保存修改' : '开启提醒'
})

function navigateToLocation() {
  const current = entry.value
  if (!current) return
  const opened = openLocationOnMap({
    latitude: current.locationLat ?? undefined,
    longitude: current.locationLng ?? undefined,
    name: current.location,
  })
  if (!opened) uni.showToast({ title: '这个地点没有坐标，重新选一次即可导航', icon: 'none' })
}

/**
 * 点行为按角色分流：发起人改地点，其他成员只能看/导航。
 * 成员点空行不该静默无反应，所以给一句提示。
 */
async function onLocationRowTap() {
  if (!isOwner.value) {
    if (canNavigate.value) navigateToLocation()
    else uni.showToast({ title: '只有发起人可以修改集合地点', icon: 'none' })
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    const picked = await pickLocationFromMap()
    // null = 取消或拒绝授权，保持原地点不动。
    if (!picked) return
    const updated = await updateEntry(entryId.value, {
      location: picked.name,
      locationLat: picked.latitude ?? null,
      locationLng: picked.longitude ?? null,
    })
    entry.value = updated
    uni.showToast({ title: '集合地点已更新', icon: 'none' })
  } catch {
    uni.showToast({ title: '地点更新失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}
const dateText = computed(() => {
  const raw = entry.value?.eventAt || entry.value?.eventDate || ''
  return raw.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1年$2月$3日').replace(' ', ' · ').slice(0, 19)
})

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const loaded = await getEntry(entryId.value)
    if (loaded.type === 'diary' || loaded.entryKind !== 'commitment') throw new Error('这不是一条约定')
    entry.value = loaded
    const reminder = await request<{
      remindEnabled: boolean
      remindAheadDays: number
      remindTimeMinutes?: number
      wxSubscribeAccepted?: boolean
      wxSubscribeStatus?: Entry['wxSubscribeStatus']
      wxSubscribeSentAt?: string | null
      wxSubscribeAttempts?: number
    }>({
      url: `/api/entries/${encodeURIComponent(loaded.id)}/collaborate/remind`,
    }).catch(() => ({
      remindEnabled: String(loaded.userId || '') === myUserId.value ? loaded.remindEnabled : false,
      remindAheadDays: String(loaded.userId || '') === myUserId.value ? loaded.remindAheadDays || 0 : 0,
      remindTimeMinutes: 600,
      wxSubscribeAccepted: false,
      wxSubscribeStatus: String(loaded.userId || '') === myUserId.value ? loaded.wxSubscribeStatus : 'none' as const,
      wxSubscribeSentAt: String(loaded.userId || '') === myUserId.value ? loaded.wxSubscribeSentAt : null,
      wxSubscribeAttempts: String(loaded.userId || '') === myUserId.value ? loaded.wxSubscribeAttempts : 0,
    }))
    myReminderEnabled.value = !!reminder.remindEnabled
    myReminderAheadDays.value = Number(reminder.remindAheadDays) || 0
    const loadedMinutes = Number(reminder.remindTimeMinutes)
    myReminderTimeMinutes.value = Number.isFinite(loadedMinutes) ? Math.max(0, Math.min(1439, loadedMinutes)) : 600
    myReminderAccepted.value = !!reminder.wxSubscribeAccepted
    myReminderStatus.value = reminder.wxSubscribeStatus || 'none'
    myReminderSentAt.value = reminder.wxSubscribeSentAt || null
    myReminderAttempts.value = Number(reminder.wxSubscribeAttempts) || 0
    assignments.value = [...(loaded.commitmentMeta?.assignments || [])]
    transport.value = loaded.commitmentMeta?.transport || ''
    note.value = loaded.commitmentMeta?.note || ''
    lastSavedDetails = detailsSnapshot()
    space.value = loaded.spaceId ? await getSpace(loaded.spaceId) : null
  } catch (error: any) {
    entry.value = null
    errorText.value = error?.message || '加载失败'
  } finally { loading.value = false }
}

function memberStatusLabel(userId: string) {
  const status = memberStatus(userId)
  return status === 'confirmed' ? '已确认参加' : status === 'declined' ? '来不了' : '等待确认'
}

function memberStatus(userId: string): ConfirmStatus {
  return entry.value?.commitmentMeta?.confirmStatus?.[userId] || 'pending'
}

function memberStatusClass(userId: string) {
  return memberStatus(userId)
}

function memberStatusMark(userId: string) {
  const status = memberStatus(userId)
  return status === 'confirmed' ? '✓' : status === 'declined' ? '—' : '·'
}

async function respond(status: ConfirmStatus) {
  if (!entry.value || myStatus.value === status || responding.value) return
  responding.value = true
  try {
    entry.value = await confirmCommitment(entry.value.id, status)
    uni.showToast({ title: status === 'confirmed' ? '已确认参加' : status === 'declined' ? '已回复无法参加' : '已撤回回复', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '确认失败', icon: 'none' })
  } finally {
    responding.value = false
  }
}

function changeMyResponse() {
  if (responding.value || myStatus.value === 'pending') return
  const alternative: ConfirmStatus = myStatus.value === 'confirmed' ? 'declined' : 'confirmed'
  uni.showActionSheet({
    itemList: [alternative === 'confirmed' ? '改为确认参加' : '改为暂时无法参加', '撤回回复'],
    success: ({ tapIndex }) => { void respond(tapIndex === 0 ? alternative : 'pending') },
  })
}

function addAssignment() {
  uni.showModal({ title: '添加分工', editable: true, placeholderText: '例如：负责预订营地', success: (result) => {
    const text = String(result.content || '').trim()
    if (!result.confirm || !text) return
    const members = space.value?.members || []
    if (!members.length) { assignments.value.push({ id: `task_${Date.now()}`, text }); scheduleDetailsSave(0); return }
    uni.showActionSheet({ itemList: ['暂不指定', ...members.map((member) => member.nickname)], success: ({ tapIndex }) => { assignments.value.push({ id: `task_${Date.now()}`, text, assigneeUserId: tapIndex ? members[tapIndex - 1]?.userId : '' }); scheduleDetailsSave(0) } })
  } })
}

function toggleAssignment(id: string) { assignments.value = assignments.value.map((item) => item.id === id ? { ...item, done: !item.done } : item); scheduleDetailsSave(0) }
function assigneeName(userId?: string) { return space.value?.members?.find((member) => member.userId === userId)?.nickname || '暂未指定' }

function detailsSnapshot() {
  return JSON.stringify({ assignments: assignments.value, transport: transport.value, note: note.value })
}

function scheduleDetailsSave(delay = 700) {
  if (!isOwner.value || !entry.value) return
  if (detailsSaveTimer) clearTimeout(detailsSaveTimer)
  detailsSaveTimer = setTimeout(() => {
    detailsSaveTimer = null
    void persistDetails()
  }, delay)
}

function onTransportInput(event: any) {
  transport.value = String(event?.detail?.value || '')
  scheduleDetailsSave()
}

function onNoteInput(event: any) {
  note.value = String(event?.detail?.value || '')
  scheduleDetailsSave()
}

async function persistDetails() {
  if (!entry.value || !isOwner.value) return
  const snapshot = detailsSnapshot()
  if (snapshot === lastSavedDetails) return
  if (savingDetails.value) { scheduleDetailsSave(200); return }
  const payload = {
    assignments: assignments.value.map((item) => ({ ...item })),
    transport: transport.value,
    note: note.value,
  }
  savingDetails.value = true
  try {
    entry.value = await updateCommitmentDetails(entry.value.id, payload)
    lastSavedDetails = snapshot
  } catch (error: any) {
    uni.showToast({ title: error?.message || '自动保存失败，请重试', icon: 'none' })
  } finally {
    savingDetails.value = false
    if (detailsSnapshot() !== lastSavedDetails) scheduleDetailsSave(200)
  }
}

async function checkIn() {
  if (!entry.value || checkedIn.value[myUserId.value]) return
  try { entry.value = await checkInCommitment(entry.value.id); uni.showToast({ title: '到场打卡成功', icon: 'success' }) } catch (error: any) { uni.showToast({ title: error?.message || '打卡失败', icon: 'none' }) }
}

function editEntry() { if (entry.value) uni.navigateTo({ url: `/subpackages/notes/edit?id=${encodeURIComponent(entry.value.id)}` }) }
function openReminderSettings() {
  if (!entry.value) return
  scheduleAheadDraft.value = String(myReminderAheadDays.value)
  scheduleTimeDraft.value = myReminderTimeText.value
  showReminderScheduleModal.value = true
}
function onScheduleTimeChange(event: any) {
  scheduleTimeDraft.value = String(event?.detail?.value || '10:00')
}
async function requestWechatReminderAuthorization() {
  let accepted = false
  // #ifdef MP-WEIXIN
  try {
    const tmplId = '0zdo_07WIQpOPDcIXpeAg7mNiiPm6sIm1fWc754GuBc'
    const result: any = await new Promise((resolve) => {
      uni.requestSubscribeMessage({ tmplIds: [tmplId], success: resolve, fail: resolve })
    })
    accepted = result[tmplId] === 'accept'
  } catch {}
  // #endif
  return accepted
}
async function saveReminderSchedule() {
  if (!entry.value || savingReminderSchedule.value) return
  const ahead = Math.max(0, Math.min(365, Math.floor(Number(scheduleAheadDraft.value) || 0)))
  const match = scheduleTimeDraft.value.match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    uni.showToast({ title: '请选择提醒时间', icon: 'none' })
    return
  }
  const minutes = Number(match[1]) * 60 + Number(match[2])
  savingReminderSchedule.value = true
  try {
    const needsActivation = !myReminderEnabled.value || reminderNeedsFreshAuthorization.value
    if (needsActivation) {
      await request({
        url: `/api/entries/${encodeURIComponent(entry.value.id)}/collaborate/remind`,
        method: 'POST',
        data: { remindEnabled: true, remindAheadDays: ahead, remindTimeMinutes: minutes, validateOnly: true },
      })
    }
    let accepted = reminderNeedsFreshAuthorization.value ? false : myReminderAccepted.value
    if (needsActivation) {
      accepted = await requestWechatReminderAuthorization()
      if (!accepted) {
        uni.showToast({ title: '同意微信授权后才能开启提醒', icon: 'none' })
        return
      }
    }
    await request({
      url: `/api/entries/${encodeURIComponent(entry.value.id)}/collaborate/remind`,
      method: 'POST',
      data: { remindEnabled: true, remindAheadDays: ahead, remindTimeMinutes: minutes, wxSubscribeAccepted: accepted },
    })
    myReminderEnabled.value = true
    myReminderAheadDays.value = ahead
    myReminderTimeMinutes.value = minutes
    myReminderAccepted.value = accepted
    myReminderStatus.value = 'authorized'
    myReminderSentAt.value = null
    myReminderAttempts.value = 0
    showReminderScheduleModal.value = false
    uni.showToast({ title: '提醒已开启', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    savingReminderSchedule.value = false
  }
}
async function disableMyReminder() {
  if (!entry.value || savingReminderSchedule.value) return
  savingReminderSchedule.value = true
  try {
    await request({
      url: `/api/entries/${encodeURIComponent(entry.value.id)}/collaborate/remind`,
      method: 'POST',
      data: {
        remindEnabled: false,
        remindAheadDays: myReminderAheadDays.value,
        remindTimeMinutes: myReminderTimeMinutes.value,
        wxSubscribeAccepted: false,
      },
    })
    myReminderEnabled.value = false
    myReminderAccepted.value = false
    myReminderStatus.value = 'none'
    myReminderSentAt.value = null
    myReminderAttempts.value = 0
    showReminderScheduleModal.value = false
    uni.showToast({ title: '提醒已关闭', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '关闭失败', icon: 'none' })
  } finally {
    savingReminderSchedule.value = false
  }
}
function leaveMemory() {
  if (!entry.value) return
  const params = [`type=diary`, `sourceTitle=${encodeURIComponent(entry.value.title)}`, `sourceDate=${encodeURIComponent(entry.value.eventDate)}`, `ownerType=${entry.value.ownerType === 'space' ? 'space' : 'personal'}`]
  if (entry.value.spaceId) params.push(`spaceId=${encodeURIComponent(entry.value.spaceId)}`)
  uni.navigateTo({ url: `/subpackages/notes/edit?${params.join('&')}` })
}

onLoad((query: Record<string,string> = {}) => { entryId.value = String(query.id || '') })
onShow(() => { if (entryId.value) void load() })
onHide(() => { if (detailsSaveTimer) clearTimeout(detailsSaveTimer); detailsSaveTimer = null; void persistDetails() })
onUnload(() => { if (detailsSaveTimer) clearTimeout(detailsSaveTimer); detailsSaveTimer = null })
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 24rpx 28rpx calc(60rpx + env(safe-area-inset-bottom)); background: var(--dk-bg); color: var(--dk-ink); box-sizing: border-box; }
.state { padding: 120rpx 20rpx; color: var(--dk-muted); text-align: center; }.state .primary { margin-top: 24rpx; }
.page-title { padding: 10rpx 4rpx 26rpx; }.title-line { display:flex; align-items:flex-start; justify-content:space-between; gap:20rpx; }.title { min-width:0; font-size:var(--dk-fs-title,36rpx); font-weight:800; line-height:1.28; }.countdown { flex-shrink:0; margin-top:5rpx; padding:7rpx 16rpx; border-radius:999rpx; color:var(--dk-feature-brand,#2f6f6a); background:var(--dk-feature-brand-soft,#e4f0ee); font-size:var(--dk-fs-caption,23rpx); font-weight:650; }.date { display:block; margin-top:9rpx; color:var(--dk-muted); font-size:var(--dk-fs-meta,25rpx); line-height:1.5; }
.participation-card,.section { margin-bottom:20rpx; padding:26rpx; border:1rpx solid var(--dk-line); border-radius:24rpx; background:var(--dk-surface); box-shadow:0 6rpx 20rpx rgba(24,42,39,.035); }.participation-card { padding-bottom:0; overflow:hidden; }.participation-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20rpx; }.eyebrow { display:block; color:var(--dk-feature-brand,#2f6f6a); font-size:var(--dk-fs-caption,23rpx); font-weight:700; }.space-name { display:block; margin-top:5rpx; font-size:var(--dk-fs-body,30rpx); font-weight:750; }.confirm-progress { flex-shrink:0; padding:7rpx 14rpx; border-radius:999rpx; color:var(--dk-feature-brand,#2f6f6a); background:var(--dk-feature-brand-soft,#e4f0ee); font-size:var(--dk-fs-caption,23rpx); font-weight:650; }
.participant-list { display:flex; gap:28rpx; margin-top:24rpx; padding-bottom:24rpx; overflow-x:auto; }.participant { flex:0 0 92rpx; min-width:0; text-align:center; }.avatar-wrap { position:relative; width:68rpx; height:68rpx; margin:0 auto; }.avatar { width:68rpx; height:68rpx; border-radius:50%; }.avatar.fallback { display:flex; align-items:center; justify-content:center; color:var(--dk-feature-brand,#2f6f6a); background:var(--dk-feature-brand-soft,#e4f0ee); font-size:25rpx; }.status-dot { position:absolute; right:-5rpx; bottom:-3rpx; display:flex; align-items:center; justify-content:center; width:27rpx; height:27rpx; border:3rpx solid var(--dk-surface); border-radius:50%; color:#fff; background:#aab2af; font-size:17rpx; font-weight:800; line-height:1; }.avatar-wrap.confirmed .status-dot { background:var(--dk-feature-brand,#2f6f6a); }.avatar-wrap.declined .status-dot { background:#a88a63; }.participant-name { display:block; margin-top:9rpx; overflow:hidden; font-size:21rpx; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }.participant-state { display:block; margin-top:3rpx; color:var(--dk-muted); font-size:18rpx; white-space:nowrap; }
.my-response { margin:0 -26rpx; padding:22rpx 26rpx; border-top:1rpx solid var(--dk-line); }.my-response.pending { display:block; }.response-prompt,.response-result { display:flex; align-items:center; gap:14rpx; }.response-title { display:block; font-size:var(--dk-fs-meta,25rpx); font-weight:700; }.response-hint { display:block; margin-top:4rpx; color:var(--dk-muted); font-size:var(--dk-fs-caption,23rpx); }.response-actions { display:grid; grid-template-columns:1fr 1fr; gap:12rpx; margin-top:18rpx; }.response-btn { height:64rpx; margin:0; border:0; border-radius:14rpx; font-size:var(--dk-fs-caption,23rpx); line-height:64rpx; }.response-btn::after { border:0; }.response-btn.primary { color:#fff; background:var(--dk-brand); }.response-btn.secondary { color:var(--dk-brand); background:var(--dk-brand-soft); }.my-response.answered { display:flex; align-items:center; justify-content:space-between; gap:20rpx; background:linear-gradient(90deg,var(--dk-brand-soft),transparent); }.response-mark { display:flex; align-items:center; justify-content:center; width:42rpx; height:42rpx; border-radius:50%; color:#fff; background:var(--dk-muted); font-size:22rpx; font-weight:800; }.response-mark.confirmed { background:var(--dk-feature-brand,#2f6f6a); }.change-response { flex-shrink:0; color:var(--dk-brand); font-size:var(--dk-fs-caption,23rpx); font-weight:650; }
.section-title { display:block; margin-bottom:16rpx; color:var(--dk-muted); font-size:var(--dk-fs-meta,25rpx); font-weight:700; }.section-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20rpx; margin-bottom:12rpx; }.section-action { flex-shrink:0; padding:6rpx 0 6rpx 16rpx; color:var(--dk-brand); font-size:var(--dk-fs-caption,23rpx); font-weight:650; line-height:1.4; }.section-title-main { margin-bottom:4rpx; color:var(--dk-ink); font-size:var(--dk-fs-label,28rpx); }.section-subtitle { color:var(--dk-muted); font-size:var(--dk-fs-caption,23rpx); }
.info-row { display:flex; align-items:center; justify-content:space-between; gap:20rpx; padding:20rpx 0; border-top:1rpx solid var(--dk-line); font-size:var(--dk-fs-meta,25rpx); }.info-row>view { min-width:0; flex:1; }.info-row.note { align-items:flex-start; }.label { display:block; flex-shrink:0; color:var(--dk-muted); }.label.strong { color:var(--dk-ink); font-weight:650; }.row-hint { display:block; margin-top:6rpx; color:var(--dk-muted); font-size:var(--dk-fs-caption,23rpx); line-height:1.5; }.row-arrow { color:var(--dk-muted); font-size:32rpx; }.row-action { flex-shrink:0; padding:8rpx 0 8rpx 16rpx; color:var(--dk-brand); font-size:var(--dk-fs-caption,23rpx); font-weight:650; line-height:1.4; }.inline-input,.note-input { width:100%; margin-top:7rpx; color:var(--dk-ink); text-align:left; font-size:var(--dk-fs-caption,23rpx); }.note-input { min-height:74rpx; line-height:1.5; }
.task-row { display:flex; align-items:center; gap:16rpx; padding:17rpx 0; border-top:1rpx solid var(--dk-line); }.task-row:first-of-type { border-top:0; }.task-copy { flex:1; }.task-assignee { display:block; margin-top:4rpx; color:var(--dk-muted); font-size:22rpx; }
.check{width:38rpx;height:38rpx;display:flex;align-items:center;justify-content:center;border:2rpx solid var(--dk-line);border-radius:50%;color:#fff}.check.on{border-color:var(--dk-brand);background:var(--dk-brand)}.done{text-decoration:line-through;color:var(--dk-muted)}.empty-copy{padding:24rpx 0;color:var(--dk-muted);font-size:24rpx}.action-section{display:grid;gap:14rpx;margin-top:4rpx;padding:0;border:0;background:transparent;box-shadow:none}.reminder-section{padding-top:22rpx;padding-bottom:22rpx}.reminder-summary{display:flex;align-items:center;justify-content:space-between;gap:20rpx}.reminder-summary>view{min-width:0;flex:1}.reminder-title{display:block;font-size:26rpx;font-weight:700}.reminder-copy{display:block;margin-top:6rpx;color:var(--dk-muted);font-size:23rpx;line-height:1.45}.reminder-copy.error{color:#c65b49}.reminder-setting-button{flex-shrink:0;width:auto;height:auto;margin:0;padding:8rpx 0 8rpx 18rpx;border:0;border-radius:0;color:var(--dk-brand);background:transparent;font-size:22rpx;font-weight:650;line-height:1.4}.reminder-setting-button::after{border:0}.reminder-setting-button.subtle{min-width:0;height:auto;padding:8rpx 0 8rpx 18rpx;color:var(--dk-brand);background:transparent;font-weight:650;line-height:1.4}.reminder-setting-button.retry{color:#c65b49;background:transparent}
.primary,.memory { height:76rpx; margin:0; border:0; border-radius:20rpx; font-size:24rpx; font-weight:700; line-height:76rpx; }.primary { color:#fff; background:var(--dk-brand); box-shadow:0 12rpx 26rpx rgba(47,111,106,.16); }.primary::after,.memory::after { border:0; }.memory { color:var(--dk-brand); background:var(--dk-brand-soft); }
.modal-mask{position:fixed;top:0;right:0;bottom:0;left:0;z-index:999;display:flex;align-items:center;justify-content:center;padding:30rpx;background:rgba(18,29,27,.48);box-sizing:border-box}.modal{width:560rpx;padding:40rpx;border-radius:20rpx;background:var(--dk-surface,#fff);box-shadow:0 28rpx 80rpx rgba(13,45,41,.22);box-sizing:border-box}.modal-title{display:block;color:var(--dk-ink,#26312e);font-size:32rpx;font-weight:700;text-align:center}.modal-hint{display:block;margin:12rpx 0 24rpx;color:var(--dk-muted,#77827e);font-size:22rpx;line-height:1.5;text-align:center}.modal-hint.error{color:#c65b49}.schedule-field,.schedule-time-picker{display:flex;height:82rpx;align-items:center;margin-bottom:18rpx;padding:0 24rpx;border-radius:18rpx;color:var(--dk-ink,#26312e);background:var(--dk-surface-soft,#f3f6f5);font-size:24rpx;box-sizing:border-box}.schedule-field{gap:16rpx}.schedule-time-picker{justify-content:space-between}.schedule-days-input{width:110rpx;height:58rpx;border-radius:12rpx;background:#fff;text-align:center}.modal-primary{height:72rpx;margin:8rpx 0 0;border:0;border-radius:12rpx;color:#fff;background:var(--dk-brand,#2f6f6a);font-size:26rpx;line-height:72rpx}.modal-primary::after,.modal-secondary::after{border:0}.modal-secondary{height:64rpx;margin:10rpx 0 0;border:0;color:var(--dk-muted,#71807c);background:transparent;font-size:23rpx;line-height:64rpx}.modal-secondary.danger{color:#b65a57}
</style>
