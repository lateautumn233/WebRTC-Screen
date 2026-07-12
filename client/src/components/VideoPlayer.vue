<template>
  <div
    ref="containerRef"
    class="relative surface rounded-2xl overflow-hidden"
    :class="{ 'fixed inset-0 z-50 rounded-none': isFullscreen || isPageFullscreen }"
  >
    <!-- 视频/Canvas 容器 -->
    <div
      class="bg-black flex items-center justify-center"
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
      <div v-else class="text-slate-500 flex flex-col items-center gap-2">
        <svg class="w-14 h-14 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span class="text-sm">{{ placeholder }}</span>
      </div>
    </div>

    <!-- 状态指示器 -->
    <div v-if="showStatus" class="absolute top-3 left-3 flex items-center gap-2">
      <div
        :class="[
          'px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5',
          statusClass
        ]"
      >
        <div class="w-2 h-2 rounded-full bg-current animate-pulse"></div>
        {{ statusText }}
      </div>
    </div>

    <!-- 全屏按钮组 -->
    <div v-if="mode === 'playback'" class="absolute top-3 right-3 flex gap-2">
      <!-- 统计信息切换按钮 -->
      <button
        v-if="showStats"
        @click="statsVisible = !statsVisible"
        class="p-2 bg-black/55 hover:bg-black/75 rounded-md text-slate-200 transition-colors"
        :title="statsVisible ? '隐藏统计信息' : '显示统计信息'"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" :class="{ 'opacity-40': !statsVisible }">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>

      <!-- 网页全屏按钮 -->
      <button
        @click="togglePageFullscreen"
        class="p-2 bg-black/55 hover:bg-black/75 rounded-md text-slate-200 transition-colors"
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
        class="p-2 bg-black/55 hover:bg-black/75 rounded-md text-slate-200 transition-colors"
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

    <!-- 统计信息面板：半透明纯色，无 backdrop-filter，避免视频区 GPU 合成开销；移动端收窄内边距/字号并限高，避免遮挡画面 -->
    <div v-if="showStats && statsVisible && stats && !isFullscreen && !isPageFullscreen" class="absolute bottom-1.5 left-1.5 right-1.5 sm:bottom-3 sm:left-3 sm:right-3">
      <div class="bg-black/55 rounded-lg sm:rounded-xl px-2 py-1.5 sm:px-4 sm:py-3 space-y-1 sm:space-y-2 max-h-[40%] overflow-y-auto">
        <!-- 第一行：媒体信息 -->
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:gap-4 text-[11px] sm:text-xs">
          <div class="flex items-center gap-1.5">
            <span class="text-slate-500">分辨率</span>
            <span class="text-slate-200 font-medium">{{ stats.resolution }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-slate-500">编解码器</span>
            <span class="text-violet-300 font-medium">{{ stats.codec }}</span>
          </div>
          <div v-if="natType" class="flex items-center gap-1.5">
            <span class="text-slate-500">对方 NAT</span>
            <span :class="['px-1.5 py-0.5 rounded font-medium', NAT_TYPE_BADGE_CLASS_MAP[natType]]">{{ NAT_TYPE_LABEL_MAP[natType] }}</span>
          </div>
          <div v-if="connectionType && connectionType !== 'unknown'" class="flex items-center gap-1.5">
            <span class="text-slate-500">连接方式</span>
            <span
              :class="[
                'px-1.5 py-0.5 rounded font-medium',
                connectionType === 'relay'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              ]"
            >
              {{ connectionType === 'relay' ? '中转' : '直连' }}
            </span>
          </div>
        </div>
        <!-- 分隔线 -->
        <div class="border-t border-white/10"></div>
        <!-- 第二行：性能指标 -->
        <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
          <div class="flex flex-col">
            <span class="text-slate-500">帧率</span>
            <span class="text-emerald-300 font-medium">{{ stats.fps }} fps</span>
          </div>
          <div class="flex flex-col">
            <span class="text-slate-500">码率</span>
            <span class="text-sky-300 font-medium">{{ stats.bitrate }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-slate-500">编码</span>
            <span class="text-amber-300 font-medium">{{ stats.encodeLatency }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-slate-500">解码</span>
            <span class="text-orange-300 font-medium">{{ stats.decodeLatency }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-slate-500">网络</span>
            <span class="text-rose-300 font-medium">{{ stats.networkLatency }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 全屏模式下的退出提示 -->
    <div
      v-if="isFullscreen || isPageFullscreen"
      class="absolute top-3 left-1/2 -translate-x-1/2 bg-black/55 px-3 py-1 rounded-md text-slate-200 text-xs opacity-0 hover:opacity-100 transition-opacity"
    >
      {{ isFullscreen ? '按 ESC 退出全屏' : '点击按钮退出网页全屏' }}
    </div>

    <!-- 隐藏的音频播放器 -->
    <audio ref="audioRef" autoplay class="hidden"></audio>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api as fullscreen } from 'vue-fullscreen'
import type { NatType, MediaRouteType } from '../types'
import { NAT_TYPE_LABEL_MAP, NAT_TYPE_BADGE_CLASS_MAP } from '../types'

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
  encodeLatency: string
  decodeLatency: string
  networkLatency: string
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
const audioRef = ref<HTMLAudioElement | null>(null)
const stats = ref<Stats | null>(null)
// 对端 NAT 类型：离散的瞬时值，不纳入下方 250ms EMA 刷新循环
const natType = ref<NatType | null>(null)
// 当前媒体链路类型（直连/中转）：同样是离散的瞬时值，由父组件轮询 getStats() 后推入
const connectionType = ref<MediaRouteType | null>(null)
const statsVisible = ref(true)
const isFullscreen = ref(false)
const isPageFullscreen = ref(false)

// Canvas 上下文
let ctx: CanvasRenderingContext2D | null = null
let animationId: number | null = null

// 码率统计
let totalBytes = 0
let currentBitrate = 0
let currentCodec = '-'

// 延迟追踪：回调只累加原始采样，EMA 平滑统一在 250ms 定时器里对窗口均值做一次，
// 避免高帧率下每帧都做一次 EMA 导致平滑时间常数被帧率稀释、观感仍然跳动
let currentEncodeLatency = 0
let currentDecodeLatency = 0
let currentNetworkLatency = 0
let encodeLatencySum = 0
let encodeLatencyCount = 0
let decodeLatencySum = 0
let decodeLatencyCount = 0
let networkLatencySum = 0
let networkLatencyCount = 0
const EMA_ALPHA = 0.3

function emaSmooth(current: number, newValue: number): number {
  if (current === 0) return newValue
  return current * (1 - EMA_ALPHA) + newValue * EMA_ALPHA
}

// 状态显示
const statusClass = computed(() => {
  switch (props.status) {
    case 'streaming':
      return 'bg-rose-500/90 text-white'
    case 'connecting':
      return 'bg-amber-500/90 text-white'
    case 'error':
      return 'bg-rose-700/90 text-white'
    default:
      return 'bg-slate-700/80 text-slate-300'
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

function drawFrame(frame: VideoFrame, decodeLatencyMs?: number) {
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

  // 解码延迟：仅累加采样，平滑在定时器里做
  if (decodeLatencyMs !== undefined && decodeLatencyMs > 0) {
    decodeLatencySum += decodeLatencyMs
    decodeLatencyCount++
  }

  // 帧回调只累加原始数据，统计面板由定时器按固定节奏刷新
  frameCount++
  lastFrameWidth = width
  lastFrameHeight = height
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

// 设置编码延迟（从发送端传来，仅累加采样，平滑在定时器里做）
function setEncodeLatency(latencyMs: number) {
  encodeLatencySum += latencyMs
  encodeLatencyCount++
}

// 设置网络延迟（RTT / 2，仅累加采样，平滑在定时器里做）
function setNetworkLatency(latencyMs: number) {
  networkLatencySum += latencyMs
  networkLatencyCount++
}

// 设置对端 NAT 类型
function setNatType(nat: NatType) {
  natType.value = nat
}

// 设置当前媒体链路类型
function setConnectionType(type: MediaRouteType) {
  connectionType.value = type
}

let frameCount = 0
let currentFps = 0
let lastFrameWidth = 0
let lastFrameHeight = 0

// 统计面板固定 250ms 刷新，与帧渲染解耦：帧率/码率按短窗口采样后 EMA 平滑，数值平缓过渡
const STATS_REFRESH_MS = 250
let statsTimer: ReturnType<typeof setInterval> | null = null
let lastStatsRefresh = 0

function refreshStats() {
  const now = performance.now()
  const elapsed = now - lastStatsRefresh
  lastStatsRefresh = now
  if (lastFrameWidth === 0 || elapsed <= 0) return

  currentFps = emaSmooth(currentFps, frameCount * 1000 / elapsed)
  frameCount = 0

  currentBitrate = emaSmooth(currentBitrate, totalBytes * 8 / elapsed) // kbps
  totalBytes = 0

  // 格式化码率显示
  let bitrateStr = '-'
  if (currentBitrate >= 1) {
    if (currentBitrate > 1000) {
      bitrateStr = `${(currentBitrate / 1000).toFixed(1)} Mbps`
    } else {
      bitrateStr = `${Math.round(currentBitrate)} kbps`
    }
  }

  // 延迟：窗口内有采样才更新，无采样时保留上次的值（不像 fps/码率那样衰减到 0）
  if (encodeLatencyCount > 0) {
    currentEncodeLatency = emaSmooth(currentEncodeLatency, encodeLatencySum / encodeLatencyCount)
    encodeLatencySum = 0
    encodeLatencyCount = 0
  }
  if (decodeLatencyCount > 0) {
    currentDecodeLatency = emaSmooth(currentDecodeLatency, decodeLatencySum / decodeLatencyCount)
    decodeLatencySum = 0
    decodeLatencyCount = 0
  }
  if (networkLatencyCount > 0) {
    currentNetworkLatency = emaSmooth(currentNetworkLatency, networkLatencySum / networkLatencyCount)
    networkLatencySum = 0
    networkLatencyCount = 0
  }

  stats.value = {
    resolution: `${lastFrameWidth}x${lastFrameHeight}`,
    fps: `${Math.round(currentFps)}`,
    bitrate: bitrateStr,
    codec: currentCodec,
    encodeLatency: currentEncodeLatency > 0 ? `${currentEncodeLatency.toFixed(1)} ms` : '-',
    decodeLatency: currentDecodeLatency > 0 ? `${currentDecodeLatency.toFixed(1)} ms` : '-',
    networkLatency: currentNetworkLatency > 0 ? `${currentNetworkLatency.toFixed(1)} ms` : '-'
  }
}

function clearCanvas() {
  if (canvasRef.value && ctx) {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  }
  // 重置统计
  stats.value = null
  natType.value = null
  connectionType.value = null
  totalBytes = 0
  currentBitrate = 0
  currentFps = 0
  frameCount = 0
  lastFrameWidth = 0
  lastFrameHeight = 0
  currentEncodeLatency = 0
  currentDecodeLatency = 0
  currentNetworkLatency = 0
  encodeLatencySum = 0
  encodeLatencyCount = 0
  decodeLatencySum = 0
  decodeLatencyCount = 0
  networkLatencySum = 0
  networkLatencyCount = 0
}

// 设置远程音频流
function setAudioStream(stream: MediaStream) {
  if (audioRef.value) {
    audioRef.value.srcObject = stream
    // 尝试自动播放，处理浏览器自动播放策略
    audioRef.value.play().catch((err) => {
      console.warn('Auto-play blocked, user interaction required:', err)
    })
  }
}

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext('2d')
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  // mode 可能在挂载后才切到 playback，定时器常开，无帧时 refreshStats 直接返回
  lastStatsRefresh = performance.now()
  statsTimer = setInterval(refreshStats, STATS_REFRESH_MS)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

defineExpose({
  setStream,
  drawFrame,
  clearCanvas,
  addReceivedBytes,
  setCodec,
  setAudioStream,
  setEncodeLatency,
  setNetworkLatency,
  setNatType,
  setConnectionType
})
</script>
