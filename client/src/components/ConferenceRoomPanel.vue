<template>
  <div class="bg-gray-900 rounded-xl p-6 shadow-lg">
    <h3 class="text-lg font-semibold text-white mb-4">会议房间</h3>

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

    <!-- 房间号输入 -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-300 mb-2">房间号</label>
      <input
        v-model="roomIdInput"
        type="text"
        placeholder="输入房间号"
        :disabled="inRoom"
        class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
      />
    </div>

    <!-- 加入按钮 -->
    <div v-if="!inRoom">
      <button
        :disabled="!connected || !roomIdInput.trim()"
        class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        @click="handleJoin"
      >
        加入会议
      </button>
    </div>

    <!-- 房间信息 -->
    <div v-else class="space-y-3">
      <div class="bg-gray-800 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-gray-400">房间号</span>
          <span class="text-white font-mono">{{ roomState.roomId }}</span>
        </div>
        <div class="flex items-center justify-between mb-3">
          <span class="text-gray-400">参与者</span>
          <span class="text-white">{{ roomState.participants.length }} 人</span>
        </div>

        <!-- 参与者列表 -->
        <div class="mt-3 pt-3 border-t border-gray-700">
          <div class="text-xs text-gray-500 mb-2">参与者列表</div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <div
              v-for="p in roomState.participants"
              :key="p.id"
              class="flex items-center justify-between text-sm py-1"
            >
              <span class="text-gray-300 truncate">
                {{ p.id === roomState.myId ? '我' : p.id.substring(0, 8) }}
              </span>
              <span
                v-if="p.isSharing && p.id !== roomState.myId && watchingSharers.includes(p.id)"
                class="px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs cursor-pointer transition-colors"
                @click="emit('stopWatch', p.id)"
                title="点击取消观看"
              >
                观看中
              </span>
              <button
                v-else-if="p.isSharing && p.id !== roomState.myId && availableSharers.includes(p.id)"
                class="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs transition-colors"
                @click="emit('watch', p.id)"
              >
                观看
              </button>
              <span
                v-else-if="p.isSharing"
                class="px-2 py-0.5 bg-red-600/20 text-red-400 rounded text-xs"
              >
                共享中
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        class="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        @click="handleLeave"
      >
        离开会议
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
      <p class="text-red-400 text-sm">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ConferenceRoomState } from '../types'

interface Props {
  connected: boolean
  roomState: ConferenceRoomState
  error: string | null
  availableSharers: string[]
  watchingSharers: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  join: [roomId: string]
  leave: []
  watch: [sharerId: string]
  stopWatch: [sharerId: string]
}>()

const roomIdInput = ref('')

const inRoom = computed(() => props.roomState.roomId !== null)

function handleJoin() {
  const roomId = roomIdInput.value.trim()
  if (roomId) {
    emit('join', roomId)
  }
}

function handleLeave() {
  roomIdInput.value = ''
  emit('leave')
}
</script>
