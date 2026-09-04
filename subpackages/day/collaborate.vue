<template>
  <view class="collab-page">
    <view class="space-card">
      <view class="space-heading">
        <text class="space-eyebrow">共同日子</text>
        <text class="space-title">{{ title }}</text>
        <text class="space-copy">一起记住，也各自在合适的时间收到提醒</text>
      </view>

      <scroll-view scroll-x class="members-scroll" :show-scrollbar="false">
        <view class="members-row">
          <view v-for="c in collaborators" :key="c.userId" class="member-item">
            <view class="member-avatar-wrap">
              <image v-if="c.avatarUrl" :src="c.avatarUrl" class="member-avatar" mode="aspectFill" />
              <view v-else class="member-avatar placeholder">
                <text>{{ memberInitial(c) }}</text>
              </view>
              <text
                v-if="isOwner && c.role === 'partner'"
                class="member-kick"
                @tap.stop="kickMember(c.userId)"
              >×</text>
            </view>
            <text class="member-name">{{ memberLabel(c) }}</text>
            <text class="member-remind" :class="{ on: memberReminderOn(c), error: memberReminderUndelivered(c) }">
              {{ memberReminderLabel(c) }}
            </text>
          </view>
          <view v-if="canInvite" class="member-item invite-member" @tap="doInvite">
            <view class="member-avatar add-avatar">
              <text>+</text>
            </view>
            <text class="member-name">{{ inviteActionLabel }}</text>
          </view>
        </view>
      </scroll-view>

      <view class="shared-reminder-panel">
        <view class="setting-row">
          <view class="setting-copy">
            <text class="setting-label">共同提醒 <text class="setting-count">{{ reminderProgressLabel }}</text></text>
            <text class="setting-hint">{{ sharedReminderHint }}</text>
          </view>
        </view>
        <view class="personal-reminder-row">
          <view class="personal-reminder-copy">
            <text class="personal-reminder-title">{{ personalReminderTitle }}</text>
            <text class="personal-reminder-status" :class="{ error: currentReminderUndelivered }">{{ personalReminderCopy }}</text>
          </view>
          <button
            class="personal-reminder-button"
            :class="{
              subtle: remindEnabled && !currentReminderUndelivered && currentReminderStatus !== 'sent',
              retry: currentReminderUndelivered,
            }"
            @tap="openReminderSchedule"
          >{{ personalReminderActionLabel }}</button>
        </view>
        <view v-if="membersNeedingReminder.length" class="reminder-actions-row">
          <button
            class="reminder-nudge-button"
            @tap="openReminderNudgeModal"
          >提醒 {{ reminderNudgeNames }} 开启</button>
        </view>
      </view>
    </view>

    <!-- 待审批邀请请求（仅创建者可见） -->
    <view v-if="isOwner && pendingRequests.length" class="invite-requests">
      <text class="section-title">待审批的邀请请求</text>
      <view v-for="r in pendingRequests" :key="r.id" class="request-item">
        <view class="request-avatar">
          <image v-if="r.requesterAvatar" :src="r.requesterAvatar" mode="aspectFill" />
          <text v-else>{{ (r.requesterNickname || '用户').slice(0, 1) }}</text>
        </view>
        <text class="request-name">{{ r.requesterNickname || '用户' }} 想邀请新成员</text>
        <button class="request-btn approve" @tap="approveRequest(r.id)">同意</button>
        <button class="request-btn reject" @tap="rejectRequest(r.id)">拒绝</button>
      </view>
    </view>

    <view class="add-row">
      <button class="add-btn" @tap="addNote">
        <text class="add-btn-title">写一段回忆</text>
      </button>
      <view class="add-divider" />
      <button class="add-btn photo-btn" @tap="addPhoto">
        <text class="add-btn-title">添加共同照片</text>
      </button>
    </view>

    <view class="moments-section">
      <view class="section-head">
        <view>
          <text class="section-title">共同回忆</text>
          <text class="section-count">一起留下的 {{ filteredMoments.length }} 个片段</text>
        </view>
        <button class="poster-link" @tap="generatePoster">生成回忆海报</button>
      </view>

      <view class="filter-row">
        <picker mode="date" @change="onFilterDate">
          <view class="filter-chip" :class="{ active: filterDate }">
            <text>{{ filterDate || '按日期' }}</text>
            <text v-if="filterDate" class="filter-clear" @tap.stop="filterDate = ''">×</text>
          </view>
        </picker>
        <view class="filter-chip" :class="{ active: filterUserId }" @tap="showAuthorPicker = !showAuthorPicker">
          <text>{{ filterUserLabel || '按作者' }}</text>
          <text v-if="filterUserId" class="filter-clear" @tap.stop="filterUserId = ''">×</text>
        </view>
      </view>
      <view v-if="showAuthorPicker" class="author-picker">
        <view
          v-for="c in collaborators"
          :key="c.userId"
          class="author-option"
          :class="{ selected: filterUserId === String(c.userId) }"
          @tap="filterUserId = String(c.userId); showAuthorPicker = false"
        >
          <text>{{ c.nickname || '微信用户' }}</text>
        </view>
      </view>

      <view v-for="m in filteredMoments" :key="m.id" class="moment-card">
        <view class="moment-author">
          <image v-if="m.authorAvatar" :src="m.authorAvatar" class="moment-avatar" mode="aspectFill" />
          <view v-else class="moment-avatar placeholder"><text>{{ m.authorNickname?.slice(0,1) }}</text></view>
          <text class="moment-name">{{ m.authorNickname }}</text>
          <text class="moment-time">{{ formatTime(m.createdAt) }}</text>
          <button
            v-if="String(m.userId) === currentUserId"
            class="moment-del danger-action danger-action--compact"
            @tap="deleteMoment(m.id)"
          >删除</button>
        </view>
        <text v-if="m.body" class="moment-body">{{ m.body }}</text>
        <view v-if="parseImages(m.images).length" class="moment-images">
          <image
            v-for="(img, idx) in parseImages(m.images)"
            :key="idx"
            :src="img"
            mode="aspectFill"
            class="moment-img"
            @tap="previewImage(parseImages(m.images), idx)"
          />
        </view>
      </view>
      <view v-if="moments.length === 0" class="empty">
        <view class="empty-mark">
          <view class="empty-mark-line" />
        </view>
        <text class="empty-title">故事还没有开始</text>
        <text class="empty-hint">写下一句话，或放入第一张合照</text>
      </view>
    </view>

    <view v-if="showBottomAction" class="bottom-actions">
      <button class="leave-btn" @tap="handleLeave">{{ bottomActionLabel }}</button>
    </view>

    <!-- 协作者发给创建者的审批提醒卡 -->
    <view v-if="showApprovalReminderModal" class="modal-mask" @tap="showApprovalReminderModal = false">
      <view class="modal invite-modal" @tap.stop>
        <text class="modal-title">等待创建者审批</text>
        <text class="invite-day-title">{{ title }}</text>
        <text class="modal-hint">小程序无法主动给创建者发消息，你可以把审批提醒卡发给 TA。</text>
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="modal-btn"
          open-type="share"
          :data-approval-request-id="inviteRequestId"
          @tap="showApprovalReminderModal = false"
        >发送给创建者</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="modal-btn" @tap="showApprovalReminderModal = false">我知道了</button>
        <!-- #endif -->
        <button class="modal-cancel" @tap="showApprovalReminderModal = false">稍后再说</button>
      </view>
    </view>

    <!-- 提醒其他成员开启共同提醒 -->
    <view v-if="showReminderNudgeModal" class="modal-mask" @tap="closeReminderNudgeModal">
      <view class="modal invite-modal" @tap.stop>
        <text class="modal-title">邀请伙伴开启提醒</text>
        <text class="invite-day-title">{{ title }}</text>
        <text class="modal-hint">微信要求每位成员亲自授权。把这张卡发给 {{ reminderNudgeNames }}，邀请 TA 一起开启。</text>
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="modal-btn"
          open-type="share"
          data-reminder-nudge="1"
          @tap="prepareReminderNudgeShare"
        >发送开启提醒卡</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="modal-btn" @tap="showReminderNudgeModal = false">我知道了</button>
        <!-- #endif -->
        <button class="modal-cancel" @tap="closeReminderNudgeModal">稍后再说</button>
      </view>
    </view>

    <!-- 当前成员自己的提醒计划 -->
    <view v-if="showReminderScheduleModal" class="modal-mask" @tap="showReminderScheduleModal = false">
      <view class="modal reminder-schedule-modal" @tap.stop>
        <text class="modal-title">{{ reminderModalTitle }}</text>
        <text class="modal-hint">{{ reminderModalHint }}</text>
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
        <button class="modal-btn" :loading="savingReminderSchedule" @tap="saveReminderSchedule">
          {{ reminderModalButtonText }}
        </button>
        <button v-if="remindEnabled && !currentReminderUndelivered" class="modal-cancel reminder-disable" @tap="disableMyReminder">关闭我的提醒</button>
        <button class="modal-cancel" @tap="showReminderScheduleModal = false">取消</button>
      </view>
    </view>

    <!-- 微信邀请卡片 -->
    <view v-if="showInviteModal" class="modal-mask" @tap="showInviteModal = false">
      <view class="modal invite-modal" @tap.stop>
        <text class="modal-title">邀请好友共同记录</text>
        <text class="invite-day-title">{{ title }}</text>
        <text class="modal-hint">接受后才会{{ inviteSpaceName ? `加入「${inviteSpaceName}」并` : '' }}同步这个日子；每位成员可单独设置提醒。</text>
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="modal-btn"
          open-type="share"
          :data-invite-code="inviteCode"
          @tap="showInviteModal = false"
>发送邀请卡片</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="modal-btn" @tap="copyInviteLink">复制邀请信息</button>
        <!-- #endif -->
        <button class="modal-cancel" @tap="showInviteModal = false">暂不邀请</button>
        <text class="invite-expiry">邀请卡片 7 天内有效，已加入的成员不会重复加入</text>
      </view>
    </view>

    <!-- 写回忆弹窗 -->
    <view
      v-if="showNoteModal"
      class="modal-mask note-modal-mask"
      :class="{ 'keyboard-open': noteEditorFocused }"
      @tap="closeNoteModal"
    >
      <view class="modal write-modal" @tap.stop>
        <view class="notebook-head">
          <view>
            <text class="notebook-kicker">共同回忆</text>
            <text class="notebook-title">写下这一刻</text>
          </view>
          <button class="notebook-close" @tap="closeNoteModal">×</button>
        </view>
        <view class="notebook-paper">
          <textarea
            v-model="noteBody"
            class="note-textarea"
            placeholder="此刻想对彼此说些什么？"
            :maxlength="1000"
            :show-confirm-bar="false"
            :adjust-position="false"
            :hold-keyboard="true"
            @focus="noteEditorFocused = true"
            @blur="noteEditorFocused = false"
            @input="autoSaveNoteDraft"
          />
          <view class="notebook-meta">
            <text>{{ noteDraftStatus }}</text>
            <text>{{ noteBody.length }}/1000</text>
          </view>
        </view>
        <view class="notebook-actions">
          <button class="draft-btn" @tap="saveNoteDraft">暂存</button>
          <button class="save-note-btn" :loading="submitting" @tap="submitNote">保存回忆</button>
        </view>
      </view>
    </view>

    <!-- 海报预览弹窗 -->
    <view v-if="showPosterModal" class="modal-mask" @tap="showPosterModal = false">
      <view class="modal poster-modal" @tap.stop>
        <text class="modal-title">共同回忆海报</text>
        <view class="poster-preview" :class="{ 'default-bg': !posterImages.length }">
          <!-- 照片网格 -->
          <view v-if="posterImages.length" class="poster-grid" :class="'grid-' + posterImages.length">
            <image v-for="(img, i) in posterImages" :key="i" :src="img" class="poster-grid-img" mode="aspectFill" />
          </view>
          <!-- 遮罩 -->
          <view class="poster-overlay" />
          <!-- 弹幕文字 -->
          <view class="poster-danmaku">
            <text
              v-for="(d, i) in danmakuItems"
              :key="i"
              class="danmaku-text"
              :style="d.style"
            >{{ d.text }}</text>
          </view>
          <!-- 底部信息 -->
          <view class="poster-bottom">
            <text class="poster-t">{{ title }}</text>
            <view class="poster-members-row">
              <view v-for="c in collaborators" :key="c.userId" class="poster-m">
                <image v-if="c.avatarUrl" :src="c.avatarUrl" class="poster-m-av" mode="aspectFill" />
                <view v-else class="poster-m-av placeholder"><text>{{ c.nickname?.slice(0,1) }}</text></view>
              </view>
              <text class="poster-member-names">{{ collaborators.map(c => c.nickname || '微信用户').join(' & ') }}</text>
            </view>
            <text class="poster-brand">只我们</text>
          </view>
        </view>
        <button class="modal-btn" :loading="savingPoster" @tap="savePoster">保存到相册</button>
      </view>
    </view>

    <!-- 隐藏 canvas 用于绘制海报 -->
    <canvas canvas-id="collabPoster" class="offscreen-canvas" style="width:750px;height:1000px;" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onHide, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { request } from '@/api/request'
import { deleteEntry } from '@/services/entries'
import { useEntriesStore } from '@/stores/entries'
import { resolveImagesForSave } from '@/subpackages/shared/services/upload'
import { confirmProfileForSocialAction, fetchMe, getCachedUserId } from '@/services/auth'
import { undeliveredReminderCopy } from '@/services/reminderPresentation'

interface Collaborator {
  userId: string
  nickname: string
  avatarUrl: string
  role: string
  remindEnabled: boolean
  wxSubscribeStatus: string
}

interface Moment {
  id: string
  type: string
  body: string
  images: string
  createdAt: string
  userId: string
  authorNickname: string
  authorAvatar: string
}

const entryId = ref('')
const entriesStore = useEntriesStore()
const title = ref('')
const collaborators = ref<Collaborator[]>([])
const hasPartner = ref(false)
const entryOwnerType = ref<'personal' | 'space'>('personal')
const entrySpaceId = ref<string | null>(null)
const moments = ref<Moment[]>([])
const filterDate = ref('')
const filterUserId = ref('')
const showAuthorPicker = ref(false)
const filterUserLabel = computed(() => {
  if (!filterUserId.value) return ''
  const c = collaborators.value.find(x => String(x.userId) === filterUserId.value)
  return c?.nickname || '微信用户'
})
const filteredMoments = computed(() => {
  let list = moments.value
  if (filterDate.value) {
    list = list.filter(m => m.createdAt.slice(0, 10) === filterDate.value)
  }
  if (filterUserId.value) {
    list = list.filter(m => String(m.userId) === filterUserId.value)
  }
  return list
})
function onFilterDate(e: any) {
  filterDate.value = e.detail.value
}
const showInviteModal = ref(false)
const showApprovalReminderModal = ref(false)
const showReminderNudgeModal = ref(false)
const showReminderScheduleModal = ref(false)
const showNoteModal = ref(false)
const showPosterModal = ref(false)
const inviteCode = ref('')
const inviteSpaceId = ref('')
const inviteSpaceName = ref('')
const inviteRequestId = ref('')
const linkedApprovalRequestId = ref('')
const linkedReminderNudge = ref(false)
const shareIntent = ref<'none' | 'reminder-nudge'>('none')
const inviteApprovalStatus = ref<'none' | 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed'>('none')
let inviteApprovalTimer: ReturnType<typeof setTimeout> | null = null
const pendingRequests = ref<Array<{ id: number; requesterId: number; requesterNickname: string; requesterAvatar: string }>>([])

const noteBody = ref('')
const noteDraftSavedAt = ref('')
const noteEditorFocused = ref(false)
const submitting = ref(false)
const remindEnabled = ref(false)
const remindAheadDays = ref(1)
const remindTimeMinutes = ref(600)
const wxSubscribeAcceptedForCurrentUser = ref(false)
const currentReminderStatus = ref('none')
const scheduleAheadDraft = ref('1')
const scheduleTimeDraft = ref('10:00')
const savingReminderSchedule = ref(false)
const currentUserId = ref('')

const isOwner = computed(() => {
  return collaborators.value.some(c => String(c.userId) === currentUserId.value && c.role === 'owner')
})
const isSpaceEntry = computed(() => entryOwnerType.value === 'space')
const showBottomAction = computed(() => isSpaceEntry.value ? isOwner.value : hasPartner.value)
const bottomActionLabel = computed(() => {
  if (isSpaceEntry.value) return '从共同空间删除这个日子'
  return isOwner.value ? '解除共同记录' : '退出共同记录'
})
const canInvite = computed(() => {
  return true
})
const inviteActionLabel = computed(() => {
  if (isOwner.value) return '邀请加入'
  if (inviteApprovalStatus.value === 'pending') return '等待审批'
  if (inviteApprovalStatus.value === 'approved') return '发送邀请'
  if (inviteApprovalStatus.value === 'rejected') return '重新申请'
  return '申请邀请'
})
function memberReminderOn(member: Collaborator) {
  return !!member.remindEnabled && ['authorized', 'sending'].includes(member.wxSubscribeStatus || '')
}
function memberReminderSent(member: Collaborator) {
  return member.wxSubscribeStatus === 'sent'
}
function memberReminderUndelivered(member: Collaborator) {
  return ['failed', 'expired'].includes(member.wxSubscribeStatus || '')
}
function memberReminderLabel(member: Collaborator) {
  if (memberReminderUndelivered(member)) return '未送达'
  if (memberReminderOn(member)) return '已开启'
  if (member.wxSubscribeStatus === 'sent') return '已提醒'
  return '未开启'
}
const reminderEnabledCount = computed(() => collaborators.value.filter(memberReminderOn).length)
const reminderSentCount = computed(() => collaborators.value.filter(memberReminderSent).length)
const reminderUndeliveredCount = computed(() => collaborators.value.filter(memberReminderUndelivered).length)
const reminderProgressLabel = computed(() => {
  const total = collaborators.value.length
  if (reminderUndeliveredCount.value) return `${reminderUndeliveredCount.value}/${total} 未送达`
  if (reminderSentCount.value) return `${reminderSentCount.value}/${total} 已提醒`
  if (reminderEnabledCount.value) return `${reminderEnabledCount.value}/${total} 已开启`
  return `0/${total}`
})
const membersNeedingReminder = computed(() => collaborators.value.filter(
  (member) => !isCurrentUser(member) && !memberReminderOn(member) && !memberReminderSent(member),
))
const reminderNudgeNames = computed(() => {
  const names = membersNeedingReminder.value.map((member) => member.nickname || 'TA')
  return names.length > 2 ? `${names.slice(0, 2).join('、')}等人` : names.join('、') || 'TA'
})

function openReminderNudgeModal() {
  shareIntent.value = 'reminder-nudge'
  showReminderNudgeModal.value = true
}

function closeReminderNudgeModal() {
  showReminderNudgeModal.value = false
  shareIntent.value = 'none'
}

function prepareReminderNudgeShare() {
  // 真机上 open-type=share 不一定把自定义 dataset 传给 onShareAppMessage，
  // 因此用页面状态明确标记本次分享用途。
  shareIntent.value = 'reminder-nudge'
  showReminderNudgeModal.value = false
  setTimeout(() => {
    if (shareIntent.value === 'reminder-nudge') shareIntent.value = 'none'
  }, 1500)
}
const sharedReminderHint = computed(() => {
  const total = collaborators.value.length
  if (!total) return '每位成员需要分别授权微信提醒'
  const sent = reminderSentCount.value
  const enabled = reminderEnabledCount.value
  const undelivered = reminderUndeliveredCount.value
  const disabled = Math.max(0, total - sent - enabled - undelivered)
  if (sent === total) return '本轮提醒已发送给所有成员'
  if (enabled === total) return '所有成员均已开启，等待微信提醒'
  if (undelivered === total) return '提醒均未送达，可由成员重新设置并开启'
  if (disabled === total) return '尚未有成员开启提醒'
  if (total > 3) {
    return [
      sent ? `${sent} 人已提醒` : '',
      enabled ? `${enabled} 人已开启` : '',
      undelivered ? `${undelivered} 人未送达` : '',
      disabled ? `${disabled} 人未开启` : '',
    ].filter(Boolean).join('，')
  }
  return collaborators.value.map((member) => {
    const name = isCurrentUser(member) ? '你' : (member.nickname || '对方')
    if (memberReminderSent(member)) return `${name}已提醒`
    if (memberReminderOn(member)) return `${name}已开启`
    if (memberReminderUndelivered(member)) return `${name}未送达`
    return `${name}未开启`
  }).join('，')
})
const reminderScheduleText = computed(() => {
  const hour = Math.floor(remindTimeMinutes.value / 60)
  const minute = remindTimeMinutes.value % 60
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return `提前 ${remindAheadDays.value} 天 · ${time}`
})
const currentReminderUndelivered = computed(() => ['failed', 'expired'].includes(currentReminderStatus.value))
const reminderNeedsFreshAuthorization = computed(() =>
  currentReminderStatus.value === 'sent' || currentReminderUndelivered.value,
)
const myReminderScheduleText = computed(() => {
  if (currentReminderUndelivered.value) {
    return undeliveredReminderCopy({ wxSubscribeStatus: currentReminderStatus.value as 'failed' | 'expired' })
  }
  return currentReminderStatus.value === 'sent' ? '本轮已发送' : reminderScheduleText.value
})
const personalReminderTitle = computed(() => {
  if (currentReminderUndelivered.value) return '提醒未送达'
  if (currentReminderStatus.value === 'sent') return '提醒已发送'
  return remindEnabled.value ? '提醒已开启' : '是否开启提醒'
})
const personalReminderCopy = computed(() => {
  if (currentReminderUndelivered.value) return myReminderScheduleText.value
  if (currentReminderStatus.value === 'sent') return '本轮提醒已发送'
  return remindEnabled.value ? reminderScheduleText.value : '到时间前提醒我'
})
const personalReminderActionLabel = computed(() => {
  if (reminderNeedsFreshAuthorization.value) return '再次开启'
  return remindEnabled.value ? '调整' : '开启'
})
const reminderModalTitle = computed(() => {
  if (currentReminderUndelivered.value || currentReminderStatus.value === 'sent') return '再次开启我的提醒'
  return remindEnabled.value ? '调整我的提醒' : '开启我的提醒'
})
const reminderModalHint = computed(() => {
  if (currentReminderUndelivered.value) return `${myReminderScheduleText.value}。请重新选择有效时间并按提示开启微信提醒。`
  if (currentReminderStatus.value === 'sent') return '本轮提醒已经发送，再次开启后会在下一个周期继续提醒你。'
  return '只设置你自己的提醒时间，不影响其他成员。'
})
const reminderModalButtonText = computed(() => {
  if (reminderNeedsFreshAuthorization.value) return '再次开启提醒'
  return remindEnabled.value ? '保存修改' : '开启提醒'
})

function isCurrentUser(member: Collaborator) {
  return String(member.userId) === currentUserId.value
}

function memberLabel(member: Collaborator) {
  return isCurrentUser(member) ? '我' : member.nickname || '微信用户'
}

function memberInitial(member: Collaborator) {
  return isCurrentUser(member) ? '我' : member.nickname?.slice(0, 1) || '?'
}

onMounted(() => {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1] as any
  entryId.value = page?.$page?.options?.entryId || page?.options?.entryId || ''
  const rawTitle = String(page?.$page?.options?.title || page?.options?.title || '')
  title.value = ['false', 'undefined', 'null'].includes(rawTitle.toLowerCase())
    ? ''
    : decodeURIComponent(rawTitle)
  const autoInvite = String(page?.$page?.options?.invite || page?.options?.invite || '') === '1'
  inviteSpaceId.value = String(page?.$page?.options?.spaceId || page?.options?.spaceId || '')
  linkedApprovalRequestId.value = String(page?.$page?.options?.approvalRequestId || page?.options?.approvalRequestId || '')
  linkedReminderNudge.value = String(page?.$page?.options?.reminderNudge || page?.options?.reminderNudge || '') === '1'
  void initializePage(autoInvite)
})

onShow(() => {
  if (!entryId.value || !currentUserId.value) return
  // 页面从后台或其他页面返回时刷新提醒状态，避免保留 worker 发送前的旧状态。
  void loadCollabInfo()
  void loadRemindSetting()
  void fetchInviteRequests()
  void fetchInviteApprovalStatus()
})

function stopInviteApprovalPolling() {
  if (inviteApprovalTimer) clearTimeout(inviteApprovalTimer)
  inviteApprovalTimer = null
}

onHide(() => {
  stopInviteApprovalPolling()
  if (showNoteModal.value) persistNoteDraft()
})
onUnload(() => {
  stopInviteApprovalPolling()
  if (showNoteModal.value) persistNoteDraft()
})

async function initializePage(autoInvite: boolean) {
  // 真机环境不保证支持 atob，使用登录时持久化的用户 ID，
  // 并在旧版本没有缓存时通过 /auth/me 补齐。
  currentUserId.value = String(getCachedUserId() || '')
  if (!currentUserId.value) {
    const me = await fetchMe().catch(() => null)
    if (me?.id != null) currentUserId.value = String(me.id)
  }

  if (!entryId.value) return
  await loadCollabInfo()
  void loadMoments()
  await loadRemindSetting()
  if (linkedReminderNudge.value && !remindEnabled.value) {
    linkedReminderNudge.value = false
    uni.showModal({
      title: '伙伴邀请你开启共同提醒',
      content: '开启后，你们会分别收到这个日子的微信提醒。请在“我的提醒”一栏设置时间并完成微信授权。',
      showCancel: false,
      confirmText: '去开启',
    })
  }
  if (autoInvite) {
    await doInvite()
  }
}

async function loadCollabInfo() {
  try {
    const data = await request<{
      title: string
      ownerType: 'personal' | 'space'
      spaceId: string | null
      collaborators: Collaborator[]
      hasPartner: boolean
      momentCount: number
    }>({
      url: `/api/entries/${entryId.value}/collaborate`,
    })
    if (data.title) title.value = data.title
    entryOwnerType.value = data.ownerType === 'space' ? 'space' : 'personal'
    entrySpaceId.value = data.spaceId || null
    const members = data.collaborators || []
    if (currentUserId.value && !members.some((item) => isCurrentUser(item))) {
      const me = await fetchMe().catch(() => null)
      members.unshift({
        userId: currentUserId.value,
        nickname: me?.nickname || '微信用户',
        avatarUrl: me?.avatarUrl || '',
        role: 'owner',
        remindEnabled: false,
        wxSubscribeStatus: 'none',
      })
    }
    collaborators.value = members
    hasPartner.value = data.hasPartner
    void fetchInviteRequests()
    void fetchInviteApprovalStatus()
  } catch {}
}

async function loadMoments() {
  try {
    const data = await request<Moment[]>({
      url: `/api/entries/${entryId.value}/collaborate/moments`,
    })
    moments.value = data || []
  } catch {}
}

async function doInvite() {
  if (!isOwner.value && inviteApprovalStatus.value === 'pending') {
    showApprovalReminderModal.value = true
    return
  }
  if (!isOwner.value && inviteApprovalStatus.value === 'approved' && inviteCode.value) {
    showInviteModal.value = true
    return
  }
  if (!(await confirmProfileForSocialAction('collaborate'))) return
  try {
    if (isOwner.value) {
      const data = await request<{ inviteCode: string; spaceId?: string; spaceName?: string }>({
        url: `/api/entries/${entryId.value}/collaborate/invite`,
        method: 'POST',
        data: { spaceId: inviteSpaceId.value || undefined },
      })
      inviteCode.value = data.inviteCode
      inviteSpaceId.value = data.spaceId || inviteSpaceId.value
      inviteSpaceName.value = data.spaceName || inviteSpaceName.value
      showInviteModal.value = true
      return
    }
    const data = await request<{ status?: string; requestId?: string; inviteCode?: string }>({
      url: `/api/entries/${entryId.value}/collaborate/invite-request`,
      method: 'POST',
    })
    if (data.status === 'approved' && data.inviteCode) {
      inviteRequestId.value = data.requestId || ''
      inviteCode.value = data.inviteCode
      inviteApprovalStatus.value = 'approved'
      showInviteModal.value = true
    } else {
      inviteRequestId.value = data.requestId || ''
      inviteApprovalStatus.value = 'pending'
      showApprovalReminderModal.value = true
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  }
}

async function fetchInviteApprovalStatus() {
  if (isOwner.value || !entryId.value) return
  try {
    const data = await request<{ requestId?: string; status?: typeof inviteApprovalStatus.value; inviteCode?: string }>({
      url: `/api/entries/${entryId.value}/collaborate/invite-request/status`,
    })
    const previous = inviteApprovalStatus.value
    inviteApprovalStatus.value = data.status || 'none'
    inviteRequestId.value = data.requestId || ''
    inviteCode.value = data.status === 'approved' ? data.inviteCode || '' : ''
    if (previous === 'pending' && data.status === 'approved') {
      uni.showToast({ title: '创建者已同意，现在可以发送邀请', icon: 'none' })
    }
  } catch {
    // 状态查询失败不影响共同记录主页。
  } finally {
    stopInviteApprovalPolling()
    if (inviteApprovalStatus.value === 'pending') {
      inviteApprovalTimer = setTimeout(() => void fetchInviteApprovalStatus(), 5000)
    }
  }
}

async function fetchInviteRequests() {
  if (!isOwner.value) return
  try {
    const data = await request<Array<any>>({
      url: `/api/entries/${entryId.value}/collaborate/invite-requests`,
    })
    pendingRequests.value = (data || []).filter((r: any) => r.status === 'pending')
    if (
      linkedApprovalRequestId.value
      && pendingRequests.value.some((item) => String(item.id) === linkedApprovalRequestId.value)
    ) {
      const target = pendingRequests.value.find((item) => String(item.id) === linkedApprovalRequestId.value)
      uni.showToast({ title: `${target?.requesterNickname || '协作者'} 等待你审批`, icon: 'none' })
      linkedApprovalRequestId.value = ''
    }
  } catch {}
}

async function approveRequest(requestId: number) {
  try {
    await request({
      url: `/api/entries/${entryId.value}/collaborate/invite-requests/${requestId}/approve`,
      method: 'POST',
    })
    uni.showToast({ title: '已同意，对方现在可以发送邀请', icon: 'none' })
    await fetchInviteRequests()
  } catch (e: any) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  }
}

async function rejectRequest(requestId: number) {
  try {
    await request({
      url: `/api/entries/${entryId.value}/collaborate/invite-requests/${requestId}/reject`,
      method: 'POST',
    })
    uni.showToast({ title: '已拒绝', icon: 'none' })
    await fetchInviteRequests()
  } catch (e: any) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  }
}

function copyInviteLink() {
  uni.setClipboardData({
    data: `邀请你一起记录「${title.value}」：打开“只我们”微信小程序中的邀请卡片即可加入。`,
    success: () => {
      uni.showToast({ title: '邀请信息已复制', icon: 'success' })
      showInviteModal.value = false
    }
  })
}

onShareAppMessage((event: any) => {
  const reminderNudge = shareIntent.value === 'reminder-nudge'
    || String(event?.target?.dataset?.reminderNudge || '') === '1'
  if (reminderNudge) {
    setTimeout(() => {
      if (shareIntent.value === 'reminder-nudge') shareIntent.value = 'none'
    }, 0)
    return {
      title: `请开启「${title.value || '重要日子'}」共同提醒｜我们一起准时记得`,
      path: `/subpackages/day/collaborate?entryId=${encodeURIComponent(entryId.value)}&title=${encodeURIComponent(title.value)}&reminderNudge=1`,
    }
  }
  const approvalRequestId = String(event?.target?.dataset?.approvalRequestId || '')
  if (approvalRequestId) {
    return {
      title: `请审批「${title.value || '一个重要日子'}」的邀请申请`,
      path: `/subpackages/day/collaborate?entryId=${encodeURIComponent(entryId.value)}&title=${encodeURIComponent(title.value)}&approvalRequestId=${encodeURIComponent(approvalRequestId)}`,
    }
  }
  const code = String(event?.target?.dataset?.inviteCode || inviteCode.value || '')
  if (!code) {
    return { title: '只我们｜世界很大，这里只我们', path: '/pages/timeline/index' }
  }
  return {
    title: `邀请你一起记录「${title.value || '一个重要日子'}」`,
    path: `/subpackages/day/invite?code=${encodeURIComponent(code)}`,
  }
})

function addNote() {
  const draft = readNoteDraft()
  noteBody.value = draft.body
  noteDraftSavedAt.value = draft.savedAt
  showNoteModal.value = true
}

function noteDraftKey() {
  return `dk_collab_note_draft_${entryId.value}_${currentUserId.value || 'me'}`
}

function readNoteDraft(): { body: string; savedAt: string } {
  try {
    const value = uni.getStorageSync(noteDraftKey())
    if (!value) return { body: '', savedAt: '' }
    if (typeof value === 'string') return { body: value, savedAt: '' }
    return {
      body: String(value.body || ''),
      savedAt: String(value.savedAt || ''),
    }
  } catch {
    return { body: '', savedAt: '' }
  }
}

function persistNoteDraft() {
  const body = noteBody.value
  try {
    if (!body.trim()) {
      uni.removeStorageSync(noteDraftKey())
      noteDraftSavedAt.value = ''
      return
    }
    const now = new Date()
    const savedAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    uni.setStorageSync(noteDraftKey(), { body, savedAt })
    noteDraftSavedAt.value = savedAt
  } catch {
    // 本地存储失败不打断输入，正式保存时仍会提交当前内容。
  }
}

function autoSaveNoteDraft(event: any) {
  if (event?.detail?.value != null) noteBody.value = String(event.detail.value)
  persistNoteDraft()
}

const noteDraftStatus = computed(() => (
  noteDraftSavedAt.value ? `已暂存 ${noteDraftSavedAt.value}` : '输入内容会自动暂存'
))

function saveNoteDraft() {
  if (!noteBody.value.trim()) {
    uni.showToast({ title: '还没有可暂存的内容', icon: 'none' })
    return
  }
  persistNoteDraft()
  uni.showToast({ title: '已暂存', icon: 'success' })
}

function closeNoteModal() {
  persistNoteDraft()
  noteEditorFocused.value = false
  showNoteModal.value = false
}

async function addPhoto() {
  uni.chooseImage({
    count: 9,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const tempFilePaths = Array.isArray(res.tempFilePaths)
        ? res.tempFilePaths
        : [res.tempFilePaths].filter(Boolean)
      if (!tempFilePaths.length) return
      uni.showLoading({ title: '上传中...' })
      try {
        const urls = await resolveImagesForSave(tempFilePaths)
        await request({
          url: `/api/entries/${entryId.value}/collaborate/moments`,
          method: 'POST',
          data: { type: 'photo', images: urls },
        })
        uni.hideLoading()
        uni.showToast({ title: '已添加', icon: 'success' })
        loadMoments()
      } catch (e: any) {
        uni.hideLoading()
        uni.showToast({ title: e?.message || '上传失败', icon: 'none' })
      }
    }
  })
}

async function submitNote() {
  if (!noteBody.value.trim()) return
  submitting.value = true
  try {
    await request({
      url: `/api/entries/${entryId.value}/collaborate/moments`,
      method: 'POST',
      data: { type: 'note', body: noteBody.value.trim() },
    })
    uni.showToast({ title: '已发布', icon: 'success' })
    showNoteModal.value = false
    uni.removeStorageSync(noteDraftKey())
    noteBody.value = ''
    noteDraftSavedAt.value = ''
    loadMoments()
  } catch (e: any) {
    uni.showToast({ title: e?.message || '发布失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

async function deleteMoment(momentId: string) {
  uni.showModal({
    title: '删除回忆',
    content: '确定删除这条回忆吗？',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await request({
          url: `/api/entries/${entryId.value}/collaborate/moments/${momentId}`,
          method: 'DELETE',
        })
        uni.showToast({ title: '已删除', icon: 'success' })
        loadMoments()
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
      }
    }
  })
}

async function loadRemindSetting() {
  try {
    const data = await request<{
      remindEnabled: boolean
      remindAheadDays: number
      remindTimeMinutes: number
      wxSubscribeAccepted: boolean
      wxSubscribeStatus?: string
      members?: Array<{ userId: string; nickname: string; remindEnabled: boolean }>
    }>({
      url: `/api/entries/${entryId.value}/collaborate/remind`,
    })
    remindEnabled.value = data.remindEnabled
    const loadedAhead = Number(data.remindAheadDays)
    const loadedMinutes = Number(data.remindTimeMinutes)
    remindAheadDays.value = Number.isFinite(loadedAhead) ? Math.max(0, loadedAhead) : 1
    remindTimeMinutes.value = Number.isFinite(loadedMinutes)
      ? Math.max(0, Math.min(1439, loadedMinutes))
      : 600
    wxSubscribeAcceptedForCurrentUser.value = !!data.wxSubscribeAccepted
    currentReminderStatus.value = data.wxSubscribeStatus || 'none'
    // 仅首次加入且从未申请过提醒授权的 partner 自动提示一次。
    // sent 表示本次微信订阅已成功送达，虽然单次授权被消耗、remindEnabled 会变为 false，
    // 但不应被误判为“从未开启”而再次弹窗。
    const promptKey = `dk_remind_prompted_${entryId.value}_${currentUserId.value}`
    if (
      !data.remindEnabled
      && data.wxSubscribeStatus === 'none'
      && !isOwner.value
      && !uni.getStorageSync(promptKey)
    ) {
      uni.setStorageSync(promptKey, '1')
      promptEnableRemind()
    }
  } catch {}
}

function promptEnableRemind() {
  uni.showModal({
    title: '开启共同提醒',
    content: '开启后，这个日子到期时你会收到微信提醒。是否现在开启？',
    confirmText: '开启',
    cancelText: '稍后',
    success: (res) => {
      if (res.confirm) {
        openReminderSchedule()
      }
    },
  })
}

function openReminderSchedule() {
  scheduleAheadDraft.value = String(remindAheadDays.value)
  const hour = Math.floor(remindTimeMinutes.value / 60)
  const minute = remindTimeMinutes.value % 60
  scheduleTimeDraft.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  showReminderScheduleModal.value = true
}

function onScheduleTimeChange(event: any) {
  scheduleTimeDraft.value = String(event?.detail?.value || '10:00')
}

async function saveReminderSchedule() {
  if (savingReminderSchedule.value) return
  const ahead = Math.max(0, Math.min(365, Math.floor(Number(scheduleAheadDraft.value) || 0)))
  const match = scheduleTimeDraft.value.match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    uni.showToast({ title: '请选择提醒时间', icon: 'none' })
    return
  }
  const minutes = Number(match[1]) * 60 + Number(match[2])
  savingReminderSchedule.value = true
  try {
    const needsActivation = !remindEnabled.value || reminderNeedsFreshAuthorization.value
    // 首次/再次开启前先做时间校验，避免无效时间浪费一次微信授权。
    if (needsActivation) {
      await request({
        url: `/api/entries/${entryId.value}/collaborate/remind`,
        method: 'POST',
        data: {
          remindEnabled: true,
          remindAheadDays: ahead,
          remindTimeMinutes: minutes,
          validateOnly: true,
        },
      })
    }
    let accepted = reminderNeedsFreshAuthorization.value ? false : wxSubscribeAcceptedForCurrentUser.value
    if (needsActivation) {
      accepted = await requestWechatReminderAuthorization()
      if (!accepted) {
        uni.showToast({ title: '同意微信授权后才能开启提醒', icon: 'none' })
        return
      }
    }
    await request({
      url: `/api/entries/${entryId.value}/collaborate/remind`,
      method: 'POST',
      data: {
        remindEnabled: true,
        remindAheadDays: ahead,
        remindTimeMinutes: minutes,
        wxSubscribeAccepted: accepted,
      },
    })
    remindEnabled.value = true
    currentReminderStatus.value = 'authorized'
    wxSubscribeAcceptedForCurrentUser.value = accepted
    remindAheadDays.value = ahead
    remindTimeMinutes.value = minutes
    showReminderScheduleModal.value = false
    uni.showToast({ title: '提醒已开启', icon: 'success' })
    await loadCollabInfo()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    savingReminderSchedule.value = false
  }
}

async function requestWechatReminderAuthorization() {
  let accepted = false
  // #ifdef MP-WEIXIN
  try {
    const tmplId = '0zdo_07WIQpOPDcIXpeAg7mNiiPm6sIm1fWc754GuBc'
    const result: any = await new Promise((resolve) => {
      uni.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: resolve,
        fail: resolve,
      })
    })
    accepted = result[tmplId] === 'accept'
  } catch {}
  // #endif
  return accepted
}

async function disableMyReminder() {
  if (savingReminderSchedule.value) return
  savingReminderSchedule.value = true
  try {
    await request({
      url: `/api/entries/${entryId.value}/collaborate/remind`,
      method: 'POST',
      data: {
        remindEnabled: false,
        remindAheadDays: remindAheadDays.value,
        remindTimeMinutes: remindTimeMinutes.value,
        wxSubscribeAccepted: false,
      },
    })
    remindEnabled.value = false
    currentReminderStatus.value = 'none'
    wxSubscribeAcceptedForCurrentUser.value = false
    showReminderScheduleModal.value = false
    uni.showToast({ title: '已关闭我的提醒', icon: 'success' })
    void loadRemindSetting()
    await loadCollabInfo()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '关闭失败', icon: 'none' })
  } finally {
    savingReminderSchedule.value = false
  }
}

function kickMember(userId: string) {
  uni.showModal({
    title: '移除成员',
    content: '确定将该成员移出共同记录吗？',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await request({
          url: `/api/entries/${entryId.value}/collaborate/kick`,
          method: 'POST',
          data: { userId },
        })
        uni.showToast({ title: '已移除', icon: 'success' })
        loadCollabInfo()
      } catch (e: any) {
        uni.showToast({ title: e?.message || '移除失败', icon: 'none' })
      }
    }
  })
}

function handleLeave() {
  if (isSpaceEntry.value) {
    if (!isOwner.value) return
    uni.showModal({
      title: '从共同空间删除这个日子？',
      content: '删除后，圈内成员将无法再查看这个日子和已有的共同回忆，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#c85f56',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await deleteEntry(entryId.value)
          entriesStore.optimisticRemove(entryId.value)
          entriesStore.invalidate('space', entrySpaceId.value)
          uni.showToast({ title: '已删除', icon: 'success' })
          const spaceQuery = entrySpaceId.value
            ? `?spaceId=${encodeURIComponent(entrySpaceId.value)}`
            : ''
          setTimeout(() => uni.reLaunch({ url: `/subpackages/good-days/index${spaceQuery}` }), 800)
        } catch (e: any) {
          uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
        }
      },
    })
    return
  }
  const msg = isOwner.value ? '解除后协作者将无法继续记录，已有回忆会保留。确定解除？' : '退出后将无法查看和添加共同回忆。确定退出？'
  uni.showModal({
    title: isOwner.value ? '解除共同记录' : '退出共同记录',
    content: msg,
    success: async (res) => {
      if (!res.confirm) return
      try {
        const endpoint = isOwner.value ? 'dissolve' : 'leave'
        await request({
          url: `/api/entries/${entryId.value}/collaborate/${endpoint}`,
          method: 'POST',
        })
        uni.showToast({ title: isOwner.value ? '已解除' : '已退出', icon: 'success' })
        setTimeout(() => uni.navigateBack(), 1000)
      } catch (e: any) {
        uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
      }
    }
  })
}

const savingPoster = ref(false)

function formatPosterBody(body: string | undefined): string {
  if (!body) return '[照片]'
  // Strip emoji that canvas can't render, keep text clean
  const clean = body.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{FE00}-\u{FEFF}]/gu, '').trim()
  if (!clean) return '[照片]'
  return clean.length > 24 ? clean.slice(0, 24) + '...' : clean
}

const posterImages = ref<string[]>([])

interface DanmakuItem { text: string; style: string }
const danmakuItems = ref<DanmakuItem[]>([])

function buildDanmaku() {
  const items: DanmakuItem[] = []
  const texts = moments.value
    .map(m => formatPosterBody(m.body))
    .filter(t => t && t !== '[照片]')
    .slice(0, 12)
  // 预设弹幕位置：散落分布
  const positions = [
    { top: '8%', left: '5%', rotate: -3, size: 28 },
    { top: '12%', left: '55%', rotate: 2, size: 24 },
    { top: '22%', left: '10%', rotate: -1, size: 22 },
    { top: '18%', left: '60%', rotate: -2, size: 26 },
    { top: '32%', left: '3%', rotate: 1, size: 24 },
    { top: '28%', left: '50%', rotate: -3, size: 22 },
    { top: '40%', left: '8%', rotate: 2, size: 26 },
    { top: '38%', left: '55%', rotate: -1, size: 24 },
    { top: '48%', left: '12%', rotate: -2, size: 22 },
    { top: '45%', left: '52%', rotate: 3, size: 28 },
    { top: '55%', left: '5%', rotate: -1, size: 24 },
    { top: '52%', left: '48%', rotate: 2, size: 22 },
  ]
  for (let i = 0; i < texts.length; i++) {
    const p = positions[i % positions.length]
    items.push({
      text: texts[i],
      style: `top:${p.top};left:${p.left};transform:rotate(${p.rotate}deg);font-size:${p.size}rpx;`,
    })
  }
  danmakuItems.value = items
}

function generatePoster() {
  if (!hasPartner.value) {
    uni.showModal({
      title: '先邀请一位伙伴吧',
      content: '邀请伙伴加入后，就能生成属于你们的共同回忆海报。',
      cancelText: '稍后再说',
      confirmText: '去邀请',
      success: (res) => {
        if (res.confirm) void doInvite()
      },
    })
    return
  }
  const uploadedImages = [...new Set(
    moments.value.flatMap((moment) => parseImages(moment.images)).filter(Boolean),
  )]
  if (uploadedImages.length > 9) {
    // Fisher–Yates 洗牌后抽取 9 张，每次生成都能得到不同组合。
    for (let i = uploadedImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[uploadedImages[i], uploadedImages[j]] = [uploadedImages[j], uploadedImages[i]]
    }
  }
  posterImages.value = uploadedImages.slice(0, 9)
  buildDanmaku()
  showPosterModal.value = true
}

async function resolvePosterImagesForCanvas(images: string[]): Promise<string[]> {
  const resolved = await Promise.all(images.map((src) => new Promise<string>((resolve) => {
    uni.getImageInfo({
      src,
      success: (result) => resolve(result.path || src),
      fail: () => resolve(''),
    })
  })))
  return resolved.filter(Boolean)
}

async function savePoster() {
  savingPoster.value = true
  try {
    const ctx = uni.createCanvasContext('collabPoster')
    const W = 750
    const H = 1000
    const imgs = await resolvePosterImagesForCanvas(posterImages.value)

    // 绘制照片网格背景（或默认渐变）
    if (imgs.length === 0) {
      const grd = ctx.createLinearGradient(0, 0, W, H)
      grd.addColorStop(0, '#1a4a46')
      grd.addColorStop(0.4, '#2f6f6a')
      grd.addColorStop(1, '#3d8a83')
      ctx.setFillStyle(grd)
      ctx.fillRect(0, 0, W, H)
    } else if (imgs.length === 1) {
      ctx.drawImage(imgs[0], 0, 0, W, H)
    } else if (imgs.length === 2) {
      ctx.drawImage(imgs[0], 0, 0, W, H / 2)
      ctx.drawImage(imgs[1], 0, H / 2, W, H / 2)
    } else if (imgs.length === 3) {
      ctx.drawImage(imgs[0], 0, 0, W, H * 0.6)
      ctx.drawImage(imgs[1], 0, H * 0.6, W / 2, H * 0.4)
      ctx.drawImage(imgs[2], W / 2, H * 0.6, W / 2, H * 0.4)
    } else if (imgs.length === 4) {
      ctx.drawImage(imgs[0], 0, 0, W / 2, H / 2)
      ctx.drawImage(imgs[1], W / 2, 0, W / 2, H / 2)
      ctx.drawImage(imgs[2], 0, H / 2, W / 2, H / 2)
      ctx.drawImage(imgs[3], W / 2, H / 2, W / 2, H / 2)
    } else {
      // 5-9 photos: 3-column grid
      const cols = 3
      const rows = Math.ceil(imgs.length / cols)
      const cellW = W / cols
      const cellH = H / rows
      for (let i = 0; i < imgs.length; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        ctx.drawImage(imgs[i], col * cellW, row * cellH, cellW, cellH)
      }
    }

    // 半透明遮罩
    ctx.setFillStyle('rgba(0, 0, 0, 0.4)')
    ctx.fillRect(0, 0, W, H)

    // 弹幕文字（散落）
    ctx.setFillStyle('#ffffff')
    ctx.setTextAlign('left')
    const texts = moments.value
      .map(m => formatPosterBody(m.body))
      .filter(t => t && t !== '[照片]')
      .slice(0, 10)
    const danmakuPos = [
      { x: 40, y: 100, size: 32, alpha: 0.9, rotate: -2 },
      { x: 380, y: 150, size: 26, alpha: 0.8, rotate: 1 },
      { x: 60, y: 240, size: 24, alpha: 0.75, rotate: -1 },
      { x: 350, y: 280, size: 28, alpha: 0.85, rotate: 2 },
      { x: 30, y: 370, size: 26, alpha: 0.8, rotate: -3 },
      { x: 320, y: 410, size: 24, alpha: 0.7, rotate: 1 },
      { x: 50, y: 490, size: 30, alpha: 0.85, rotate: 2 },
      { x: 360, y: 540, size: 24, alpha: 0.75, rotate: -1 },
      { x: 40, y: 620, size: 26, alpha: 0.8, rotate: -2 },
      { x: 340, y: 670, size: 28, alpha: 0.9, rotate: 3 },
    ]
    for (let i = 0; i < texts.length; i++) {
      const p = danmakuPos[i]
      ctx.save()
      ctx.setGlobalAlpha(p.alpha)
      ctx.setFontSize(p.size)
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotate * Math.PI) / 180)
      ctx.fillText(texts[i], 0, 0)
      ctx.restore()
    }

    // 底部信息区（渐变遮罩）
    const bottomGrd = ctx.createLinearGradient(0, H - 200, 0, H)
    bottomGrd.addColorStop(0, 'rgba(0,0,0,0)')
    bottomGrd.addColorStop(1, 'rgba(0,0,0,0.7)')
    ctx.setFillStyle(bottomGrd)
    ctx.fillRect(0, H - 200, W, 200)

    // 标题
    ctx.setFillStyle('#ffffff')
    ctx.setGlobalAlpha(1)
    ctx.setFontSize(40)
    ctx.setTextAlign('center')
    ctx.fillText(title.value, W / 2, H - 120)

    // 成员名
    const memberNames = collaborators.value.map(c => c.nickname || '微信用户').join(' & ')
    ctx.setFontSize(24)
    ctx.setGlobalAlpha(0.85)
    ctx.fillText(memberNames, W / 2, H - 75)

    // 品牌
    ctx.setFontSize(20)
    ctx.setGlobalAlpha(0.5)
    ctx.fillText('只我们', W / 2, H - 35)
    ctx.setGlobalAlpha(1)

    // 绘制完成
    ctx.draw(false, () => {
      setTimeout(() => {
        uni.canvasToTempFilePath({
          canvasId: 'collabPoster',
          width: W,
          height: H,
          destWidth: W * 2,
          destHeight: H * 2,
          success: (res) => {
            uni.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                savingPoster.value = false
                showPosterModal.value = false
                uni.showToast({ title: '已保存到相册', icon: 'success' })
              },
              fail: (err) => {
                savingPoster.value = false
                if (String(err?.errMsg || '').includes('deny') || String(err?.errMsg || '').includes('auth')) {
                  uni.showModal({
                    title: '需要相册权限',
                    content: '允许保存到相册后，才能保存海报。',
                    confirmText: '去设置',
                    success: (modal) => {
                      if (modal.confirm) uni.openSetting({})
                    }
                  })
                } else {
                  uni.showToast({ title: '保存失败', icon: 'none' })
                }
              },
            })
          },
          fail: () => {
            savingPoster.value = false
            uni.showToast({ title: '生成海报失败', icon: 'none' })
          },
        })
      }, 300)
    })
  } catch {
    savingPoster.value = false
    uni.showToast({ title: '生成海报失败', icon: 'none' })
  }
}

function parseImages(images: string): string[] {
  try { return JSON.parse(images || '[]') } catch { return [] }
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const y = d.getFullYear()
  const currY = now.getFullYear()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `今天 ${time}`
  if (y === currY) return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
  return `${y}年${d.getMonth() + 1}月${d.getDate()}日 ${time}`
}

function previewImage(urls: string[], idx: number) {
  uni.previewImage({ urls, current: urls[idx] })
}
</script>

<style scoped>
.collab-page {
  min-height: 100vh;
  padding: 22rpx 28rpx calc(72rpx + env(safe-area-inset-bottom));
  background: #f5f7f6;
  color: var(--dk-ink, #202826);
  box-sizing: border-box;
}
.space-card {
  position: relative;
  overflow: hidden;
  padding: 36rpx 30rpx 0;
  border: 1rpx solid rgba(35, 72, 68, .07);
  border-radius: 32rpx;
  background: #fff;
  box-shadow: 0 12rpx 40rpx rgba(29, 55, 52, .06);
}
.space-card::before {
  position: absolute;
  top: -120rpx;
  right: -100rpx;
  width: 300rpx;
  height: 300rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(91, 151, 143, .13), rgba(91, 151, 143, 0) 70%);
  content: '';
  pointer-events: none;
}
.space-heading {
  position: relative;
  z-index: 1;
}
.space-eyebrow {
  display: block;
  color: var(--dk-brand, #2f6f6a);
  font-size: 20rpx;
  font-weight: 600;
  letter-spacing: .14em;
}
.space-title {
  display: block;
  margin-top: 10rpx;
  overflow: hidden;
  color: var(--dk-ink, #202826);
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.space-copy {
  display: block;
  margin-top: 8rpx;
  color: var(--dk-muted, #77827e);
  font-size: 22rpx;
}
.legacy-tip {
  display: block;
  margin-top: 18rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  color: #776f63;
  background: #f7f3eb;
  font-size: 21rpx;
  line-height: 1.55;
}
.members-scroll {
  width: 100%;
  margin-top: 28rpx;
  padding: 8rpx 0 4rpx;
  white-space: nowrap;
  overflow: visible;
}
.members-row {
  display: inline-flex;
  gap: 12rpx;
}
.member-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  width: 104rpx;
  overflow: visible;
}
.member-avatar-wrap {
  position: relative;
  overflow: visible;
}
.member-kick {
  position: absolute;
  top: 0rpx;
  right: 0rpx;
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 20rpx;
  text-align: center;
  line-height: 28rpx;
}
.member-avatar {
  width: 64rpx;
  height: 64rpx;
  border: 3rpx solid rgba(255,255,255,.95);
  border-radius: 50%;
  box-shadow: 0 6rpx 18rpx rgba(28, 56, 53, .1);
  box-sizing: border-box;
}
.member-avatar.placeholder {
  background: var(--dk-feature-brand-soft, #e4f0ee);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dk-feature-brand, #2f6f6a);
  font-size: 25rpx;
}
.member-avatar.add-avatar {
  background: var(--dk-brand-soft, #e6f1ef);
  border: 1rpx dashed rgba(47,111,106,.5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dk-brand, #2f6f6a);
  font-size: 32rpx;
  box-shadow: none;
}
.member-name {
  max-width: 104rpx;
  overflow: hidden;
  color: var(--dk-muted, #77827e);
  font-size: 20rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member-remind {
  margin-top: 1rpx;
  color: var(--dk-muted, #98a29f);
  font-size: 17rpx;
  white-space: nowrap;
}
.member-remind.on { color: var(--dk-brand, #2f6f6a); }
.member-remind.error { color: #b65f50; }
.shared-reminder-panel {
  margin: 26rpx -30rpx 0;
  padding: 24rpx 30rpx 26rpx;
  border-top: 1rpx solid #edf1ef;
  background: #fbfcfc;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22rpx;
  margin: 0;
  padding: 0;
}
.setting-copy {
  flex: 1;
  min-width: 0;
}
.setting-label {
  display: block;
  color: var(--dk-ink, #202826);
  font-size: 25rpx;
  font-weight: 600;
}
.setting-count {
  display: inline-flex;
  margin-left: 8rpx;
  padding: 2rpx 10rpx;
  border-radius: 999rpx;
  color: var(--dk-brand, #2f6f6a);
  background: #eaf3f1;
  font-size: 19rpx;
}
.setting-hint {
  display: block;
  margin-top: 5rpx;
  color: var(--dk-muted, #77827e);
  font-size: 21rpx;
}
.reminder-nudge-button {
  width: 100%;
  height: 62rpx;
  margin: 12rpx 0 0;
  border: 0;
  border-radius: 14rpx;
  color: var(--dk-brand, #2f6f6a);
  background: #eaf3f1;
  font-size: 22rpx;
  line-height: 62rpx;
}
.reminder-nudge-button::after { border: 0; }
.personal-reminder-row {
  display: flex;
  min-height: 82rpx;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #edf1ef;
}
.personal-reminder-copy { min-width: 0; flex: 1; }
.personal-reminder-title { display: block; color: var(--dk-ink, #26312e); font-size: 23rpx; font-weight: 650; }
.personal-reminder-status { display: block; margin-top: 5rpx; color: var(--dk-muted, #77827e); font-size: 21rpx; line-height: 1.4; }
.personal-reminder-status.error { color: #b65f50; }
.personal-reminder-button {
  min-width: 112rpx;
  height: 60rpx;
  margin: 0;
  padding: 0 22rpx;
  border: 0;
  border-radius: 999rpx;
  color: #fff;
  background: var(--dk-brand, #2f6f6a);
  font-size: 22rpx;
  font-weight: 700;
  line-height: 60rpx;
}
.personal-reminder-button::after { border: 0; }
.personal-reminder-button.subtle { min-width: 0; height: auto; padding: 7rpx 17rpx; color: var(--dk-brand, #2f6f6a); background: var(--dk-brand-soft, #e6f1ef); font-weight: 600; line-height: 1.4; }
.personal-reminder-button.retry { background: #a85f50; }
.reminder-actions-row { margin-top: 18rpx; }
.reminder-schedule-modal { text-align: left; }
.reminder-schedule-modal .modal-title,
.reminder-schedule-modal .modal-hint { text-align: center; }
.reminder-disable { color: #b65a57; }
.schedule-field,
.schedule-time-picker {
  display: flex;
  height: 82rpx;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
  padding: 0 24rpx;
  border-radius: 18rpx;
  color: var(--dk-ink, #26312e);
  background: var(--dk-surface-soft, #f3f6f5);
  font-size: 24rpx;
}
.schedule-field { justify-content: flex-start; gap: 16rpx; }
.schedule-days-input {
  width: 110rpx;
  height: 58rpx;
  border-radius: 12rpx;
  background: #fff;
  text-align: center;
}
.add-row {
  display: flex;
  align-items: center;
  gap: 0;
  height: 78rpx;
  margin-top: 20rpx;
  padding: 0 8rpx;
  border: 1rpx solid rgba(47,111,106,.09);
  border-radius: 18rpx;
  background: linear-gradient(135deg, rgba(255,255,255,.88), rgba(234,244,242,.7));
  box-shadow:
    inset 0 1rpx 0 rgba(255,255,255,.95),
    0 7rpx 22rpx rgba(35,72,68,.035);
}
.add-btn {
  display: flex;
  flex: 1;
  height: 100%;
  margin: 0;
  padding: 0 12rpx;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--dk-brand, #2f6f6a);
  text-align: center;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  box-shadow: none;
}
.add-btn::after { border: none; }
.add-btn-title {
  font-size: 24rpx;
  font-weight: 550;
  letter-spacing: .02em;
  line-height: 1;
}
.add-divider {
  width: 1rpx;
  height: 30rpx;
  flex-shrink: 0;
  background: rgba(47,111,106,.15);
}
.photo-btn {
  color: #55716d;
}
.moments-section {
  margin-top: 42rpx;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
  padding: 0 4rpx;
}
.section-title {
  display: block;
  color: var(--dk-ink, #202826);
  font-size: 30rpx;
  font-weight: 650;
}
.section-count {
  display: block;
  margin-top: 4rpx;
  color: var(--dk-muted, #77827e);
  font-size: 21rpx;
}
.poster-link {
  width: auto;
  height: 54rpx;
  margin: 0;
  padding: 0 18rpx;
  border: 0;
  border-radius: 999rpx;
  color: var(--dk-brand, #2f6f6a);
  background: #eaf3f1;
  font-size: 21rpx;
  line-height: 52rpx;
}
.poster-link::after {
  border: 0;
}
.filter-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 22rpx;
}
.filter-chip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  border: 1rpx solid #e5eae8;
  background: #fff;
  font-size: 22rpx;
  color: #666;
}
.filter-chip.active {
  background: var(--dk-brand-soft, #e6f1ef);
  color: var(--dk-brand, #2f6f6a);
}
.filter-clear {
  font-size: 24rpx;
  color: #999;
  margin-left: 4rpx;
}
.author-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.author-option {
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: #f5f5f5;
  font-size: 24rpx;
  color: #666;
}
.author-option.selected {
  background: var(--dk-brand, #2f6f6a);
  color: #fff;
}
.moment-card {
  margin-bottom: 14rpx;
  padding: 26rpx;
  border: 1rpx solid rgba(35,72,68,.07);
  border-radius: 24rpx;
  background: var(--dk-surface, #fff);
  box-shadow: 0 7rpx 24rpx rgba(29,55,52,.035);
}
.moment-author {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 14rpx;
}
.moment-avatar {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
}
.moment-avatar.placeholder {
  background: var(--dk-feature-brand-soft, #e4f0ee);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dk-feature-brand, #2f6f6a);
  font-size: 20rpx;
}
.moment-name {
  flex: 1;
  color: var(--dk-ink, #202826);
  font-size: 23rpx;
  font-weight: 500;
}
.moment-time {
  color: var(--dk-muted, #77827e);
  font-size: 21rpx;
}
.moment-del {
  margin-left: 12rpx;
  margin-right: 0;
}
.moment-body {
  color: var(--dk-ink, #202826);
  font-size: 27rpx;
  line-height: 1.65;
  white-space: pre-wrap;
}
.moment-images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}
.moment-img {
  width: 200rpx;
  height: 200rpx;
  border-radius: 12rpx;
}
.empty {
  display: flex;
  min-height: 300rpx;
  padding: 56rpx 30rpx;
  border: 1rpx dashed var(--dk-line, #dfe6e3);
  border-radius: 24rpx;
  background: rgba(255,255,255,.5);
  text-align: center;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.empty-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 70rpx;
  height: 70rpx;
  margin-bottom: 20rpx;
  border-radius: 50%;
  background: var(--dk-brand-soft, #e6f1ef);
}
.empty-mark-line {
  width: 27rpx;
  height: 20rpx;
  border-left: 3rpx solid var(--dk-brand, #2f6f6a);
  border-bottom: 3rpx solid var(--dk-brand, #2f6f6a);
  transform: skew(-12deg) rotate(-35deg);
}
.empty-title {
  display: block;
  color: var(--dk-ink, #202826);
  font-size: 27rpx;
  font-weight: 550;
}
.empty-hint {
  display: block;
  margin-top: 9rpx;
  color: var(--dk-muted, #77827e);
  font-size: 22rpx;
}
.invite-requests {
  margin-top: 32rpx;
  padding: 24rpx;
  background: var(--dk-card, #f8faf9);
  border-radius: 16rpx;
}
.invite-requests .section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--dk-text, #2f3e36);
  margin-bottom: 16rpx;
  display: block;
}
.request-item {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--dk-line, #eee);
}
.request-item:last-child { border-bottom: none; }
.request-avatar {
  display: flex;
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-right: 16rpx;
  border-radius: 50%;
  color: var(--dk-brand, #2f6f6a);
  background: var(--dk-brand-soft, #e4f0ee);
  font-size: 22rpx;
  font-weight: 650;
}
.request-avatar image {
  width: 100%;
  height: 100%;
}
.request-name {
  flex: 1;
  font-size: 26rpx;
  color: var(--dk-text, #333);
}
.request-btn {
  font-size: 24rpx;
  padding: 8rpx 20rpx;
  margin-left: 12rpx;
  border-radius: 8rpx;
  line-height: 1.4;
}
.request-btn.approve {
  background: #2f6f6a;
  color: #fff;
}
.request-btn.reject {
  background: #eee;
  color: #666;
}

.bottom-actions {
  margin-top: 48rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--dk-line, #dfe6e3);
}
.leave-btn {
  width: auto;
  height: 58rpx;
  margin: 0 auto;
  padding: 0 24rpx;
  border: 0;
  color: #b65a57;
  background: transparent;
  font-size: 22rpx;
  line-height: 58rpx;
}
.leave-btn::after { border: none; }
/* Modal */
.modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.note-modal-mask {
  box-sizing: border-box;
  transition: padding-top .18s ease;
}
.note-modal-mask.keyboard-open {
  align-items: flex-start;
  padding-top: 28rpx;
}
.modal {
  width: 560rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 40rpx;
  text-align: center;
}
.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  display: block;
  margin-bottom: 24rpx;
}
.invite-modal { border: 1rpx solid rgba(47,111,106,.12); border-radius: 28rpx; box-shadow: 0 24rpx 70rpx rgba(13,45,41,.22); }
.invite-day-title { display: block; margin: -8rpx 0 20rpx; color: #244b47; font-size: 38rpx; font-weight: 700; line-height: 1.35; }
.modal-hint {
  font-size: 22rpx;
  color: #999;
  display: block;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.modal-btn {
  background: #2f6f6a;
  color: #fff;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;
}
.modal-btn::after { border: none; }
.modal-cancel { height: 66rpx; margin-top: 12rpx; border: 0; color: #71807c; background: transparent; font-size: 24rpx; line-height: 66rpx; }
.modal-cancel::after { border: none; }
.invite-expiry { display: block; margin-top: 8rpx; color: #9aa5a2; font-size: 19rpx; }
.write-modal {
  width: 620rpx;
  padding: 32rpx;
  border: 1rpx solid rgba(116,92,60,.1);
  border-radius: 28rpx;
  background: #f9f6ef;
  box-shadow: 0 28rpx 80rpx rgba(29,36,34,.24);
  text-align: left;
}
.notebook-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 4rpx 4rpx 24rpx;
}
.notebook-kicker {
  display: block;
  color: #7b8d87;
  font-size: 19rpx;
  letter-spacing: .16em;
}
.notebook-title {
  display: block;
  margin-top: 8rpx;
  color: #27322f;
  font-size: 34rpx;
  font-weight: 650;
}
.notebook-close {
  width: 52rpx;
  height: 52rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #87928e;
  background: rgba(255,255,255,.6);
  font-size: 34rpx;
  font-weight: 300;
  line-height: 48rpx;
}
.notebook-close::after { border: 0; }
.notebook-paper {
  overflow: hidden;
  padding: 18rpx 24rpx 14rpx 38rpx;
  border: 1rpx solid rgba(122,102,73,.1);
  border-radius: 18rpx;
  background:
    linear-gradient(90deg, transparent 25rpx, rgba(194,123,107,.16) 25rpx, rgba(194,123,107,.16) 27rpx, transparent 27rpx),
    repeating-linear-gradient(to bottom, #fffdf8 0, #fffdf8 55rpx, rgba(85,113,106,.1) 56rpx);
  box-shadow: inset 0 2rpx 8rpx rgba(75,62,43,.035);
}
.note-textarea {
  width: 100%;
  height: 310rpx;
  min-height: 310rpx;
  padding: 0;
  color: #303936;
  background: transparent;
  font-size: 27rpx;
  line-height: 56rpx;
  text-align: left;
  box-sizing: border-box;
}
.keyboard-open .write-modal {
  padding-top: 24rpx;
  padding-bottom: 24rpx;
}
.keyboard-open .notebook-head {
  padding-bottom: 16rpx;
}
.keyboard-open .note-textarea {
  height: 220rpx;
  min-height: 220rpx;
}
.keyboard-open .notebook-actions {
  margin-top: 16rpx;
}
.notebook-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10rpx;
  color: #9b9d96;
  font-size: 19rpx;
}
.notebook-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}
.draft-btn,
.save-note-btn {
  flex: 1;
  height: 76rpx;
  margin: 0;
  border: 0;
  border-radius: 16rpx;
  font-size: 25rpx;
  line-height: 76rpx;
}
.draft-btn {
  color: #60746f;
  background: rgba(255,255,255,.72);
}
.save-note-btn {
  color: #fff;
  background: var(--dk-brand, #2f6f6a);
}
.draft-btn::after,
.save-note-btn::after { border: 0; }
/* 海报弹窗 */
.poster-modal { width: 620rpx; }
/* 海报预览 */
.poster-preview {
  border-radius: 20rpx;
  margin-bottom: 24rpx;
  position: relative;
  overflow: hidden;
  aspect-ratio: 3 / 4;
  background: #111;
}
.poster-preview.default-bg {
  background: linear-gradient(160deg, #1a4a46 0%, #2f6f6a 40%, #3d8a83 100%);
}
.poster-grid {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  display: grid;
  gap: 2rpx;
}
.poster-grid.grid-1 { grid-template: 1fr / 1fr; }
.poster-grid.grid-2 { grid-template: 1fr 1fr / 1fr; }
.poster-grid.grid-3 { grid-template: 3fr 2fr / 1fr 1fr; }
.poster-grid.grid-3 .poster-grid-img:first-child { grid-column: 1 / -1; }
.poster-grid.grid-4 { grid-template: 1fr 1fr / 1fr 1fr; }
.poster-grid.grid-5,
.poster-grid.grid-6 { grid-template: 1fr 1fr / 1fr 1fr 1fr; }
.poster-grid.grid-5 .poster-grid-img:first-child { grid-column: 1 / 3; }
.poster-grid.grid-7,
.poster-grid.grid-8,
.poster-grid.grid-9 { grid-template: 1fr 1fr 1fr / 1fr 1fr 1fr; }
.poster-grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.poster-overlay {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.35);
  z-index: 1;
}
.poster-danmaku {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 70%;
  z-index: 2;
}
.danmaku-text {
  position: absolute;
  color: rgba(255, 255, 255, 0.88);
  font-weight: 500;
  text-shadow: 0 2rpx 8rpx rgba(0,0,0,0.5);
  white-space: nowrap;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.poster-bottom {
  position: absolute;
  bottom: 0; left: 0; width: 100%;
  padding: 48rpx 32rpx 32rpx;
  background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%);
  z-index: 3;
  text-align: center;
}
.poster-t {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
  display: block;
  letter-spacing: 2rpx;
  margin-bottom: 16rpx;
}
.poster-members-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.poster-m {
  display: flex;
}
.poster-m-av {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  border: 2rpx solid rgba(255,255,255,0.7);
}
.poster-m-av.placeholder {
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: #fff;
}
.poster-member-names {
  font-size: 24rpx;
  color: rgba(255,255,255,0.85);
}
.poster-brand {
  font-size: 20rpx;
  color: rgba(255,255,255,0.4);
  letter-spacing: 2rpx;
  display: block;
}
.offscreen-canvas {
  position: fixed;
  left: -9999rpx;
  top: -9999rpx;
  width: 750px;
  height: 1000px;
}
</style>
