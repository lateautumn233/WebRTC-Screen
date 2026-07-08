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
            :disabled="!codec.supported || disabled"
            :class="[
              'py-1.5 rounded-md text-xs transition-colors',
              modelValue.codec === codec.value
                ? `${accentBg} text-white font-semibold`
                : codec.supported
                  ? 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  : 'bg-white/5 text-slate-600 cursor-not-allowed'
            ]"
            @click="updateSetting('codec', codec.value)"
          >
            {{ codec.label }}
          </button>
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
        <div class="grid grid-cols-3 gap-1.5">
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
          max="20"
          step="1"
          :value="modelValue.bitrate"
          :disabled="disabled"
          class="w-full cursor-pointer disabled:cursor-not-allowed"
          @input="updateSetting('bitrate', Number(($event.target as HTMLInputElement).value))"
        />
        <div class="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>1 Mbps</span>
          <span>20 Mbps</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { EncoderSettings, CodecType, ResolutionPreset, FrameratePreset, BitrateMode } from '../types'
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
}>()

const { getSupportedCodecs } = useWebCodecs()

const accentBg = computed(() => props.accent === 'violet' ? 'bg-violet-500' : 'bg-indigo-500')

const codecs = ref<{ value: CodecType; label: string; supported: boolean }[]>([
  { value: 'h264', label: 'H.264', supported: false },
  { value: 'hevc', label: 'HEVC', supported: false },
  { value: 'vp8', label: 'VP8', supported: false },
  { value: 'vp9', label: 'VP9', supported: false },
  { value: 'av1', label: 'AV1', supported: false }
])

const resolutions: { value: ResolutionPreset; label: string }[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '1440p', label: '1440p' },
  { value: 'original', label: '原始' }
]

const framerates: FrameratePreset[] = [15, 30, 60]

const bitrateModes: { value: BitrateMode; label: string }[] = [
  { value: 'cbr', label: 'CBR' },
  { value: 'vbr', label: 'VBR' }
]

function updateSetting<K extends keyof EncoderSettings>(key: K, value: EncoderSettings[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

onMounted(async () => {
  const supported = await getSupportedCodecs()
  codecs.value = codecs.value.map((c) => ({
    ...c,
    supported: supported.includes(c.value)
  }))
})
</script>
