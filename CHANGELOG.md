# 项目修改记录

## 概述

本文档记录了对 WebRTC Screen Share Demo 项目的所有修改，便于快速了解项目当前状态。

---

## 1. 日志系统优化

### 问题
- 控制台输出大量调试日志，影响生产环境性能
- `Received frame:...` 日志每帧都输出，非常冗余

### 解决方案

**新建文件**: `client/src/utils/logger.ts`
```typescript
const isDev = import.meta.env.DEV

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args) },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args) },
  error: (...args: unknown[]) => { console.error(...args) }, // 始终保留
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args) },
}
```

**修改的文件**:
- `App.vue` - 删除帧日志，替换 console → logger
- `useWebRTC.ts` - 替换 console → logger
- `useWebCodecs.ts` - 替换 console → logger
- `useSignaling.ts` - 替换 console → logger
- `useScreenCapture.ts` - 替换 console → logger

**效果**:
- 开发环境 (`npm run dev`): 显示所有日志
- 生产环境 (`npm run build`): 只显示 error 级别

---

## 2. 设置持久化

### 问题
- 每次刷新页面，编码设置都会重置为默认值

### 解决方案

**新建文件**: `client/src/utils/storage.ts`
```typescript
const SETTINGS_KEY = 'screen-share-settings'

export function saveSettings(settings: EncoderSettings): void
export function loadSettings(): EncoderSettings
export function clearSettings(): void
```

**修改文件**: `App.vue`
- 初始化时从 localStorage 加载设置
- 使用 `watch` 监听设置变化，自动保存

**效果**:
- 编码设置（codec、分辨率、帧率、码率）自动保存
- 刷新页面后自动恢复上次设置

---

## 3. HEVC (H.265) 编码支持

### 新增功能
添加 HEVC 编码器支持，提供更好的压缩率。

### 修改的文件

**`types/index.ts`**:
```typescript
export type CodecType = 'h264' | 'hevc' | 'vp8' | 'vp9' | 'av1'

export const CODEC_MAP = {
  'h264': 'avc1.640028',
  'hevc': 'hvc1.1.6.L120.90',  // 新增
  'vp8': 'vp8',
  'vp9': 'vp09.00.10.08',
  'av1': 'av01.0.04M.08'
}
```

**`SettingsPanel.vue`**:
- 添加 HEVC 按钮选项
- 调整 grid 为 5 列布局

**`useWebCodecs.ts`**:
- 添加 HEVC 到支持检测列表

**`VideoPlayer.vue`**:
- 添加 HEVC codec 字符串识别 (`hvc1`/`hev1`)

---

## 4. 中途加入观看修复

### 问题
- 观众在屏幕共享开始后加入，无法看到视频
- 原因：新观众错过了初始关键帧和解码器配置

### 解决方案

**`useWebCodecs.ts`**:
1. 添加 `requestKeyFrame()` 方法 - 强制下一帧为关键帧
2. 添加 `cachedConfigData` - 缓存解码器配置
3. 每个关键帧都发送 config 信息（不仅仅是第一个）

**`useWebRTC.ts`**:
1. 添加 `onDataChannelOpen` 回调
2. 添加 `setOnDataChannelOpen()` 方法

**`App.vue`**:
- 当新观众的 DataChannel 打开时，调用 `requestKeyFrame()`

**流程**:
```
新观众加入 → DataChannel 打开 → 请求关键帧
→ 主持人发送 config + 关键帧 → 观众配置解码器 → 开始显示画面
```

---

## 文件结构

```
client/src/
├── utils/
│   ├── logger.ts          # 新建 - 日志工具
│   └── storage.ts         # 新建 - 设置持久化
├── composables/
│   ├── useWebCodecs.ts    # 修改 - 添加 requestKeyFrame, 缓存 config
│   ├── useWebRTC.ts       # 修改 - 添加 onDataChannelOpen 回调
│   ├── useSignaling.ts    # 修改 - logger 替换
│   └── useScreenCapture.ts # 修改 - logger 替换
├── components/
│   ├── VideoPlayer.vue    # 修改 - HEVC 识别
│   └── SettingsPanel.vue  # 修改 - HEVC 选项
├── types/
│   └── index.ts           # 修改 - 添加 HEVC 类型
└── App.vue                # 修改 - 设置持久化, 关键帧请求
```

---

## API 变更

### useWebCodecs
```typescript
// 新增方法
requestKeyFrame(): void  // 请求发送关键帧（新观众加入时调用）
```

### useWebRTC
```typescript
// 新增方法
setOnDataChannelOpen(callback: (peerId: string) => void): void
```

---

## 注意事项

1. **HEVC 支持**: 取决于浏览器和系统，Chrome 107+ 在 Windows 上需要硬件支持
2. **日志级别**: `console.error` 始终保留用于错误追踪
3. **localStorage**: 在隐私模式下可能不可用，已做容错处理
