import { ref } from 'vue'
import { logger } from '../utils/logger'
import { RESOLUTION_MAP, type ResolutionPreset } from '../types'

export function useScreenCapture() {
  const stream = ref<MediaStream | null>(null)
  const isCapturing = ref(false)
  const error = ref<string | null>(null)

  async function startCapture(options?: { audio?: boolean; framerate?: number; resolution?: ResolutionPreset }) {
    try {
      error.value = null

      const fps = options?.framerate ?? 60
      const resolution = options?.resolution ? RESOLUTION_MAP[options.resolution] : null

      const videoConstraints: MediaTrackConstraints = {
        displaySurface: 'monitor',
        frameRate: { ideal: fps, max: fps }
      }

      // 约束捕获分辨率：让浏览器在原生捕获/GPU 回读阶段就降采样，
      // 避免高分屏在原始分辨率下回读带宽不足导致实际交付帧率跟不上协商的高帧率
      if (resolution) {
        videoConstraints.width = { ideal: resolution.width }
        videoConstraints.height = { ideal: resolution.height }
      }

      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: videoConstraints,
        audio: options?.audio ?? true
      }

      stream.value = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions)
      isCapturing.value = true

      // 监听用户停止共享
      const videoTrack = stream.value.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          stopCapture()
        }
      }

      return stream.value
    } catch (err) {
      const e = err as Error
      if (e.name === 'NotAllowedError') {
        error.value = '用户取消了屏幕共享'
      } else {
        error.value = `屏幕捕获失败: ${e.message}`
      }
      logger.error('Screen capture error:', err)
      return null
    }
  }

  function stopCapture() {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    isCapturing.value = false
  }

  function getVideoTrack(): MediaStreamTrack | null {
    return stream.value?.getVideoTracks()[0] ?? null
  }

  function getAudioTrack(): MediaStreamTrack | null {
    return stream.value?.getAudioTracks()[0] ?? null
  }

  return {
    stream,
    isCapturing,
    error,
    startCapture,
    stopCapture,
    getVideoTrack,
    getAudioTrack
  }
}
