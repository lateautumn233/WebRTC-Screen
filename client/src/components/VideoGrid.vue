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
      :ref="(el) => setContainerRef(sharer.id, el as HTMLElement)"
      class="relative bg-black rounded-xl overflow-hidden"
      :class="[
        isFullscreenSharer === sharer.id || isPageFullscreenSharer === sharer.id
          ? 'fixed inset-0 z-50 rounded-none'
          : 'aspect-video'
      ]"
    >
      <div
        class="bg-gray-900 flex items-center justify-center"
        :class="(isFullscreenSharer === sharer.id || isPageFullscreenSharer === sharer.id) ? 'w-full h-full' : 'aspect-video'"
      >
        <canvas
          :ref="(el) => setCanvasRef(sharer.id, el as HTMLCanvasElement)"
          class="w-full h-full object-contain"
        ></canvas>
      </div>

      <!-- 标签 -->
      <div class="absolute top-2 left-2 px-2 py-1 bg-green-600 rounded text-xs text-white font-medium">
        {{ sharer.label || sharer.id.substring(0, 8) }}
      </div>

      <!-- 全屏按钮组 -->
      <div class="absolute top-2 right-2 flex gap-2">
        <!-- 网页全屏按钮 -->
        <button
          @click="togglePageFullscreen(sharer.id)"
          class="p-1.5 bg-black/50 hover:bg-black/70 rounded-lg text-white transition-colors"
          :title="isPageFullscreenSharer === sharer.id ? '退出网页全屏' : '网页全屏'"
        >
          <svg v-if="isPageFullscreenSharer !== sharer.id" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" stroke-width="2" />
          </svg>
        </button>
        <!-- 浏览器全屏按钮 -->
        <button
          @click="toggleFullscreen(sharer.id)"
          class="p-1.5 bg-black/50 hover:bg-black/70 rounded-lg text-white transition-colors"
          :title="isFullscreenSharer === sharer.id ? '退出全屏' : '全屏播放'"
        >
          <svg v-if="isFullscreenSharer !== sharer.id" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
        </button>
      </div>

      <!-- 全屏退出提示 -->
      <div
        v-if="isFullscreenSharer === sharer.id || isPageFullscreenSharer === sharer.id"
        class="absolute top-3 left-1/2 -translate-x-1/2 bg-black/50 px-3 py-1 rounded text-white text-xs opacity-0 hover:opacity-100 transition-opacity"
      >
        {{ isFullscreenSharer === sharer.id ? '按 ESC 退出全屏' : '点击按钮退出网页全屏' }}
      </div>

      <!-- 统计信息 -->
      <div
        v-if="sharerStats.get(sharer.id) && isFullscreenSharer !== sharer.id && isPageFullscreenSharer !== sharer.id"
        class="absolute bottom-2 left-2 right-2"
      >
        <div class="bg-black/70 backdrop-blur rounded-lg px-3 py-2">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div class="flex flex-col">
              <span class="text-gray-500">分辨率</span>
              <span class="text-white font-medium">{{ sharerStats.get(sharer.id)?.resolution }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-gray-500">帧率</span>
              <span class="text-green-400 font-medium">{{ sharerStats.get(sharer.id)?.fps }} fps</span>
            </div>
            <div class="flex flex-col">
              <span class="text-gray-500">码率</span>
              <span class="text-blue-400 font-medium">{{ sharerStats.get(sharer.id)?.bitrate }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-gray-500">解码器</span>
              <span class="text-purple-400 font-medium">{{ sharerStats.get(sharer.id)?.codec }}</span>
            </div>
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
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue'
import { api as fullscreen } from 'vue-fullscreen'

interface SharerInfo {
  id: string
  label?: string
}

interface SharerStats {
  resolution: string
  fps: string
  bitrate: string
  codec: string
}

const props = withDefaults(defineProps<{
  localStream: MediaStream | null
  remoteSharers: SharerInfo[]
  placeholder?: string
}>(), {
  placeholder: '暂无共享画面'
})

const localVideoRef = ref<HTMLVideoElement | null>(null)
const isFullscreenSharer = ref<string | null>(null)
const isPageFullscreenSharer = ref<string | null>(null)

// 动态网格布局
const gridClass = computed(() => {
  const total = (props.localStream ? 1 : 0) + props.remoteSharers.length
  if (total <= 1) return 'grid-cols-1'
  if (total <= 2) return 'grid-cols-1 lg:grid-cols-2'
  if (total <= 4) return 'grid-cols-2'
  return 'grid-cols-2 lg:grid-cols-3'
})

// Canvas、Audio、Container 引用管理
const containerRefs = new Map<string, HTMLElement>()
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
const sharerCodecs = new Map<string, string>()

function setContainerRef(sharerId: string, el: HTMLElement | null) {
  if (el) {
    containerRefs.set(sharerId, el)
  }
}

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

// 浏览器全屏切换
function toggleFullscreen(sharerId: string) {
  const container = containerRefs.get(sharerId)
  if (!container) return

  if (isFullscreenSharer.value !== sharerId) {
    if (container.requestFullscreen) {
      container.requestFullscreen()
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }
}

// 网页全屏切换
async function togglePageFullscreen(sharerId: string) {
  const container = containerRefs.get(sharerId)
  if (!container) return

  await fullscreen.toggle(container, {
    pageOnly: true,
    callback: (isFs: boolean) => {
      isPageFullscreenSharer.value = isFs ? sharerId : null
    }
  })
}

// 监听浏览器全屏变化
function handleFullscreenChange() {
  if (!document.fullscreenElement) {
    isFullscreenSharer.value = null
  } else {
    // 找到哪个 sharer 的容器进入了全屏
    for (const [sharerId, container] of containerRefs) {
      if (container === document.fullscreenElement) {
        isFullscreenSharer.value = sharerId
        break
      }
    }
  }
}

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

  if (!sharerLastFpsUpdate.has(sharerId)) {
    sharerLastFpsUpdate.set(sharerId, now)
  } else {
    const lastFps = sharerLastFpsUpdate.get(sharerId)!
    const elapsed = now - lastFps
    if (elapsed >= 1000) {
      sharerCurrentFps.set(sharerId, Math.round(frameCount * 1000 / elapsed))
      sharerFrameCounts.set(sharerId, 0)
      sharerLastFpsUpdate.set(sharerId, now)
    }
  }

  // Bitrate
  if (!sharerLastBitrateUpdate.has(sharerId)) {
    sharerLastBitrateUpdate.set(sharerId, now)
  } else {
    const lastBitrate = sharerLastBitrateUpdate.get(sharerId)!
    const elapsed = now - lastBitrate
    const totalBytes = sharerTotalBytes.get(sharerId) ?? 0
    if (elapsed >= 1000) {
      sharerCurrentBitrate.set(sharerId, Math.round(totalBytes * 8 / 1000 / (elapsed / 1000)))
      sharerTotalBytes.set(sharerId, 0)
      sharerLastBitrateUpdate.set(sharerId, now)
    }
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
    bitrate: bitrateStr,
    codec: sharerCodecs.get(sharerId) ?? '-'
  })
}

// 设置编码器信息
function setCodec(sharerId: string, codec: string) {
  if (codec.startsWith('avc1') || codec.startsWith('avc')) {
    sharerCodecs.set(sharerId, 'H.264')
  } else if (codec.startsWith('hvc1') || codec.startsWith('hev1') || codec.startsWith('hevc')) {
    sharerCodecs.set(sharerId, 'HEVC')
  } else if (codec.startsWith('vp8')) {
    sharerCodecs.set(sharerId, 'VP8')
  } else if (codec.startsWith('vp09') || codec.startsWith('vp9')) {
    sharerCodecs.set(sharerId, 'VP9')
  } else if (codec.startsWith('av01') || codec.startsWith('av1')) {
    sharerCodecs.set(sharerId, 'AV1')
  } else {
    sharerCodecs.set(sharerId, codec)
  }
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
  containerRefs.delete(sharerId)
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
  sharerCodecs.delete(sharerId)
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  canvasRefs.clear()
  canvasCtxs.clear()
  audioRefs.clear()
  sharerStats.clear()
})

defineExpose({
  drawFrame,
  setAudioStream,
  addReceivedBytes,
  setCodec,
  clearSharer
})
</script>
