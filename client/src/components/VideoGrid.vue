<template>
  <div class="grid gap-4" :class="gridClass">
    <!-- 自己的共享预览 -->
    <div v-if="localStream" class="relative surface rounded-2xl overflow-hidden aspect-video bg-black">
      <video
        ref="localVideoRef"
        autoplay
        muted
        playsinline
        class="w-full h-full object-contain"
      ></video>
      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-sky-500/90 text-[11px] text-white font-semibold">
        我的共享
      </div>
    </div>

    <!-- 远程共享者的视频 -->
    <div
      v-for="sharer in remoteSharers"
      :key="sharer.id"
      :ref="(el) => setContainerRef(sharer.id, el as HTMLElement)"
      class="relative surface rounded-2xl overflow-hidden"
      :class="[
        isFullscreenSharer === sharer.id || isPageFullscreenSharer === sharer.id
          ? 'fixed inset-0 z-50 rounded-none'
          : 'aspect-video'
      ]"
    >
      <div
        class="bg-black flex items-center justify-center"
        :class="(isFullscreenSharer === sharer.id || isPageFullscreenSharer === sharer.id) ? 'w-full h-full' : 'aspect-video'"
      >
        <canvas
          :ref="(el) => setCanvasRef(sharer.id, el as HTMLCanvasElement)"
          class="w-full h-full object-contain"
        ></canvas>
      </div>

      <!-- 标签 -->
      <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-emerald-500/90 text-[11px] text-white font-semibold">
        {{ sharer.label || sharer.id.substring(0, 8) }}
      </div>

      <!-- 全屏按钮组 -->
      <div class="absolute top-2.5 right-2.5 flex gap-1.5">
        <!-- 统计信息切换按钮 -->
        <button
          @click="showStats = !showStats"
          class="p-1.5 bg-black/55 hover:bg-black/75 rounded-md text-slate-200 transition-colors"
          :title="showStats ? '隐藏统计信息' : '显示统计信息'"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path v-if="showStats" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" opacity="0.4" />
          </svg>
        </button>
        <!-- 网页全屏按钮 -->
        <button
          @click="togglePageFullscreen(sharer.id)"
          class="p-1.5 bg-black/55 hover:bg-black/75 rounded-md text-slate-200 transition-colors"
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
          class="p-1.5 bg-black/55 hover:bg-black/75 rounded-md text-slate-200 transition-colors"
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
        class="absolute top-3 left-1/2 -translate-x-1/2 bg-black/55 px-3 py-1 rounded-md text-slate-200 text-xs opacity-0 hover:opacity-100 transition-opacity"
      >
        {{ isFullscreenSharer === sharer.id ? '按 ESC 退出全屏' : '点击按钮退出网页全屏' }}
      </div>

      <!-- 统计信息：半透明纯色，无 backdrop-filter，避免视频区 GPU 合成开销 -->
      <div
        v-if="showStats && sharerStats.get(sharer.id) && isFullscreenSharer !== sharer.id && isPageFullscreenSharer !== sharer.id"
        class="absolute bottom-2.5 left-2.5 right-2.5"
      >
        <div class="bg-black/55 rounded-lg px-3 py-2 space-y-1.5">
          <!-- 第一行：媒体信息 -->
          <div class="flex items-center gap-3 text-xs">
            <div class="flex items-center gap-1">
              <span class="text-slate-500">分辨率</span>
              <span class="text-slate-200 font-medium">{{ sharerStats.get(sharer.id)?.resolution }}</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-slate-500">编解码器</span>
              <span class="text-violet-300 font-medium">{{ sharerStats.get(sharer.id)?.codec }}</span>
            </div>
            <div v-if="sharerNatTypes.get(sharer.id)" class="flex items-center gap-1">
              <span class="text-slate-500">对方 NAT</span>
              <span :class="['px-1.5 py-0.5 rounded font-medium', NAT_TYPE_BADGE_CLASS_MAP[sharerNatTypes.get(sharer.id)!]]">
                {{ NAT_TYPE_LABEL_MAP[sharerNatTypes.get(sharer.id)!] }}
              </span>
            </div>
            <div v-if="sharerConnectionTypes.get(sharer.id) && sharerConnectionTypes.get(sharer.id) !== 'unknown'" class="flex items-center gap-1">
              <span class="text-slate-500">连接方式</span>
              <span
                :class="[
                  'px-1.5 py-0.5 rounded font-medium',
                  sharerConnectionTypes.get(sharer.id) === 'relay'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                ]"
              >
                {{ sharerConnectionTypes.get(sharer.id) === 'relay' ? '中转' : '直连' }}
              </span>
            </div>
          </div>
          <!-- 分隔线 -->
          <div class="border-t border-white/10"></div>
          <!-- 第二行：性能指标 -->
          <div class="grid grid-cols-3 sm:grid-cols-5 gap-1 text-xs">
            <div class="flex flex-col">
              <span class="text-slate-500">帧率</span>
              <span class="text-emerald-300 font-medium">{{ sharerStats.get(sharer.id)?.fps }} fps</span>
            </div>
            <div class="flex flex-col">
              <span class="text-slate-500">码率</span>
              <span class="text-sky-300 font-medium">{{ sharerStats.get(sharer.id)?.bitrate }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-slate-500">编码</span>
              <span class="text-amber-300 font-medium">{{ sharerStats.get(sharer.id)?.encodeLatency }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-slate-500">解码</span>
              <span class="text-orange-300 font-medium">{{ sharerStats.get(sharer.id)?.decodeLatency }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-slate-500">网络</span>
              <span class="text-rose-300 font-medium">{{ sharerStats.get(sharer.id)?.networkLatency }}</span>
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
      class="col-span-full flex items-center justify-center aspect-video surface rounded-2xl"
    >
      <div class="text-slate-500 flex flex-col items-center gap-2">
        <svg class="w-14 h-14 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
import type { NatType, MediaRouteType } from '../types'
import { NAT_TYPE_LABEL_MAP, NAT_TYPE_BADGE_CLASS_MAP } from '../types'

interface SharerInfo {
  id: string
  label?: string
}

interface SharerStats {
  resolution: string
  fps: string
  bitrate: string
  codec: string
  encodeLatency: string
  decodeLatency: string
  networkLatency: string
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
const showStats = ref(false)

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
// 对端 NAT 类型：离散的瞬时值，独立于下方的 250ms EMA 刷新循环
const sharerNatTypes = reactive(new Map<string, NatType>())
// 媒体链路类型（直连/中转）：同样是离散的瞬时值，由父组件轮询 getStats() 后推入
const sharerConnectionTypes = reactive(new Map<string, MediaRouteType>())
const sharerFrameCounts = new Map<string, number>()
const sharerCurrentFps = new Map<string, number>()
const sharerTotalBytes = new Map<string, number>()
const sharerCurrentBitrate = new Map<string, number>()
const sharerResolutions = new Map<string, string>()
const sharerCodecs = new Map<string, string>()

// 延迟追踪：回调只累加原始采样，EMA 平滑统一在 250ms 定时器里对窗口均值做一次，
// 避免高帧率下每帧都做一次 EMA 导致平滑时间常数被帧率稀释、观感仍然跳动
const sharerEncodeLatency = new Map<string, number>()
const sharerDecodeLatency = new Map<string, number>()
const sharerNetworkLatency = new Map<string, number>()
const sharerEncodeLatencySum = new Map<string, number>()
const sharerEncodeLatencyCount = new Map<string, number>()
const sharerDecodeLatencySum = new Map<string, number>()
const sharerDecodeLatencyCount = new Map<string, number>()
const sharerNetworkLatencySum = new Map<string, number>()
const sharerNetworkLatencyCount = new Map<string, number>()
const EMA_ALPHA = 0.3

function emaSmooth(current: number, newValue: number): number {
  if (current === 0) return newValue
  return current * (1 - EMA_ALPHA) + newValue * EMA_ALPHA
}

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
function drawFrame(sharerId: string, frame: VideoFrame, decodeLatencyMs?: number) {
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

  // 解码延迟：仅累加采样，平滑在定时器里做
  if (decodeLatencyMs !== undefined && decodeLatencyMs > 0) {
    sharerDecodeLatencySum.set(sharerId, (sharerDecodeLatencySum.get(sharerId) ?? 0) + decodeLatencyMs)
    sharerDecodeLatencyCount.set(sharerId, (sharerDecodeLatencyCount.get(sharerId) ?? 0) + 1)
  }

  // 帧回调只累加原始数据，统计面板由定时器按固定节奏刷新
  sharerFrameCounts.set(sharerId, (sharerFrameCounts.get(sharerId) ?? 0) + 1)
  sharerResolutions.set(sharerId, `${width}x${height}`)
}

// 统计面板固定 250ms 刷新，与帧渲染解耦：帧率/码率按短窗口采样后 EMA 平滑，数值平缓过渡
const STATS_REFRESH_MS = 250
let statsTimer: ReturnType<typeof setInterval> | null = null
let lastStatsRefresh = 0

function refreshStats() {
  const now = performance.now()
  const elapsed = now - lastStatsRefresh
  lastStatsRefresh = now
  if (elapsed <= 0) return

  for (const [sharerId, resolution] of sharerResolutions) {
    const fps = emaSmooth(
      sharerCurrentFps.get(sharerId) ?? 0,
      (sharerFrameCounts.get(sharerId) ?? 0) * 1000 / elapsed
    )
    sharerCurrentFps.set(sharerId, fps)
    sharerFrameCounts.set(sharerId, 0)

    const bitrate = emaSmooth(
      sharerCurrentBitrate.get(sharerId) ?? 0,
      (sharerTotalBytes.get(sharerId) ?? 0) * 8 / elapsed // kbps
    )
    sharerCurrentBitrate.set(sharerId, bitrate)
    sharerTotalBytes.set(sharerId, 0)

    let bitrateStr = '-'
    if (bitrate >= 1) {
      bitrateStr = bitrate > 1000
        ? `${(bitrate / 1000).toFixed(1)} Mbps`
        : `${Math.round(bitrate)} kbps`
    }

    // 延迟：窗口内有采样才更新，无采样时保留上次的值（不像 fps/码率那样衰减到 0）
    const encCount = sharerEncodeLatencyCount.get(sharerId) ?? 0
    if (encCount > 0) {
      const avg = (sharerEncodeLatencySum.get(sharerId) ?? 0) / encCount
      sharerEncodeLatency.set(sharerId, emaSmooth(sharerEncodeLatency.get(sharerId) ?? 0, avg))
      sharerEncodeLatencySum.set(sharerId, 0)
      sharerEncodeLatencyCount.set(sharerId, 0)
    }
    const decCount = sharerDecodeLatencyCount.get(sharerId) ?? 0
    if (decCount > 0) {
      const avg = (sharerDecodeLatencySum.get(sharerId) ?? 0) / decCount
      sharerDecodeLatency.set(sharerId, emaSmooth(sharerDecodeLatency.get(sharerId) ?? 0, avg))
      sharerDecodeLatencySum.set(sharerId, 0)
      sharerDecodeLatencyCount.set(sharerId, 0)
    }
    const netCount = sharerNetworkLatencyCount.get(sharerId) ?? 0
    if (netCount > 0) {
      const avg = (sharerNetworkLatencySum.get(sharerId) ?? 0) / netCount
      sharerNetworkLatency.set(sharerId, emaSmooth(sharerNetworkLatency.get(sharerId) ?? 0, avg))
      sharerNetworkLatencySum.set(sharerId, 0)
      sharerNetworkLatencyCount.set(sharerId, 0)
    }

    const encLat = sharerEncodeLatency.get(sharerId) ?? 0
    const decLat = sharerDecodeLatency.get(sharerId) ?? 0
    const netLat = sharerNetworkLatency.get(sharerId) ?? 0

    sharerStats.set(sharerId, {
      resolution,
      fps: `${Math.round(fps)}`,
      bitrate: bitrateStr,
      codec: sharerCodecs.get(sharerId) ?? '-',
      encodeLatency: encLat > 0 ? `${encLat.toFixed(1)} ms` : '-',
      decodeLatency: decLat > 0 ? `${decLat.toFixed(1)} ms` : '-',
      networkLatency: netLat > 0 ? `${netLat.toFixed(1)} ms` : '-'
    })
  }
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

// 设置编码延迟（从发送端传来，仅累加采样，平滑在定时器里做）
function setEncodeLatency(sharerId: string, latencyMs: number) {
  sharerEncodeLatencySum.set(sharerId, (sharerEncodeLatencySum.get(sharerId) ?? 0) + latencyMs)
  sharerEncodeLatencyCount.set(sharerId, (sharerEncodeLatencyCount.get(sharerId) ?? 0) + 1)
}

// 设置网络延迟（RTT / 2，仅累加采样，平滑在定时器里做）
function setNetworkLatency(sharerId: string, latencyMs: number) {
  sharerNetworkLatencySum.set(sharerId, (sharerNetworkLatencySum.get(sharerId) ?? 0) + latencyMs)
  sharerNetworkLatencyCount.set(sharerId, (sharerNetworkLatencyCount.get(sharerId) ?? 0) + 1)
}

// 设置对端 NAT 类型
function setNatType(sharerId: string, nat: NatType) {
  sharerNatTypes.set(sharerId, nat)
}

// 设置媒体链路类型
function setConnectionType(sharerId: string, type: MediaRouteType) {
  sharerConnectionTypes.set(sharerId, type)
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
  sharerNatTypes.delete(sharerId)
  sharerConnectionTypes.delete(sharerId)
  sharerFrameCounts.delete(sharerId)
  sharerCurrentFps.delete(sharerId)
  sharerTotalBytes.delete(sharerId)
  sharerCurrentBitrate.delete(sharerId)
  sharerResolutions.delete(sharerId)
  sharerCodecs.delete(sharerId)
  sharerEncodeLatency.delete(sharerId)
  sharerDecodeLatency.delete(sharerId)
  sharerNetworkLatency.delete(sharerId)
  sharerEncodeLatencySum.delete(sharerId)
  sharerEncodeLatencyCount.delete(sharerId)
  sharerDecodeLatencySum.delete(sharerId)
  sharerDecodeLatencyCount.delete(sharerId)
  sharerNetworkLatencySum.delete(sharerId)
  sharerNetworkLatencyCount.delete(sharerId)
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  lastStatsRefresh = performance.now()
  statsTimer = setInterval(refreshStats, STATS_REFRESH_MS)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
  canvasRefs.clear()
  canvasCtxs.clear()
  audioRefs.clear()
  sharerStats.clear()
  sharerNatTypes.clear()
  sharerConnectionTypes.clear()
})

defineExpose({
  drawFrame,
  setAudioStream,
  addReceivedBytes,
  setCodec,
  setEncodeLatency,
  setNetworkLatency,
  setNatType,
  setConnectionType,
  clearSharer
})
</script>
