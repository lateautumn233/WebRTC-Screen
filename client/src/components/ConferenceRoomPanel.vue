<template>
  <div class="surface rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-100">会议房间</h3>
      <!-- 连接状态 -->
      <span
        :class="[
          'text-xs flex items-center gap-1.5',
          connected ? 'text-emerald-300' : 'text-rose-300'
        ]"
      >
        <span :class="['w-1.5 h-1.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-rose-400']"></span>
        {{ connected ? '已连接信令服务器' : '未连接' }}
      </span>
    </div>

    <!-- 用户名输入 -->
    <div class="mb-3">
      <label class="block text-xs text-slate-500 mb-1.5">用户名</label>
      <input
        v-model="usernameInput"
        type="text"
        placeholder="输入用户名"
        :disabled="inRoom"
        class="w-full px-3.5 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition"
        @input="onUsernameChange"
      />
    </div>

    <!-- 房间号输入 -->
    <div class="mb-4 relative">
      <label class="block text-xs text-slate-500 mb-1.5">房间号</label>
      <input
        v-model="roomIdInput"
        type="text"
        placeholder="输入房间号"
        :disabled="inRoom"
        class="w-full px-3.5 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition"
        @focus="showHistory = true"
        @blur="hideHistory"
      />
      <!-- 房间历史下拉 -->
      <div
        v-if="showHistory && !inRoom && roomHistory.length > 0"
        class="absolute z-10 w-full mt-1.5 rounded-lg bg-[#0c1122] border border-white/10 shadow-xl shadow-black/50 max-h-40 overflow-y-auto"
      >
        <div
          v-for="room in roomHistory"
          :key="room"
          class="group flex items-center justify-between px-3.5 py-2 hover:bg-white/5 cursor-pointer"
          @mousedown.prevent="selectRoom(room)"
        >
          <span class="text-slate-200 text-sm font-mono">{{ room }}</span>
          <button
            class="text-slate-600 group-hover:text-rose-400 text-xs transition-colors"
            @mousedown.prevent.stop="removeHistory(room)"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 加入按钮 -->
    <div v-if="!inRoom">
      <button
        :disabled="!connected || !roomIdInput.trim()"
        class="w-full py-2 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        @click="handleJoin"
      >
        加入会议
      </button>
    </div>

    <!-- 房间信息 -->
    <div v-else class="space-y-3">
      <div class="rounded-xl bg-black/25 border border-white/10 p-4 text-sm">
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-slate-500">房间号</span>
          <span class="text-slate-200 font-mono">{{ roomState.roomId }}</span>
        </div>
        <div class="flex items-center justify-between" :class="{ 'mb-2.5': natCheckConfigured }">
          <span class="text-slate-500">参与者</span>
          <span class="text-slate-200">{{ roomState.participants.length }} 人</span>
        </div>
        <div v-if="natCheckConfigured" class="flex items-center justify-between">
          <span class="text-slate-500">本机 NAT 类型</span>
          <span v-if="natDetecting" class="text-slate-500 text-xs">检测中...</span>
          <span
            v-else
            :class="['px-2 py-0.5 rounded-md text-xs font-medium border', NAT_TYPE_BADGE_CLASS_MAP[localNatType]]"
          >
            {{ NAT_TYPE_LABEL_MAP[localNatType] }}
          </span>
        </div>

        <!-- 参与者列表 -->
        <div class="mt-3 pt-3 border-t border-white/10">
          <div class="text-xs text-slate-600 mb-2">参与者列表</div>
          <div class="space-y-1 max-h-44 overflow-y-auto">
            <div
              v-for="p in roomState.participants"
              :key="p.id"
              class="flex items-center justify-between gap-2 text-sm py-1"
            >
              <span class="text-slate-300 flex items-center gap-2 truncate min-w-0">
                <span
                  :class="[
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    p.id === roomState.myId
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-violet-500/20 text-violet-300'
                  ]"
                >
                  {{ avatarText(p) }}
                </span>
                <span class="truncate">{{ displayName(p) }}</span>
              </span>
              <span class="flex items-center gap-1.5 shrink-0">
                <span
                  v-if="p.id !== roomState.myId && participantNat(p.id)"
                  :class="['px-1.5 py-0.5 rounded text-[10px] font-medium border', NAT_TYPE_BADGE_CLASS_MAP[participantNat(p.id) ?? 'unknown']]"
                >
                  {{ NAT_TYPE_LABEL_MAP[participantNat(p.id) ?? 'unknown'] }}
                </span>
                <span
                  v-if="p.isSharing && p.id !== roomState.myId && watchingSharers.includes(p.id)"
                  class="px-2.5 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer transition-colors"
                  @click="emit('stopWatch', p.id)"
                  title="点击取消观看"
                >
                  观看中
                </span>
                <button
                  v-else-if="p.isSharing && p.id !== roomState.myId && availableSharers.includes(p.id)"
                  class="px-2.5 py-0.5 rounded-md bg-violet-500 hover:bg-violet-400 text-white text-xs font-medium transition-colors"
                  @click="emit('watch', p.id)"
                >
                  观看
                </button>
                <span
                  v-else-if="p.isSharing"
                  class="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs"
                >
                  共享中
                </span>
                <span v-else class="text-xs text-slate-600">未共享</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        class="w-full py-2 rounded-lg border border-rose-500/40 text-rose-300 text-sm font-semibold hover:bg-rose-500/10 transition-colors"
        @click="handleLeave"
      >
        离开会议
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
      <p class="text-rose-300 text-sm">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ConferenceRoomState, NatType } from '../types'
import { NAT_TYPE_LABEL_MAP, NAT_TYPE_BADGE_CLASS_MAP } from '../types'
import { loadUsername, saveUsername, loadRoomHistory, removeRoomHistory } from '../utils/storage'

interface Props {
  connected: boolean
  roomState: ConferenceRoomState
  error: string | null
  availableSharers: string[]
  watchingSharers: string[]
  natCheckConfigured?: boolean
  natDetecting?: boolean
  localNatType?: NatType
  participantNatTypes?: Map<string, NatType>
}

const props = withDefaults(defineProps<Props>(), {
  natCheckConfigured: false,
  natDetecting: false,
  localNatType: 'unknown',
  participantNatTypes: () => new Map()
})

function participantNat(id: string): NatType | undefined {
  return props.participantNatTypes.get(id)
}

const emit = defineEmits<{
  join: [roomId: string, username: string]
  leave: []
  watch: [sharerId: string]
  stopWatch: [sharerId: string]
}>()

const usernameInput = ref('')
const roomIdInput = ref('')
const showHistory = ref(false)
const roomHistory = ref<string[]>([])

const inRoom = computed(() => props.roomState.roomId !== null)

function displayName(p: { id: string; username?: string }) {
  return p.id === props.roomState.myId ? '我' : (p.username || p.id.substring(0, 8))
}

function avatarText(p: { id: string; username?: string }) {
  return displayName(p).charAt(0).toUpperCase()
}

onMounted(() => {
  usernameInput.value = loadUsername()
  roomHistory.value = loadRoomHistory()
})

function onUsernameChange() {
  saveUsername(usernameInput.value)
}

function selectRoom(roomId: string) {
  roomIdInput.value = roomId
  showHistory.value = false
}

function removeHistory(roomId: string) {
  removeRoomHistory(roomId)
  roomHistory.value = loadRoomHistory()
}

function hideHistory() {
  setTimeout(() => { showHistory.value = false }, 150)
}

function handleJoin() {
  const roomId = roomIdInput.value.trim()
  if (roomId) {
    emit('join', roomId, usernameInput.value.trim())
  }
}

function handleLeave() {
  roomIdInput.value = ''
  emit('leave')
}

function setRoomId(roomId: string) {
  roomIdInput.value = roomId
}

defineExpose({ setRoomId })
</script>
