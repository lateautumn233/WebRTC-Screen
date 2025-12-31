import { ref } from 'vue'
import { logger } from '../utils/logger'

export function useScreenCapture() {
  const stream = ref<MediaStream | null>(null)
  const isCapturing = ref(false)
  const error = ref<string | null>(null)

  async function startCapture(options?: { audio?: boolean }) {
    try {
      error.value = null

      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 60, max: 60 }
        },
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
