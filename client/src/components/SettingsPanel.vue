<template>
  <div class="bg-gray-900 rounded-xl p-6 shadow-lg">
    <h3 class="text-lg font-semibold text-white mb-4">编码设置</h3>

    <!-- 编码器选择 -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-300 mb-2">编码器</label>
      <div class="grid grid-cols-5 gap-2">
        <button
          v-for="codec in codecs"
          :key="codec.value"
          :disabled="!codec.supported || disabled"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition-all',
            modelValue.codec === codec.value
              ? 'bg-blue-600 text-white'
              : codec.supported
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          ]"
          @click="updateSetting('codec', codec.value)"
        >
          {{ codec.label }}
        </button>
      </div>
    </div>

    <!-- 分辨率选择 -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-300 mb-2">分辨率</label>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="res in resolutions"
          :key="res.value"
          :disabled="disabled"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition-all',
            modelValue.resolution === res.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          ]"
          @click="updateSetting('resolution', res.value)"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- 帧率选择 -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-300 mb-2">帧率</label>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="fps in framerates"
          :key="fps"
          :disabled="disabled"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition-all',
            modelValue.framerate === fps
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          ]"
          @click="updateSetting('framerate', fps)"
        >
          {{ fps }} fps
        </button>
      </div>
    </div>

    <!-- 码率滑块 -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-2">
        码率: {{ modelValue.bitrate }} Mbps
      </label>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        :value="modelValue.bitrate"
        :disabled="disabled"
        class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        @input="updateSetting('bitrate', Number(($event.target as HTMLInputElement).value))"
      />
      <div class="flex justify-between text-xs text-gray-500 mt-1">
        <span>1 Mbps</span>
        <span>20 Mbps</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { EncoderSettings, CodecType, ResolutionPreset, FrameratePreset } from '../types'
import { useWebCodecs } from '../composables/useWebCodecs'

interface Props {
  modelValue: EncoderSettings
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [value: EncoderSettings]
}>()

const { getSupportedCodecs } = useWebCodecs()

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

<style scoped>
.slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: none;
}
</style>
