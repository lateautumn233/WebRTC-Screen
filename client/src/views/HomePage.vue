<template>
  <main class="max-w-4xl mx-auto px-6 py-16">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold mb-4">选择模式</h2>
      <p class="text-gray-400">选择适合你的屏幕共享方式</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- 经典模式 -->
      <router-link
        to="/classic"
        class="group bg-gray-900 rounded-2xl p-8 border border-gray-700/50 hover:border-blue-500/50 transition-all hover:shadow-lg hover:shadow-blue-500/10"
      >
        <div class="w-14 h-14 bg-blue-600/20 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600/30 transition-colors">
          <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 class="text-xl font-semibold mb-3">经典模式</h3>
        <p class="text-gray-400 text-sm leading-relaxed">
          一人共享，多人观看。主持人共享屏幕，观众实时接收画面。适合演示、教学等场景。
        </p>
        <div class="mt-6 flex items-center text-blue-400 text-sm font-medium">
          进入
          <svg class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </router-link>

      <!-- 会议模式 -->
      <router-link
        to="/conference"
        class="group bg-gray-900 rounded-2xl p-8 border border-gray-700/50 hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10"
      >
        <div class="w-14 h-14 bg-purple-600/20 rounded-xl flex items-center justify-center mb-6 group-hover:bg-purple-600/30 transition-colors">
          <svg class="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 class="text-xl font-semibold mb-3">会议模式</h3>
        <p class="text-gray-400 text-sm leading-relaxed">
          多人互动，自由共享。所有参与者都可以共享屏幕并观看他人的共享。适合协作、讨论等场景。
        </p>
        <div class="mt-6 flex items-center text-purple-400 text-sm font-medium">
          进入
          <svg class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </router-link>
    </div>
  </main>
</template>
