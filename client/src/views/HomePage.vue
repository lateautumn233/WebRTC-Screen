<template>
  <main class="max-w-5xl mx-auto px-6 pt-14 pb-20">
    <div class="text-center max-w-2xl mx-auto">
      <h2 class="text-4xl font-bold tracking-tight text-slate-50">选择你的共享方式</h2>
      <p class="text-slate-400 mt-3">基于 WebCodecs 硬件编码 · 毫秒级延迟 · 无需安装</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-12">
      <!-- 经典模式 -->
      <router-link
        to="/classic"
        class="group surface rounded-2xl p-7 hover:border-sky-400/50 transition-all duration-200"
      >
        <div class="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center mb-5">
          <svg class="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-100">经典模式</h3>
        <p class="text-sm text-slate-400 mt-2 leading-relaxed">
          一人共享，多人观看。主持人共享屏幕，观众实时接收画面。适合演示、教学等场景。
        </p>
        <div class="mt-5 flex items-center text-sky-300 text-sm font-medium">
          进入
          <svg class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </router-link>

      <!-- 会议模式 -->
      <router-link
        to="/conference"
        class="group surface rounded-2xl p-7 hover:border-violet-400/50 transition-all duration-200"
      >
        <div class="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-5">
          <svg class="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-100">会议模式</h3>
        <p class="text-sm text-slate-400 mt-2 leading-relaxed">
          多人互动，自由共享。所有参与者都可以共享屏幕并观看他人的共享。适合协作、讨论等场景。
        </p>
        <div class="mt-5 flex items-center text-violet-300 text-sm font-medium">
          进入
          <svg class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </router-link>
    </div>
  </main>
</template>
