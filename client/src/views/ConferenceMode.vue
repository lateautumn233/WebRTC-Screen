<template>
  <main class="max-w-7xl mx-auto px-6 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- 左侧：视频网格区域 -->
      <div class="lg:col-span-2 space-y-4">
        <!-- 视频网格 -->
        <VideoGrid
          ref="videoGrid"
          :local-stream="isSharing ? screenCapture.stream.value : null"
          :remote-sharers="remoteSharers"
          :placeholder="videoPlaceholder"
        />

        <!-- 编/解码错误提示（如画面无法解码而黑屏时，告知具体原因） -->
        <div
          v-if="webcodecs.error.value"
          class="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
        >
          <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{{ webcodecs.error.value }}</span>
        </div>
        <!-- 硬件编/解码回退提示 -->
        <div
          v-else-if="webcodecs.hardwareFallback.value"
          class="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs"
        >
          <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>{{ webcodecs.hardwareFallback.value }}</span>
        </div>

        <!-- 控制按钮 -->
        <div class="flex flex-wrap gap-3">
          <button
            v-if="!isSharing"
            :disabled="!isInRoom || !encoderSupported"
            :class="isInRoom && encoderSupported ? 'glow-violet' : ''"
            class="flex items-center gap-2 px-6 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
            @click="startSharing"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            开始共享
          </button>
          <button
            v-else
            class="flex items-center gap-2 px-6 py-2.5 bg-rose-500 hover:bg-rose-400 text-white rounded-xl font-semibold transition-colors"
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

      <!-- 右侧：Tab 分栏侧边栏 -->
      <SidebarTabs v-model="activeSidebarTab" :tabs="sidebarTabs" accent="violet">
        <!-- 房间面板（含连接状态、参与者 NAT 类型） -->
        <template #room>
          <ConferenceRoomPanel
            ref="roomPanel"
            :connected="signaling.connected.value"
            :room-state="signaling.roomState.value"
            :error="signaling.error.value"
            :available-sharers="availableSharers"
            :watching-sharers="remoteSharers.map(s => s.id)"
            :nat-check-configured="natDetection.natCheckConfigured.value"
            :nat-detecting="natDetection.detecting.value"
            :local-nat-type="natDetection.localNatType.value"
            @join="handleJoinRoom"
            @leave="handleLeaveRoom"
            @watch="startWatching"
            @stop-watch="stopWatching"
          />
        </template>

        <!-- 编码设置 -->
        <template #settings>
          <SettingsPanel
            v-model="encoderSettings"
            :disabled="isSharing"
            accent="violet"
            @update:supported="encoderSupported = $event"
          />
        </template>
      </SidebarTabs>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import VideoGrid from '../components/VideoGrid.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import ConferenceRoomPanel from '../components/ConferenceRoomPanel.vue'
import SidebarTabs from '../components/SidebarTabs.vue'
import { useConferenceSignaling } from '../composables/useConferenceSignaling'
import { useScreenCapture } from '../composables/useScreenCapture'
import { useConferenceWebCodecs } from '../composables/useConferenceWebCodecs'
import { useWebRTC } from '../composables/useWebRTC'
import { useNatDetection } from '../composables/useNatDetection'
import type { EncoderSettings } from '../types'
import { logger } from '../utils/logger'
import { saveSettings, loadSettings, saveSession, clearSession, loadSession, saveRoomHistory, loadUsername } from '../utils/storage'

// Composables
const signaling = useConferenceSignaling()
const screenCapture = useScreenCapture()
const webcodecs = useConferenceWebCodecs()
const webrtc = useWebRTC()
const natDetection = useNatDetection()

// 状态
const videoGrid = ref<InstanceType<typeof VideoGrid> | null>(null)
const roomPanel = ref<InstanceType<typeof ConferenceRoomPanel> | null>(null)
const encoderSettings = ref<EncoderSettings>(loadSettings())
const isSharing = ref(false)
// 当前编码设置组合是否可用（硬件或软件任一支持），由 SettingsPanel 探测后上报
const encoderSupported = ref(true)
const remoteSharers = ref<{ id: string; label?: string }[]>([])
const availableSharers = ref<string[]>([])
let pingInterval: ReturnType<typeof setInterval> | null = null
// 监听设置变化
watch(encoderSettings, (newSettings) => {
  saveSettings(newSettings)
}, { deep: true })

// 计算属性
const isInRoom = computed(() => signaling.roomState.value.roomId !== null)

// 右侧 Tab 分栏侧边栏：会议 Tab 内含连接状态
const activeSidebarTab = ref('room')
const sidebarTabs = [
  { key: 'room', label: '会议' },
  { key: 'settings', label: '设置' }
]

// 连接方向前缀：区分"作为共享者"和"作为观看者"的连接
function viewerKey(peerId: string) { return `viewer:${peerId}` }
function sharerKey(peerId: string) { return `sharer:${peerId}` }
function stripKey(key: string) { return key.replace(/^(viewer|sharer):/, '') }

// 只向观看者方向的连接广播数据
function broadcastToViewers(data: ArrayBuffer) {
  webrtc.dataChannels.value.forEach((_channel, key) => {
    if (key.startsWith('viewer:')) {
      webrtc.sendData(key, data)
    }
  })
}

const videoPlaceholder = computed(() => {
  if (!isInRoom.value) return '请先加入会议房间'
  return '点击"开始共享"共享你的屏幕，或等待其他参与者共享'
})

// 房间操作
function handleJoinRoom(roomId: string, username?: string) {
  signaling.joinRoom(roomId, username)
}

function handleLeaveRoom() {
  stopSharing()
  webcodecs.stopAllDecoders()
  webrtc.closeAll()
  remoteSharers.value = []
  availableSharers.value = []
  signaling.disconnect()
  signaling.connect()
  clearSession()
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
}

// 开始共享
async function startSharing() {
  const stream = await screenCapture.startCapture({
    audio: true,
    framerate: encoderSettings.value.framerate,
    resolution: encoderSettings.value.resolution
  })
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
    broadcastToViewers(serialized)
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

  // 关闭所有作为共享者建立的连接（观看者发起的连接）
  const viewerPeers = [...webrtc.peerConnections.value.keys()]
    .filter(key => key.startsWith('viewer:'))
  viewerPeers.forEach(key => webrtc.closePeer(key))
}

// 开始观看某个共享者
function startWatching(sharerId: string) {
  if (remoteSharers.value.find(s => s.id === sharerId)) return
  remoteSharers.value.push({ id: sharerId })
  signaling.requestPeerStream(sharerId)
}

// 停止观看某个共享者
function stopWatching(sharerId: string) {
  remoteSharers.value = remoteSharers.value.filter(s => s.id !== sharerId)
  webcodecs.stopDecoderForSharer(sharerId)
  webrtc.closePeer(sharerKey(sharerId))
  videoGrid.value?.clearSharer(sharerId)
}

// 设置信令回调
function setupSignalingCallbacks() {
  // 加入房间后，检查已有共享者
  signaling.onJoined((participants) => {
    // 保存会话和房间历史
    const roomId = signaling.roomState.value.roomId
    if (roomId) {
      saveSession({ roomId, mode: 'conference' })
      saveRoomHistory(roomId)
    }

    const myId = signaling.roomState.value.myId
    for (const p of participants) {
      if (p.isSharing && p.id !== myId) {
        if (!availableSharers.value.includes(p.id)) {
          availableSharers.value.push(p.id)
        }
      }
    }

    // 若加入房间前本机 NAT 类型已探测完成，上面的 watch 不会再触发，这里补发一次
    if (natDetection.localNatType.value !== 'unknown') {
      signaling.updateNatType(natDetection.localNatType.value)
    }
  })

  // 有新共享者开始共享
  signaling.onSharerStarted((sharerId) => {
    logger.log(`Conference: New sharer: ${sharerId}`)
    if (!availableSharers.value.includes(sharerId)) {
      availableSharers.value.push(sharerId)
    }
  })

  // 共享者停止共享
  signaling.onSharerStopped((sharerId) => {
    logger.log(`Conference: Sharer stopped: ${sharerId}`)
    availableSharers.value = availableSharers.value.filter(id => id !== sharerId)
    remoteSharers.value = remoteSharers.value.filter(s => s.id !== sharerId)
    webcodecs.stopDecoderForSharer(sharerId)
    webrtc.closePeer(sharerKey(sharerId))
    videoGrid.value?.clearSharer(sharerId)
  })

  // 作为共享者：收到观看请求，创建 offer
  signaling.onPeerStreamRequested(async (viewerId) => {
    if (!isSharing.value) return
    logger.log(`Conference: Creating offer for viewer ${viewerId}`)
    const offer = await webrtc.createOffer(viewerKey(viewerId))
    signaling.sendOffer(viewerId, offer)
  })

  // 作为观看者：收到 offer，创建 answer 并初始化解码器
  signaling.onOffer(async (senderId, offer) => {
    logger.log(`Conference: Received offer from ${senderId}`)
    const answer = await webrtc.handleOffer(sharerKey(senderId), offer)
    signaling.sendAnswer(senderId, answer)

    // 为该共享者初始化解码器
    if (!webcodecs.hasDecoder(senderId)) {
      await webcodecs.initDecoderForSharer(senderId, (frame, decodeLatencyMs) => {
        videoGrid.value?.drawFrame(senderId, frame, decodeLatencyMs)
      })
    }
  })

  // 作为共享者：收到 answer
  signaling.onAnswer(async (senderId, answer) => {
    logger.log(`Conference: Received answer from ${senderId}`)
    await webrtc.handleAnswer(viewerKey(senderId), answer)
  })

  // ICE candidate：需要判断属于哪个方向的连接
  signaling.onIceCandidate(async (senderId, candidate) => {
    // 尝试两个方向，添加到存在的连接上
    const hasSharerConn = webrtc.peerConnections.value.has(sharerKey(senderId))
    const hasViewerConn = webrtc.peerConnections.value.has(viewerKey(senderId))
    if (hasSharerConn) {
      await webrtc.addIceCandidate(sharerKey(senderId), candidate)
    }
    if (hasViewerConn) {
      await webrtc.addIceCandidate(viewerKey(senderId), candidate)
    }
  })

  // 参与者离开
  signaling.onParticipantLeft((participantId) => {
    logger.log(`Conference: Participant left: ${participantId}`)
    availableSharers.value = availableSharers.value.filter(id => id !== participantId)
    remoteSharers.value = remoteSharers.value.filter(s => s.id !== participantId)
    webcodecs.stopDecoderForSharer(participantId)
    // 关闭两个方向的连接
    webrtc.closePeer(sharerKey(participantId))
    webrtc.closePeer(viewerKey(participantId))
    videoGrid.value?.clearSharer(participantId)
  })
}

// 设置 WebRTC 回调
function setupWebRTCCallbacks() {
  // ICE candidate：peerId 带方向前缀，需要还原原始 ID 发送信令
  webrtc.setOnIceCandidate((peerId, candidate) => {
    signaling.sendIceCandidate(stripKey(peerId), candidate)
  })

  // DataChannel 打开时请求关键帧（仅作为共享者端，即 viewer: 前缀的连接）
  webrtc.setOnDataChannelOpen((peerId) => {
    logger.log(`Conference: DataChannel opened with ${peerId}`)
    if (isSharing.value && peerId.startsWith('viewer:')) {
      webcodecs.requestKeyFrame()
    }

    // 发送本机 NAT 类型给对端（此时可能还未检测完成，稍后由 watch 补发）。
    // 未配置检测服务时不发送，避免对端一直显示无意义的"未检测"占位
    if (natDetection.natCheckConfigured.value) {
      webrtc.sendNatInfo(peerId, natDetection.localNatType.value)
    }

    // 作为观看者：启动 ping 定时器测量网络延迟，顺带轮询各共享者连接是直连还是经 TURN 中转
    if (peerId.startsWith('sharer:') && !pingInterval) {
      pingInterval = setInterval(() => {
        // 只向 sharer: 前缀的连接发 ping
        webrtc.dataChannels.value.forEach((_channel, key) => {
          if (key.startsWith('sharer:')) {
            webrtc.sendPing(key)
            webrtc.getConnectionType(key).then((type) => {
              videoGrid.value?.setConnectionType(stripKey(key), type)
            })
          }
        })
      }, 1000)
    }
  })

  // 收到对端 NAT 类型信息（P2P DataChannel）：仅用于共享者视频瓦片上的 NAT 角标。
  // 参与者列表里"对方 NAT 类型"改由信令服务器广播（见 updateNatType/conference-state），
  // 不依赖 P2P 连接，房间内所有人一进房就能看到
  webrtc.setOnNatInfoReceived((peerId, natType) => {
    if (peerId.startsWith('sharer:')) {
      videoGrid.value?.setNatType(stripKey(peerId), natType)
    }
  })

  // 收到 pong 回复（观看者端）
  webrtc.setOnPongReceived((peerId, rtt) => {
    const originalId = stripKey(peerId)
    videoGrid.value?.setNetworkLatency(originalId, rtt / 2)
  })

  // 接收远程音频流（peerId 带前缀，还原为原始 ID）
  webrtc.setOnRemoteTrack((peerId, stream) => {
    const originalId = stripKey(peerId)
    logger.log(`Conference: Received remote audio from ${originalId}`)
    videoGrid.value?.setAudioStream(originalId, stream)
  })

  // 收到数据（作为观看者端，peerId 带 sharer: 前缀）
  webrtc.setOnDataReceived((peerId, data) => {
    const originalId = stripKey(peerId)
    // 统计接收码率
    videoGrid.value?.addReceivedBytes(originalId, data.byteLength)

    const frameData = webcodecs.deserializeFrame(data)

    // 更新编码器信息
    if (frameData.type === 'config' && frameData.codec) {
      videoGrid.value?.setCodec(originalId, frameData.codec)
    }

    // 传递编码延迟
    if (frameData.type === 'video' && frameData.encodeLatencyMs) {
      videoGrid.value?.setEncodeLatency(originalId, frameData.encodeLatencyMs)
    }

    webcodecs.decodeFrameForSharer(originalId, frameData)
  })
}

// 本机 NAT 类型探测完成后：广播给信令服务器（供房间内所有参与者展示，无需 P2P 连接），
// 并补发给已连接的 P2P 对端（可能晚于 DataChannel 打开）
watch(natDetection.localNatType, (natType) => {
  if (natType !== 'unknown') {
    signaling.updateNatType(natType)
    webrtc.sendNatInfoToAll(natType)
  }
})

onMounted(() => {
  signaling.connect()
  setupSignalingCallbacks()
  setupWebRTCCallbacks()
  natDetection.detectLocalNat()

  // 会话恢复：检查是否有未清除的会话
  const session = loadSession()
  if (session && session.mode === 'conference') {
    const username = loadUsername()
    // 等待信令连接建立后自动加入
    const checkConnection = setInterval(() => {
      if (signaling.connected.value) {
        clearInterval(checkConnection)
        roomPanel.value?.setRoomId(session.roomId)
        signaling.joinRoom(session.roomId, username || undefined)
      }
    }, 100)
    // 5秒超时，避免无限等待
    setTimeout(() => clearInterval(checkConnection), 5000)
  }
})

onUnmounted(() => {
  stopSharing()
  webcodecs.stopAllDecoders()
  webrtc.closeAll()
  signaling.disconnect()
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
})
</script>
