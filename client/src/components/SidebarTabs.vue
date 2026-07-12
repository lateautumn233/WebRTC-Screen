<template>
  <div class="flex flex-col lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)]">
    <div class="flex gap-1 p-1 mb-4 rounded-xl surface flex-none">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
        :class="model === tab.key
          ? `${accentBg} text-white`
          : 'text-slate-500 hover:text-slate-300'"
        @click="model = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div v-for="tab in tabs" :key="tab.key" v-show="model === tab.key">
        <slot :name="tab.key" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Tab {
  key: string
  label: string
}

interface Props {
  tabs: Tab[]
  /** 主色调：经典模式 indigo，会议模式 violet */
  accent?: 'indigo' | 'violet'
}

const props = withDefaults(defineProps<Props>(), {
  accent: 'indigo'
})

const model = defineModel<string>({ required: true })

const accentBg = computed(() => (props.accent === 'violet' ? 'bg-violet-500' : 'bg-indigo-500'))
</script>
