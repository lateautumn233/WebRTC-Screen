<template>
  <div class="surface rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-100">编码设置</h3>
      <span
        v-if="disabled"
        class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
      >
        共享中锁定
      </span>
    </div>

    <div :class="{ 'opacity-60': disabled }">
      <!-- 编码器选择 -->
      <div class="mb-4">
        <label class="block text-xs text-slate-500 mb-2">编码器</label>
        <div class="grid grid-cols-5 gap-1.5">
          <button
            v-for="codec in codecs"
            :key="codec.value"
            :disabled="disabled"
            :class="[
              'py-1.5 rounded-md text-xs transition-colors',
              modelValue.codec === codec.value
                ? `${accentBg} text-white font-semibold`
                : codec.supported
                  ? 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  : 'bg-white/5 text-slate-600 hover:bg-white/10 hover:text-slate-400'
            ]"
            @click="updateSetting('codec', codec.value)"
          >
            {{ codec.label }}
          </button>
        </div>

        <!-- 当前选中组合不受支持 -->
        <div
          v-if="unsupportedError"
          class="mt-2 flex items-start gap-2 px-2.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"
        >
          <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{{ unsupportedError }}</span>
        </div>
        <!-- 当前选中组合仅支持软件编码 -->
        <div
          v-else-if="softwareFallbackWarning"
          class="mt-2 flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs"
        >
          <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>{{ softwareFallbackWarning }}</span>
        </div>
      </div>

      <!-- 分辨率选择 -->
      <div class="mb-4">
        <label class="block text-xs text-slate-500 mb-2">分辨率</label>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="res in resolutions"
            :key="res.value"
            :disabled="disabled"
            :class="[
              'py-1.5 rounded-md text-xs transition-colors',
              modelValue.resolution === res.value
                ? `${accentBg} text-white font-semibold`
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
            ]"
            @click="updateSetting('resolution', res.value)"
          >
            {{ res.label }}
          </button>
        </div>
      </div>

      <!-- 帧率选择 -->
      <div class="mb-4">
        <label class="block text-xs text-slate-500 mb-2">帧率</label>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="fps in framerates"
            :key="fps"
            :disabled="disabled"
            :class="[
              'py-1.5 rounded-md text-xs transition-colors',
              modelValue.framerate === fps
                ? `${accentBg} text-white font-semibold`
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
            ]"
            @click="updateSetting('framerate', fps)"
          >
            {{ fps }} fps
          </button>
        </div>
        <p v-if="modelValue.framerate === 120" class="text-[10px] text-slate-600 mt-1.5">
          120 fps 仅共享浏览器标签页时可达到；共享整个屏幕或窗口会被 Chrome 引擎限制在约 50-60 fps（与分辨率、显示器刷新率无关）
        </p>
      </div>

      <!-- 码率滑块 -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs text-slate-500">
            码率 {{ modelValue.bitrate }} Mbps
          </label>
          <div class="flex gap-1">
            <button
              v-for="mode in bitrateModes"
              :key="mode.value"
              :disabled="disabled"
              :class="[
                'px-2 py-0.5 rounded text-[10px] transition-colors',
                modelValue.bitrateMode === mode.value
                  ? `${accentBg} text-white font-semibold`
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              ]"
              @click="updateSetting('bitrateMode', mode.value)"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>
        <input
          type="range"
          min="1"
          max="30"
          step="1"
          :value="modelValue.bitrate"
          :disabled="disabled"
          class="w-full cursor-pointer disabled:cursor-not-allowed"
          @input="updateSetting('bitrate', Number(($event.target as HTMLInputElement).value))"
        />
        <div class="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>1 Mbps</span>
          <span>30 Mbps</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { EncoderSettings, CodecType, ResolutionPreset, FrameratePreset, BitrateMode } from '../types'
import { RESOLUTION_MAP } from '../types'
import { useWebCodecs } from '../composables/useWebCodecs'

interface Props {
  modelValue: EncoderSettings
  disabled?: boolean
  /** 主色调：经典模式 indigo，会议模式 violet */
  accent?: 'indigo' | 'violet'
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  accent: 'indigo'
})

const emit = defineEmits<{
  'update:modelValue': [value: EncoderSettings]
  /** 当前选中的编码器/分辨率/帧率组合是否可用（硬件或软件任一支持） */
  'update:supported': [supported: boolean]
}>()

const { resolveEncoderConfig } = useWebCodecs()

const accentBg = computed(() => props.accent === 'violet' ? 'bg-violet-500' : 'bg-indigo-500')

interface CodecStatus {
  value: CodecType
  label: string
  supported: boolean
  hardwareAcceleration: HardwareAcceleration | null
}

const codecs = ref<CodecStatus[]>([
  { value: 'h264', label: 'H.264', supported: false, hardwareAcceleration: null },
  { value: 'hevc', label: 'HEVC', supported: false, hardwareAcceleration: null },
  { value: 'vp8', label: 'VP8', supported: false, hardwareAcceleration: null },
  { value: 'vp9', label: 'VP9', supported: false, hardwareAcceleration: null },
  { value: 'av1', label: 'AV1', supported: false, hardwareAcceleration: null }
])

const selectedCodec = computed(() => codecs.value.find((c) => c.value === props.modelValue.codec) ?? null)

// 当前选中组合硬件/软件均不支持：提醒用户并阻止开始共享
const unsupportedError = computed(() => {
  const c = selectedCodec.value
  return c && !c.supported
    ? `${c.label} 在当前分辨率/帧率组合下不受硬件或软件编码支持，请更换编码器或调整分辨率/帧率`
    : null
})

// 当前选中组合只能用软件编码：提醒用户但不阻止
const softwareFallbackWarning = computed(() => {
  const c = selectedCodec.value
  return c && c.supported && c.hardwareAcceleration === 'prefer-software'
    ? `${c.label} 未检测到可用硬件编码器，将使用软件编码，可能增加 CPU 占用`
    : null
})

watch(unsupportedError, (err) => {
  emit('update:supported', !err)
}, { immediate: true })

const resolutions: { value: ResolutionPreset; label: string }[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '1440p', label: '1440p' },
  { value: 'original', label: '原始' }
]

const framerates: FrameratePreset[] = [15, 30, 60, 120]

const bitrateModes: { value: BitrateMode; label: string }[] = [
  { value: 'cbr', label: 'CBR' },
  { value: 'vbr', label: 'VBR' }
]

function updateSetting<K extends keyof EncoderSettings>(key: K, value: EncoderSettings[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

// 探测使用当前选择的分辨率/帧率，而不是固定值，避免"支持"标记与实际配置不符。
// “原始”分辨率此时还没有捕获流拿不到 trackSettings，用屏幕物理分辨率估算，
// 比固定 1920x1080 更接近真实编码时的分辨率（如高分屏用户）
function estimateOriginalResolution() {
  const ratio = window.devicePixelRatio || 1
  return {
    width: Math.round(window.screen.width * ratio),
    height: Math.round(window.screen.height * ratio)
  }
}

// 每个编解码器都探测一次实际能否用于当前分辨率/帧率，以及是硬件还是软件回退，
// 供编码器网格的可选/禁用状态，以及当前选中项的提醒条使用
async function refreshCodecSupport() {
  const resolution = RESOLUTION_MAP[props.modelValue.resolution] ?? estimateOriginalResolution()
  codecs.value = await Promise.all(
    codecs.value.map(async (c) => {
      const resolved = await resolveEncoderConfig(c.value, resolution.width, resolution.height, props.modelValue.framerate)
      return {
        ...c,
        supported: resolved !== null,
        hardwareAcceleration: resolved?.hardwareAcceleration ?? null
      }
    })
  )
}

onMounted(refreshCodecSupport)

watch(() => [props.modelValue.resolution, props.modelValue.framerate], refreshCodecSupport)
</script>
