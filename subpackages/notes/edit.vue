<template>
  <view class="page" :style="pageStyle">
    <view v-if="editorLoadState === 'pending'" class="editor-load-state">
      <view class="editor-load-spinner" />
      <text class="editor-load-text">正在打开记录</text>
    </view>

    <view v-else-if="editorLoadState === 'error'" class="editor-load-state">
      <text class="editor-load-title">这条记录暂时打不开</text>
      <text class="editor-load-text">请检查网络后再试一次</text>
      <button class="editor-load-retry" @tap="retryLoadEntry">重新加载</button>
    </view>

    <view v-else class="scroll">
      <!-- 日记：备忘录式 -->
      <view v-if="form.type === 'diary'" class="inner diary" :class="{ 'readonly-diary': !canEditEntry, 'capsule-editor': isCapsuleEditor }">
        <view v-if="isEntryOwner" class="editor-heading">
          <view class="editor-scope" @tap="openEntryScopePicker">
            <text>保存到：{{ entryScopeLabel }}</text>
            <text class="scope-chevron" />
          </view>
          <text class="diary-time-t" @tap="openDiaryTime">{{ diaryTimeLabel }}</text>
        </view>
        <view v-if="isEntryOwner && !id && !isCapsuleEditor && (ownerType === 'personal' || selectedPublicSpace)" class="public-scope-notice" :class="{ personal: !selectedPublicSpace }">
          <text class="public-scope-mark">{{ selectedPublicSpace ? '公开' : '仅自己' }}</text>
          <text>{{ selectedPublicSpace ? '该条随手记将公开发布，所有加入体验圈的人都可见' : '该条随手记将发布到个人空间' }}</text>
        </view>

        <view v-if="!isEntryOwner" class="readonly-entry-head">
          <view class="readonly-author">
            <image v-if="readonlyAuthorAvatar" class="readonly-author-avatar" :src="readonlyAuthorAvatar" mode="aspectFill" />
            <view v-else class="readonly-author-avatar fallback">{{ readonlyAuthorInitial }}</view>
            <view class="readonly-author-copy">
              <text class="readonly-author-name">{{ readonlyAuthorName }}</text>
              <text class="readonly-entry-time">{{ diaryTimeLabel }}</text>
            </view>
          </view>
          <text v-if="canEditEntry" class="readonly-badge approved">共同编辑</text>
          <button
            v-else-if="!selectedPublicSpace && editRequestStatus !== 'pending'"
            class="edit-access-button"
            open-type="share"
            @tap="requestCoEdit"
          >
            <text>{{ editAccessBusy ? '正在申请' : editAccessButtonLabel }}</text>
            <text class="edit-access-arrow">›</text>
          </button>
          <button v-else-if="!selectedPublicSpace" class="edit-access-button pending" open-type="share">
            <text>发送申请卡片</text>
            <text class="edit-access-arrow">›</text>
          </button>
        </view>

        <view v-if="isCapsuleEditor && canEditEntry" class="capsule-letter-heading">
          <text class="capsule-letter-recipient">{{ capsuleRecipientLabel }}</text>
          <text class="capsule-letter-hint">写下此刻，留到以后再读</text>
        </view>

        <view v-if="isEntryOwner && pendingEditRequests.length" class="edit-request-notice">
          <view class="edit-request-person">
            <image v-if="pendingEditRequests[0].requesterAvatar" class="edit-request-avatar" :src="pendingEditRequests[0].requesterAvatar" mode="aspectFill" />
            <view v-else class="edit-request-avatar fallback">{{ pendingEditRequests[0].requesterName.slice(0, 1) }}</view>
            <text>{{ pendingEditRequests[0].requesterName }} 想和你一起完善这条记录</text>
          </view>
          <view class="edit-request-actions">
            <text @tap="resolveCoEdit(pendingEditRequests[0].id, 'rejected')">暂不</text>
            <text class="approve" @tap="resolveCoEdit(pendingEditRequests[0].id, 'approved')">同意</text>
          </view>
        </view>

        <view v-if="showEditorGuide" class="editor-guide">
          <view class="editor-guide-head">
            <view class="editor-guide-heading">
              <text class="editor-guide-kicker">随手记小提示</text>
              <text class="editor-guide-title">这一笔，可以这样开始</text>
              <text class="editor-guide-subtitle">选一种顺手的方式，随时都能继续完善</text>
            </view>
            <text class="editor-guide-close" @tap="dismissEditorGuide">×</text>
          </view>
          <view class="editor-guide-actions">
            <view class="editor-guide-action" @tap="startWriting">
              <view class="editor-guide-action-index"><text>1</text></view>
              <view class="editor-guide-action-copy">
                <text class="editor-guide-action-title">直接写下此刻</text>
                <text class="editor-guide-action-desc">从一句话开始，长短都可以</text>
              </view>
              <text class="editor-guide-action-arrow">›</text>
            </view>
            <view class="editor-guide-action" @tap="chooseDiaryImages">
              <view class="editor-guide-action-index"><text>2</text></view>
              <view class="editor-guide-action-copy">
                <text class="editor-guide-action-title">从一张照片开始</text>
                <text class="editor-guide-action-desc">拍照或选图，文字可以稍后补充</text>
              </view>
              <text class="editor-guide-action-arrow">›</text>
            </view>
          </view>
        </view>
        <view v-else-if="showEditorGuideHint" class="editor-guide-hint" @tap="expandEditorGuide">
          <text class="editor-guide-hint-mark">记</text>
          <text class="editor-guide-hint-text">可以直接写，也可以先放一张照片</text>
          <text class="editor-guide-hint-action">查看用法</text>
        </view>

        <textarea
          v-if="canEditEntry"
          v-model="form.body"
          class="memo"
          :class="{ 'capsule-memo': isCapsuleEditor }"
          :placeholder="diaryPlaceholder"
          maxlength="5000"
          :auto-height="true"
          :focus="diaryFocus"
          :show-confirm-bar="false"
        />

        <text v-else class="readonly-entry-body">{{ form.body || form.title || '这条记录还没有文字' }}</text>

        <view v-if="!canEditEntry && form.images.length" class="readonly-media-section">
          <template v-if="!readonlyGalleryExpanded">
            <swiper
              class="readonly-media-gallery"
              :class="{ single: form.images.length === 1 }"
              next-margin="0rpx"
              :indicator-dots="form.images.length > 1"
              indicator-color="rgba(255, 255, 255, .55)"
              indicator-active-color="#ffffff"
              circular
            >
              <swiper-item v-for="(img, i) in form.images" :key="`${img}-${i}`" class="readonly-media-slide">
                <view class="readonly-media-frame" @tap="previewDiaryImage(i)">
                  <image class="readonly-media-image" :src="img" mode="aspectFit" />
                  <text v-if="form.images.length > 1" class="readonly-media-count">{{ i + 1 }}/{{ form.images.length }}</text>
                </view>
              </swiper-item>
            </swiper>
            <view v-if="form.images.length > 1" class="readonly-gallery-toggle overlay" @tap="readonlyGalleryExpanded = true">
              <text>展开 {{ form.images.length }} 张</text>
            </view>
          </template>

          <template v-else>
            <view class="readonly-gallery-grid">
              <view
                v-for="(img, i) in form.images.slice(0, 9)"
                :key="`${img}-grid-${i}`"
                class="readonly-gallery-grid-item"
                @tap="previewDiaryImage(i)"
              >
                <image class="readonly-gallery-grid-image" :src="img" mode="aspectFill" />
                <view v-if="i === 8 && form.images.length > 9" class="readonly-gallery-more">
                  <text>+{{ form.images.length - 9 }}</text>
                </view>
              </view>
            </view>
            <view class="readonly-gallery-head">
              <text>{{ form.images.length }} 张照片</text>
              <text class="readonly-gallery-collapse" @tap="readonlyGalleryExpanded = false">收起</text>
            </view>
          </template>
        </view>

        <view v-if="canEditEntry" class="media-grid">
          <view v-for="(img, i) in form.images" :key="`${img}-${i}`" class="media-thumb" @tap="previewDiaryImage(i)">
            <image class="media-thumb-image" :src="img" mode="aspectFill" />
            <text class="media-thumb-remove" @tap.stop="removeImg(i)">×</text>
          </view>
          <view v-if="form.images.length < 9" class="media-action photo" @tap="chooseDiaryImages">
            <text class="media-action-icon photo">＋</text>
            <text class="media-action-title">添加照片</text>
          </view>
        </view>

        <view v-if="canEditEntry" class="diary-quick-meta">
          <view class="quick-meta-flow">
            <view class="quick-meta-field location-field" @tap="openLocationSheet">
              <text class="quick-meta-icon location-icon" />
              <text class="quick-meta-label" :class="{ selected: !!form.location }">{{ locating ? '正在打开地图…' : form.location || '选择地点' }}</text>
            </view>
            <text v-if="form.location" class="quick-meta-clear" @tap.stop="clearLocation">×</text>
            <text v-for="tag in entryTags" :key="tag" class="tag-chip" @tap="openTagSheet">#{{ tag }}</text>
            <text class="add-tag-button" @tap="openTagSheet"># 添加标签</text>
          </view>
        </view>

        <view
          v-else-if="form.location || entryTags.length"
          class="diary-quick-meta diary-readonly-meta"
          :class="form.images.length ? 'after-media' : 'after-copy'"
        >
          <view class="quick-meta-flow readonly-meta-flow">
            <view v-if="form.location" class="readonly-location">
              <text class="quick-meta-icon location-icon" />
              <text class="readonly-location-label">{{ form.location }}</text>
            </view>
            <text v-for="tag in entryTags" :key="tag" class="readonly-tag-text">#{{ tag }}</text>
          </view>
        </view>

        <view v-if="isEntryOwner" class="diary-settings">
          <view id="capsule-settings" class="capsule-card" :class="{ standalone: isCapsuleEditor }">
            <view class="capsule-card-head">
              <view class="diary-setting-copy">
                <view class="capsule-title-row">
                  <text class="diary-setting-title">{{ isCapsuleEditor ? '何时打开' : '时间胶囊' }}</text>
                  <text v-if="capsuleEnabled && !isCapsuleEditor" class="capsule-status">已开启</text>
                </view>
                <text class="diary-setting-desc">
                  {{ isCapsuleEditor ? '选择这封信回来的时间' : capsuleEnabled ? '为这段记忆选一个再次相见的时刻' : '把此刻留给未来，到期后再打开' }}
                </text>
              </view>
              <switch v-if="!isCapsuleEditor" :checked="capsuleEnabled" :color="switchColor" @change="onCapsuleToggle" />
            </view>

            <view v-if="capsuleEnabled" class="capsule-body">
              <view class="capsule-mode-tabs">
                <view class="capsule-mode" :class="{ selected: capsuleUnlockMode === 'scheduled' }" @tap="capsuleUnlockMode = 'scheduled'">
                  <text class="capsule-mode-title">指定日期</text>
                  <text v-if="!isCapsuleEditor" class="capsule-mode-desc">选好重逢时间</text>
                </view>
                <view class="capsule-mode" :class="{ selected: capsuleUnlockMode === 'random' }" @tap="capsuleUnlockMode = 'random'">
                  <text class="capsule-mode-title">随机一天</text>
                  <text v-if="!isCapsuleEditor" class="capsule-mode-desc">交给未来决定</text>
                </view>
              </view>

              <view v-if="capsuleUnlockMode === 'scheduled'" class="capsule-unlock-summary">
                <view class="capsule-unlock-icon"><view class="capsule-unlock-hand" /></view>
                <view class="capsule-unlock-copy">
                  <text class="capsule-unlock-kicker">预计解锁</text>
                  <text class="capsule-unlock-date">{{ capsuleUnlockLabel }}</text>
                </view>
                <text class="capsule-unlock-note">{{ capsuleDuration === 'custom' ? '自定义' : '到期可看' }}</text>
              </view>

              <view v-if="capsuleUnlockMode === 'scheduled'" class="capsule-options capsule-durations">
                <view
                  v-for="opt in capsuleOptions"
                  :key="opt.value"
                  class="capsule-opt"
                  :class="{ selected: capsuleDuration === opt.value }"
                  @tap="setCapsuleDuration(opt.value)"
                >
                  <text>{{ opt.label }}</text>
                </view>
              </view>
              <picker
                v-if="capsuleUnlockMode === 'scheduled' && capsuleDuration === 'custom'"
                mode="date"
                :value="capsuleCustomDate"
                :start="capsuleMinDate"
                :end="capsuleMaxDate"
                @change="onCapsuleCustomDate"
              >
                <view class="capsule-custom-date">
                  <text class="capsule-custom-label">选择具体日期</text>
                  <text class="capsule-custom-value">{{ capsuleCustomDate || capsuleMinDate }}</text>
                  <text class="capsule-custom-arrow">›</text>
                </view>
              </picker>

              <view v-if="capsuleUnlockMode === 'random'" class="capsule-unlock-summary random">
                <view class="capsule-random-icon"><text>?</text></view>
                <view class="capsule-unlock-copy">
                  <text class="capsule-unlock-kicker">预计解锁</text>
                  <text class="capsule-unlock-date">未来某一天</text>
                </view>
                <text class="capsule-unlock-note">1—365 天内</text>
              </view>

              <text class="capsule-scope">{{ capsuleScopeText }}</text>

              <view v-if="!capsuleAlreadyUnlocked" class="capsule-reminder-setting">
                <view class="diary-setting-copy">
                  <text class="diary-setting-title">解锁时提醒我</text>
                  <text class="diary-setting-desc">
                    {{ capsuleReminderEnabled ? '已开启微信通知' : '关闭后需自行回来查看' }}
                  </text>
                </view>
                <switch
                  :key="capsuleReminderSwitchKey"
                  :checked="capsuleReminderEnabled"
                  :color="switchColor"
                  @change="onCapsuleReminderToggle"
                />
              </view>
            </view>
          </view>

          <view v-if="!isCapsuleEditor" class="diary-setting pin-setting diary-setting-last">
            <view class="diary-setting-copy">
              <text class="diary-setting-title">置顶</text>
              <text class="diary-setting-desc">在随手记列表中优先显示</text>
            </view>
            <switch :checked="form.pinned" :color="switchColor" @change="onPinnedToggle" />
          </view>
        </view>

      </view>

      <!-- 日期 / 待办 -->
      <view v-else class="inner">
        <view v-if="showDaykeepTypes" class="type-wrap">
          <view class="type-bar">
            <text
              class="type-i"
              :class="{ on: form.type === 'anniversary' }"
              @click="setType('anniversary')"
            >日期</text>
            <text
              class="type-i"
              :class="{ on: form.type === 'todo' }"
              @click="setType('todo')"
            >待办</text>
          </view>
        </view>

        <view class="form-card">
          <text class="form-card-title">基本信息</text>
          <view class="field compact">
            <text class="label">标题</text>
            <input
              v-model="form.title"
              class="input"
              :placeholder="titlePlaceholder"
              maxlength="64"
            />
          </view>

          <view class="field compact">
            <view class="label-row">
              <text class="label inline">{{ dateLabel }}</text>
              <view v-if="form.type === 'anniversary'" class="cal-switch">
                <text
                  class="cal-i"
                  :class="{ on: form.calendar === 'solar' }"
                  @click="setCalendar('solar')"
                >公历</text>
                <text
                  class="cal-i"
                  :class="{ on: form.calendar === 'lunar' }"
                  @click="setCalendar('lunar')"
                >阴历</text>
              </view>
            </view>

            <picker
              v-if="form.calendar === 'solar' || form.type !== 'anniversary'"
              mode="date"
              :value="form.eventDate"
              @change="onDate"
            >
              <view class="picker">{{ eventDateDisplay || '选择日期' }}</view>
            </picker>

            <picker
              v-else
              mode="multiSelector"
              :range="lunarRange"
              :value="lunarIndex"
              @columnchange="onLunarColumnChange"
              @change="onLunarPick"
            >
              <view class="picker">{{ eventDateDisplay || '选择阴历日期' }}</view>
            </picker>
            <text v-if="form.repeatRule === 'yearly'" class="hint">
              会在每年的{{ annualDateLabel }}重复，原始年份不会限制后续提醒。
            </text>
          </view>

          <view v-if="isCommitmentEntry" class="field compact">
            <text class="label">地点</text>
            <!--
              这里和随手记共用同一个选点弹层。
              之前约定是个纯 input，只能手打地名，拿不到坐标，
              于是约定详情页的「集合地点」永远无法导航。
            -->
            <view class="location-picker-row" @tap="isEntryOwner && openLocationSheet()">
              <text class="quick-meta-icon location-icon" />
              <text class="location-picker-text" :class="{ placeholder: !form.location }">
                {{ locating ? '正在打开地图…' : form.location || '在哪里见（选填）' }}
              </text>
              <text v-if="form.location && isEntryOwner" class="location-picker-clear" @tap.stop="clearLocation">×</text>
              <text v-else class="location-picker-arrow">›</text>
            </view>
          </view>

          <view class="field no-bottom-gap">
            <text class="label">重复</text>
            <view class="seg wrap">
              <text
                v-for="opt in repeatOptions"
                :key="opt.value"
                class="seg-i"
                :class="{ on: form.repeatRule === opt.value }"
                @click="setRepeatRule(opt.value)"
              >{{ opt.label }}</text>
            </view>
          </view>
        </view>

        <view class="form-card">
          <text class="form-card-title">备注</text>
          <textarea
            v-model="form.body"
            class="textarea"
            placeholder="写下想补充的内容（选填）"
            maxlength="2000"
            :auto-height="true"
          />
        </view>

        <view v-if="form.type === 'anniversary'" class="form-card">
          <text class="label">纪念日背景</text>
          <view v-if="backgroundPreview" class="bg-preview">
            <image class="bg-img" :src="backgroundPreview" mode="aspectFill" />
            <view class="bg-mask">
              <button class="bg-btn" :loading="uploading" @click="chooseBackground">重新拍照/选择</button>
            </view>
          </view>
          <button v-else class="bg-empty" :loading="uploading" @click="chooseBackground">
            拍照或从相册选择背景图
          </button>
          <text class="hint">支持拍照或从相册选择，背景随时都能更换。</text>
        </view>

        <view class="form-card display-card">
          <text class="form-card-title">显示设置</text>
          <SwitchRow v-if="form.type === 'todo'" v-model="form.todoDone" label="已完成" :color="switchColor" />
          <SwitchRow v-model="form.pinned" label="置顶" :color="switchColor" />
        </view>

        <view v-if="isEntryOwner" class="wx-remind">
          <view class="wx-remind-heading">
            <text class="wx-remind-title">微信提醒</text>
            <text class="wx-remind-heading-note">先设置提醒时间，再授权开启</text>
          </view>
          <view class="remind-config-grid">
            <view class="remind-config-cell">
              <text class="remind-cell-label">提前（天）</text>
              <input v-model.number="form.remindAheadDays" class="remind-cell-input" type="number" />
            </view>
            <view class="remind-config-cell time-cell">
              <text class="remind-cell-label">提醒时间</text>
              <picker mode="time" :value="form.remindTime" @change="onRemindTime">
                <view class="remind-cell-picker" :class="{ placeholder: !form.remindTime }">
                  {{ form.remindTime || '请选择' }}
                </view>
              </picker>
            </view>
          </view>
          <text class="remind-config-hint" :class="{ error: !!reminderScheduleMessage }">{{ remindTimeHint }}</text>
          <view class="remind-divider" />
          <view class="wx-remind-row">
            <view class="wx-remind-copy">
              <text class="wx-remind-sub">{{ wxRemindStatusText }}</text>
            </view>
            <button
              class="wx-remind-btn"
              :class="{ on: wxRemindOn }"
              :loading="wxRemindBusy"
              @tap="onWxRemindTap"
            >{{ wxRemindOn ? '关闭' : annualReminderNeedsAuthorization ? `为${annualReminderTargetYear}年开启` : wxRemindSent ? '再次开启' : '开启' }}</button>
          </view>
        </view>

        <button class="save" :loading="persistBusy" :disabled="persistBusy" @click="save">保存</button>
        <button v-if="id && isEntryOwner" class="del danger-action" @click="remove">删除这条记录</button>
      </view>
    </view>

    <view v-if="editorLoadState === 'ready' && form.type === 'diary' && canEditEntry" class="diary-save-bar" :class="{ 'capsule-save-bar': isCapsuleEditor }">
      <button v-if="id && isEntryOwner" class="diary-delete-button" :disabled="persistBusy" @tap="remove">删除</button>
      <button class="diary-save-button" :class="{ capsule: isCapsuleEditor }" :loading="persistBusy" :disabled="persistBusy" @tap="save">{{ isCapsuleEditor ? '封存' : '保存' }}</button>
    </view>
    <view v-if="editorLoadState === 'ready' && id && selectedPublicSpace && !isEntryOwner" class="public-entry-action-bar">
      <button v-if="isPublicAdmin" @tap="moderatePublicEntry">管理这条内容</button>
      <button v-else @tap="reportCurrentPublicEntry">举报这条内容</button>
    </view>
    <!-- 日记改时间：先选日期再选时分 -->
    <view v-if="showTimeSheet" class="sheet-mask" @tap="closeTimeSheet">
      <view class="sheet" @tap.stop="noop">
        <text class="sheet-title">记录时间</text>
        <picker mode="date" :value="form.eventDate" @change="onDiaryDate">
          <view class="sheet-row">
            <text>日期</text>
            <text class="sheet-val">{{ form.eventDate }}</text>
          </view>
        </picker>
        <picker mode="time" :value="diaryHm" @change="onDiaryTime">
          <view class="sheet-row">
            <text>时间</text>
            <text class="sheet-val">{{ diaryHm }}:{{ diarySec }}</text>
          </view>
        </picker>
        <button class="sheet-ok" @tap="closeTimeSheet">完成</button>
      </view>
    </view>

    <view v-if="showTagSheet" class="meta-mask" @tap="closeTagSheet">
      <view class="meta-sheet" @tap.stop>
        <view class="meta-sheet-head">
          <view>
            <text class="meta-sheet-title">添加标签</text>
            <text class="meta-sheet-subtitle">一次添加一个，最多 8 个</text>
          </view>
          <text class="meta-sheet-close" @tap="closeTagSheet">完成</text>
        </view>
        <view class="tag-compose">
          <text class="tag-compose-prefix">#</text>
          <input v-model="tagDraft" class="tag-compose-input" maxlength="16" placeholder="输入一个标签" confirm-type="done" @confirm="addDraftTag" />
          <button class="tag-add-button" :disabled="!tagDraft.trim()" @tap="addDraftTag">添加</button>
        </view>
        <view v-if="entryTags.length" class="meta-section">
          <text class="meta-section-title">已添加</text>
          <view class="meta-chip-list">
            <view v-for="tag in entryTags" :key="tag" class="meta-chip selected" @tap="removeTag(tag)">
              <text># {{ tag }}</text><text class="meta-chip-remove">×</text>
            </view>
          </view>
        </view>
        <view v-if="suggestedTags.length" class="meta-section">
          <text class="meta-section-title">根据这篇内容推荐</text>
          <scroll-view scroll-x class="meta-chip-scroll">
            <view class="meta-chip-row">
              <text v-for="tag in suggestedTags" :key="tag" class="meta-chip" @tap="addTag(tag)"># {{ tag }}</text>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>

  </view>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { onLoad, onReady, onShareAppMessage } from '@dcloudio/uni-app'
import SwitchRow from '@/components/SwitchRow.vue'
import {
  createEntry,
  updateEntry,
  getEntry,
  deleteEntry,
  entryBackgroundUrl,
  uploadEntryBackground,
  requestEntryEditAccess,
  resolveEntryEditRequest,
  type EntryEditRequest,
  type EntryEditRequestStatus,
  type EntryKind,
  type EntryOwnerType,
  type EntryType,
  type RepeatRule,
} from '@/services/entries'
import { confirmProfileForPublicPublish, isLoggedIn, getCachedUserId } from '@/services/auth'
import { resolveImagesForSave } from '@/subpackages/shared/services/upload'
import { displayDiaryBody } from '@/services/systemEntries'
import { useThemePage } from '@/composables/useThemePage'
import { useEntriesStore } from '@/stores/entries'
import { getSpace, hidePublicEntry, listSpaces, pinPublicEntry, reportPublicEntry, setPublicPostingBlocked, type Space } from '@/services/spaces'
import { getTokens } from '@/services/theme'
import { daysUntil, normalizeRepeatRule } from '@/utils/countdown'
import { normalizeSingleTag, suggestEntryTags } from '@/subpackages/shared/entryMeta'
import { pickLocationFromMap } from '@/subpackages/shared/services/location'
import {
  requestWechatReminderSubscription,
} from '@/subpackages/shared/services/wechatReminder'
import {
  formatLunarLabel,
  formatAnnualDateLabel,
  lunarYears,
  monthsOfLunarYear,
  dayLabels,
  solarToLunarPickerIndex,
  lunarPickerIndexToSolar,
  type LunarMonthOpt,
} from '@/utils/lunar'

const { pageStyle, themeId } = useThemePage()
const entriesStore = useEntriesStore()
const switchColor = computed(() => getTokens(themeId.value).brand)
// 时间胶囊
const capsuleEnabled = ref(false)
const capsuleInitiallyEnabled = ref(false)
const capsuleAlreadyUnlocked = ref(false)
const capsuleReminderEnabled = ref(false)
const capsuleReminderSwitchKey = ref(0)
const capsuleDuration = ref('3m')
const capsuleUnlockMode = ref<'scheduled' | 'random'>('scheduled')
const capsuleCustomDate = ref('')
const capsuleOptions = [
  { label: '1个月', value: '1m' },
  { label: '3个月', value: '3m' },
  { label: '半年', value: '6m' },
  { label: '1年', value: '1y' },
  { label: '自定义', value: 'custom' },
]

function onCapsuleToggle(e: any) {
  const enabled = !!e.detail.value
  capsuleEnabled.value = enabled
  if (!enabled) {
    capsuleReminderEnabled.value = false
    capsuleReminderSwitchKey.value += 1
    wxSubscribeAccepted.value = false
    wxSubscribeStatus.value = 'none'
  }
}

async function onCapsuleReminderToggle(e: any) {
  const enabled = !!e.detail.value
  if (!enabled) {
    capsuleReminderEnabled.value = false
    wxSubscribeAccepted.value = false
    wxSubscribeStatus.value = 'none'
    return
  }

  // 订阅消息必须直接由本次开关点击触发，不能放到保存确认弹窗之后。
  const subscription = await requestWechatReminderSubscription()
  if (subscription === 'accepted') {
    capsuleReminderEnabled.value = true
    wxSubscribeAccepted.value = true
    wxSubscribeStatus.value = 'authorized'
    uni.showToast({ title: '解锁提醒已开启', icon: 'success' })
    return
  }

  capsuleReminderEnabled.value = false
  capsuleReminderSwitchKey.value += 1
  wxSubscribeAccepted.value = false
  wxSubscribeStatus.value = 'none'
  uni.showToast({
    title: subscription === 'rejected'
      ? '未授权提醒，仍可正常保存胶囊'
      : '当前环境暂不支持微信提醒',
    icon: 'none',
  })
}

function onPinnedToggle(e: any) {
  form.pinned = !!e.detail.value
}

function formatCapsulePickerDate(date: Date) {
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const capsuleMinDate = computed(() => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return formatCapsulePickerDate(date)
})

const capsuleMaxDate = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 20)
  return formatCapsulePickerDate(date)
})

function setCapsuleDuration(value: string) {
  capsuleDuration.value = value
  if (value === 'custom' && !capsuleCustomDate.value) {
    capsuleCustomDate.value = capsuleMinDate.value
  }
}

function onCapsuleCustomDate(e: any) {
  capsuleCustomDate.value = String(e.detail.value || capsuleMinDate.value)
}

const capsuleUnlockLabel = computed(() => {
  if (capsuleDuration.value === 'custom') {
    const [year, month, day] = (capsuleCustomDate.value || capsuleMinDate.value).split('-').map(Number)
    return `${year}年${month}月${day}日`
  }
  const now = new Date()
  let target: Date
  switch (capsuleDuration.value) {
    case '1m': target = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()); break
    case '3m': target = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()); break
    case '6m': target = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()); break
    case '1y': target = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()); break
    default: target = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())
  }
  return `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`
})

function getCapsuleUnlockAt(): string | null {
  if (!capsuleEnabled.value) return null
  if (capsuleUnlockMode.value === 'random') return null
  if (capsuleDuration.value === 'custom') {
    const date = capsuleCustomDate.value || capsuleMinDate.value
    return new Date(`${date}T10:00:00+08:00`).toISOString()
  }
  const now = new Date()
  let target: Date
  switch (capsuleDuration.value) {
    case '1m': target = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()); break
    case '3m': target = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()); break
    case '6m': target = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()); break
    case '1y': target = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()); break
    default: target = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())
  }
  return target.toISOString()
}

/** 注册本地推送通知：胶囊到期时弹通知 */
function scheduleCapsuleNotification(entryId: string, title: string, unlockAt: string) {
  // #ifdef APP-PLUS
  try {
    const unlockTime = new Date(unlockAt)
    // 设定通知时间为解锁当天上午 10:00
    unlockTime.setHours(10, 0, 0, 0)
    const delay = Math.max(0, Math.floor((unlockTime.getTime() - Date.now()) / 1000))
    if (delay <= 0) return // 已过期不设通知

    plus.push.createMessage(
      `你封存的「${title}」已到期，快来解锁查看吧`,
      JSON.stringify({ type: 'capsule', entryId }),
      {
        title: '🔓 时间胶囊已解锁',
        delay,
        when: unlockTime,
        cover: false, // 多个胶囊不互相覆盖
      } as any,
    )
    console.log(`[capsule] local notification scheduled: ${title}, delay=${delay}s`)
  } catch (e) {
    console.warn('[capsule] schedule notification failed:', e)
  }
  // #endif
}

const id = ref('')
const editorLoadState = ref<'pending' | 'ready' | 'error'>('pending')
const isEntryOwner = ref(true) // assume owner for new entries; set false for partner viewing shared entry
const canEditEntry = ref(true)
const editRequestStatus = ref<EntryEditRequestStatus>('none')
const pendingEditRequests = ref<EntryEditRequest[]>([])
const editAccessBusy = ref(false)
const editAccessButtonLabel = computed(() => editRequestStatus.value === 'rejected' ? '申请未通过 · 再次申请' : '申请一起编辑')
const loadedUpdatedAt = ref('')
const readonlyAuthorName = ref('圈内成员')
const readonlyAuthorAvatar = ref('')
const loadedEntryUserId = ref('')
const readonlyGalleryExpanded = ref(false)
const readonlyAuthorInitial = computed(() => readonlyAuthorName.value.trim().slice(0, 1) || '人')
const saving = ref(false)
const uploading = ref(false)
const persistBusy = computed(() => saving.value)
/** 本次新建会话的幂等键；有服务端 id 后不再使用 */
const clientRequestId = ref('')
const loginRequired = ref(false)
const returnToTimelineAfterDelete = ref(false)
const pendingBackground = ref('')
const lastBackgroundError = ref('')
const showDaykeepTypes = ref(false)
const typeLocked = ref(false)
const showTimeSheet = ref(false)
const diaryFocus = ref(false)
const composeMode = ref<'text' | 'photo' | 'capsule'>('text')
const diaryPlaceholder = computed(() => ({
  text: '写下一句话，记住此刻…',
  photo: '为这张照片写点什么…',
  capsule: '此刻的你，想对未来说什么？',
}[composeMode.value]))
const showTagSheet = ref(false)
const tagDraft = ref('')
const locating = ref(false)
const showEditorGuide = ref(false)
const showEditorGuideHint = computed(() => false)
const wxSubscribeAccepted = ref(false)
const wxSubscribeStatus = ref<
  'none' | 'authorized' | 'sending' | 'sent' | 'failed' | 'expired'
>('none')
const wxSubscribeSentAt = ref('')
const wxSubscribeError = ref('')
const wxRemindBusy = ref(false)
const quickReminderRequested = ref(false)
const returnToTimelineAfterSave = ref(false)
const ownerType = ref<EntryOwnerType>('personal')
const spaceId = ref<string | null>(null)
const routeEntryKind = ref<EntryKind>('normal')
const isCapsuleEditor = computed(() =>
  composeMode.value === 'capsule' || routeEntryKind.value === 'capsule' || capsuleInitiallyEnabled.value,
)
const capsuleRecipientLabel = computed(() => ownerType.value === 'space' ? '写给未来的我们' : '写给未来的自己')
const editorSpaces = ref<Space[]>([])
const publicPublishConfirmed = ref(false)
const selectedSpace = computed(() => editorSpaces.value.find((space) => space.id === spaceId.value) || null)
const selectedPublicSpace = computed(() => ownerType.value === 'space' && !!selectedSpace.value?.isOfficial)
const isPublicAdmin = computed(() => selectedPublicSpace.value && (
  String(selectedSpace.value?.ownerId || '') === String(getCachedUserId() || '') || selectedSpace.value?.currentUserRole === 'admin'
))
const entryScopeLabel = computed(() => {
  if (ownerType.value !== 'space') return '仅自己'
  return editorSpaces.value.find((space) => space.id === spaceId.value)?.name || '当前时光圈'
})

async function openEntryScopePicker() {
  if (id.value) {
    uni.showToast({ title: '已保存记录不能更换归属空间', icon: 'none' })
    return
  }
  try {
    editorSpaces.value = await listSpaces()
    const items = ['仅自己', ...editorSpaces.value.map((space) => `${space.name}${space.isOfficial ? '（公开）' : ''}`)]
    uni.showActionSheet({
      itemList: items,
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          ownerType.value = 'personal'
          spaceId.value = null
          publicPublishConfirmed.value = false
          return
        }
        const target = editorSpaces.value[tapIndex - 1]
        if (!target) return
        ownerType.value = 'space'
        spaceId.value = target.id
        publicPublishConfirmed.value = false
      },
    })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '空间加载失败', icon: 'none' })
  }
}

function applyEntryScopeFromQuery(q: any) {
  ownerType.value = q?.ownerType === 'space' ? 'space' : 'personal'
  const incomingSpaceId = String(q?.spaceId || '').trim()
  spaceId.value = ownerType.value === 'space' && incomingSpaceId ? incomingSpaceId : null
  publicPublishConfirmed.value = q?.publicConfirmed === '1'
  routeEntryKind.value = q?.entryKind === 'commitment' ? 'commitment' : q?.entryKind === 'capsule' ? 'capsule' : 'normal'
}

async function confirmPublicPublish(): Promise<boolean> {
  if (!!id.value || ownerType.value !== 'space' || !spaceId.value) return true
  if (!selectedSpace.value) {
    try {
      const space = await getSpace(spaceId.value)
      const index = editorSpaces.value.findIndex((item) => item.id === space.id)
      if (index >= 0) editorSpaces.value.splice(index, 1, space)
      else editorSpaces.value.push(space)
    } catch {
      uni.showToast({ title: '暂时无法确认空间权限，请稍后再试', icon: 'none' })
      return false
    }
  }
  if (!selectedPublicSpace.value || publicPublishConfirmed.value) return true
  return new Promise((resolve) => {
    uni.showModal({
      title: '确认公开发布？',
      content: '这条内容会展示在官方体验圈，所有加入者都可以看到。请不要填写隐私或敏感信息。',
      cancelText: '取消',
      confirmText: '公开发布',
      confirmColor: '#2f6f6a',
      success: ({ confirm }) => {
        if (confirm) {
          publicPublishConfirmed.value = true
        }
        resolve(confirm)
      },
      fail: () => resolve(false),
    })
  })
}

function entryScopePayload(isCapsule = false) {
  const finalOwnerType = ownerType.value
  return {
    ownerType: finalOwnerType,
    spaceId: finalOwnerType === 'space' ? spaceId.value : null,
    visibility: finalOwnerType === 'space' ? 'space' as const : 'private' as const,
    entryKind: isCapsule ? 'capsule' as const : effectiveEntryKind(),
  }
}

/**
 * 新约定使用“日期”形态（anniversary + commitment），保留日期、重复、地点、
 * 成员确认和独立提醒；历史 todo + commitment 继续兼容。切到随手记时才退出约定。
 */
function effectiveEntryKind(): EntryKind {
  if (routeEntryKind.value === 'commitment') {
    return form.type === 'diary' ? 'normal' : 'commitment'
  }
  return routeEntryKind.value
}

/** 只有约定才展示并保存地点字段。 */
const isCommitmentEntry = computed(() => effectiveEntryKind() === 'commitment')

function invalidateEntryScope() {
  entriesStore.invalidate(ownerType.value, spaceId.value)
}

const capsuleScopeText = computed(() =>
  ownerType.value === 'space'
    ? '这是一颗时光圈胶囊，到期后圈子成员可一起打开'
    : '这是一颗私密胶囊，到期后只有你自己可查看',
)

const repeatOptions: { value: RepeatRule; label: string }[] = [
  { value: 'none', label: '不重复' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
]

function today() {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function nowParts() {
  const d = new Date()
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return {
    hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    sec: pad(d.getSeconds()),
  }
}

function initialRemindTime() {
  return '10:00'
}

const diaryHm = ref(nowParts().hm)
const diarySec = ref(nowParts().sec)

const form = reactive({
  type: 'anniversary' as EntryType,
  title: '',
  body: '',
  eventDate: today(),
  calendar: 'solar' as 'solar' | 'lunar',
  repeatRule: 'none' as RepeatRule,
  pinned: false,
  showInTimeline: true,
  remindEnabled: false,
  remindAheadDays: 1,
  remindTime: initialRemindTime(),
  todoDone: false,
  images: [] as string[],
  backgroundUrl: '',
  /** 地点。随手记与约定都会用到，其余类型保存时一律送空串。 */
  location: '',
  /** 地点坐标。只有走微信地图选点才有值，手输/最近使用为 null。 */
  locationLat: null as number | null,
  locationLng: null as number | null,
  tagsText: '',
})

const hasDiaryImages = computed(() => form.images.some(Boolean))

function parseEntryTags() {
  return [...new Set(form.tagsText.split(/[、,，\s#]+/).map((tag) => tag.trim().slice(0, 16)).filter(Boolean))].slice(0, 8)
}

const entryTags = computed(() => parseEntryTags())

const suggestedTags = computed(() => {
  return suggestEntryTags({
    title: form.title,
    body: form.body,
    hasImages: hasDiaryImages.value,
    selected: entryTags.value,
  })
})

const backgroundPreview = computed(() => pendingBackground.value || entryBackgroundUrl(form))

/** 完整记录时间用于接口和数据库，始终保留到秒。 */
const diaryEventAt = computed(
  () => `${form.eventDate} ${diaryHm.value}:${diarySec.value}`,
)

/** 页面仅展示到分钟，减少系统字段感。 */
const diaryTimeLabel = computed(() => {
  const [year, month, day] = form.eventDate.split('-').map(Number)
  if (!year || !month || !day) return `记录于 ${form.eventDate} ${diaryHm.value}`
  const currentYear = new Date().getFullYear()
  const dateText = year === currentYear
    ? `${month}月${day}日`
    : `${year}年${month}月${day}日`
  return `记录于 ${dateText} ${diaryHm.value}`
})

function openDiaryTime() {
  showTimeSheet.value = true
}

function closeTimeSheet() {
  showTimeSheet.value = false
}

function noop() {
  /* 阻止遮罩关闭时冒泡 */
}

function newClientRequestId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `c_${Date.now().toString(36)}_${rand}`
}

function ensureClientRequestId() {
  if (!clientRequestId.value) clientRequestId.value = newClientRequestId()
  return clientRequestId.value
}

function setRepeatRule(v: RepeatRule) {
  form.repeatRule = v
}

function onDiaryDate(e: any) {
  form.eventDate = e.detail.value
}

function onDiaryTime(e: any) {
  diaryHm.value = e.detail.value
}

function onRemindTime(e: any) {
  form.remindTime = e.detail.value || ''
}

function onAddImages(paths: string[]) {
  paths.forEach((p) => form.images.push(p))
}

function writeEntryTags(tags: string[]) {
  form.tagsText = tags.join('、')
}

function addTag(value: string) {
  const tag = normalizeSingleTag(value)
  if (!tag && value.trim()) {
    uni.showToast({ title: '一次只能添加一个标签', icon: 'none' })
    return
  }
  if (!tag) return
  if (entryTags.value.includes(tag)) {
    tagDraft.value = ''
    uni.showToast({ title: '这个标签已经添加过了', icon: 'none' })
    return
  }
  if (entryTags.value.length >= 8) {
    uni.showToast({ title: '最多添加 8 个标签', icon: 'none' })
    return
  }
  writeEntryTags([...entryTags.value, tag])
  tagDraft.value = ''
}

function addDraftTag() {
  addTag(tagDraft.value)
}

function removeTag(tag: string) {
  writeEntryTags(entryTags.value.filter((item) => item !== tag))
}

function openTagSheet() {
  tagDraft.value = ''
  showTagSheet.value = true
}

function closeTagSheet() {
  tagDraft.value = ''
  showTagSheet.value = false
}

function clearLocation() {
  form.location = ''
  form.locationLat = null
  form.locationLng = null
}

/** 点击地点后直接进入微信授权与地图选点，不再维护手输地点的第二套数据。 */
async function openLocationSheet() {
  if (locating.value) return
  locating.value = true
  try {
    const picked = await pickLocationFromMap()
    // null = 用户取消地图或暂不授权，保持当前地点不变。
    if (!picked) return
    form.location = picked.name
    form.locationLat = picked.latitude ?? null
    form.locationLng = picked.longitude ?? null
  } catch {
    uni.showToast({ title: '暂时无法打开地图，请稍后重试', icon: 'none' })
  } finally {
    locating.value = false
  }
}

const EDITOR_GUIDE_STORAGE_KEY = 'dk_notes_editor_guide_v1'

function dismissEditorGuide() {
  showEditorGuide.value = false
  uni.setStorageSync(EDITOR_GUIDE_STORAGE_KEY, 'seen')
}

function expandEditorGuide() {
  showEditorGuide.value = true
  diaryFocus.value = false
}

function startWriting() {
  dismissEditorGuide()
  diaryFocus.value = false
  setTimeout(() => {
    diaryFocus.value = true
  }, 30)
}

/**
 * 不拆分编辑器，只改变不同入口进入后的第一步动作与文案。
 */
function applyComposeMode(mode: string) {
  const nextMode = ['text', 'photo', 'capsule'].includes(mode)
    ? mode as typeof composeMode.value
    : 'text'
  composeMode.value = nextMode
  if (mode === 'photo') {
    uni.setNavigationBarTitle({ title: '照片记忆' })
    // 不要同时聚焦正文，否则键盘会和相册选择器互相抢焦点。
    diaryFocus.value = false
    // 等页面渲染完再唤起选择器，否则部分端上会被导航动画打断。
    setTimeout(() => chooseDiaryImages(), 300)
    return
  }
  if (mode === 'capsule') {
    uni.setNavigationBarTitle({ title: '时间胶囊' })
    diaryFocus.value = false
    capsuleEnabled.value = true
    return
  }
  uni.setNavigationBarTitle({ title: '这一刻' })
  diaryFocus.value = true
}

function chooseDiaryImages() {
  const left = Math.max(0, 9 - form.images.length)
  if (!left) return
  uni.chooseImage({
    count: left,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const paths = Array.isArray(res.tempFilePaths)
        ? res.tempFilePaths
        : res.tempFilePaths
          ? [res.tempFilePaths]
          : []
      onAddImages(paths as string[])
      dismissEditorGuide()
      if (composeMode.value === 'photo') {
        setTimeout(() => { diaryFocus.value = true }, 120)
      }
    },
  })
}

function removeImg(i: number) {
  form.images.splice(i, 1)
}

function previewDiaryImage(i: number) {
  if (!form.images[i]) return
  uni.previewImage({ urls: form.images, current: form.images[i] })
}

function applyEventAt(raw?: string | null) {
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const s = raw.replace('T', ' ').slice(0, 19)
    form.eventDate = s.slice(0, 10)
    const time = s.slice(11)
    if (time.length >= 5) {
      diaryHm.value = time.slice(0, 5)
      diarySec.value = time.length >= 8 ? time.slice(6, 8) : nowParts().sec
      return
    }
  }
  const n = nowParts()
  form.eventDate = today()
  diaryHm.value = n.hm
  diarySec.value = n.sec
}

const titlePlaceholder = computed(() => {
  if (form.type === 'todo') return '例如：交房租'
  return '例如：第一次旅行'
})

const dateLabel = computed(() => {
  if (form.type === 'todo') return '截止日期'
  return '日期'
})

function reminderScheduleError() {
  if (!/^\d{2}:\d{2}$/.test(form.remindTime)) return '请先选择提醒时间，再开启微信提醒'
  const [hour, minute] = form.remindTime.split(':').map(Number)
  const ahead = Math.max(0, Math.min(365, Number(form.remindAheadDays) || 0))
  const remaining = daysUntil(form.eventDate, form.repeatRule, new Date(), form.calendar)
  const scheduled = new Date()
  scheduled.setHours(hour, minute, 0, 0)
  scheduled.setDate(scheduled.getDate() + remaining - ahead)
  if (scheduled.getTime() > Date.now()) return ''
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  if (scheduled.getTime() < todayStart.getTime()) {
    return '当前提醒时间已过，请调整日期、提前天数或提醒时间后再开启。'
  }
  return '所选提醒时间已过，请选择晚于当前时间的时间。'
}

const reminderScheduleMessage = computed(() => reminderScheduleError())

const remindTimeHint = computed(() =>
  reminderScheduleMessage.value || '默认上午 10:00；到点后将在一分钟内发送。',
)

function validateReminderSchedule() {
  // 错误直接保留在提醒设置内，避免长 Toast 在小屏设备上截断。
  return !reminderScheduleMessage.value
}

/** 开启 = 已授权且提醒时刻仍未过 */
const wxRemindOn = computed(
  () =>
    form.remindEnabled &&
    (wxSubscribeStatus.value === 'authorized' || wxSubscribeStatus.value === 'sending') &&
    !reminderScheduleMessage.value,
)

/** 已授权/失败但实际未发出（时间已过或发送失败） */
const wxRemindMissed = computed(
  () =>
    wxSubscribeStatus.value === 'failed' ||
    wxSubscribeStatus.value === 'expired' ||
    (form.remindEnabled &&
      (wxSubscribeStatus.value === 'authorized' || wxSubscribeStatus.value === 'sending') &&
      !!reminderScheduleMessage.value),
)

function nextAnnualReminderYear() {
  const remain = daysUntil(form.eventDate, 'yearly', new Date(), form.calendar)
  const target = new Date()
  target.setDate(target.getDate() + remain)
  return target.getFullYear()
}

function sentReminderYear() {
  const date = new Date(wxSubscribeSentAt.value)
  return Number.isNaN(date.getTime()) ? 0 : date.getFullYear()
}

const annualReminderTargetYear = computed(() =>
  form.repeatRule === 'yearly' ? nextAnnualReminderYear() : 0,
)
const annualReminderNeedsAuthorization = computed(
  () =>
    !!annualReminderTargetYear.value &&
    wxSubscribeStatus.value === 'sent' &&
    sentReminderYear() < annualReminderTargetYear.value,
)
const wxRemindSent = computed(
  () => wxSubscribeStatus.value === 'sent' && !annualReminderNeedsAuthorization.value,
)
const wxRemindStatusText = computed(() => {
  if (wxRemindMissed.value) {
    const err = wxSubscribeError.value.trim()
    if (err && !/^user refuse/i.test(err) && !/rid:/i.test(err)) return err
    if (wxSubscribeStatus.value === 'expired') return '日子已过，提醒未发出'
    if (reminderScheduleMessage.value) {
      return '提醒时间已过，未能送达。请调整日期/提前天数/时间后重新开启'
    }
    return '提醒未能送达，请调整后重新开启微信提醒'
  }
  if (wxRemindOn.value) return `已开启，将在 ${form.remindTime} 发送微信通知`
  if (annualReminderNeedsAuthorization.value) {
    return `${annualReminderTargetYear.value} 年待开启，开启后可发送该年度提醒`
  }
  if (wxRemindSent.value) {
    const sentAt = formatReminderSentAt(wxSubscribeSentAt.value)
    return sentAt ? `${sentAt} 已发送提醒` : '已提醒'
  }
  return '未开启'
})

function formatReminderSentAt(raw: string) {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const yearList = lunarYears()
const lunarMonths = ref<LunarMonthOpt[]>(monthsOfLunarYear(new Date().getFullYear()))
const lunarDays = ref<string[]>(dayLabels(lunarMonths.value[0]?.days || 30))
const lunarIndex = ref<[number, number, number]>([0, 0, 0])

const lunarRange = computed(() => [
  yearList.map((y) => `${y}年`),
  lunarMonths.value.map((m) => m.label),
  lunarDays.value,
])

const lunarDisplay = computed(() => {
  if (!form.eventDate) return ''
  return formatLunarLabel(form.eventDate)
})

const annualDateLabel = computed(() =>
  form.eventDate ? formatAnnualDateLabel(form.eventDate, form.calendar) : '',
)

const eventDateDisplay = computed(() => {
  if (!form.eventDate) return ''
  if (form.repeatRule === 'yearly') return `每年 ${annualDateLabel.value}`
  return form.calendar === 'lunar' ? lunarDisplay.value : form.eventDate
})

function syncLunarPicker(ymd: string) {
  const { index, months, days } = solarToLunarPickerIndex(ymd)
  lunarMonths.value = months
  lunarDays.value = days
  lunarIndex.value = index
}

function setCalendar(cal: 'solar' | 'lunar') {
  if (form.calendar === cal) return
  form.calendar = cal
  if (cal === 'lunar') syncLunarPicker(form.eventDate || today())
}

function onLunarColumnChange(e: any) {
  const col = Number(e.detail.column)
  const row = Number(e.detail.value)
  const next: [number, number, number] = [...lunarIndex.value] as any
  next[col] = row
  if (col === 0) {
    const year = yearList[row]
    lunarMonths.value = monthsOfLunarYear(year)
    next[1] = Math.min(next[1], lunarMonths.value.length - 1)
    const mo = lunarMonths.value[next[1]]
    lunarDays.value = dayLabels(mo.days)
    next[2] = Math.min(next[2], lunarDays.value.length - 1)
  } else if (col === 1) {
    const mo = lunarMonths.value[row]
    lunarDays.value = dayLabels(mo?.days || 30)
    next[2] = Math.min(next[2], lunarDays.value.length - 1)
  }
  lunarIndex.value = next
}

function onLunarPick(e: any) {
  const v = e.detail.value as number[]
  lunarIndex.value = [v[0], v[1], v[2]]
  form.eventDate = lunarPickerIndexToSolar(v[0], v[1], v[2], lunarMonths.value)
  syncLunarPicker(form.eventDate)
}

onMounted(() => { syncLunarPicker(form.eventDate) })

onReady(() => {
  if (loginRequired.value) {
    uni.reLaunch({ url: '/pages/login/login' })
  }
})

function setType(t: EntryType) {
  if (typeLocked.value) return
  if (showDaykeepTypes.value && t === 'diary') return
  form.type = t
  if (t === 'anniversary') {
    form.showInTimeline = true
  } else if (t === 'todo') {
    form.repeatRule = 'none'
    form.calendar = 'solar'
    form.showInTimeline = true
  } else {
    form.repeatRule = 'none'
    form.calendar = 'solar'
    form.showInTimeline = false
    form.todoDone = false
  }
  if (t !== 'todo') form.todoDone = false
}

function onDate(e: any) {
  form.eventDate = e.detail.value
  if (form.calendar === 'lunar') syncLunarPicker(form.eventDate)
}
async function persistWxRemindState() {
  if (!id.value || form.type === 'diary') return true
  try {
    const updated = await updateEntry(id.value, {
      remindEnabled: wxRemindOn.value,
      remindAheadDays: Number(form.remindAheadDays) || 0,
      remindTime: form.remindTime,
      wxSubscribeAccepted: wxRemindOn.value && wxSubscribeAccepted.value,
    })
    wxSubscribeStatus.value = updated.wxSubscribeStatus || wxSubscribeStatus.value
    wxSubscribeSentAt.value = updated.wxSubscribeSentAt || ''
    form.remindEnabled = !!updated.remindEnabled
    invalidateEntryScope()
    return true
  } catch (error: any) {
    uni.showToast({ title: error?.message || '提醒状态保存失败', icon: 'none' })
    return false
  }
}

function turnOffWxRemind() {
  form.remindEnabled = false
  wxSubscribeAccepted.value = false
  wxSubscribeStatus.value = 'none'
}

async function onWxRemindTap() {
  if (wxRemindBusy.value) return
  if (wxRemindOn.value) {
    turnOffWxRemind()
    if (await persistWxRemindState()) uni.showToast({ title: '已关闭微信提醒', icon: 'none' })
    return
  }
  if (!validateReminderSchedule()) return
  wxRemindBusy.value = true
  try {
    const result = await requestWechatReminderSubscription()
    if (result === 'accepted') {
      form.remindEnabled = true
      wxSubscribeAccepted.value = true
      wxSubscribeStatus.value = 'authorized'
      if (await persistWxRemindState()) uni.showToast({ title: '微信提醒已开启', icon: 'success' })
      return
    }
    if (result === 'unsupported') {
      // App/H5：先记开启态，后续由系统推送接管
      form.remindEnabled = true
      wxSubscribeAccepted.value = false
      wxSubscribeStatus.value = 'authorized'
      if (await persistWxRemindState()) uni.showToast({ title: '微信提醒已开启', icon: 'success' })
      return
    }
    turnOffWxRemind()
    uni.showToast({ title: '需要同意授权才能开启', icon: 'none' })
  } catch (error: any) {
    turnOffWxRemind()
    uni.showToast({
      title: error?.errMsg || error?.message || '开启失败',
      icon: 'none',
    })
  } finally {
    wxRemindBusy.value = false
  }
}

function applyEditAccess(access: {
  userId?: string
  isOwner?: boolean
  canEdit?: boolean
  editRequestStatus?: EntryEditRequestStatus
  pendingEditRequests?: EntryEditRequest[]
}) {
  const myId = getCachedUserId()
  const inferredOwner = access.userId && myId
    ? String(access.userId) === String(myId)
    : true
  isEntryOwner.value = typeof access.isOwner === 'boolean' ? access.isOwner : !!inferredOwner
  canEditEntry.value = typeof access.canEdit === 'boolean' ? access.canEdit : isEntryOwner.value
  editRequestStatus.value = access.editRequestStatus || 'none'
  pendingEditRequests.value = Array.isArray(access.pendingEditRequests) ? access.pendingEditRequests : []
}

async function requestCoEdit() {
  if (!id.value || editAccessBusy.value) return
  const previousStatus = editRequestStatus.value
  // `open-type="share"` 会紧接本次点击打开微信分享面板；先同步切为 pending，
  // 让本次分享立即使用“共同编辑申请”卡片，无需再点第二次。
  editRequestStatus.value = 'pending'
  editAccessBusy.value = true
  try {
    const access = await requestEntryEditAccess(id.value)
    applyEditAccess(access)
    if (access.canEdit) {
      uni.showToast({ title: '已获得共同编辑权限', icon: 'success' })
    }
  } catch (error: any) {
    editRequestStatus.value = previousStatus
    uni.showToast({ title: error?.message || '申请失败，请稍后再试', icon: 'none' })
  } finally {
    editAccessBusy.value = false
  }
}

async function resolveCoEdit(requestId: string, decision: 'approved' | 'rejected') {
  if (!id.value || editAccessBusy.value) return
  editAccessBusy.value = true
  try {
    const access = await resolveEntryEditRequest(id.value, requestId, decision)
    applyEditAccess(access)
    uni.showToast({ title: decision === 'approved' ? '已同意共同编辑' : '已暂不处理', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '处理失败，请稍后再试', icon: 'none' })
  } finally {
    editAccessBusy.value = false
  }
}

onShareAppMessage(() => {
  const entryTitle = form.body.trim().split(/\n/)[0]?.slice(0, 24) || form.title || '这一刻'
  const requesting = !isEntryOwner.value && editRequestStatus.value === 'pending'
  return {
    title: requesting ? `想和你一起完善「${entryTitle}」` : `一起看看「${entryTitle}」`,
    path: `/subpackages/notes/edit?id=${encodeURIComponent(id.value)}${requesting ? '&editRequest=1' : ''}`,
    imageUrl: form.images[0] || undefined,
  }
})

async function loadExistingEntry(entryId: string) {
  editorLoadState.value = 'pending'
  readonlyGalleryExpanded.value = false
  try {
    const e = await getEntry(entryId)
    loadedEntryUserId.value = String(e.userId || '')
    applyEditAccess(e)
    loadedUpdatedAt.value = e.updatedAt || ''
    if (e.type === 'diary' && e.capsuleUnlockAt && e.capsuleUnlocked) {
      uni.redirectTo({ url: `/subpackages/capsule/locked?id=${encodeURIComponent(entryId)}` })
      return
    }
    form.type = e.type
    form.title = e.title
    // __dk_seed:...__ 标记仅供系统识别，编辑时不展示（所有类型）
    form.body = displayDiaryBody(e.body || '')
    form.eventDate = e.eventDate
    form.calendar = e.calendar === 'lunar' ? 'lunar' : 'solar'
    form.repeatRule = normalizeRepeatRule(e)
    form.pinned = !!e.pinned
    form.showInTimeline = e.showInTimeline
    form.remindEnabled = e.remindEnabled
    form.remindAheadDays = e.remindAheadDays
    form.remindTime = /^\d{2}:\d{2}$/.test(e.remindTime || '') ? e.remindTime! : '10:00'
    wxSubscribeStatus.value = e.wxSubscribeStatus || 'none'
    wxSubscribeSentAt.value = e.wxSubscribeSentAt || ''
    wxSubscribeError.value = e.wxSubscribeError || ''
    wxSubscribeAccepted.value =
      e.wxSubscribeStatus === 'authorized' || e.wxSubscribeStatus === 'sending'
    // 历史「开了提醒但未授权」视为未开启；failed/expired 保留，便于如实展示
    if (
      e.remindEnabled &&
      e.wxSubscribeStatus !== 'authorized' &&
      e.wxSubscribeStatus !== 'sending' &&
      e.wxSubscribeStatus !== 'failed' &&
      e.wxSubscribeStatus !== 'expired'
    ) {
      form.remindEnabled = false
      wxSubscribeStatus.value = 'none'
    }
    form.backgroundUrl = e.backgroundUrl || ''
    form.todoDone = e.todoStatus === 'done'
    form.images = Array.isArray(e.images) ? [...e.images] : []
    form.location = e.location || ''
    form.locationLat = e.locationLat ?? null
    form.locationLng = e.locationLng ?? null
    form.tagsText = (e.tags || []).join('、')
    ownerType.value = e.ownerType === 'space' ? 'space' : 'personal'
    spaceId.value = ownerType.value === 'space' ? e.spaceId || null : null
    if (!isEntryOwner.value && ownerType.value === 'space' && spaceId.value) {
      try {
        const space = await getSpace(spaceId.value)
        const author = space.members?.find((member) => String(member.userId) === String(e.userId || ''))
        readonlyAuthorName.value = author?.nickname?.trim() || e.authorName?.trim() || '圈内成员'
        readonlyAuthorAvatar.value = author?.avatarUrl || e.authorAvatar || ''
        const index = editorSpaces.value.findIndex((item) => item.id === space.id)
        if (index >= 0) editorSpaces.value.splice(index, 1, space)
        else editorSpaces.value.push(space)
      } catch {
        // 作者资料加载失败不阻断记录正文，保留稳定的兜底名称。
      }
    }
    routeEntryKind.value = e.entryKind === 'commitment' || e.entryKind === 'capsule' ? e.entryKind : 'normal'
    if (e.type === 'diary') {
      if (e.entryKind === 'capsule' || e.capsuleUnlockAt) {
        capsuleEnabled.value = true
        capsuleInitiallyEnabled.value = true
        capsuleAlreadyUnlocked.value = !!e.capsuleUnlocked
        capsuleUnlockMode.value = e.capsuleUnlockMode === 'random' ? 'random' : 'scheduled'
        capsuleReminderEnabled.value = !!e.remindEnabled &&
          ['authorized', 'sending', 'sent'].includes(e.wxSubscribeStatus || '')
      }
      if (e.capsuleUnlockAt) {
        const unlockDate = new Date(e.capsuleUnlockAt)
        if (!Number.isNaN(unlockDate.getTime())) {
          capsuleDuration.value = 'custom'
          capsuleCustomDate.value = formatCapsulePickerDate(unlockDate)
        }
      }
      applyEventAt(e.eventAt || `${e.eventDate} 00:00:00`)
    } else {
      syncLunarPicker(form.eventDate)
    }
    uni.setNavigationBarTitle({ title: e.type === 'diary' ? '这一刻' : '编辑' })
    editorLoadState.value = 'ready'
  } catch (err: any) {
    if (!isLoggedIn()) {
      uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
      uni.navigateBack()
      return
    }
    editorLoadState.value = 'error'
    uni.showToast({ title: err?.message || '加载失败', icon: 'none' })
  }
}

function retryLoadEntry() {
  if (!id.value) return
  void loadExistingEntry(id.value)
}

const INSPIRATION_DRAFT_KEY = 'dk_inspiration_draft'

function takeInspirationDraft() {
  try {
    const value = uni.getStorageSync(INSPIRATION_DRAFT_KEY)
    uni.removeStorageSync(INSPIRATION_DRAFT_KEY)
    return value && typeof value === 'object' ? value as { body?: string; tags?: unknown[] } : null
  } catch {
    return null
  }
}

onLoad((q: any) => {
  if (!isLoggedIn()) {
    // 不在 onLoad 首屏提交前重建页面栈，交给 onReady 安全跳转。
    loginRequired.value = true
    return
  }

  returnToTimelineAfterDelete.value = q?.from === 'day-detail'
  returnToTimelineAfterSave.value = q?.from === 'timeline'
  applyEntryScopeFromQuery(q)
  void listSpaces().then((items) => { editorSpaces.value = items }).catch(() => undefined)

  // 好日子入口：同一模板顶部切换日期/待办。
  // 注意 type=diary 必须落到下面的随手记分支，否则首页的文字/照片记录会被写成好日子。
  if (q?.from === 'timeline' && q?.type !== 'diary') {
    showDaykeepTypes.value = true
    typeLocked.value = false
    const t = q.type === 'todo' ? 'todo' : 'anniversary'
    form.type = t
    if (t === 'todo') {
      form.repeatRule = 'none'
      form.showInTimeline = true
    } else {
      form.repeatRule = 'none'
      form.showInTimeline = true
    }
    uni.setNavigationBarTitle({ title: '新建' })
  } else if (q?.type === 'diary') {
    form.type = 'diary'
    // 新建页可能被运行时复用，必须显式恢复默认值，避免上一条记录的置顶状态泄漏。
    form.pinned = false
    form.images = []
    typeLocked.value = true
    showDaykeepTypes.value = false
    form.repeatRule = 'none'
    form.showInTimeline = false
    form.remindEnabled = false
    applyEventAt(null)
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q?.date || ''))) {
      applyEventAt(`${q.date} 12:00:00`)
    }
    let sourceTitle = String(q?.sourceTitle || '').trim()
    try {
      sourceTitle = decodeURIComponent(sourceTitle)
    } catch {
      // 非编码标题直接使用
    }
    if (sourceTitle) {
      form.body = `关于「${sourceTitle}」的心情：\n`
      if (q?.sourceDate) form.eventDate = String(q.sourceDate).slice(0, 10)
    }
    if (q?.body) {
      try { form.body = decodeURIComponent(String(q.body)).slice(0, 5000) }
      catch { form.body = String(q.body).slice(0, 5000) }
    }
    if (q?.from === 'inspiration') {
      const draft = takeInspirationDraft()
      if (draft?.body) form.body = String(draft.body).slice(0, 5000)
      const tags = Array.isArray(draft?.tags) ? draft.tags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean) : ['今日灵感']
      if (!tags.includes('今日灵感')) tags.unshift('今日灵感')
      writeEntryTags(tags.slice(0, 8))
    }
    // 小提示默认保持收起，避免每次新建时打断输入；需要时由用户主动展开。
    showEditorGuide.value = false
    diaryFocus.value = !sourceTitle && !q?.body
    uni.setNavigationBarTitle({ title: '这一刻' })
    // 入口只决定首步动作，后续仍复用同一编辑器并允许继续补充其他内容。
    if (!sourceTitle) {
      applyComposeMode(q?.entryKind === 'capsule' ? 'capsule' : String(q?.mode || 'text'))
    }
  } else if (q?.type === 'todo' || q?.type === 'anniversary') {
    form.type = q.type
    typeLocked.value = true
    showDaykeepTypes.value = false
    if (q.type === 'anniversary') {
      form.repeatRule = 'none'
      form.showInTimeline = true
      uni.setNavigationBarTitle({ title: '添加日期' })
    } else {
      form.repeatRule = 'none'
      form.showInTimeline = true
      uni.setNavigationBarTitle({ title: '新建待办' })
    }
  }

  if (q?.id) {
    id.value = String(q.id)
    clientRequestId.value = ''
    typeLocked.value = true
    showDaykeepTypes.value = false
    void loadExistingEntry(id.value)
  } else {
    // 新建会话使用稳定幂等键，避免用户连点造成重复记录。
    const incomingRequestId = String(q?.clientRequestId || '').trim()
    clientRequestId.value = /^mood_[A-Za-z0-9_-]{1,120}$/.test(incomingRequestId)
      ? incomingRequestId
      : ''
    ensureClientRequestId()
    if (!q?.from && !q?.type) {
      uni.setNavigationBarTitle({ title: '新建' })
    }
    editorLoadState.value = 'ready'
  }
})

// ---------- 保存 ----------

function leaveAfterSuccessfulSave() {
  if (returnToTimelineAfterSave.value) {
    uni.switchTab({ url: '/pages/timeline/index' })
  } else {
    uni.navigateBack()
  }
}

async function save() {
  if (persistBusy.value) return
  if (form.type === 'diary') {
    if (!form.body.trim() && form.images.length === 0) {
      uni.showToast({ title: '写点内容或加一张图吧', icon: 'none' })
      return
    }
  } else if (!form.title.trim()) {
    uni.showToast({ title: '请填写标题', icon: 'none' })
    return
  }
  if (!await confirmPublicPublish()) return
  if (!id.value && selectedPublicSpace.value && !await confirmProfileForPublicPublish()) return
  saving.value = true
  let ok = false
  try {
    const isDiary = form.type === 'diary'
    if (isDiary && capsuleEnabled.value && !capsuleInitiallyEnabled.value) {
      const confirmed = await new Promise<boolean>((resolve) => {
        uni.showModal({
          title: capsuleUnlockMode.value === 'random' ? '确认随机封存？' : `确认封存到${capsuleUnlockLabel.value}？`,
          content: capsuleUnlockMode.value === 'random'
            ? '系统将在未来 1—365 天内随机解锁，封存后无法提前查看日期、正文或修改。'
            : '保存后，在解锁日期前将无法查看或修改。请确认内容和日期无误后再封存。',
          cancelText: '再核对',
          confirmText: '确认封存',
          success: (result) => resolve(!!result.confirm),
          fail: () => resolve(false),
        })
      })
      if (!confirmed) return
    }
    if (!isDiary && quickReminderRequested.value && !wxRemindOn.value) {
      if (!validateReminderSchedule()) {
        uni.showToast({ title: reminderScheduleMessage.value || '请先调整提醒时间', icon: 'none' })
        return
      }
      const subscription = await requestWechatReminderSubscription()
      if (subscription !== 'accepted') {
        uni.showToast({
          title: subscription === 'rejected'
            ? '同意授权后才能开启微信提醒'
            : '当前环境暂不支持微信提醒授权',
          icon: 'none',
        })
        return
      }
      form.remindEnabled = true
      wxSubscribeAccepted.value = true
      wxSubscribeStatus.value = 'authorized'
    }
    const title = isDiary
      ? form.body.trim().split(/\n/)[0]?.slice(0, 32) || '随手记'
      : form.title.trim()
    const eventAt = isDiary ? diaryEventAt.value : undefined
    let images: string[] = []
    if (isDiary && form.images.length) {
      uni.showLoading({ title: '上传图片…', mask: true })
      try {
        images = await resolveImagesForSave(form.images)
      } finally {
        uni.hideLoading()
      }
    }
    const payload = {
      type: form.type,
      title,
      body: form.body,
      eventDate: form.eventDate,
      eventAt: eventAt || null,
      calendar: form.type === 'anniversary' ? form.calendar : 'solar',
      repeatRule: isDiary ? ('none' as RepeatRule) : form.repeatRule,
      recurring: !isDiary && form.repeatRule !== 'none',
      pinned: form.pinned,
      showInTimeline: !isDiary,
      remindEnabled: isDiary
        ? capsuleEnabled.value && capsuleReminderEnabled.value
        : wxRemindOn.value,
      remindAheadDays: Number(form.remindAheadDays) || 0,
      remindTime: form.remindTime,
      wxSubscribeAccepted: isDiary
        ? capsuleEnabled.value && capsuleReminderEnabled.value && wxSubscribeAccepted.value
        : wxRemindOn.value && wxSubscribeAccepted.value,
      todoStatus:
        form.type === 'todo' ? (form.todoDone ? 'done' : 'pending') : undefined,
      images: isDiary ? images : [],
      // 不在这里截断：输入框已有 maxlength=64，截断由服务端统一负责，
      // 否则客户端和服务端两套上限会把别的客户端存的长地点悄悄削短。
      location: isDiary || isCommitmentEntry.value ? form.location.trim() : '',
      // 坐标跟着地点走：类型不带地点时一并送 null，避免后端留下孤立图钉。
      locationLat: isDiary || isCommitmentEntry.value ? form.locationLat : null,
      locationLng: isDiary || isCommitmentEntry.value ? form.locationLng : null,
      tags: parseEntryTags(),
      clientRequestId: id.value ? undefined : ensureClientRequestId(),
      capsuleUnlockAt: isDiary ? getCapsuleUnlockAt() : null,
      capsuleUnlockMode: isDiary && capsuleEnabled.value ? capsuleUnlockMode.value : 'scheduled',
      expectedUpdatedAt: id.value ? loadedUpdatedAt.value || undefined : undefined,
      ...entryScopePayload(isDiary && capsuleEnabled.value),
    }
    const isCreate = !id.value
    let savedId = id.value
    if (id.value) {
      const updated = await updateEntry(id.value, payload)
      loadedUpdatedAt.value = updated.updatedAt || loadedUpdatedAt.value
    } else {
      const created = await createEntry(payload)
      savedId = String(created.id)
      // 立刻进入编辑态，后续再点只会 update
      id.value = savedId
    }
    // 时间胶囊本地通知
    if (
      isDiary &&
      capsuleEnabled.value &&
      capsuleReminderEnabled.value &&
      !capsuleAlreadyUnlocked.value &&
      capsuleUnlockMode.value === 'scheduled' &&
      savedId
    ) {
      scheduleCapsuleNotification(savedId, form.title.trim() || '时间胶囊', getCapsuleUnlockAt()!)
    }
    form.images = images.length ? images : form.images
    if (pendingBackground.value && savedId) {
      const uploaded = await uploadBackground(pendingBackground.value, { silentSuccess: true })
      if (!uploaded) {
        const detail = lastBackgroundError.value || '未知错误'
        uni.showModal({
          title: '背景图上传失败',
          content: `纪念日已创建成功，但背景图没有保存。\n原因：${detail}`,
          showCancel: false,
        })
        return
      }
    }
    invalidateEntryScope()
    ok = true
    // 个人好日子可转入已有/新建时光圈；共同关系统一由空间成员承载。
    if (isCreate && !isDiary && savedId && form.type === 'anniversary' && ownerType.value === 'personal') {
      uni.showModal({
        title: '要转为共同好日子吗？',
        content: '选择一个时光圈，空间成员都可以看见并一起记录。',
        confirmText: '选择空间',
        cancelText: '以后再说',
        success: (modalRes) => {
          if (modalRes.confirm) {
            uni.redirectTo({
              url: `/subpackages/day/detail?id=${savedId}&transfer=1`,
            })
          } else {
            leaveAfterSuccessfulSave()
          }
        },
      })
    } else {
      uni.showToast({ title: '已保存', icon: 'success' })
      leaveAfterSuccessfulSave()
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' })
  } finally {
    // 成功后保持 saving，避免返回前连点再提交；失败才解锁
    if (!ok) saving.value = false
  }
}

async function chooseBackground() {
  try {
    const res = await new Promise<UniApp.ChooseImageSuccessCallbackResult>((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
        success: resolve,
        fail: reject,
      })
    })
    const filePath = res.tempFilePaths[0]
    if (!filePath) return
    pendingBackground.value = filePath
    if (id.value) await uploadBackground(filePath)
  } catch (e: any) {
    if (e?.errMsg?.includes('cancel')) return
    uni.showToast({ title: e?.message || '选择图片失败', icon: 'none' })
  }
}

async function uploadBackground(filePath: string, opts: { silentSuccess?: boolean } = {}) {
  uploading.value = true
  lastBackgroundError.value = ''
  try {
    const updated = await uploadEntryBackground(id.value, filePath)
    form.backgroundUrl = updated.backgroundUrl || ''
    pendingBackground.value = ''
    if (!opts.silentSuccess) uni.showToast({ title: '背景已保存', icon: 'success' })
    return true
  } catch (e: any) {
    const msg = e?.message || e?.errMsg || '上传失败'
    lastBackgroundError.value = msg
    console.error('[uploadBackground]', msg, e)
    if (!opts.silentSuccess) uni.showToast({ title: msg, icon: 'none' })
    return false
  } finally {
    uploading.value = false
  }
}

function remove() {
  uni.showModal({
    title: form.type === 'diary' ? '删除这条随手记？' : '删除这条记录？',
    success: async (r) => {
      if (!r.confirm || !id.value) return
      try {
        await deleteEntry(id.value)
        invalidateEntryScope()
        uni.showToast({ title: '已删除', icon: 'success' })
        if (form.type === 'anniversary' || form.type === 'todo') {
          const spaceQuery = ownerType.value === 'space' && spaceId.value
            ? `?spaceId=${encodeURIComponent(spaceId.value)}`
            : ''
          uni.reLaunch({ url: `/subpackages/good-days/index${spaceQuery}` })
        } else if (returnToTimelineAfterDelete.value) {
          // 从「日子详情」进来的编辑页，不能只退一页，否则详情页会加载已删除记录。
          uni.switchTab({ url: '/pages/timeline/index' })
        } else {
          uni.navigateBack()
        }
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
      }
    },
  })
}

function reportCurrentPublicEntry() {
  if (!id.value || !spaceId.value) return
  const reasons = ['涉及隐私或个人信息', '不友善或令人不适', '广告或无关内容', '其他不适合公开展示的内容']
  uni.showActionSheet({
    title: '举报原因',
    itemList: reasons,
    success: async ({ tapIndex }) => {
      const reason = reasons[tapIndex]
      if (!reason) return
      try {
        await reportPublicEntry(spaceId.value!, id.value, reason)
        uni.showToast({ title: '已提交给管理员', icon: 'success' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '提交失败，请稍后再试', icon: 'none' })
      }
    },
  })
}

function moderatePublicEntry() {
  if (!id.value || !spaceId.value || !isPublicAdmin.value) return
  uni.showActionSheet({
    title: `管理 ${readonlyAuthorName.value} 的公开内容`,
    itemList: [form.pinned ? '取消置顶' : '置顶这条内容', '隐藏这条内容', '隐藏内容并暂停作者发布'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) {
        void pinPublicEntry(spaceId.value!, id.value, !form.pinned).then((result) => {
          form.pinned = result.pinned
          entriesStore.invalidate('space', spaceId.value)
          uni.showToast({ title: result.pinned ? '已置顶' : '已取消置顶', icon: 'success' })
        }).catch((error: any) => uni.showToast({ title: error?.message || '操作失败', icon: 'none' }))
        return
      }
      uni.showModal({
        title: tapIndex === 2 ? '隐藏并暂停发布？' : '隐藏这条内容？',
        content: tapIndex === 2 ? '内容会从体验圈移除，作者也将暂时不能继续公开发布。' : '内容会立即从体验圈移除。',
        confirmText: '确认处理',
        confirmColor: '#b64d46',
        success: async ({ confirm }) => {
          if (!confirm) return
          try {
            await hidePublicEntry(spaceId.value!, id.value)
            if (tapIndex === 2 && loadedEntryUserId.value) {
              await setPublicPostingBlocked(spaceId.value!, loadedEntryUserId.value, true, '公开内容需管理员复核')
            }
            entriesStore.invalidate('space', spaceId.value)
            uni.showToast({ title: '已处理', icon: 'success' })
            setTimeout(() => uni.navigateBack(), 300)
          } catch (error: any) {
            uni.showToast({ title: error?.message || '处理失败，请稍后再试', icon: 'none' })
          }
        },
      })
    },
  })
}
</script>

<style lang="scss" scoped>
.diary-settings {
  margin-top: 22rpx;
  padding: 0;
}
.public-scope-notice { display:flex;align-items:center;gap:10rpx;margin:2rpx 0 16rpx;padding:13rpx 16rpx;border-radius:16rpx;color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);font-size:21rpx;line-height:1.45; }
.public-scope-mark { flex-shrink:0;padding:3rpx 9rpx;border:1rpx solid currentColor;border-radius:999rpx;font-size:17rpx;font-weight:700; }
.public-scope-notice.personal { color:var(--dk-muted);background:var(--dk-bg-soft,var(--dk-bg)); }
.public-entry-action-bar{position:fixed;z-index:390;right:0;bottom:0;left:0;padding:12rpx 28rpx calc(12rpx + env(safe-area-inset-bottom));border-top:1rpx solid var(--dk-line);background:rgba(255,255,255,.92);backdrop-filter:blur(18rpx)}.public-entry-action-bar button{width:auto;height:58rpx;margin:0 auto;padding:0 22rpx;border:0;color:var(--dk-muted);background:transparent;font-size:21rpx;line-height:58rpx}.public-entry-action-bar button::after{border:0}
.diary-quick-meta { min-height: 84rpx; margin-top: 18rpx; padding: 12rpx 4rpx; color: var(--dk-muted); }
.quick-meta-flow { display: flex; width: 100%; align-items: center; gap: 12rpx; flex-wrap: wrap; }
.quick-meta-field { display: flex; min-width: 0; align-items: center; gap: 8rpx; }
.location-field { max-width: 100%; padding: 10rpx 6rpx 10rpx 0; }
.quick-meta-icon { flex-shrink: 0; color: var(--dk-muted); font-size: 34rpx; line-height: 1; }
.location-icon { position: relative; width: 22rpx; height: 22rpx; margin: 0 5rpx; border: 3rpx solid var(--dk-feature-brand, #2f6f6a); border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-sizing: border-box; }
.location-icon::after { position: absolute; top: 5rpx; left: 5rpx; width: 6rpx; height: 6rpx; border-radius: 50%; background: var(--dk-feature-brand, #2f6f6a); content: ''; }
.quick-meta-label { overflow: hidden; color: var(--dk-muted); font-size: 24rpx; text-overflow: ellipsis; white-space: nowrap; }
.quick-meta-label.selected { color: var(--dk-feature-brand, #2f6f6a); }
.quick-meta-clear { margin-left: -5rpx; padding: 8rpx; color: var(--dk-muted); font-size: 27rpx; line-height: 1; }
.diary-readonly-meta { min-height: 0; padding-right: 4rpx; padding-left: 4rpx; }
.diary-readonly-meta.after-media { margin-top: 18rpx; padding-top: 0; }
.diary-readonly-meta.after-copy { margin-top: 28rpx; padding-top: 22rpx; border-top: 1rpx solid var(--dk-line); }
.readonly-meta-flow { gap: 12rpx 16rpx; }
.readonly-location { display: flex; max-width: 100%; min-width: 0; align-items: center; gap: 6rpx; padding: 7rpx 4rpx 7rpx 0; }
.readonly-location-label { overflow: hidden; color: var(--dk-muted); font-size: 23rpx; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.readonly-tag-text { padding: 7rpx 0; color: var(--dk-feature-brand, #2f6f6a); font-size: 23rpx; }
/* 约定的地点行：外形对齐同组 .input，行为是打开选点弹层。 */
.location-picker-row { display: flex; align-items: center; gap: 10rpx; min-height: 64rpx; }
.location-picker-text { flex: 1; overflow: hidden; color: var(--dk-ink); font-size: 28rpx; text-overflow: ellipsis; white-space: nowrap; }
.location-picker-text.placeholder { color: var(--dk-muted); }
.location-picker-arrow { flex-shrink: 0; color: var(--dk-muted); font-size: 30rpx; }
.location-picker-clear { flex-shrink: 0; padding: 8rpx 0 8rpx 16rpx; color: var(--dk-muted); font-size: 28rpx; line-height: 1; }
.tag-chip { flex-shrink: 0; padding: 7rpx 12rpx; border-radius: 999rpx; color: var(--dk-feature-brand, #2f6f6a); background: var(--dk-feature-brand-soft, #e4f0ee); font-size: 22rpx; }
.add-tag-button { flex-shrink: 0; padding: 10rpx 4rpx; color: var(--dk-feature-brand, #2f6f6a); font-size: 24rpx; }
.meta-mask { position: fixed; z-index: 420; inset: 0; display: flex; align-items: flex-end; background: rgba(19, 29, 28, .36); }
.meta-sheet { width: 100%; max-height: 78vh; overflow-y: auto; padding: 30rpx 32rpx calc(32rpx + env(safe-area-inset-bottom)); border-radius: 32rpx 32rpx 0 0; background: var(--dk-surface, #fff); box-shadow: 0 -14rpx 48rpx rgba(17, 30, 28, .14); box-sizing: border-box; }
.meta-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28rpx; }
.meta-sheet-title { display: block; color: var(--dk-ink); font-size: 34rpx; font-weight: 700; }
.meta-sheet-subtitle { display: block; margin-top: 6rpx; color: var(--dk-muted); font-size: 23rpx; }
.meta-sheet-close { padding: 8rpx 0 8rpx 24rpx; color: var(--dk-brand); font-size: 25rpx; }
.tag-compose { display: flex; align-items: center; gap: 12rpx; padding: 10rpx 12rpx 10rpx 22rpx; border-radius: 20rpx; background: var(--dk-bg, #f2f4f3); }
.tag-compose-prefix { color: var(--dk-ink); font-size: 31rpx; font-weight: 650; }
.tag-compose-input { flex: 1; min-width: 0; height: 64rpx; color: var(--dk-ink); font-size: 27rpx; }
.tag-add-button { width: auto; min-width: 106rpx; height: 58rpx; margin: 0; padding: 0 20rpx; border: 0; border-radius: 29rpx; color: #fff; background: var(--dk-brand); font-size: 24rpx; line-height: 58rpx; }
.tag-add-button::after { border: 0; }
.tag-add-button[disabled] { opacity: .4; }
.meta-section { margin-top: 28rpx; }
.meta-section-title { display: block; margin-bottom: 14rpx; color: var(--dk-muted); font-size: 23rpx; }
.meta-chip-list { display: flex; gap: 12rpx; flex-wrap: wrap; }
.meta-chip-scroll { display: flex; gap: 12rpx; overflow-x: auto; padding-bottom: 4rpx; white-space: nowrap; }
.meta-chip-row { display: flex; gap: 12rpx; }
.meta-chip { display: inline-flex; flex-shrink: 0; align-items: center; gap: 8rpx; padding: 15rpx 20rpx; border-radius: 16rpx; color: var(--dk-ink); background: var(--dk-bg, #f2f4f3); font-size: 25rpx; }
.meta-chip.selected { color: var(--dk-brand); background: var(--dk-brand-soft); }
.meta-chip-remove { font-size: 29rpx; line-height: 1; opacity: .65; }
.diary-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 88rpx;
  padding: 18rpx 4rpx;
}
.diary-setting-last { border-bottom: 0; }
.diary-setting-copy {
  flex: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4rpx;
}
.diary-setting-title {
  color: var(--dk-ink);
  font-size: 26rpx;
  font-weight: 600;
}
.diary-setting-desc {
  color: var(--dk-muted);
  font-size: 21rpx;
  line-height: 1.5;
}
.diary-settings switch { transform: scale(.82); transform-origin: right center; }
.capsule-letter-heading { margin: 10rpx 0 0; }
.capsule-letter-recipient { display: block; color: var(--dk-ink); font-size: 34rpx; font-weight: 720; line-height: 1.35; }
.capsule-letter-hint { display: block; margin-top: 8rpx; color: var(--dk-muted); font-size: 22rpx; line-height: 1.45; }
.memo.capsule-memo {
  min-height: 300rpx;
  margin-top: 18rpx;
  padding: 20rpx 0 28rpx;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  line-height: 1.8;
}
.capsule-card {
  padding: 0 4rpx;
}
.capsule-card.standalone {
  margin-top: 10rpx;
  padding: 22rpx 4rpx 0;
  border: 0;
  border-top: 1rpx solid var(--dk-line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.capsule-card-head {
  display: flex;
  min-height: 88rpx;
  align-items: center;
  padding: 18rpx 0;
  gap: 16rpx;
}
.capsule-card.standalone .capsule-card-head { min-height: 0; padding: 0 0 14rpx; }
.capsule-title-row { display: flex; align-items: center; gap: 10rpx; }
.capsule-status {
  padding: 3rpx 9rpx;
  border-radius: 999rpx;
  color: var(--dk-brand);
  background: transparent;
  font-size: 18rpx;
  font-weight: 550;
  line-height: 1.3;
}
.capsule-body {
  padding: 18rpx 0 4rpx;
  border-top: 1rpx solid var(--dk-line);
}
.capsule-card.standalone .capsule-body { padding-top: 0; border-top: 0; }
.capsule-mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rpx;
  padding: 4rpx;
  border-radius: 18rpx;
  background: var(--dk-bg-soft);
}
.capsule-mode {
  display: flex;
  min-width: 0;
  padding: 17rpx 18rpx;
  border: 1rpx solid transparent;
  border-radius: 18rpx;
  background: var(--dk-surface);
  flex-direction: column;
  gap: 3rpx;
  box-sizing: border-box;
}
.capsule-mode.selected {
  border-color: var(--dk-brand);
  background: var(--dk-brand-soft);
  box-shadow: none;
}
.capsule-card.standalone .capsule-mode.selected {
  border-color: transparent;
  background: var(--dk-surface, #fff);
  box-shadow: 0 3rpx 10rpx rgba(29,52,48,.06);
}
.capsule-card.standalone .capsule-mode { align-items: center; justify-content: center; min-height: 62rpx; padding: 0 16rpx; background: transparent; }
.capsule-mode-title { color: var(--dk-ink); font-size: 23rpx; font-weight: 600; }
.capsule-mode.selected .capsule-mode-title { color: var(--dk-brand); }
.capsule-card.standalone .capsule-mode.selected .capsule-mode-title { color: var(--dk-feature-brand, #2f6f6a); }
.capsule-mode-desc { color: var(--dk-muted); font-size: 18rpx; line-height: 1.4; }
.capsule-unlock-summary {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 18rpx;
  padding: 18rpx 4rpx 12rpx;
}
.capsule-unlock-icon {
  position: relative;
  width: 40rpx;
  height: 40rpx;
  flex: 0 0 40rpx;
  border: 3rpx solid var(--dk-brand);
  border-radius: 50%;
  box-sizing: border-box;
}
.capsule-random-icon {
  display: flex;
  width: 40rpx;
  height: 40rpx;
  flex: 0 0 40rpx;
  align-items: center;
  justify-content: center;
  border: 3rpx solid var(--dk-feature-brand, #2f6f6a);
  border-radius: 50%;
  color: var(--dk-feature-brand, #2f6f6a);
  font-size: 22rpx;
  font-weight: 700;
  box-sizing: border-box;
}
.capsule-unlock-icon::before,
.capsule-unlock-hand {
  position: absolute;
  left: 17rpx;
  width: 3rpx;
  border-radius: 3rpx;
  background: var(--dk-brand);
  content: '';
  transform-origin: 50% 100%;
}
.capsule-unlock-icon::before { top: 8rpx; height: 10rpx; }
.capsule-unlock-hand { top: 15rpx; height: 9rpx; transform: rotate(120deg); }
.capsule-card.standalone .capsule-unlock-icon { border-color: var(--dk-feature-brand, #2f6f6a); }
.capsule-card.standalone .capsule-unlock-icon::before,
.capsule-card.standalone .capsule-unlock-hand { background: var(--dk-feature-brand, #2f6f6a); }
.capsule-unlock-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2rpx; }
.capsule-unlock-kicker { color: var(--dk-muted); font-size: 18rpx; }
.capsule-unlock-date { color: var(--dk-ink); font-size: 27rpx; font-weight: 680; font-variant-numeric: tabular-nums; }
.capsule-unlock-note {
  flex-shrink: 0;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  color: var(--dk-brand);
  background: transparent;
  font-size: 18rpx;
}
.capsule-card.standalone .capsule-unlock-note { color: var(--dk-feature-brand, #2f6f6a); }
.capsule-options {
  display: flex;
  gap: 9rpx;
  flex-wrap: wrap;
}
.capsule-durations { margin-top: 14rpx; }
.capsule-opt {
  padding: 9rpx 16rpx;
  border: 1rpx solid transparent;
  border-radius: 999rpx;
  background: var(--dk-surface);
  color: var(--dk-muted);
  font-size: 19rpx;
  &.selected {
    border-color: var(--dk-brand);
    color: var(--dk-brand);
    background: var(--dk-surface);
    font-weight: 600;
  }
}
.capsule-card.standalone .capsule-opt.selected {
  border-color: var(--dk-feature-brand, #2f6f6a);
  color: var(--dk-feature-brand, #2f6f6a);
}
.capsule-custom-date {
  display: flex;
  align-items: center;
  margin-top: 14rpx;
  padding: 18rpx;
  border: 1rpx solid var(--dk-line);
  border-radius: 16rpx;
  background: var(--dk-surface);
}
.capsule-custom-label {
  flex: 1;
  color: var(--dk-muted);
  font-size: 21rpx;
}
.capsule-custom-value {
  color: var(--dk-ink);
  font-size: 23rpx;
  font-variant-numeric: tabular-nums;
}
.capsule-custom-arrow {
  margin-left: 12rpx;
  color: var(--dk-brand);
  font-size: 27rpx;
}
.capsule-card.standalone .capsule-custom-arrow { color: var(--dk-feature-brand, #2f6f6a); }
.capsule-scope {
  display: block;
  margin: 0 2rpx;
  padding: 15rpx 0 17rpx;
  border-bottom: 1rpx solid var(--dk-line);
  color: var(--dk-muted);
  font-size: 19rpx;
  line-height: 1.5;
}
.capsule-unlock-summary.random { margin-bottom: 0; padding-bottom: 18rpx; }
.capsule-reminder-setting {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-top: 16rpx;
  padding: 18rpx 0 10rpx;
  border-top: 0;
}
.capsule-card.standalone .capsule-reminder-setting { padding-bottom: 18rpx; border-bottom: 1rpx solid var(--dk-line); }
.pin-setting {
  margin-top: 4rpx;
  padding-right: 4rpx;
  padding-left: 4rpx;
  border-top: 1rpx solid var(--dk-line);
}

.page {
  min-height: 100vh;
  background-color: var(--dk-bg);
  color: var(--dk-ink);
  overflow: visible;
}
.editor-load-state {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 48rpx;
  color: var(--dk-muted);
}
.editor-load-spinner {
  width: 34rpx;
  height: 34rpx;
  margin-bottom: 20rpx;
  border: 4rpx solid rgba(47, 124, 116, .14);
  border-top-color: var(--dk-brand);
  border-radius: 50%;
  animation: editor-loading-spin .8s linear infinite;
}
.editor-load-title {
  margin-bottom: 10rpx;
  color: var(--dk-ink);
  font-size: 30rpx;
  font-weight: 700;
}
.editor-load-text {
  font-size: 24rpx;
}
.editor-load-retry {
  min-width: 176rpx;
  height: 68rpx;
  margin-top: 28rpx;
  padding: 0 30rpx;
  border: 0;
  border-radius: 22rpx;
  color: #fff;
  background: var(--dk-brand);
  font-size: 25rpx;
  line-height: 68rpx;
  &::after { border: 0; }
}
@keyframes editor-loading-spin {
  to { transform: rotate(360deg); }
}
.scroll {
  width: 100%;
}
.inner {
  padding: 24rpx 32rpx calc(80rpx + env(safe-area-inset-bottom));
  min-height: 100%;
}
.type-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 28rpx;
}
.type-bar {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 4rpx;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 999rpx;
}
.type-i {
  min-width: 104rpx;
  text-align: center;
  padding: 10rpx 26rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  letter-spacing: 0.04em;
  color: #9aa19d;
  border-radius: 999rpx;
  line-height: 1.2;
  &.on {
    color: var(--dk-ink, #1c2423);
    background: var(--dk-surface, #fff);
    font-weight: 500;
    box-shadow: 0 1rpx 6rpx rgba(0, 0, 0, 0.06);
  }
}
.field {
  margin-bottom: 28rpx;
  flex-shrink: 0;

  &.compact {
    margin-bottom: 24rpx;
  }

  &.no-bottom-gap {
    margin-bottom: 0;
  }
}
.form-card {
  margin-bottom: 22rpx;
  padding: 26rpx 24rpx;
  border: 1rpx solid var(--dk-line);
  border-radius: 20rpx;
  background: var(--dk-surface);
  box-shadow: 0 6rpx 20rpx rgba(30, 48, 45, 0.025);
}
.form-card-title {
  display: block;
  margin-bottom: 22rpx;
  color: var(--dk-ink);
  font-size: var(--dk-fs-label, 26rpx);
  font-weight: 600;
}
.display-card {
  padding-top: 8rpx;
  padding-bottom: 4rpx;
  overflow: hidden;
}
.display-card .form-card-title {
  margin: 18rpx 0 0;
}
.label {
  display: block;
  margin-bottom: 12rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted);
  line-height: 1.4;
  &.inline {
    margin-bottom: 0;
  }
}
.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}
.cal-switch {
  display: flex;
  gap: 4rpx;
  padding: 4rpx;
  background: var(--dk-brand-soft);
  border-radius: 8rpx;
}
.cal-i {
  padding: 6rpx 18rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted);
  border-radius: 6rpx;
  &.on {
    color: #fff;
    background: var(--dk-brand);
  }
}
.hint {
  display: block;
  margin-top: 10rpx;
  font-size: var(--dk-fs-caption, 22rpx);
  color: var(--dk-muted);
  line-height: 1.4;
}
.input,
.picker {
  display: block;
  width: 100%;
  height: 80rpx;
  min-height: 80rpx;
  line-height: 80rpx;
  padding: 0 24rpx;
  background: var(--dk-surface);
  border: 1rpx solid var(--dk-line);
  border-radius: 14rpx;
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink);
  box-sizing: border-box;
  flex-shrink: 0;
}
.textarea {
  display: block;
  width: 100%;
  min-height: 132rpx;
  padding: 20rpx 24rpx;
  line-height: 1.5;
  background: var(--dk-surface);
  border: 1rpx solid var(--dk-line);
  border-radius: 14rpx;
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink);
  box-sizing: border-box;
  &.tall {
    min-height: 280rpx;
  }
}
.bg-preview {
  position: relative;
  height: 280rpx;
  overflow: hidden;
  border-radius: 18rpx;
  background: var(--dk-surface);
}
.bg-img {
  width: 100%;
  height: 100%;
}
.bg-mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28rpx;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.52));
}
.bg-btn,
.bg-empty {
  height: 72rpx;
  line-height: 72rpx;
  font-size: 26rpx;
  color: #fff;
  background: var(--dk-brand, #2f6f6a);
  border: none;
  border-radius: 12rpx;
  &::after {
    border: none;
  }
}
.bg-empty {
  width: 100%;
  color: var(--dk-brand);
  background: var(--dk-brand-soft);
}
.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--dk-muted);
}
.wx-remind {
  margin: 22rpx 0 20rpx;
  padding: 26rpx 24rpx;
  border: 1rpx solid var(--dk-line);
  border-radius: 20rpx;
  background: var(--dk-surface);
  box-shadow: 0 6rpx 20rpx rgba(30, 48, 45, 0.025);
}
.wx-remind-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.wx-remind-heading-note { color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); }
.wx-remind-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}
.wx-remind-copy {
  flex: 1;
  min-width: 0;
}
.wx-remind-title {
  display: block;
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink);
}
.wx-remind-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--dk-muted);
}
.wx-remind-btn {
  flex-shrink: 0;
  margin: 0;
  padding: 0 28rpx;
  height: 60rpx;
  line-height: 60rpx;
  border: 1rpx solid var(--dk-brand);
  border-radius: 999rpx;
  font-size: 24rpx;
  color: var(--dk-brand);
  background: transparent;
  &::after {
    border: none;
  }
  &.on {
    color: #fff;
    background: var(--dk-brand);
    border-color: var(--dk-brand);
  }
}
.remind-config-grid { display: flex; gap: 16rpx; margin-top: 18rpx; }
.remind-config-cell { flex: 1; min-width: 0; padding: 14rpx 16rpx; border-radius: 12rpx; background: var(--dk-bg-soft); }
.remind-cell-label { display: block; color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); }
.remind-cell-input, .remind-cell-picker { height: 44rpx; margin-top: 6rpx; color: var(--dk-ink); font-size: var(--dk-fs-body, 28rpx); line-height: 44rpx; }
.remind-cell-input { width: 100%; padding: 0; background: transparent; border: 0; }
.remind-cell-picker.placeholder { color: var(--dk-muted); }
.remind-config-hint { display: block; margin-top: 14rpx; color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); line-height: 1.55; }
.remind-config-hint.error { color: #a45434; }
.remind-divider { height: 1rpx; margin: 20rpx 0; background: var(--dk-line); }
.seg {
  display: flex;
  flex-wrap: nowrap;
  gap: 12rpx;
  &.wrap {
    flex-wrap: wrap;
  }
}
.seg-i {
  padding: 14rpx 28rpx;
  font-size: var(--dk-fs-label, 26rpx);
  color: var(--dk-muted);
  background: var(--dk-brand-soft);
  border-radius: 8rpx;
  &.on {
    color: #fff;
    background: var(--dk-brand);
  }
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--dk-line);
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink);
  &.soft {
    margin-top: 24rpx;
    border-bottom: none;
    border-top: 1rpx solid var(--dk-line);
  }
}

/* 日记备忘录 */
.inner.diary {
  padding-top: 16rpx;
  padding-bottom: calc(176rpx + env(safe-area-inset-bottom));
}
.editor-heading{display:flex;align-items:center;justify-content:space-between;gap:24rpx;min-height:62rpx;padding:4rpx 0 18rpx}
.editor-scope{display:flex;max-width:48%;align-items:center;gap:9rpx;color:var(--dk-feature-brand, #2f6f6a);font-size:24rpx;font-weight:650}.editor-scope>text:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scope-chevron{width:12rpx;height:12rpx;flex-shrink:0;margin-top:-5rpx;border-right:2rpx solid var(--dk-feature-brand, #2f6f6a);border-bottom:2rpx solid var(--dk-feature-brand, #2f6f6a);transform:rotate(45deg);box-sizing:border-box}
.diary-time-t {
  max-width: 50%;
  overflow: hidden;
  font-size: var(--dk-fs-caption, 22rpx);
  color: var(--dk-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.editor-guide {
  margin: 2rpx 0 26rpx;
  padding: 26rpx 24rpx 12rpx;
  border: 1rpx solid var(--dk-line, #e2e6e4);
  border-radius: 24rpx;
  background: var(--dk-surface, #fff);
  box-shadow: 0 10rpx 30rpx rgba(34, 61, 58, 0.07);
}
.editor-guide-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}
.editor-guide-heading {
  flex: 1;
  min-width: 0;
}
.editor-guide-kicker {
  display: block;
  margin-bottom: 8rpx;
  font-size: 20rpx;
  line-height: 1.3;
  font-weight: 600;
  color: var(--dk-brand, #2f6f6a);
}
.editor-guide-title,
.editor-guide-subtitle {
  display: block;
}
.editor-guide-title {
  font-size: 30rpx;
  line-height: 1.35;
  font-weight: 700;
  color: var(--dk-ink);
}
.editor-guide-subtitle {
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--dk-muted);
}
.editor-guide-close {
  flex: none;
  width: 40rpx;
  height: 40rpx;
  line-height: 36rpx;
  text-align: center;
  font-size: 34rpx;
  font-weight: 300;
  color: var(--dk-muted);
}
.editor-guide-actions {
  margin-top: 22rpx;
  border-top: 1rpx solid var(--dk-line, #e2e6e4);
}
.editor-guide-action {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-height: 104rpx;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
}
.editor-guide-action:last-child {
  border-bottom: none;
}
.editor-guide-action-index {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 46rpx;
  height: 46rpx;
  border-radius: 50%;
  font-size: 21rpx;
  line-height: 46rpx;
  text-align: center;
  font-weight: 700;
  color: var(--dk-brand, #2f6f6a);
  background: var(--dk-brand-soft, #e4f0ee);
}
.editor-guide-action-copy {
  flex: 1;
  min-width: 0;
}
.editor-guide-action-title,
.editor-guide-action-desc {
  display: block;
}
.editor-guide-action-title {
  font-size: 25rpx;
  line-height: 1.35;
  font-weight: 650;
  color: var(--dk-ink);
}
.editor-guide-action-desc {
  margin-top: 6rpx;
  font-size: 21rpx;
  line-height: 1.4;
  color: var(--dk-muted);
}
.editor-guide-action-arrow {
  flex: none;
  padding-left: 8rpx;
  font-size: 34rpx;
  line-height: 1;
  font-weight: 300;
  color: #9aa5a1;
}
.editor-guide-hint {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 0 0 18rpx;
  padding: 12rpx 16rpx;
  border-radius: 14rpx;
  background: var(--dk-brand-soft, #e4f0ee);
}
.editor-guide-hint-mark {
  flex: none;
  font-size: 17rpx;
  font-weight: 700;
  color: var(--dk-brand, #2f6f6a);
}
.editor-guide-hint-text {
  flex: 1;
  min-width: 0;
  font-size: 21rpx;
  line-height: 1.4;
  color: var(--dk-muted);
}
.editor-guide-hint-action {
  flex: none;
  font-size: 20rpx;
  color: var(--dk-brand, #2f6f6a);
}
.memo {
  width: 100%;
  min-height: 220rpx;
  padding: 8rpx 0;
  font-size: var(--dk-fs-title, 30rpx);
  line-height: 1.7;
  color: var(--dk-ink);
  background: transparent;
  box-sizing: border-box;
}
.readonly-diary {
  padding-top: 24rpx;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
}
.readonly-entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 4rpx 0 34rpx;
  border-bottom: 1rpx solid var(--dk-line);
}
.readonly-author {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14rpx;
}
.readonly-author-avatar {
  display: flex;
  width: 64rpx;
  height: 64rpx;
  flex: 0 0 64rpx;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
}
.readonly-author-avatar.fallback {
  color: var(--dk-feature-brand, #2f6f6a);
  background: var(--dk-feature-brand-soft, #e4f0ee);
  font-size: 25rpx;
  font-weight: 700;
}
.readonly-author-copy {
  min-width: 0;
}
.readonly-author-name,
.readonly-entry-time {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.readonly-author-name {
  color: var(--dk-ink);
  font-size: var(--dk-fs-label, 28rpx);
  font-weight: 650;
}
.readonly-entry-time {
  margin-top: 5rpx;
  color: var(--dk-muted);
  font-size: var(--dk-fs-caption, 23rpx);
}
.readonly-badge {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  color: var(--dk-muted);
  background: var(--dk-bg-soft);
  font-size: var(--dk-fs-caption, 23rpx);
}
.readonly-badge.approved {
  color: var(--dk-brand);
  background: var(--dk-brand-soft);
}
.edit-access-button {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6rpx;
  margin: 0;
  padding: 12rpx 0 12rpx 16rpx;
  border-radius: 0;
  color: var(--dk-brand);
  background: transparent;
  font-size: var(--dk-fs-caption, 23rpx);
  font-weight: 650;
  line-height: 1.3;
}
.edit-access-button::after {
  border: 0;
}
.edit-access-button.pending {
  color: var(--dk-brand);
  background: transparent;
}
.edit-access-arrow {
  position: relative;
  top: -1rpx;
  font-size: 29rpx;
  font-weight: 400;
  line-height: 1;
  color: var(--dk-brand);
}
.edit-request-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin: 20rpx 0 6rpx;
  padding: 18rpx 20rpx;
  border: 1rpx solid rgba(47, 111, 106, .16);
  border-radius: 18rpx;
  background: var(--dk-brand-soft);
}
.edit-request-person {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12rpx;
  color: var(--dk-ink);
  font-size: var(--dk-fs-caption, 23rpx);
  line-height: 1.4;
}
.edit-request-avatar {
  display: flex;
  width: 44rpx;
  height: 44rpx;
  flex: 0 0 44rpx;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  color: var(--dk-feature-brand, #2f6f6a);
  background: var(--dk-feature-brand-soft, #e4f0ee);
  font-size: 20rpx;
}
.edit-request-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 20rpx;
  color: var(--dk-muted);
  font-size: var(--dk-fs-caption, 23rpx);
}
.edit-request-actions .approve {
  color: var(--dk-brand);
  font-weight: 700;
}
.readonly-entry-body {
  display: block;
  margin-top: 38rpx;
  color: var(--dk-ink);
  font-size: var(--dk-fs-body, 30rpx);
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
.readonly-media-gallery {
  width: 100%;
  height: 520rpx;
}
.readonly-media-gallery.single {
  width: 100%;
  margin-right: 0;
}
.readonly-media-slide {
  box-sizing: border-box;
  padding-right: 12rpx;
}
.readonly-media-gallery.single .readonly-media-slide {
  padding-right: 0;
}
.readonly-media-frame {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 24rpx;
  overflow: hidden;
  background: #e9edeb;
}
.readonly-media-image {
  width: 100%;
  height: 100%;
}
.readonly-media-count {
  position: absolute;
  top: 18rpx;
  right: 18rpx;
  padding: 7rpx 13rpx;
  border-radius: 999rpx;
  color: #fff;
  background: rgba(18, 28, 26, .5);
  font-size: 20rpx;
  line-height: 1;
}
.readonly-media-section {
  position: relative;
  margin-top: 34rpx;
}
.readonly-gallery-toggle {
  display: flex;
  align-items: center;
  gap: 9rpx;
  color: #fff;
  font-size: 21rpx;
  line-height: 1;
}
.readonly-gallery-toggle.overlay {
  position: absolute;
  z-index: 4;
  bottom: 18rpx;
  left: 18rpx;
  padding: 12rpx 16rpx;
  border: 1rpx solid rgba(255, 255, 255, .2);
  border-radius: 999rpx;
  background: rgba(18, 28, 26, .58);
  backdrop-filter: blur(8rpx);
}
.readonly-gallery-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
  color: var(--dk-muted);
  font-size: 22rpx;
}
.readonly-gallery-collapse {
  padding: 8rpx 0 8rpx 20rpx;
  color: var(--dk-brand);
  font-weight: 650;
}
.readonly-gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8rpx;
}
.readonly-gallery-grid-item {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10rpx;
  overflow: hidden;
  background: var(--dk-bg-soft);
}
.readonly-gallery-grid-image {
  width: 100%;
  height: 100%;
}
.readonly-gallery-more {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(14, 22, 21, .48);
  font-size: 38rpx;
  font-weight: 650;
}
.media-grid { display: grid; width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14rpx; margin: 24rpx 0 8rpx; }
.media-thumb,
.media-action { position: relative; display: flex; width: 100%; height: 190rpx; min-width: 0; border-radius: 22rpx; box-sizing: border-box; overflow: hidden; }
.media-thumb { background: var(--dk-brand-soft); }
.media-thumb-image { width: 100%; height: 100%; }
.media-thumb-remove { position: absolute; top: 8rpx; right: 8rpx; display: flex; width: 36rpx; height: 36rpx; align-items: center; justify-content: center; border-radius: 50%; color: #fff; background: rgba(20, 29, 27, .58); font-size: 27rpx; line-height: 1; }
.media-action { flex-direction: column; align-items: center; justify-content: center; gap: 10rpx; color: var(--dk-muted); background: rgba(255,255,255,.5); }
.media-action.photo { border: 2rpx dashed #cbd2ce; }
.media-action-icon { display: flex; height: 42rpx; align-items: center; justify-content: center; font-size: 38rpx; font-weight: 300; line-height: 1; }
.media-action-title { font-size: 23rpx; font-weight: 650; line-height: 1.2; }
.sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  background: var(--dk-bg, #f2f4f3);
  border-radius: 24rpx 24rpx 0 0;
  padding: 28rpx 40rpx calc(28rpx + env(safe-area-inset-bottom));
}
.sheet-title {
  display: block;
  text-align: center;
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 500;
  margin-bottom: 16rpx;
  color: var(--dk-ink);
}
.sheet-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--dk-line);
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink);
}
.sheet-val {
  color: var(--dk-muted);
  font-variant-numeric: tabular-nums;
}
.sheet-ok {
  margin-top: 28rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: var(--dk-fs-body, 28rpx);
  color: #fff;
  background: var(--dk-brand);
  border-radius: 12rpx;
  border: none;
  &::after {
    border: none;
  }
}
.diary-save-bar {
  position: fixed;
  z-index: 80;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  padding: 18rpx 32rpx calc(18rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--dk-line);
  background: var(--dk-bg);
  box-shadow: 0 -10rpx 30rpx rgba(22, 42, 39, .04);
  box-sizing: border-box;
}
.diary-save-bar.capsule-save-bar {
  background: var(--dk-bg);
}
.diary-delete-button {
  width: 112rpx;
  height: 70rpx;
  margin: 0;
  padding: 0;
  border: 1rpx solid rgba(190, 67, 60, .24);
  border-radius: 22rpx;
  color: #b84b45;
  background: transparent;
  font-size: 25rpx;
  line-height: 68rpx;
  &::after { border: 0; }
  &[disabled] { opacity: .45; }
}
.diary-save-button {
  width: 152rpx;
  height: 70rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 22rpx;
  color: #fff;
  background: var(--dk-brand);
  font-size: 28rpx;
  font-weight: 700;
  line-height: 70rpx;
  &::after { border: 0; }
  &[disabled] { opacity: .55; }
}
.diary-save-button.capsule {
  background: var(--dk-feature-brand, #2f6f6a);
  box-shadow: 0 10rpx 24rpx rgba(47,111,106,.18);
}
.save {
  margin-top: 48rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: var(--dk-fs-body, 28rpx);
  color: #fff;
  background: var(--dk-brand);
  border-radius: 14rpx;
  border: none;
  &::after {
    border: none;
  }
}
.del {
  margin-top: 20rpx;
  margin-bottom: 40rpx;
}
.readonly { opacity: .75; }
</style>
