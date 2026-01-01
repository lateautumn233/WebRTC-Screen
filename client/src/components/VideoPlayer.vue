<template>
  <div
    ref="containerRef"
    class="relative bg-black rounded-xl overflow-hidden shadow-lg"
    :class="{ 'fixed inset-0 z-50 rounded-none': isFullscreen || isPageFullscreen }"
  >
    <!-- 视频/Canvas 容器 -->
    <div
      class="bg-gray-900 flex items-center justify-center"
      :class="(isFullscreen || isPageFullscreen) ? 'w-full h-full' : 'aspect-video'"
    >
      <!-- 本地预览 (video 元素) -->
      <video
        v-if="mode === 'preview'"
        ref="videoRef"
        autoplay
        muted
        playsinline
        class="w-full h-full object-contain"
      ></video>

      <!-- 远程播放 (canvas 元素) -->
      <canvas
        v-else-if="mode === 'playback'"
        ref="canvasRef"
        class="w-full h-full object-contain"
      ></canvas>

      <!-- 占位符 -->
      <div v-else class="text-gray-500 flex flex-col items-center gap-2">
        <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span class="text-sm">{{ placeholder }}</span>
      </div>
    </div>

    <!-- 状态指示器 -->
    <div v-if="showStatus" class="absolute top-3 left-3 flex items-center gap-2">
      <div
        :class="[
          'px-2 py-1 rounded text-xs font-medium flex items-center gap-1',
          statusClass
        ]"
      >
        <div class="w-2 h-2 rounded-full bg-current animate-pulse"></div>
        {{ statusText }}
      </div>
    </div>

    <!-- 全屏按钮组 -->
    <div v-if="mode === 'playback'" class="absolute top-3 right-3 flex gap-2">
      <!-- 网页全屏按钮 -->
      <button
        @click="togglePageFullscreen"
        class="p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white transition-colors"
        :title="isPageFullscreen ? '退出网页全屏' : '网页全屏'"
      >
        <svg v-if="!isPageFullscreen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" stroke-width="2" />
        </svg>
      </button>

      <!-- 浏览器全屏按钮 -->
      <button
        @click="toggleFullscreen"
        class="p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white transition-colors"
        :title="isFullscreen ? '退出全屏' : '全屏播放'"
      >
        <svg v-if="!isFullscreen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
        </svg>
      </button>
    </div>

    <!-- 统计信息面板 -->
    <div v-if="showStats && stats && !isFullscreen && !isPageFullscreen" class="absolute bottom-3 left-3 right-3">
      <div class="bg-black/70 backdrop-blur rounded-lg px-4 py-3">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <!-- 分辨率 -->
          <div class="flex flex-col">
            <span class="text-gray-500">分辨率</span>
            <span class="text-white font-medium">{{ stats.resolution }}</span>
          </div>
          <!-- 帧率 -->
          <div class="flex flex-col">
            <span class="text-gray-500">帧率</span>
            <span class="text-green-400 font-medium">{{ stats.fps }} fps</span>
          </div>
          <!-- 码率 -->
          <div class="flex flex-col">
            <span class="text-gray-500">码率</span>
            <span class="text-blue-400 font-medium">{{ stats.bitrate }}</span>
          </div>
          <!-- 解码器 -->
          <div class="flex flex-col">
            <span class="text-gray-500">解码器</span>
            <span class="text-purple-400 font-medium">{{ stats.codec }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 全屏模式下的退出提示 -->
    <div
      v-if="isFullscreen || isPageFullscreen"
      class="absolute top-3 left-1/2 -translate-x-1/2 bg-black/50 px-3 py-1 rounded text-white text-xs opacity-0 hover:opacity-100 transition-opacity"
    >
      {{ isFullscreen ? '按 ESC 退出全屏' : '点击按钮退出网页全屏' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api as fullscreen } from 'vue-fullscreen'

interface Props {
  mode: 'preview' | 'playback' | 'idle'
  stream?: MediaStream | null
  placeholder?: string
  showStatus?: boolean
  showStats?: boolean
  status?: 'idle' | 'connecting' | 'streaming' | 'error'
}

interface Stats {
  resolution: string
  fps: string
  bitrate: string
  codec: string
}

const props = withDefaults(defineProps<Props>(), {
  stream: null,
  placeholder: '等待视频...',
  showStatus: false,
  showStats: false,
  status: 'idle'
})

const containerRef = ref<HTMLDivElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stats = ref<Stats | null>(null)
const isFullscreen = ref(false)
const isPageFullscreen = ref(false)

// Canvas 上下文
let ctx: CanvasRenderingContext2D | null = null
let animationId: number | null = null

// 码率统计
let totalBytes = 0
let lastBitrateUpdate = 0
let currentBitrate = 0
let currentCodec = '-'

// 状态显示
const statusClass = computed(() => {
  switch (props.status) {
    case 'streaming':
      return 'bg-red-600 text-white'
    case 'connecting':
      return 'bg-yellow-600 text-white'
    case 'error':
      return 'bg-red-800 text-white'
    default:
      return 'bg-gray-600 text-white'
  }
})

const statusText = computed(() => {
  switch (props.status) {
    case 'streaming':
      return 'LIVE'
    case 'connecting':
      return '连接中...'
    case 'error':
      return '错误'
    default:
      return '就绪'
  }
})

// 监听 stream 变化，更新 video 元素
watch(
  () => props.stream,
  (newStream) => {
    if (videoRef.value && newStream) {
      videoRef.value.srcObject = newStream
    }
  },
  { immediate: true }
)

// 全屏切换
function toggleFullscreen() {
  if (!containerRef.value) return

  if (!isFullscreen.value) {
    if (containerRef.value.requestFullscreen) {
      containerRef.value.requestFullscreen()
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }
}

// 网页全屏切换
async function togglePageFullscreen() {
  if (!containerRef.value) return

  await fullscreen.toggle(containerRef.value, {
    pageOnly: true,
    callback: (isFs: boolean) => {
      isPageFullscreen.value = isFs
    }
  })
}

// 监听全屏变化
function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

// 暴露方法给父组件
function setStream(stream: MediaStream) {
  if (videoRef.value) {
    videoRef.value.srcObject = stream
  }
}

function drawFrame(frame: VideoFrame) {
  if (!canvasRef.value || !ctx) {
    if (canvasRef.value) {
      ctx = canvasRef.value.getContext('2d')
      if (!ctx) {
        frame.close()
        return
      }
    } else {
      frame.close()
      return
    }
  }

  // 先获取尺寸信息
  const width = frame.displayWidth
  const height = frame.displayHeight

  // 调整 canvas 大小以匹配帧
  if (canvasRef.value.width !== width || canvasRef.value.height !== height) {
    canvasRef.value.width = width
    canvasRef.value.height = height
  }

  ctx.drawImage(frame, 0, 0)
  frame.close()

  // 更新统计
  updateStats(width, height)
}

// 更新接收数据量（用于计算码率）
function addReceivedBytes(bytes: number) {
  totalBytes += bytes
}

// 设置当前解码器
function setCodec(codec: string) {
  // 解析 codec 字符串为更友好的显示
  if (codec.startsWith('avc1') || codec.startsWith('avc')) {
    currentCodec = 'H.264'
  } else if (codec.startsWith('hvc1') || codec.startsWith('hev1') || codec.startsWith('hevc')) {
    currentCodec = 'HEVC'
  } else if (codec.startsWith('vp8')) {
    currentCodec = 'VP8'
  } else if (codec.startsWith('vp09') || codec.startsWith('vp9')) {
    currentCodec = 'VP9'
  } else if (codec.startsWith('av01') || codec.startsWith('av1')) {
    currentCodec = 'AV1'
  } else {
    currentCodec = codec
  }
}

let frameCount = 0
let lastFpsUpdate = 0
let currentFps = 0

function updateStats(width: number, height: number) {
  frameCount++
  const now = performance.now()

  if (now - lastFpsUpdate >= 1000) {
    currentFps = Math.round(frameCount * 1000 / (now - lastFpsUpdate))
    frameCount = 0
    lastFpsUpdate = now
  }

  // 计算码率
  if (now - lastBitrateUpdate >= 1000) {
    currentBitrate = Math.round(totalBytes * 8 / 1000 / ((now - lastBitrateUpdate) / 1000)) // kbps
    totalBytes = 0
    lastBitrateUpdate = now
  }

  // 格式化码率显示
  let bitrateStr = '-'
  if (currentBitrate > 0) {
    if (currentBitrate > 1000) {
      bitrateStr = `${(currentBitrate / 1000).toFixed(1)} Mbps`
    } else {
      bitrateStr = `${currentBitrate} kbps`
    }
  }

  stats.value = {
    resolution: `${width}x${height}`,
    fps: `${currentFps}`,
    bitrate: bitrateStr,
    codec: currentCodec
  }
}

function clearCanvas() {
  if (canvasRef.value && ctx) {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  }
  // 重置统计
  stats.value = null
  totalBytes = 0
  currentBitrate = 0
  currentFps = 0
  frameCount = 0
}

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext('2d')
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

defineExpose({
  setStream,
  drawFrame,
  clearCanvas,
  addReceivedBytes,
  setCodec
})
</script>
