<template>
  <div class="bg-gray-900 rounded-xl p-6 shadow-lg">
    <h3 class="text-lg font-semibold text-white mb-4">房间</h3>

    <!-- 连接状态 -->
    <div class="flex items-center gap-2 mb-4">
      <div
        :class="[
          'w-2 h-2 rounded-full',
          connected ? 'bg-green-500' : 'bg-red-500'
        ]"
      ></div>
      <span class="text-sm text-gray-400">
        {{ connected ? '已连接信令服务器' : '未连接' }}
      </span>
    </div>

    <!-- 用户名输入 -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-300 mb-2">用户名</label>
      <input
        v-model="usernameInput"
        type="text"
        placeholder="输入用户名"
        :disabled="inRoom"
        class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        @input="onUsernameChange"
      />
    </div>

    <!-- 房间号输入 -->
    <div class="mb-4 relative">
      <label class="block text-sm font-medium text-gray-300 mb-2">房间号</label>
      <input
        v-model="roomIdInput"
        type="text"
        placeholder="输入房间号"
        :disabled="inRoom"
        class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        @focus="showHistory = true"
        @blur="hideHistory"
      />
      <!-- 房间历史下拉 -->
      <div
        v-if="showHistory && !inRoom && roomHistory.length > 0"
        class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto"
      >
        <div
          v-for="room in roomHistory"
          :key="room"
          class="flex items-center justify-between px-4 py-2 hover:bg-gray-700 cursor-pointer"
          @mousedown.prevent="selectRoom(room)"
        >
          <span class="text-white text-sm font-mono">{{ room }}</span>
          <button
            class="text-gray-500 hover:text-red-400 text-xs"
            @mousedown.prevent.stop="removeHistory(room)"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 加入按钮 -->
    <div v-if="!inRoom" class="grid grid-cols-2 gap-3">
      <button
        :disabled="!connected || !roomIdInput.trim()"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        @click="handleJoin(true)"
      >
        创建房间
      </button>
      <button
        :disabled="!connected || !roomIdInput.trim()"
        class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        @click="handleJoin(false)"
      >
        加入房间
      </button>
    </div>

    <!-- 房间信息 -->
    <div v-else class="space-y-3">
      <div class="bg-gray-800 rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-400">房间号</span>
          <span class="text-white font-mono">{{ roomState.roomId }}</span>
        </div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-400">角色</span>
          <span :class="[
            'px-2 py-1 rounded text-sm font-medium',
            roomState.role === 'host' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
          ]">
            {{ roomState.role === 'host' ? '主持人' : '观众' }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-400">观众数</span>
          <span class="text-white">{{ roomState.viewerCount }}</span>
        </div>
      </div>

      <button
        class="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        @click="handleLeave"
      >
        离开房间
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
      <p class="text-red-400 text-sm">{{ error }}</p>
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
