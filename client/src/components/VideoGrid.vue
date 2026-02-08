<template>
  <div class="grid gap-4" :class="gridClass">
    <!-- 自己的共享预览 -->
    <div v-if="localStream" class="relative bg-black rounded-xl overflow-hidden aspect-video">
      <video
        ref="localVideoRef"
        autoplay
        muted
        playsinline
        class="w-full h-full object-contain"
      ></video>
      <div class="absolute top-2 left-2 px-2 py-1 bg-blue-600 rounded text-xs text-white font-medium">
        我的共享
      </div>
    </div>

    <!-- 远程共享者的视频 -->
    <div
      v-for="sharer in remoteSharers"
      :key="sharer.id"
      class="relative bg-black rounded-xl overflow-hidden aspect-video"
    >
      <canvas
        :ref="(el) => setCanvasRef(sharer.id, el as HTMLCanvasElement)"
        class="w-full h-full object-contain"
      ></canvas>
      <div class="absolute top-2 left-2 px-2 py-1 bg-green-600 rounded text-xs text-white font-medium">
        {{ sharer.label || sharer.id.substring(0, 8) }}
      </div>
      <!-- 统计信息 -->
      <div v-if="sharerStats.get(sharer.id)" class="absolute bottom-2 left-2 right-2">
        <div class="bg-black/70 backdrop-blur rounded-lg px-3 py-2">
          <div class="flex gap-4 text-xs">
            <span class="text-gray-400">{{ sharerStats.get(sharer.id)?.resolution }}</span>
            <span class="text-green-400">{{ sharerStats.get(sharer.id)?.fps }} fps</span>
            <span class="text-blue-400">{{ sharerStats.get(sharer.id)?.bitrate }}</span>
          </div>
        </div>
      </div>
      <audio
        :ref="(el) => setAudioRef(sharer.id, el as HTMLAudioElement)"
        autoplay
        class="hidden"
      ></audio>
    </div>

    <!-- 空状态 -->
    <div
      v-if="!localStream && remoteSharers.length === 0"
      class="col-span-full flex items-center justify-center aspect-video bg-gray-900 rounded-xl"
    >
      <div class="text-gray-500 flex flex-col items-center gap-2">
        <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span class="text-sm">{{ placeholder }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onUnmounted } from 'vue'

interface SharerInfo {
  id: string
  label?: string
}

interface SharerStats {
  resolution: string
  fps: string
  bitrate: string
}

const props = withDefaults(defineProps<{
  localStream: MediaStream | null
  remoteSharers: SharerInfo[]
  placeholder?: string
}>(), {
  placeholder: '暂无共享画面'
})

const localVideoRef = ref<HTMLVideoElement | null>(null)

// 动态网格布局
const gridClass = computed(() => {
  const total = (props.localStream ? 1 : 0) + props.remoteSharers.length
  if (total <= 1) return 'grid-cols-1'
  if (total <= 2) return 'grid-cols-1 lg:grid-cols-2'
  if (total <= 4) return 'grid-cols-2'
  return 'grid-cols-2 lg:grid-cols-3'
})

// Canvas 和 Audio 引用管理
const canvasRefs = new Map<string, HTMLCanvasElement>()
const canvasCtxs = new Map<string, CanvasRenderingContext2D>()
const audioRefs = new Map<string, HTMLAudioElement>()

// 统计信息
const sharerStats = reactive(new Map<string, SharerStats>())
const sharerFrameCounts = new Map<string, number>()
const sharerLastFpsUpdate = new Map<string, number>()
const sharerCurrentFps = new Map<string, number>()
const sharerTotalBytes = new Map<string, number>()
const sharerLastBitrateUpdate = new Map<string, number>()
const sharerCurrentBitrate = new Map<string, number>()

function setCanvasRef(sharerId: string, el: HTMLCanvasElement | null) {
  if (el) {
    canvasRefs.set(sharerId, el)
    const ctx = el.getContext('2d')
    if (ctx) {
      canvasCtxs.set(sharerId, ctx)
    }
  }
}

function setAudioRef(sharerId: string, el: HTMLAudioElement | null) {
  if (el) {
    audioRefs.set(sharerId, el)
  }
}

// 监听 localStream 变化
watch(
  () => props.localStream,
  (newStream) => {
    if (localVideoRef.value && newStream) {
      localVideoRef.value.srcObject = newStream
    }
  },
  { immediate: true }
)

// 绘制远程帧
function drawFrame(sharerId: string, frame: VideoFrame) {
  const canvas = canvasRefs.get(sharerId)
  let ctx = canvasCtxs.get(sharerId)

  if (!canvas) {
    frame.close()
    return
  }

  if (!ctx) {
    ctx = canvas.getContext('2d') ?? undefined
    if (ctx) {
      canvasCtxs.set(sharerId, ctx)
    } else {
      frame.close()
      return
    }
  }

  const width = frame.displayWidth
  const height = frame.displayHeight

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  ctx.drawImage(frame, 0, 0)
  frame.close()

  // 更新统计
  updateStats(sharerId, width, height)
}

function updateStats(sharerId: string, width: number, height: number) {
  const now = performance.now()

  // FPS
  const frameCount = (sharerFrameCounts.get(sharerId) ?? 0) + 1
  sharerFrameCounts.set(sharerId, frameCount)

  const lastFps = sharerLastFpsUpdate.get(sharerId) ?? now
  if (now - lastFps >= 1000) {
    sharerCurrentFps.set(sharerId, Math.round(frameCount * 1000 / (now - lastFps)))
    sharerFrameCounts.set(sharerId, 0)
    sharerLastFpsUpdate.set(sharerId, now)
  }

  // Bitrate
  const lastBitrate = sharerLastBitrateUpdate.get(sharerId) ?? now
  const totalBytes = sharerTotalBytes.get(sharerId) ?? 0
  if (now - lastBitrate >= 1000) {
    sharerCurrentBitrate.set(sharerId, Math.round(totalBytes * 8 / 1000 / ((now - lastBitrate) / 1000)))
    sharerTotalBytes.set(sharerId, 0)
    sharerLastBitrateUpdate.set(sharerId, now)
  }

  const currentBitrate = sharerCurrentBitrate.get(sharerId) ?? 0
  let bitrateStr = '-'
  if (currentBitrate > 0) {
    bitrateStr = currentBitrate > 1000
      ? `${(currentBitrate / 1000).toFixed(1)} Mbps`
      : `${currentBitrate} kbps`
  }

  sharerStats.set(sharerId, {
    resolution: `${width}x${height}`,
    fps: `${sharerCurrentFps.get(sharerId) ?? 0}`,
    bitrate: bitrateStr
  })
}

// 添加接收字节数（用于码率统计）
function addReceivedBytes(sharerId: string, bytes: number) {
  const current = sharerTotalBytes.get(sharerId) ?? 0
  sharerTotalBytes.set(sharerId, current + bytes)
}

// 设置远程音频流
function setAudioStream(sharerId: string, stream: MediaStream) {
  const audio = audioRefs.get(sharerId)
  if (audio) {
    audio.srcObject = stream
    audio.play().catch(() => {})
  }
}

// 清理特定共享者
function clearSharer(sharerId: string) {
  const canvas = canvasRefs.get(sharerId)
  const ctx = canvasCtxs.get(sharerId)
  if (canvas && ctx) {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  canvasRefs.delete(sharerId)
  canvasCtxs.delete(sharerId)
  audioRefs.delete(sharerId)
  sharerStats.delete(sharerId)
  sharerFrameCounts.delete(sharerId)
  sharerLastFpsUpdate.delete(sharerId)
  sharerCurrentFps.delete(sharerId)
  sharerTotalBytes.delete(sharerId)
  sharerLastBitrateUpdate.delete(sharerId)
  sharerCurrentBitrate.delete(sharerId)
}

onUnmounted(() => {
  canvasRefs.clear()
  canvasCtxs.clear()
  audioRefs.clear()
  sharerStats.clear()
})

defineExpose({
  drawFrame,
  setAudioStream,
  addReceivedBytes,
  clearSharer
})
</script>
