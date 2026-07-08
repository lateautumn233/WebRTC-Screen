<template>
  <div class="surface rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-100">房间</h3>
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
        class="w-full px-3.5 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition"
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
        class="w-full px-3.5 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition"
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
    <div v-if="!inRoom" class="grid grid-cols-2 gap-2.5">
      <button
        :disabled="!connected || !roomIdInput.trim()"
        class="py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        @click="handleJoin(true)"
      >
        创建房间
      </button>
      <button
        :disabled="!connected || !roomIdInput.trim()"
        class="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        @click="handleJoin(false)"
      >
        加入房间
      </button>
    </div>

    <!-- 房间信息 -->
    <div v-else class="space-y-3">
      <div class="rounded-xl bg-black/25 border border-white/10 p-4 space-y-2.5 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-slate-500">房间号</span>
          <span class="text-slate-200 font-mono">{{ roomState.roomId }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">角色</span>
          <span :class="[
            'px-2 py-0.5 rounded-md text-xs font-medium border',
            roomState.role === 'host'
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          ]">
            {{ roomState.role === 'host' ? '主持人' : '观众' }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">观众数</span>
          <span class="text-slate-200">{{ roomState.viewerCount }}</span>
        </div>
      </div>

      <button
        class="w-full py-2 rounded-lg border border-rose-500/40 text-rose-300 text-sm font-semibold hover:bg-rose-500/10 transition-colors"
        @click="handleLeave"
      >
        离开房间
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
import type { RoomState } from '../types'
import { loadUsername, saveUsername, loadRoomHistory, removeRoomHistory } from '../utils/storage'

interface Props {
  connected: boolean
  roomState: RoomState
  error: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  join: [roomId: string, isHost: boolean, username: string]
  leave: []
}>()

const usernameInput = ref('')
const roomIdInput = ref('')
const showHistory = ref(false)
const roomHistory = ref<string[]>([])

const inRoom = computed(() => props.roomState.roomId !== null)

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

function handleJoin(isHost: boolean) {
  const roomId = roomIdInput.value.trim()
  if (roomId) {
    emit('join', roomId, isHost, usernameInput.value.trim())
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
