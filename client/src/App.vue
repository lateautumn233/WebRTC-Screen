<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
    <!-- 头部 -->
    <header class="border-b border-gray-700/50 backdrop-blur-sm bg-gray-900/50 sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 class="text-xl font-bold">Screen Share</h1>
            <p class="text-xs text-gray-400">WebRTC + WebCodecs</p>
          </div>
        </div>

        <!-- 连接状态 -->
        <div class="flex items-center gap-2 text-sm">
          <div
            :class="[
              'w-2 h-2 rounded-full',
              signaling.connected.value ? 'bg-green-500' : 'bg-red-500'
            ]"
          ></div>
          <span class="text-gray-400">
            {{ signaling.connected.value ? '已连接' : '未连接' }}
          </span>
        </div>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="max-w-7xl mx-auto px-6 py-8">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 左侧：视频区域 -->
        <div class="lg:col-span-2 space-y-6">
          <!-- 视频播放器 -->
          <VideoPlayer
            ref="videoPlayer"
            :mode="videoMode"
            :stream="screenCapture.stream.value"
            :show-status="isInRoom"
            :show-stats="isStreaming || isReceiving"
            :status="videoStatus"
            :placeholder="videoPlaceholder"
          />

          <!-- 控制按钮 -->
          <div class="flex flex-wrap gap-3">
            <!-- 主持人控制 -->
            <template v-if="isHost">
              <button
                v-if="!isStreaming"
                :disabled="!isInRoom"
                class="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
                @click="startSharing"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                开始共享
              </button>
              <button
                v-else
                class="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-medium transition-colors"
                @click="stopSharing"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                停止共享
              </button>
            </template>

            <!-- 观众控制 -->
            <template v-if="isViewer">
              <button
                v-if="!isReceiving && hasHost"
                class="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-medium transition-colors"
                @click="requestStream"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                请求观看
              </button>
              <div v-else-if="!hasHost" class="text-gray-400 text-sm py-3">
                等待主持人加入...
              </div>
            </template>
          </div>
        </div>

        <!-- 右侧：设置面板 -->
        <div class="space-y-6">
          <!-- 房间面板 -->
          <RoomPanel
            :connected="signaling.connected.value"
            :room-state="signaling.roomState.value"
            :error="signaling.error.value"
            @join="handleJoinRoom"
            @leave="handleLeaveRoom"
          />

          <!-- 编码设置（仅主持人显示） -->
          <SettingsPanel
            v-if="isHost || !isInRoom"
            v-model="encoderSettings"
            :disabled="isStreaming"
          />

          <!-- 连接信息 -->
          <div v-if="isInRoom" class="bg-gray-900 rounded-xl p-6 shadow-lg">
            <h3 class="text-lg font-semibold text-white mb-4">连接状态</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-400">WebRTC 状态</span>
                <span :class="connectionStateClass">{{ connectionStateText }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">连接数</span>
                <span class="text-white">{{ webrtc.getConnectionCount() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import VideoPlayer from './components/VideoPlayer.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import RoomPanel from './components/RoomPanel.vue'
import { useSignaling } from './composables/useSignaling'
import { useScreenCapture } from './composables/useScreenCapture'
import { useWebCodecs } from './composables/useWebCodecs'
import { useWebRTC } from './composables/useWebRTC'
import type { EncoderSettings } from './types'
import { logger } from './utils/logger'
import { saveSettings, loadSettings } from './utils/storage'

// Composables
const signaling = useSignaling()
const screenCapture = useScreenCapture()
const webcodecs = useWebCodecs()
const webrtc = useWebRTC()

// 状态
const videoPlayer = ref<InstanceType<typeof VideoPlayer> | null>(null)
const encoderSettings = ref<EncoderSettings>(loadSettings())
const isStreaming = ref(false)
const isReceiving = ref(false)

// 监听设置变化，自动保存到 localStorage
watch(encoderSettings, (newSettings) => {
  saveSettings(newSettings)
}, { deep: true })

// 计算属性
const isInRoom = computed(() => signaling.roomState.value.roomId !== null)
const isHost = computed(() => signaling.roomState.value.role === 'host')
const isViewer = computed(() => signaling.roomState.value.role === 'viewer')
const hasHost = computed(() => signaling.roomState.value.hostId !== null)

const videoMode = computed(() => {
  if (isHost.value && screenCapture.isCapturing.value) return 'preview'
  if (isViewer.value && isReceiving.value) return 'playback'
  return 'idle'
})

const videoStatus = computed(() => {
  if (isStreaming.value) return 'streaming'
  if (webrtc.connectionState.value === 'connecting') return 'connecting'
  return 'idle'
})

const videoPlaceholder = computed(() => {
  if (!isInRoom.value) return '请先加入房间'
  if (isHost.value) return '点击"开始共享"选择屏幕'
  if (!hasHost.value) return '等待主持人加入...'
  return '点击"请求观看"接收画面'
})

const connectionStateText = computed(() => {
  switch (webrtc.connectionState.value) {
    case 'connected':
      return '已连接'
    case 'connecting':
      return '连接中...'
    case 'failed':
      return '连接失败'
    default:
      return '未连接'
  }
})

const connectionStateClass = computed(() => {
  switch (webrtc.connectionState.value) {
    case 'connected':
      return 'text-green-400'
    case 'connecting':
      return 'text-yellow-400'
    case 'failed':
      return 'text-red-400'
    default:
      return 'text-gray-400'
  }
})

// 房间操作
function handleJoinRoom(roomId: string, asHost: boolean) {
  signaling.joinRoom(roomId, asHost)
}

function handleLeaveRoom() {
  stopSharing()
  webrtc.closeAll()
  signaling.disconnect()
  signaling.connect()
}

// 主持人: 开始共享
async function startSharing() {
  const stream = await screenCapture.startCapture({ audio: true })
  if (!stream) return

  const videoTrack = screenCapture.getVideoTrack()
  if (!videoTrack) return

  // 设置音频轨道（如果有）
  const audioTrack = screenCapture.getAudioTrack()
  if (audioTrack) {
    webrtc.setAudioTrack(audioTrack, stream)
    logger.log('Audio track available for sharing')
  }

  // 初始化编码器
  await webcodecs.initEncoder(videoTrack, encoderSettings.value, (frameData) => {
    const serialized = webcodecs.serializeFrame(frameData)
    webrtc.broadcastData(serialized)
  })

  isStreaming.value = true
}

// 主持人: 停止共享
async function stopSharing() {
  await webcodecs.stopEncoder()
  screenCapture.stopCapture()
  webrtc.setAudioTrack(null, null)
  isStreaming.value = false
}

// 观众: 请求观看
function requestStream() {
  signaling.requestStream()
}

// 设置信令回调
function setupSignalingCallbacks() {
  // 主持人: 收到观众的观看请求
  signaling.onStreamRequested(async (viewerId) => {
    logger.log(`Viewer ${viewerId} requested stream`)
    // 创建 offer 发送给观众
    const offer = await webrtc.createOffer(viewerId)
    signaling.sendOffer(viewerId, offer)
  })

  // 主持人: 新观众加入
  signaling.onViewerJoined((viewerId) => {
    logger.log(`Viewer joined: ${viewerId}`)
  })

  // 观众: 收到 offer
  signaling.onOffer(async (senderId, offer) => {
    logger.log(`Received offer from ${senderId}`)
    const answer = await webrtc.handleOffer(senderId, offer)
    signaling.sendAnswer(senderId, answer)

    // 初始化解码器
    if (!webcodecs.isDecoding.value) {
      await webcodecs.initDecoder((frame) => {
        videoPlayer.value?.drawFrame(frame)
      })
      isReceiving.value = true
    }
  })

  // 主持人: 收到 answer
  signaling.onAnswer(async (senderId, answer) => {
    logger.log(`Received answer from ${senderId}`)
    await webrtc.handleAnswer(senderId, answer)
  })

  // ICE candidate
  signaling.onIceCandidate(async (senderId, candidate) => {
    await webrtc.addIceCandidate(senderId, candidate)
  })

  // 主持人离开
  signaling.onHostLeft(() => {
    logger.log('Host left')
    isReceiving.value = false
    webcodecs.stopDecoder()
    webrtc.closeAll()
    videoPlayer.value?.clearCanvas()
  })
}

// 设置 WebRTC 回调
function setupWebRTCCallbacks() {
  // ICE candidate
  webrtc.setOnIceCandidate((peerId, candidate) => {
    signaling.sendIceCandidate(peerId, candidate)
  })

  // DataChannel 打开时请求关键帧 (主持人端)
  webrtc.setOnDataChannelOpen((peerId) => {
    logger.log(`DataChannel opened with ${peerId}, requesting keyframe`)
    webcodecs.requestKeyFrame()
  })

  // 接收远程音频流 (观众端)
  webrtc.setOnRemoteTrack((peerId, stream) => {
    logger.log(`Received remote stream from ${peerId}`)
    videoPlayer.value?.setAudioStream(stream)
  })

  // 收到数据 (观众端)
  webrtc.setOnDataReceived((_peerId, data) => {
    // 统计接收码率
    videoPlayer.value?.addReceivedBytes(data.byteLength)

    const frameData = webcodecs.deserializeFrame(data)

    // 更新解码器信息
    if (frameData.type === 'config' && frameData.codec) {
      videoPlayer.value?.setCodec(frameData.codec)
    }

    webcodecs.decodeFrame(frameData)
  })
}

onMounted(() => {
  signaling.connect()
  setupSignalingCallbacks()
  setupWebRTCCallbacks()
})

onUnmounted(() => {
  stopSharing()
  webcodecs.stopDecoder()
  webrtc.closeAll()
  signaling.disconnect()
})
</script>
