<template>
  <main class="max-w-7xl mx-auto px-6 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 左侧：视频网格区域 -->
      <div class="lg:col-span-2 space-y-6">
        <!-- 视频网格 -->
        <VideoGrid
          ref="videoGrid"
          :local-stream="isSharing ? screenCapture.stream.value : null"
          :remote-sharers="remoteSharers"
          :placeholder="videoPlaceholder"
        />

        <!-- 控制按钮 -->
        <div class="flex flex-wrap gap-3">
          <button
            v-if="!isSharing"
            :disabled="!isInRoom"
            class="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
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
        </div>
      </div>

      <!-- 右侧：设置面板 -->
      <div class="space-y-6">
        <!-- 房间面板 -->
        <ConferenceRoomPanel
          :connected="signaling.connected.value"
          :room-state="signaling.roomState.value"
          :error="signaling.error.value"
          @join="handleJoinRoom"
          @leave="handleLeaveRoom"
        />

        <!-- 编码设置 -->
        <SettingsPanel
          v-model="encoderSettings"
          :disabled="isSharing"
        />

        <!-- 连接信息 -->
        <div v-if="isInRoom" class="bg-gray-900 rounded-xl p-6 shadow-lg">
          <h3 class="text-lg font-semibold text-white mb-4">连接状态</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-400">WebRTC 连接数</span>
              <span class="text-white">{{ webrtc.connectionCount.value }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">正在共享</span>
              <span :class="isSharing ? 'text-green-400' : 'text-gray-400'">
                {{ isSharing ? '是' : '否' }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">共享者数量</span>
              <span class="text-white">{{ (isSharing ? 1 : 0) + remoteSharers.length }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import VideoGrid from '../components/VideoGrid.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import ConferenceRoomPanel from '../components/ConferenceRoomPanel.vue'
import { useConferenceSignaling } from '../composables/useConferenceSignaling'
import { useScreenCapture } from '../composables/useScreenCapture'
import { useConferenceWebCodecs } from '../composables/useConferenceWebCodecs'
import { useWebRTC } from '../composables/useWebRTC'
import type { EncoderSettings } from '../types'
import { logger } from '../utils/logger'
import { saveSettings, loadSettings } from '../utils/storage'

// Composables
const signaling = useConferenceSignaling()
const screenCapture = useScreenCapture()
const webcodecs = useConferenceWebCodecs()
const webrtc = useWebRTC()

// 状态
const videoGrid = ref<InstanceType<typeof VideoGrid> | null>(null)
const encoderSettings = ref<EncoderSettings>(loadSettings())
const isSharing = ref(false)
const remoteSharers = ref<{ id: string; label?: string }[]>([])

// 监听设置变化
watch(encoderSettings, (newSettings) => {
  saveSettings(newSettings)
}, { deep: true })

// 计算属性
const isInRoom = computed(() => signaling.roomState.value.roomId !== null)

const videoPlaceholder = computed(() => {
  if (!isInRoom.value) return '请先加入会议房间'
  return '点击"开始共享"共享你的屏幕，或等待其他参与者共享'
})

// 房间操作
function handleJoinRoom(roomId: string) {
  signaling.joinRoom(roomId)
}

function handleLeaveRoom() {
  stopSharing()
  webcodecs.stopAllDecoders()
  webrtc.closeAll()
  remoteSharers.value = []
  signaling.disconnect()
  signaling.connect()
}

// 开始共享
async function startSharing() {
  const stream = await screenCapture.startCapture({ audio: true })
  if (!stream) return

  const videoTrack = screenCapture.getVideoTrack()
  if (!videoTrack) return

  // 设置音频轨道
  const audioTrack = screenCapture.getAudioTrack()
  if (audioTrack) {
    webrtc.setAudioTrack(audioTrack, stream)
    logger.log('Conference: Audio track available')
  }

  // 初始化编码器
  await webcodecs.initEncoder(videoTrack, encoderSettings.value, (frameData) => {
    const serialized = webcodecs.serializeFrame(frameData)
    webrtc.broadcastData(serialized)
  })

  isSharing.value = true
  signaling.startSharing()

  // 监听屏幕共享停止
  videoTrack.onended = () => {
    stopSharing()
  }
}

// 停止共享
async function stopSharing() {
  if (!isSharing.value) return

  await webcodecs.stopEncoder()
  screenCapture.stopCapture()
  webrtc.setAudioTrack(null, null)
  isSharing.value = false
  signaling.stopSharing()

  // 关闭作为共享者建立的连接（观看者发起的连接）
  // 注意：不关闭作为观看者建立的连接
}

// 设置信令回调
function setupSignalingCallbacks() {
  // 加入房间后，检查已有共享者
  signaling.onJoined((participants) => {
    const myId = signaling.roomState.value.myId
    for (const p of participants) {
      if (p.isSharing && p.id !== myId) {
        if (!remoteSharers.value.find(s => s.id === p.id)) {
          remoteSharers.value.push({ id: p.id })
        }
        signaling.requestPeerStream(p.id)
      }
    }
  })

  // 有新共享者开始共享
  signaling.onSharerStarted((sharerId) => {
    logger.log(`Conference: New sharer: ${sharerId}`)
    // 添加到远程共享者列表
    if (!remoteSharers.value.find(s => s.id === sharerId)) {
      remoteSharers.value.push({ id: sharerId })
    }
    // 请求连接该共享者
    signaling.requestPeerStream(sharerId)
  })

  // 共享者停止共享
  signaling.onSharerStopped((sharerId) => {
    logger.log(`Conference: Sharer stopped: ${sharerId}`)
    remoteSharers.value = remoteSharers.value.filter(s => s.id !== sharerId)
    webcodecs.stopDecoderForSharer(sharerId)
    webrtc.closePeer(sharerId)
    videoGrid.value?.clearSharer(sharerId)
  })

  // 作为共享者：收到观看请求，创建 offer
  signaling.onPeerStreamRequested(async (viewerId) => {
    if (!isSharing.value) return
    logger.log(`Conference: Creating offer for viewer ${viewerId}`)
    const offer = await webrtc.createOffer(viewerId)
    signaling.sendOffer(viewerId, offer)
  })

  // 作为观看者：收到 offer，创建 answer 并初始化解码器
  signaling.onOffer(async (senderId, offer) => {
    logger.log(`Conference: Received offer from ${senderId}`)
    const answer = await webrtc.handleOffer(senderId, offer)
    signaling.sendAnswer(senderId, answer)

    // 为该共享者初始化解码器
    if (!webcodecs.hasDecoder(senderId)) {
      await webcodecs.initDecoderForSharer(senderId, (frame) => {
        videoGrid.value?.drawFrame(senderId, frame)
      })
    }
  })

  // 作为共享者：收到 answer
  signaling.onAnswer(async (senderId, answer) => {
    logger.log(`Conference: Received answer from ${senderId}`)
    await webrtc.handleAnswer(senderId, answer)
  })

  // ICE candidate
  signaling.onIceCandidate(async (senderId, candidate) => {
    await webrtc.addIceCandidate(senderId, candidate)
  })

  // 参与者离开
  signaling.onParticipantLeft((participantId) => {
    logger.log(`Conference: Participant left: ${participantId}`)
    remoteSharers.value = remoteSharers.value.filter(s => s.id !== participantId)
    webcodecs.stopDecoderForSharer(participantId)
    webrtc.closePeer(participantId)
    videoGrid.value?.clearSharer(participantId)
  })
}

// 设置 WebRTC 回调
function setupWebRTCCallbacks() {
  // ICE candidate
  webrtc.setOnIceCandidate((peerId, candidate) => {
    signaling.sendIceCandidate(peerId, candidate)
  })

  // DataChannel 打开时请求关键帧（作为共享者端）
  webrtc.setOnDataChannelOpen((peerId) => {
    logger.log(`Conference: DataChannel opened with ${peerId}`)
    if (isSharing.value) {
      webcodecs.requestKeyFrame()
    }
  })

  // 接收远程音频流
  webrtc.setOnRemoteTrack((peerId, stream) => {
    logger.log(`Conference: Received remote audio from ${peerId}`)
    videoGrid.value?.setAudioStream(peerId, stream)
  })

  // 收到数据（作为观看者端）
  webrtc.setOnDataReceived((peerId, data) => {
    // 统计接收码率
    videoGrid.value?.addReceivedBytes(peerId, data.byteLength)

    const frameData = webcodecs.deserializeFrame(data)
    webcodecs.decodeFrameForSharer(peerId, frameData)
  })
}

onMounted(() => {
  signaling.connect()
  setupSignalingCallbacks()
  setupWebRTCCallbacks()
})

onUnmounted(() => {
  stopSharing()
  webcodecs.stopAllDecoders()
  webrtc.closeAll()
  signaling.disconnect()
})
</script>
